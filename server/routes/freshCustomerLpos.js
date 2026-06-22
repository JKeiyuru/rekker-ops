// server/routes/freshCustomerLpos.js

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const FreshCustomerLPO = require('../models/FreshCustomerLPO');
const { protect, authorize } = require('../middleware/auth');

const MANAGE = ['super_admin', 'admin', 'team_lead', 'fresh_team_lead'];

const POPULATE = [
  { path: 'customer',  select: 'name' },
  { path: 'createdBy', select: 'fullName' },
];

// GET /api/fresh-customer-lpos
router.get('/', protect, async (req, res) => {
  try {
    const { startDate, endDate, deliveryStartDate, deliveryEndDate, batchId, customer, status, search } = req.query;
    const filter = {};
    if (batchId)  filter.batchId = batchId;
    if (customer) filter.customer = customer;
    if (status)   filter.status = status;
    if (search)   filter.lpoNumber = { $regex: search.trim().toUpperCase(), $options: 'i' };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate)   { const e = new Date(endDate); e.setHours(23, 59, 59, 999); filter.date.$lte = e; }
    }
    if (deliveryStartDate || deliveryEndDate) {
      filter.deliveryDate = {};
      if (deliveryStartDate) filter.deliveryDate.$gte = new Date(deliveryStartDate);
      if (deliveryEndDate)   { const e = new Date(deliveryEndDate); e.setHours(23, 59, 59, 999); filter.deliveryDate.$lte = e; }
    }
    const lpos = await FreshCustomerLPO.find(filter).populate(POPULATE).sort({ date: -1, createdAt: -1 }).limit(500);
    res.json(lpos);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/batches', protect, async (req, res) => {
  try {
    const rows = await FreshCustomerLPO.aggregate([
      { $match: { batchId: { $ne: null } } },
      { $group: {
        _id: '$batchId',
        count: { $sum: 1 },
        total: { $sum: '$totalValue' },
        net:   { $sum: '$netValue' },
        firstDate: { $min: '$date' },
        statuses:  { $addToSet: '$status' },
      } },
      { $sort: { firstDate: -1 } },
      { $limit: 100 },
    ]);
    res.json(rows.map(r => ({
      batchId: r._id, count: r.count, total: r.total, net: r.net, date: r.firstDate, statuses: r.statuses,
    })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const lpo = await FreshCustomerLPO.findById(req.params.id).populate(POPULATE);
    if (!lpo) return res.status(404).json({ message: 'LPO not found' });
    res.json(lpo);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

function buildLpoFields(body) {
  const items = (body.items || []).filter(it => it && (it.name || it.quantity));
  const isQuick = items.length === 0;
  return {
    lpoNumber: (body.lpoNumber || '').toUpperCase(),
    customer: body.customer || null,
    customerNameRaw: body.customerNameRaw || '',
    deliveryLocation: body.deliveryLocation || '',
    deliveryGeo: body.deliveryGeo || {},
    items,
    quickAmount: isQuick ? Number(body.quickAmount || body.amount || 0) : null,
    date: body.date ? new Date(body.date) : new Date(),
    deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
    notes: body.notes || '',
    status: body.status || 'pending',
  };
}

router.post('/', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const fields = buildLpoFields(req.body);
    if (!fields.lpoNumber) return res.status(400).json({ message: 'LPO number required' });
    const exists = await FreshCustomerLPO.findOne({ lpoNumber: fields.lpoNumber });
    if (exists) return res.status(400).json({ message: 'LPO number already exists' });
    if (fields.items.length === 0 && !(fields.quickAmount > 0)) {
      return res.status(400).json({ message: 'Either items or a quick amount (>0) is required' });
    }
    const lpo = await FreshCustomerLPO.create({ ...fields, createdBy: req.user._id });
    await lpo.populate(POPULATE);
    res.status(201).json(lpo);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/batch', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const { lpos } = req.body;
    if (!lpos || !lpos.length) return res.status(400).json({ message: 'No LPOs provided' });

    const fieldsList = lpos.map(buildLpoFields);
    for (const f of fieldsList) {
      if (!f.lpoNumber) return res.status(400).json({ message: 'Every LPO needs a number' });
      if (f.items.length === 0 && !(f.quickAmount > 0)) {
        return res.status(400).json({ message: `LPO ${f.lpoNumber}: items or quickAmount required` });
      }
    }
    const numbers = fieldsList.map(f => f.lpoNumber);
    const dupes = numbers.filter((n, i) => n && numbers.indexOf(n) !== i);
    if (dupes.length) return res.status(400).json({ message: `Duplicate LPO numbers: ${dupes.join(', ')}` });
    const existing = await FreshCustomerLPO.find({ lpoNumber: { $in: numbers } });
    if (existing.length) return res.status(400).json({ message: `Already exist: ${existing.map(l => l.lpoNumber).join(', ')}` });

    const batchId = uuidv4();
    const created = [];
    for (const f of fieldsList) {
      const doc = await FreshCustomerLPO.create({ ...f, batchId, createdBy: req.user._id });
      created.push(doc);
    }
    const populated = await FreshCustomerLPO.find({ batchId }).populate(POPULATE).sort({ createdAt: 1 });
    res.status(201).json({ batchId, lpos: populated });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const lpo = await FreshCustomerLPO.findById(req.params.id);
    if (!lpo) return res.status(404).json({ message: 'LPO not found' });

    // Allow renaming the LPO number (typo fixes), with uniqueness check.
    if (req.body.lpoNumber && req.body.lpoNumber.toUpperCase() !== lpo.lpoNumber) {
      const newNum = req.body.lpoNumber.toUpperCase();
      const clash = await FreshCustomerLPO.findOne({ lpoNumber: newNum, _id: { $ne: lpo._id } });
      if (clash) return res.status(400).json({ message: `LPO number ${newNum} already exists` });
      lpo.lpoNumber = newNum;
    }

    const allowed = ['customer','customerNameRaw','deliveryLocation','deliveryGeo','items','quickAmount','date','deliveryDate','notes','status'];
    allowed.forEach(k => { if (req.body[k] !== undefined) lpo[k] = req.body[k]; });
    await lpo.save();
    await lpo.populate(POPULATE);
    res.json(lpo);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/:id/status', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const { status } = req.body;
    const lpo = await FreshCustomerLPO.findById(req.params.id);
    if (!lpo) return res.status(404).json({ message: 'LPO not found' });
    lpo.status = status;
    if (status === 'delivered' && !lpo.deliveredAt) lpo.deliveredAt = new Date();
    if (status === 'closed') lpo.closedAt = new Date();
    await lpo.save();
    await lpo.populate(POPULATE);
    res.json(lpo);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    await FreshCustomerLPO.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
