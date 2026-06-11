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
    const { startDate, endDate, batchId, customer, status } = req.query;
    const filter = {};
    if (batchId)  filter.batchId = batchId;
    if (customer) filter.customer = customer;
    if (status)   filter.status = status;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate)   { const e = new Date(endDate); e.setHours(23, 59, 59, 999); filter.date.$lte = e; }
    }
    const lpos = await FreshCustomerLPO.find(filter).populate(POPULATE).sort({ date: -1, createdAt: -1 }).limit(500);
    res.json(lpos);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/fresh-customer-lpos/batches — group by batchId for the recent listing
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

// GET /api/fresh-customer-lpos/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const lpo = await FreshCustomerLPO.findById(req.params.id).populate(POPULATE);
    if (!lpo) return res.status(404).json({ message: 'LPO not found' });
    res.json(lpo);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/fresh-customer-lpos — create single LPO
router.post('/', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const { lpoNumber, customer, customerNameRaw, deliveryLocation, deliveryGeo, items, date, deliveryDate, notes, status } = req.body;
    if (!lpoNumber) return res.status(400).json({ message: 'LPO number required' });
    const exists = await FreshCustomerLPO.findOne({ lpoNumber: lpoNumber.toUpperCase() });
    if (exists) return res.status(400).json({ message: 'LPO number already exists' });

    const lpo = await FreshCustomerLPO.create({
      lpoNumber,
      customer: customer || null,
      customerNameRaw: customerNameRaw || '',
      deliveryLocation: deliveryLocation || '',
      deliveryGeo: deliveryGeo || {},
      items: items || [],
      date: date ? new Date(date) : new Date(),
      deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
      notes: notes || '',
      status: status || 'pending',
      createdBy: req.user._id,
    });
    await lpo.populate(POPULATE);
    res.status(201).json(lpo);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/fresh-customer-lpos/batch — create multiple LPOs in one batch
router.post('/batch', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const { lpos } = req.body;
    if (!lpos || !lpos.length) return res.status(400).json({ message: 'No LPOs provided' });

    const numbers = lpos.map(l => (l.lpoNumber || '').toUpperCase());
    const dupes = numbers.filter((n, i) => n && numbers.indexOf(n) !== i);
    if (dupes.length) return res.status(400).json({ message: `Duplicate LPO numbers: ${dupes.join(', ')}` });

    const existing = await FreshCustomerLPO.find({ lpoNumber: { $in: numbers } });
    if (existing.length) return res.status(400).json({ message: `Already exist: ${existing.map(l => l.lpoNumber).join(', ')}` });

    const batchId = uuidv4();
    const created = [];
    for (const l of lpos) {
      const doc = await FreshCustomerLPO.create({
        lpoNumber: l.lpoNumber,
        customer: l.customer || null,
        customerNameRaw: l.customerNameRaw || '',
        deliveryLocation: l.deliveryLocation || '',
        deliveryGeo: l.deliveryGeo || {},
        items: l.items || [],
        date: l.date ? new Date(l.date) : new Date(),
        deliveryDate: l.deliveryDate ? new Date(l.deliveryDate) : null,
        notes: l.notes || '',
        status: l.status || 'pending',
        batchId,
        createdBy: req.user._id,
      });
      created.push(doc);
    }
    const populated = await FreshCustomerLPO.find({ batchId }).populate(POPULATE).sort({ createdAt: 1 });
    res.status(201).json({ batchId, lpos: populated });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/fresh-customer-lpos/:id
router.put('/:id', protect, authorize(...MANAGE), async (req, res) => {
  try {
    const lpo = await FreshCustomerLPO.findById(req.params.id);
    if (!lpo) return res.status(404).json({ message: 'LPO not found' });
    const allowed = ['customer','customerNameRaw','deliveryLocation','deliveryGeo','items','date','deliveryDate','notes','status'];
    allowed.forEach(k => { if (req.body[k] !== undefined) lpo[k] = req.body[k]; });
    await lpo.save();
    await lpo.populate(POPULATE);
    res.json(lpo);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/fresh-customer-lpos/:id/status
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

// DELETE /api/fresh-customer-lpos/:id
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    await FreshCustomerLPO.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
