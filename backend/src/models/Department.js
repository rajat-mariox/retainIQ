const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    headUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

departmentSchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema);
