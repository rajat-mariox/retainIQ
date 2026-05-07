const { z } = require('zod');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const ActivityLog = require('../models/ActivityLog');
const Employee = require('../models/Employee');

const activitySchema = z.object({
  employeeId: z.string(),
  date: z.string(), // ISO date
  loginTime: z.string().optional(),
  logoutTime: z.string().optional(),
  activeMinutes: z.number().min(0).max(1440).optional(),
  idleMinutes: z.number().min(0).max(1440).optional(),
  meetingMinutes: z.number().min(0).max(1440).optional(),
  breakMinutes: z.number().min(0).max(1440).optional(),
  totalLoggedMinutes: z.number().min(0).max(1440).optional(),
  appUsageMinutes: z.object({
    coding: z.number().optional(),
    communication: z.number().optional(),
    docs: z.number().optional(),
    design: z.number().optional(),
    meeting: z.number().optional(),
    idle: z.number().optional(),
    other: z.number().optional(),
  }).optional(),
  tasksCompleted: z.number().min(0).optional(),
  tasksOverdue: z.number().min(0).optional(),
  commits: z.number().min(0).optional(),
  pullRequests: z.number().min(0).optional(),
  ticketsResolved: z.number().min(0).optional(),
  appSwitchCount: z.number().min(0).optional(),
  deepWorkSessions: z.number().min(0).optional(),
  deepWorkMinutes: z.number().min(0).optional(),
  source: z.enum(['hrms', 'pm_tool', 'calendar', 'self_report', 'desktop_agent', 'system']).optional(),
  note: z.string().optional(),
});

function dayKey(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}

exports.upsert = asyncHandler(async (req, res) => {
  const data = activitySchema.parse(req.body);
  const emp = await Employee.findOne({ _id: data.employeeId, organizationId: req.organizationId });
  if (!emp) throw new HttpError(404, 'Employee not found');

  const date = dayKey(data.date);
  const doc = await ActivityLog.findOneAndUpdate(
    { organizationId: req.organizationId, employeeId: data.employeeId, date },
    { ...data, date, organizationId: req.organizationId },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  res.status(201).json(doc);
});

exports.bulk = asyncHandler(async (req, res) => {
  const items = z.array(activitySchema).parse(req.body.items || []);
  const empIds = [...new Set(items.map((i) => i.employeeId))];
  const owned = await Employee.find({ _id: { $in: empIds }, organizationId: req.organizationId }).select('_id');
  const ownedSet = new Set(owned.map((e) => String(e._id)));

  const ops = items
    .filter((i) => ownedSet.has(i.employeeId))
    .map((i) => ({
      updateOne: {
        filter: { organizationId: req.organizationId, employeeId: i.employeeId, date: dayKey(i.date) },
        update: { ...i, date: dayKey(i.date), organizationId: req.organizationId },
        upsert: true,
      },
    }));
  if (ops.length === 0) return res.status(201).json({ written: 0, skipped: items.length });
  const result = await ActivityLog.bulkWrite(ops);
  res.status(201).json({ written: ops.length, skipped: items.length - ops.length, result });
});

exports.forEmployee = asyncHandler(async (req, res) => {
  const days = Math.min(120, parseInt(req.query.days) || 30);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const items = await ActivityLog.find({
    organizationId: req.organizationId,
    employeeId: req.params.employeeId,
    date: { $gte: since },
  }).sort({ date: 1 });
  res.json({ items });
});
