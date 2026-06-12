// server/routes/materials.js

const express = require('express');
const router  = express.Router();
const Material = require('../models/Material');
const PriceHistory = require('../models/MaterialPriceHistory');
const { recomputeProductsUsingMaterial } = require('../services/manufacturingCost');
const { protect, authorize } = require('../middleware/auth');

const MANAGE = ['super_admin', 'admin', 'production_manager'];

const POPULATE = [{ path: 'currentSupplier', select: 'name phone email' }];

router.get('/', protect, async (req, res) => {
  try { res.json(await Material.find().populate(POPULATE).sort({ name: 1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

// Low-stock list
router.get('/low-stock', protect, async (req, res) => {
  try {
    const list = await Material.find({ minimumStock: { $gt: 0 } }).populate(POPULATE);
    const low = list.filter(m => Number(m.currentStock || 0) <= Number(m.minimumStock || 0));
    res.json(low);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Aggregate cost-change audit across ALL materials (for the audit page)
router.get('/audit/all', protect, async (req, res) => {
  try {
    const { limit = 200 } = req.query;
    const items = await PriceHistory.find({})
      .populate('material', 'name sku unit')
      .populate('supplier', 'name')
      .populate('changedBy', 'fullName')
      .sort({ effectiveFrom: -1 })
      .limit(Math.min(Number(limit) || 200, 500));
    res.json(items);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id/history', protect, async (req, res) => {
  try {
    const history = await PriceHistory.find({ material: req.params.id })
      .populate('supplier', 'name')
      .populate('changedBy', 'fullName')
      .sort({ effectiveFrom: -1 }).limit(100);
    res.json(history);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const { name, sku, category, unit, currentSupplier, currentUnitPrice, currentStock, minimumStock, reorderQty, notes } = req.body;
    const m = await Material.create({
      name, sku, category, unit,
      currentSupplier: currentSupplier || null,
      currentUnitPrice: Number(currentUnitPrice) || 0,
      currentStock: Number(currentStock) || 0,
      minimumStock: Number(minimumStock) || 0,
      reorderQty: Number(reorderQty) || 0,
      notes, createdBy: req.user._id,
    });
    if (m.currentUnitPrice > 0) {
      await PriceHistory.create({
        material: m._id, supplier: m.currentSupplier,
        unitPrice: m.currentUnitPrice, previousPrice: null, deltaPct: 0,
        reason: 'initial', changedBy: req.user._id,
      });
    }
    await m.populate(POPULATE);
    res.status(201).json(m);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const m = await Material.findById(req.params.id);
    if (!m) return res.status(404).json({ message: 'Material not found' });

    const prevPrice = Number(m.currentUnitPrice || 0);
    const fields = ['name', 'sku', 'category', 'unit', 'notes', 'currentSupplier', 'isActive', 'minimumStock', 'reorderQty'];
    fields.forEach(k => { if (req.body[k] !== undefined) m[k] = req.body[k]; });

    let priceChanged = false;
    if (req.body.currentUnitPrice !== undefined) {
      const newPrice = Number(req.body.currentUnitPrice);
      if (newPrice !== prevPrice) {
        priceChanged = true;
        m.currentUnitPrice = newPrice;
      }
    }
    await m.save();

    if (priceChanged) {
      const deltaPct = prevPrice > 0 ? ((m.currentUnitPrice - prevPrice) / prevPrice) * 100 : 0;
      await PriceHistory.create({
        material: m._id, supplier: m.currentSupplier,
        unitPrice: m.currentUnitPrice, previousPrice: prevPrice, deltaPct,
        reason: req.body.priceReason || 'updated', changedBy: req.user._id,
      });
      await recomputeProductsUsingMaterial(m._id, req.user);
    }

    await m.populate(POPULATE);
    res.json(m);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Manual stock adjustment (audit reason required)
router.post('/:id/adjust-stock', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const { delta, reason } = req.body;
    const m = await Material.findById(req.params.id);
    if (!m) return res.status(404).json({ message: 'Not found' });
    const d = Number(delta);
    if (!Number.isFinite(d) || d === 0) return res.status(400).json({ message: 'delta must be non-zero' });
    if (!reason || !reason.trim()) return res.status(400).json({ message: 'reason required' });
    m.currentStock = Math.max(0, Number(m.currentStock || 0) + d);
    await m.save();
    await m.populate(POPULATE);
    res.json(m);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    await Material.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
