// server/routes/fresh.js
// All endpoints for the Fresh module: upload preview/commit/revert,
// operations, lines, reason codes, products, alerts, insights, reports.

const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');

const FreshProduct    = require('../models/FreshProduct');
const FreshOperation  = require('../models/FreshOperation');
const FreshLine       = require('../models/FreshLine');
const FreshUpload     = require('../models/FreshUpload');
const FreshReasonCode = require('../models/FreshReasonCode');
const FreshAlert      = require('../models/FreshAlert');

const { parseWorkbookBase64, parseSheet, listOperationalSheets, toDateKey } = require('../services/freshWorkbook');
const { buildPreview, commitPlan, revertUpload, recomputeOperationTotals, computeLineMetrics, evaluateReasonNeeded } =
  require('../services/freshMerge');
const { evaluateForOperation } = require('../services/freshAlerts');

const FRESH_MGMT = ['super_admin', 'admin', 'team_lead', 'fresh_team_lead'];
const FRESH_READ = [...FRESH_MGMT];
const ADMIN_ONLY = ['super_admin', 'admin'];

router.use(protect);

// ─── Seed reason codes on demand ────────────────────────────────────────────
async function ensureDefaultReasonCodes() {
  const count = await FreshReasonCode.estimatedDocumentCount();
  if (count > 0) return;
  const defaults = [
    ['CUSTOMER_REJECT', 'Customer rejection', 10],
    ['POOR_QUALITY',    'Poor quality',        20],
    ['SUPPLIER_SHORT',  'Supplier shortage',   30],
    ['TRANSPORT_DAMAGE','Transport damage',    40],
    ['INCORRECT_ORDER', 'Incorrect order',     50],
    ['PRICING_ADJ',     'Pricing adjustment',  60],
    ['OTHER',           'Other',              999],
  ];
  await FreshReasonCode.insertMany(defaults.map(([code, label, order]) => ({ code, label, order })));
}
ensureDefaultReasonCodes().catch(() => {});

