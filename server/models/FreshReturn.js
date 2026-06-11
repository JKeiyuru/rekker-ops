// server/models/FreshReturn.js
// Per-item returns linked to one or many FreshCustomerLPOs.

const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema({
  lpo:       { type: mongoose.Schema.Types.ObjectId, ref: 'FreshCustomerLPO', required: true },
  itemId:    { type: mongoose.Schema.Types.ObjectId, required: true }, // _id of item subdoc
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

const freshReturnSchema = new mongoose.Schema(
  {
    returnNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    date:         { type: Date, default: Date.now },
    reason: {
      type: String,
      enum: ['damaged', 'wrong_item', 'wrong_quantity', 'expired', 'refused', 'short_dated', 'other'],
      default: 'other',
    },
    notes: { type: String, default: '' },

    // LPOs this return touches (denormalized for fast lookups)
    lpos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FreshCustomerLPO' }],

    items: { type: [returnItemSchema], default: [] },

    totalValue: { type: Number, default: 0 },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

freshReturnSchema.pre('save', function (next) {
  let total = 0;
  this.items.forEach((it) => {
    it.lineTotal = Number(it.qty || 0) * Number(it.unitPrice || 0);
    total += it.lineTotal;
  });
  this.totalValue = total;
  // Build lpos list from items
  const lpoSet = new Set(this.items.map((it) => String(it.lpo)));
  this.lpos = Array.from(lpoSet);
  next();
});

freshReturnSchema.index({ date: -1 });

module.exports = mongoose.model('FreshReturn', freshReturnSchema);
