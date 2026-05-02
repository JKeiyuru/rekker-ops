// server/routes/invoices.js

const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
const LPO = require('../models/LPO');
const { protect, authorize } = require('../middleware/auth');

const PACKAGING_CAN_CREATE = ['super_admin', 'admin', 'team_lead', 'packaging_team_lead'];
const ADMIN_ONLY = ['super_admin', 'admin'];

const POPULATE = [
  {
    path: 'lpo',
    select: 'lpoNumber amount date deliveryDate status responsiblePerson',
    populate: [
      { path: 'branch', select: 'name' },
      { path: 'responsiblePerson', select: 'name' },
    ],
  },
  { path: 'branch', select: 'name' },
  { path: 'createdBy', select: 'fullName' },
  { path: 'editedBy', select: 'fullName' },
  { path: 'returnsUpdatedBy', select: 'fullName' },
];

// ── GET /api/invoices ─────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }
    if (status && status !== 'all') filter.status = status;

    const invoices = await Invoice.find(filter)
      .populate(POPULATE)
      .sort({ date: -1, createdAt: -1 });

    // Group by date
    const grouped = {};
    invoices.forEach((inv) => {
      const dateKey = new Date(inv.date).toISOString().split('T')[0];
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(inv);
    });

    const sortedKeys = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
    res.json(sortedKeys.map((date) => ({ date, invoices: grouped[date] })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/invoices/summary ─────────────────────────────────────────────────
router.get('/summary', protect, authorize(...ADMIN_ONLY), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const [todayStats, allStats] = await Promise.all([
      Invoice.aggregate([
        { $match: { date: { $gte: today, $lt: tomorrow } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            totalAmountExVat:   { $sum: '$amountExVat' },
            totalAmountInclVat: { $sum: '$amountInclVat' },
            withDisparity: { $sum: { $cond: [{ $ne: ['$disparityAmount', null] }, 1, 0] } },
          },
        },
      ]),
      Invoice.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, totalExVat: { $sum: '$amountExVat' } } },
      ]),
    ]);

    res.json({
      today:    todayStats[0] || { total: 0, totalAmountExVat: 0, totalAmountInclVat: 0, withDisparity: 0 },
      byStatus: allStats,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/invoices/:id ─────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate(POPULATE);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/invoices ────────────────────────────────────────────────────────
router.post('/', protect, authorize(...PACKAGING_CAN_CREATE), async (req, res) => {
  try {
    const {
      invoiceNumber, lpoId, amountExVat, amountInclVat,
      vatRate, disparityReason, date, deliveredBy,
    } = req.body;

    if (!invoiceNumber) return res.status(400).json({ message: 'Invoice number required' });
    if (!lpoId)         return res.status(400).json({ message: 'LPO required' });
    if (amountExVat == null || amountInclVat == null)
      return res.status(400).json({ message: 'Both amount fields required' });

    const existing = await Invoice.findOne({ invoiceNumber: invoiceNumber.toUpperCase() });
    if (existing) return res.status(400).json({ message: 'Invoice number already exists' });

    const alreadyInvoiced = await Invoice.findOne({ lpo: lpoId });
    if (alreadyInvoiced) return res.status(400).json({ message: 'This LPO already has an invoice' });

    const lpo = await LPO.findById(lpoId).populate('branch responsiblePerson');
    if (!lpo) return res.status(404).json({ message: 'LPO not found' });

    let disparityAmount = null;
    if (lpo.amount != null) {
      const diff = Number(amountExVat) - Number(lpo.amount);
      if (Math.abs(diff) > 0.01) disparityAmount = diff;
    }

    const invoice = await Invoice.create({
      invoiceNumber:   invoiceNumber.toUpperCase(),
      lpo:             lpoId,
      lpoNumber:       lpo.lpoNumber,
      amountExVat:     Number(amountExVat),
      amountInclVat:   Number(amountInclVat),
      vatRate:         vatRate || 16,
      disparityAmount,
      disparityReason: disparityReason || '',
      deliveredBy:     deliveredBy || '',
      branch:          lpo.branch?._id || null,
      branchNameRaw:   lpo.branchNameRaw || '',
      date:            date ? new Date(date) : new Date(),
      createdBy:       req.user._id,
      status:          'draft',
    });

    await invoice.populate(POPULATE);
    res.status(201).json(invoice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /api/invoices/:id/status ───────────────────────────────────────────
router.patch('/:id/status', protect, async (req, res) => {
  try {
    const { action, rejectionReason } = req.body;
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const now = new Date();
    if (action === 'submit') {
      invoice.status = 'submitted';
      invoice.submittedAt = now;
    } else if (action === 'approve') {
      if (!ADMIN_ONLY.includes(req.user.role))
        return res.status(403).json({ message: 'Only admins can approve' });
      invoice.status = 'approved';
      invoice.approvedAt = now;
    } else if (action === 'reject') {
      if (!ADMIN_ONLY.includes(req.user.role))
        return res.status(403).json({ message: 'Only admins can reject' });
      invoice.status = 'rejected';
      invoice.rejectedAt = now;
      invoice.rejectionReason = rejectionReason || '';
    } else {
      return res.status(400).json({ message: 'Invalid action' });
    }

    await invoice.save();
    await invoice.populate(POPULATE);
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /api/invoices/:id/returns — update returns field any time ───────────
router.patch('/:id/returns', protect, authorize(...PACKAGING_CAN_CREATE), async (req, res) => {
  try {
    const { returns } = req.body;
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    invoice.returns          = returns || '';
    invoice.returnsUpdatedAt = new Date();
    invoice.returnsUpdatedBy = req.user._id;

    await invoice.save();
    await invoice.populate(POPULATE);
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/invoices/:id — admin edit with full audit trail ──────────────────
router.put('/:id', protect, authorize(...ADMIN_ONLY), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('lpo');
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const { invoiceNumber, amountExVat, amountInclVat, disparityReason, vatRate, deliveredBy, returns } = req.body;

    // Build a snapshot of changed fields for audit trail
    const fieldsChanged = [];
    const snapshot = {};

    const track = (field, newVal) => {
      const old = invoice[field];
      const changed = String(old) !== String(newVal);
      if (changed) {
        fieldsChanged.push(field);
        snapshot[field] = old;
        invoice[field] = newVal;
      }
    };

    if (invoiceNumber)        track('invoiceNumber', invoiceNumber.toUpperCase());
    if (amountExVat != null)  track('amountExVat', Number(amountExVat));
    if (amountInclVat != null) track('amountInclVat', Number(amountInclVat));
    if (vatRate != null)      track('vatRate', Number(vatRate));
    if (disparityReason !== undefined) track('disparityReason', disparityReason);
    if (deliveredBy !== undefined)     track('deliveredBy', deliveredBy || '');
    if (returns !== undefined)         track('returns', returns || '');

    if (fieldsChanged.length > 0) {
      // Recompute disparity if amounts changed
      if (invoice.lpo?.amount != null && (fieldsChanged.includes('amountExVat'))) {
        const diff = invoice.amountExVat - invoice.lpo.amount;
        invoice.disparityAmount = Math.abs(diff) > 0.01 ? diff : null;
      }

      invoice.isEdited = true;
      invoice.editedAt = new Date();
      invoice.editedBy = req.user._id;
      invoice.editHistory.push({
        editedAt:      new Date(),
        editedBy:      req.user._id,
        fieldsChanged,
        snapshot,
      });
    }

    await invoice.save();
    await invoice.populate(POPULATE);
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/invoices/:id — admin only ─────────────────────────────────────
router.delete('/:id', protect, authorize(...ADMIN_ONLY), async (req, res) => {
  try {
    await Invoice.findByIdAndDelete(req.params.id);
    res.json({ message: 'Invoice deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
