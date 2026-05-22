const ActivityLog = require('../models/ActivityLog');
const ProductivityScore = require('../models/ProductivityScore');
const Signal = require('../models/Signal');

function dayKey(input = new Date()) {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

function totalMinutesFor(log) {
  if (!log) return 0;
  return log.totalLoggedMinutes
    || log.totalWorkMinutes
    || ((log.activeMinutes || 0) + (log.idleMinutes || 0) + (log.breakMinutes || 0));
}

function minutesSinceMidnight(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

async function upsertActivityRiskSignal(signal) {
  return Signal.findOneAndUpdate(
    {
      organizationId: signal.organizationId,
      employeeId: signal.employeeId,
      category: signal.category,
      metric: signal.metric,
      periodStart: signal.periodStart,
    },
    { $set: signal },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function emitProductivityRiskSignals({ organizationId, employeeId, date, scoreDoc, activityLog }) {
  const currentScore = scoreDoc?.score;
  if (!Number.isFinite(currentScore)) return [];

  const previousScores = await ProductivityScore.find({
    organizationId,
    employeeId,
    period: 'daily',
    date: { $lt: date },
  })
    .sort({ date: -1 })
    .limit(7)
    .select('score');

  const signals = [];
  const periodEnd = new Date(date);
  periodEnd.setDate(periodEnd.getDate() + 1);

  if (previousScores.length >= 3) {
    const avg = previousScores.reduce((sum, item) => sum + (item.score || 0), 0) / previousScores.length;
    const declinePct = Math.max(0, Math.min(100, Math.round(100 - (currentScore / Math.max(1, avg)) * 100)));
    const trend = Number(((currentScore - avg) / 100).toFixed(2));

    if (declinePct >= 20) {
      signals.push({
        organizationId,
        employeeId,
        source: 'system',
        category: 'behavioral',
        metric: 'activity_decline_pct',
        value: declinePct,
        unit: 'percent',
        periodStart: date,
        periodEnd,
        note: `Activity agent productivity score declined ${declinePct}% vs recent average.`,
      });
    }

    if (trend <= -0.2) {
      signals.push({
        organizationId,
        employeeId,
        source: 'system',
        category: 'performance',
        metric: 'productivity_trend',
        value: trend,
        unit: 'ratio',
        periodStart: date,
        periodEnd,
        note: 'Activity agent daily productivity trend is below recent baseline.',
      });
    }
  }

  const taskCompletion = scoreDoc?.subScores?.taskCompletion ?? scoreDoc?.breakdown?.taskCompletion;
  if (Number.isFinite(taskCompletion)) {
    signals.push({
      organizationId,
      employeeId,
      source: 'system',
      category: 'performance',
      metric: 'task_completion_rate',
      value: Math.round(taskCompletion),
      unit: 'percent',
      periodStart: date,
      periodEnd,
      note: `Activity agent productivity engine measured task completion at ${Math.round(taskCompletion)}%.`,
    });
  }

  const consistency = scoreDoc?.subScores?.consistency ?? scoreDoc?.breakdown?.idleControl;
  if (Number.isFinite(consistency)) {
    signals.push({
      organizationId,
      employeeId,
      source: 'system',
      category: 'performance',
      metric: 'delivery_consistency',
      value: Math.round(consistency),
      unit: 'percent',
      periodStart: date,
      periodEnd,
      note: `Activity agent productivity engine measured delivery consistency at ${Math.round(consistency)}%.`,
    });
  }

  const totalMinutes = totalMinutesFor(activityLog);
  const idleRatio = totalMinutes ? (activityLog?.idleMinutes || 0) / totalMinutes : 0;
  if (totalMinutes >= 60 && idleRatio >= 0.35) {
    signals.push({
      organizationId,
      employeeId,
      source: 'system',
      category: 'behavioral',
      metric: 'working_pattern_change',
      value: 1,
      unit: 'flag',
      periodStart: date,
      periodEnd,
      note: `Activity agent detected elevated idle time (${Math.round(idleRatio * 100)}%).`,
    });
  }

  const written = [];
  for (const signal of signals) written.push(await upsertActivityRiskSignal(signal));
  return written;
}

async function emitAttendanceRiskSignals({ organizationId, employeeId, date }) {
  const since30 = new Date(date);
  since30.setDate(since30.getDate() - 29);
  const since90 = new Date(date);
  since90.setDate(since90.getDate() - 89);
  const periodEnd = new Date(date);
  periodEnd.setDate(periodEnd.getDate() + 1);

  const [logs30, logs90] = await Promise.all([
    ActivityLog.find({ organizationId, employeeId, date: { $gte: since30, $lte: date } })
      .select('date loginTime logoutTime totalLoggedMinutes totalWorkMinutes activeMinutes idleMinutes breakMinutes'),
    ActivityLog.find({ organizationId, employeeId, date: { $gte: since90, $lte: date } })
      .select('date totalLoggedMinutes totalWorkMinutes activeMinutes idleMinutes breakMinutes'),
  ]);

  const workStart = 10 * 60;
  const workEnd = 18 * 60;
  const lateGraceMinutes = 15;
  const earlyGraceMinutes = 30;
  const absentThresholdMinutes = 60;
  const shortDayThresholdMinutes = 4 * 60;

  const lateArrivals = logs30.filter((log) => {
    const loginMinutes = minutesSinceMidnight(log.loginTime);
    return loginMinutes != null && loginMinutes > workStart + lateGraceMinutes;
  }).length;

  const earlyLogouts = logs30.filter((log) => {
    const logoutMinutes = minutesSinceMidnight(log.logoutTime);
    return logoutMinutes != null && logoutMinutes < workEnd - earlyGraceMinutes;
  }).length;

  const absentDays = logs30.filter((log) => totalMinutesFor(log) < absentThresholdMinutes).length;
  const leaveFreq = logs90.filter((log) => {
    const total = totalMinutesFor(log);
    return total >= absentThresholdMinutes && total < shortDayThresholdMinutes;
  }).length;

  const metrics = [
    ['late_arrivals_30d', lateArrivals, since30, `Activity agent detected ${lateArrivals} late arrival(s) in the last 30 tracked days.`],
    ['early_logouts_30d', earlyLogouts, since30, `Activity agent detected ${earlyLogouts} early logout(s) in the last 30 tracked days.`],
    ['absent_days_30d', absentDays, since30, `Activity agent detected ${absentDays} very low/no-activity tracked day(s) in the last 30 days.`],
    ['leave_freq_90d', leaveFreq, since90, `Activity agent detected ${leaveFreq} short tracked day(s) in the last 90 days.`],
  ];

  const written = [];
  for (const [metric, value, periodStart, note] of metrics) {
    written.push(await upsertActivityRiskSignal({
      organizationId,
      employeeId,
      source: 'system',
      category: 'attendance',
      metric,
      value,
      unit: 'count',
      periodStart,
      periodEnd,
      note,
    }));
  }
  return written;
}

async function refreshActivityRiskSignals({ organizationId, employeeId, date = new Date(), scoreDoc, activityLog }) {
  const targetDate = dayKey(date);
  const log = activityLog || await ActivityLog.findOne({
    organizationId,
    employeeId,
    date: { $lte: targetDate },
  }).sort({ date: -1 });
  const score = scoreDoc || await ProductivityScore.findOne({
    organizationId,
    employeeId,
    period: 'daily',
    date: { $lte: targetDate },
  }).sort({ date: -1 });
  const signalDate = dayKey(log?.date || score?.date || targetDate);

  const [productivitySignals, attendanceSignals] = await Promise.all([
    emitProductivityRiskSignals({ organizationId, employeeId, date: signalDate, scoreDoc: score, activityLog: log }),
    emitAttendanceRiskSignals({ organizationId, employeeId, date: signalDate }),
  ]);

  return {
    productivitySignals,
    attendanceSignals,
    total: productivitySignals.length + attendanceSignals.length,
  };
}

module.exports = {
  emitProductivityRiskSignals,
  emitAttendanceRiskSignals,
  refreshActivityRiskSignals,
};
