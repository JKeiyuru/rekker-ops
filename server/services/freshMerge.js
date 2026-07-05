// server/services/freshMerge.js
// Field-level merge engine — the heart of the "upload half-filled files any
// time" workflow. Produces a preview diff without touching the DB, or commits
// it as a FreshUpload with full change history for revert.

const FreshProduct   = require('../models/FreshProduct');
const FreshOperation = require('../models/FreshOperation');
const FreshLine      = require('../models/FreshLine');
const FreshUpload    = require('../models/FreshUpload');
const FreshReasonCode = require('../models/FreshReasonCode');
const { toDateKey } = require('./freshWorkbook');

const normalize = FreshProduct.normalize;

// ---- Product resolution -----------------------------------------------------

async function resolveProducts(productNames) {
  const uniq = Array.from(new Set(productNames.map((n) => normalize(n)))).filter(Boolean);
  const found = await FreshProduct.find({
    $or: [{ nameKey: { $in: uniq } }, { aliasKeys: { $in: uniq } }],
  }).lean();
  const byKey = new Map();
  for (const p of found) {
    byKey.set(p.nameKey, p);
    (p.aliasKeys || []).forEach((k) => byKey.set(k, p));
  }
  return byKey; // key -> product
}

// Auto-create products for unrecognized names (queued for admin review later).
async function ensureProducts(productNames, userId) {
  const byKey = await resolveProducts(productNames);
  const missing = [];
  for (const n of productNames) {
    const k = normalize(n);
    if (!k) continue;
    if (!byKey.has(k)) missing.push(n);
  }
  const unique = Array.from(new Map(missing.map((n) => [normalize(n), n])).values());
  const created = [];
  for (const name of unique) {
    try {
      const p = await FreshProduct.create({ name, createdBy: userId });
      created.push(p.toObject ? p.toObject() : p);
    } catch (e) {
      const existing = await FreshProduct.findOne({ nameKey: normalize(name) }).lean();
      if (existing) created.push(existing);
    }
  }
  for (const p of created) byKey.set(normalize(p.name), p);
  return { byKey, created };
}

// ---- Zone field lists -------------------------------------------------------

const ZONE_FIELDS = {
  ordered:   ['qty', 'estBP', 'spPrice', 'totalValue'],
  bought:    ['qty', 'marketBP', 'totalValue'],
  delivered: ['qty', 'totalValue', 'comments'],
};

function hasZoneData(zoneObj) {
  if (!zoneObj) return false;
  return Object.keys(zoneObj).some((k) => zoneObj[k] != null && zoneObj[k] !== '');
}

// ---- Metric computation -----------------------------------------------------

function computeLineMetrics(line) {
  const orderedV   = Number(line.ordered?.totalValue   || 0);
  const boughtQ    = Number(line.bought?.qty           || 0);
  const boughtBP   = Number(line.bought?.marketBP      || 0);
  const boughtV    = Number(line.bought?.totalValue    || (boughtQ * boughtBP) || 0);
  const delQ       = Number(line.delivered?.qty        || 0);
  const spPrice    = Number(line.ordered?.spPrice      || 0);
  const delTotal   = Number(line.delivered?.totalValue || (delQ * spPrice) || 0);
  const buyingCostDel = boughtQ > 0 && delQ > 0 ? (boughtV * (delQ / boughtQ)) : boughtV;

  const rejectedQ = boughtQ > 0 && delQ >= 0 ? Math.max(0, boughtQ - delQ) : 0;
  const rejectedV = spPrice > 0 ? rejectedQ * spPrice : Math.max(0, boughtV - delTotal);

  const margin = delTotal - buyingCostDel;
  const marginPct = delTotal > 0 ? margin / delTotal : 0;

  line.rejectedValue = round2(rejectedV);
  line.margin        = round2(margin);
  line.marginPct     = round2(marginPct);

  const hasBought    = hasZoneData(line.bought);
  const hasDelivered = hasZoneData(line.delivered);
  if (hasDelivered && hasBought) line.status = 'reconciled';
  else if (hasBought)            line.status = 'pending_delivery';
  else                           line.status = 'pending_bought';

  return { orderedV, boughtV, deliveredV: delTotal, rejectedV, buyingCost: buyingCostDel, margin };
}

