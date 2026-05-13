// server/models/TripSession.js
// One session = one vehicle's workday.
// Contains all stage transitions, delays, and team members.

const mongoose = require('mongoose');

const tripSessionSchema = new mongoose.Schema(
  {
    date:   { type: String, required: true }, // YYYY-MM-DD
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    driver:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    helpers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Starting location (always go-down / warehouse to begin)
    startLocation: { type: String, default: 'Go-Down' },

    // Session status
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
    },

    // When the day started and ended
    dayStartTime: { type: Date, default: null },
    dayEndTime:   { type: Date, default: null },

    // Current stage pointer — which TripStage is the active one
    currentStage: { type: mongoose.Schema.Types.ObjectId, ref: 'TripStage', default: null },
    currentLocation: { type: String, default: '' },

    // Summary stats (computed on completion)
    totalDurationMinutes: { type: Number, default: null },
    totalStages:          { type: Number, default: 0 },
    totalDelayMinutes:    { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes:     { type: String, default: '' },
  },
  { timestamps: true }
);

tripSessionSchema.index({ date: -1 });
tripSessionSchema.index({ vehicle: 1, date: -1 });
tripSessionSchema.index({ driver: 1, date: -1 });

module.exports = mongoose.model('TripSession', tripSessionSchema);
