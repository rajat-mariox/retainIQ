const { z } = require('zod');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const Signal = require('../models/Signal');
const Employee = require('../models/Employee');

const signalSchema = z.object({
  employeeId: z.string(),
  category: z.enum(['attendance', 'performance', 'engagement', 'behavioral', 'hr']),
  metric: z.string().min(1),
  value: z.number(),
  unit: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  source: z.enum(['manual', 'hrms', 'pm_tool', 'survey', 'system']).optional(),
  note: z.string().optional(),
});

exports.create = asyncHandler(async (req, res) => {
  const data = signalSchema.parse(req.body);
  // Verify employee belongs to caller's org
  const emp = await Employee.findOne({ _id: data.employeeId, organizationId: req.organizationId });
  if (!emp) throw new HttpError(404, 'Employee not found');
  const sig = await Signal.create({
    ...data,
    organizationId: req.organizationId,
    createdBy: req.user._id,
  });
  res.status(201).json(sig);
});

exports.bulkCreate = asyncHandler(async (req, res) => {
  const items = z.array(signalSchema).parse(req.body.items || []);
  const empIds = [...new Set(items.map((i) => i.employeeId))];
  const owned = await Employee.find({ _id: { $in: empIds }, organizationId: req.organizationId }).select('_id');
  const ownedSet = new Set(owned.map((e) => String(e._id)));
  const valid = items.filter((i) => ownedSet.has(i.employeeId));
  const docs = valid.map((d) => ({
    ...d,
    organizationId: req.organizationId,
    createdBy: req.user._id,
  }));
  const inserted = await Signal.insertMany(docs);
  res.status(201).json({ inserted: inserted.length, skipped: items.length - inserted.length });
});

exports.listForEmployee = asyncHandler(async (req, res) => {
  const emp = await Employee.findOne({ _id: req.params.employeeId, organizationId: req.organizationId });
  if (!emp) throw new HttpError(404, 'Employee not found');
  const items = await Signal.find({
    organizationId: req.organizationId,
    employeeId: req.params.employeeId,
  }).sort({ periodEnd: -1 }).limit(500);
  res.json({ items });
});
