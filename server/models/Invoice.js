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
    // The LPO this invoice is linked to
    lpo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LPO',
      required: true,
    },
    // Duplicated for quick display without populate
    lpoNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },

    // Financial fields
    amountExVat: {
      type: Number,
      required: true,
    },
    amountInclVat: {
      type: Number,
      required: true,
    },
    // VAT rate used (for reference; default 16% Kenya standard)
    vatRate: {
      type: Number,
      default: 16,
    },

    // Disparity tracking
    // Difference = invoiceAmountExVat - lpo.amount
    // Positive = invoice higher than LPO, Negative = invoice lower
    disparityAmount: {
      type: Number,
      default: null,
    },
    disparityReason: {
      type: String,
      trim: true,
      default: '',
    },

    // Workflow status
    status: {
      type: String,
      enum: ['draft', 'submitted', 'approved', 'rejected'],
      default: 'draft',
    },
    submittedAt: { type: Date, default: null },
    approvedAt:  { type: Date, default: null },
    rejectedAt:  { type: Date, default: null },
    rejectionReason: { type: String, default: '' },

    // Branch (copied from LPO for fast display)
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    branchNameRaw: { type: String, default: '' },

    date: {
      type: Date,
      default: Date.now,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

invoiceSchema.index({ lpo: 1 });
invoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ date: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
