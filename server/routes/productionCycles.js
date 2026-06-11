// server/routes/productionCycles.js

const express = require('express');
const router  = express.Router();
const Cycle = require('../models/ProductionCycle');
const Product = require('../models/Product');
const ProductBOM = require('../models/ProductBOM');
const { protect, authorize } = require('../middleware/auth');

const MANAGE = ['super_admin', 'admin', 'production_manager'];

const POPULATE = [
  { path: 'product', select: 'name sku volume piecesPerCarton' },
  { path: 'runBy',   select: 'fullName' },
];

function genCycleNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PC-${ymd}-${rnd}`;
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

router.post('/', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const { product, unitsProduced, notes, cycleNumber } = req.body;
    const p = await Product.findById(product).populate('currentBOM');
    if (!p) return res.status(404).json({ message: 'Product not found' });
    if (!p.currentBOM) return res.status(400).json({ message: 'Product has no BOM yet — save a BOM first' });

    const bom = p.currentBOM;
    const snapshot = {
      entries: bom.entries.map(e => ({
        materialName: '', // filled below
        qtyPerUnit: e.qtyPerUnit,
        unit: e.unit,
        unitPrice: e.unitPriceAtSave,
        lineCost: e.lineCost,
      })),
      laborCostPerUnit: bom.laborCostPerUnit,
      packagingCostPerUnit: bom.packagingCostPerUnit,
      overheadCostPerUnit: bom.overheadCostPerUnit,
      materialsCostPerUnit: bom.materialsCostPerUnit,
      totalUnitCost: bom.totalUnitCost,
    };
    // resolve material names
    const populated = await ProductBOM.findById(bom._id).populate('entries.material', 'name');
    populated.entries.forEach((e, i) => { snapshot.entries[i].materialName = e.material?.name || ''; });

    const cycle = await Cycle.create({
      cycleNumber: (cycleNumber || genCycleNumber()).toUpperCase(),
      product: p._id,
      bomRevision: bom.revision,
      unitsProduced: Number(unitsProduced) || 0,
      bomSnapshot: snapshot,
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
    if (req.body.unitsProduced !== undefined) c.unitsProduced = Number(req.body.unitsProduced);
    if (req.body.notes !== undefined) c.notes = req.body.notes;
    await c.save();
    await c.populate(POPULATE);
    res.json(c);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/:id/end', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const c = await Cycle.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Cycle not found' });
    c.status = 'completed';
    c.endedAt = new Date();
    if (req.body.unitsProduced !== undefined) c.unitsProduced = Number(req.body.unitsProduced);
    if (req.body.notes) c.notes = req.body.notes;
    await c.save();
    await c.populate(POPULATE);
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
