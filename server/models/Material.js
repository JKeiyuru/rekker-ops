// server/models/Material.js

const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    sku:      { type: String, default: '', trim: true },
    category: { type: String, default: 'chemical' }, // chemical, packaging, utility, consumable, other
    unit:     { type: String, required: true, default: 'kg' }, // kg, g, L, ml, pcs, m, ...

    currentSupplier:  { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialSupplier', default: null },
    currentUnitPrice: { type: Number, default: 0 },

    // Inventory
    currentStock: { type: Number, default: 0 },     // in `unit`
    minimumStock: { type: Number, default: 0 },     // reorder point
    reorderQty:   { type: Number, default: 0 },     // suggested purchase qty when below min

    notes:     { type: String, default: '' },
    isActive:  { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

schema.index({ name: 1 });
schema.index({ category: 1 });

module.exports = mongoose.model('Material', schema);
