// server/models/Product.js

const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    sku:         { type: String, default: '', trim: true },
    category:    { type: String, default: '' },
    volume:      { type: String, default: '' },      // e.g. "500 ml"
    unitDescription: { type: String, default: '' },  // e.g. "bottle"
    piecesPerCarton: { type: Number, default: 1, min: 1 },
    vatRate:     { type: Number, default: 0.16 },    // 0.16 = 16%

    // Cached computed cost (per single unit)
    currentUnitCost: { type: Number, default: 0 },
    currentBOM:      { type: mongoose.Schema.Types.ObjectId, ref: 'ProductBOM', default: null },
    currentPricing:  { type: mongoose.Schema.Types.ObjectId, ref: 'ProductPricing', default: null },

    notes:     { type: String, default: '' },
    isActive:  { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

schema.index({ name: 1 });

module.exports = mongoose.model('Product', schema);
