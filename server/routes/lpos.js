// server/routes/lpos.js

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const LPO = require('../models/LPO');
const Branch = require('../models/Branch');
const { protect, authorize } = require('../middleware/auth');

const POPULATE = [
  { path: 'responsiblePerson', select: 'name' },
  { path: 'createdBy', select: 'fullName' },
  { path: 'branch', select: 'name isVerified' },
];

// GET /api/lpos — grouped by date
router.get('/', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    const lpos = await LPO.find(filter)
      .populate(POPULATE)
      .sort({ date: -1, createdAt: -1 });

    const grouped = {};
    lpos.forEach((lpo) => {
      const dateKey = new Date(lpo.date).toISOString().split('T')[0];
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(lpo);
    });

    const sortedKeys = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
    const result = sortedKeys.map((date) => ({ date, lpos: grouped[date] }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/lpos — create single LPO
router.post('/', protect, authorize('super_admin', 'admin', 'team_lead'), async (req, res) => {
  try {
    const { lpoNumber, date, deliveryDate, responsiblePerson, issuedNow, branchId, branchNameRaw } = req.body;

    const existing = await LPO.findOne({ lpoNumber: lpoNumber.toUpperCase() });
    if (existing) return res.status(400).json({ message: 'LPO number already exists' });

    const lpoData = {
      lpoNumber,
      date: date ? new Date(date) : new Date(),
      deliveryDate: new Date(deliveryDate),
      responsiblePerson,
      createdBy: req.user._id,
      branch: branchId || null,
      branchNameRaw: branchNameRaw || '',
    };

    if (issuedNow) {
      lpoData.issuedAt = new Date();
      lpoData.status = 'issued';
    }

    const lpo = await (await LPO.create(lpoData)).populate(POPULATE);
    res.status(201).json(lpo);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/lpos/batch — create multiple LPOs at once (same person, possibly different branches)
router.post('/batch', protect, authorize('super_admin', 'admin', 'team_lead'), async (req, res) => {
  try {
    const { lpos, issuedNow } = req.body;
    // lpos: [{ lpoNumber, branchId, branchNameRaw, deliveryDate? }]
    // shared fields on batch: date, responsiblePerson
    const { date, responsiblePerson } = req.body;

    if (!lpos || !lpos.length) return res.status(400).json({ message: 'No LPOs provided' });

    // Check for duplicate LPO numbers in this batch
    const numbers = lpos.map((l) => l.lpoNumber.toUpperCase());
    const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    if (dupes.length) return res.status(400).json({ message: `Duplicate LPO numbers in batch: ${dupes.join(', ')}` });

    // Check against DB
    const existingInDB = await LPO.find({ lpoNumber: { $in: numbers } });
    if (existingInDB.length) {
      return res.status(400).json({ message: `Already exists: ${existingInDB.map((l) => l.lpoNumber).join(', ')}` });
    }

    const batchId = uuidv4();
    const now = new Date();
    const lpoDate = date ? new Date(date) : now;

    const docs = lpos.map((l) => ({
      lpoNumber: l.lpoNumber.toUpperCase(),
      date: lpoDate,
      deliveryDate: l.deliveryDate ? new Date(l.deliveryDate) : lpoDate,
      responsiblePerson,
      branch: l.branchId || null,
      branchNameRaw: l.branchNameRaw || '',
      batchId,
      createdBy: req.user._id,
      ...(issuedNow ? { issuedAt: now, status: 'issued' } : {}),
    }));

    const created = await LPO.insertMany(docs);
    const populated = await LPO.find({ batchId }).populate(POPULATE).sort({ createdAt: 1 });

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/lpos/:id/status
router.patch('/:id/status', protect, authorize('super_admin', 'admin', 'team_lead'), async (req, res) => {
  try {
    const { action } = req.body;
    const lpo = await LPO.findById(req.params.id);
    if (!lpo) return res.status(404).json({ message: 'LPO not found' });

    const now = new Date();
    if (action === 'issue') {
      lpo.issuedAt = now;
      lpo.status = 'issued';
    } else if (action === 'complete') {
      if (!lpo.issuedAt) return res.status(400).json({ message: 'LPO must be issued first' });
      lpo.completedAt = now;
      lpo.status = 'completed';
    } else if (action === 'check') {
      if (!lpo.completedAt) return res.status(400).json({ message: 'LPO must be completed first' });
      lpo.checkedAt = now;
      lpo.status = 'checked';
    } else {
      return res.status(400).json({ message: 'Invalid action' });
    }

    await lpo.save();
    await lpo.populate(POPULATE);
    res.json(lpo);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/lpos/batch/:batchId/status — apply status action to all LPOs in a batch
router.patch('/batch/:batchId/status', protect, authorize('super_admin', 'admin', 'team_lead'), async (req, res) => {
  try {
    const { action } = req.body;
    const lpos = await LPO.find({ batchId: req.params.batchId });
    if (!lpos.length) return res.status(404).json({ message: 'Batch not found' });

    const now = new Date();
    for (const lpo of lpos) {
      if (action === 'issue' && !lpo.issuedAt) {
        lpo.issuedAt = now; lpo.status = 'issued';
      } else if (action === 'complete' && lpo.issuedAt && !lpo.completedAt) {
        lpo.completedAt = now; lpo.status = 'completed';
      } else if (action === 'check' && lpo.completedAt && !lpo.checkedAt) {
        lpo.checkedAt = now; lpo.status = 'checked';
      }
      await lpo.save();
    }

    const populated = await LPO.find({ batchId: req.params.batchId }).populate(POPULATE);
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/lpos/:id/errors
router.patch('/:id/errors', protect, authorize('super_admin', 'admin', 'team_lead'), async (req, res) => {
  try {
    const { errors, notes } = req.body;
    const lpo = await LPO.findById(req.params.id);
    if (!lpo) return res.status(404).json({ message: 'LPO not found' });
    lpo.errors = errors || ['none'];
    lpo.notes = notes || '';
    await lpo.save();
    await lpo.populate(POPULATE);
    res.json(lpo);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/lpos/:id — full update (admin)
router.put('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const lpo = await LPO.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate(POPULATE);
    if (!lpo) return res.status(404).json({ message: 'LPO not found' });
    res.json(lpo);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/lpos/:id
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    await LPO.findByIdAndDelete(req.params.id);
    res.json({ message: 'LPO deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
