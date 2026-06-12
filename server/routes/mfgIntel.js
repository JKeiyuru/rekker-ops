// server/routes/mfgIntel.js
// Manufacturing intelligence: dashboard KPIs, purchase recommendations, what-if analysis.

const express = require('express');
const router  = express.Router();
const Product       = require('../models/Product');
const ProductBOM    = require('../models/ProductBOM');
const Material      = require('../models/Material');
const Cycle         = require('../models/ProductionCycle');
const PriceHistory  = require('../models/MaterialPriceHistory');
const { protect, authorize } = require('../middleware/auth');

const MFG = ['super_admin', 'admin', 'production_manager'];

router.get('/dashboard', protect, authorize(...MFG), async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [products, materials, cycles, priceChanges] = await Promise.all([
      Product.find().select('name currentUnitCost currentPricing').populate('currentPricing'),
      Material.find().select('name unit currentStock minimumStock currentUnitPrice currentSupplier').populate('currentSupplier','name'),
      Cycle.find({ startedAt: { $gte: monthStart } }).populate('product', 'name'),
      PriceHistory.find({ effectiveFrom: { $gte: monthStart } }).populate('material', 'name'),
    ]);

    const todaysCycles = cycles.filter(c => c.startedAt >= today);
    const monthCycles  = cycles;

    const lowStock = materials
      .filter(m => Number(m.minimumStock || 0) > 0 && Number(m.currentStock || 0) <= Number(m.minimumStock))
      .map(m => ({
        _id: m._id, name: m.name, unit: m.unit,
        currentStock: m.currentStock, minimumStock: m.minimumStock,
        currentUnitPrice: m.currentUnitPrice,
        supplier: m.currentSupplier?.name || null,
      }));

    // Top profitable products (margin %)
    const profitable = products
      .filter(p => p.currentPricing?.unitPriceExclVAT > 0)
      .map(p => ({
        name: p.name,
        unitCost: p.currentUnitCost,
        sellExcl: p.currentPricing.unitPriceExclVAT,
        marginPct: ((p.currentPricing.unitPriceExclVAT - p.currentUnitCost) / p.currentPricing.unitPriceExclVAT) * 100,
      }))
      .sort((a, b) => b.marginPct - a.marginPct)
      .slice(0, 6);

    res.json({
      kpis: {
        productsCount:   products.length,
        materialsCount:  materials.length,
        lowStockCount:   lowStock.length,
        runningCycles:   cycles.filter(c => c.status === 'running').length,
        unitsToday:      todaysCycles.reduce((s,c) => s + Number(c.unitsProduced||0), 0),
        costToday:       todaysCycles.reduce((s,c) => s + Number(c.totalCost||0), 0),
        unitsMonth:      monthCycles.reduce((s,c) => s + Number(c.unitsProduced||0), 0),
        costMonth:       monthCycles.reduce((s,c) => s + Number(c.totalCost||0), 0),
        priceChangesMonth: priceChanges.length,
      },
      lowStock,
      profitable,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Purchase recommendations: materials at/under minimum stock
router.get('/purchase-recommendations', protect, authorize(...MFG), async (req, res) => {
  try {
    const list = await Material.find({ isActive: { $ne: false } })
      .populate('currentSupplier', 'name phone email')
      .sort({ name: 1 });

    const recs = list
      .filter(m => Number(m.minimumStock || 0) > 0 && Number(m.currentStock || 0) <= Number(m.minimumStock))
      .map((m) => {
        const reorderQty = Number(m.reorderQty || 0) > 0
          ? Number(m.reorderQty)
          : Math.max(Number(m.minimumStock || 0) * 2 - Number(m.currentStock || 0), Number(m.minimumStock || 0));
        return {
          material: { _id: m._id, name: m.name, unit: m.unit },
          currentStock: m.currentStock,
          minimumStock: m.minimumStock,
          shortfall: Math.max(0, Number(m.minimumStock) - Number(m.currentStock)),
          recommendedQty: reorderQty,
          unitPrice: m.currentUnitPrice,
          estimatedCost: reorderQty * Number(m.currentUnitPrice || 0),
          supplier: m.currentSupplier ? { _id: m.currentSupplier._id, name: m.currentSupplier.name, phone: m.currentSupplier.phone, email: m.currentSupplier.email } : null,
        };
      });

    res.json(recs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// What-if: simulate a material price change and show downstream cost impact
// POST { materialId, newPrice }
router.post('/what-if', protect, authorize('super_admin','admin'), async (req, res) => {
  try {
    const { materialId, newPrice } = req.body;
    const m = await Material.findById(materialId);
    if (!m) return res.status(404).json({ message: 'Material not found' });
    const newP = Number(newPrice);
    if (!(newP >= 0)) return res.status(400).json({ message: 'newPrice must be >= 0' });

    const boms = await ProductBOM.find({ 'entries.material': m._id })
      .populate('product', 'name currentPricing currentUnitCost')
      .populate({ path: 'product', populate: { path: 'currentPricing' } });

    // group: latest BOM per product
    const latestByProduct = new Map();
    for (const b of boms) {
      const k = String(b.product?._id);
      if (!latestByProduct.has(k) || latestByProduct.get(k).revision < b.revision) latestByProduct.set(k, b);
    }

    const impacted = [];
    for (const b of latestByProduct.values()) {
      let newMaterials = 0, newPackaging = 0;
      for (const e of b.entries) {
        const price = String(e.material) === String(m._id) ? newP : Number(e.unitPriceAtSave || 0);
        const cost = Number(e.qtyPerUnit || 0) * price;
        if (e.kind === 'packaging') newPackaging += cost;
        else                        newMaterials += cost;
      }
      const newUnitCost = newMaterials + newPackaging
        + Number(b.laborCostPerUnit||0) + Number(b.packagingCostPerUnit||0) + Number(b.overheadCostPerUnit||0);
      const oldUnitCost = Number(b.product?.currentUnitCost || 0);
      const sell = Number(b.product?.currentPricing?.unitPriceExclVAT || 0);
      impacted.push({
        product:    { _id: b.product._id, name: b.product.name },
        oldUnitCost,
        newUnitCost,
        deltaCost:  newUnitCost - oldUnitCost,
        deltaPct:   oldUnitCost > 0 ? ((newUnitCost - oldUnitCost) / oldUnitCost) * 100 : null,
        sellExcl:   sell || null,
        oldMarginPct: sell > 0 ? ((sell - oldUnitCost)/sell)*100 : null,
        newMarginPct: sell > 0 ? ((sell - newUnitCost)/sell)*100 : null,
      });
    }

    res.json({
      material: { _id: m._id, name: m.name, currentUnitPrice: m.currentUnitPrice, simulatedPrice: newP },
      impactedCount: impacted.length,
      impacted,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
