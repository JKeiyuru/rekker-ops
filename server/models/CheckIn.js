// server/models/CheckIn.js
// Unified check-in session model.
// Key change: branch assignment is no longer required.
// `expectedCheckIn` and `lateByMinutes` are populated from an assignment
// IF one exists for this merchandiser+branch+date — otherwise left null.
// `notes` field captures "Unscheduled visit" for free-form check-ins.

const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  { _id: false }
);

const checkInSchema = new mongoose.Schema(
  {
    // ── Core relations ────────────────────────────────────────────────────────
    merchandiser: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    branch: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Branch',
      required: true,
      index:    true,
    },

    // ── Date (YYYY-MM-DD string — timezone-safe, easy to query/group) ─────────
    date: {
      type:     String,
      required: true,
      index:    true,
      match:    /^\d{4}-\d{2}-\d{2}$/,
    },

    // ── Optional assignment context ───────────────────────────────────────────
    // Populated when an Assignment document exists for this combo; null otherwise.
    expectedCheckIn: { type: String, default: null },    // "HH:MM" from assignment
    lateByMinutes:   { type: Number, default: null },    // negative = early

    // ── Check-in ─────────────────────────────────────────────────────────────
    checkInTime:           { type: Date,   required: true },
    checkInLocation:       { type: locationSchema, default: () => ({}) },
    checkInDistanceMeters: { type: Number, default: null },
    checkInStatus: {
      type:    String,
      enum:    ['VALID', 'MISMATCH', 'LOCATION_DISABLED', 'OFFLINE'],
      default: 'LOCATION_DISABLED',
    },

    // ── Check-out ─────────────────────────────────────────────────────────────
    checkOutTime:           { type: Date,   default: null },
    checkOutLocation:       { type: locationSchema, default: () => ({}) },
    checkOutDistanceMeters: { type: Number, default: null },
    checkOutStatus: {
      type:    String,
      enum:    ['VALID', 'MISMATCH', 'LOCATION_DISABLED', 'OFFLINE', null],
      default: null,
    },

    // ── Session ───────────────────────────────────────────────────────────────
    durationMinutes: { type: Number, default: null },
    sessionStatus: {
      type:    String,
      enum:    ['ACTIVE', 'COMPLETE', 'INCOMPLETE', 'FLAGGED'],
      default: 'ACTIVE',
    },

    // ── Metadata ──────────────────────────────────────────────────────────────
    isOfflineEntry: { type: Boolean, default: false },
    deviceInfo:     { type: String,  default: '' },

    // notes: free-text annotations.
    // Backend sets "Unscheduled visit" automatically when no assignment exists.
    // Admins/team leads can override to add context.
    notes: { type: String, default: '' },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Compound indexes ──────────────────────────────────────────────────────────
// Most common queries: by date, by merchandiser+date, by branch+date
checkInSchema.index({ date: 1, merchandiser: 1 });
checkInSchema.index({ date: 1, branch: 1 });
checkInSchema.index({ merchandiser: 1, date: -1 });
checkInSchema.index({ sessionStatus: 1, date: 1 });

// ── Virtual: hours worked ─────────────────────────────────────────────────────
checkInSchema.virtual('hoursWorked').get(function () {
  if (this.durationMinutes == null) return null;
  return +(this.durationMinutes / 60).toFixed(2);
});

// ── Virtual: isUnscheduled ────────────────────────────────────────────────────
checkInSchema.virtual('isUnscheduled').get(function () {
  return this.notes === 'Unscheduled visit';
});

// ── Pre-save: auto-compute duration when checkOutTime is set ──────────────────
checkInSchema.pre('save', function (next) {
  if (this.checkOutTime && this.checkInTime && this.durationMinutes == null) {
    this.durationMinutes = Math.round(
      (this.checkOutTime.getTime() - this.checkInTime.getTime()) / 60000
    );
  }
  next();
});

module.exports = mongoose.model('CheckIn', checkInSchema);