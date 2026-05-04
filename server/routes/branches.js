// server/routes/branches.js

const express = require('express');
const router = express.Router();
const Branch = require('../models/Branch');
const { protect, authorize } = require('../middleware/auth');

// GET /api/branches — active verified branches (for dropdown)
router.get('/', protect, async (req, res) => {
  try {
    const branches = await Branch.find({ isActive: true, isVerified: true }).sort({ name: 1 });
    res.json(branches);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/branches/all — all branches including unverified (admin only)
router.get('/all', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const branches = await Branch.find()
      .populate('addedBy', 'fullName')
      .sort({ isVerified: 1, createdAt: -1 });
    res.json(branches);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/branches/pending-count — for admin notification badge
router.get('/pending-count', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const count = await Branch.countDocuments({ isVerified: false, notificationRead: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/branches — admin creates a verified branch
router.post('/', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { name, latitude, longitude, allowedRadius } = req.body;
    if (!name) return res.status(400).json({ message: 'Name required' });
    const existing = await Branch.findOne({ name: new RegExp(`^${name}$`, 'i') });
    if (existing) return res.status(400).json({ message: 'Branch already exists' });
    const branch = await Branch.create({
      name,
      isVerified:    true,
      addedBy:       req.user._id,
      latitude:      latitude      ?? null,
      longitude:     longitude     ?? null,
      allowedRadius: allowedRadius ?? 100,
    });
    res.status(201).json(branch);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/branches/suggest — team lead suggests a new branch (unverified)
router.post('/suggest', protect, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Name required' });

    const existing = await Branch.findOne({ name: new RegExp(`^${name}$`, 'i') });
    if (existing) return res.json(existing);

    const branch = await Branch.create({
      name,
      isVerified:      false,
      notificationRead: false,
      addedBy:         req.user._id,
    });
    res.status(201).json(branch);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/branches/:id — update branch (admin)
// Now includes latitude, longitude, allowedRadius
router.put('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const {
      name, isActive, isVerified, notificationRead,
      latitude, longitude, allowedRadius,
    } = req.body;

    const update = {};
    if (name              !== undefined) update.name              = name;
    if (isActive          !== undefined) update.isActive          = isActive;
    if (isVerified        !== undefined) update.isVerified        = isVerified;
    if (notificationRead  !== undefined) update.notificationRead  = notificationRead;
    if (latitude          !== undefined) update.latitude          = latitude;
    if (longitude         !== undefined) update.longitude         = longitude;
    if (allowedRadius     !== undefined) update.allowedRadius     = allowedRadius;

    const branch = await Branch.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    res.json(branch);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/branches/:id
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    await Branch.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;