// server/models/FreshCustomerLPO.js
// Customer-side LPOs — orders received from people who buy from us.
// Supports both Detailed mode (items) and Quick mode (no items, totalValue set directly).

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

    // QUICK mode — when no items are provided, the user enters the LPO total directly.
    quickAmount: { type: Number, default: null },

    date:         { type: Date, default: Date.now },
    deliveryDate: { type: Date, default: null },

    batchId: { type: String, default: null, index: true },

    totalValue: { type: Number, default: 0 }, // sum of lineTotal OR quickAmount
    netValue:   { type: Number, default: 0 }, // after returns (item-level + value-level)

    // Running total of value-only returns booked against this LPO.
    // Updated by /api/fresh-returns route. Used in netValue computation.
    valueReturnedTotal: { type: Number, default: 0 },

    // True once any item-level return is booked. Locks the LPO into items-mode.
    hasItemReturns:  { type: Boolean, default: false },
    // True once any value-only return is booked. Locks the LPO into value-mode.
    hasValueReturns: { type: Boolean, default: false },

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

  if (this.items && this.items.length > 0) {
    this.items.forEach((it) => {
      const lt = Number(it.quantity || 0) * Number(it.unitPrice || 0);
      it.lineTotal = lt;
      total += lt;
      returnedValue += Number(it.returnedQty || 0) * Number(it.unitPrice || 0);
    });
  } else if (this.quickAmount != null) {
    total = Number(this.quickAmount) || 0;
  }

  this.totalValue = total;
  const allReturns = returnedValue + Number(this.valueReturnedTotal || 0);
  this.netValue   = Math.max(0, total - allReturns);
  this.hasItemReturns = returnedValue > 0;

  if (['delivered', 'partially_returned', 'fully_returned'].includes(this.status)) {
    if (allReturns <= 0) this.status = 'delivered';
    else if (allReturns >= total) this.status = 'fully_returned';
    else this.status = 'partially_returned';
  }

  next();
});

freshCustomerLPOSchema.index({ date: -1 });
freshCustomerLPOSchema.index({ deliveryDate: -1 });
freshCustomerLPOSchema.index({ customer: 1, date: -1 });

module.exports = mongoose.model('FreshCustomerLPO', freshCustomerLPOSchema);
