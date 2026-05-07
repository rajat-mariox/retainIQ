const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const Employee = require('../models/Employee');
const Signal = require('../models/Signal');
const PulseSurvey = require('../models/PulseSurvey');
const RiskAssessment = require('../models/RiskAssessment');
const Department = require('../models/Department');
const Organization = require('../models/Organization');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { calculateRisk } = require('../services/riskScoringService');
const aiService = require('../services/aiRecommendationService');
const { RISK_CATEGORIES, ROLES } = require('../config/constants');

async function computeForEmployee(orgId, employeeId, options = {}) {
  const employee = await Employee.findOne({ _id: employeeId, organizationId: orgId })
    .populate('departmentId', 'name');
  if (!employee) throw new HttpError(404, 'Employee not found');

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const [signals, pulses, priorAssessments, org] = await Promise.all([
    Signal.find({ organizationId: orgId, employeeId, periodEnd: { $gte: ninetyDaysAgo } }),
    PulseSurvey.find({ organizationId: orgId, employeeId }).sort({ createdAt: -1 }).limit(5),
    RiskAssessment.find({ organizationId: orgId, employeeId }).sort({ computedAt: -1 }).limit(3),
    Organization.findById(orgId),
  ]);

  const weights = org?.settings?.riskWeights;
  const result = calculateRisk({
    employee,
    signals,
    pulses,
    priorAssessments,
    weights,
  });

  let aiPart = { explanation: null, talkingPoints: [] };
  if (options.withAI) {
    const empForAI = { ...employee.toObject(), departmentName: employee.departmentId?.name };
    aiPart = await aiService.generate({ assessment: result, employee: empForAI, recentPulses: pulses });
  }

  // Persist
  const assessmentDoc = await RiskAssessment.create({
    organizationId: orgId,
    employeeId,
    riskScore: result.riskScore,
    category: result.category,
    confidence: result.confidence,
    trend: result.trend,
    componentScores: result.componentScores,
    topFactors: result.topFactors,
    recommendedAction: aiPart.suggestedManagerAction || result.recommendedAction,
    aiExplanation: aiPart.explanation,
    aiTalkingPoints: aiPart.talkingPoints || [],
    engineVersion: result.engineVersion,
  });

  // Update cached fields on Employee
  employee.currentRiskScore = result.riskScore;
  employee.currentRiskCategory = result.category;
  employee.currentRiskTrend = result.trend;
  employee.currentRiskUpdatedAt = new Date();
  await employee.save();

  // Fire notifications on critical / worsened
  if (result.category === RISK_CATEGORIES.CRITICAL ||
      (result.category === RISK_CATEGORIES.HIGH && result.trend === 'Worsening')) {
    const recipients = await User.find({
      organizationId: orgId,
      role: { $in: [ROLES.ORG_ADMIN, ROLES.HR_ADMIN] },
      isActive: true,
    }).select('_id');
    const notifs = recipients.map((u) => ({
      organizationId: orgId,
      recipientUserId: u._id,
      type: result.category === RISK_CATEGORIES.CRITICAL ? 'critical_risk' : 'risk_worsened',
      title: result.category === RISK_CATEGORIES.CRITICAL
        ? `Critical retention risk: ${employee.name}`
        : `Risk worsening: ${employee.name}`,
      message: `${employee.designation || 'Employee'} now scored ${result.riskScore} (${result.category}).`,
      relatedEmployeeId: employee._id,
      severity: result.category === RISK_CATEGORIES.CRITICAL ? 'critical' : 'warning',
    }));
    if (notifs.length) await Notification.insertMany(notifs);
  }

  return { assessment: assessmentDoc, ai: aiPart };
}

exports.calculateOne = asyncHandler(async (req, res) => {
  const out = await computeForEmployee(req.organizationId, req.params.employeeId, { withAI: true });
  res.json(out);
});

