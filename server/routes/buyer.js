// server/routes/buyer.js

const express = require('express');
const router = express.Router();
const BuyerStatus = require('../models/BuyerStatus');
const { protect, authorize } = require('../middleware/auth');

// GET /api/buyer - Get buyer statuses (optionally filter by date range)
router.get('/', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    const statuses = await BuyerStatus.find(filter)
      .populate('dispatchedBy', 'fullName')
      .populate('returnedBy', 'fullName')
      .sort({ date: -1 });

    res.json(statuses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/buyer/:date - Get buyer status for a specific date (YYYY-MM-DD)
router.get('/:date', protect, async (req, res) => {
  try {
    const status = await BuyerStatus.findOne({ date: req.params.date })
      .populate('dispatchedBy', 'fullName')
      .populate('returnedBy', 'fullName');
    res.json(status || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/buyer/dispatch
router.post(
  '/dispatch',
  protect,
  authorize('super_admin', 'admin', 'team_lead'),
  async (req, res) => {
    try {
      const { date } = req.body;
      if (!date) return res.status(400).json({ message: 'Date required (YYYY-MM-DD)' });

      const existing = await BuyerStatus.findOne({ date });
      if (existing?.dispatchedAt) {
        return res.status(400).json({ message: 'Buyer already dispatched for this date' });
      }

      const status = await BuyerStatus.findOneAndUpdate(
        { date },
        { dispatchedAt: new Date(), dispatchedBy: req.user._id },
        { new: true, upsert: true }
      )
        .populate('dispatchedBy', 'fullName')
        .populate('returnedBy', 'fullName');

      res.json(status);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// POST /api/buyer/return
router.post(
  '/return',
  protect,
  authorize('super_admin', 'admin', 'team_lead'),
  async (req, res) => {
    try {
      const { date } = req.body;
      if (!date) return res.status(400).json({ message: 'Date required (YYYY-MM-DD)' });

      const existing = await BuyerStatus.findOne({ date });
      if (!existing?.dispatchedAt) {
        return res.status(400).json({ message: 'Buyer must be dispatched first' });
      }
      if (existing?.returnedAt) {
        return res.status(400).json({ message: 'Buyer already marked as returned' });
      }

      const status = await BuyerStatus.findOneAndUpdate(
        { date },
        { returnedAt: new Date(), returnedBy: req.user._id },
        { new: true }
      )
        .populate('dispatchedBy', 'fullName')
        .populate('returnedBy', 'fullName');

      res.json(status);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

module.exports = router;
