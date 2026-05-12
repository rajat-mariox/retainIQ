const { asyncHandler } = require('../utils/asyncHandler');
const Organization = require('../models/Organization');
const Plan = require('../models/Plan');
const User = require('../models/User');
const Employee = require('../models/Employee');
const { ORGANIZATION_APPROVAL_STATUS } = require('../config/constants');

exports.listAll = asyncHandler(async (_req, res) => {
  const orgs = await Organization.find().sort({ createdAt: -1 });
  const plans = await Plan.find();
  const planByOrg = Object.fromEntries(plans.map((p) => [String(p.organizationId), p]));

  const enriched = await Promise.all(orgs.map(async (o) => {
    const [users, employees] = await Promise.all([
      User.countDocuments({ organizationId: o._id }),
      Employee.countDocuments({ organizationId: o._id }),
    ]);
    return { organization: o, plan: planByOrg[String(o._id)] || null, users, employees };
  }));
  res.json({ items: enriched });
});

exports.toggleActive = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.params.id);
  if (!org) return res.status(404).json({ error: 'Not found' });
  org.isActive = !org.isActive;
  await org.save();
  res.json(org);
});

exports.approve = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.params.id);
  if (!org) return res.status(404).json({ error: 'Not found' });

  org.approvalStatus = ORGANIZATION_APPROVAL_STATUS.APPROVED;
  org.isActive = true;
  org.approvedBy = req.user._id;
  org.approvedAt = new Date();
  org.rejectedBy = undefined;
  org.rejectedAt = undefined;
  org.rejectionReason = undefined;
  await org.save();

  res.json(org);
});

exports.reject = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.params.id);
  if (!org) return res.status(404).json({ error: 'Not found' });

  org.approvalStatus = ORGANIZATION_APPROVAL_STATUS.REJECTED;
  org.isActive = false;
  org.rejectedBy = req.user._id;
  org.rejectedAt = new Date();
  org.rejectionReason = req.body?.reason;
  await org.save();

  res.json(org);
});

exports.departments = asyncHandler(async (req, res) => {
  const Department = require('../models/Department');
  const items = await Department.find({ organizationId: req.organizationId }).sort({ name: 1 });
  res.json({ items });
});

exports.createDepartment = asyncHandler(async (req, res) => {
  const Department = require('../models/Department');
  const doc = await Department.create({
    organizationId: req.organizationId,
    name: req.body.name,
    headUserId: req.body.headUserId,
    createdBy: req.user._id,
  });
  res.status(201).json(doc);
});
