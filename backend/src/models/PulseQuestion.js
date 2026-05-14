const mongoose = require('mongoose');

const pulseQuestionSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 300 },
    type: { type: String, enum: ['rating_1_5'], default: 'rating_1_5' },
    lowLabel: { type: String, trim: true, maxlength: 40, default: 'Low' },
    highLabel: { type: String, trim: true, maxlength: 40, default: 'High' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

pulseQuestionSchema.index({ organizationId: 1, isActive: 1, order: 1 });

module.exports = mongoose.model('PulseQuestion', pulseQuestionSchema);
