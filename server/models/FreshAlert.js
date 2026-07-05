// server/models/FreshAlert.js
// Log of intelligent alerts fired by the Fresh module.

const mongoose = require('mongoose');

const freshAlertSchema = new mongoose.Schema(
  {
    type:        { type: String, required: true }, // high_rejection | negative_margin | procurement | delivery | trend
    severity:    { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
    message:     { type: String, required: true },
    date:        { type: Date, default: Date.now },
    dateKey:     { type: String, default: '' },
    channel:     { type: String, enum: ['DC', 'STORES', 'BOTH'], default: 'BOTH' },
    productName: { type: String, default: '' },
    branch:      { type: String, default: '' },
    metric:      { type: Number, default: 0 },
    baseline:    { type: Number, default: 0 },
    resolved:    { type: Boolean, default: false },
    resolvedAt:  { type: Date, default: null },
    resolvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dedupeKey:   { type: String, index: true },
  },
  { timestamps: true }
);

freshAlertSchema.index({ resolved: 1, createdAt: -1 });

module.exports = mongoose.model('FreshAlert', freshAlertSchema);
