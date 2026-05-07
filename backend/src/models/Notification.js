const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'critical_risk',
        'risk_worsened',
        'intervention_due',
        'feedback_needs_attention',
        'callback_requested',
        'system',
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    relatedEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    relatedInterventionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Intervention' },
    isRead: { type: Boolean, default: false, index: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
