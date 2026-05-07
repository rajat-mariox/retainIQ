/**
 * Report Service — generates daily / weekly / monthly reports at three scopes:
 * employee, team (department), and company.
 *
 * The output `metrics` shape varies by period but always includes:
 *   - hoursWorked, productiveHours, idleHours, meetingHours
 *   - tasksCompleted, tasksOverdue
 *   - avgScore, currentScore, scoreTrend
 *   - flags (warnings)
 */

const ActivityLog = require('../models/ActivityLog');
const ProductivityScore = require('../models/ProductivityScore');
const Employee = require('../models/Employee');
const aiService = require('./productivityAIService');

const DAY = 24 * 60 * 60 * 1000;

function rangeFor(period, refDate = new Date()) {
  const end = new Date(refDate);
  const start = new Date(refDate);
  if (period === 'daily') start.setDate(start.getDate() - 1);
  if (period === 'weekly') start.setDate(start.getDate() - 7);
  if (period === 'monthly') start.setDate(start.getDate() - 30);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function buildEmployeeReport({ orgId, employeeId, period, refDate = new Date() }) {
  const { start, end } = rangeFor(period, refDate);

  const [employee, activities, scores] = await Promise.all([
    Employee.findOne({ _id: employeeId, organizationId: orgId }),
    ActivityLog.find({ organizationId: orgId, employeeId, date: { $gte: start, $lte: end } }).sort({ date: 1 }),
    ProductivityScore.find({ organizationId: orgId, employeeId, period: 'daily', date: { $gte: start, $lte: end } }).sort({ date: -1 }),
  ]);
  if (!employee) throw new Error('Employee not found');

  const sumByKey = (arr, key) => arr.reduce((s, a) => s + (a[key] || 0), 0);

  const metrics = {
    days: activities.length,
    hoursWorked: parseFloat(((sumByKey(activities, 'totalLoggedMinutes')) / 60).toFixed(1)),
    productiveHours: parseFloat(((sumByKey(activities, 'activeMinutes')) / 60).toFixed(1)),
    idleHours: parseFloat(((sumByKey(activities, 'idleMinutes')) / 60).toFixed(1)),
    meetingHours: parseFloat(((sumByKey(activities, 'meetingMinutes')) / 60).toFixed(1)),
    deepWorkHours: parseFloat(((sumByKey(activities, 'deepWorkMinutes')) / 60).toFixed(1)),
    tasksCompleted: sumByKey(activities, 'tasksCompleted'),
    tasksOverdue: sumByKey(activities, 'tasksOverdue'),
    commits: sumByKey(activities, 'commits'),
    pullRequests: sumByKey(activities, 'pullRequests'),
    avgScore: scores.length ? Math.round(scores.reduce((s, p) => s + p.score, 0) / scores.length) : 0,
    currentScore: scores[0]?.score ?? 0,
    band: scores[0]?.band || 'Stable',
    scoreTrend: scores.length >= 2
      ? scores[0].score - scores[Math.min(scores.length - 1, 6)].score
      : 0,
    flagCounts: scores.reduce((acc, s) => {
      (s.flags || []).forEach((f) => { acc[f] = (acc[f] || 0) + 1; });
      return acc;
    }, {}),
  };

  // AI narrative — uses first vs last week of the period when relevant
  const current = scores[0]
    ? { score: scores[0].score, band: scores[0].band, subScores: scores[0].subScores, efficiency: scores[0].efficiency }
    : { score: metrics.avgScore, band: 'Stable', subScores: {}, efficiency: { tasksPerActiveHour: 0, normalized: 0 } };
  const prior = scores[scores.length - 1] && scores.length > 1
    ? { score: scores[scores.length - 1].score }
    : null;
  const flags = Object.keys(metrics.flagCounts);
  const insight = await aiService.generateInsight({
    subject: 'employee', current, prior, flags, role: employee.designation, period: period.replace('ly', ''),
  });

  return {
    scope: 'employee',
    period,
    employeeId,
    organizationId: orgId,
    periodStart: start,
    periodEnd: end,
    metrics,
    summary: insight.summary,
    strengths: insight.strengths || [],
    weaknesses: insight.weaknesses || [],
    recommendations: insight.recommendations || insight.bullets || [],
    aiSource: insight.source,
  };
}

async function buildTeamReport({ orgId, departmentId, managerId, period, refDate = new Date() }) {
  const { start, end } = rangeFor(period, refDate);
  const empFilter = { organizationId: orgId, status: 'active' };
  if (departmentId) empFilter.departmentId = departmentId;
  if (managerId) empFilter.reportingManagerId = managerId;
  const employees = await Employee.find(empFilter).select('_id name designation currentProductivityScore');

  if (employees.length === 0) {
    return {
      scope: 'team', period, departmentId, managerId,
      organizationId: orgId, periodStart: start, periodEnd: end,
      metrics: { teamSize: 0 }, summary: 'No employees in scope.', recommendations: [],
    };
  }

  const ids = employees.map((e) => e._id);
  const [activities, scores] = await Promise.all([
    ActivityLog.find({ organizationId: orgId, employeeId: { $in: ids }, date: { $gte: start, $lte: end } }),
    ProductivityScore.find({ organizationId: orgId, employeeId: { $in: ids }, period: 'daily', date: { $gte: start, $lte: end } }),
  ]);

  const byEmp = {};
  for (const s of scores) {
    const k = String(s.employeeId);
    if (!byEmp[k]) byEmp[k] = [];
    byEmp[k].push(s.score);
  }
  const empAvgs = employees.map((e) => {
    const arr = byEmp[String(e._id)] || [];
    return { employee: e, avg: arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : 0 };
  });
  const teamAvg = empAvgs.length ? Math.round(empAvgs.reduce((s, x) => s + x.avg, 0) / empAvgs.length) : 0;
  const sortedAvgs = [...empAvgs].sort((a, b) => b.avg - a.avg);

  const metrics = {
    teamSize: employees.length,
    teamAvgScore: teamAvg,
    topPerformers: sortedAvgs.slice(0, 3).map((x) => ({ id: x.employee._id, name: x.employee.name, score: x.avg })),
    lowPerformers: sortedAvgs.slice(-3).reverse().map((x) => ({ id: x.employee._id, name: x.employee.name, score: x.avg })),
    workloadImbalance: detectImbalance(activities, employees),
    totalProductiveHours: parseFloat((activities.reduce((s, a) => s + (a.activeMinutes || 0), 0) / 60).toFixed(1)),
    totalMeetingHours: parseFloat((activities.reduce((s, a) => s + (a.meetingMinutes || 0), 0) / 60).toFixed(1)),
    totalTasksCompleted: activities.reduce((s, a) => s + (a.tasksCompleted || 0), 0),
  };

  const summary = `Team of ${employees.length} averaged ${teamAvg}/100 productivity in this ${period.replace('ly', '')}. ${metrics.workloadImbalance.imbalanced ? 'Workload imbalance detected.' : 'Workload distribution looks balanced.'}`;
  const recommendations = [];
  if (teamAvg < 50) recommendations.push('Hold a team retro to surface blockers and re-align priorities.');
  if (metrics.workloadImbalance.imbalanced) recommendations.push(`Rebalance work — ${metrics.workloadImbalance.detail}`);

  return {
    scope: 'team', period, departmentId, managerId,
    organizationId: orgId, periodStart: start, periodEnd: end,
    metrics, summary, recommendations, strengths: [], weaknesses: [], aiSource: 'static',
  };
}

async function buildCompanyReport({ orgId, period, refDate = new Date() }) {
  const { start, end } = rangeFor(period, refDate);
  const employees = await Employee.find({ organizationId: orgId, status: 'active' });
  const ids = employees.map((e) => e._id);

  const [scores, activities] = await Promise.all([
    ProductivityScore.find({ organizationId: orgId, period: 'daily', date: { $gte: start, $lte: end } }),
    ActivityLog.find({ organizationId: orgId, employeeId: { $in: ids }, date: { $gte: start, $lte: end } }),
  ]);

  const totalCost = employees.reduce((s, e) => s + (e.monthlyCost || 0), 0);
  const days = Math.max(1, Math.round((end - start) / DAY));
  const periodCost = (totalCost / 30) * days;

  const productiveHours = activities.reduce((s, a) => s + (a.activeMinutes || 0), 0) / 60;
  const tasksCompleted = activities.reduce((s, a) => s + (a.tasksCompleted || 0), 0);
  const avgScore = scores.length ? Math.round(scores.reduce((s, p) => s + p.score, 0) / scores.length) : 0;

  const byDept = {};
  for (const e of employees) {
    const k = String(e.departmentId || 'unassigned');
    if (!byDept[k]) byDept[k] = { ids: [], scoreSum: 0, scoreCount: 0 };
    byDept[k].ids.push(String(e._id));
  }
  for (const s of scores) {
    for (const k of Object.keys(byDept)) {
      if (byDept[k].ids.includes(String(s.employeeId))) {
        byDept[k].scoreSum += s.score;
        byDept[k].scoreCount += 1;
        break;
      }
    }
  }

  const metrics = {
    activeEmployees: employees.length,
    avgScore,
    totalProductiveHours: parseFloat(productiveHours.toFixed(1)),
    totalTasksCompleted: tasksCompleted,
    periodCost: Math.round(periodCost),
    departmentBreakdown: Object.entries(byDept).map(([k, v]) => ({
      departmentId: k === 'unassigned' ? null : k,
      employees: v.ids.length,
      avgScore: v.scoreCount ? Math.round(v.scoreSum / v.scoreCount) : 0,
    })),
  };

  return {
    scope: 'company', period, organizationId: orgId, periodStart: start, periodEnd: end,
    metrics,
    summary: `Company productivity averaged ${avgScore}/100 across ${employees.length} active employees this ${period.replace('ly', '')}.`,
    strengths: [], weaknesses: [], recommendations: [], aiSource: 'static',
  };
}

function detectImbalance(activities, employees) {
  const byEmp = {};
  for (const a of activities) {
    const k = String(a.employeeId);
    byEmp[k] = (byEmp[k] || 0) + (a.activeMinutes || 0);
  }
  const values = employees.map((e) => byEmp[String(e._id)] || 0);
  if (values.length < 2) return { imbalanced: false, detail: '' };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdev = Math.sqrt(variance);
  const cv = mean ? stdev / mean : 0;
  if (cv > 0.4) {
    const max = Math.max(...values);
    const min = Math.min(...values);
    return {
      imbalanced: true,
      detail: `top contributor logged ${Math.round(max / 60)}h vs ${Math.round(min / 60)}h for the lowest`,
    };
  }
  return { imbalanced: false, detail: '' };
}

module.exports = { buildEmployeeReport, buildTeamReport, buildCompanyReport, rangeFor };
