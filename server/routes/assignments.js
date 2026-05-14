// server/routes/assignments.js
// Assignments are now OPTIONAL scheduling hints — not access gates.
// A merchandiser can check in to any active branch even without an assignment.
// Assignments exist purely for:
//   • Pre-scheduling planned visits
//   • Tracking "scheduled vs unscheduled" in reports
//   • Showing suggested branches in the check-in UI

const express    = require('express');
const router     = express.Router();
const Assignment = require('../models/Assignment');
const { protect, authorize } = require('../middleware/auth');

const MERCH_MANAGE = ['super_admin', 'admin', 'team_lead', 'merchandising_team_lead'];

const POPULATE = [
  { path: 'merchandiser', select: 'fullName username role' },
  { path: 'branch',       select: 'name isActive'         },
  { path: 'createdBy',    select: 'fullName'               },
];

// ── GET /api/assignments ──────────────────────────────────────────────────────
router.get('/', protect, authorize(...MERCH_MANAGE), async (req, res) => {
  try {
    const { date, merchandiserId, branchId } = req.query;
    const filter = {};
    if (date)           filter.date        = date;
    if (merchandiserId) filter.merchandiser = merchandiserId;
    if (branchId)       filter.branch      = branchId;

    const assignments = await Assignment.find(filter).populate(POPULATE).sort({ date: -1 });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/assignments/my — today's assignments for the current user ─────────
// Returns [] if no assignments exist (merchandiser can still check in freely).
router.get('/my', protect, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const assignments = await Assignment.find({
      merchandiser: req.user._id,
      date,
    }).populate(POPULATE);
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/assignments/:id ──────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id).populate(POPULATE);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

    // Merchandisers can only see their own
    if (
      req.user.role === 'merchandiser' &&
      assignment.merchandiser._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(assignment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/assignments — create a scheduled visit (optional) ───────────────
router.post('/', protect, authorize(...MERCH_MANAGE), async (req, res) => {
  try {
    const { merchandiserId, branchId, date, expectedCheckIn, notes } = req.body;

    if (!merchandiserId || !branchId || !date) {
      return res.status(400).json({ message: 'merchandiserId, branchId and date are required' });
    }

    // Prevent duplicate assignments for the same person/branch/day
    const existing = await Assignment.findOne({
      merchandiser: merchandiserId,
      branch:       branchId,
      date,
    });
    if (existing) {
      return res.status(400).json({
        message: 'Assignment already exists for this merchandiser, branch, and date',
      });
    }

    const assignment = await Assignment.create({
      merchandiser:    merchandiserId,
      branch:          branchId,
      date,
      expectedCheckIn: expectedCheckIn || null,
      notes:           notes           || '',
      createdBy:       req.user._id,
    });

    await assignment.populate(POPULATE);
    res.status(201).json(assignment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/assignments/bulk — create multiple assignments at once ───────────
router.post('/bulk', protect, authorize(...MERCH_MANAGE), async (req, res) => {
  try {
    const { assignments } = req.body; // [{ merchandiserId, branchId, date, expectedCheckIn }]
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ message: 'assignments array required' });
    }

    const results = { created: 0, skipped: 0, errors: [] };

    for (const a of assignments) {
      try {
        const existing = await Assignment.findOne({
          merchandiser: a.merchandiserId,
          branch:       a.branchId,
          date:         a.date,
        });
        if (existing) { results.skipped++; continue; }

        await Assignment.create({
          merchandiser:    a.merchandiserId,
          branch:          a.branchId,
          date:            a.date,
          expectedCheckIn: a.expectedCheckIn || null,
          notes:           a.notes           || '',
          createdBy:       req.user._id,
        });
        results.created++;
      } catch (e) {
        results.errors.push({ entry: a, error: e.message });
      }
    }

    res.status(201).json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /api/assignments/:id ────────────────────────────────────────────────
router.patch('/:id', protect, authorize(...MERCH_MANAGE), async (req, res) => {
  try {
    const { expectedCheckIn, notes } = req.body;

    const assignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      { $set: { expectedCheckIn, notes } },
      { new: true, runValidators: true }
    ).populate(POPULATE);

    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    res.json(assignment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/assignments/:id ───────────────────────────────────────────────
router.delete('/:id', protect, authorize(...MERCH_MANAGE), async (req, res) => {
  try {
    const assignment = await Assignment.findByIdAndDelete(req.params.id);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    res.json({ message: 'Assignment deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/assignments/bulk-delete ───────────────────────────────────────
router.delete('/bulk-delete', protect, authorize(...MERCH_MANAGE), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array required' });
    }
    const result = await Assignment.deleteMany({ _id: { $in: ids } });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;