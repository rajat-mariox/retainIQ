const { z } = require('zod');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const Organization = require('../models/Organization');

const settingsSchema = z.object({
  showRiskScoreToEmployees: z.boolean().optional(),
  pulseSurveyFrequencyDays: z.number().int().min(1).max(180).optional(),
  riskWeights: z.object({
    attendance: z.number().min(0).max(1),
    performance: z.number().min(0).max(1),
    engagement: z.number().min(0).max(1),
    hr: z.number().min(0).max(1),
    behavioral: z.number().min(0).max(1),
  }).refine(
    (w) => Math.abs(w.attendance + w.performance + w.engagement + w.hr + w.behavioral - 1) < 0.01,
    { message: 'Weights must sum to 1.0' }
  ).optional(),
  notificationPreferences: z.object({
    criticalRiskAlert: z.boolean().optional(),
    interventionDue: z.boolean().optional(),
    callbackRequest: z.boolean().optional(),
    productivityAlerts: z.boolean().optional(),
  }).optional(),
  dataRetentionDays: z.number().int().min(30).max(3650).optional(),
  productivity: z.object({
    enabled: z.boolean().optional(),
    weights: z.object({
      timeUtilization: z.number().min(0).max(1),
      taskCompletion: z.number().min(0).max(1),
      meetingEfficiency: z.number().min(0).max(1),
      engagement: z.number().min(0).max(1),
      consistency: z.number().min(0).max(1),
      focus: z.number().min(0).max(1),
    }).refine(
      (w) => Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 0.01,
      { message: 'Productivity weights must sum to 1.0' }
    ).optional(),
    burnout: z.object({
      maxHealthyDailyHours: z.number().min(1).max(24),
      consecutiveOverworkDays: z.number().min(1).max(30),
    }).optional(),
    roiEnabled: z.boolean().optional(),
    gamificationEnabled: z.boolean().optional(),
    transparencyEnabled: z.boolean().optional(),
  }).optional(),
});

exports.get = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.organizationId);
  if (!org) throw new HttpError(404, 'Organization not found');
  res.json({ settings: org.settings, organization: { name: org.name, plan: org.plan } });
});

exports.update = asyncHandler(async (req, res) => {
  const data = settingsSchema.parse(req.body);
  const org = await Organization.findById(req.organizationId);
  if (!org) throw new HttpError(404, 'Organization not found');
  org.settings = { ...org.settings.toObject?.() || org.settings, ...data };
  await org.save();
  res.json({ settings: org.settings });
});
