// server/routes/freshLpos.js
// Handles both Fresh Produce LPOs and their linked invoices.

const express      = require('express');
const router       = express.Router();
const FreshLPO     = require('../models/FreshLPO');
const FreshInvoice = require('../models/FreshInvoice');
const { protect, authorize } = require('../middleware/auth');

const FRESH_ROLES  = ['super_admin', 'admin', 'fresh_team_lead', 'team_lead', 'farm_sourcing', 'market_sourcing'];
const ADMIN_ROLES  = ['super_admin', 'admin'];
const MANAGE_ROLES = ['super_admin', 'admin', 'fresh_team_lead', 'team_lead'];

const LPO_POPULATE = [
  { path: 'createdBy', select: 'fullName' },
  { path: 'tripSession', select: 'date vehicle', populate: { path: 'vehicle', select: 'regNumber' } },
  { path: 'invoice' },
];

const INV_POPULATE = [
  { path: 'lpo', select: 'lpoNumber amount destination supplier' },
  { path: 'createdBy', select: 'fullName' },
  { path: 'editedBy',  select: 'fullName' },
];

// ── LPO ROUTES ────────────────────────────────────────────────────────────────

// GET /api/fresh-lpos
router.get('/', protect, async (req, res) => {
  try {
    const { startDate, endDate, status, destination } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) { const e = new Date(endDate); e.setHours(23,59,59,999); filter.date.$lte = e; }
    }
    if (status)      filter.status      = status;
    if (destination) filter.destination = destination;

    const lpos = await FreshLPO.find(filter).populate(LPO_POPULATE).sort({ date: -1 });
    res.json(lpos);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/fresh-lpos
router.post('/', protect, authorize(...FRESH_ROLES), async (req, res) => {
  try {
    const { lpoNumber, amount, destination, supplier, notes, tripSessionId } = req.body;
    if (!lpoNumber)   return res.status(400).json({ message: 'LPO number required' });
    if (!amount)      return res.status(400).json({ message: 'Amount required' });
    if (!destination) return res.status(400).json({ message: 'Destination required' });

    const exists = await FreshLPO.findOne({ lpoNumber: lpoNumber.toUpperCase() });
    if (exists) return res.status(400).json({ message: 'LPO number already exists' });

    const lpo = await FreshLPO.create({
      lpoNumber:   lpoNumber.toUpperCase(),
      amount:      Number(amount),
      destination,
      supplier:    supplier || '',
      notes:       notes   || '',
      tripSession: tripSessionId || null,
      createdBy:   req.user._id,
    });
    await lpo.populate(LPO_POPULATE);
    res.status(201).json(lpo);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/fresh-lpos/:id
router.put('/:id', protect, authorize(...MANAGE_ROLES), async (req, res) => {
  try {
    const lpo = await FreshLPO.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate(LPO_POPULATE);
    if (!lpo) return res.status(404).json({ message: 'Not found' });
    res.json(lpo);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/fresh-lpos/:id
router.delete('/:id', protect, authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    await FreshLPO.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── INVOICE ROUTES ────────────────────────────────────────────────────────────

// GET /api/fresh-lpos/invoices
router.get('/invoices', protect, async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) { const e = new Date(endDate); e.setHours(23,59,59,999); filter.date.$lte = e; }
    }
    if (status && status !== 'all') filter.status = status;

    const invoices = await FreshInvoice.find(filter).populate(INV_POPULATE).sort({ date: -1 });
    res.json(invoices);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/fresh-lpos/invoices
router.post('/invoices', protect, authorize(...FRESH_ROLES), async (req, res) => {
  try {
    const { invoiceNumber, lpoId, invoiceAmount, supplier, notes } = req.body;
    if (!invoiceNumber) return res.status(400).json({ message: 'Invoice number required' });
    if (!lpoId)         return res.status(400).json({ message: 'LPO required' });
    if (!invoiceAmount) return res.status(400).json({ message: 'Invoice amount required' });

    const existingInv = await FreshInvoice.findOne({ invoiceNumber: invoiceNumber.toUpperCase() });
    if (existingInv) return res.status(400).json({ message: 'Invoice number already exists' });

    const alreadyInvoiced = await FreshInvoice.findOne({ lpo: lpoId });
    if (alreadyInvoiced) return res.status(400).json({ message: 'This LPO already has an invoice' });

    const lpo = await FreshLPO.findById(lpoId);
    if (!lpo) return res.status(404).json({ message: 'LPO not found' });

    const diff        = Number(invoiceAmount) - Number(lpo.amount);
    const threshold   = 500; // KES — configurable in future
    const withinThresh = Math.abs(diff) <= threshold;

    const invoice = await FreshInvoice.create({
      invoiceNumber:   invoiceNumber.toUpperCase(),
      lpo:             lpoId,
      lpoNumber:       lpo.lpoNumber,
      invoiceAmount:   Number(invoiceAmount),
      lpoAmount:       Number(lpo.amount),
      difference:      diff,
      supplier:        supplier || lpo.supplier || '',
      notes:           notes   || '',
      thresholdAmount: threshold,
      withinThreshold: withinThresh,
      createdBy:       req.user._id,
    });

    // Update the LPO status and link
    lpo.status  = 'invoiced';
    lpo.invoice = invoice._id;
    await lpo.save();

    await invoice.populate(INV_POPULATE);
    res.status(201).json(invoice);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/fresh-lpos/invoices/:id/status
router.patch('/invoices/:id/status', protect, async (req, res) => {
  try {
    const { action, rejectionReason } = req.body;
    const invoice = await FreshInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Not found' });

    const now = new Date();
    if (action === 'submit') {
      invoice.status = 'submitted';
    } else if (action === 'approve') {
      if (!ADMIN_ROLES.includes(req.user.role)) return res.status(403).json({ message: 'Admins only' });
      invoice.status = 'approved';
      const lpo = await FreshLPO.findById(invoice.lpo);
      if (lpo) { lpo.status = 'approved'; await lpo.save(); }
    } else if (action === 'reject') {
      if (!ADMIN_ROLES.includes(req.user.role)) return res.status(403).json({ message: 'Admins only' });
      invoice.status = 'rejected';
      if (rejectionReason) invoice.notes = `REJECTED: ${rejectionReason}`;
    } else {
      return res.status(400).json({ message: 'Invalid action' });
    }
    await invoice.save();
    await invoice.populate(INV_POPULATE);
    res.json(invoice);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/fresh-lpos/invoices/:id — admin edit
router.put('/invoices/:id', protect, authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const invoice = await FreshInvoice.findById(req.params.id).populate('lpo');
    if (!invoice) return res.status(404).json({ message: 'Not found' });

    const { invoiceNumber, invoiceAmount, supplier, notes } = req.body;
    if (invoiceNumber) invoice.invoiceNumber = invoiceNumber.toUpperCase();
    if (invoiceAmount != null) {
      invoice.invoiceAmount = Number(invoiceAmount);
      invoice.difference    = invoice.invoiceAmount - invoice.lpoAmount;
      invoice.withinThreshold = Math.abs(invoice.difference) <= (invoice.thresholdAmount || 500);
    }
    if (supplier !== undefined) invoice.supplier = supplier;
    if (notes    !== undefined) invoice.notes    = notes;

    invoice.isEdited = true;
    invoice.editedAt = new Date();
    invoice.editedBy = req.user._id;

    await invoice.save();
    await invoice.populate(INV_POPULATE);
    res.json(invoice);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
