/**
 * RiskScoringService
 * ----------------------------------------------------------------------------
 * Rule-based attrition risk engine for the MVP.
 *
 * CONTRACT (stable — keep identical when swapping in an ML model):
 *
 *   Input: {
 *     employee:   Employee document
 *     signals:    Signal[]                 // raw signals for the window
 *     pulses:     PulseSurvey[]            // last N pulses
 *     priorAssessments: RiskAssessment[]   // last few historical scores (for trend)
 *     weights:    { attendance, performance, engagement, hr, behavioral }
 *   }
 *
 *   Output: {
 *     riskScore: number 0..100,
 *     category:  'Low' | 'Medium' | 'High' | 'Critical',
 *     confidence: number 0..1,
 *     trend:     'Improving' | 'Stable' | 'Worsening',
 *     componentScores: { attendance, performance, engagement, hr, behavioral },
 *     topFactors: string[],
 *     recommendedAction: string,
 *     engineVersion: string
 *   }
 *
 * DECISION-SUPPORT DISCLAIMER: The output is an indicator, not a verdict. It
 * must never be the sole basis for an employment decision.
 * ----------------------------------------------------------------------------
 */
const { RISK_CATEGORIES, TRENDS } = require('../config/constants');

const ENGINE_VERSION = 'rule-v1';

const DEFAULT_WEIGHTS = {
  attendance: 0.20,
  performance: 0.25,
  engagement: 0.25,
  hr: 0.20,
  behavioral: 0.10,
};

/** Pull the latest value for a given metric from a signal list. */
function latest(signals, category, metric) {
  const filtered = signals
    .filter((s) => s.category === category && s.metric === metric)
    .sort((a, b) => new Date(b.periodEnd) - new Date(a.periodEnd));
  return filtered[0]?.value;
}

/** Clamp helper. */
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** Map a 0..1 normalized stress to a 0..100 sub-score. */
const toSubScore = (stress) => Math.round(clamp(stress * 100));

// ---------------------------------------------------------------------------
// Component scorers — each returns { score: 0..100, factors: string[] }
// ---------------------------------------------------------------------------

function scoreAttendance(signals) {
  const factors = [];
  const lateArrivals = latest(signals, 'attendance', 'late_arrivals_30d') ?? 0;
  const earlyLogouts = latest(signals, 'attendance', 'early_logouts_30d') ?? 0;
  const absentDays = latest(signals, 'attendance', 'absent_days_30d') ?? 0;
  const leaveFreq = latest(signals, 'attendance', 'leave_freq_90d') ?? 0;
  const unexplained = latest(signals, 'attendance', 'unexplained_absences_30d') ?? 0;

  let stress = 0;
  if (lateArrivals >= 5) { stress += 0.20; factors.push(`${lateArrivals} late arrivals in last 30d`); }
  else if (lateArrivals >= 1) {
    stress += Math.min(0.10, lateArrivals * 0.04);
    factors.push(`${lateArrivals} late arrival(s) in last 30d`);
  }

  if (earlyLogouts >= 5) { stress += 0.15; factors.push(`${earlyLogouts} early logouts in last 30d`); }
  else if (earlyLogouts >= 1) {
    stress += Math.min(0.07, earlyLogouts * 0.03);
    factors.push(`${earlyLogouts} early logout(s) in last 30d`);
  }

  if (absentDays >= 5) { stress += 0.30; factors.push(`${absentDays} absent days in last 30d`); }
  else if (absentDays >= 1) {
    stress += Math.min(0.15, absentDays * 0.06);
    factors.push(`${absentDays} low/no-activity day(s) in last 30d`);
  }

  if (leaveFreq >= 8) { stress += 0.20; factors.push(`Elevated leave frequency (${leaveFreq} in 90d)`); }
  else if (leaveFreq >= 1) {
    stress += Math.min(0.10, leaveFreq * 0.025);
    factors.push(`${leaveFreq} short tracked day(s) in last 90d`);
  }

  if (unexplained >= 2) { stress += 0.25; factors.push(`${unexplained} unexplained absences`); }

  return { score: toSubScore(stress), factors };
}

function scorePerformance(signals) {
  const factors = [];
  const completion = latest(signals, 'performance', 'task_completion_rate'); // 0..100
  const overdue = latest(signals, 'performance', 'overdue_tasks') ?? 0;
  const productivityTrend = latest(signals, 'performance', 'productivity_trend'); // -1..+1
  const projectContribution = latest(signals, 'performance', 'project_contribution'); // 0..100
  const deliveryConsistency = latest(signals, 'performance', 'delivery_consistency'); // 0..100

  let stress = 0;
  if (completion != null) {
    if (completion < 50) { stress += 0.35; factors.push(`Low task completion (${completion}%)`); }
    else if (completion < 70) { stress += 0.20; factors.push(`Below-average task completion (${completion}%)`); }
    else if (completion < 85) stress += 0.05;
  }
  if (overdue >= 8) { stress += 0.25; factors.push(`${overdue} overdue tasks`); }
  else if (overdue >= 4) stress += 0.10;

  if (productivityTrend != null && productivityTrend < -0.2) {
    stress += 0.20; factors.push('Declining productivity trend');
  }
  if (projectContribution != null && projectContribution < 40) {
    stress += 0.10; factors.push('Low project contribution');
  }
  if (deliveryConsistency != null && deliveryConsistency < 50) {
    stress += 0.10; factors.push('Inconsistent delivery');
  }
  return { score: toSubScore(stress), factors };
}