// ─── Upload: preview ────────────────────────────────────────────────────────
router.post('/upload/preview', authorize(...FRESH_MGMT), async (req, res) => {
  try {
    const { base64, filename = '', sheet } = req.body || {};
    if (!base64) return res.status(400).json({ message: 'base64 file content required' });

    const workbook = parseWorkbookBase64(base64);
    const sheetList = listOperationalSheets(workbook);
    if (!sheetList.length) return res.status(400).json({ message: 'No parseable Fresh sheets found (need names like "30TH JUNE STORES")' });

    const targets = sheet ? sheetList.filter((s) => s.name === sheet) : sheetList;
    const previews = [];
    for (const s of targets) {
      const parsed = parseSheet(workbook, s.name);
      const preview = await buildPreview({ parsed, userId: req.user._id, allowAutoCreateProducts: false });
      previews.push({ sheetName: s.name, ...preview });
    }
    res.json({ filename, sheets: sheetList.map((s) => s.name), previews });
  } catch (err) {
    console.error('[fresh/upload/preview]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Upload: commit ─────────────────────────────────────────────────────────
router.post('/upload/commit', authorize(...FRESH_MGMT), async (req, res) => {
  try {
    const { base64, filename = '', sheets: only } = req.body || {};
    if (!base64) return res.status(400).json({ message: 'base64 file content required' });

    const workbook = parseWorkbookBase64(base64);
    const sheetList = listOperationalSheets(workbook);
    const targets = only?.length ? sheetList.filter((s) => only.includes(s.name)) : sheetList;

    const results = [];
    for (const s of targets) {
      const parsed = parseSheet(workbook, s.name);
      const preview = await buildPreview({ parsed, userId: req.user._id, allowAutoCreateProducts: true });
      const { upload, operation } = await commitPlan({ preview, filename, user: req.user });
      const alerts = await evaluateForOperation(operation);
      results.push({ sheetName: s.name, uploadId: upload._id, operationId: operation._id, alertsFired: alerts.length,
        summary: preview.summary });
    }
    res.json({ committed: results.length, results });
  } catch (err) {
    console.error('[fresh/upload/commit]', err);
    res.status(500).json({ message: err.message });
  }
});

// ─── Revert an upload ───────────────────────────────────────────────────────
router.post('/uploads/:id/revert', authorize(...FRESH_MGMT), async (req, res) => {
  try {
    const { upload, conflicts } = await revertUpload(req.params.id, req.user);
    res.json({ upload, conflicts, warning: conflicts.length ? `${conflicts.length} field(s) were also modified by later uploads and were NOT reverted.` : null });
  } catch (err) {
    console.error('[fresh/uploads/revert]', err);
    res.status(400).json({ message: err.message });
  }
});

// ─── Operations ─────────────────────────────────────────────────────────────
router.get('/operations', authorize(...FRESH_READ), async (req, res) => {
  try {
    const { from, to, channel, limit = 60 } = req.query;
    const q = {};
    if (channel) q.channel = channel;
    if (from || to) {
      q.date = {};
      if (from) q.date.$gte = new Date(from);
      if (to)   q.date.$lte = new Date(to);
    }
    const list = await FreshOperation.find(q).sort({ date: -1, channel: 1 }).limit(Number(limit));
    res.json(list);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/operations/:id', authorize(...FRESH_READ), async (req, res) => {
  try {
    const op = await FreshOperation.findById(req.params.id);
    if (!op) return res.status(404).json({ message: 'Not found' });
    const uploads = await FreshUpload.find({ operation: op._id })
      .populate('uploadedBy', 'fullName')
      .sort({ createdAt: 1 });
    const lines = await FreshLine.find({ operation: op._id }).sort({ branch: 1, productName: 1 });
    res.json({ operation: op, uploads, lines });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/operations/:id/close', authorize(...FRESH_MGMT), async (req, res) => {
  try {
    const op = await FreshOperation.findById(req.params.id);
    if (!op) return res.status(404).json({ message: 'Not found' });
    op.manuallyClosed = true; op.status = 'completed'; op.closedBy = req.user._id; op.closedAt = new Date();
    await op.save();
    res.json(op);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/operations/:id/reopen', authorize(...FRESH_MGMT), async (req, res) => {
  try {
    const op = await FreshOperation.findById(req.params.id);
    if (!op) return res.status(404).json({ message: 'Not found' });
    op.manuallyClosed = false; op.closedBy = null; op.closedAt = null;
    await op.save();
    const updated = await recomputeOperationTotals(op._id);
    res.json(updated);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── Lines ──────────────────────────────────────────────────────────────────
router.get('/lines', authorize(...FRESH_READ), async (req, res) => {
  try {
    const { operation, status, reasonNeeded, from, to, channel, branch, product } = req.query;
    const q = {};
    if (operation) q.operation = operation;
    if (status) q.status = status;
    if (reasonNeeded === 'true')  q.reasonNeeded = true;
    if (reasonNeeded === 'false') q.reasonNeeded = false;
    if (channel) q.channel = channel;
    if (branch)  q.branch  = branch.toUpperCase();
    if (product) q.product = product;
    if (from || to) {
      q.date = {};
      if (from) q.date.$gte = new Date(from);
      if (to)   q.date.$lte = new Date(to);
    }
    const lines = await FreshLine.find(q).sort({ date: -1, branch: 1, productName: 1 }).limit(2000);
    res.json(lines);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/lines/:id/reason', authorize(...FRESH_MGMT), async (req, res) => {
  try {
    const { reasonCode, reasonNote } = req.body;
    const line = await FreshLine.findById(req.params.id);
    if (!line) return res.status(404).json({ message: 'Not found' });
    line.reasonCode = reasonCode || '';
    line.reasonNote = reasonNote || '';
    line.reasonSetBy = req.user._id;
    line.reasonSetAt = new Date();
    if (reasonCode) line.reasonNeeded = false;
    await line.save();
    await recomputeOperationTotals(line.operation);
    res.json(line);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── Reason codes ───────────────────────────────────────────────────────────
router.get('/reason-codes', authorize(...FRESH_READ), async (req, res) => {
  const list = await FreshReasonCode.find().sort({ order: 1, label: 1 });
  res.json(list);
});
router.post('/reason-codes', authorize(...FRESH_MGMT), async (req, res) => {
  try {
    const { code, label, order = 100, active = true } = req.body;
    if (!code || !label) return res.status(400).json({ message: 'code and label required' });
    const doc = await FreshReasonCode.create({ code: code.toUpperCase(), label, order, active, createdBy: req.user._id });
    res.status(201).json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});
router.patch('/reason-codes/:id', authorize(...FRESH_MGMT), async (req, res) => {
  try {
    const doc = await FreshReasonCode.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});
router.delete('/reason-codes/:id', authorize(...FRESH_MGMT), async (req, res) => {
  try {
    await FreshReasonCode.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ─── Products (master + alias management) ───────────────────────────────────
router.get('/products', authorize(...FRESH_READ), async (req, res) => {
  const { q } = req.query;
  const filter = q ? { name: { $regex: q, $options: 'i' } } : {};
  const list = await FreshProduct.find(filter).sort({ name: 1 });
  res.json(list);
});
router.post('/products', authorize(...FRESH_MGMT), async (req, res) => {
  try {
    const doc = await FreshProduct.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});
router.patch('/products/:id', authorize(...FRESH_MGMT), async (req, res) => {
  try {
    const doc = await FreshProduct.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    Object.assign(doc, req.body);
    await doc.save();
    res.json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});
router.post('/products/:id/alias', authorize(...FRESH_MGMT), async (req, res) => {
  try {
    const { alias } = req.body;
    if (!alias) return res.status(400).json({ message: 'alias required' });
    const doc = await FreshProduct.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    if (!doc.aliases.includes(alias)) doc.aliases.push(alias);
    await doc.save();
    res.json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});
router.post('/products/:id/merge', authorize(...ADMIN_ONLY), async (req, res) => {
  // Merge from -> target. Reassigns lines to target, moves name as alias.
  try {
    const { targetId } = req.body;
    if (!targetId) return res.status(400).json({ message: 'targetId required' });
    const from = await FreshProduct.findById(req.params.id);
    const target = await FreshProduct.findById(targetId);
    if (!from || !target) return res.status(404).json({ message: 'Not found' });
    await FreshLine.updateMany({ product: from._id }, { $set: { product: target._id, productName: target.name } });
    if (!target.aliases.includes(from.name)) target.aliases.push(from.name);
    await target.save();
    await FreshProduct.deleteOne({ _id: from._id });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ─── Alerts ─────────────────────────────────────────────────────────────────
router.get('/alerts', authorize(...FRESH_READ), async (req, res) => {
  const { resolved } = req.query;
  const q = {};
  if (resolved === 'true')  q.resolved = true;
  if (resolved === 'false') q.resolved = false;
  const list = await FreshAlert.find(q).sort({ createdAt: -1 }).limit(200);
  res.json(list);
});
router.patch('/alerts/:id/resolve', authorize(...FRESH_MGMT), async (req, res) => {
  const doc = await FreshAlert.findByIdAndUpdate(req.params.id,
    { resolved: true, resolvedAt: new Date(), resolvedBy: req.user._id }, { new: true });
  res.json(doc);
});

// ─── Insights: summary per day/channel + trends ─────────────────────────────
router.get('/insights/summary', authorize(...FRESH_READ), async (req, res) => {
  try {
    const { from, to } = req.query;
    const q = {};
    if (from || to) {
      q.date = {};
      if (from) q.date.$gte = new Date(from);
      if (to)   q.date.$lte = new Date(to);
    }
    const ops = await FreshOperation.find(q).sort({ date: -1 });
    const byChannel = { DC: [], STORES: [] };
    for (const op of ops) (byChannel[op.channel] ||= []).push(op);

    function agg(arr) {
      const t = { orderedValue: 0, boughtValue: 0, deliveredValue: 0, rejectedValue: 0, margin: 0, buyingCost: 0,
        procurementSuccess: 0, deliverySuccess: 0, days: arr.length, linesNeedingReason: 0 };
      for (const op of arr) {
        for (const k of ['orderedValue','boughtValue','deliveredValue','rejectedValue','margin','buyingCost','linesNeedingReason']) {
          t[k] += Number(op.totals?.[k] || 0);
        }
      }
      t.procurementSuccess = t.orderedValue > 0 ? t.boughtValue / t.orderedValue : 0;
      t.deliverySuccess    = t.boughtValue  > 0 ? t.deliveredValue / t.boughtValue : 0;
      return t;
    }
    res.json({
      DC: agg(byChannel.DC || []),
      STORES: agg(byChannel.STORES || []),
      operations: ops,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/insights/trends', authorize(...FRESH_READ), async (req, res) => {
  try {
    const { channel, from, to } = req.query;
    const q = {};
    if (channel) q.channel = channel;
    if (from || to) {
      q.date = {};
      if (from) q.date.$gte = new Date(from);
      if (to)   q.date.$lte = new Date(to);
    }
    const ops = await FreshOperation.find(q).sort({ date: 1 });
    res.json(ops.map((o) => ({
      date: o.dateKey, channel: o.channel,
      orderedValue: o.totals?.orderedValue || 0,
      boughtValue:  o.totals?.boughtValue  || 0,
      deliveredValue: o.totals?.deliveredValue || 0,
      margin:       o.totals?.margin || 0,
      rejectedValue: o.totals?.rejectedValue || 0,
      procurementSuccess: o.totals?.procurementSuccess || 0,
      deliverySuccess: o.totals?.deliverySuccess || 0,
    })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/insights/live', authorize(...FRESH_READ), async (req, res) => {
  try {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const key = today.toISOString().slice(0, 10);
    const ops = await FreshOperation.find({ dateKey: key });
    const byChannel = { DC: null, STORES: null };
    for (const op of ops) byChannel[op.channel] = op;
    res.json(byChannel);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── Reports: aggregate by product / branch / exceptions ────────────────────
router.get('/reports/products', authorize(...FRESH_READ), async (req, res) => {
  try {
    const { from, to, channel } = req.query;
    const match = {};
    if (channel) match.channel = channel;
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to)   match.date.$lte = new Date(to);
    }
    const rows = await FreshLine.aggregate([
      { $match: match },
      { $group: {
        _id: { product: '$product', productName: '$productName', channel: '$channel' },
        orderedQty:   { $sum: { $ifNull: ['$ordered.qty', 0] } },
        boughtQty:    { $sum: { $ifNull: ['$bought.qty', 0] } },
        deliveredQty: { $sum: { $ifNull: ['$delivered.qty', 0] } },
        boughtValue:  { $sum: { $ifNull: ['$bought.totalValue', 0] } },
        deliveredValue:{ $sum: { $ifNull: ['$delivered.totalValue', 0] } },
        rejectedValue:{ $sum: { $ifNull: ['$rejectedValue', 0] } },
        margin:       { $sum: { $ifNull: ['$margin', 0] } },
      }},
      { $sort: { margin: -1 } },
    ]);
    res.json(rows.map((r) => ({
      productName: r._id.productName, channel: r._id.channel,
      orderedQty: r.orderedQty, boughtQty: r.boughtQty, deliveredQty: r.deliveredQty,
      boughtValue: r.boughtValue, deliveredValue: r.deliveredValue,
      rejectedValue: r.rejectedValue, margin: r.margin,
      rejectionRate: r.boughtValue > 0 ? r.rejectedValue / r.boughtValue : 0,
    })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/reports/branches', authorize(...FRESH_READ), async (req, res) => {
  try {
    const { from, to, channel } = req.query;
    const match = {};
    if (channel) match.channel = channel;
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to)   match.date.$lte = new Date(to);
    }
    const rows = await FreshLine.aggregate([
      { $match: match },
      { $group: {
        _id: { branch: '$branch', channel: '$channel' },
        orderedValue: { $sum: { $ifNull: ['$ordered.totalValue', 0] } },
        boughtValue:  { $sum: { $ifNull: ['$bought.totalValue', 0] } },
        deliveredValue: { $sum: { $ifNull: ['$delivered.totalValue', 0] } },
        rejectedValue:{ $sum: { $ifNull: ['$rejectedValue', 0] } },
        margin:       { $sum: { $ifNull: ['$margin', 0] } },
      }},
      { $sort: { deliveredValue: -1 } },
    ]);
    res.json(rows.map((r) => ({
      branch: r._id.branch, channel: r._id.channel,
      orderedValue: r.orderedValue, boughtValue: r.boughtValue,
      deliveredValue: r.deliveredValue, rejectedValue: r.rejectedValue,
      margin: r.margin,
    })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/reports/exceptions', authorize(...FRESH_READ), async (req, res) => {
  try {
    const { from, to, channel } = req.query;
    const match = {};
    if (channel) match.channel = channel;
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to)   match.date.$lte = new Date(to);
    }
    const negatives = await FreshLine.find({ ...match, margin: { $lt: 0 } }).sort({ margin: 1 }).limit(200).lean();
    const rejects   = await FreshLine.find({ ...match, rejectedValue: { $gt: 0 } }).sort({ rejectedValue: -1 }).limit(200).lean();
    res.json({ negativeMargins: negatives, highRejections: rejects });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
