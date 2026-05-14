const { z } = require('zod');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const Task = require('../models/Task');
const { currentEmployeeFor, assertEmployeeAccess } = require('../services/activityAccessService');
const { ROLES } = require('../config/constants');

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  dueDate: z.string().datetime().optional().nullable(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  status: z.enum(['pending', 'completed']).optional(),
});

// Resolve which employee the request applies to. Employees act on their own
// records; managers / HR / org-admin can pass ?employeeId=… to view a report.
async function resolveTargetEmployee(req) {
  if (req.user.role === ROLES.EMPLOYEE) {
    const me = await currentEmployeeFor(req.user);
    if (!me) throw new HttpError(403, 'Employee profile not linked to this user');
    return me;
  }
  const employeeId = req.query.employeeId || req.body?.employeeId;
  if (!employeeId) throw new HttpError(400, 'employeeId is required for this role');
  return assertEmployeeAccess(req, employeeId, { write: false });
}

exports.list = asyncHandler(async (req, res) => {
  const employee = await resolveTargetEmployee(req);
  const items = await Task.find({
    organizationId: req.organizationId,
    employeeId: employee._id,
  }).sort({ status: 1, dueDate: 1, createdAt: -1 });

  const now = new Date();
  const counts = items.reduce(
    (acc, t) => {
      if (t.status === 'completed') acc.completed += 1;
      else if (t.dueDate && t.dueDate < now) acc.overdue += 1;
      else acc.pending += 1;
      return acc;
    },
    { pending: 0, completed: 0, overdue: 0 }
  );

  res.json({ items, counts });
});

exports.create = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.EMPLOYEE) {
    throw new HttpError(403, 'Only employees can create their own tasks');
  }
  const data = createSchema.parse(req.body);
  const employee = await resolveTargetEmployee(req);

  const doc = await Task.create({
    organizationId: req.organizationId,
    employeeId: employee._id,
    title: data.title.trim(),
    description: data.description?.trim() || '',
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
  });
  res.status(201).json(doc);
});

exports.update = asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const task = await Task.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!task) throw new HttpError(404, 'Task not found');

  if (req.user.role === ROLES.EMPLOYEE) {
    const me = await currentEmployeeFor(req.user);
    if (!me || String(me._id) !== String(task.employeeId)) {
      throw new HttpError(403, 'Employees can only modify their own tasks');
    }
  } else {
    throw new HttpError(403, 'Only employees can modify their own tasks');
  }

  if (data.title !== undefined) task.title = data.title.trim();
  if (data.description !== undefined) task.description = data.description.trim();
  if (data.dueDate !== undefined) task.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.status !== undefined) {
    task.status = data.status;
    task.completedAt = data.status === 'completed' ? new Date() : null;
  }

  await task.save();
  res.json(task);
});

exports.remove = asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!task) throw new HttpError(404, 'Task not found');

  if (req.user.role !== ROLES.EMPLOYEE) {
    throw new HttpError(403, 'Only employees can delete their own tasks');
  }
  const me = await currentEmployeeFor(req.user);
  if (!me || String(me._id) !== String(task.employeeId)) {
    throw new HttpError(403, 'Employees can only delete their own tasks');
  }

  await task.deleteOne();
  res.json({ ok: true });
});
