// server/models/BuyerStatus.js

const mongoose = require('mongoose');

const buyerStatusSchema = new mongoose.Schema(
  {
    date: {
      type: String, // stored as 'YYYY-MM-DD' for easy day-level keying
      required: true,
      unique: true,
    },
    dispatchedAt: {
      type: Date,
      default: null,
    },
    returnedAt: {
      type: Date,
      default: null,
    },
    dispatchedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    returnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BuyerStatus', buyerStatusSchema);
