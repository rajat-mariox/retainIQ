const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true, index: true },
    plan: { type: String, enum: ['trial', 'starter', 'growth', 'enterprise'], default: 'trial' },
    seats: { type: Number, default: 25 },
    seatsUsed: { type: Number, default: 0 },
    billingStatus: { type: String, enum: ['active', 'past_due', 'canceled'], default: 'active' },
    trialEndsAt: { type: Date },
    renewsAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Plan', planSchema);
