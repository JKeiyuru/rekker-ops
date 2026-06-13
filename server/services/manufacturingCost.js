// server/services/manufacturingCost.js
// Centralized cost recompute + cost-change notifications.

const Product       = require('../models/Product');
const ProductBOM    = require('../models/ProductBOM');
const Material      = require('../models/Material');
const User          = require('../models/User');
const Notification  = require('../models/Notification');

async function emitCostChangeIfChanged(product, oldCost, newCost, reason, changedByUser) {
  const oldC = Number(oldCost || 0);
  const newC = Number(newCost || 0);
  if (Math.abs(newC - oldC) < 1e-6) return;
  const deltaPct = oldC > 0 ? ((newC - oldC) / oldC) * 100 : null;
  const sign = newC > oldC ? '↑' : '↓';

  const recipients = await User.find({ role: { $in: ['super_admin', 'admin'] }, isActive: true }).select('_id');
  const docs = recipients.map(u => ({
    user: u._id,
    type: 'cost_change',
    title: `${product.name}: cost ${sign} to ${newC.toFixed(2)}`,
    body: `Unit cost changed from ${oldC.toFixed(2)} to ${newC.toFixed(2)}${deltaPct != null ? ` (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)` : ''}. ${reason || ''}`.trim(),
    link: `/manufacturing/products/${product._id}`,
    severity: 'warning',
    payload: { productId: product._id, oldCost: oldC, newCost: newC, deltaPct, reason, changedBy: changedByUser?._id },
  }));
  if (docs.length) await Notification.insertMany(docs);
}

// Snapshot the latest material prices into a fresh BOM revision (no UI change needed).
// Called after a material price changes; bumps every product using that material.
async function recomputeProductsUsingMaterial(materialId, actor) {
  const boms = await ProductBOM.find({ 'entries.material': materialId });
  // Group by product → take latest BOM per product
  const latestByProduct = new Map();
  for (const b of boms) {
    const key = String(b.product);
    const prev = latestByProduct.get(key);
    if (!prev || b.revision > prev.revision) latestByProduct.set(key, b);
  }
  for (const bom of latestByProduct.values()) {
    const product = await Product.findById(bom.product);
    if (!product || !product.currentBOM || String(product.currentBOM) !== String(bom._id)) continue;

    const prevCost = Number(product.currentUnitCost || 0);

    // Refresh price snapshots on the *current* BOM entries
    let raw = 0, pack = 0;
    for (const e of bom.entries) {
      const m = await Material.findById(e.material);
      if (!m) continue;
      e.unitPriceAtSave = Number(m.currentUnitPrice || 0);
      e.unit = m.unit;
      e.lineCost = Number(e.qtyPerUnit || 0) * e.unitPriceAtSave;
      if (e.kind === 'packaging') pack += e.lineCost;
      else raw += e.lineCost;
    }
    bom.materialsCostPerUnit = raw;
    bom.packagingFromBOMPerUnit = pack;
    bom.totalUnitCost = raw + pack
      + Number(bom.laborCostPerUnit || 0)
      + Number(bom.packagingCostPerUnit || 0)
      + Number(bom.overheadCostPerUnit || 0);
    await bom.save();

    product.currentUnitCost = bom.totalUnitCost;
    await product.save();

    await emitCostChangeIfChanged(product, prevCost, bom.totalUnitCost, 'Material price update', actor);
  }
}

async function recomputeProductCost(productId, actor) {
  const product = await Product.findById(productId);
  if (!product || !product.currentBOM) return;
  const bom = await ProductBOM.findById(product.currentBOM);
  if (!bom) return;
  const prev = Number(product.currentUnitCost || 0);
  await bom.save(); // triggers pre-save recompute
  product.currentUnitCost = bom.totalUnitCost;
  await product.save();
  await emitCostChangeIfChanged(product, prev, bom.totalUnitCost, 'Recompute requested', actor);
}

module.exports = { emitCostChangeIfChanged, recomputeProductsUsingMaterial, recomputeProductCost };
