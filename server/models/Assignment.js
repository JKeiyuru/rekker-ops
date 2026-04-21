// server/models/Assignment.js

const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
  {
    // Date this assignment is for (stored as YYYY-MM-DD string for easy lookup)
    date: {
      type: String,
      required: true,
    },
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
    // Expected arrival time (optional, for late detection)
    expectedCheckIn: {
      type: String, // e.g. "08:00"
      default: null,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// One merchandiser can be assigned to multiple branches per day
// but not the same branch twice
assignmentSchema.index({ date: 1, merchandiser: 1, branch: 1 }, { unique: true });
assignmentSchema.index({ date: 1, merchandiser: 1 });

module.exports = mongoose.model('Assignment', assignmentSchema);
