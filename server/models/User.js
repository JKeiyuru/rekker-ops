// server/models/User.js

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    fullName: { type: String, required: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: {
      type: String,
      enum: [
        'super_admin',
        'admin',
        // Packaging
        'packaging_team_lead',
        // Merchandising
        'merchandising_team_lead',
        'merchandiser',
        // Fresh Produce
        'fresh_team_lead',
        'driver',
        'turnboy',
        'farm_sourcing',
        'market_sourcing',
        // Legacy / cross-module
        'team_lead',
        'viewer',
      ],
      default: 'viewer',
    },
    isActive:  { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
