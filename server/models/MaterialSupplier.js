// server/models/MaterialSupplier.js

const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true, unique: true },
    contactName:  { type: String, default: '' },
    phone:        { type: String, default: '' },
    email:        { type: String, default: '' },
    location:     { type: String, default: '' },
    geo:          { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
    paymentTerms: { type: String, default: '' },
    notes:        { type: String, default: '' },
    isActive:     { type: Boolean, default: true },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MaterialSupplier', schema);
