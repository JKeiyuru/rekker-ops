// server/routes/assignments.js

const express = require('express');
const router = express.Router();
const Assignment = require('../models/Assignment');
const { protect, authorize } = require('../middleware/auth');

const POPULATE = [
  { path: 'merchandiser', select: 'fullName username role' },
  { path: 'branch', select: 'name latitude longitude allowedRadius' },
  { path: 'assignedBy', select: 'fullName' },
];

// GET /api/assignments?date=YYYY-MM-DD
// Returns all assignments for a given date (default: today)
router.get('/', protect, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const filter = { date };

    // Merchandisers only see their own assignments
    if (req.user.role === 'merchandiser') {
      filter.merchandiser = req.user._id;
    }

    const assignments = await Assignment.find(filter)
      .populate(POPULATE)
      .sort({ createdAt: 1 });

    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/assignments/my — shortcut for the logged-in merchandiser, today
router.get('/my', protect, async (req, res) => {
  try {
    const date = new Date().toISOString().split('T')[0];
    const assignments = await Assignment.find({ date, merchandiser: req.user._id })
      .populate(POPULATE)
      .sort({ createdAt: 1 });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/assignments/range?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/range', protect, authorize('super_admin', 'admin', 'team_lead'), async (req, res) => {
  try {
    const { start, end, merchandiserId } = req.query;
    const filter = {};
    if (start && end) {
      // date is stored as string so use $gte/$lte on string comparison (ISO dates sort lexicographically)
      filter.date = { $gte: start, $lte: end };
    }
    if (merchandiserId) filter.merchandiser = merchandiserId;

    const assignments = await Assignment.find(filter)
      .populate(POPULATE)
      .sort({ date: -1, createdAt: 1 });

    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/assignments — create one assignment
router.post('/', protect, authorize('super_admin', 'admin', 'team_lead'), async (req, res) => {
  try {
    const { date, merchandiserId, branchId, expectedCheckIn, notes } = req.body;

    if (!date || !merchandiserId || !branchId) {
      return res.status(400).json({ message: 'date, merchandiserId, and branchId are required' });
    }

    const assignment = await Assignment.create({
      date,
      merchandiser: merchandiserId,
      branch: branchId,
      expectedCheckIn: expectedCheckIn || null,
      notes: notes || '',
      assignedBy: req.user._id,
    });

    await assignment.populate(POPULATE);
    res.status(201).json(assignment);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'This merchandiser is already assigned to this branch on that date' });
    }
    res.status(500).json({ message: err.message });
  }
});

// POST /api/assignments/bulk — assign multiple merchandisers at once
router.post('/bulk', protect, authorize('super_admin', 'admin', 'team_lead'), async (req, res) => {
  try {
    const { date, assignments } = req.body;
    // assignments: [{ merchandiserId, branchId, expectedCheckIn? }]

    if (!date || !assignments?.length) {
      return res.status(400).json({ message: 'date and assignments array required' });
    }

    const docs = assignments.map((a) => ({
      date,
      merchandiser: a.merchandiserId,
      branch: a.branchId,
      expectedCheckIn: a.expectedCheckIn || null,
      notes: a.notes || '',
      assignedBy: req.user._id,
    }));

    // insertMany with ordered:false so it skips dupes and continues
    const result = await Assignment.insertMany(docs, { ordered: false }).catch((err) => {
      if (err.code === 11000 || err.writeErrors) return err.insertedDocs || [];
      throw err;
    });

    const created = await Assignment.find({ date, assignedBy: req.user._id })
      .populate(POPULATE)
      .sort({ createdAt: -1 });

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/assignments/:id
router.delete('/:id', protect, authorize('super_admin', 'admin', 'team_lead'), async (req, res) => {
  try {
    await Assignment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Assignment removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
