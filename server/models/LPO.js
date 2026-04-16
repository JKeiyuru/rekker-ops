// server/models/LPO.js

const mongoose = require('mongoose');

const lpoSchema = new mongoose.Schema(
  {
    lpoNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    branchNameRaw: {
      type: String,
      trim: true,
      default: '',
    },
    date: {
      type: Date,
      required: true,
      default: () => new Date().setHours(0, 0, 0, 0),
    },
    deliveryDate: {
      type: Date,
      required: true,
    },
    responsiblePerson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ResponsiblePerson',
      required: true,
    },
    batchId: {
      type: String,
      default: null,
      index: true,
    },
    issuedAt:    { type: Date, default: null },
    completedAt: { type: Date, default: null },
    checkedAt:   { type: Date, default: null },
    status: {
      type: String,
      enum: ['pending', 'issued', 'completed', 'checked'],
      default: 'pending',
    },
    errors: {
      type: [String],
      enum: ['none', 'wrong_item', 'wrong_quantity', 'wrong_barcode', 'missing_item'],
      default: ['none'],
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

lpoSchema.index({ date: -1 });
lpoSchema.index({ lpoNumber: 1 }, { unique: true });

module.exports = mongoose.model('LPO', lpoSchema);
