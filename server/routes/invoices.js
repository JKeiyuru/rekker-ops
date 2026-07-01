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

// ── Helper: compute incl-VAT and normalize tax fields ────────────────────────
function computeInvoiceAmounts({ amountExVat, vatRate = 16, taxMode = 'taxable', exemptAmount = 0 }) {
  const sub = Number(amountExVat) || 0;
  const rate = Number(vatRate) || 0;
  let exempt = Number(exemptAmount) || 0;
  let mode = taxMode;

  if (mode === 'taxable') exempt = 0;
  else if (mode === 'exempt') exempt = sub;
  else {
    // 'mixed' — clamp exempt into [0, sub]
    if (exempt < 0) exempt = 0;
    if (exempt > sub) exempt = sub;
    // Auto-collapse to pure modes for clarity
    if (exempt === 0) mode = 'taxable';
    else if (Math.abs(exempt - sub) < 0.01) { mode = 'exempt'; exempt = sub; }
  }

  const taxable = sub - exempt;
  const amountInclVat = Number((taxable * (1 + rate / 100) + exempt).toFixed(2));
  return { amountExVat: sub, amountInclVat, vatRate: rate, taxMode: mode, exemptAmount: exempt };
}

// ── POST /api/invoices ────────────────────────────────────────────────────────
router.post('/', protect, authorize(...PACKAGING_CAN_CREATE), async (req, res) => {
  try {
    const {
      invoiceNumber, lpoId, amountExVat, amountInclVat,
      vatRate, disparityReason, date, deliveredBy,
      taxMode, exemptAmount,
    } = req.body;

    if (!invoiceNumber) return res.status(400).json({ message: 'Invoice number required' });
    if (!lpoId)         return res.status(400).json({ message: 'LPO required' });
    if (amountExVat == null)
      return res.status(400).json({ message: 'Invoice amount required' });

    const existing = await Invoice.findOne({ invoiceNumber: invoiceNumber.toUpperCase() });
    if (existing) return res.status(400).json({ message: 'Invoice number already exists' });

    const alreadyInvoiced = await Invoice.findOne({ lpo: lpoId });
    if (alreadyInvoiced) return res.status(400).json({ message: 'This LPO already has an invoice' });

    const lpo = await LPO.findById(lpoId).populate('branch responsiblePerson');
    if (!lpo) return res.status(404).json({ message: 'LPO not found' });

    const tax = computeInvoiceAmounts({
      amountExVat, vatRate, taxMode: taxMode || 'taxable', exemptAmount: exemptAmount || 0,
    });

    let disparityAmount = null;
    if (lpo.amount != null) {
      const diff = tax.amountExVat - Number(lpo.amount);
      if (Math.abs(diff) > 0.01) disparityAmount = diff;
    }

    const invoice = await Invoice.create({
      invoiceNumber:   invoiceNumber.toUpperCase(),
      lpo:             lpoId,
      lpoNumber:       lpo.lpoNumber,
      amountExVat:     tax.amountExVat,
      amountInclVat:   amountInclVat != null ? Number(amountInclVat) : tax.amountInclVat,
      vatRate:         tax.vatRate,
      taxMode:         tax.taxMode,
      exemptAmount:    tax.exemptAmount,
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

// ── POST /api/invoices/batch — many invoices sharing deliveredBy/date/tax ────
router.post('/batch', protect, authorize(...PACKAGING_CAN_CREATE), async (req, res) => {
  try {
    const {
      items,           // [{ lpoId, invoiceNumber, amountExVat, taxMode?, exemptAmount?, disparityReason? }]
      deliveredBy,     // shared
      date,            // shared invoice date
      vatRate,         // shared
    } = req.body;

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: 'No invoices provided' });
    }

    // Validate uniqueness within payload
    const numbers = items.map((i) => String(i.invoiceNumber || '').toUpperCase());
    const dupe = numbers.find((n, i) => !n || numbers.indexOf(n) !== i);
    if (dupe !== undefined) {
      if (!dupe) return res.status(400).json({ message: 'Every item needs an invoice number' });
      return res.status(400).json({ message: `Duplicate invoice number in batch: ${dupe}` });
    }

    // Check against DB
    const existing = await Invoice.find({ invoiceNumber: { $in: numbers } }).select('invoiceNumber');
    if (existing.length) {
      return res.status(400).json({ message: `Already exists: ${existing.map((e) => e.invoiceNumber).join(', ')}` });
    }

    const lpoIds = items.map((i) => i.lpoId);
    const alreadyInvoiced = await Invoice.find({ lpo: { $in: lpoIds } }).select('lpo lpoNumber');
    if (alreadyInvoiced.length) {
      return res.status(400).json({ message: `LPOs already invoiced: ${alreadyInvoiced.map((e) => e.lpoNumber).join(', ')}` });
    }

    const lpos = await LPO.find({ _id: { $in: lpoIds } }).populate('branch responsiblePerson');
    const lpoMap = Object.fromEntries(lpos.map((l) => [String(l._id), l]));

    const { v4: uuidv4 } = require('uuid');
    const batchId = uuidv4();
    const when = date ? new Date(date) : new Date();

    const docs = items.map((it) => {
      const lpo = lpoMap[String(it.lpoId)];
      if (!lpo) throw new Error(`LPO not found: ${it.lpoId}`);

      const tax = computeInvoiceAmounts({
        amountExVat: it.amountExVat,
        vatRate: vatRate || 16,
        taxMode: it.taxMode || 'taxable',
        exemptAmount: it.exemptAmount || 0,
      });

      let disparityAmount = null;
      if (lpo.amount != null) {
        const diff = tax.amountExVat - Number(lpo.amount);
        if (Math.abs(diff) > 0.01) disparityAmount = diff;
      }

      return {
        invoiceNumber:   String(it.invoiceNumber).toUpperCase(),
        lpo:             lpo._id,
        lpoNumber:       lpo.lpoNumber,
        amountExVat:     tax.amountExVat,
        amountInclVat:   tax.amountInclVat,
        vatRate:         tax.vatRate,
        taxMode:         tax.taxMode,
        exemptAmount:    tax.exemptAmount,
        disparityAmount,
        disparityReason: it.disparityReason || '',
        deliveredBy:     deliveredBy || '',
        branch:          lpo.branch?._id || null,
        branchNameRaw:   lpo.branchNameRaw || '',
        date:            when,
        batchId,
        createdBy:       req.user._id,
        status:          'draft',
      };
    });

    await Invoice.insertMany(docs);
    const created = await Invoice.find({ batchId }).populate(POPULATE).sort({ createdAt: 1 });
    res.status(201).json(created);
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

    const { invoiceNumber, amountExVat, amountInclVat, disparityReason, vatRate, deliveredBy, returns, taxMode, exemptAmount } = req.body;

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
    if (vatRate != null)      track('vatRate', Number(vatRate));
    if (taxMode !== undefined)     track('taxMode', taxMode);
    if (exemptAmount !== undefined) track('exemptAmount', Number(exemptAmount) || 0);
    if (disparityReason !== undefined) track('disparityReason', disparityReason);
    if (deliveredBy !== undefined)     track('deliveredBy', deliveredBy || '');
    if (returns !== undefined)         track('returns', returns || '');

    // Recompute amounts if any tax-relevant field changed
    const taxChanged = ['amountExVat', 'vatRate', 'taxMode', 'exemptAmount'].some((f) => fieldsChanged.includes(f));
    if (taxChanged) {
      const tax = computeInvoiceAmounts({
        amountExVat:  invoice.amountExVat,
        vatRate:      invoice.vatRate,
        taxMode:      invoice.taxMode,
        exemptAmount: invoice.exemptAmount,
      });
      if (invoice.taxMode !== tax.taxMode)         { snapshot.taxMode = invoice.taxMode; invoice.taxMode = tax.taxMode; if (!fieldsChanged.includes('taxMode')) fieldsChanged.push('taxMode'); }
      if (invoice.exemptAmount !== tax.exemptAmount){ snapshot.exemptAmount = invoice.exemptAmount; invoice.exemptAmount = tax.exemptAmount; if (!fieldsChanged.includes('exemptAmount')) fieldsChanged.push('exemptAmount'); }
      if (invoice.amountInclVat !== tax.amountInclVat){ snapshot.amountInclVat = invoice.amountInclVat; invoice.amountInclVat = tax.amountInclVat; fieldsChanged.push('amountInclVat'); }
    } else if (amountInclVat != null) {
      // Explicit override
      track('amountInclVat', Number(amountInclVat));
    }

    if (fieldsChanged.length > 0) {
      if (invoice.lpo?.amount != null && fieldsChanged.includes('amountExVat')) {
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
