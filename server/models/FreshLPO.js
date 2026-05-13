// server/models/FreshLPO.js

const mongoose = require('mongoose');

const freshLPOSchema = new mongoose.Schema(
  {
    lpoNumber:   { type: String, required: true, unique: true, trim: true, uppercase: true },
    amount:      { type: Number, required: true },
    destination: { type: String, enum: ['farm', 'market', 'dc', 'other'], required: true },
    supplier:    { type: String, trim: true, default: '' },
    notes:       { type: String, trim: true, default: '' },

    // Link to the trip session (optional — can be created independently)
    tripSession: { type: mongoose.Schema.Types.ObjectId, ref: 'TripSession', default: null },

    // Invoice (populated after invoice is created)
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'FreshInvoice', default: null },

    status: {
      type: String,
      enum: ['pending', 'invoiced', 'approved', 'rejected'],
      default: 'pending',
    },

    date:      { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

freshLPOSchema.index({ date: -1 });

module.exports = mongoose.model('FreshLPO', freshLPOSchema);
