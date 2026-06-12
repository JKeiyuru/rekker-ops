// server/models/ProductionCycle.js
// A production run: snapshots BOM at start, auto-deducts stock, records actual yield,
// QC checks, and per-cycle overheads (labor, water, electricity, fuel, etc.).

const mongoose = require('mongoose');

const bomSnapshotEntrySchema = new mongoose.Schema({
  material:     { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
  materialName: String,
  qtyPerUnit:   Number,
  qtyConsumed:  Number,   // qtyPerUnit * expectedUnits (set on start)
  qtyActual:    Number,   // editable on completion if waste differs
  unit:         String,
  unitPrice:    Number,
  lineCost:     Number,   // per-unit
  kind:         { type: String, enum: ['raw', 'packaging'], default: 'raw' },
}, { _id: false });

const overheadSchema = new mongoose.Schema({
  type:   { type: String, default: 'other' }, // labor, water, electricity, transport, fuel, maintenance, other
  label:  { type: String, default: '' },
  amount: { type: Number, default: 0 },       // KES total for this cycle
}, { _id: false });

const qcCheckSchema = new mongoose.Schema({
  test:    { type: String, required: true },  // viscosity, pH, color, smell, packaging…
  result:  { type: String, default: '' },
  passed:  { type: Boolean, default: true },
  notes:   { type: String, default: '' },
  checkedAt: { type: Date, default: Date.now },
  checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: false });

const schema = new mongoose.Schema(
  {
    cycleNumber:   { type: String, required: true, unique: true, uppercase: true, trim: true },
    batchNumber:   { type: String, default: '', uppercase: true, trim: true, index: true },
    product:       { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    bomRevision:   { type: Number, default: null },
    bom:           { type: mongoose.Schema.Types.ObjectId, ref: 'ProductBOM', default: null },

    startedAt:     { type: Date, default: Date.now },
    endedAt:       { type: Date, default: null },

    expectedUnits: { type: Number, default: 0, min: 0 },
    unitsProduced: { type: Number, default: 0, min: 0 },
    yieldLossUnits:{ type: Number, default: 0 },
    yieldLossPct:  { type: Number, default: 0 },

    bomSnapshot: {
      entries:                 { type: [bomSnapshotEntrySchema], default: [] },
      laborCostPerUnit:        { type: Number, default: 0 },
      packagingCostPerUnit:    { type: Number, default: 0 },
      overheadCostPerUnit:     { type: Number, default: 0 },
      materialsCostPerUnit:    { type: Number, default: 0 },
      packagingFromBOMPerUnit: { type: Number, default: 0 },
      totalUnitCost:           { type: Number, default: 0 },
    },

    overheads:    { type: [overheadSchema], default: [] },
    qcChecks:     { type: [qcCheckSchema], default: [] },

    // Final cost roll-up (computed in pre-save)
    materialsCostActual: { type: Number, default: 0 },
    packagingCostActual: { type: Number, default: 0 },
    overheadsTotal:      { type: Number, default: 0 },
    totalCost:    { type: Number, default: 0 },
    costPerUnit:  { type: Number, default: 0 },

    status:    { type: String, enum: ['running', 'completed', 'cancelled'], default: 'running' },
    notes:     { type: String, default: '' },
    runBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

schema.pre('save', function (next) {
  // actual material cost from snapshot entries
  let raw = 0, pack = 0;
  (this.bomSnapshot?.entries || []).forEach((e) => {
    const qty = Number(e.qtyActual != null ? e.qtyActual : (e.qtyConsumed || 0));
    const lineTotal = qty * Number(e.unitPrice || 0);
    if (e.kind === 'packaging') pack += lineTotal;
    else                        raw  += lineTotal;
  });
  this.materialsCostActual = raw;
  this.packagingCostActual = pack;
  this.overheadsTotal = (this.overheads || []).reduce((s, o) => s + Number(o.amount || 0), 0);

  // legacy BOM extras (per-unit × units)
  const units = Number(this.unitsProduced || this.expectedUnits || 0);
  const bomLaborTotal     = Number(this.bomSnapshot?.laborCostPerUnit     || 0) * units;
  const bomPackagingTotal = Number(this.bomSnapshot?.packagingCostPerUnit || 0) * units;
  const bomOverheadTotal  = Number(this.bomSnapshot?.overheadCostPerUnit  || 0) * units;

  this.totalCost = raw + pack + bomLaborTotal + bomPackagingTotal + bomOverheadTotal + this.overheadsTotal;
  this.costPerUnit = units > 0 ? this.totalCost / units : 0;

  if (this.expectedUnits > 0) {
    this.yieldLossUnits = Math.max(0, this.expectedUnits - this.unitsProduced);
    this.yieldLossPct   = (this.yieldLossUnits / this.expectedUnits) * 100;
  }
  next();
});

module.exports = mongoose.model('ProductionCycle', schema);
