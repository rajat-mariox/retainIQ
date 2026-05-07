const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const Report = require('../models/Report');
const Employee = require('../models/Employee');
const reportService = require('../services/reportService');
const { ROLES } = require('../config/constants');

exports.generate = asyncHandler(async (req, res) => {
  const { scope, period, employeeId, departmentId, managerId } = req.body;
  if (!['employee', 'team', 'company'].includes(scope)) throw new HttpError(400, 'Invalid scope');
  if (!['daily', 'weekly', 'monthly'].includes(period)) throw new HttpError(400, 'Invalid period');

  let payload;
  if (scope === 'employee') {
    if (!employeeId) throw new HttpError(400, 'employeeId required');
    payload = await reportService.buildEmployeeReport({ orgId: req.organizationId, employeeId, period });
  } else if (scope === 'team') {
    payload = await reportService.buildTeamReport({ orgId: req.organizationId, departmentId, managerId, period });
  } else {
    payload = await reportService.buildCompanyReport({ orgId: req.organizationId, period });
  }

  const doc = await Report.create(payload);
  res.status(201).json(doc);
});

exports.list = asyncHandler(async (req, res) => {
  const filter = { organizationId: req.organizationId };
  if (req.query.scope) filter.scope = req.query.scope;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.employeeId) filter.employeeId = req.query.employeeId;

  // Manager can only see their team reports / own
  if (req.user.role === ROLES.MANAGER) {
    const me = await Employee.findOne({ organizationId: req.organizationId, email: req.user.email });
    if (me) {
      filter.$or = [{ managerId: me._id }, { employeeId: me._id }];
    }
  }

  const items = await Report.find(filter)
    .sort({ periodEnd: -1 })
    .limit(50)
    .populate('employeeId', 'name designation');
  res.json({ items });
});

exports.get = asyncHandler(async (req, res) => {
  const doc = await Report.findOne({ _id: req.params.id, organizationId: req.organizationId })
    .populate('employeeId', 'name designation departmentId');
  if (!doc) throw new HttpError(404, 'Report not found');
  res.json(doc);
});

exports.previewEmployee = asyncHandler(async (req, res) => {
  const period = req.query.period || 'weekly';
  const data = await reportService.buildEmployeeReport({
    orgId: req.organizationId, employeeId: req.params.employeeId, period,
  });
  res.json(data);
});
