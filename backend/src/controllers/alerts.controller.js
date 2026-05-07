const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const Alert = require('../models/Alert');
const Employee = require('../models/Employee');
const { ROLES } = require('../config/constants');

exports.list = asyncHandler(async (req, res) => {
  const filter = { organizationId: req.organizationId };
  if (req.query.acknowledged === 'false') filter.acknowledged = false;
  if (req.query.acknowledged === 'true') filter.acknowledged = true;
  if (req.query.type) filter.type = req.query.type;

  if (req.user.role === ROLES.MANAGER) {
    const me = await Employee.findOne({ organizationId: req.organizationId, email: req.user.email });
    if (me) {
      const team = await Employee.find({ organizationId: req.organizationId, reportingManagerId: me._id }).select('_id');
      filter.employeeId = { $in: team.map((t) => t._id) };
    } else {
      return res.json({ items: [] });
    }
  }

  const items = await Alert.find(filter)
    .sort({ triggeredAt: -1 })
    .limit(100)
    .populate('employeeId', 'name designation departmentId')
    .populate('acknowledgedBy', 'name');
  res.json({ items });
});

exports.acknowledge = asyncHandler(async (req, res) => {
  const doc = await Alert.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.organizationId },
    { acknowledged: true, acknowledgedBy: req.user._id, acknowledgedAt: new Date() },
    { new: true }
  );
  if (!doc) throw new HttpError(404, 'Alert not found');
  res.json(doc);
});

exports.summary = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const filter = { organizationId: req.organizationId, triggeredAt: { $gte: since }, acknowledged: false };
  const counts = await Alert.aggregate([
    { $match: filter },
    { $group: { _id: '$type', count: { $sum: 1 } } },
  ]);
  res.json({
    counts: Object.fromEntries(counts.map((c) => [c._id, c.count])),
    total: counts.reduce((s, c) => s + c.count, 0),
  });
});
