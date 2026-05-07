const mongoose = require('mongoose');

const workPatternSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true, unique: false },

    computedAt: { type: Date, default: Date.now },
    windowDays: { type: Number, default: 30 },

    // Hour-of-day productivity profile (0..23 → score 0..100)
    hourlyProfile: { type: [Number], default: () => Array(24).fill(0) },
    peakHours: [{ start: Number, end: Number }],   // e.g. [{start:11,end:14}]

    // Day-of-week productivity profile (0=Sun..6=Sat)
    dayOfWeekProfile: { type: [Number], default: () => Array(7).fill(0) },
    bestDays: [{ type: Number }],

    // Consistency: stdev of daily scores normalized to 0..100 (higher = more consistent)
    consistencyScore: { type: Number, default: 50 },

    avgDailyScore: { type: Number, default: 0 },
    avgActiveHours: { type: Number, default: 0 },
    avgMeetingHours: { type: Number, default: 0 },
    avgDeepWorkMinutes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

workPatternSchema.index({ organizationId: 1, employeeId: 1 });

module.exports = mongoose.model('WorkPattern', workPatternSchema);
