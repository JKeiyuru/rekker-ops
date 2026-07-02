// server/models/Invoice.js

const mongoose = require('mongoose');

const adjustmentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['returned_goods', 'not_delivered', 'control_list', 'other'],
      required: true,
    },
    amount:    { type: Number, required: true, min: 0 },
    reason:    { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// Optional line items on the invoice (used by Disparity Product Report).
const invoiceItemSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true },
    sku:       { type: String, trim: true, default: '' },
    unit:      { type: String, trim: true, default: 'pcs' },
    quantity:  { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, default: 0 },
  },
  { _id: true }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String, required: true, unique: true, trim: true, uppercase: true,
    },
    lpo:       { type: mongoose.Schema.Types.ObjectId, ref: 'LPO', required: true },
    lpoNumber: { type: String, trim: true, uppercase: true },

    // Financial fields — amountExVat is the subtotal (taxable + exempt portions)
    amountExVat:   { type: Number, required: true },
    amountInclVat: { type: Number, required: true },
    vatRate:       { type: Number, default: 16 },

    // Tax exemption support
    //   'taxable'  → all of amountExVat is subject to VAT
    //   'exempt'   → none of amountExVat is subject to VAT
    //   'mixed'    → part of amountExVat is exempt (exemptAmount is exempt portion)
    //   'override' → user entered a specific VAT amount (overrideTaxAmount)
    taxMode:            { type: String, enum: ['taxable', 'exempt', 'mixed', 'override'], default: 'taxable' },
    exemptAmount:       { type: Number, default: 0 },
    overrideTaxAmount:  { type: Number, default: 0 },

    // Batch grouping
    batchId: { type: String, default: null, index: true },

    // Disparity
    disparityAmount: { type: Number, default: null },
    disparityReason: { type: String, trim: true, default: '' },

    // Delivery
    deliveredBy: { type: String, trim: true, default: '' },

    // Legacy free-text returns (kept for backwards-compat; new data goes to adjustments)
    returns:          { type: String, trim: true, default: '' },
    returnsUpdatedAt: { type: Date, default: null },
    returnsUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Post-delivery adjustments — original amountInclVat stays immutable for audit
    adjustments:    { type: [adjustmentSchema], default: [] },
    adjustedAmount: { type: Number, default: null }, // = amountInclVat − Σ adjustments.amount

    // Optional line items
    items: { type: [invoiceItemSchema], default: [] },

    // Edit audit trail
    isEdited:  { type: Boolean, default: false },
    editedAt:  { type: Date, default: null },
    editedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editHistory: [
      {
        editedAt:      Date,
        editedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        fieldsChanged: [String],
        snapshot:      mongoose.Schema.Types.Mixed,
      },
    ],

    // Workflow status
    status: {
      type: String, enum: ['draft', 'submitted', 'approved', 'rejected'], default: 'draft',
    },
    submittedAt:     { type: Date, default: null },
    approvedAt:      { type: Date, default: null },
    rejectedAt:      { type: Date, default: null },
    rejectionReason: { type: String, default: '' },

    branch:        { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    branchNameRaw: { type: String, default: '' },

    date:      { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Compute adjustedAmount + item line totals before save
invoiceSchema.pre('save', function (next) {
  const adjTotal = (this.adjustments || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  this.adjustedAmount = Math.max(0, Number((this.amountInclVat || 0) - adjTotal).toFixed(2) * 1);
  (this.items || []).forEach((it) => {
    it.lineTotal = Number((Number(it.quantity || 0) * Number(it.unitPrice || 0)).toFixed(2));
  });
  next();
});

invoiceSchema.index({ lpo: 1 });
invoiceSchema.index({ date: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
