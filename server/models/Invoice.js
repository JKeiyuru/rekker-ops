// server/models/Invoice.js

const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    lpo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LPO',
      required: true,
    },
    lpoNumber: { type: String, trim: true, uppercase: true },

    // Financial fields — amountExVat is the subtotal (taxable + exempt portions)
    amountExVat:     { type: Number, required: true },
    amountInclVat:   { type: Number, required: true },
    vatRate:         { type: Number, default: 16 },

    // Tax exemption support
    // taxMode:
    //   'taxable' → all of amountExVat is subject to VAT (exemptAmount = 0)
    //   'exempt'  → none of amountExVat is subject to VAT (exemptAmount = amountExVat)
    //   'mixed'   → part of amountExVat is exempt (exemptAmount is the exempt portion)
    taxMode:         { type: String, enum: ['taxable', 'exempt', 'mixed'], default: 'taxable' },
    exemptAmount:    { type: Number, default: 0 },

    // Batch grouping (invoices created together for one branch/day/delivery)
    batchId:         { type: String, default: null, index: true },

    // Disparity
    disparityAmount: { type: Number, default: null },
    disparityReason: { type: String, trim: true, default: '' },

    // Who physically delivered the goods (free text, optional)
    deliveredBy: { type: String, trim: true, default: '' },

    // Returns — can be updated any time, including post-approval
    returns:          { type: String, trim: true, default: '' },
    returnsUpdatedAt: { type: Date, default: null },
    returnsUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Edit audit trail
    isEdited:  { type: Boolean, default: false },
    editedAt:  { type: Date, default: null },
    editedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editHistory: [
      {
        editedAt:     Date,
        editedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        fieldsChanged: [String],
        snapshot:     mongoose.Schema.Types.Mixed, // values before the edit
      },
    ],

    // Workflow status
    status: {
      type: String,
      enum: ['draft', 'submitted', 'approved', 'rejected'],
      default: 'draft',
    },
    submittedAt:     { type: Date, default: null },
    approvedAt:      { type: Date, default: null },
    rejectedAt:      { type: Date, default: null },
    rejectionReason: { type: String, default: '' },

    // Branch (copied from LPO for fast display)
    branch:        { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    branchNameRaw: { type: String, default: '' },

    date: { type: Date, default: Date.now },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

invoiceSchema.index({ lpo: 1 });
invoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ date: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
