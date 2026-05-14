const mongoose = require('mongoose');

const pulseSurveySchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    moodScore: { type: Number, min: 1, max: 5, required: true },
    workloadScore: { type: Number, min: 1, max: 5, required: true },
    managerSupportScore: { type: Number, min: 1, max: 5, required: true },
    growthSatisfactionScore: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true },
    isAnonymous: { type: Boolean, default: false },
    requestHRCallback: { type: Boolean, default: false },
    callbackHandled: { type: Boolean, default: false },
    // HR-defined extra questions. Label/type are snapshotted at submission so
    // historical responses remain readable even if the question is later
    // edited or deactivated.
    extraAnswers: [
      {
        _id: false,
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PulseQuestion' },
        label: { type: String },
        type: { type: String },
        value: { type: mongoose.Schema.Types.Mixed },
      },
    ],
  },
  { timestamps: true }
);

pulseSurveySchema.index({ organizationId: 1, employeeId: 1, createdAt: -1 });

module.exports = mongoose.model('PulseSurvey', pulseSurveySchema);
