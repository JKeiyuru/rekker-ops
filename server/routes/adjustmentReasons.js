// server/routes/adjustmentReasons.js

const express = require('express');
const router = express.Router();
const AdjustmentReason = require('../models/AdjustmentReason');
const { protect, authorize } = require('../middleware/auth');

const CAN_MANAGE = ['super_admin', 'admin', 'team_lead', 'packaging_team_lead'];

// ── Seed the defaults once on first load ─────────────────────────────────────
const DEFAULTS = [
  { label: 'Returned Goods', category: 'returned_goods', sortOrder: 10 },
  { label: 'Not Delivered',  category: 'not_delivered',  sortOrder: 20 },
  { label: 'Control List',   category: 'control_list',   sortOrder: 30 },
  { label: 'Damaged / Expired', category: 'returned_goods', sortOrder: 40 },
  { label: 'Price Correction',  category: 'other',          sortOrder: 50 },
  { label: 'Other',          category: 'other',          sortOrder: 999 },
];
async function ensureSeed() {
  const count = await AdjustmentReason.countDocuments();
  if (count === 0) await AdjustmentReason.insertMany(DEFAULTS);
}
ensureSeed().catch(() => {});

// List — everyone signed in can read
router.get('/', protect, async (req, res) => {
  try {
    await ensureSeed();
    const list = await AdjustmentReason.find({}).sort({ sortOrder: 1, label: 1 });
    res.json(list);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', protect, authorize(...CAN_MANAGE), async (req, res) => {
  try {
    const { label, category, sortOrder } = req.body;
    if (!label || !String(label).trim()) return res.status(400).json({ message: 'Label required' });
    const dupe = await AdjustmentReason.findOne({ label: String(label).trim() });
    if (dupe) return res.status(400).json({ message: 'Reason already exists' });
    const doc = await AdjustmentReason.create({
      label: String(label).trim(),
      category: category || 'other',
      sortOrder: Number(sortOrder) || 0,
      createdBy: req.user._id,
    });
    res.status(201).json(doc);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', protect, authorize(...CAN_MANAGE), async (req, res) => {
  try {
    const doc = await AdjustmentReason.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    ['label', 'category', 'sortOrder', 'active'].forEach((k) => {
      if (req.body[k] !== undefined) doc[k] = req.body[k];
    });
    await doc.save();
    res.json(doc);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', protect, authorize(...CAN_MANAGE), async (req, res) => {
  try {
    await AdjustmentReason.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
