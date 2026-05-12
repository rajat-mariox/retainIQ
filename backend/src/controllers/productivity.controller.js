const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const Employee = require('../models/Employee');
const Organization = require('../models/Organization');
const Department = require('../models/Department');
const ActivityLog = require('../models/ActivityLog');
const ActivitySession = require('../models/ActivitySession');
const ScreenshotLog = require('../models/ScreenshotLog');
const AppUsageLog = require('../models/AppUsageLog');
const ProductivityScore = require('../models/ProductivityScore');
const WorkPattern = require('../models/WorkPattern');
const Alert = require('../models/Alert');
const Signal = require('../models/Signal');
const { calculateProductivity } = require('../services/productivityScoringService');
const { calculateAndPersistActivityScore } = require('../services/activityProductivityService');
const { assertEmployeeAccess, currentEmployeeFor } = require('../services/activityAccessService');
const { detectBurnout } = require('../services/burnoutService');
const { analyzePatterns } = require('../services/workPatternService');
const { ROLES } = require('../config/constants');

function dayKey(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Compute & persist daily productivity score for an employee on a given day.
 * Also: burnout detection, alert generation, and emit a behavioral signal that
 * feeds the existing risk engine.
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
    historical: historical.map((h) => ({ score: h.score, metricsTotalHours: 0 })),
    weights,
  });

  const scoreDoc = await ProductivityScore.findOneAndUpdate(
    { organizationId: orgId, employeeId, period: 'daily', date: day },
    {
      organizationId: orgId,
      employeeId,
      period: 'daily',
      date: day,
      score: result.score,
      band: result.band,
      subScores: result.subScores,
      efficiency: result.efficiency,
      flags: result.flags,
      insights: result.insights,
      engineVersion: result.engineVersion,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  employee.currentProductivityScore = result.score;
  employee.currentProductivityBand = result.band;
  employee.currentProductivityUpdatedAt = new Date();
  await employee.save();

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
      message: 'Score is significantly below 7-day average.',
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

  const signalsToEmit = [];
  if (result.flags.includes('productivity_drop') || burnout.atRisk) {
    const signal7 = recentScores.length >= 7
      ? recentScores.slice(0, 7).reduce((s, p) => s + p.score, 0) / 7
      : result.score;
    const declinePct = Math.max(0, Math.min(100, Math.round(100 - (result.score / Math.max(1, signal7)) * 100)));
    signalsToEmit.push({
      organizationId: orgId,
      employeeId,
      source: 'system',
      category: 'behavioral',
      metric: 'activity_decline_pct',
      value: declinePct,
      periodEnd: new Date(),
    });
  }
  if (signalsToEmit.length > 0) await Signal.insertMany(signalsToEmit);

  return { score: scoreDoc, burnout, alertsCreated: alerts.length };
}

exports.computeDaily = asyncHandler(async (req, res) => {
  await assertEmployeeAccess(req, req.params.employeeId);
  const dateParam = req.query.date ? new Date(req.query.date) : new Date();
  const out = await calculateAndPersistActivityScore(req.organizationId, req.params.employeeId, dateParam);
  res.json(out);
});

exports.computeAllDaily = asyncHandler(async (req, res) => {
  const dateParam = req.query.date ? new Date(req.query.date) : new Date();
  const employees = await Employee.find({ organizationId: req.organizationId, status: 'active' }).select('_id');
  let processed = 0;
  let skipped = 0;
  for (const e of employees) {
    try {
      await computeDailyScore(req.organizationId, e._id, dateParam);
      processed += 1;
    } catch {
      skipped += 1;
    }
  }
  res.json({ processed, skipped, total: employees.length });
});

exports.scoresFor = asyncHandler(async (req, res) => {
  await assertEmployeeAccess(req, req.params.employeeId);
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
  const targetDate = req.query.date ? dayKey(req.query.date) : null;
  const since = targetDate || new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const employeeFilter = { organizationId: orgId, status: 'active' };
  if (req.query.departmentId) employeeFilter.departmentId = req.query.departmentId;
  if (req.user.role === ROLES.MANAGER) {
    const manager = await currentEmployeeFor(req.user);
    if (!manager) return res.json({
      totals: { activeEmployees: 0, totalEmployees: 0, avgScore: 0, highPerformers: 0, needsAttention: 0, activeMinutes: 0, idleMinutes: 0 },
      bandDistribution: { 'High Performer': 0, Stable: 0, 'Needs Attention': 0 },
      monthlyTrend: [],
      departmentBreakdown: [],
      topPerformers: [],
      lowPerformers: [],
      employees: [],
      recentScreenshots: [],
      appUsageSummary: [],
    });
    employeeFilter.reportingManagerId = manager._id;
  }
  const [employees, recentScores, deptDocs] = await Promise.all([
    Employee.find(employeeFilter)
      .populate('departmentId', 'name')
      .select('name designation departmentId currentProductivityScore currentProductivityBand reportingManagerId currentRiskCategory'),
    ProductivityScore.find({ organizationId: orgId, period: 'daily', date: { $gte: since } }).sort({ date: 1 }),
    Department.find({ organizationId: orgId }),
  ]);

  const bandCounts = { 'High Performer': 0, Stable: 0, 'Needs Attention': 0 };
  for (const e of employees) {
    bandCounts[e.currentProductivityBand || 'Stable'] = (bandCounts[e.currentProductivityBand || 'Stable'] || 0) + 1;
  }
  const allowedEmployeeIds = new Set(employees.map((e) => String(e._id)));
  const scopedRecentScores = recentScores.filter((score) => allowedEmployeeIds.has(String(score.employeeId)));

  const avg = employees.length
    ? Math.round(employees.reduce((s, e) => s + (e.currentProductivityScore || 0), 0) / employees.length)
    : 0;

  const byDay = {};
  for (const s of scopedRecentScores) {
    const k = s.date.toISOString().slice(0, 10);
    if (!byDay[k]) byDay[k] = { sum: 0, count: 0 };
    byDay[k].sum += s.score;
    byDay[k].count += 1;
  }
  const trend = Object.entries(byDay).sort().map(([date, v]) => ({
    date,
    avgScore: Math.round(v.sum / v.count),
  }));

  const deptMap = Object.fromEntries(deptDocs.map((d) => [String(d._id), d.name]));
  const deptAgg = {};
  for (const e of employees) {
    const k = String(e.departmentId?._id || e.departmentId || 'unassigned');
    if (!deptAgg[k]) deptAgg[k] = { name: deptMap[k] || 'Unassigned', sum: 0, count: 0 };
    deptAgg[k].sum += (e.currentProductivityScore || 0);
    deptAgg[k].count += 1;
  }
  const departmentBreakdown = Object.values(deptAgg).map((d) => ({
    name: d.name,
    avgScore: d.count ? Math.round(d.sum / d.count) : 0,
    employees: d.count,
  })).sort((a, b) => b.avgScore - a.avgScore);

  const sorted = [...employees].sort((a, b) => (b.currentProductivityScore || 0) - (a.currentProductivityScore || 0));
  const topPerformers = sorted.slice(0, 5);
  const lowPerformers = sorted.slice(-5).reverse();
  const employeeIds = employees.map((e) => e._id);
  const [sessions, screenshots, apps, activityLogs] = await Promise.all([
    ActivitySession.find({ organizationId: orgId, employeeId: { $in: employeeIds }, date: { $gte: since } }),
    ScreenshotLog.find({ organizationId: orgId, employeeId: { $in: employeeIds }, capturedAt: { $gte: since } })
      .sort({ capturedAt: -1 }).limit(12).populate('employeeId', 'name'),
    AppUsageLog.find({ organizationId: orgId, employeeId: { $in: employeeIds }, capturedAt: { $gte: since } })
      .sort({ capturedAt: -1 }).limit(500),
    ActivityLog.find({ organizationId: orgId, employeeId: { $in: employeeIds }, date: { $gte: since } })
      .select('employeeId date appUsage screenshots'),
  ]);

  const activityByEmployee = {};
  const activeIdle = { activeMinutes: 0, idleMinutes: 0, breakMinutes: 0, totalMinutes: 0 };
  for (const session of sessions) {
    const key = String(session.employeeId);
    if (!activityByEmployee[key]) activityByEmployee[key] = { activeMinutes: 0, idleMinutes: 0, breakMinutes: 0, totalMinutes: 0 };
    for (const field of ['activeMinutes', 'idleMinutes', 'breakMinutes', 'totalMinutes']) {
      activityByEmployee[key][field] += session[field] || 0;
      activeIdle[field] += session[field] || 0;
    }
  }

  const appMap = {};
  const appsByEmployee = {};
  for (const app of apps) {
    const key = app.appName;
    if (!appMap[key]) appMap[key] = { appName: key, category: app.category, durationSeconds: 0 };
    appMap[key].durationSeconds += app.durationSeconds || 0;
    const empKey = String(app.employeeId);
    if (!appsByEmployee[empKey]) appsByEmployee[empKey] = {};
    if (!appsByEmployee[empKey][key]) appsByEmployee[empKey][key] = { appName: key, category: app.category, durationSeconds: 0 };
    appsByEmployee[empKey][key].durationSeconds += app.durationSeconds || 0;
  }
  // Also fold in entries from ActivityLog.appUsage[] (the new desktop-agent
  // /sync flow) so the panel still populates when the legacy AppUsageLog
  // collection is empty.
  for (const log of activityLogs) {
    const empKey = String(log.employeeId);
    for (const entry of log.appUsage || []) {
      const seconds = Math.round((entry.durationMinutes || 0) * 60);
      if (!seconds) continue;
      const key = entry.appName;
      if (!appMap[key]) appMap[key] = { appName: key, category: entry.category, durationSeconds: 0 };
      appMap[key].durationSeconds += seconds;
      if (!appsByEmployee[empKey]) appsByEmployee[empKey] = {};
      if (!appsByEmployee[empKey][key]) appsByEmployee[empKey][key] = { appName: key, category: entry.category, durationSeconds: 0 };
      appsByEmployee[empKey][key].durationSeconds += seconds;
    }
  }
  // When ?date= is provided, overlay per-employee score + activity for that
  // specific day from ActivityLog/ProductivityScore so dashboard rows reflect
  // the chosen date rather than the rolling employee snapshot.
  let dayScoreByEmp = null;
  let dayActivityByEmp = null;
  if (targetDate) {
    const employeeIdsArr = employees.map((e) => e._id);
    const [dayScores, dayActivities] = await Promise.all([
      ProductivityScore.find({
        organizationId: orgId,
        employeeId: { $in: employeeIdsArr },
        period: 'daily',
        date: targetDate,
      }),
      ActivityLog.find({
        organizationId: orgId,
        employeeId: { $in: employeeIdsArr },
        date: targetDate,
      }),
    ]);
    dayScoreByEmp = Object.fromEntries(dayScores.map((s) => [String(s.employeeId), s]));
    dayActivityByEmp = Object.fromEntries(dayActivities.map((a) => [String(a.employeeId), a]));
  }

  const employeeRows = employees.map((e) => {
    const empKey = String(e._id);
    const dayScore = dayScoreByEmp?.[empKey];
    const dayActivity = dayActivityByEmp?.[empKey];
    const fallbackActivity = activityByEmployee[empKey] || { activeMinutes: 0, idleMinutes: 0, breakMinutes: 0, totalMinutes: 0 };

    const activity = dayActivity ? {
      activeMinutes: dayActivity.activeMinutes || 0,
      idleMinutes: dayActivity.idleMinutes || 0,
      breakMinutes: dayActivity.breakMinutes || 0,
      totalMinutes: dayActivity.totalWorkMinutes || dayActivity.totalLoggedMinutes || 0,
    } : fallbackActivity;

    const topApps = dayActivity?.appUsage?.length
      ? [...dayActivity.appUsage]
          .sort((a, b) => (b.durationMinutes || 0) - (a.durationMinutes || 0))
          .slice(0, 3)
          .map((a) => ({ appName: a.appName, category: a.category, durationSeconds: (a.durationMinutes || 0) * 60 }))
      : Object.values(appsByEmployee[empKey] || {})
          .sort((a, b) => b.durationSeconds - a.durationSeconds)
          .slice(0, 3);

    return {
      ...e.toObject(),
      currentProductivityScore: dayScore?.score ?? e.currentProductivityScore ?? 0,
      currentProductivityBand: dayScore?.band ?? e.currentProductivityBand,
      activity,
      topApps,
      recentScreenshots: screenshots.filter((s) => String(s.employeeId?._id || s.employeeId) === empKey).slice(0, 3),
    };
  });

  // Refresh band counts, avg score, and top/low ordering when scoped by date.
  let scopedAvg = avg;
  let scopedTop = topPerformers;
  let scopedLow = lowPerformers;
  if (targetDate) {
    bandCounts['High Performer'] = 0;
    bandCounts.Stable = 0;
    bandCounts['Needs Attention'] = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    for (const row of employeeRows) {
      const b = row.currentProductivityBand || 'Stable';
      bandCounts[b] = (bandCounts[b] || 0) + 1;
      if (row.currentProductivityScore != null) {
        scoreSum += row.currentProductivityScore;
        scoreCount += 1;
      }
    }
    scopedAvg = scoreCount ? Math.round(scoreSum / scoreCount) : 0;
    const sortedRows = [...employeeRows].sort((a, b) => (b.currentProductivityScore || 0) - (a.currentProductivityScore || 0));
    scopedTop = sortedRows.slice(0, 5);
    scopedLow = sortedRows.slice(-5).reverse();
  }

  res.json({
    totals: {
      activeEmployees: employees.length,
      totalEmployees: employees.length,
      avgScore: scopedAvg,
      highPerformers: bandCounts['High Performer'],
      stable: bandCounts.Stable,
      needsAttention: bandCounts['Needs Attention'],
      activeMinutes: activeIdle.activeMinutes,
      idleMinutes: activeIdle.idleMinutes,
      breakMinutes: activeIdle.breakMinutes,
      totalMinutes: activeIdle.totalMinutes,
    },
    date: targetDate ? targetDate.toISOString().slice(0, 10) : null,
    bandDistribution: bandCounts,
    monthlyTrend: trend,
    departmentBreakdown,
    topPerformers: scopedTop,
    lowPerformers: scopedLow,
    employees: employeeRows,
    recentScreenshots: mergeRecentScreenshots(screenshots, activityLogs, employees).slice(0, 12),
    appUsageSummary: Object.values(appMap).sort((a, b) => b.durationSeconds - a.durationSeconds).slice(0, 10),
  });
});

function mergeRecentScreenshots(legacyShots, activityLogs, employees) {
  const empNameById = Object.fromEntries(employees.map((e) => [String(e._id), e.name]));
  const fromLegacy = legacyShots.map((s) => ({
    _id: s._id,
    imageUrl: s.imageUrl,
    activeApp: s.activeApp,
    capturedAt: s.capturedAt,
    employeeId: s.employeeId,
  }));
  const fromAgent = [];
  for (const log of activityLogs) {
    const empName = empNameById[String(log.employeeId)];
    for (const shot of log.screenshots || []) {
      fromAgent.push({
        _id: `${log._id}:${shot.imageUrl}`,
        imageUrl: shot.imageUrl,
        activeApp: shot.activeApp,
        capturedAt: shot.capturedAt,
        employeeId: { _id: log.employeeId, name: empName },
      });
    }
  }
  return [...fromLegacy, ...fromAgent].sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));
}

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

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const ids = employees.map((e) => e._id);
  const scores = await ProductivityScore.find({
    organizationId: req.organizationId,
    employeeId: { $in: ids },
    period: 'daily',
    date: { $gte: since },
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
    for (const s of arr) {
      if (s.score >= 70) streak += 1;
      else break;
    }
    const badges = [];
    if (streak >= 5) badges.push('Streak ' + streak);
    if (e.currentProductivityScore >= 85) badges.push('Top Performer');
    if (i === 0) badges.push('1st');
    else if (i === 1) badges.push('2nd');
    else if (i === 2) badges.push('3rd');
    return { rank: i + 1, employee: e, streak, badges };
  });
  res.json({ items });
});

exports.workPattern = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const activities = await ActivityLog.find({
    organizationId: req.organizationId,
    employeeId: req.params.employeeId,
    date: { $gte: since },
  });
  const pattern = analyzePatterns({ activities });
  const scores = await ProductivityScore.find({
    organizationId: req.organizationId,
    employeeId: req.params.employeeId,
    period: 'daily',
    date: { $gte: since },
  });
  if (scores.length >= 3) {
    const arr = scores.map((s) => s.score);
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const stdev = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
    pattern.consistencyScore = Math.round(Math.max(30, 100 - stdev * 1.5));
    pattern.avgDailyScore = Math.round(mean);
  }

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
    activities,
    productivityScores: scores,
    thresholds: org?.settings?.productivity?.burnout,
  });
  res.json(result);
});
