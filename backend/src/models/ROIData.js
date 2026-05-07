/**
 * ROIData — Employee ROI snapshot.
 *
 * NOTE: ROI is a coarse signal: cost (cached salary) vs estimated output value
 * (productivity score × role's value-per-productive-hour benchmark × hours).
 * Use this as a *trend* indicator, not a verdict on individual worth.
 */
const mongoose = require('mongoose');

const roiDataSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    period: { type: String, enum: ['weekly', 'monthly'], default: 'monthly', index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    monthlyCost: { type: Number, default: 0 },        // currency units
    estimatedOutputValue: { type: Number, default: 0 },
    roiRatio: { type: Number, default: 0 },           // outputValue / cost
    netValue: { type: Number, default: 0 },           // outputValue - cost
    band: { type: String, enum: ['Strong Positive', 'Positive', 'Neutral', 'Negative'], default: 'Neutral' },

    // Inputs used (kept for transparency)
    inputs: {
      avgProductivityScore: Number,
      productiveHours: Number,
      valuePerHour: Number,
      currency: { type: String, default: 'USD' },
    },
  },
  { timestamps: true }
);

roiDataSchema.index({ organizationId: 1, employeeId: 1, period: 1, periodEnd: -1 });

module.exports = mongoose.model('ROIData', roiDataSchema);
