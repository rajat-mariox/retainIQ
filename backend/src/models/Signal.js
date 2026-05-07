/**
 * Signal model — stores HR-domain behavioral and performance signals.
 * PRIVACY NOTE: This schema deliberately holds only signals an organization
 * already owns through standard HR/HRMS/PM tooling — attendance, task
 * completion %, survey scores, manager-entered observations. It does NOT
 * accept keystroke, screen, message, or content-of-communication data.
 */
const mongoose = require('mongoose');

const SIGNAL_CATEGORIES = ['attendance', 'performance', 'engagement', 'behavioral', 'hr'];

const signalSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    category: { type: String, enum: SIGNAL_CATEGORIES, required: true, index: true },
    /**
     * Examples by category (extensible via metric string):
     *   attendance:   late_arrivals_30d, early_logouts_30d, absent_days_30d, leave_freq_90d, unexplained_absences_30d
     *   performance:  task_completion_rate, overdue_tasks, productivity_trend, project_contribution, delivery_consistency
     *   engagement:   pulse_score, manager_feedback_score, hr_feedback_score, meeting_participation, communication_drop
     *   behavioral:   activity_decline_pct, collaboration_drop_pct, short_leave_freq, working_pattern_change
     *   hr:           months_since_appraisal, months_since_salary_revision, unresolved_complaints, promotion_delay_months,
     *                 training_completion_rate, retention_conversation_count
     */
    metric: { type: String, required: true, trim: true },
    value: { type: Number, required: true },
    unit: { type: String, trim: true },
    periodStart: { type: Date },
    periodEnd: { type: Date, default: Date.now },
    source: { type: String, enum: ['manual', 'hrms', 'pm_tool', 'survey', 'system'], default: 'manual' },
    note: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

signalSchema.index({ organizationId: 1, employeeId: 1, category: 1, metric: 1, periodEnd: -1 });

module.exports = mongoose.model('Signal', signalSchema);
module.exports.SIGNAL_CATEGORIES = SIGNAL_CATEGORIES;