function scoreEngagement(signals, pulses) {
  const factors = [];
  let stress = 0;

  // Use recent pulse surveys (mood + manager support + growth)
  if (pulses && pulses.length > 0) {
    const recent = pulses.slice(0, 3);
    const avg = (key) => recent.reduce((a, p) => a + p[key], 0) / recent.length;
    const mood = avg('moodScore');
    const support = avg('managerSupportScore');
    const growth = avg('growthSatisfactionScore');
    const workload = avg('workloadScore');

    if (mood <= 2) { stress += 0.30; factors.push(`Low average mood (${mood.toFixed(1)}/5)`); }
    else if (mood <= 3) stress += 0.15;

    if (support <= 2) { stress += 0.20; factors.push(`Low manager support score (${support.toFixed(1)}/5)`); }
    else if (support <= 3) stress += 0.08;

    if (growth <= 2) { stress += 0.20; factors.push(`Low growth satisfaction (${growth.toFixed(1)}/5)`); }
    else if (growth <= 3) stress += 0.08;

    if (workload <= 2) { stress += 0.15; factors.push(`Workload concerns (${workload.toFixed(1)}/5)`); }
  } else {
    // No recent pulse — slight stress because we have no signal
    stress += 0.10; factors.push('No recent pulse feedback');
  }

  const meetingPart = latest(signals, 'engagement', 'meeting_participation'); // 0..100
  if (meetingPart != null && meetingPart < 40) {
    stress += 0.10; factors.push('Low meeting participation');
  }
  const commDrop = latest(signals, 'engagement', 'communication_drop'); // 0..1
  if (commDrop != null && commDrop > 0.4) {
    stress += 0.10; factors.push('Reduced team communication');
  }

  return { score: toSubScore(stress), factors };
}

function scoreHR(signals, employee) {
  const factors = [];
  let stress = 0;

  const monthsSinceAppraisal = latest(signals, 'hr', 'months_since_appraisal')
    ?? monthsBetween(employee.lastAppraisalDate, new Date());
  const monthsSinceSalary = latest(signals, 'hr', 'months_since_salary_revision')
    ?? monthsBetween(employee.lastSalaryRevisionDate, new Date());
  const unresolved = latest(signals, 'hr', 'unresolved_complaints') ?? 0;
  const promoDelay = latest(signals, 'hr', 'promotion_delay_months') ?? 0;
  const trainingRate = latest(signals, 'hr', 'training_completion_rate'); // 0..100
  const retentionConvos = latest(signals, 'hr', 'retention_conversation_count') ?? 0;

  if (monthsSinceAppraisal != null && monthsSinceAppraisal >= 18) {
    stress += 0.25; factors.push(`No appraisal in ${monthsSinceAppraisal} months`);
  } else if (monthsSinceAppraisal >= 12) stress += 0.12;

  if (monthsSinceSalary != null && monthsSinceSalary >= 24) {
    stress += 0.25; factors.push(`No salary revision in ${monthsSinceSalary} months`);
  } else if (monthsSinceSalary >= 18) stress += 0.12;

  if (unresolved >= 1) { stress += 0.20; factors.push(`${unresolved} unresolved HR complaint(s)`); }
  if (promoDelay >= 12) { stress += 0.15; factors.push(`Promotion delayed ${promoDelay} months`); }
  if (trainingRate != null && trainingRate < 40) {
    stress += 0.05; factors.push('Low training completion');
  }
  if (retentionConvos >= 1) { stress += 0.10; factors.push('Prior retention conversation on record'); }

  return { score: toSubScore(stress), factors };
}

