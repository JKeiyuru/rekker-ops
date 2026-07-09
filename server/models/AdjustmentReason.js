// server/models/AdjustmentReason.js
// User-managed reasons for invoice adjustments (returns, not delivered, etc.).

const mongoose = require('mongoose');

const adjustmentReasonSchema = new mongoose.Schema(
  {
    label:     { type: String, required: true, trim: true, unique: true },
    // Optional grouping tag (e.g. "returned_goods" | "not_delivered" | "control_list" | "other")
    category:  { type: String, trim: true, default: 'other' },
    active:    { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdjustmentReason', adjustmentReasonSchema);