exports.calculateAll = asyncHandler(async (req, res) => {
  const employees = await Employee.find({
    organizationId: req.organizationId,
    status: 'active',
  }).select('_id');

  let processed = 0;
  for (const e of employees) {
    try {
      await computeForEmployee(req.organizationId, e._id, { withAI: false });
      processed += 1;
    } catch (err) {
      console.warn('[risk] failed for employee', e._id, err.message);
    }
  }
  res.json({ processed, total: employees.length });
});

exports.latest = asyncHandler(async (req, res) => {
  const assessment = await RiskAssessment.findOne({
    organizationId: req.organizationId,
    employeeId: req.params.employeeId,
  }).sort({ computedAt: -1 });
  if (!assessment) return res.json(null);
  const history = await RiskAssessment.find({
    organizationId: req.organizationId,
    employeeId: req.params.employeeId,
  })
    .sort({ computedAt: -1 })
    .limit(12)
    .select('riskScore category trend computedAt');
  res.json({ assessment, history });
});

exports.dashboard = asyncHandler(async (req, res) => {
  const orgId = req.organizationId;

  const [totalEmployees, byCategory, deptBreakdown, recentTrend, deptDocs] = await Promise.all([
    Employee.countDocuments({ organizationId: orgId, status: 'active' }),
    Employee.aggregate([
      { $match: { organizationId: toOid(orgId), status: 'active' } },
      { $group: { _id: '$currentRiskCategory', count: { $sum: 1 } } },
    ]),
    Employee.aggregate([
      { $match: { organizationId: toOid(orgId), status: 'active' } },
      { $group: {
          _id: '$departmentId',
          avgScore: { $avg: '$currentRiskScore' },
          high: { $sum: { $cond: [{ $in: ['$currentRiskCategory', ['High', 'Critical']] }, 1, 0] } },
          total: { $sum: 1 },
        } },
      { $sort: { avgScore: -1 } },
    ]),
    RiskAssessment.aggregate([
      { $match: { organizationId: toOid(orgId), computedAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } } },
      { $group: {
          _id: { y: { $year: '$computedAt' }, m: { $month: '$computedAt' } },
          avgScore: { $avg: '$riskScore' },
          count: { $sum: 1 },
        } },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    Department.find({ organizationId: orgId }).select('_id name'),
  ]);

  const deptMap = Object.fromEntries(deptDocs.map((d) => [String(d._id), d.name]));
  const departmentBreakdown = deptBreakdown.map((d) => ({
    departmentId: d._id,
    departmentName: deptMap[String(d._id)] || 'Unassigned',
    avgScore: Math.round(d.avgScore || 0),
    high: d.high,
    total: d.total,
  }));

  const distribution = {
    Low: 0, Medium: 0, High: 0, Critical: 0,
    ...Object.fromEntries(byCategory.map((b) => [b._id || 'Low', b.count])),
  };

  const avgCompanyScore = await Employee.aggregate([
    { $match: { organizationId: toOid(orgId), status: 'active' } },
    { $group: { _id: null, avg: { $avg: '$currentRiskScore' } } },
  ]);

  const topAtRisk = await Employee.find({
    organizationId: orgId,
    status: 'active',
    currentRiskCategory: { $in: ['High', 'Critical'] },
  })
    .sort({ currentRiskScore: -1 })
    .limit(10)
    .populate('departmentId', 'name')
    .select('name email designation currentRiskScore currentRiskCategory currentRiskTrend departmentId');

  res.json({
    totals: {
      employees: totalEmployees,
      high: distribution.High,
      critical: distribution.Critical,
      avgRiskScore: Math.round(avgCompanyScore[0]?.avg || 0),
    },
    distribution,
    departmentBreakdown,
    monthlyTrend: recentTrend.map((t) => ({
      period: `${t._id.y}-${String(t._id.m).padStart(2, '0')}`,
      avgScore: Math.round(t.avgScore),
      count: t.count,
    })),
    topAtRisk,
  });
});

function toOid(v) {
  const mongoose = require('mongoose');
  return new mongoose.Types.ObjectId(v);
}
