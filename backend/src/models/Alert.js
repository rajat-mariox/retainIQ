const mongoose = require('mongoose');

const ALERT_TYPES = [
  'productivity_drop',
  'burnout_risk',
  'overwork',
  'high_idle',
  'low_focus',
  'meeting_overload',
  'high_performer',
  'consistency_streak',
];

const alertSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    type: { type: String, enum: ALERT_TYPES, required: true, index: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    metric: { type: mongoose.Schema.Types.Mixed }, // optional: { value, threshold, ... }
    acknowledged: { type: Boolean, default: false },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: { type: Date },
    triggeredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Alert', alertSchema);
module.exports.ALERT_TYPES = ALERT_TYPES;
