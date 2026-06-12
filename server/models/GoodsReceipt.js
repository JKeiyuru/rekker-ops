// server/models/GoodsReceipt.js
// Records incoming materials from a supplier. Side effects (handled in route):
// 1) bumps Material.currentStock
// 2) updates Material.currentUnitPrice (if changed) and writes MaterialPriceHistory
// 3) recomputes downstream product costs

const mongoose = require('mongoose');

const lineSchema = new mongoose.Schema({
  material:   { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
  qty:        { type: Number, required: true, min: 0 },
  unit:       { type: String, default: '' },           // snapshot
  unitPrice:  { type: Number, required: true, min: 0 }, // KES per unit at receipt
  lineTotal:  { type: Number, default: 0 },
  notes:      { type: String, default: '' },
}, { _id: false });

const schema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    supplier:      { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialSupplier', required: true, index: true },
    invoiceRef:    { type: String, default: '' },
    receivedAt:    { type: Date, default: Date.now },
    items:         { type: [lineSchema], default: [] },
    totalCost:     { type: Number, default: 0 },
    notes:         { type: String, default: '' },
    receivedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

schema.pre('save', function (next) {
  this.items.forEach((l) => { l.lineTotal = Number(l.qty || 0) * Number(l.unitPrice || 0); });
  this.totalCost = this.items.reduce((s, l) => s + l.lineTotal, 0);
  next();
});

module.exports = mongoose.model('GoodsReceipt', schema);