function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }

// ---- Reason-needed rules ----------------------------------------------------

function evaluateReasonNeeded(line) {
  const boughtQ = Number(line.bought?.qty     || 0);
  const orderedQ = Number(line.ordered?.qty   || 0);
  const delQ    = Number(line.delivered?.qty  || 0);
  const hasDelivered = hasZoneData(line.delivered);
  const hasBought    = hasZoneData(line.bought);
  const hasOrdered   = hasZoneData(line.ordered);
  const comment      = String(line.delivered?.comments || '').trim();

  let needed = false;
  // 1. Rejection: delivered qty less than bought qty
  if (hasBought && hasDelivered && boughtQ > 0 && delQ < boughtQ) needed = true;
  // 2. Unsourced: ordered but not bought
  if (hasOrdered && orderedQ > 0 && hasBought === false) needed = false; // pending, not "needs reason" yet
  if (hasOrdered && orderedQ > 0 && hasBought && boughtQ === 0) needed = true;
  // 3. Loss: margin negative
  if (hasDelivered && Number(line.margin || 0) < 0) needed = true;

  // 4. Comments in Excel already explain it — don't re-prompt
  if (needed && comment) {
    if (!line.reasonCode) {
      line.reasonCode = 'FROM_COMMENT';
      line.reasonNote = comment;
    }
    needed = false;
  }
  if (line.reasonCode) needed = false;

  line.reasonNeeded = needed;
}

// ---- Status derivation ------------------------------------------------------

function deriveOperationStatus(zonesTouched, lines) {
  // If manually closed elsewhere, caller preserves that; here we only advance.
  const anyDelivered = lines.some((l) => hasZoneData(l.delivered));
  const anyBought    = lines.some((l) => hasZoneData(l.bought));
  const allRec       = lines.length > 0 && lines.every((l) => l.status === 'reconciled');
  if (allRec) return 'completed';
  if (anyDelivered) return 'delivery_in_progress';
  if (anyBought)    return 'sourcing_in_progress';
  return 'order_received';
}

// ---- Preview & commit -------------------------------------------------------

/**
 * Build a diff plan against existing DB state without committing.
 * Returns { channel, date, sheetName, zonesTouched, warnings, summary, plan }
 * where plan[] = { branch, productName, key, changes:[{zone,field,before,after}], warnings }
 */
