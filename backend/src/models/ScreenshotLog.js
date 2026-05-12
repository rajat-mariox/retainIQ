const mongoose = require('mongoose');

const screenshotLogSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ActivitySession', required: true, index: true },
    imageUrl: { type: String, required: true },
    activeApp: { type: String },
    capturedAt: { type: Date, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

screenshotLogSchema.index({ organizationId: 1, employeeId: 1, capturedAt: -1 });

module.exports = mongoose.model('ScreenshotLog', screenshotLogSchema);
