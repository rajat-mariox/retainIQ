/**
 * ProductivityScoringService
 * ----------------------------------------------------------------------------
 * Computes a 0..100 productivity score from non-invasive ActivityLog data.
 *
 * STABLE CONTRACT (so an ML model can replace this later without changing callers):
 *
 *   Input: {
 *     employee:   Employee document
 *     activity:   ActivityLog for the day (single doc) OR array for a window
 *     historical: ProductivityScore[] // last 14 daily scores (for consistency)
 *     weights:    { timeUtilization, taskCompletion, meetingEfficiency, engagement, consistency, focus }
 *   }
 *
 *   Output: {
 *     score: 0..100,
 *     band: 'High Performer' | 'Stable' | 'Needs Attention',
 *     subScores: { timeUtilization, taskCompletion, meetingEfficiency, engagement, consistency, focus },
 *     efficiency: { tasksPerActiveHour, normalized },   // output / time
 *     flags: string[],                                  // burnout_risk, low_focus, ...
 *     insights: string[],                               // human-readable bullets
 *     engineVersion: 'prod-v1'
 *   }
 *
 * PRIVACY:
 *   • All inputs are aggregates the org already produced.
 *   • No raw activity content (no URLs, no app names beyond category, no message text)
 *   • The score is decision-support only, never the sole basis for HR decisions.
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
const round = (v) => Math.round(v);

// ---------------------------------------------------------------------------
// Sub-score calculators
// ---------------------------------------------------------------------------

/**
 * Time utilization: ratio of active time to total logged time, with diminishing
 * returns above ~7 active hours. Penalize if total logged is very low (<3h)
 * or excessively high (>11h, indicates overwork — capped not amplified).
 */
function scoreTimeUtilization(a) {
  const total = a.totalLoggedMinutes || (a.activeMinutes + a.idleMinutes + a.meetingMinutes);
  if (!total) return { score: 0, factor: null };
  const activeRatio = a.activeMinutes / total;
  let s = activeRatio * 100;
  // Reward "healthy" working hours (4-8h active) more than longer days
  const activeH = a.activeMinutes / 60;
  if (activeH < 3) s *= 0.6;
  else if (activeH > 10) s *= 0.85;
  return { score: round(clamp(s)), factor: activeH > 10 ? 'Excessive working hours' : null };
}

/**
 * Task completion: rate of tasks completed vs (completed + overdue), shaped by
 * absolute output relative to a reasonable baseline (~3 tasks/day for IC roles).
 */
function scoreTaskCompletion(a) {
  const completed = a.tasksCompleted || 0;
  const overdue = a.tasksOverdue || 0;
  const totalSignals = completed + (a.commits || 0) + (a.pullRequests || 0) + (a.ticketsResolved || 0);

  if (completed + overdue === 0 && totalSignals === 0) {
    return { score: 50, factor: 'No task data for this day' }; // neutral
  }
  const denom = completed + overdue;
  const completionRatio = denom > 0 ? completed / denom : 0;
  // Output volume vs baseline of 3 tasks/day equivalent
  const outputPoints = Math.min(1, totalSignals / 3);
  const s = (completionRatio * 0.6 + outputPoints * 0.4) * 100;
  return {
    score: round(clamp(s)),
    factor: overdue > completed && overdue >= 3 ? `${overdue} tasks overdue` : null,
  };
}

/**
 * Meeting efficiency: too many meetings vs output is bad; balanced is good.
 * Sweet spot: meeting time 10-30% of active time, with positive task throughput.
 */
function scoreMeetingEfficiency(a) {
  const active = a.activeMinutes || 0;
  const meeting = a.meetingMinutes || 0;
  const denom = active + meeting;
  if (denom < 30) return { score: 50, factor: null };
  const meetingRatio = meeting / denom;
  let s;
  if (meetingRatio < 0.10) s = 80;
  else if (meetingRatio < 0.30) s = 95;
  else if (meetingRatio < 0.50) s = 60;
  else s = 30;
  // If lots of meetings but tasks completed too, soften the penalty
  if (meetingRatio >= 0.30 && (a.tasksCompleted || 0) >= 2) s = Math.min(100, s + 15);

  const factor = meetingRatio >= 0.50
    ? `Meetings consumed ${Math.round(meetingRatio * 100)}% of working time`
    : null;
  return { score: round(clamp(s)), factor };
}

/**
 * Engagement: app-mix quality — coding/docs/design/communication count as
 * engaged work, idle and "other" lower the score. Pure ratio, 0..100.
 */
function scoreEngagement(a) {
  const u = a.appUsageMinutes || {};
  const productive = (u.coding || 0) + (u.docs || 0) + (u.design || 0);
  const collab = u.communication || 0;
  const meeting = u.meeting || 0;
  const idle = u.idle || 0;
  const other = u.other || 0;
  const total = productive + collab + meeting + idle + other;
  if (total < 30) return { score: 50, factor: null };
  // Weighted goodness
  const goodness = (productive * 1.0 + collab * 0.7 + meeting * 0.5 + other * 0.2 + idle * 0.0) / total;
  const score = round(clamp(goodness * 100));
  const idleRatio = idle / total;
  return {
    score,
    factor: idleRatio > 0.30 ? `${Math.round(idleRatio * 100)}% idle time` : null,
  };
}