async function buildPreview({ parsed, userId, allowAutoCreateProducts = true }) {
  const { channel, date, sheetName, rows, warnings: parseWarnings } = parsed;
  const dateKey = toDateKey(date);
  const warnings = [...parseWarnings];

  const names = rows.map((r) => r.productName);
  let byKey;
  let createdProducts = [];
  if (allowAutoCreateProducts) {
    const r = await ensureProducts(names, userId);
    byKey = r.byKey; createdProducts = r.created;
  } else {
    byKey = await resolveProducts(names);
  }
  for (const p of createdProducts) {
    warnings.push({ code: 'new_product', message: `New product auto-added: "${p.name}"`, productName: p.name });
  }

  // Existing lines for the (dateKey, channel)
  const existing = await FreshLine.find({ dateKey, channel }).lean();
  const existingByKey = new Map(existing.map((l) => [`${l.branch}::${String(l.product)}`, l]));

  const zonesTouched = new Set();
  const plan = [];
  let linesToCreate = 0;
  let linesToUpdate = 0;
  let fieldsChanged = 0;

  for (const row of rows) {
    const product = byKey.get(normalize(row.productName));
    if (!product) {
      warnings.push({ code: 'unknown_product', message: `Unrecognized product: "${row.productName}"`, productName: row.productName });
      continue;
    }
    if (!row.branch) {
      warnings.push({ code: 'unknown_branch', message: `Row missing branch for "${row.productName}"`, productName: row.productName });
      continue;
    }
    const key = `${String(row.branch).toUpperCase()}::${String(product._id)}`;
    const current = existingByKey.get(key);
    const isNew = !current;
    if (isNew) linesToCreate++;

    const changes = [];
    for (const zone of ['ordered', 'bought', 'delivered']) {
      const incoming = row[zone] || {};
      if (!hasZoneData(incoming)) continue;
      zonesTouched.add(zone);
      for (const field of ZONE_FIELDS[zone]) {
        const inV = incoming[field];
        if (inV == null || inV === '') continue;
        const beforeV = current?.[zone]?.[field] ?? null;
        if (String(beforeV ?? '') === String(inV)) continue;
        changes.push({ zone, field, before: beforeV, after: inV });
      }
    }
    if (!isNew && changes.length) linesToUpdate++;
    fieldsChanged += changes.length;

    // per-row validation warnings
    const rowWarn = [];
    if (row.bought.qty != null && row.bought.qty > 0 && (row.bought.marketBP == null && !current?.bought?.marketBP)) {
      rowWarn.push({ code: 'missing_bp', message: `Missing buying price on "${row.productName}"`, productName: row.productName, branch: row.branch });
    }
    if (row.ordered.qty != null && row.ordered.qty > 0 && (row.ordered.spPrice == null && !current?.ordered?.spPrice)) {
      rowWarn.push({ code: 'missing_sp', message: `Missing selling price on "${row.productName}"`, productName: row.productName, branch: row.branch });
    }
    if ((row.ordered.qty != null && row.ordered.qty < 0) || (row.bought.qty != null && row.bought.qty < 0) || (row.delivered.qty != null && row.delivered.qty < 0)) {
      rowWarn.push({ code: 'negative_qty', message: `Negative quantity on "${row.productName}"`, productName: row.productName, branch: row.branch });
    }
    warnings.push(...rowWarn);

    if (changes.length || isNew) {
      plan.push({
        branch: String(row.branch).toUpperCase(),
        productName: row.productName,
        productId: product._id,
        isNew,
        changes,
        incoming: row,
      });
    }
  }

  const summary = {
    productsFound:   rows.length,
    productsUpdated: linesToUpdate,
    productsCreated: linesToCreate,
    fieldsChanged,
    warningCount:    warnings.length,
    zonesTouched:    Array.from(zonesTouched),
  };

  return {
    channel, date, dateKey, sheetName,
    warnings, summary, plan,
    createdProductNames: createdProducts.map((p) => p.name),
  };
}

// Label for upload event based on which zones were touched.
function labelFor(zonesTouched) {
  const z = new Set(zonesTouched);
  if (z.has('delivered')) return 'Delivery updated';
  if (z.has('bought'))    return 'Sourcing updated';
  if (z.has('ordered'))   return 'Order captured';
  return 'Update';
}

/**
 * Commit a previewed plan to the DB with full change history.
 */
async function commitPlan({ preview, filename, user }) {
  const { channel, date, dateKey, sheetName, plan, warnings, summary } = preview;

  // Upsert operation
  let op = await FreshOperation.findOne({ dateKey, channel });
  if (!op) {
    op = await FreshOperation.create({
      date, dateKey, channel, status: 'order_received', createdBy: user?._id,
    });
  }

  const upload = await FreshUpload.create({
    operation: op._id, date, dateKey, channel, sheetName, filename,
    uploadedBy: user?._id, uploadedByName: user?.fullName || '',
    zonesTouched: summary.zonesTouched,
    warnings, changes: [], label: labelFor(summary.zonesTouched),
  });

  const changes = [];
  let linesCreated = 0, linesUpdated = 0;

  for (const item of plan) {
    const filter = { dateKey, channel, branch: item.branch, product: item.productId };
    let line = await FreshLine.findOne(filter);
    if (!line) {
      line = new FreshLine({
        operation: op._id, date, dateKey, channel,
        branch: item.branch, product: item.productId, productName: item.productName,
      });
      linesCreated++;
    } else {
      linesUpdated++;
    }
    for (const c of item.changes) {
      const beforeV = line[c.zone]?.[c.field] ?? null;
      if (!line[c.zone]) line[c.zone] = {};
      line[c.zone][c.field] = c.after;
      line[c.zone].updatedAt = new Date();
      line[c.zone].source = upload._id;
      changes.push({
        line: line._id, branch: item.branch, productName: item.productName,
        zone: c.zone, field: c.field, before: beforeV, after: c.after,
      });
    }
    computeLineMetrics(line);
    evaluateReasonNeeded(line);
    await line.save();
    for (const c of changes.filter((ch) => !ch.line || String(ch.line) === '')) c.line = line._id;
  }

  upload.changes = changes;
  upload.linesCreated  = linesCreated;
  upload.linesUpdated  = linesUpdated;
  upload.fieldsChanged = changes.length;
  await upload.save();

  await recomputeOperationTotals(op._id);
  return { upload, operation: await FreshOperation.findById(op._id).lean() };
}

