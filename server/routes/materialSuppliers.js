// server/routes/materialSuppliers.js

const express = require('express');
const router  = express.Router();
const Supplier = require('../models/MaterialSupplier');
const Material = require('../models/Material');
const PriceHistory = require('../models/MaterialPriceHistory');
const { protect, authorize } = require('../middleware/auth');

const MANAGE = ['super_admin', 'admin', 'production_manager'];

router.get('/', protect, async (req, res) => {
  try { res.json(await Supplier.find().sort({ name: 1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

// Supplier scorecard: materials supplied, price-change frequency, last seen
router.get('/:id/scorecard', protect, async (req, res) => {
  try {
    const s = await Supplier.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Supplier not found' });
    const materials = await Material.find({ currentSupplier: s._id }).select('name unit currentUnitPrice currentStock');
    const priceChanges = await PriceHistory.find({ supplier: s._id }).populate('material','name').sort({ effectiveFrom: -1 }).limit(50);
    const totalChanges = priceChanges.length;
    const increases = priceChanges.filter(p => (p.deltaPct||0) > 0).length;
    res.json({ supplier: s, materials, priceChanges, summary: { totalChanges, increases, decreases: totalChanges - increases } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const s = await Supplier.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json(s);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const s = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!s) return res.status(404).json({ message: 'Supplier not found' });
    res.json(s);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    await Supplier.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
