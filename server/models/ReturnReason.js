// server/models/ReturnReason.js
// User-defined return reasons that supplement the built-in list.

const mongoose = require('mongoose');

const returnReasonSchema = new mongoose.Schema(
  {
    label:    { type: String, required: true, trim: true, unique: true },
    isActive: { type: Boolean, default: true },
    createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReturnReason', returnReasonSchema);
