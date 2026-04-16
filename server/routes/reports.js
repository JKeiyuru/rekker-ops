// server/routes/reports.js

const express = require('express');
const router = express.Router();
const LPO = require('../models/LPO');
const { protect, authorize } = require('../middleware/auth');

// GET /api/reports/error-rate - Error rate per responsible person
router.get('/error-rate', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = {};
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

    const result = await LPO.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$responsiblePerson',
          totalLPOs: { $sum: 1 },
          errorsCount: {
            $sum: {
              $cond: [{ $not: [{ $in: ['none', '$errors'] }] }, 1, 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: 'responsiblepersons',
          localField: '_id',
          foreignField: '_id',
          as: 'person',
        },
      },
      { $unwind: '$person' },
      {
        $project: {
          name: '$person.name',
          totalLPOs: 1,
          errorsCount: 1,
          errorRate: {
            $cond: [
              { $gt: ['$totalLPOs', 0] },
              { $multiply: [{ $divide: ['$errorsCount', '$totalLPOs'] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: { errorRate: -1 } },
    ]);

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/daily-performance - Daily performance summary
router.get('/daily-performance', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = {};
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

    const result = await LPO.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          totalLPOs: { $sum: 1 },
          issued: { $sum: { $cond: [{ $ne: ['$issuedAt', null] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $ne: ['$completedAt', null] }, 1, 0] } },
          checked: { $sum: { $cond: [{ $ne: ['$checkedAt', null] }, 1, 0] } },
          withErrors: {
            $sum: {
              $cond: [{ $not: [{ $in: ['none', '$errors'] }] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/time-analysis - Average time between stages
router.get('/time-analysis', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = { issuedAt: { $ne: null }, completedAt: { $ne: null } };
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

    const result = await LPO.aggregate([
      { $match: match },
      {
        $project: {
          issuedToCompleted: {
            $divide: [{ $subtract: ['$completedAt', '$issuedAt'] }, 60000],
          },
          completedToChecked: {
            $cond: [
              { $ne: ['$checkedAt', null] },
              { $divide: [{ $subtract: ['$checkedAt', '$completedAt'] }, 60000] },
              null,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgIssuedToCompleted: { $avg: '$issuedToCompleted' },
          avgCompletedToChecked: { $avg: '$completedToChecked' },
          minIssuedToCompleted: { $min: '$issuedToCompleted' },
          maxIssuedToCompleted: { $max: '$issuedToCompleted' },
        },
      },
    ]);

    res.json(result[0] || {});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/summary - Quick summary stats
router.get('/summary', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const [todayStats, totalStats] = await Promise.all([
      LPO.aggregate([
        { $match: { date: { $gte: today, $lt: tomorrow } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $ne: ['$completedAt', null] }, 1, 0] } },
            checked: { $sum: { $cond: [{ $ne: ['$checkedAt', null] }, 1, 0] } },
            withErrors: {
              $sum: { $cond: [{ $not: [{ $in: ['none', '$errors'] }] }, 1, 0] },
            },
          },
        },
      ]),
      LPO.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            withErrors: {
              $sum: { $cond: [{ $not: [{ $in: ['none', '$errors'] }] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    res.json({
      today: todayStats[0] || { total: 0, completed: 0, checked: 0, withErrors: 0 },
      allTime: totalStats[0] || { total: 0, withErrors: 0 },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
