// server/models/FreshProduct.js
// Canonical product master for Fresh module. Aliases let us map alternate
// spellings/whitespace variants seen in the Excel workbook back to one product.

const mongoose = require('mongoose');

const normalize = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

const freshProductSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true },
    nameKey:   { type: String, required: true, unique: true, index: true },
    category:  { type: String, trim: true, default: '' },
    aliases:   [{ type: String, trim: true }],
    aliasKeys: [{ type: String, index: true }],
    active:    { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

freshProductSchema.pre('save', function (next) {
  this.nameKey = normalize(this.name);
  this.aliasKeys = (this.aliases || []).map(normalize).filter(Boolean);
  next();
});

freshProductSchema.statics.normalize = normalize;

module.exports = mongoose.model('FreshProduct', freshProductSchema);
