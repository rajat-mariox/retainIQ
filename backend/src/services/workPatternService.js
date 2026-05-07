/**
 * Work Pattern Service
 * Analyzes activity logs to derive an employee's productivity rhythm:
 * peak hours of day, best days of week, consistency.
 *
 * Note: This requires *hourly* granularity activity. Without it, we fall back
 * to day-of-week and overall consistency only.
 */

function analyzePatterns({ activities, hourlyActivities = [] }) {
  const result = {
    hourlyProfile: Array(24).fill(0),
    peakHours: [],
    dayOfWeekProfile: Array(7).fill(0),
    bestDays: [],
    consistencyScore: 50,
    avgDailyScore: 0,
    avgActiveHours: 0,
    avgMeetingHours: 0,
    avgDeepWorkMinutes: 0,
  };

  if (!activities || activities.length === 0) return result;

  // Day-of-week profile (uses activeMinutes per day)
  const dowSums = Array(7).fill(0);
  const dowCounts = Array(7).fill(0);
  for (const a of activities) {
    const dow = new Date(a.date).getDay();
    dowSums[dow] += a.activeMinutes || 0;
    dowCounts[dow] += 1;
  }
  result.dayOfWeekProfile = dowSums.map((s, i) => {
    if (!dowCounts[i]) return 0;
    const avgMin = s / dowCounts[i];
    return Math.min(100, Math.round((avgMin / 480) * 100));   // 480 min = 8h baseline
  });
  const maxDow = Math.max(...result.dayOfWeekProfile);
  result.bestDays = result.dayOfWeekProfile
    .map((v, i) => ({ v, i }))
    .filter((d) => d.v >= maxDow * 0.85 && d.v > 0)
    .map((d) => d.i);

  // Hourly profile from optional hourly buckets
  if (hourlyActivities.length > 0) {
    const hourSums = Array(24).fill(0);
    const hourCounts = Array(24).fill(0);
    for (const h of hourlyActivities) {
      hourSums[h.hour] += h.activeMinutes || 0;
      hourCounts[h.hour] += 1;
    }
    result.hourlyProfile = hourSums.map((s, i) => {
      if (!hourCounts[i]) return 0;
      const avgMin = s / hourCounts[i];
      return Math.min(100, Math.round((avgMin / 60) * 100));
    });
    // Peak hours: contiguous windows scoring >= 70
    const peaks = [];
    let start = null;
    for (let i = 0; i < 24; i++) {
      if (result.hourlyProfile[i] >= 70 && start === null) start = i;
      else if (result.hourlyProfile[i] < 70 && start !== null) {
        peaks.push({ start, end: i }); start = null;
      }
    }
    if (start !== null) peaks.push({ start, end: 24 });
    result.peakHours = peaks;
  }

  // Averages
  result.avgActiveHours = parseFloat((activities.reduce((s, a) => s + (a.activeMinutes || 0), 0) / activities.length / 60).toFixed(2));
  result.avgMeetingHours = parseFloat((activities.reduce((s, a) => s + (a.meetingMinutes || 0), 0) / activities.length / 60).toFixed(2));
  result.avgDeepWorkMinutes = Math.round(activities.reduce((s, a) => s + (a.deepWorkMinutes || 0), 0) / activities.length);

  return result;
}

module.exports = { analyzePatterns };
