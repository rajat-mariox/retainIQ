const ActivityLog = require('../models/ActivityLog');
const ActivitySession = require('../models/ActivitySession');
const AppUsageLog = require('../models/AppUsageLog');
const ProductivityScore = require('../models/ProductivityScore');
const Employee = require('../models/Employee');
const PulseSurvey = require('../models/PulseSurvey');
const Task = require('../models/Task');
const { HttpError } = require('../middlewares/errorHandler');

const ENGINE_VERSION = 'activity-agent-v1';

const clamp = (value, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : 0));
const round = (value) => Math.round(clamp(value));

function dayKey(input = new Date()) {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

function bandFor(score) {
  if (score >= 75) return 'High Performer';
  if (score >= 50) return 'Stable';
  return 'Needs Attention';
}

async function buildDailyMetrics(organizationId, employeeId, date = new Date()) {
  const day = dayKey(date);
  const next = new Date(day);
  next.setDate(day.getDate() + 1);

  const [sessions, activityLog, appUsage, pulse, tasksCompletedToday, tasksOverdueOpen] = await Promise.all([
    ActivitySession.find({ organizationId, employeeId, date: day }),
    ActivityLog.findOne({ organizationId, employeeId, date: day }),
    AppUsageLog.find({ organizationId, employeeId, capturedAt: { $gte: day, $lt: next } }),
    PulseSurvey.findOne({ organizationId, employeeId, createdAt: { $gte: day, $lt: next } }).sort({ createdAt: -1 }),
    Task.countDocuments({
      organizationId,
      employeeId,
      status: 'completed',
      completedAt: { $gte: day, $lt: next },
    }),
    // Open (pending) tasks whose due date has already passed as of this day.
    Task.countDocuments({
      organizationId,
      employeeId,
      status: 'pending',
      dueDate: { $ne: null, $lt: next },
    }),
  ]);

  const sessionTotals = sessions.reduce((acc, s) => {
    acc.totalMinutes += s.totalMinutes || 0;
    acc.activeMinutes += s.activeMinutes || 0;
    acc.idleMinutes += s.idleMinutes || 0;
    acc.breakMinutes += s.breakMinutes || 0;
    return acc;
  }, { totalMinutes: 0, activeMinutes: 0, idleMinutes: 0, breakMinutes: 0 });

  const productiveSeconds = appUsage
    .filter((a) => a.category === 'productive')
    .reduce((sum, a) => sum + (a.durationSeconds || 0), 0);
  const neutralSeconds = appUsage
    .filter((a) => a.category === 'neutral')
    .reduce((sum, a) => sum + (a.durationSeconds || 0), 0);
  const unproductiveSeconds = appUsage
    .filter((a) => a.category === 'unproductive')
    .reduce((sum, a) => sum + (a.durationSeconds || 0), 0);

  return {
    day,
    activeMinutes: sessionTotals.activeMinutes || activityLog?.activeMinutes || 0,
    idleMinutes: sessionTotals.idleMinutes || activityLog?.idleMinutes || 0,
    breakMinutes: sessionTotals.breakMinutes || activityLog?.breakMinutes || 0,
    totalMinutes: sessionTotals.totalMinutes || activityLog?.totalLoggedMinutes || 0,
    // Live counts from the Task collection take precedence; fall back to any
    // value externally pushed into ActivityLog (legacy / source-system ingest).
    tasksCompleted: tasksCompletedToday || activityLog?.tasksCompleted || 0,
    tasksOverdue: tasksOverdueOpen || activityLog?.tasksOverdue || 0,
    productiveSeconds,
    neutralSeconds,
    unproductiveSeconds,
    wellbeingScore: pulse
      ? ((pulse.moodScore || 3) + (pulse.workloadScore || 3) + (pulse.managerSupportScore || 3) + (pulse.growthSatisfactionScore || 3)) * 5
      : 70,
  };
}

function calculateActivityProductivity(metrics) {
  const workMinutes = Math.max(1, metrics.activeMinutes + metrics.idleMinutes + metrics.breakMinutes);
  const appSeconds = metrics.productiveSeconds + metrics.neutralSeconds + metrics.unproductiveSeconds;
  const taskTotal = metrics.tasksCompleted + metrics.tasksOverdue;

  const breakdown = {
    activeTime: round((metrics.activeMinutes / Math.max(1, metrics.totalMinutes || workMinutes)) * 100),
    taskCompletion: taskTotal ? round((metrics.tasksCompleted / taskTotal) * 100) : 70,
    appUsage: appSeconds
      ? round(((metrics.productiveSeconds + metrics.neutralSeconds * 0.55) / appSeconds) * 100)
      : 70,
    attendance: round(Math.min(metrics.totalMinutes || workMinutes, 8 * 60) / (8 * 60) * 100),
    idleControl: round(100 - (metrics.idleMinutes / workMinutes) * 100),
    wellbeing: round(metrics.wellbeingScore),
  };

  const score = round(
    breakdown.activeTime * 0.25 +
    breakdown.taskCompletion * 0.30 +
    breakdown.appUsage * 0.20 +
    breakdown.attendance * 0.10 +
    breakdown.idleControl * 0.10 +
    breakdown.wellbeing * 0.05
  );

  return { score, band: bandFor(score), breakdown };
}

async function calculateAndPersistActivityScore(organizationId, employeeId, date = new Date()) {
  const employee = await Employee.findOne({ _id: employeeId, organizationId });
  if (!employee) throw new HttpError(404, 'Employee not found');

  const metrics = await buildDailyMetrics(organizationId, employeeId, date);
  const result = calculateActivityProductivity(metrics);

  const scoreDoc = await ProductivityScore.findOneAndUpdate(
    { organizationId, employeeId, period: 'daily', date: metrics.day },
    {
      organizationId,
      employeeId,
      period: 'daily',
      date: metrics.day,
      score: result.score,
      band: result.band,
      breakdown: result.breakdown,
      subScores: {
        timeUtilization: result.breakdown.activeTime,
        taskCompletion: result.breakdown.taskCompletion,
        meetingEfficiency: result.breakdown.attendance,
        engagement: result.breakdown.wellbeing,
        consistency: result.breakdown.idleControl,
        focus: result.breakdown.appUsage,
      },
      efficiency: {
        tasksPerActiveHour: metrics.activeMinutes ? Number((metrics.tasksCompleted / (metrics.activeMinutes / 60)).toFixed(2)) : 0,
        normalized: result.breakdown.taskCompletion,
      },
      flags: result.score < 50 ? ['low_productivity'] : [],
      insights: [],
      engineVersion: ENGINE_VERSION,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  employee.currentProductivityScore = result.score;
  employee.currentProductivityBand = result.band;
  employee.currentProductivityUpdatedAt = new Date();
  await employee.save();

  return { score: scoreDoc, metrics };
}

module.exports = {
  ENGINE_VERSION,
  dayKey,
  bandFor,
  buildDailyMetrics,
  calculateActivityProductivity,
  calculateAndPersistActivityScore,
};
