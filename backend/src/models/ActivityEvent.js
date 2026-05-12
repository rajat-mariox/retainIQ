const mongoose = require('mongoose');

const ACTIVITY_EVENT_TYPES = ['keyboard', 'mouse', 'idle', 'active'];

const activityEventSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ActivitySession', required: true, index: true },
    type: { type: String, enum: ACTIVITY_EVENT_TYPES, required: true, index: true },
    count: { type: Number, default: 0, min: 0 },
    capturedAt: { type: Date, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activityEventSchema.index({ organizationId: 1, employeeId: 1, capturedAt: -1 });

module.exports = mongoose.model('ActivityEvent', activityEventSchema);
module.exports.ACTIVITY_EVENT_TYPES = ACTIVITY_EVENT_TYPES;
