// server/routes/returnReasons.js

const express = require('express');
const router = express.Router();
const ReturnReason = require('../models/ReturnReason');
const { protect, authorize } = require('../middleware/auth');

const MANAGE = ['super_admin', 'admin', 'team_lead', 'fresh_team_lead'];

router.get('/', protect, async (req, res) => {
  try {
    const list = await ReturnReason.find({ isActive: true }).sort({ label: 1 });
    res.json(list);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const { label } = req.body;
    if (!label || !label.trim()) return res.status(400).json({ message: 'Label required' });
    const existing = await ReturnReason.findOne({ label: label.trim() });
    if (existing) return res.json(existing);
    const r = await ReturnReason.create({ label: label.trim(), createdBy: req.user._id });
    res.status(201).json(r);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', protect, authorize(...MANAGE), async (req, res) => {
  try {
    await ReturnReason.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Deactivated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
