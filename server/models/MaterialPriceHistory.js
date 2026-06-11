// server/models/MaterialPriceHistory.js

const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    material:      { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true, index: true },
    supplier:      { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialSupplier', default: null },
    unitPrice:     { type: Number, required: true },
    previousPrice: { type: Number, default: null },
    deltaPct:      { type: Number, default: 0 },
    effectiveFrom: { type: Date, default: Date.now },
    reason:        { type: String, default: '' },
    changedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

schema.index({ material: 1, effectiveFrom: -1 });

module.exports = mongoose.model('MaterialPriceHistory', schema);
