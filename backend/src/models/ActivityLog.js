/**
 * ActivityLog — non-invasive workforce activity record.
 *
 * PRIVACY POSTURE (NON-NEGOTIABLE):
 *   • NO screen recording
 *   • NO keystroke logging
 *   • NO message/email content
 *   • NO clipboard, browsing URLs, or window titles beyond category
 *
 * What we DO accept:
 *   • Aggregated time buckets the org's existing tools already produce:
 *       login/logout times, idle minutes, active minutes
 *   • Application *category* (coding / communication / docs / meeting / idle / other)
 *       — never the application name beyond a category label
 *   • Counts from PM tools (tasks completed, commits, PRs, tickets resolved)
 *   • Calendar-derived meeting minutes
 *
 * Source systems are expected to feed pre-categorized aggregates via
 * /api/activity. RetainIQ never observes raw user activity.
 */
const mongoose = require('mongoose');

const APP_CATEGORIES = ['coding', 'communication', 'docs', 'design', 'meeting', 'idle', 'other'];

const activityLogSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },

    // Day-level bucket (one row per employee per day in normal use)
    date: { type: Date, required: true, index: true }, // midnight UTC of the day

    loginTime: { type: Date },
    logoutTime: { type: Date },

    // Time accounting (minutes)
    activeMinutes: { type: Number, default: 0 },
    idleMinutes: { type: Number, default: 0 },
    meetingMinutes: { type: Number, default: 0 },
    breakMinutes: { type: Number, default: 0 },
    totalLoggedMinutes: { type: Number, default: 0 },

    // Categorized app usage minutes (sums to ~ activeMinutes)
    appUsageMinutes: {
      coding: { type: Number, default: 0 },
      communication: { type: Number, default: 0 },
      docs: { type: Number, default: 0 },
      design: { type: Number, default: 0 },
      meeting: { type: Number, default: 0 },
      idle: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },

    // Output counts from PM/source-control tools
    tasksCompleted: { type: Number, default: 0 },
    tasksOverdue: { type: Number, default: 0 },
    commits: { type: Number, default: 0 },
    pullRequests: { type: Number, default: 0 },
    ticketsResolved: { type: Number, default: 0 },

    // Focus signals
    appSwitchCount: { type: Number, default: 0 },         // # context switches in the day
    deepWorkSessions: { type: Number, default: 0 },       // # contiguous 25-min+ blocks
    deepWorkMinutes: { type: Number, default: 0 },

    source: { type: String, enum: ['hrms', 'pm_tool', 'calendar', 'self_report', 'desktop_agent', 'system'], default: 'system' },
    note: { type: String },
  },
  { timestamps: true }
);

activityLogSchema.index({ organizationId: 1, employeeId: 1, date: -1 }, { unique: true });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
module.exports.APP_CATEGORIES = APP_CATEGORIES;
