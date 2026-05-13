// server/models/TripStage.js
// One stage = one leg of the route (e.g. Go-Down → Market, Market → Farm).

const mongoose = require('mongoose');

const delayLogSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['traffic', 'supplier_delay', 'loading_delay', 'vehicle_issue', 'rain', 'breakdown', 'waiting_approval', 'other'],
  },
  notes:       { type: String, default: '' },
  loggedAt:    { type: Date, default: Date.now },
  loggedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  durationMin: { type: Number, default: 0 },
}, { _id: false });

const tripStageSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'TripSession', required: true, index: true },

    // Route leg
    fromLocation: { type: String, required: true }, // e.g. "Go-Down"
    toLocation:   { type: String, required: true }, // e.g. "Market"

    // Stage type for analytics grouping
    stageType: {
      type: String,
      enum: ['checkout', 'transit', 'checkin', 'loading', 'delivery', 'end_day'],
      default: 'transit',
    },

    // Check-out from origin
    checkOutTime:     { type: Date, default: null },
    checkOutLocation: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
    checkOutGpsStatus: {
      type: String,
      enum: ['valid', 'mismatch', 'unavailable', null],
      default: null,
    },

    // Check-in at destination
    checkInTime:     { type: Date, default: null },
    checkInLocation: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
    checkInGpsStatus: {
      type: String,
      enum: ['valid', 'mismatch', 'unavailable', null],
      default: null,
    },

    // Stage complete?
    status: {
      type: String,
      enum: ['in_transit', 'arrived', 'completed'],
      default: 'in_transit',
    },

    // Duration in minutes (computed on check-in)
    durationMinutes: { type: Number, default: null },

    // Delay logs for this stage
    delays: [delayLogSchema],
    totalDelayMinutes: { type: Number, default: 0 },

    // Photo proof (URLs — uploaded separately)
    proofPhotos: [{ type: String }],

    loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes:    { type: String, default: '' },

    // Offline entry flag
    isOfflineEntry: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TripStage', tripStageSchema);
