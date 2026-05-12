const mongoose = require('mongoose');
const { ORGANIZATION_APPROVAL_STATUS } = require('../config/constants');

const settingsSchema = new mongoose.Schema(
  {
    showRiskScoreToEmployees: { type: Boolean, default: false },
    pulseSurveyFrequencyDays: { type: Number, default: 14 },
    riskWeights: {
      attendance: { type: Number, default: 0.20 },
      performance: { type: Number, default: 0.25 },
      engagement: { type: Number, default: 0.25 },
      hr: { type: Number, default: 0.20 },
      behavioral: { type: Number, default: 0.10 },
    },
    notificationPreferences: {
      criticalRiskAlert: { type: Boolean, default: true },
      interventionDue: { type: Boolean, default: true },
      callbackRequest: { type: Boolean, default: true },
      productivityAlerts: { type: Boolean, default: true },
    },
    dataRetentionDays: { type: Number, default: 730 },

    // Workforce Intelligence & Productivity Engine config
    productivity: {
      enabled: { type: Boolean, default: true },
      // Sub-score weights (must sum to 1.0)
      weights: {
        timeUtilization: { type: Number, default: 0.20 },
        taskCompletion: { type: Number, default: 0.30 },
        meetingEfficiency: { type: Number, default: 0.10 },
        engagement: { type: Number, default: 0.10 },
        consistency: { type: Number, default: 0.15 },
        focus: { type: Number, default: 0.15 },
      },
      // Burnout thresholds
      burnout: {
        maxHealthyDailyHours: { type: Number, default: 9 },
        consecutiveOverworkDays: { type: Number, default: 5 },
      },
      roiEnabled: { type: Boolean, default: false },
      gamificationEnabled: { type: Boolean, default: true },
      // Employee transparency: what's shown in the "what we track" panel
      transparencyEnabled: { type: Boolean, default: true },
    },

    // Desktop activity-agent timing config (read by the agent on login)
    agent: {
      screenshotIntervalMinutes: { type: Number, default: 10, min: 1, max: 240 },
      screenshotsEnabled: { type: Boolean, default: true },
    },
  },
  { _id: false }
);

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    domain: { type: String, lowercase: true, trim: true, index: true },
    industry: { type: String },
    size: { type: String },
    plan: { type: String, enum: ['trial', 'starter', 'growth', 'enterprise'], default: 'trial' },
    isActive: { type: Boolean, default: false },
    approvalStatus: {
      type: String,
      enum: Object.values(ORGANIZATION_APPROVAL_STATUS),
      default: ORGANIZATION_APPROVAL_STATUS.PENDING,
      index: true,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
    settings: { type: settingsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Organization', organizationSchema);
