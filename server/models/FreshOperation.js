// server/models/FreshOperation.js
// One document per (date, channel). Represents the live state of that day's
// Fresh operation. Status is inferred automatically from lines.

const mongoose = require('mongoose');

const totalsSchema = new mongoose.Schema({
  orderedValue:       { type: Number, default: 0 },
  boughtValue:        { type: Number, default: 0 },
  deliveredValue:     { type: Number, default: 0 },
  rejectedValue:      { type: Number, default: 0 },
  buyingCost:         { type: Number, default: 0 },
  margin:             { type: Number, default: 0 },
  procurementSuccess: { type: Number, default: 0 }, // 0..1
  deliverySuccess:    { type: Number, default: 0 },
  linesTotal:         { type: Number, default: 0 },
  linesReconciled:    { type: Number, default: 0 },
  linesNeedingReason: { type: Number, default: 0 },
}, { _id: false });

const freshOperationSchema = new mongoose.Schema(
  {
    date:    { type: Date, required: true },   // day @ 00:00 local
    dateKey: { type: String, required: true },  // 'YYYY-MM-DD'
    channel: { type: String, enum: ['DC', 'STORES'], required: true },
    status:  {
      type: String,
      enum: ['order_received', 'sourcing_in_progress', 'delivery_in_progress', 'completed'],
      default: 'order_received',
    },
    totals: { type: totalsSchema, default: () => ({}) },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closedAt: { type: Date, default: null },
    manuallyClosed: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

freshOperationSchema.index({ dateKey: 1, channel: 1 }, { unique: true });
freshOperationSchema.index({ date: -1 });

module.exports = mongoose.model('FreshOperation', freshOperationSchema);
