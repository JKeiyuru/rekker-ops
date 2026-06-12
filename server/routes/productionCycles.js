// server/routes/productionCycles.js

const express = require('express');
const router  = express.Router();
const Cycle = require('../models/ProductionCycle');
const Product = require('../models/Product');
const ProductBOM = require('../models/ProductBOM');
const Material = require('../models/Material');
const { protect, authorize } = require('../middleware/auth');

const MANAGE = ['super_admin', 'admin', 'production_manager'];

const POPULATE = [
  { path: 'product', select: 'name sku volume piecesPerCarton' },
  { path: 'runBy',   select: 'fullName' },
  { path: 'bom',     select: 'revision' },
];

function genCycleNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PC-${ymd}-${rnd}`;
}
function genBatchNumber() {
  const d = new Date();
  return `B${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
}

router.get('/', protect, async (req, res) => {
  try {
    const { product, status, startDate, endDate } = req.query;
    const filter = {};
    if (product) filter.product = product;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.startedAt = {};
      if (startDate) filter.startedAt.$gte = new Date(startDate);
      if (endDate)   { const e = new Date(endDate); e.setHours(23,59,59,999); filter.startedAt.$lte = e; }
    }
    res.json(await Cycle.find(filter).populate(POPULATE).sort({ startedAt: -1 }).limit(500));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const c = await Cycle.findById(req.params.id).populate(POPULATE)
      .populate('bomSnapshot.entries.material', 'name sku unit currentStock');
    if (!c) return res.status(404).json({ message: 'Not found' });
    res.json(c);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Preview required materials WITHOUT starting the cycle
router.get('/preview/:productId/:units', protect, async (req, res) => {
  try {
    const p = await Product.findById(req.params.productId).populate('currentBOM');
    if (!p) return res.status(404).json({ message: 'Product not found' });
    if (!p.currentBOM) return res.status(400).json({ message: 'No active BOM' });
    const units = Math.max(0, Number(req.params.units) || 0);
    const populated = await ProductBOM.findById(p.currentBOM._id).populate('entries.material', 'name unit currentStock');
    const lines = populated.entries.map((e) => {
      const consumed = Number(e.qtyPerUnit || 0) * units;
      const stock = Number(e.material?.currentStock || 0);
      return {
        materialId: e.material?._id,
        materialName: e.material?.name || '',
        unit: e.material?.unit || e.unit,
        qtyPerUnit: e.qtyPerUnit,
        consumed,
        stock,
        shortfall: Math.max(0, consumed - stock),
        kind: e.kind || 'raw',
      };
    });
    const ok = lines.every((l) => l.shortfall <= 0);
    res.json({ lines, ok });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Start a cycle — snapshots BOM and deducts stock (allowStockNegative=true bypasses guard)
router.post('/', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const { product, expectedUnits, notes, cycleNumber, batchNumber, allowStockNegative } = req.body;
    const p = await Product.findById(product).populate('currentBOM');
    if (!p) return res.status(404).json({ message: 'Product not found' });
    if (!p.currentBOM) return res.status(400).json({ message: 'Product has no BOM yet — save a BOM first' });

    const bom = p.currentBOM;
    const units = Math.max(0, Number(expectedUnits) || 0);

    const populated = await ProductBOM.findById(bom._id).populate('entries.material');

    // Check stock
    const shortfalls = [];
    for (const e of populated.entries) {
      const consumed = Number(e.qtyPerUnit || 0) * units;
      const stock = Number(e.material?.currentStock || 0);
      if (consumed > stock + 1e-6) shortfalls.push({ name: e.material?.name, need: consumed, have: stock, unit: e.material?.unit });
    }
    if (shortfalls.length && !allowStockNegative) {
      return res.status(400).json({ message: 'Insufficient stock', shortfalls });
    }

    // Build snapshot + deduct stock
    const snapEntries = [];
    for (const e of populated.entries) {
      const consumed = Number(e.qtyPerUnit || 0) * units;
      snapEntries.push({
        material: e.material?._id,
        materialName: e.material?.name || '',
        qtyPerUnit: e.qtyPerUnit,
        qtyConsumed: consumed,
        qtyActual: consumed,
        unit: e.material?.unit || e.unit,
        unitPrice: e.unitPriceAtSave,
        lineCost: e.lineCost,
        kind: e.kind || 'raw',
      });
      if (consumed > 0 && e.material?._id) {
        await Material.findByIdAndUpdate(e.material._id, { $inc: { currentStock: -consumed } });
      }
    }

    const cycle = await Cycle.create({
      cycleNumber: (cycleNumber || genCycleNumber()).toUpperCase(),
      batchNumber: (batchNumber || genBatchNumber()).toUpperCase(),
      product: p._id,
      bom: bom._id,
      bomRevision: bom.revision,
      expectedUnits: units,
      unitsProduced: 0,
      bomSnapshot: {
        entries: snapEntries,
        laborCostPerUnit: bom.laborCostPerUnit,
        packagingCostPerUnit: bom.packagingCostPerUnit,
        overheadCostPerUnit: bom.overheadCostPerUnit,
        materialsCostPerUnit: bom.materialsCostPerUnit,
        packagingFromBOMPerUnit: bom.packagingFromBOMPerUnit,
        totalUnitCost: bom.totalUnitCost,
      },
      status: 'running',
      runBy: req.user._id,
      createdBy: req.user._id,
      notes: notes || '',
    });
    await cycle.populate(POPULATE);
    res.status(201).json(cycle);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const c = await Cycle.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Cycle not found' });
    ['unitsProduced','notes','batchNumber'].forEach(k => { if (req.body[k] !== undefined) c[k] = req.body[k]; });
    if (Array.isArray(req.body.overheads)) c.overheads = req.body.overheads;
    if (Array.isArray(req.body.qcChecks))  c.qcChecks  = req.body.qcChecks.map((q) => ({ ...q, checkedBy: req.user._id }));
    if (Array.isArray(req.body.snapshotActuals)) {
      // [{ index, qtyActual }]
      req.body.snapshotActuals.forEach((s) => {
        if (c.bomSnapshot?.entries?.[s.index]) c.bomSnapshot.entries[s.index].qtyActual = Number(s.qtyActual);
      });
      c.markModified('bomSnapshot.entries');
    }
    await c.save();
    await c.populate(POPULATE);
    res.json(c);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Complete a cycle
router.post('/:id/end', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const c = await Cycle.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Cycle not found' });
    if (c.status !== 'running') return res.status(400).json({ message: 'Cycle is not running' });
    if (req.body.unitsProduced !== undefined) c.unitsProduced = Number(req.body.unitsProduced);
    if (Array.isArray(req.body.overheads)) c.overheads = req.body.overheads;
    if (Array.isArray(req.body.qcChecks))  c.qcChecks  = req.body.qcChecks.map((q) => ({ ...q, checkedBy: req.user._id }));
    if (Array.isArray(req.body.snapshotActuals)) {
      req.body.snapshotActuals.forEach((s) => {
        if (c.bomSnapshot?.entries?.[s.index]) c.bomSnapshot.entries[s.index].qtyActual = Number(s.qtyActual);
      });
      c.markModified('bomSnapshot.entries');
    }
    if (req.body.notes !== undefined) c.notes = req.body.notes;
    c.status = 'completed';
    c.endedAt = new Date();
    await c.save();
    await c.populate(POPULATE);
    res.json(c);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Cancel + return stock
router.post('/:id/cancel', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const c = await Cycle.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Cycle not found' });
    if (c.status !== 'running') return res.status(400).json({ message: 'Only running cycles can be cancelled' });
    for (const e of c.bomSnapshot?.entries || []) {
      if (e.material && e.qtyConsumed) await Material.findByIdAndUpdate(e.material, { $inc: { currentStock: Number(e.qtyConsumed) } });
    }
    c.status = 'cancelled';
    c.endedAt = new Date();
    if (req.body.notes) c.notes = req.body.notes;
    await c.save();
    res.json(c);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    await Cycle.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
