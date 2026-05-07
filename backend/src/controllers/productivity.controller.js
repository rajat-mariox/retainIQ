const mongoose = require('mongoose');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const Employee = require('../models/Employee');
const Organization = require('../models/Organization');
const Department = require('../models/Department');
const ActivityLog = require('../models/ActivityLog');
const ProductivityScore = require('../models/ProductivityScore');
const WorkPattern = require('../models/WorkPattern');
const Alert = require('../models/Alert');
const Signal = require('../models/Signal');
const { calculateProductivity } = require('../services/productivityScoringService');
const { detectBurnout } = require('../services/burnoutService');
const { analyzePatterns } = require('../services/workPatternService');
const { ROLES } = require('../config/constants');

const toOid = (v) => new mongoose.Types.ObjectId(v);

function dayKey(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

/**
 * Compute & persist daily productivity score for an employee on a given day.
 * Also: burnout detection, alert generation, and emit a behavioral signal that
 * feeds the existing risk engine — productivity drops increase attrition risk.
 */
async function computeDailyScore(orgId, employeeId, date = new Date()) {
  const day = dayKey(date);
  const [employee, activity, historical, org] = await Promise.all([
    Employee.findOne({ _id: employeeId, organizationId: orgId }),
    ActivityLog.findOne({ organizationId: orgId, employeeId, date: day }),
    ProductivityScore.find({ organizationId: orgId, employeeId, period: 'daily' }).sort({ date: -1 }).limit(14),
    Organization.findById(orgId),
  ]);
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (!activity) throw new HttpError(404, 'No activity log for this date');

  const weights = org?.settings?.productivity?.weights;
  const result = calculateProductivity({
    employee,
    activity,
    historical: historical.map((h) => ({
      score: h.score,
      metricsTotalHours: 0, // not stored on score, but burnout uses activity
    })),
    weights,
  });

  // Persist score
  const scoreDoc = await ProductivityScore.findOneAndUpdate(
    { organizationId: orgId, employeeId, period: 'daily', date: day },
    {
      organizationId: orgId, employeeId, period: 'daily', date: day,
      score: result.score, band: result.band,
      subScores: result.subScores, efficiency: result.efficiency,
      flags: result.flags, insights: result.insights,
      engineVersion: result.engineVersion,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  // Update cached fields on Employee
  employee.currentProductivityScore = result.score;
  employee.currentProductivityBand = result.band;
  employee.currentProductivityUpdatedAt = new Date();
  await employee.save();

  // Burnout check on a 14-day window
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const [recentActivities, recentScores] = await Promise.all([
    ActivityLog.find({ organizationId: orgId, employeeId, date: { $gte: since } }).sort({ date: -1 }),
    ProductivityScore.find({ organizationId: orgId, employeeId, period: 'daily', date: { $gte: since } }).sort({ date: -1 }),
  ]);
  const burnout = detectBurnout({
    activities: recentActivities,
    productivityScores: recentScores,
    thresholds: org?.settings?.productivity?.burnout,
  });

  // Generate alerts & signals
  const alerts = [];
  if (burnout.atRisk) {
    alerts.push({
      type: 'burnout_risk',
      severity: burnout.level === 'critical' ? 'critical' : 'warning',
      title: `Burnout risk: ${employee.name}`,
      message: burnout.signals.join('; ') || 'Sustained overwork pattern detected.',
      metric: { score: burnout.score, level: burnout.level },
    });
  }
  if (result.flags.includes('productivity_drop')) {
    alerts.push({
      type: 'productivity_drop',
      severity: 'warning',
      title: `Productivity drop: ${employee.name}`,
      message: `Score is significantly below 7-day average.`,
      metric: { score: result.score },
    });
  }
  if (result.flags.includes('meeting_overload')) {
    alerts.push({
      type: 'meeting_overload',
      severity: 'info',
      title: `Meeting overload: ${employee.name}`,
      message: 'Meetings consuming more than half of working time.',
    });
  }
  if (result.band === 'High Performer' && result.score >= 85) {
    alerts.push({
      type: 'high_performer',
      severity: 'info',
      title: `High performer: ${employee.name}`,
      message: `Sustained high productivity (${result.score}/100). Consider recognition.`,
    });
  }
  if (alerts.length > 0) {
    await Alert.insertMany(alerts.map((a) => ({ ...a, organizationId: orgId, employeeId })));
  }

  // Emit behavioral signals into the risk engine pipeline
  // These are read by the existing scoreBehavioral() in riskScoringService.
  const signalsToEmit = [];
  if (result.flags.includes('productivity_drop') || burnout.atRisk) {
    const signal7 = recentScores.length >= 7
      ? recentScores.slice(0, 7).reduce((s, p) => s + p.score, 0) / 7 : result.score;
    const declinePct = Math.max(0, Math.min(100, Math.round(100 - (result.score / Math.max(1, signal7)) * 100)));
    signalsToEmit.push({
      organizationId: orgId, employeeId, source: 'system',
      category: 'behavioral', metric: 'activity_decline_pct', value: declinePct, periodEnd: new Date(),
    });
  }
  if (signalsToEmit.length > 0) await Signal.insertMany(signalsToEmit);

  return { score: scoreDoc, burnout, alertsCreated: alerts.length };
}

exports.computeDaily = asyncHandler(async (req, res) => {
  const dateParam = req.query.date ? new Date(req.query.date) : new Date();
  const out = await computeDailyScore(req.organizationId, req.params.employeeId, dateParam);
  res.json(out);
});

exports.computeAllDaily = asyncHandler(async (req, res) => {
  const dateParam = req.query.date ? new Date(req.query.date) : new Date();
  const employees = await Employee.find({ organizationId: req.organizationId, status: 'active' }).select('_id');
  let processed = 0, skipped = 0;
  for (const e of employees) {
    try { await computeDailyScore(req.organizationId, e._id, dateParam); processed += 1; }
    catch { skipped += 1; }
  }
  res.json({ processed, skipped, total: employees.length });
});

exports.scoresFor = asyncHandler(async (req, res) => {
  const days = Math.min(180, parseInt(req.query.days) || 30);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const items = await ProductivityScore.find({
    organizationId: req.organizationId,
    employeeId: req.params.employeeId,
    period: 'daily',
    date: { $gte: since },
  }).sort({ date: 1 });
  res.json({ items });
});

exports.dashboard = asyncHandler(async (req, res) => {
  const orgId = req.organizationId;
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [employees, recentScores, deptDocs] = await Promise.all([
    Employee.find({ organizationId: orgId, status: 'active' })
      .populate('departmentId', 'name')
      .select('name designation departmentId currentProductivityScore currentProductivityBand reportingManagerId currentRiskCategory'),
    ProductivityScore.find({ organizationId: orgId, period: 'daily', date: { $gte: since } }).sort({ date: 1 }),
    Department.find({ organizationId: orgId }),
  ]);

  // Score buckets
  const bandCounts = { 'High Performer': 0, 'Stable': 0, 'Needs Attention': 0 };
  for (const e of employees) bandCounts[e.currentProductivityBand || 'Stable'] = (bandCounts[e.currentProductivityBand || 'Stable'] || 0) + 1;

  const avg = employees.length
    ? Math.round(employees.reduce((s, e) => s + (e.currentProductivityScore || 0), 0) / employees.length)
    : 0;

  // Trend by date (avg of all scores per day)
  const byDay = {};
  for (const s of recentScores) {
    const k = s.date.toISOString().slice(0, 10);
    if (!byDay[k]) byDay[k] = { sum: 0, count: 0 };
    byDay[k].sum += s.score;
    byDay[k].count += 1;
  }
  const trend = Object.entries(byDay).sort().map(([date, v]) => ({
    date, avgScore: Math.round(v.sum / v.count),
  }));

  // Department comparison
  const deptMap = Object.fromEntries(deptDocs.map((d) => [String(d._id), d.name]));
  const deptAgg = {};
  for (const e of employees) {
    const k = String(e.departmentId?._id || e.departmentId || 'unassigned');
    if (!deptAgg[k]) deptAgg[k] = { name: deptMap[k] || 'Unassigned', sum: 0, count: 0 };
    deptAgg[k].sum += (e.currentProductivityScore || 0);
    deptAgg[k].count += 1;
  }
  const departmentBreakdown = Object.values(deptAgg).map((d) => ({
    name: d.name, avgScore: d.count ? Math.round(d.sum / d.count) : 0, employees: d.count,
  })).sort((a, b) => b.avgScore - a.avgScore);

  // Top & low performers
  const sorted = [...employees].sort((a, b) => (b.currentProductivityScore || 0) - (a.currentProductivityScore || 0));
  const topPerformers = sorted.slice(0, 5);
  const lowPerformers = sorted.slice(-5).reverse();

  res.json({
    totals: {
      activeEmployees: employees.length,
      avgScore: avg,
      highPerformers: bandCounts['High Performer'],
      needsAttention: bandCounts['Needs Attention'],
    },
    bandDistribution: bandCounts,
    monthlyTrend: trend,
    departmentBreakdown,
    topPerformers,
    lowPerformers,
  });
});

exports.leaderboard = asyncHandler(async (req, res) => {
  const filter = { organizationId: req.organizationId, status: 'active' };
  if (req.user.role === ROLES.MANAGER) {
    const me = await Employee.findOne({ organizationId: req.organizationId, email: req.user.email });
    if (me) filter.reportingManagerId = me._id;
    else return res.json({ items: [] });
  }
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;

  const employees = await Employee.find(filter)
    .sort({ currentProductivityScore: -1 })
    .limit(50)
    .populate('departmentId', 'name')
    .select('name designation departmentId currentProductivityScore currentProductivityBand');

  // Streak (consecutive days with score >= 70) — last 30 days
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const ids = employees.map((e) => e._id);
  const scores = await ProductivityScore.find({
    organizationId: req.organizationId, employeeId: { $in: ids }, period: 'daily', date: { $gte: since },
  }).sort({ date: -1 }).select('employeeId score date');

  const byEmp = {};
  for (const s of scores) {
    const k = String(s.employeeId);
    if (!byEmp[k]) byEmp[k] = [];
    byEmp[k].push(s);
  }
  const items = employees.map((e, i) => {
    const arr = byEmp[String(e._id)] || [];
    let streak = 0;
    for (const s of arr) { if (s.score >= 70) streak += 1; else break; }
    const badges = [];
    if (streak >= 5) badges.push('Streak ' + streak);
    if (e.currentProductivityScore >= 85) badges.push('Top Performer');
    if (i === 0) badges.push('🥇');
    else if (i === 1) badges.push('🥈');
    else if (i === 2) badges.push('🥉');
    return { rank: i + 1, employee: e, streak, badges };
  });
  res.json({ items });
});

exports.workPattern = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const activities = await ActivityLog.find({
    organizationId: req.organizationId, employeeId: req.params.employeeId, date: { $gte: since },
  });
  const pattern = analyzePatterns({ activities });
  // Compute consistency from productivity scores (more accurate than active minutes)
  const scores = await ProductivityScore.find({
    organizationId: req.organizationId, employeeId: req.params.employeeId, period: 'daily', date: { $gte: since },
  });
  if (scores.length >= 3) {
    const arr = scores.map((s) => s.score);
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const stdev = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
    pattern.consistencyScore = Math.round(Math.max(30, 100 - stdev * 1.5));
    pattern.avgDailyScore = Math.round(mean);
  }

  // Persist
  await WorkPattern.findOneAndUpdate(
    { organizationId: req.organizationId, employeeId: req.params.employeeId },
    { ...pattern, organizationId: req.organizationId, employeeId: req.params.employeeId, computedAt: new Date(), windowDays: 30 },
    { upsert: true, new: true }
  );
  res.json(pattern);
});

exports.burnoutCheck = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const [activities, scores, org] = await Promise.all([
    ActivityLog.find({ organizationId: req.organizationId, employeeId: req.params.employeeId, date: { $gte: since } }).sort({ date: -1 }),
    ProductivityScore.find({ organizationId: req.organizationId, employeeId: req.params.employeeId, period: 'daily', date: { $gte: since } }).sort({ date: -1 }),
    Organization.findById(req.organizationId),
  ]);
  const result = detectBurnout({
    activities, productivityScores: scores, thresholds: org?.settings?.productivity?.burnout,
  });
  res.json(result);
});
