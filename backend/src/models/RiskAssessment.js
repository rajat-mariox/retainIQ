const mongoose = require('mongoose');
const { RISK_CATEGORIES, TRENDS } = require('../config/constants');

const riskAssessmentSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },

    riskScore: { type: Number, required: true, min: 0, max: 100 },
    category: { type: String, enum: Object.values(RISK_CATEGORIES), required: true },
    confidence: { type: Number, min: 0, max: 1, default: 0.6 },
    trend: { type: String, enum: Object.values(TRENDS), default: TRENDS.STABLE },

    componentScores: {
      attendance: { type: Number, default: 0 },
      performance: { type: Number, default: 0 },
      engagement: { type: Number, default: 0 },
      hr: { type: Number, default: 0 },
      behavioral: { type: Number, default: 0 },
    },
    topFactors: [{ type: String }],
    recommendedAction: { type: String },
    aiExplanation: { type: String },
    aiTalkingPoints: [{ type: String }],

    engineVersion: { type: String, default: 'rule-v1' },
    computedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

riskAssessmentSchema.index({ organizationId: 1, employeeId: 1, computedAt: -1 });

module.exports = mongoose.model('RiskAssessment', riskAssessmentSchema);
