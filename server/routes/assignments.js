// server/routes/assignments.js

const express = require('express');
const router = express.Router();
const Assignment = require('../models/Assignment');
const { protect, authorize } = require('../middleware/auth');

const MERCH_MANAGE = ['super_admin', 'admin', 'team_lead', 'merchandising_team_lead'];

const POPULATE = [
  { path: 'merchandiser', select: 'fullName username role' },
  { path: 'branch', select: 'name latitude longitude allowedRadius' },
  { path: 'assignedBy', select: 'fullName' },
];

// GET /api/assignments?date=YYYY-MM-DD
router.get('/', protect, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const filter = { date };
    if (req.user.role === 'merchandiser') filter.merchandiser = req.user._id;

    const assignments = await Assignment.find(filter).populate(POPULATE).sort({ createdAt: 1 });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/assignments/my
router.get('/my', protect, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const assignments = await Assignment.find({ date, merchandiser: req.user._id })
      .populate(POPULATE)
      .sort({ createdAt: 1 });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/assignments/range?start=YYYY-MM-DD&end=YYYY-MM-DD&merchandiserId=
router.get('/range', protect, async (req, res) => {
  try {
    const { start, end, merchandiserId } = req.query;
    const filter = {};
    if (start && end) filter.date = { $gte: start, $lte: end };
    if (merchandiserId) filter.merchandiser = merchandiserId;
    if (req.user.role === 'merchandiser') filter.merchandiser = req.user._id;

    const assignments = await Assignment.find(filter).populate(POPULATE).sort({ date: 1, createdAt: 1 });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/assignments — create one
router.post('/', protect, async (req, res) => {
  try {
    if (!MERCH_MANAGE.includes(req.user.role))
      return res.status(403).json({ message: 'Access denied' });

    const { date, merchandiserId, branchId, expectedCheckIn, notes } = req.body;
    if (!date || !merchandiserId || !branchId)
      return res.status(400).json({ message: 'date, merchandiserId, branchId required' });

    const assignment = await Assignment.create({
      date, merchandiser: merchandiserId, branch: branchId,
      expectedCheckIn: expectedCheckIn || null, notes: notes || '',
      assignedBy: req.user._id,
    });

    await assignment.populate(POPULATE);
    res.status(201).json(assignment);
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({ message: 'Already assigned to this branch on that date' });
    res.status(500).json({ message: err.message });
  }
});

// POST /api/assignments/bulk — create many (supports date range)
router.post('/bulk', protect, async (req, res) => {
  try {
    if (!MERCH_MANAGE.includes(req.user.role))
      return res.status(403).json({ message: 'Access denied' });

    const { date, dateRange, assignments } = req.body;
    // dateRange: { start, end } — assign the same set across a range of dates
    if (!assignments?.length) return res.status(400).json({ message: 'assignments array required' });

    // Build list of dates to assign
    let dates = [];
    if (dateRange?.start && dateRange?.end) {
      const start = new Date(dateRange.start + 'T00:00:00');
      const end   = new Date(dateRange.end   + 'T00:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
      }
    } else if (date) {
      dates = [date];
    } else {
      return res.status(400).json({ message: 'date or dateRange required' });
    }

    const docs = [];
    for (const d of dates) {
      for (const a of assignments) {
        docs.push({
          date: d,
          merchandiser: a.merchandiserId,
          branch: a.branchId,
          expectedCheckIn: a.expectedCheckIn || null,
          notes: a.notes || '',
          assignedBy: req.user._id,
        });
      }
    }

    await Assignment.insertMany(docs, { ordered: false }).catch(() => {});

    // Return all assignments for the date range
    const firstDate = dates[0];
    const lastDate  = dates[dates.length - 1];
    const created = await Assignment.find({
      date: { $gte: firstDate, $lte: lastDate },
      assignedBy: req.user._id,
    }).populate(POPULATE).sort({ date: 1, createdAt: 1 });

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/assignments/:id — edit
router.put('/:id', protect, async (req, res) => {
  try {
    if (!MERCH_MANAGE.includes(req.user.role))
      return res.status(403).json({ message: 'Access denied' });

    const { merchandiserId, branchId, expectedCheckIn, notes, date } = req.body;
    const update = {};
    if (merchandiserId)     update.merchandiser    = merchandiserId;
    if (branchId)           update.branch          = branchId;
    if (expectedCheckIn !== undefined) update.expectedCheckIn = expectedCheckIn || null;
    if (notes !== undefined) update.notes = notes;
    if (date)               update.date = date;

    const assignment = await Assignment.findByIdAndUpdate(req.params.id, update, { new: true }).populate(POPULATE);
    if (!assignment) return res.status(404).json({ message: 'Not found' });
    res.json(assignment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/assignments/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    if (!MERCH_MANAGE.includes(req.user.role))
      return res.status(403).json({ message: 'Access denied' });
    await Assignment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/assignments/bulk — delete all assignments for a date (or range)
router.delete('/bulk', protect, async (req, res) => {
  try {
    if (!MERCH_MANAGE.includes(req.user.role))
      return res.status(403).json({ message: 'Access denied' });

    const { date, dateRange, merchandiserId } = req.body;
    const filter = {};
    if (dateRange?.start && dateRange?.end) filter.date = { $gte: dateRange.start, $lte: dateRange.end };
    else if (date) filter.date = date;
    else return res.status(400).json({ message: 'date or dateRange required' });
    if (merchandiserId) filter.merchandiser = merchandiserId;

    const result = await Assignment.deleteMany(filter);
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
