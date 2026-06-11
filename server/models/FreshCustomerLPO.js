// server/models/FreshCustomerLPO.js
// Customer-side LPOs — orders received from people who buy from us.

const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  sku:         { type: String, trim: true, default: '' },
  unit:        { type: String, trim: true, default: 'pcs' },
  quantity:    { type: Number, required: true, min: 0 },
  unitPrice:   { type: Number, required: true, min: 0 },
  lineTotal:   { type: Number, default: 0 },
  returnedQty: { type: Number, default: 0 },
}, { _id: true });

itemSchema.pre('save', function (next) {
  this.lineTotal = Number(this.quantity || 0) * Number(this.unitPrice || 0);
  next();
});

const freshCustomerLPOSchema = new mongoose.Schema(
  {
    lpoNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },

    // Customer — either a Branch ref or free text
    customer:        { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    customerNameRaw: { type: String, trim: true, default: '' },

    // Delivery location
    deliveryLocation: { type: String, trim: true, default: '' },
    deliveryGeo:      { lat: { type: Number, default: null }, lng: { type: Number, default: null } },

    items: { type: [itemSchema], default: [] },

    date:         { type: Date, default: Date.now },
    deliveryDate: { type: Date, default: null },

    batchId: { type: String, default: null, index: true },

    totalValue: { type: Number, default: 0 }, // sum of lineTotal
    netValue:   { type: Number, default: 0 }, // after returns

    status: {
      type: String,
      enum: ['pending', 'delivered', 'partially_returned', 'fully_returned', 'closed', 'cancelled'],
      default: 'pending',
    },

    deliveredAt: { type: Date, default: null },
    closedAt:    { type: Date, default: null },

    notes:     { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

freshCustomerLPOSchema.pre('save', function (next) {
  let total = 0;
  let returnedValue = 0;
  this.items.forEach((it) => {
    const lt = Number(it.quantity || 0) * Number(it.unitPrice || 0);
    it.lineTotal = lt;
    total += lt;
    returnedValue += Number(it.returnedQty || 0) * Number(it.unitPrice || 0);
  });
  this.totalValue = total;
  this.netValue   = total - returnedValue;

  // Auto-status from returns (only if currently delivered/partially_returned)
  if (['delivered', 'partially_returned', 'fully_returned'].includes(this.status)) {
    if (returnedValue <= 0) this.status = 'delivered';
    else if (returnedValue >= total) this.status = 'fully_returned';
    else this.status = 'partially_returned';
  }

  next();
});

freshCustomerLPOSchema.index({ date: -1 });
freshCustomerLPOSchema.index({ customer: 1, date: -1 });

module.exports = mongoose.model('FreshCustomerLPO', freshCustomerLPOSchema);
