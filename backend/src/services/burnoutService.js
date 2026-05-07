/**
 * Burnout Detection Service
 *
 * Detects burnout risk from sustained patterns, NOT single-day anomalies.
 * Inputs: activity logs over the last `windowDays` (default 14).
 */

function detectBurnout({ activities, productivityScores, thresholds = {} }) {
  const cfg = {
    maxHealthyDailyHours: 9,
    consecutiveOverworkDays: 5,
    minOutputDropPct: 15,
    weekendWorkRatio: 0.30,
    ...thresholds,
  };

  if (!activities || activities.length === 0) {
    return { atRisk: false, level: 'none', signals: [], score: 0 };
  }

  const sorted = [...activities].sort((a, b) => new Date(b.date) - new Date(a.date));
  const signals = [];
  let riskPoints = 0;

  // 1. Consecutive overwork days
  let streak = 0;
  for (const a of sorted) {
    const hours = (a.totalLoggedMinutes || 0) / 60;
    if (hours > cfg.maxHealthyDailyHours) streak += 1;
    else break;
  }
  if (streak >= cfg.consecutiveOverworkDays) {
    riskPoints += 35;
    signals.push(`${streak} consecutive days of >${cfg.maxHealthyDailyHours}h logged`);
  } else if (streak >= 3) {
    riskPoints += 15;
    signals.push(`${streak} long days in a row`);
  }

  // 2. Weekend / late-night work
  const weekendDays = sorted.filter((a) => {
    const d = new Date(a.date).getDay();
    return (d === 0 || d === 6) && (a.activeMinutes || 0) > 60;
  }).length;
  const weekendRatio = sorted.length > 0 ? weekendDays / sorted.length : 0;
  if (weekendRatio > cfg.weekendWorkRatio) {
    riskPoints += 20;
    signals.push(`Working on ${Math.round(weekendRatio * 100)}% of weekends`);
  }

  // 3. Output declining despite long hours
  if (productivityScores && productivityScores.length >= 7) {
    const recent = productivityScores.slice(0, 3).reduce((s, p) => s + p.score, 0) / 3;
    const prior = productivityScores.slice(4, 7).reduce((s, p) => s + p.score, 0) / 3;
    const dropPct = prior > 0 ? ((prior - recent) / prior) * 100 : 0;
    if (dropPct >= cfg.minOutputDropPct && streak >= 3) {
      riskPoints += 25;
      signals.push(`Output dropped ${Math.round(dropPct)}% despite long hours`);
    }
  }

  // 4. No break days
  const noBreakDays = sorted.slice(0, 14).filter((a) => (a.breakMinutes || 0) < 15).length;
  if (noBreakDays >= 10) {
    riskPoints += 15;
    signals.push('Almost no breaks taken in last 2 weeks');
  }

  // 5. Meeting overload
  const heavyMeetingDays = sorted.slice(0, 7).filter((a) => {
    const denom = (a.activeMinutes || 0) + (a.meetingMinutes || 0);
    return denom > 0 && (a.meetingMinutes / denom) > 0.5;
  }).length;
  if (heavyMeetingDays >= 4) {
    riskPoints += 10;
    signals.push(`${heavyMeetingDays} meeting-heavy days this week`);
  }

  let level = 'none';
  let atRisk = false;
  if (riskPoints >= 60) { level = 'critical'; atRisk = true; }
  else if (riskPoints >= 35) { level = 'high'; atRisk = true; }
  else if (riskPoints >= 15) { level = 'moderate'; atRisk = false; }

  return { atRisk, level, signals, score: Math.min(100, riskPoints) };
}

module.exports = { detectBurnout };
