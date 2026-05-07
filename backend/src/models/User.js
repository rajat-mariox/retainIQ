const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: function () { return this.role !== ROLES.SUPER_ADMIN; },
      index: true,
    },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: Object.values(ROLES), required: true, index: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.statics.hashPassword = async function (plain) {
  return bcrypt.hash(plain, 10);
};
userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};
userSchema.methods.toSafeJSON = function () {
  const o = this.toObject();
  delete o.passwordHash;
  return o;
};

module.exports = mongoose.model('User', userSchema);
