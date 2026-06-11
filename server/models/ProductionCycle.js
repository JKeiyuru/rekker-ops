// server/models/ProductionCycle.js

const mongoose = require('mongoose');

const bomSnapshotEntrySchema = new mongoose.Schema({
  materialName: String,
  qtyPerUnit:   Number,
  unit:         String,
  unitPrice:    Number,
  lineCost:     Number,
}, { _id: false });

const schema = new mongoose.Schema(
  {
    cycleNumber:   { type: String, required: true, unique: true, uppercase: true, trim: true },
    product:       { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    bomRevision:   { type: Number, default: null },

    startedAt:     { type: Date, default: Date.now },
    endedAt:       { type: Date, default: null },

    unitsProduced: { type: Number, default: 0, min: 0 },

    bomSnapshot: {
      entries:              { type: [bomSnapshotEntrySchema], default: [] },
      laborCostPerUnit:     { type: Number, default: 0 },
      packagingCostPerUnit: { type: Number, default: 0 },
      overheadCostPerUnit:  { type: Number, default: 0 },
      materialsCostPerUnit: { type: Number, default: 0 },
      totalUnitCost:        { type: Number, default: 0 },
    },

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
  const perUnit = Number(this.bomSnapshot?.totalUnitCost || 0);
  this.costPerUnit = perUnit;
  this.totalCost   = perUnit * Number(this.unitsProduced || 0);
  next();
});

module.exports = mongoose.model('ProductionCycle', schema);
