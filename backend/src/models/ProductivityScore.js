const mongoose = require('mongoose');

const PRODUCTIVITY_BANDS = ['High Performer', 'Stable', 'Needs Attention'];

const productivityScoreSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    date: { type: Date, required: true, index: true },           // day of score
    period: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'daily', index: true },

    score: { type: Number, required: true, min: 0, max: 100 },   // overall productivity 0..100
    band: { type: String, enum: PRODUCTIVITY_BANDS, required: true },

    // Sub-scores 0..100
    subScores: {
      timeUtilization: { type: Number, default: 0 },
      taskCompletion: { type: Number, default: 0 },
      meetingEfficiency: { type: Number, default: 0 },
      engagement: { type: Number, default: 0 },
      consistency: { type: Number, default: 0 },
      focus: { type: Number, default: 0 },
    },

    // Output-vs-time efficiency: tasks per active hour (raw) and 0..100 normalized
    efficiency: {
      tasksPerActiveHour: { type: Number, default: 0 },
      normalized: { type: Number, default: 0 },
    },

    flags: [{ type: String }], // e.g. ['burnout_risk', 'low_focus', 'meeting_heavy']
    insights: [{ type: String }],

    engineVersion: { type: String, default: 'prod-v1' },
  },
  { timestamps: true }
);

productivityScoreSchema.index({ organizationId: 1, employeeId: 1, period: 1, date: -1 });

module.exports = mongoose.model('ProductivityScore', productivityScoreSchema);
module.exports.PRODUCTIVITY_BANDS = PRODUCTIVITY_BANDS;
