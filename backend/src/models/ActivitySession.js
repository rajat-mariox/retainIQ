const mongoose = require('mongoose');

const ACTIVITY_SESSION_STATUSES = ['working', 'break', 'ended'];

const activitySessionSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true, index: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    totalMinutes: { type: Number, default: 0, min: 0 },
    activeMinutes: { type: Number, default: 0, min: 0 },
    idleMinutes: { type: Number, default: 0, min: 0 },
    breakMinutes: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ACTIVITY_SESSION_STATUSES, default: 'working', index: true },
    breakStartedAt: { type: Date },
  },
  { timestamps: true }
);

activitySessionSchema.index({ organizationId: 1, employeeId: 1, date: -1 });
activitySessionSchema.index({ organizationId: 1, employeeId: 1, status: 1 });

module.exports = mongoose.model('ActivitySession', activitySessionSchema);
module.exports.ACTIVITY_SESSION_STATUSES = ACTIVITY_SESSION_STATUSES;
