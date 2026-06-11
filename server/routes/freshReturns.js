// server/routes/freshReturns.js

const express = require('express');
const router = express.Router();
const FreshReturn = require('../models/FreshReturn');
const FreshCustomerLPO = require('../models/FreshCustomerLPO');
const { protect, authorize } = require('../middleware/auth');

const MANAGE = ['super_admin', 'admin', 'team_lead', 'fresh_team_lead'];

const POPULATE = [
  { path: 'lpos',      select: 'lpoNumber customerNameRaw customer' },
  { path: 'createdBy', select: 'fullName' },
];

function genReturnNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RET-${ymd}-${rnd}`;
}

// GET /api/fresh-returns
router.get('/', protect, async (req, res) => {
  try {
    const { startDate, endDate, lpo } = req.query;
    const filter = {};
    if (lpo) filter.lpos = lpo;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate)   { const e = new Date(endDate); e.setHours(23,59,59,999); filter.date.$lte = e; }
    }
    const list = await FreshReturn.find(filter).populate(POPULATE).sort({ date: -1, createdAt: -1 }).limit(500);
    res.json(list);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/fresh-returns/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const r = await FreshReturn.findById(req.params.id).populate(POPULATE);
    if (!r) return res.status(404).json({ message: 'Return not found' });
    res.json(r);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/fresh-returns — items: [{ lpo, itemId, qty, notes }]
router.post('/', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const { date, reason, notes, items, returnNumber } = req.body;
    if (!items || !items.length) return res.status(400).json({ message: 'At least one return item required' });

    // Resolve item info and validate qty <= remaining deliveredQty
    const enrichedItems = [];
    const lpoTouched = new Map(); // lpoId -> doc

    for (const it of items) {
      const lpoDoc = lpoTouched.get(String(it.lpo)) || await FreshCustomerLPO.findById(it.lpo);
      if (!lpoDoc) return res.status(400).json({ message: `LPO ${it.lpo} not found` });
      lpoTouched.set(String(it.lpo), lpoDoc);

      const sub = lpoDoc.items.id(it.itemId);
      if (!sub) return res.status(400).json({ message: 'Item not found on LPO' });

      const remaining = Number(sub.quantity || 0) - Number(sub.returnedQty || 0);
      if (Number(it.qty) > remaining + 1e-9) {
        return res.status(400).json({ message: `Cannot return ${it.qty} of ${sub.name} — only ${remaining} remaining` });
      }

      enrichedItems.push({
        lpo: lpoDoc._id,
        itemId: sub._id,
        itemName: sub.name,
        qty: Number(it.qty),
        unitPrice: Number(sub.unitPrice),
        notes: it.notes || '',
      });
    }

    const ret = await FreshReturn.create({
      returnNumber: (returnNumber || genReturnNumber()).toUpperCase(),
      date: date ? new Date(date) : new Date(),
      reason: reason || 'other',
      notes: notes || '',
      items: enrichedItems,
      createdBy: req.user._id,
    });

    // Apply returnedQty back to each LPO item, save lpo (status recalc in pre-save)
    for (const it of enrichedItems) {
      const lpoDoc = lpoTouched.get(String(it.lpo));
      const sub = lpoDoc.items.id(it.itemId);
      sub.returnedQty = Number(sub.returnedQty || 0) + Number(it.qty);
    }
    for (const lpoDoc of lpoTouched.values()) await lpoDoc.save();

    await ret.populate(POPULATE);
    res.status(201).json(ret);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE — reverses the returnedQty bumps
router.delete('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const ret = await FreshReturn.findById(req.params.id);
    if (!ret) return res.status(404).json({ message: 'Return not found' });

    for (const it of ret.items) {
      const lpoDoc = await FreshCustomerLPO.findById(it.lpo);
      if (!lpoDoc) continue;
      const sub = lpoDoc.items.id(it.itemId);
      if (sub) {
        sub.returnedQty = Math.max(0, Number(sub.returnedQty || 0) - Number(it.qty));
        await lpoDoc.save();
      }
    }
    await ret.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
