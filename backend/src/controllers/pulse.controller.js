const { z } = require('zod');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const PulseSurvey = require('../models/PulseSurvey');
const PulseQuestion = require('../models/PulseQuestion');
const Employee = require('../models/Employee');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { ROLES } = require('../config/constants');

const extraAnswerInput = z.object({
  questionId: z.string(),
  value: z.number().int().min(1).max(5),
});

const submitSchema = z.object({
  moodScore: z.number().int().min(1).max(5),
  workloadScore: z.number().int().min(1).max(5),
  managerSupportScore: z.number().int().min(1).max(5),
  growthSatisfactionScore: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  isAnonymous: z.boolean().optional(),
  requestHRCallback: z.boolean().optional(),
  extraAnswers: z.array(extraAnswerInput).optional().default([]),
});

exports.submit = asyncHandler(async (req, res) => {
  const data = submitSchema.parse(req.body);
  // EMPLOYEE submits for self; HR can submit on behalf for testing
  const emp = await Employee.findOne({ organizationId: req.organizationId, email: req.user.email });
  if (!emp) throw new HttpError(404, 'No employee record linked to this user');

  // Resolve HR-defined extra questions and snapshot their label/type onto
  // the response so historical surveys stay readable even if a question is
  // later renamed or deactivated.
  let extraAnswers = [];
  if (data.extraAnswers.length) {
    const ids = [...new Set(data.extraAnswers.map((a) => a.questionId))];
    const questions = await PulseQuestion.find({
      _id: { $in: ids },
      organizationId: req.organizationId,
      isActive: true,
    });
    const qById = new Map(questions.map((q) => [String(q._id), q]));
    extraAnswers = data.extraAnswers
      .filter((a) => qById.has(a.questionId))
      .map((a) => {
        const q = qById.get(a.questionId);
        return { questionId: q._id, label: q.label, type: q.type, value: a.value };
      });
  }

  const doc = await PulseSurvey.create({
    ...data,
    extraAnswers,
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

  // Aggregate HR-defined extra questions. Use the question's current label
  // (so a renamed question shows its new wording); fall back to the snapshot
  // for questions that no longer exist.
  const activeQuestions = await PulseQuestion.find({ organizationId: orgId });
  const labelById = new Map(activeQuestions.map((q) => [String(q._id), q.label]));
  const extrasAgg = new Map();
  for (const s of surveys) {
    for (const a of s.extraAnswers || []) {
      const key = String(a.questionId);
      if (!extrasAgg.has(key)) {
        extrasAgg.set(key, {
          questionId: key,
          label: labelById.get(key) || a.label,
          type: a.type,
          sum: 0,
          n: 0,
        });
      }
      const bucket = extrasAgg.get(key);
      if (typeof a.value === 'number') {
        bucket.sum += a.value;
        bucket.n += 1;
      }
    }
  }
  const extras = [...extrasAgg.values()].map((b) => ({
    questionId: b.questionId,
    label: b.label,
    type: b.type,
    average: b.n ? +(b.sum / b.n).toFixed(2) : null,
    sampleSize: b.n,
  }));

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
    extras,
  });
});
