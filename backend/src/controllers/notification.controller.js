const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const Notification = require('../models/Notification');

exports.list = asyncHandler(async (req, res) => {
  const items = await Notification.find({
    organizationId: req.organizationId,
    recipientUserId: req.user._id,
  })
    .sort({ createdAt: -1 })
    .limit(100);
  const unread = await Notification.countDocuments({
    organizationId: req.organizationId,
    recipientUserId: req.user._id,
    isRead: false,
  });
  res.json({ items, unread });
});

exports.markRead = asyncHandler(async (req, res) => {
  const doc = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipientUserId: req.user._id, organizationId: req.organizationId },
    { isRead: true },
    { new: true }
  );
  if (!doc) throw new HttpError(404, 'Notification not found');
  res.json(doc);
});

exports.markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { organizationId: req.organizationId, recipientUserId: req.user._id, isRead: false },
    { isRead: true }
  );
  res.json({ ok: true });
});
