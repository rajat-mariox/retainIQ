const { z } = require('zod');
const mongoose = require('mongoose');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const { ROLES, EMPLOYMENT_STATUS } = require('../config/constants');

const createSchema = z.object({
  employeeCode: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  departmentId: z.string().optional(),
  designation: z.string().optional(),
  reportingManagerId: z.string().optional(),
  joiningDate: z.string().optional(),
  salaryBand: z.string().optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).optional(),
  workMode: z.enum(['office', 'hybrid', 'remote']).optional(),
  status: z.enum(Object.values(EMPLOYMENT_STATUS)).optional(),
  monthlyCost: z.number().min(0).optional(),
  roleValuePerHour: z.number().min(0).optional(),
  currency: z.string().optional(),
});

/**
 * scopeFilter — restricts what a Manager can see to direct reports only.
 * SUPER_ADMIN sees across orgs; ORG_ADMIN/HR sees the whole org;
 * MANAGER sees their direct reports; EMPLOYEE has its own dedicated endpoints.
 */
async function scopeFilter(user) {
  const base = { organizationId: user.organizationId };
  if (user.role === ROLES.MANAGER) {
    const me = await Employee.findOne({ organizationId: user.organizationId, email: user.email });
    if (!me) return { ...base, _id: null }; // no reports visible
    base.reportingManagerId = me._id;
  }
  return base;
}

exports.list = asyncHandler(async (req, res) => {
  const { search, departmentId, riskCategory, status, page = 1, limit = 25 } = req.query;
  const filter = await scopeFilter(req.user);
  if (search) filter.$or = [
    { name: new RegExp(search, 'i') },
    { email: new RegExp(search, 'i') },
    { designation: new RegExp(search, 'i') },
  ];
  if (departmentId) filter.departmentId = departmentId;
  if (status) filter.status = status;
  if (riskCategory) filter.currentRiskCategory = riskCategory;

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Employee.find(filter)
      .populate('departmentId', 'name')
      .populate('reportingManagerId', 'name email')
      .sort({ currentRiskScore: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Employee.countDocuments(filter),
  ]);
  res.json({ items, total, page: Number(page), limit: Number(limit) });
});

exports.get = asyncHandler(async (req, res) => {
  const filter = await scopeFilter(req.user);
  filter._id = req.params.id;
  const emp = await Employee.findOne(filter)
    .populate('departmentId', 'name')
    .populate('reportingManagerId', 'name email');
  if (!emp) throw new HttpError(404, 'Employee not found');
  res.json(emp);
});

exports.create = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const exists = await Employee.findOne({ organizationId: req.organizationId, email: data.email.toLowerCase() });
  if (exists) throw new HttpError(409, 'Employee email already exists');
  const emp = await Employee.create({
    ...data,
    email: data.email.toLowerCase(),
    organizationId: req.organizationId,
    createdBy: req.user._id,
  });
  res.status(201).json(emp);
});

exports.update = asyncHandler(async (req, res) => {
  const data = createSchema.partial().parse(req.body);
  const emp = await Employee.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.organizationId },
    data,
    { new: true }
  );
  if (!emp) throw new HttpError(404, 'Employee not found');
  res.json(emp);
});

exports.remove = asyncHandler(async (req, res) => {
  const emp = await Employee.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.organizationId },
    { status: EMPLOYMENT_STATUS.INACTIVE },
    { new: true }
  );
  if (!emp) throw new HttpError(404, 'Employee not found');
  res.json({ ok: true, employee: emp });
});

exports.bulkImport = asyncHandler(async (req, res) => {
  const items = z.array(createSchema).parse(req.body.items || []);
  const docs = items.map((d) => ({
    ...d,
    email: d.email.toLowerCase(),
    organizationId: req.organizationId,
    createdBy: req.user._id,
  }));
  const result = await Employee.insertMany(docs, { ordered: false });
  res.status(201).json({ inserted: result.length });
});
