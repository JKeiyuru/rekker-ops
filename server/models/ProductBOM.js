// server/models/ProductBOM.js
// One Bill of Materials revision per product.

const mongoose = require('mongoose');

const bomEntrySchema = new mongoose.Schema({
  material:    { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
  qtyPerUnit:  { type: Number, required: true, min: 0 },
  unit:        { type: String, default: '' },           // snapshot of material unit
  unitPriceAtSave: { type: Number, default: 0 },        // snapshot
  lineCost:    { type: Number, default: 0 },            // qtyPerUnit * unitPriceAtSave
}, { _id: false });

const schema = new mongoose.Schema(
  {
    product:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    revision:     { type: Number, default: 1 },
    entries:      { type: [bomEntrySchema], default: [] },

    laborCostPerUnit:     { type: Number, default: 0 },
    packagingCostPerUnit: { type: Number, default: 0 },
    overheadCostPerUnit:  { type: Number, default: 0 },

    materialsCostPerUnit: { type: Number, default: 0 },
    totalUnitCost:        { type: Number, default: 0 },

    effectiveFrom: { type: Date, default: Date.now },
    notes:         { type: String, default: '' },
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

schema.pre('save', function (next) {
  let mat = 0;
  this.entries.forEach((e) => {
    e.lineCost = Number(e.qtyPerUnit || 0) * Number(e.unitPriceAtSave || 0);
    mat += e.lineCost;
  });
  this.materialsCostPerUnit = mat;
  this.totalUnitCost = mat
    + Number(this.laborCostPerUnit || 0)
    + Number(this.packagingCostPerUnit || 0)
    + Number(this.overheadCostPerUnit || 0);
  next();
});

module.exports = mongoose.model('ProductBOM', schema);
