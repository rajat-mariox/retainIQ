const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    scope: { type: String, enum: ['employee', 'team', 'company'], required: true, index: true },
    period: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true, index: true },

    // For employee scope:
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
    // For team scope:
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },

    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    // Snapshot metrics — shape varies by period, kept as Mixed for flexibility
    metrics: { type: mongoose.Schema.Types.Mixed, required: true },

    // AI-generated narrative summary
    summary: { type: String },
    strengths: [{ type: String }],
    weaknesses: [{ type: String }],
    recommendations: [{ type: String }],

    aiSource: { type: String, enum: ['static', 'openai'], default: 'static' },
  },
  { timestamps: true }
);

reportSchema.index({ organizationId: 1, scope: 1, period: 1, periodEnd: -1 });
reportSchema.index({ organizationId: 1, employeeId: 1, period: 1, periodEnd: -1 });

module.exports = mongoose.model('Report', reportSchema);
