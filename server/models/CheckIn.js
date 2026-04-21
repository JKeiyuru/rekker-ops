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
      type: String, // YYYY-MM-DD — for quick daily grouping
      required: true,
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

    // Check-out data (filled later)
    checkOutTime: {
      type: Date,
      default: null,
    },
    checkOutLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    checkOutDistanceMeters: {
      type: Number,
      default: null,
    },
    checkOutStatus: {
      type: String,
      enum: ['VALID', 'MISMATCH', 'LOCATION_DISABLED', 'OFFLINE', null],
      default: null,
    },

    // Overall session status
    sessionStatus: {
      type: String,
      enum: ['ACTIVE', 'COMPLETE', 'INCOMPLETE', 'FLAGGED'],
      default: 'ACTIVE',
    },

    // Duration in minutes (computed on check-out)
    durationMinutes: {
      type: Number,
      default: null,
    },

    // Was this entry created while offline and synced later?
    isOfflineEntry: {
      type: Boolean,
      default: false,
    },

    // Basic device fingerprint for anti-cheating
    deviceInfo: {
      type: String,
      default: '',
    },

    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

sessionSchema.index({ merchandiser: 1, date: -1 });
sessionSchema.index({ branch: 1, date: -1 });
sessionSchema.index({ date: -1 });

module.exports = mongoose.model('CheckIn', sessionSchema);
