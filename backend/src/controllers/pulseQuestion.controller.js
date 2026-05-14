const { z } = require('zod');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const PulseQuestion = require('../models/PulseQuestion');

const createSchema = z.object({
  label: z.string().min(2).max(300),
  lowLabel: z.string().max(40).optional(),
  highLabel: z.string().max(40).optional(),
  order: z.number().int().optional(),
});

const updateSchema = z.object({
  label: z.string().min(2).max(300).optional(),
  lowLabel: z.string().max(40).optional(),
  highLabel: z.string().max(40).optional(),
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// Anyone authenticated within the org can read questions — employees need to
// render them on the pulse form; admins need them for management.
exports.list = asyncHandler(async (req, res) => {
  const filter = { organizationId: req.organizationId };
  if (req.query.activeOnly === 'true') filter.isActive = true;
  const items = await PulseQuestion.find(filter).sort({ order: 1, createdAt: 1 });
  res.json({ items });
});

exports.create = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const last = await PulseQuestion.findOne({ organizationId: req.organizationId }).sort({ order: -1 });
  const order = data.order ?? ((last?.order || 0) + 1);
  const doc = await PulseQuestion.create({
    organizationId: req.organizationId,
    label: data.label.trim(),
    lowLabel: data.lowLabel?.trim() || 'Low',
    highLabel: data.highLabel?.trim() || 'High',
    order,
    createdByUserId: req.user._id,
  });
  res.status(201).json(doc);
});

exports.update = asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const doc = await PulseQuestion.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!doc) throw new HttpError(404, 'Question not found');

  if (data.label !== undefined) doc.label = data.label.trim();
  if (data.lowLabel !== undefined) doc.lowLabel = data.lowLabel.trim() || 'Low';
  if (data.highLabel !== undefined) doc.highLabel = data.highLabel.trim() || 'High';
  if (data.order !== undefined) doc.order = data.order;
  if (data.isActive !== undefined) doc.isActive = data.isActive;

  await doc.save();
  res.json(doc);
});

exports.remove = asyncHandler(async (req, res) => {
  const doc = await PulseQuestion.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!doc) throw new HttpError(404, 'Question not found');
  await doc.deleteOne();
  res.json({ ok: true });
});
