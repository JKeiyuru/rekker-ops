// server/models/PackagingTripSession.js
// Mirrors TripSession but for ordinary-goods deliveries (packaging side).

const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    date:    { type: String, required: true }, // YYYY-MM-DD
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    driver:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    helpers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // turnboys + merchandisers

    startLocation: { type: String, default: 'Go-Down' },

    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled', 'incomplete'],
      default: 'active',
    },

    dayStartTime: { type: Date, default: null },
    dayEndTime:   { type: Date, default: null },

    currentStage:    { type: mongoose.Schema.Types.ObjectId, ref: 'PackagingTripStage', default: null },
    currentLocation: { type: String, default: '' },

    // Linked deliveries (existing packaging LPOs)
    linkedLPOs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LPO' }],

    totalDurationMinutes: { type: Number, default: null },
    totalStages:          { type: Number, default: 0 },
    totalDelayMinutes:    { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes:     { type: String, default: '' },
  },
  { timestamps: true }
);

schema.index({ date: -1 });
schema.index({ vehicle: 1, date: -1 });
schema.index({ driver: 1, date: -1 });

module.exports = mongoose.model('PackagingTripSession', schema);
