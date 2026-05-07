
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const Organization = require('../models/Organization');
const Employee = require('../models/Employee');
const Signal = require('../models/Signal');
const PulseSurvey = require('../models/PulseSurvey');
const RiskAssessment = require('../models/RiskAssessment');
const { calculateRisk } = require('../services/riskScoringService');

async function run() {
  await connectDB();
  const orgs = await Organization.find({ isActive: true });
  let processed = 0;
  for (const org of orgs) {
    const employees = await Employee.find({ organizationId: org._id, status: 'active' });
    for (const emp of employees) {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);
      const [signals, pulses, prior] = await Promise.all([
        Signal.find({ organizationId: org._id, employeeId: emp._id, periodEnd: { $gte: ninetyDaysAgo } }),
        PulseSurvey.find({ organizationId: org._id, employeeId: emp._id }).sort({ createdAt: -1 }).limit(5),
        RiskAssessment.find({ organizationId: org._id, employeeId: emp._id }).sort({ computedAt: -1 }).limit(3),
      ]);
      const result = calculateRisk({
        employee: emp, signals, pulses, priorAssessments: prior,
        weights: org.settings?.riskWeights,
      });
      await RiskAssessment.create({ organizationId: org._id, employeeId: emp._id, ...result });
      emp.currentRiskScore = result.riskScore;
      emp.currentRiskCategory = result.category;
      emp.currentRiskTrend = result.trend;
      emp.currentRiskUpdatedAt = new Date();
      await emp.save();
      processed++;
    }
  }
  console.log(`[job] scored ${processed} employees across ${orgs.length} orgs`);
  await mongoose.disconnect();
}

if (require.main === module) {
  run().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = run;