// ---- Recompute totals & status ---------------------------------------------

async function recomputeOperationTotals(operationId) {
  const op = await FreshOperation.findById(operationId);
  if (!op) return null;
  const lines = await FreshLine.find({ operation: op._id });
  const totals = {
    orderedValue: 0, boughtValue: 0, deliveredValue: 0, rejectedValue: 0,
    buyingCost: 0, margin: 0, procurementSuccess: 0, deliverySuccess: 0,
    linesTotal: lines.length, linesReconciled: 0, linesNeedingReason: 0,
  };
  for (const l of lines) {
    const m = computeLineMetrics(l);
    evaluateReasonNeeded(l);
    await l.save();
    totals.orderedValue   += m.orderedV;
    totals.boughtValue    += m.boughtV;
    totals.deliveredValue += m.deliveredV;
    totals.rejectedValue  += m.rejectedV;
    totals.buyingCost     += m.buyingCost;
    totals.margin         += m.margin;
    if (l.status === 'reconciled') totals.linesReconciled++;
    if (l.reasonNeeded)            totals.linesNeedingReason++;
  }
  totals.procurementSuccess = totals.orderedValue > 0 ? totals.boughtValue / totals.orderedValue : 0;
  totals.deliverySuccess    = totals.boughtValue  > 0 ? totals.deliveredValue / totals.boughtValue : 0;
  for (const k of Object.keys(totals)) if (typeof totals[k] === 'number') totals[k] = round2(totals[k]);

  op.totals = totals;
  if (!op.manuallyClosed) {
    op.status = deriveOperationStatus(null, lines);
  }
  await op.save();
  return op;
}

// ---- Revert -----------------------------------------------------------------

async function revertUpload(uploadId, user) {
  const upload = await FreshUpload.findById(uploadId);
  if (!upload) throw new Error('Upload not found');
  if (upload.reverted) throw new Error('Upload already reverted');

  // Find later uploads on the same operation that touched the same fields.
  const laterUploads = await FreshUpload.find({
    operation: upload.operation,
    createdAt: { $gt: upload.createdAt },
    reverted: false,
  }).lean();

  const conflicts = [];
  const laterTouches = new Set();
  for (const u of laterUploads) {
    for (const c of (u.changes || [])) laterTouches.add(`${c.line}::${c.zone}::${c.field}`);
  }

  // Group changes by line and revert oldest-first (i.e. reverse the newer changes on top).
  const byLine = new Map();
  for (const c of upload.changes) {
    const key = String(c.line);
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(c);
  }

  for (const [lineId, changes] of byLine.entries()) {
    const line = await FreshLine.findById(lineId);
    if (!line) continue;
    for (const c of changes) {
      const touchKey = `${c.line}::${c.zone}::${c.field}`;
      if (laterTouches.has(touchKey)) {
        conflicts.push({ line: lineId, ...c, reason: 'later_upload_touched_field' });
        continue; // don't overwrite newer data
      }
      if (!line[c.zone]) line[c.zone] = {};
      line[c.zone][c.field] = c.before;
    }
    computeLineMetrics(line);
    evaluateReasonNeeded(line);
    await line.save();
  }

  upload.reverted = true;
  upload.revertedAt = new Date();
  upload.revertedBy = user?._id;
  await upload.save();

  await recomputeOperationTotals(upload.operation);
  return { upload, conflicts };
}

module.exports = {
  buildPreview, commitPlan, recomputeOperationTotals, revertUpload,
  computeLineMetrics, evaluateReasonNeeded, ZONE_FIELDS,
};
