const { z } = require('zod');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const Intervention = require('../models/Intervention');
const Employee = require('../models/Employee');
const { INTERVENTION_TYPES, INTERVENTION_STATUSES, ROLES } = require('../config/constants');

const createSchema = z.object({
  employeeId: z.string(),
  type: z.enum(INTERVENTION_TYPES),
  ownerId: z.string(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  followUpDate: z.string().optional(),
});

const updateSchema = z.object({
  status: z.enum(INTERVENTION_STATUSES).optional(),
  notes: z.string().optional(),
  outcome: z.string().optional(),
  followUpDate: z.string().optional(),
  dueDate: z.string().optional(),
});

exports.list = asyncHandler(async (req, res) => {
  const filter = { organizationId: req.organizationId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.employeeId) filter.employeeId = req.query.employeeId;
  if (req.user.role === ROLES.MANAGER) filter.ownerId = req.user._id;

  const items = await Intervention.find(filter)
    .populate('employeeId', 'name email designation currentRiskCategory currentRiskScore')
    .populate('ownerId', 'name email')
    .sort({ createdAt: -1 });
  res.json({ items });
});

exports.create = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const emp = await Employee.findOne({ _id: data.employeeId, organizationId: req.organizationId });
  if (!emp) throw new HttpError(404, 'Employee not found');
  const doc = await Intervention.create({
    ...data,
    organizationId: req.organizationId,
    riskScoreAtCreation: emp.currentRiskScore,
    riskCategoryAtCreation: emp.currentRiskCategory,
    createdBy: req.user._id,
  });
  res.status(201).json(doc);
});

exports.update = asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const filter = { _id: req.params.id, organizationId: req.organizationId };
  if (req.user.role === ROLES.MANAGER) filter.ownerId = req.user._id;

  if (data.status === 'completed' && !data.completedAt) data.completedAt = new Date();
  const doc = await Intervention.findOneAndUpdate(filter, data, { new: true });
  if (!doc) throw new HttpError(404, 'Intervention not found');
  res.json(doc);
});

exports.byEmployee = asyncHandler(async (req, res) => {
  const items = await Intervention.find({
    organizationId: req.organizationId,
    employeeId: req.params.employeeId,
  })
    .populate('ownerId', 'name email')
    .sort({ createdAt: -1 });
  res.json({ items });
});
