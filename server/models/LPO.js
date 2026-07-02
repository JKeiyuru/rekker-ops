// server/models/LPO.js

const mongoose = require('mongoose');

const lpoItemSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true },
    sku:       { type: String, trim: true, default: '' },
    unit:      { type: String, trim: true, default: 'pcs' },
    quantity:  { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, default: 0 },
  },
  { _id: true }
);

const lpoSchema = new mongoose.Schema(
  {
    lpoNumber: { type: String, required: true, trim: true, uppercase: true },
    branch:    { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    branchNameRaw: { type: String, trim: true, default: '' },

    // Optional customer free-text (for LPOs not tied to a saved branch)
    customer: { type: String, trim: true, default: '' },

    // LPO value in KES (before VAT)
    amount: { type: Number, default: null },

    date: {
      type: Date, required: true, default: () => new Date().setHours(0, 0, 0, 0),
    },
    deliveryDate: { type: Date, required: true },

    responsiblePerson: {
      type: mongoose.Schema.Types.ObjectId, ref: 'ResponsiblePerson', required: true,
    },

    batchId: { type: String, default: null, index: true },

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

    notes: { type: String, trim: true, default: '' },

    // Optional line items
    items: { type: [lpoItemSchema], default: [] },

    // Edit audit trail
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editHistory: [
      {
        editedAt:      Date,
        editedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        fieldsChanged: [String],
        snapshot:      mongoose.Schema.Types.Mixed,
      },
    ],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

lpoSchema.pre('save', function (next) {
  (this.items || []).forEach((it) => {
    it.lineTotal = Number((Number(it.quantity || 0) * Number(it.unitPrice || 0)).toFixed(2));
  });
  next();
});

lpoSchema.index({ date: -1 });
lpoSchema.index({ branch: 1, lpoNumber: 1 }, { unique: true });
lpoSchema.index({ lpoNumber: 1 });

module.exports = mongoose.model('LPO', lpoSchema);
