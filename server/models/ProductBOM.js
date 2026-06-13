// server/models/ProductBOM.js
// One Bill of Materials revision per product. Snapshots material prices at save time.
// Supports a batch basis (e.g. "200 L recipe produces 400 bottles of 500ml") so the
// PM can enter quantities in the way they actually weigh them, and the system stores
// per-unit equivalents for costing.

const mongoose = require('mongoose');

const bomEntrySchema = new mongoose.Schema({
  material:        { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
  qtyPerUnit:      { type: Number, required: true, min: 0 },
  qtyPerBatch:     { type: Number, default: 0 },           // optional, what the PM enters
  unit:            { type: String, default: '' },          // snapshot of material unit
  unitPriceAtSave: { type: Number, default: 0 },           // snapshot
  lineCost:        { type: Number, default: 0 },           // qtyPerUnit * unitPriceAtSave
  kind:            { type: String, enum: ['raw', 'packaging'], default: 'raw' },
}, { _id: false });

const schema = new mongoose.Schema(
  {
    product:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    revision:     { type: Number, default: 1 },
    isActive:     { type: Boolean, default: true },

    // Formula basis: e.g. "this recipe produces 200 L", which becomes
    // 400 sellable units for a 500ml product.
    formulaOutputQty:  { type: Number, default: 0 },
    formulaOutputUnit: { type: String, default: '' },
    outputVolumeLitres:{ type: Number, default: 0 },

    // Sellable-unit basis used for costing and stock deduction.
    batchOutputQty:  { type: Number, default: 1 },
    batchOutputUnit: { type: String, default: 'unit' },

    entries:      { type: [bomEntrySchema], default: [] },

    laborCostPerUnit:     { type: Number, default: 0 },
    packagingCostPerUnit: { type: Number, default: 0 }, // legacy / generic
    overheadCostPerUnit:  { type: Number, default: 0 },

    materialsCostPerUnit: { type: Number, default: 0 }, // raw
    packagingFromBOMPerUnit: { type: Number, default: 0 }, // computed from packaging entries
    totalUnitCost:        { type: Number, default: 0 },

    effectiveFrom: { type: Date, default: Date.now },
    notes:         { type: String, default: '' },
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

schema.pre('save', function (next) {
  let raw = 0, pack = 0;
  this.entries.forEach((e) => {
    e.lineCost = Number(e.qtyPerUnit || 0) * Number(e.unitPriceAtSave || 0);
    if (e.kind === 'packaging') pack += e.lineCost;
    else                        raw  += e.lineCost;
  });
  this.materialsCostPerUnit    = raw;
  this.packagingFromBOMPerUnit = pack;
  this.totalUnitCost = raw + pack
    + Number(this.laborCostPerUnit || 0)
    + Number(this.packagingCostPerUnit || 0)
    + Number(this.overheadCostPerUnit || 0);
  next();
});

module.exports = mongoose.model('ProductBOM', schema);
