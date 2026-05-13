// server/models/Vehicle.js

const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    regNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    description: { type: String, trim: true, default: '' }, // e.g. "Isuzu NPR - White"
    isActive:    { type: Boolean, default: true },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Vehicle', vehicleSchema);
