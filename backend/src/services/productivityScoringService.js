/**
 * ProductivityScoringService
 * ----------------------------------------------------------------------------
 * Privacy-first productivity scoring based on aggregate work signals.
 * No keystroke logging, screenshots, or private message content is used.
 * ----------------------------------------------------------------------------
 */

const ENGINE_VERSION = 'prod-v1';

const DEFAULT_WEIGHTS = {
  timeUtilization: 0.20,
  taskCompletion: 0.30,
  meetingEfficiency: 0.10,
  engagement: 0.10,
  consistency: 0.15,
  focus: 0.15,
};

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round = (v) => Math.round(clamp(Number.isFinite(v) ? v : 0));

function scoreTimeUtilization(activity = {}) {
  const total = activity.totalLoggedMinutes || activity.activeMinutes + activity.idleMinutes + activity.meetingMinutes;
  if (!total) return 0;
  const activeRatio = (activity.activeMinutes || 0) / total;
  const idleRatio = (activity.idleMinutes || 0) / total;
  const breakRatio = (activity.breakMinutes || 0) / total;
  return round(activeRatio * 100 - idleRatio * 20 - Math.max(0, breakRatio - 0.15) * 35);
}

function scoreTaskCompletion(activity = {}) {
  const done = activity.tasksCompleted || 0;
  const overdue = activity.tasksOverdue || 0;
  const total = done + overdue;
  if (!total) return 50;
  return round((done / total) * 100 - overdue * 4);
}

function scoreMeetingEfficiency(activity = {}) {
  const active = activity.activeMinutes || 0;
  const meetings = activity.meetingMinutes || 0;
  if (!active && !meetings) return 50;
  const ratio = meetings / Math.max(1, active + meetings);
  if (ratio <= 0.25) return round(90 - ratio * 20);
  if (ratio <= 0.45) return round(80 - (ratio - 0.25) * 80);
  return round(65 - (ratio - 0.45) * 120);
}

function scoreEngagement(activity = {}) {
  const commits = activity.commits || 0;
  const prs = activity.pullRequests || 0;
  const tickets = activity.ticketsResolved || 0;
  const selfReportBonus = activity.source === 'self_report' ? 3 : 0;
  return round(45 + commits * 5 + prs * 8 + tickets * 6 + selfReportBonus);
}

function scoreConsistency({ activity = {}, historical = [] } = {}) {
  if (historical.length < 3) return 65;
  const scores = historical.map((h) => h.score).filter((s) => Number.isFinite(s));
  if (scores.length < 3) return 65;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
  const stdev = Math.sqrt(variance);
  const loginBonus = activity.loginTime ? 4 : 0;
  return round(100 - stdev * 1.5 + loginBonus);
}

function scoreFocus(activity = {}) {
  const deepWork = activity.deepWorkMinutes || 0;
  const switches = activity.appSwitchCount || 0;
  const active = activity.activeMinutes || 0;
  const focusRatio = active ? deepWork / active : 0;
  return round(55 + focusRatio * 50 - Math.max(0, switches - 35) * 0.45);
}

function bandFor(score) {
  if (score >= 75) return 'High Performer';
  if (score >= 50) return 'Stable';
  return 'Needs Attention';
}

function computeEfficiency(activity = {}) {
  const activeHours = (activity.activeMinutes || 0) / 60;
  const tasks = activity.tasksCompleted || 0;
  if (activeHours < 0.5) return { tasksPerActiveHour: 0, normalized: 0 };
  const rate = tasks / activeHours;
  return { tasksPerActiveHour: Number(rate.toFixed(2)), normalized: round(rate * 20) };
}

function detectFlags({ score, subScores, activity, historical = [] }) {
  const flags = [];
  if (score < 50) flags.push('low_productivity');
  if (subScores.focus < 45) flags.push('low_focus');
  if (subScores.meetingEfficiency < 45) flags.push('meeting_overload');
  if ((activity.totalLoggedMinutes || 0) > 10 * 60 && score < 60) flags.push('burnout_risk');

  const recent = historical.slice(0, 7).map((h) => h.score).filter((s) => Number.isFinite(s));
  if (recent.length >= 5) {
    const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
    if (score < avg - 12) flags.push('productivity_drop');
  }
  return flags;
}

function calculateProductivity({ activity, historical = [], weights } = {}) {
  const W = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const subScores = {
    timeUtilization: scoreTimeUtilization(activity),
    taskCompletion: scoreTaskCompletion(activity),
    meetingEfficiency: scoreMeetingEfficiency(activity),
    engagement: scoreEngagement(activity),
    consistency: scoreConsistency({ activity, historical }),
    focus: scoreFocus(activity),
  };

  const score = round(
    subScores.timeUtilization * W.timeUtilization +
    subScores.taskCompletion * W.taskCompletion +
    subScores.meetingEfficiency * W.meetingEfficiency +
    subScores.engagement * W.engagement +
    subScores.consistency * W.consistency +
    subScores.focus * W.focus
  );

  const flags = detectFlags({ score, subScores, activity, historical });
  const insights = [];
  if (subScores.focus < 50) insights.push('Focus is being reduced by low deep-work time or high context switching.');
  if (subScores.meetingEfficiency < 50) insights.push('Meeting load is high compared with active work time.');
  if (flags.includes('burnout_risk')) insights.push('Long work hours with lower output may indicate burnout risk.');
  if (flags.includes('productivity_drop')) insights.push('Score is below recent trend.');

  return {
    score,
    band: bandFor(score),
    subScores,
    efficiency: computeEfficiency(activity),
    flags,
    insights,
    engineVersion: ENGINE_VERSION,
  };
}

module.exports = {
  ENGINE_VERSION,
  DEFAULT_WEIGHTS,
  calculateProductivity,
  _internal: {
    scoreTimeUtilization,
    scoreTaskCompletion,
    scoreMeetingEfficiency,
    scoreEngagement,
    scoreConsistency,
    scoreFocus,
    bandFor,
    computeEfficiency,
    detectFlags,
  },
};
