// server/routes/products.js

const express = require('express');
const router  = express.Router();
const Product = require('../models/Product');
const ProductBOM = require('../models/ProductBOM');
const ProductPricing = require('../models/ProductPricing');
const Material = require('../models/Material');
const { emitCostChangeIfChanged } = require('../services/manufacturingCost');
const { protect, authorize } = require('../middleware/auth');

const MANAGE = ['super_admin', 'admin', 'production_manager'];

function toLitres(qty, unit = '') {
  const u = String(unit).toLowerCase().replace(/\./g, '').trim();
  const n = Number(qty || 0);
  if (!(n > 0)) return 0;
  if (['l', 'lt', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(u)) return n;
  if (['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'].includes(u)) return n / 1000;
  return 0;
}

function parseProductVolume(volume = '') {
  const match = String(volume).toLowerCase().match(/([0-9]+(?:\.[0-9]+)?)\s*(ml|millilitres?|milliliters?|l|lt|ltr|litres?|liters?)/i);
  return match ? toLitres(match[1], match[2]) : 0;
}

const POPULATE = [
  { path: 'currentBOM' },
  { path: 'currentPricing' },
];

router.get('/', protect, async (req, res) => {
  try { res.json(await Product.find().populate(POPULATE).sort({ name: 1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const p = await Product.findById(req.params.id).populate(POPULATE);
    if (!p) return res.status(404).json({ message: 'Product not found' });
    const boms = await ProductBOM.find({ product: p._id }).populate('entries.material','name unit').sort({ revision: -1 });
    const pricingHistory = await ProductPricing.find({ product: p._id }).populate('setBy', 'fullName').sort({ effectiveFrom: -1 });
    res.json({ product: p, bomHistory: boms, pricingHistory });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const { name, sku, category, volume, unitDescription, piecesPerCarton, vatRate, notes } = req.body;
    const p = await Product.create({
      name, sku, category, volume, unitDescription,
      piecesPerCarton: Number(piecesPerCarton) || 1,
      vatRate: vatRate != null ? Number(vatRate) : 0.16,
      notes, createdBy: req.user._id,
    });
    res.status(201).json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Product not found' });
    ['name','sku','category','volume','unitDescription','piecesPerCarton','vatRate','notes','isActive'].forEach(k => {
      if (req.body[k] !== undefined) p[k] = req.body[k];
    });
    await p.save();
    await p.populate(POPULATE);
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/products/:id/bom — save a new BOM revision
// Body: { entries:[{material, qtyPerUnit, qtyPerBatch?, kind: 'raw'|'packaging'}],
//         batchOutputQty, batchOutputUnit, laborCostPerUnit, packagingCostPerUnit, overheadCostPerUnit, notes }
router.post('/:id/bom', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const {
      entries = [],
      batchOutputQty, batchOutputUnit = 'unit',
      formulaOutputQty = 0, formulaOutputUnit = '',
      laborCostPerUnit = 0, packagingCostPerUnit = 0, overheadCostPerUnit = 0,
      notes,
    } = req.body;

    if (!entries.length) return res.status(400).json({ message: 'At least one BOM entry required' });

    const recipeLitres = toLitres(formulaOutputQty, formulaOutputUnit);
    const unitLitres = parseProductVolume(product.volume);
    const computedUnits = recipeLitres > 0 && unitLitres > 0 ? recipeLitres / unitLitres : 0;
    const outputUnits = Number(batchOutputQty) > 0 ? Number(batchOutputQty) : (computedUnits > 0 ? computedUnits : 1);

    const enriched = await Promise.all(entries.map(async (e) => {
      const m = await Material.findById(e.material);
      if (!m) throw new Error('Material not found');
      const qtyPerUnit = Number(e.qtyPerUnit) > 0
        ? Number(e.qtyPerUnit)
        : (Number(e.qtyPerBatch || 0) / outputUnits);
      return {
        material: m._id,
        qtyPerUnit: Number(qtyPerUnit.toFixed(8)) || 0,
        qtyPerBatch: Number(e.qtyPerBatch) || 0,
        unit: m.unit,
        unitPriceAtSave: Number(m.currentUnitPrice) || 0,
        kind: e.kind === 'packaging' ? 'packaging' : 'raw',
      };
    }));

    const lastRev = await ProductBOM.findOne({ product: product._id }).sort({ revision: -1 });
    const revision = lastRev ? lastRev.revision + 1 : 1;

    const prevUnitCost = Number(product.currentUnitCost || 0);

    // Mark previous revisions inactive (latest = active)
    await ProductBOM.updateMany({ product: product._id }, { $set: { isActive: false } });

    const bom = await ProductBOM.create({
      product: product._id,
      revision,
      isActive: true,
      formulaOutputQty: Number(formulaOutputQty) || 0,
      formulaOutputUnit: formulaOutputUnit || '',
      outputVolumeLitres: recipeLitres,
      batchOutputQty: outputUnits,
      batchOutputUnit: batchOutputUnit || 'unit',
      entries: enriched,
      laborCostPerUnit: Number(laborCostPerUnit) || 0,
      packagingCostPerUnit: Number(packagingCostPerUnit) || 0,
      overheadCostPerUnit: Number(overheadCostPerUnit) || 0,
      notes: notes || '',
      createdBy: req.user._id,
    });

    product.currentBOM = bom._id;
    product.currentUnitCost = bom.totalUnitCost;
    await product.save();

    await emitCostChangeIfChanged(product, prevUnitCost, bom.totalUnitCost, `BOM revision #${revision} saved`, req.user);

    res.status(201).json({ product, bom });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Restore an older BOM revision as the active one
router.post('/:id/bom/:bomId/activate', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    const bom = await ProductBOM.findOne({ _id: req.params.bomId, product: product?._id });
    if (!product || !bom) return res.status(404).json({ message: 'Not found' });
    await ProductBOM.updateMany({ product: product._id }, { $set: { isActive: false } });
    bom.isActive = true;
    await bom.save();
    const prev = Number(product.currentUnitCost || 0);
    product.currentBOM = bom._id;
    product.currentUnitCost = bom.totalUnitCost;
    await product.save();
    await emitCostChangeIfChanged(product, prev, bom.totalUnitCost, `BOM rev #${bom.revision} restored`, req.user);
    res.json({ product, bom });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/products/:id/pricing — admin only sets selling price
router.post('/:id/pricing', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const { unitPriceExclVAT, vatRate, notes } = req.body;
    const vr = vatRate != null ? Number(vatRate) : Number(product.vatRate || 0.16);
    const excl = Number(unitPriceExclVAT);
    if (!(excl > 0)) return res.status(400).json({ message: 'unitPriceExclVAT must be > 0' });

    const incl = excl * (1 + vr);
    const pcs  = Number(product.piecesPerCarton) || 1;
    const unitCost = Number(product.currentUnitCost || 0);
    const marginPct = excl > 0 ? ((excl - unitCost) / excl) * 100 : 0;

    const pricing = await ProductPricing.create({
      product: product._id,
      vatRate: vr,
      unitPriceExclVAT: excl,
      unitPriceInclVAT: Number(incl.toFixed(4)),
      cartonPriceExclVAT: Number((excl * pcs).toFixed(4)),
      cartonPriceInclVAT: Number((incl * pcs).toFixed(4)),
      piecesPerCartonSnapshot: pcs,
      unitCostAtPricing: unitCost,
      marginPct,
      notes: notes || '',
      setBy: req.user._id,
    });

    product.currentPricing = pricing._id;
    product.vatRate = vr;
    await product.save();
    res.status(201).json({ product, pricing });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
