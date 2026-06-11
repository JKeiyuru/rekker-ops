// server/models/PackagingTripStage.js

const mongoose = require('mongoose');

const delayLogSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['traffic', 'loading_delay', 'unloading_delay', 'vehicle_issue', 'rain', 'breakdown', 'customer_delay', 'other'],
  },
  notes:       { type: String, default: '' },
  loggedAt:    { type: Date, default: Date.now },
  loggedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  durationMin: { type: Number, default: 0 },
}, { _id: false });

const schema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'PackagingTripSession', required: true, index: true },

    fromLocation: { type: String, required: true },
    toLocation:   { type: String, required: true },

    stageType: {
      type: String,
      enum: ['checkout', 'transit', 'checkin', 'loading', 'delivery', 'end_day'],
      default: 'transit',
    },

    checkOutTime:      { type: Date, default: null },
    checkOutLocation:  { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
    checkOutGpsStatus: { type: String, enum: ['valid', 'mismatch', 'unavailable', null], default: null },

    checkInTime:      { type: Date, default: null },
    checkInLocation:  { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
    checkInGpsStatus: { type: String, enum: ['valid', 'mismatch', 'unavailable', null], default: null },

    status: { type: String, enum: ['in_transit', 'arrived', 'completed'], default: 'in_transit' },

    durationMinutes:   { type: Number, default: null },
    delays:            [delayLogSchema],
    totalDelayMinutes: { type: Number, default: 0 },
    proofPhotos:       [{ type: String }],

    loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes:    { type: String, default: '' },

    isOfflineEntry: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PackagingTripStage', schema);
