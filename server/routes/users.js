// server/routes/users.js

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const ALL_ROLES = [
  'super_admin',
  'admin',
  'team_lead',
  'viewer',
  // Packaging
  'packaging_team_lead',
  // Merchandising
  'merchandising_team_lead',
  'merchandiser',
  // Fresh Produce
  'fresh_team_lead',
  'driver',
  'turnboy',
  'farm_sourcing',
  'market_sourcing',
];

// GET /api/users
router.get('/', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/users
router.post(
  '/',
  protect,
  authorize('super_admin', 'admin'),
  [
    body('username').trim().notEmpty().withMessage('Username required'),
    body('fullName').trim().notEmpty().withMessage('Full name required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(ALL_ROLES).withMessage('Invalid role'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { username, fullName, password, role } = req.body;

      if (req.user.role === 'admin' && ['super_admin', 'admin'].includes(role)) {
        return res.status(403).json({ message: 'Admins cannot assign super_admin or admin roles' });
      }

      const existing = await User.findOne({ username: username.toLowerCase() });
      if (existing) return res.status(400).json({ message: 'Username already exists' });

      const user = await User.create({
        username,
        fullName,
        password,
        role,
        createdBy: req.user._id,
      });

      res.status(201).json(user.toJSON());
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// PUT /api/users/:id
router.put('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { fullName, role, isActive, password } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (req.user.role === 'admin' && ['super_admin', 'admin'].includes(role)) {
      return res.status(403).json({ message: 'Admins cannot assign super_admin or admin roles' });
    }

    if (role && !ALL_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    if (fullName)                   user.fullName = fullName;
    if (role)                       user.role     = role;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (password)                   user.password = password;

    await user.save();
    res.json(user.toJSON());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;