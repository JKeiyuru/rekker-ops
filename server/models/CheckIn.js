// server/models/CheckIn.js

const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    merchandiser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
    },

    // Expected check-in time copied from the assignment (for late calculation)
    expectedCheckIn: {
      type: String, // e.g. "08:00"
      default: null,
    },
    // Late difference in minutes (positive = late, negative = early)
    lateByMinutes: {
      type: Number,
      default: null,
    },

    // Check-in data
    checkInTime: {
      type: Date,
      required: true,
    },
    checkInLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    checkInDistanceMeters: {
      type: Number,
      default: null,
    },
    checkInStatus: {
      type: String,
      enum: ['VALID', 'MISMATCH', 'LOCATION_DISABLED', 'OFFLINE'],
      default: 'VALID',
    },

    // Check-out data
    checkOutTime:  { type: Date, default: null },
    checkOutLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    checkOutDistanceMeters: { type: Number, default: null },
    checkOutStatus: {
      type: String,
      enum: ['VALID', 'MISMATCH', 'LOCATION_DISABLED', 'OFFLINE', null],
      default: null,
    },

    sessionStatus: {
      type: String,
      enum: ['ACTIVE', 'COMPLETE', 'INCOMPLETE', 'FLAGGED'],
      default: 'ACTIVE',
    },

    durationMinutes: { type: Number, default: null },
    isOfflineEntry:  { type: Boolean, default: false },

    deviceInfo: { type: String, default: '' },
    notes:      { type: String, default: '' },
  },
  { timestamps: true }
);

sessionSchema.index({ merchandiser: 1, date: -1 });
sessionSchema.index({ branch: 1, date: -1 });
sessionSchema.index({ date: -1 });

module.exports = mongoose.model('CheckIn', sessionSchema);
