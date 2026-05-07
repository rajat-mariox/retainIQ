const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const Employee = require('../models/Employee');
const Organization = require('../models/Organization');
const ProductivityScore = require('../models/ProductivityScore');
const ROIData = require('../models/ROIData');
const { calculateROI } = require('../services/roiService');

const DAY = 24 * 60 * 60 * 1000;

async function rangeFor(period, ref = new Date()) {
  const end = new Date(ref); end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  if (period === 'weekly') start.setDate(start.getDate() - 7);
  else start.setDate(start.getDate() - 30);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

exports.computeForEmployee = asyncHandler(async (req, res) => {
  const period = req.query.period === 'weekly' ? 'weekly' : 'monthly';
  const org = await Organization.findById(req.organizationId);
  if (!org?.settings?.productivity?.roiEnabled) {
    throw new HttpError(403, 'ROI tracking disabled for this organization. Enable in settings.');
  }
  const employee = await Employee.findOne({ _id: req.params.employeeId, organizationId: req.organizationId });
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (!employee.monthlyCost) throw new HttpError(400, 'Employee has no monthlyCost set');

  const { start, end } = await rangeFor(period);
  const productivityScores = await ProductivityScore.find({
    organizationId: req.organizationId, employeeId: employee._id, period: 'daily', date: { $gte: start, $lte: end },
  });

  const result = calculateROI({ employee, productivityScores, periodStart: start, periodEnd: end });
  const doc = await ROIData.create({
    organizationId: req.organizationId, employeeId: employee._id,
    period, periodStart: start, periodEnd: end, ...result,
  });
  res.json(doc);
});

exports.dashboard = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.organizationId);
  if (!org?.settings?.productivity?.roiEnabled) {
    return res.json({ enabled: false, message: 'ROI tracking is disabled.' });
  }
  const period = req.query.period === 'weekly' ? 'weekly' : 'monthly';
  const { start, end } = await rangeFor(period);
  const employees = await Employee.find({ organizationId: req.organizationId, status: 'active', monthlyCost: { $gt: 0 } });

  const items = [];
  for (const e of employees) {
    const productivityScores = await ProductivityScore.find({
      organizationId: req.organizationId, employeeId: e._id, period: 'daily', date: { $gte: start, $lte: end },
    });
    const r = calculateROI({ employee: e, productivityScores, periodStart: start, periodEnd: end });
    items.push({ employee: { _id: e._id, name: e.name, designation: e.designation }, ...r });
  }
  const totals = items.reduce((acc, x) => ({
    totalCost: acc.totalCost + x.monthlyCost,
    totalValue: acc.totalValue + x.estimatedOutputValue,
    totalNet: acc.totalNet + x.netValue,
  }), { totalCost: 0, totalValue: 0, totalNet: 0 });
  totals.companyROI = totals.totalCost ? parseFloat((totals.totalValue / totals.totalCost).toFixed(2)) : 0;
  res.json({ enabled: true, period, items, totals });
});
