const mongoose = require('mongoose');
const { INTERVENTION_TYPES, INTERVENTION_STATUSES } = require('../config/constants');

const interventionSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    riskScoreAtCreation: { type: Number },
    riskCategoryAtCreation: { type: String },
    type: { type: String, enum: INTERVENTION_TYPES, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date },
    status: { type: String, enum: INTERVENTION_STATUSES, default: 'planned', index: true },
    notes: { type: String },
    outcome: { type: String },
    followUpDate: { type: Date },
    completedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Intervention', interventionSchema);
