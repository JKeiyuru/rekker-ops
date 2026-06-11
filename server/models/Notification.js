// server/models/Notification.js
// Lightweight per-user in-app notifications.

const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type:   { type: String, required: true }, // cost_change, return_logged, ...
    title:  { type: String, required: true },
    body:   { type: String, default: '' },
    link:   { type: String, default: '' },
    severity: { type: String, enum: ['info', 'success', 'warning', 'critical'], default: 'info' },
    payload:  { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

schema.index({ user: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', schema);
