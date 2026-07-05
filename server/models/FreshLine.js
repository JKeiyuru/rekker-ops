// server/models/FreshLine.js
// One document per (date, channel, branch, product). Zone data lives inside
// three sub-objects; every write also records which upload sourced that field.

const mongoose = require('mongoose');

const orderedSchema = new mongoose.Schema({
  qty:        { type: Number, default: null },
  estBP:      { type: Number, default: null }, // estimated buying price
  spPrice:    { type: Number, default: null }, // selling price
  totalValue: { type: Number, default: null },
  updatedAt:  { type: Date,   default: null },
  source:     { type: mongoose.Schema.Types.ObjectId, ref: 'FreshUpload', default: null },
}, { _id: false });

const boughtSchema = new mongoose.Schema({
  qty:        { type: Number, default: null },
  marketBP:   { type: Number, default: null },
  totalValue: { type: Number, default: null },
  updatedAt:  { type: Date,   default: null },
  source:     { type: mongoose.Schema.Types.ObjectId, ref: 'FreshUpload', default: null },
}, { _id: false });

const deliveredSchema = new mongoose.Schema({
  qty:        { type: Number, default: null },
  totalValue: { type: Number, default: null },
  comments:   { type: String, default: '' },
  updatedAt:  { type: Date,   default: null },
  source:     { type: mongoose.Schema.Types.ObjectId, ref: 'FreshUpload', default: null },
}, { _id: false });

const freshLineSchema = new mongoose.Schema(
  {
    operation:   { type: mongoose.Schema.Types.ObjectId, ref: 'FreshOperation', required: true, index: true },
    date:        { type: Date, required: true },
    dateKey:     { type: String, required: true, index: true },
    channel:     { type: String, enum: ['DC', 'STORES'], required: true },
    branch:      { type: String, required: true, trim: true, uppercase: true },
    product:     { type: mongoose.Schema.Types.ObjectId, ref: 'FreshProduct', required: true },
    productName: { type: String, required: true }, // denormalized

    ordered:   { type: orderedSchema,   default: () => ({}) },
    bought:    { type: boughtSchema,    default: () => ({}) },
    delivered: { type: deliveredSchema, default: () => ({}) },

    // Derived
    rejectedValue: { type: Number, default: 0 },
    margin:        { type: Number, default: 0 },
    marginPct:     { type: Number, default: 0 },

    reasonNeeded: { type: Boolean, default: false },
    reasonCode:   { type: String, default: '' },
    reasonNote:   { type: String, default: '' },
    reasonSetBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reasonSetAt:  { type: Date, default: null },

    status: {
      type: String,
      enum: ['pending_bought', 'pending_delivery', 'reconciled'],
      default: 'pending_bought',
    },
  },
  { timestamps: true }
);

freshLineSchema.index({ dateKey: 1, channel: 1, branch: 1, product: 1 }, { unique: true });
freshLineSchema.index({ operation: 1, status: 1 });
freshLineSchema.index({ reasonNeeded: 1 });

module.exports = mongoose.model('FreshLine', freshLineSchema);
