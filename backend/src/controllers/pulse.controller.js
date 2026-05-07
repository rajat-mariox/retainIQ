const { z } = require('zod');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const PulseSurvey = require('../models/PulseSurvey');
const Employee = require('../models/Employee');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { ROLES } = require('../config/constants');

const submitSchema = z.object({
  moodScore: z.number().int().min(1).max(5),
  workloadScore: z.number().int().min(1).max(5),
  managerSupportScore: z.number().int().min(1).max(5),
  growthSatisfactionScore: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  isAnonymous: z.boolean().optional(),
  requestHRCallback: z.boolean().optional(),
});

exports.submit = asyncHandler(async (req, res) => {
  const data = submitSchema.parse(req.body);
  // EMPLOYEE submits for self; HR can submit on behalf for testing
  const emp = await Employee.findOne({ organizationId: req.organizationId, email: req.user.email });
  if (!emp) throw new HttpError(404, 'No employee record linked to this user');

  const doc = await PulseSurvey.create({
    ...data,
    organizationId: req.organizationId,
    employeeId: emp._id,
  });

  // If callback requested or low mood, notify HR
  const lowMood = data.moodScore <= 2 || data.workloadScore <= 2 || data.managerSupportScore <= 2;
  if (data.requestHRCallback || lowMood) {
    const hr = await User.find({
      organizationId: req.organizationId,
      role: { $in: [ROLES.HR_ADMIN, ROLES.ORG_ADMIN] },
      isActive: true,
    }).select('_id');
    const notifs = hr.map((u) => ({
      organizationId: req.organizationId,
      recipientUserId: u._id,
      type: data.requestHRCallback ? 'callback_requested' : 'feedback_needs_attention',
      title: data.requestHRCallback
        ? `HR callback requested${data.isAnonymous ? ' (anonymous)' : `: ${emp.name}`}`
        : `Pulse feedback needs attention${data.isAnonymous ? ' (anonymous)' : `: ${emp.name}`}`,
      message: `Mood ${data.moodScore}/5, Workload ${data.workloadScore}/5, Manager support ${data.managerSupportScore}/5.`,
      relatedEmployeeId: data.isAnonymous ? undefined : emp._id,
      severity: data.requestHRCallback ? 'critical' : 'warning',
    }));
    if (notifs.length) await Notification.insertMany(notifs);
  }

  res.status(201).json(doc);
});

exports.myHistory = asyncHandler(async (req, res) => {
  const emp = await Employee.findOne({ organizationId: req.organizationId, email: req.user.email });
  if (!emp) return res.json({ items: [] });
  const items = await PulseSurvey.find({ organizationId: req.organizationId, employeeId: emp._id })
    .sort({ createdAt: -1 })
    .limit(50);
  res.json({ items });
});

exports.dashboard = asyncHandler(async (req, res) => {
  const orgId = req.organizationId;
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const surveys = await PulseSurvey.find({ organizationId: orgId, createdAt: { $gte: since } });

  const avg = (k) => surveys.length ? +(surveys.reduce((s, p) => s + p[k], 0) / surveys.length).toFixed(2) : null;

  // Trend by month
  const monthly = {};
  surveys.forEach((s) => {
    const key = `${s.createdAt.getFullYear()}-${String(s.createdAt.getMonth() + 1).padStart(2, '0')}`;
    if (!monthly[key]) monthly[key] = { mood: 0, workload: 0, support: 0, growth: 0, n: 0 };
    monthly[key].mood += s.moodScore;
    monthly[key].workload += s.workloadScore;
    monthly[key].support += s.managerSupportScore;
    monthly[key].growth += s.growthSatisfactionScore;
    monthly[key].n += 1;
  });
  const trend = Object.entries(monthly)
    .sort()
    .map(([period, v]) => ({
      period,
      mood: +(v.mood / v.n).toFixed(2),
      workload: +(v.workload / v.n).toFixed(2),
      managerSupport: +(v.support / v.n).toFixed(2),
      growth: +(v.growth / v.n).toFixed(2),
    }));

  const needsAttention = await PulseSurvey.find({
    organizationId: orgId,
    $or: [{ requestHRCallback: true, callbackHandled: false }, { moodScore: { $lte: 2 } }],
  })
    .sort({ createdAt: -1 })
    .limit(20);

  res.json({
    averages: {
      mood: avg('moodScore'),
      workload: avg('workloadScore'),
      managerSupport: avg('managerSupportScore'),
      growth: avg('growthSatisfactionScore'),
      sampleSize: surveys.length,
    },
    monthlyTrend: trend,
    needsAttention,
  });
});
