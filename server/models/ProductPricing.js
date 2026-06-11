// server/models/ProductPricing.js
// Admin-only sell prices. Stored as history; latest is active.

const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    product:           { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    vatRate:           { type: Number, default: 0.16 },
    unitPriceExclVAT:  { type: Number, required: true, min: 0 },
    unitPriceInclVAT:  { type: Number, default: 0 },
    cartonPriceExclVAT:{ type: Number, default: 0 },
    cartonPriceInclVAT:{ type: Number, default: 0 },
    piecesPerCartonSnapshot: { type: Number, default: 1 },
    unitCostAtPricing: { type: Number, default: 0 },
    marginPct:         { type: Number, default: 0 },
    effectiveFrom:     { type: Date, default: Date.now },
    notes:             { type: String, default: '' },
    setBy:             { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProductPricing', schema);