function scoreBehavioral(signals) {
  const factors = [];
  let stress = 0;
  const activityDecline = latest(signals, 'behavioral', 'activity_decline_pct') ?? 0; // 0..100
  const collabDrop = latest(signals, 'behavioral', 'collaboration_drop_pct') ?? 0;    // 0..100
  const shortLeaveFreq = latest(signals, 'behavioral', 'short_leave_freq') ?? 0;
  const patternChange = latest(signals, 'behavioral', 'working_pattern_change') ?? 0; // 0..1

  if (activityDecline >= 40) { stress += 0.35; factors.push(`Activity declined ${activityDecline}%`); }
  else if (activityDecline >= 20) stress += 0.18;

  if (collabDrop >= 40) { stress += 0.30; factors.push(`Collaboration dropped ${collabDrop}%`); }
  else if (collabDrop >= 20) stress += 0.15;

  if (shortLeaveFreq >= 4) { stress += 0.20; factors.push(`${shortLeaveFreq} short leaves recently`); }
  if (patternChange >= 0.5) { stress += 0.15; factors.push('Significant change in working pattern'); }

  return { score: toSubScore(stress), factors };
}

function monthsBetween(from, to) {
  if (!from) return null;
  const a = new Date(from), b = new Date(to);
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

// ---------------------------------------------------------------------------
// Categorization, trend, confidence, recommendation
// ---------------------------------------------------------------------------

function categorize(score) {
  if (score <= 30) return RISK_CATEGORIES.LOW;
  if (score <= 55) return RISK_CATEGORIES.MEDIUM;
  if (score <= 75) return RISK_CATEGORIES.HIGH;
  return RISK_CATEGORIES.CRITICAL;
}

function computeTrend(currentScore, priorAssessments) {
  if (!priorAssessments || priorAssessments.length === 0) return TRENDS.STABLE;
  const prev = priorAssessments[0].riskScore;
  const delta = currentScore - prev;
  if (delta >= 8) return TRENDS.WORSENING;
  if (delta <= -8) return TRENDS.IMPROVING;
  return TRENDS.STABLE;
}

/** Confidence is higher when we have more diverse signals and recent pulse data. */
function computeConfidence(signals, pulses) {
  const categoriesPresent = new Set(signals.map((s) => s.category)).size;
  let conf = 0.4 + categoriesPresent * 0.10;     // up to +0.50 for 5 cats
  if (pulses && pulses.length >= 1) conf += 0.05;
  if (pulses && pulses.length >= 3) conf += 0.05;
  return Math.min(0.95, parseFloat(conf.toFixed(2)));
}

function fallbackRecommendation(category, topFactors) {
  const headline = {
    [RISK_CATEGORIES.LOW]: 'Continue routine check-ins and maintain current engagement practices.',
    [RISK_CATEGORIES.MEDIUM]: 'Schedule a casual 1:1 within 2 weeks; explore workload and growth.',
    [RISK_CATEGORIES.HIGH]: 'Schedule a private 1:1 within 5 working days; review workload, growth, and recognition.',
    [RISK_CATEGORIES.CRITICAL]: 'Immediate manager + HR conversation within 3 working days; assess concrete retention levers.',
  }[category];
  if (!topFactors.length) return headline;
  return `${headline} Top concerns: ${topFactors.slice(0, 3).join('; ')}.`;
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

function calculateRisk({ employee, signals = [], pulses = [], priorAssessments = [], weights }) {
  const W = { ...DEFAULT_WEIGHTS, ...(weights || {}) };

  const att = scoreAttendance(signals);
  const perf = scorePerformance(signals);
  const eng = scoreEngagement(signals, pulses);
  const hr = scoreHR(signals, employee);
  const beh = scoreBehavioral(signals);

  const weighted =
    att.score * W.attendance +
    perf.score * W.performance +
    eng.score * W.engagement +
    hr.score * W.hr +
    beh.score * W.behavioral;

  const riskScore = Math.round(clamp(weighted));
  const category = categorize(riskScore);
  const trend = computeTrend(riskScore, priorAssessments);
  const confidence = computeConfidence(signals, pulses);

  // Pick top factors weighted by component contribution
  const components = [
    { name: 'attendance', score: att.score, factors: att.factors, w: W.attendance },
    { name: 'performance', score: perf.score, factors: perf.factors, w: W.performance },
    { name: 'engagement', score: eng.score, factors: eng.factors, w: W.engagement },
    { name: 'hr', score: hr.score, factors: hr.factors, w: W.hr },
    { name: 'behavioral', score: beh.score, factors: beh.factors, w: W.behavioral },
  ];
  components.sort((a, b) => (b.score * b.w) - (a.score * a.w));
  const topFactors = components.flatMap((c) => c.factors).slice(0, 5);

  return {
    riskScore,
    category,
    confidence,
    trend,
    componentScores: {
      attendance: att.score,
      performance: perf.score,
      engagement: eng.score,
      hr: hr.score,
      behavioral: beh.score,
    },
    topFactors,
    recommendedAction: fallbackRecommendation(category, topFactors),
    engineVersion: ENGINE_VERSION,
  };
}

module.exports = {
  calculateRisk,
  ENGINE_VERSION,
  DEFAULT_WEIGHTS,
  // Exposed for unit tests
  _internal: { scoreAttendance, scorePerformance, scoreEngagement, scoreHR, scoreBehavioral, categorize },
};
