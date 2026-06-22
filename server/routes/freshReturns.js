// server/routes/freshReturns.js

const express = require('express');
const router = express.Router();
const FreshReturn = require('../models/FreshReturn');
const FreshCustomerLPO = require('../models/FreshCustomerLPO');
const ReturnReason = require('../models/ReturnReason');
const { protect, authorize } = require('../middleware/auth');

const MANAGE = ['super_admin', 'admin', 'team_lead', 'fresh_team_lead'];

const POPULATE = [
  { path: 'lpos',      select: 'lpoNumber customerNameRaw customer totalValue netValue' },
  { path: 'createdBy', select: 'fullName' },
];

function genReturnNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RET-${ymd}-${rnd}`;
}

async function resolveReason(reason, saveCustom, userId) {
  // Built-in codes
  const builtIns = ['damaged','wrong_item','wrong_quantity','expired','refused','short_dated','excess','quality_issue','other'];
  if (builtIns.includes(reason)) {
    const labelMap = {
      damaged:'Damaged', wrong_item:'Wrong item', wrong_quantity:'Wrong quantity',
      expired:'Expired', refused:'Refused', short_dated:'Short-dated',
      excess:'Excess', quality_issue:'Quality issue', other:'Other',
    };
    return { reason, reasonLabel: labelMap[reason] };
  }
  // Custom
  const label = String(reason || '').trim() || 'Other';
  if (saveCustom) {
    const existing = await ReturnReason.findOne({ label });
    if (!existing) await ReturnReason.create({ label, createdBy: userId });
  }
  return { reason: 'custom', reasonLabel: label };
}

router.get('/', protect, async (req, res) => {
  try {
    const { startDate, endDate, lpo, mode } = req.query;
    const filter = {};
    if (lpo)  filter.lpos = lpo;
    if (mode) filter.mode = mode;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate)   { const e = new Date(endDate); e.setHours(23,59,59,999); filter.date.$lte = e; }
    }
    const list = await FreshReturn.find(filter).populate(POPULATE).sort({ date: -1, createdAt: -1 }).limit(500);
    res.json(list);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const r = await FreshReturn.findById(req.params.id).populate(POPULATE);
    if (!r) return res.status(404).json({ message: 'Return not found' });
    res.json(r);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST — items mode: { mode:'items', reason, saveCustom, notes, items:[{lpo,itemId,qty,notes}] }
// POST — value mode: { mode:'value', reason, saveCustom, notes, valueLines:[{lpo,amount,notes}] }
router.post('/', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const { date, reason, saveCustom, notes, items = [], valueLines = [], mode = 'items', returnNumber } = req.body;
    const { reason: rCode, reasonLabel } = await resolveReason(reason, !!saveCustom, req.user._id);

    if (mode === 'items') {
      if (!items.length) return res.status(400).json({ message: 'At least one return item required' });
      const enrichedItems = [];
      const lpoTouched = new Map();
      for (const it of items) {
        const lpoDoc = lpoTouched.get(String(it.lpo)) || await FreshCustomerLPO.findById(it.lpo);
        if (!lpoDoc) return res.status(400).json({ message: `LPO ${it.lpo} not found` });
        if (lpoDoc.hasValueReturns) return res.status(400).json({ message: `LPO ${lpoDoc.lpoNumber} already has value-only returns; cannot mix with item returns.` });
        if (!lpoDoc.items || lpoDoc.items.length === 0) return res.status(400).json({ message: `LPO ${lpoDoc.lpoNumber} has no items — use value-mode return.` });
        lpoTouched.set(String(it.lpo), lpoDoc);
        const sub = lpoDoc.items.id(it.itemId);
        if (!sub) return res.status(400).json({ message: 'Item not found on LPO' });
        const remaining = Number(sub.quantity || 0) - Number(sub.returnedQty || 0);
        if (Number(it.qty) > remaining + 1e-9) {
          return res.status(400).json({ message: `Cannot return ${it.qty} of ${sub.name} — only ${remaining} remaining` });
        }
        enrichedItems.push({
          lpo: lpoDoc._id, itemId: sub._id, itemName: sub.name,
          qty: Number(it.qty), unitPrice: Number(sub.unitPrice), notes: it.notes || '',
        });
      }
      const ret = await FreshReturn.create({
        returnNumber: (returnNumber || genReturnNumber()).toUpperCase(),
        date: date ? new Date(date) : new Date(),
        mode: 'items',
        reason: rCode, reasonLabel,
        notes: notes || '',
        items: enrichedItems,
        createdBy: req.user._id,
      });
      for (const it of enrichedItems) {
        const lpoDoc = lpoTouched.get(String(it.lpo));
        const sub = lpoDoc.items.id(it.itemId);
        sub.returnedQty = Number(sub.returnedQty || 0) + Number(it.qty);
      }
      for (const lpoDoc of lpoTouched.values()) await lpoDoc.save();
      await ret.populate(POPULATE);
      return res.status(201).json(ret);
    }

    // value mode
    if (!valueLines.length) return res.status(400).json({ message: 'At least one value return line required' });
    const lpoTouched = new Map();
    let total = 0;
    for (const v of valueLines) {
      const lpoDoc = lpoTouched.get(String(v.lpo)) || await FreshCustomerLPO.findById(v.lpo);
      if (!lpoDoc) return res.status(400).json({ message: `LPO ${v.lpo} not found` });
      if (lpoDoc.hasItemReturns) return res.status(400).json({ message: `LPO ${lpoDoc.lpoNumber} already has item-level returns; cannot mix with value returns.` });
      const amt = Number(v.amount);
      if (!(amt > 0)) return res.status(400).json({ message: `Amount must be > 0 for LPO ${lpoDoc.lpoNumber}` });
      const remaining = Number(lpoDoc.totalValue || 0) - Number(lpoDoc.valueReturnedTotal || 0);
      if (amt > remaining + 1e-6) return res.status(400).json({ message: `Amount ${amt} exceeds remaining ${remaining.toFixed(2)} on ${lpoDoc.lpoNumber}` });
      lpoTouched.set(String(v.lpo), lpoDoc);
      total += amt;
    }
    const ret = await FreshReturn.create({
      returnNumber: (returnNumber || genReturnNumber()).toUpperCase(),
      date: date ? new Date(date) : new Date(),
      mode: 'value',
      reason: rCode, reasonLabel,
      notes: notes || '',
      valueLines: valueLines.map(v => ({ lpo: v.lpo, amount: Number(v.amount), notes: v.notes || '' })),
      createdBy: req.user._id,
    });
    for (const v of valueLines) {
      const lpoDoc = lpoTouched.get(String(v.lpo));
      lpoDoc.valueReturnedTotal = Number(lpoDoc.valueReturnedTotal || 0) + Number(v.amount);
      lpoDoc.hasValueReturns = true;
      if (lpoDoc.status === 'pending') lpoDoc.status = 'partially_returned';
      else if (lpoDoc.status === 'delivered') lpoDoc.status = 'partially_returned';
      await lpoDoc.save();
    }
    await ret.populate(POPULATE);
    res.status(201).json(ret);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const ret = await FreshReturn.findById(req.params.id);
    if (!ret) return res.status(404).json({ message: 'Return not found' });

    if (ret.mode === 'items') {
      for (const it of ret.items) {
        const lpoDoc = await FreshCustomerLPO.findById(it.lpo);
        if (!lpoDoc) continue;
        const sub = lpoDoc.items.id(it.itemId);
        if (sub) {
          sub.returnedQty = Math.max(0, Number(sub.returnedQty || 0) - Number(it.qty));
          await lpoDoc.save();
        }
      }
    } else {
      for (const v of ret.valueLines) {
        const lpoDoc = await FreshCustomerLPO.findById(v.lpo);
        if (!lpoDoc) continue;
        lpoDoc.valueReturnedTotal = Math.max(0, Number(lpoDoc.valueReturnedTotal || 0) - Number(v.amount));
        // Re-check whether any value returns still link to this LPO
        const remaining = await FreshReturn.exists({ mode: 'value', lpos: lpoDoc._id, _id: { $ne: ret._id } });
        lpoDoc.hasValueReturns = !!remaining;
        await lpoDoc.save();
      }
    }
    await ret.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
