// server/models/FreshReasonCode.js
// Fully management-configurable list of reason codes used on flagged lines.

const mongoose = require('mongoose');

const freshReasonCodeSchema = new mongoose.Schema(
  {
    code:     { type: String, required: true, unique: true, trim: true, uppercase: true },
    label:    { type: String, required: true, trim: true },
    active:   { type: Boolean, default: true },
    order:    { type: Number, default: 100 },
    createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FreshReasonCode', freshReasonCodeSchema);
