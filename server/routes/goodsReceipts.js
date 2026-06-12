// server/routes/goodsReceipts.js

const express = require('express');
const router  = express.Router();
const GoodsReceipt = require('../models/GoodsReceipt');
const Material = require('../models/Material');
const PriceHistory = require('../models/MaterialPriceHistory');
const { recomputeProductsUsingMaterial } = require('../services/manufacturingCost');
const { protect, authorize } = require('../middleware/auth');

const MANAGE = ['super_admin', 'admin', 'production_manager'];

const POPULATE = [
  { path: 'supplier', select: 'name phone email' },
  { path: 'items.material', select: 'name sku unit' },
  { path: 'receivedBy', select: 'fullName' },
];

function genReceiptNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GR-${ymd}-${rnd}`;
}

router.get('/', protect, async (req, res) => {
  try {
    const list = await GoodsReceipt.find().populate(POPULATE).sort({ receivedAt: -1 }).limit(500);
    res.json(list);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const r = await GoodsReceipt.findById(req.params.id).populate(POPULATE);
    if (!r) return res.status(404).json({ message: 'Not found' });
    res.json(r);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const { supplier, invoiceRef, receivedAt, items = [], notes, receiptNumber } = req.body;
    if (!supplier) return res.status(400).json({ message: 'Supplier required' });
    if (!items.length) return res.status(400).json({ message: 'At least one item required' });

    // Validate + enrich items
    const enriched = [];
    const touchedMaterials = []; // { material, oldPrice, newPrice }
    for (const i of items) {
      const m = await Material.findById(i.material);
      if (!m) return res.status(400).json({ message: 'Material not found' });
      const qty = Number(i.qty);
      const unitPrice = Number(i.unitPrice);
      if (!(qty > 0)) return res.status(400).json({ message: `Qty must be > 0 for ${m.name}` });
      if (!(unitPrice >= 0)) return res.status(400).json({ message: `Price must be >= 0 for ${m.name}` });

      enriched.push({
        material: m._id,
        qty,
        unit: m.unit,
        unitPrice,
        notes: i.notes || '',
      });
      touchedMaterials.push({ material: m, oldPrice: Number(m.currentUnitPrice || 0), newPrice: unitPrice, qty });
    }

    const gr = await GoodsReceipt.create({
      receiptNumber: (receiptNumber || genReceiptNumber()).toUpperCase(),
      supplier, invoiceRef: invoiceRef || '',
      receivedAt: receivedAt || new Date(),
      items: enriched, notes: notes || '',
      receivedBy: req.user._id,
    });

    // Side effects: stock bump + price history + recompute
    for (const t of touchedMaterials) {
      t.material.currentStock = Number(t.material.currentStock || 0) + t.qty;
      let priceChanged = false;
      if (Math.abs(t.newPrice - t.oldPrice) > 1e-6) {
        priceChanged = true;
        t.material.currentUnitPrice = t.newPrice;
        t.material.currentSupplier = supplier;
      }
      await t.material.save();

      if (priceChanged) {
        const deltaPct = t.oldPrice > 0 ? ((t.newPrice - t.oldPrice) / t.oldPrice) * 100 : 0;
        await PriceHistory.create({
          material: t.material._id, supplier,
          unitPrice: t.newPrice, previousPrice: t.oldPrice, deltaPct,
          reason: `Goods receipt ${gr.receiptNumber}`,
          changedBy: req.user._id,
        });
        await recomputeProductsUsingMaterial(t.material._id, req.user);
      } else {
        // still record a "receipt" price-history entry (helps the audit page)
        await PriceHistory.create({
          material: t.material._id, supplier,
          unitPrice: t.newPrice, previousPrice: t.oldPrice, deltaPct: 0,
          reason: `Goods receipt ${gr.receiptNumber} (no price change)`,
          changedBy: req.user._id,
        });
      }
    }

    await gr.populate(POPULATE);
    res.status(201).json(gr);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const gr = await GoodsReceipt.findById(req.params.id);
    if (!gr) return res.status(404).json({ message: 'Not found' });
    // Reverse stock
    for (const item of gr.items) {
      await Material.findByIdAndUpdate(item.material, { $inc: { currentStock: -Number(item.qty || 0) } });
    }
    await gr.deleteOne();
    res.json({ message: 'Deleted and stock reversed' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