/**
 * Consistency: stdev of daily scores over last 14 days. Lower stdev = more consistent.
 */
function scoreConsistency(historical) {
  if (!historical || historical.length < 3) return { score: 60, factor: null };
  const scores = historical.map((h) => h.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const stdev = Math.sqrt(variance);
  // Map stdev (0..40) -> score (100..40). Lower stdev is better.
  const s = clamp(100 - stdev * 1.5, 30, 100);
  return { score: round(s), factor: stdev > 25 ? 'Inconsistent daily output' : null };
}

/**
 * Focus: deep-work blocks and inverse of context switching.
 */
function scoreFocus(a) {
  const dwMin = a.deepWorkMinutes || 0;
  const switches = a.appSwitchCount || 0;
  // Aim: 90+ deep-work minutes in a day, < 50 app switches
  const deepWorkPart = Math.min(100, (dwMin / 90) * 100);
  const switchPart = clamp(100 - Math.max(0, switches - 50) * 1.2, 0, 100);
  const s = deepWorkPart * 0.6 + switchPart * 0.4;
  return {
    score: round(clamp(s)),
    factor: dwMin < 30 && switches > 80 ? 'Low deep-work time, high context switching' : null,
  };
}

// ---------------------------------------------------------------------------
// Bands, flags, efficiency
// ---------------------------------------------------------------------------

function bandFor(score) {
  if (score >= 75) return 'High Performer';
  if (score >= 50) return 'Stable';
  return 'Needs Attention';
}

function computeEfficiency(a) {
  const activeHours = (a.activeMinutes || 0) / 60;
  const outputUnits = (a.tasksCompleted || 0) + (a.commits || 0) * 0.5 + (a.pullRequests || 0) + (a.ticketsResolved || 0);
  if (activeHours < 0.5) return { tasksPerActiveHour: 0, normalized: 0 };
  const rate = outputUnits / activeHours;
  // Normalize: 1 unit/hr → 60, 2/hr → 90, 3+/hr → 100
  const normalized = round(clamp(Math.min(100, rate * 50 + 10)));
  return { tasksPerActiveHour: parseFloat(rate.toFixed(2)), normalized };
}

function detectFlags(a, subScores, historical) {
  const flags = [];
  const activeH = (a.activeMinutes || 0) / 60;
  const totalH = (a.totalLoggedMinutes || 0) / 60;

  if (totalH > 11 || activeH > 10) flags.push('overwork');
  if (subScores.focus < 40) flags.push('low_focus');
  if ((a.idleMinutes || 0) / Math.max(1, a.totalLoggedMinutes) > 0.4) flags.push('high_idle');

  const meetingRatio = (a.meetingMinutes || 0) / Math.max(1, a.activeMinutes + a.meetingMinutes);
  if (meetingRatio > 0.5) flags.push('meeting_overload');

  // Burnout: 5+ consecutive days of >9h logged with declining score
  if (historical && historical.length >= 5) {
    const last5 = historical.slice(0, 5);
    const allLong = last5.every((h) => (h.metricsTotalHours || 0) > 9);
    const declining = last5[0].score < last5[last5.length - 1].score - 5;
    if (allLong && declining) flags.push('burnout_risk');
  }
  // Productivity drop: today is significantly below 7-day average
  if (historical && historical.length >= 7) {
    const last7avg = historical.slice(0, 7).reduce((s, h) => s + h.score, 0) / 7;
    if (last7avg - subScores.overall > 15) flags.push('productivity_drop');
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

function calculateProductivity({ employee, activity, historical = [], weights }) {
  const W = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const a = activity || {};

  const tu = scoreTimeUtilization(a);
  const tc = scoreTaskCompletion(a);
  const me = scoreMeetingEfficiency(a);
  const en = scoreEngagement(a);
  const co = scoreConsistency(historical);
  const fo = scoreFocus(a);

  const score = round(clamp(
    tu.score * W.timeUtilization +
    tc.score * W.taskCompletion +
    me.score * W.meetingEfficiency +
    en.score * W.engagement +
    co.score * W.consistency +
    fo.score * W.focus
  ));

  const band = bandFor(score);
  const subScores = {
    timeUtilization: tu.score,
    taskCompletion: tc.score,
    meetingEfficiency: me.score,
    engagement: en.score,
    consistency: co.score,
    focus: fo.score,
    overall: score,
  };

  const flags = detectFlags(a, subScores, historical);
  const efficiency = computeEfficiency(a);

  const insights = [tu.factor, tc.factor, me.factor, en.factor, co.factor, fo.factor]
    .filter(Boolean);
  if (band === 'High Performer' && !insights.length) insights.push('Strong, balanced day across all dimensions.');

  return {
    score,
    band,
    subScores: {
      timeUtilization: tu.score,
      taskCompletion: tc.score,
      meetingEfficiency: me.score,
      engagement: en.score,
      consistency: co.score,
      focus: fo.score,
    },
    efficiency,
    flags,
    insights,
    engineVersion: ENGINE_VERSION,
  };
}

module.exports = {
  calculateProductivity,
  ENGINE_VERSION,
  DEFAULT_WEIGHTS,
  bandFor,
  _internal: {
    scoreTimeUtilization, scoreTaskCompletion, scoreMeetingEfficiency,
    scoreEngagement, scoreConsistency, scoreFocus, computeEfficiency, detectFlags,
  },
};
