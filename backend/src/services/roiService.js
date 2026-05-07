/**
 * ROI Calculation Service
 *
 * Estimated ROI = (avgProductivityScore/100) × productiveHours × roleValuePerHour
 *
 * - monthlyCost: pulled from Employee.monthlyCost (org-controlled, optional).
 * - roleValuePerHour: org-defined benchmark per role/level. Defaults to 2× hourly cost.
 *
 * IMPORTANT: This is a coarse trend signal. Use to spot extreme over-/under-
 * utilization, not for individual compensation decisions.
 */
function calculateROI({ employee, productivityScores, periodStart, periodEnd }) {
  const days = Math.max(1, Math.round((periodEnd - periodStart) / (1000 * 60 * 60 * 24)));
  const monthlyCost = employee.monthlyCost || 0;
  const cost = (monthlyCost / 30) * days;

  if (!productivityScores || productivityScores.length === 0) {
    return {
      monthlyCost: cost,
      estimatedOutputValue: 0,
      roiRatio: 0,
      netValue: -cost,
      band: 'Neutral',
      inputs: { avgProductivityScore: 0, productiveHours: 0, valuePerHour: 0, currency: employee.currency || 'USD' },
    };
  }

  const avgScore = productivityScores.reduce((s, p) => s + p.score, 0) / productivityScores.length;
  // Productive hours from sub-scores: timeUtilization gives us the active fraction
  // We approximate productive hours = sum of active hours × (overall score/100)
  const productiveHours = productivityScores.reduce((s, p) => {
    const activeH = (p.subScores?.timeUtilization || 50) / 100 * 8; // 8h baseline
    return s + activeH * (p.score / 100);
  }, 0);

  // Value per hour: org-defined or default 2× hourly cost (assumes 160 working hrs/mo)
  const hourlyCost = monthlyCost / 160;
  const valuePerHour = employee.roleValuePerHour || hourlyCost * 2;

  const estimatedOutputValue = productiveHours * valuePerHour;
  const netValue = estimatedOutputValue - cost;
  const roiRatio = cost > 0 ? estimatedOutputValue / cost : 0;

  let band;
  if (roiRatio >= 2) band = 'Strong Positive';
  else if (roiRatio >= 1.2) band = 'Positive';
  else if (roiRatio >= 0.8) band = 'Neutral';
  else band = 'Negative';

  return {
    monthlyCost: Math.round(cost),
    estimatedOutputValue: Math.round(estimatedOutputValue),
    roiRatio: parseFloat(roiRatio.toFixed(2)),
    netValue: Math.round(netValue),
    band,
    inputs: {
      avgProductivityScore: parseFloat(avgScore.toFixed(1)),
      productiveHours: parseFloat(productiveHours.toFixed(1)),
      valuePerHour: parseFloat(valuePerHour.toFixed(2)),
      currency: employee.currency || 'USD',
    },
  };
}

module.exports = { calculateROI };
