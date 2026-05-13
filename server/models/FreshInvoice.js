// server/models/FreshInvoice.js

const mongoose = require('mongoose');

const freshInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    lpo:           { type: mongoose.Schema.Types.ObjectId, ref: 'FreshLPO', required: true },
    lpoNumber:     { type: String, uppercase: true },

    invoiceAmount: { type: Number, required: true },
    lpoAmount:     { type: Number, required: true }, // snapshot from LPO at time of creation
    difference:    { type: Number, default: 0 },     // invoiceAmount - lpoAmount

    supplier:      { type: String, trim: true, default: '' },
    notes:         { type: String, trim: true, default: '' },

    // Is difference within acceptable threshold?
    thresholdAmount: { type: Number, default: 0 }, // configured or 0
    withinThreshold: { type: Boolean, default: true },

    status: {
      type: String,
      enum: ['draft', 'submitted', 'approved', 'rejected'],
      default: 'draft',
    },

    // Edit tracking
    isEdited:  { type: Boolean, default: false },
    editedAt:  { type: Date,    default: null },
    editedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    date:      { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

freshInvoiceSchema.index({ date: -1 });
freshInvoiceSchema.index({ lpo: 1 });

module.exports = mongoose.model('FreshInvoice', freshInvoiceSchema);
