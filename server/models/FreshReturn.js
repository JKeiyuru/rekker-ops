// server/models/FreshReturn.js
// Two modes:
//   - mode='items': itemized return; per-item qty applied to LPO.items.returnedQty
//   - mode='value': flat-value return; amount per LPO added to LPO.valueReturnedTotal

const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema({
  lpo:       { type: mongoose.Schema.Types.ObjectId, ref: 'FreshCustomerLPO', required: true },
  itemId:    { type: mongoose.Schema.Types.ObjectId, required: true },
  itemName:  { type: String, default: '' },
  qty:       { type: Number, required: true, min: 0 },
  unitPrice: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, default: 0 },
  notes:     { type: String, default: '' },
}, { _id: true });

returnItemSchema.pre('save', function (next) {
  this.lineTotal = Number(this.qty || 0) * Number(this.unitPrice || 0);
  next();
});

const valueLineSchema = new mongoose.Schema({
  lpo:    { type: mongoose.Schema.Types.ObjectId, ref: 'FreshCustomerLPO', required: true },
  amount: { type: Number, required: true, min: 0 },
  notes:  { type: String, default: '' },
}, { _id: true });

const freshReturnSchema = new mongoose.Schema(
  {
    returnNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    date:         { type: Date, default: Date.now },

    mode: { type: String, enum: ['items', 'value'], default: 'items' },

    // Reason can be a built-in code OR a free-text label (saved custom reason).
    reason:      { type: String, default: 'other' },
    reasonLabel: { type: String, default: '' }, // human-readable, always set

    notes: { type: String, default: '' },

    lpos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FreshCustomerLPO' }],

    items:      { type: [returnItemSchema], default: [] },
    valueLines: { type: [valueLineSchema],  default: [] },

    totalValue: { type: Number, default: 0 },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

freshReturnSchema.pre('save', function (next) {
  let total = 0;
  if (this.mode === 'items') {
    this.items.forEach((it) => {
      it.lineTotal = Number(it.qty || 0) * Number(it.unitPrice || 0);
      total += it.lineTotal;
    });
    this.lpos = Array.from(new Set(this.items.map((it) => String(it.lpo))));
  } else {
    this.valueLines.forEach((v) => { total += Number(v.amount || 0); });
    this.lpos = Array.from(new Set(this.valueLines.map((v) => String(v.lpo))));
  }
  this.totalValue = total;
  next();
});

freshReturnSchema.index({ date: -1 });

module.exports = mongoose.model('FreshReturn', freshReturnSchema);
