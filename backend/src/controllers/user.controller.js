const { z } = require('zod');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const { ROLES } = require('../config/constants');
const User = require('../models/User');
const Employee = require('../models/Employee');

const createOrgUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum([ROLES.HR_ADMIN, ROLES.MANAGER]),
  departmentId: z.string().optional(),
  designation: z.string().optional(),
  joiningDate: z.string().optional(),
  workMode: z.enum(['office', 'hybrid', 'remote']).optional(),
});

exports.list = asyncHandler(async (req, res) => {
  const users = await User.find({
    organizationId: req.organizationId,
    role: { $in: [ROLES.HR_ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE] },
  })
    .populate('employeeId', 'name email designation departmentId reportingManagerId')
    .sort({ role: 1, createdAt: -1 });

  res.json({ items: users.map((u) => u.toSafeJSON()) });
});

exports.createOrgUser = asyncHandler(async (req, res) => {
  const data = createOrgUserSchema.parse(req.body);
  const email = data.email.toLowerCase();

  const existingUser = await User.findOne({ email });
  if (existingUser) throw new HttpError(409, 'User email already exists');

  let employee = null;
  if (data.role === ROLES.MANAGER) {
    const existingEmployee = await Employee.findOne({ organizationId: req.organizationId, email });
    if (existingEmployee) throw new HttpError(409, 'Employee email already exists');

    employee = await Employee.create({
      organizationId: req.organizationId,
      name: data.name,
      email,
      departmentId: data.departmentId,
      designation: data.designation || 'Manager',
      joiningDate: data.joiningDate,
      workMode: data.workMode || 'office',
      createdBy: req.user._id,
    });
  }

  try {
    const user = await User.create({
      organizationId: req.organizationId,
      employeeId: employee?._id,
      name: data.name,
      email,
      passwordHash: await User.hashPassword(data.password),
      role: data.role,
    });

    res.status(201).json({ user: user.toSafeJSON(), employee });
  } catch (err) {
    if (employee) await Employee.deleteOne({ _id: employee._id, organizationId: req.organizationId });
    throw err;
  }
});

exports.managers = asyncHandler(async (req, res) => {
  const managers = await User.find({
    organizationId: req.organizationId,
    role: ROLES.MANAGER,
    isActive: true,
    employeeId: { $exists: true, $ne: null },
  })
    .populate({
      path: 'employeeId',
      select: 'name email designation departmentId',
      populate: { path: 'departmentId', select: 'name' },
    })
    .sort({ name: 1 });

  res.json({
    items: managers
      .filter((u) => u.employeeId)
      .map((u) => ({ user: u.toSafeJSON(), employee: u.employeeId })),
  });
});
