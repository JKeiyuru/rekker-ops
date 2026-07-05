// server/models/FreshUpload.js
// One document per Excel upload event, with the field-level diff that makes
// revert possible. Belongs to one operation (date + channel).

const mongoose = require('mongoose');

const changeSchema = new mongoose.Schema({
  line:        { type: mongoose.Schema.Types.ObjectId, ref: 'FreshLine' },
  branch:      { type: String },
  productName: { type: String },
  zone:        { type: String, enum: ['ordered', 'bought', 'delivered'] },
  field:       { type: String },
  before:      { type: mongoose.Schema.Types.Mixed, default: null },
  after:       { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const warningSchema = new mongoose.Schema({
  code:        { type: String },
  message:     { type: String },
  branch:      { type: String, default: '' },
  productName: { type: String, default: '' },
}, { _id: false });

const freshUploadSchema = new mongoose.Schema(
  {
    operation:   { type: mongoose.Schema.Types.ObjectId, ref: 'FreshOperation', required: true, index: true },
    date:        { type: Date, required: true },
    dateKey:     { type: String, required: true },
    channel:     { type: String, enum: ['DC', 'STORES'], required: true },
    sheetName:   { type: String, default: '' },
    filename:    { type: String, default: '' },
    uploadedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedByName: { type: String, default: '' },
    zonesTouched:   [{ type: String }],   // ['ordered','bought','delivered']
    linesCreated:   { type: Number, default: 0 },
    linesUpdated:   { type: Number, default: 0 },
    fieldsChanged:  { type: Number, default: 0 },
    warnings:       { type: [warningSchema], default: [] },
    changes:        { type: [changeSchema], default: [] },
    label:          { type: String, default: '' }, // "Order captured" | "Sourcing updated" | ...

    reverted:    { type: Boolean, default: false },
    revertedAt:  { type: Date, default: null },
    revertedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

freshUploadSchema.index({ operation: 1, createdAt: -1 });

module.exports = mongoose.model('FreshUpload', freshUploadSchema);
