const mongoose = require('mongoose');
const { EMPLOYMENT_STATUS } = require('../config/constants');

const employeeSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    employeeCode: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
    designation: { type: String, trim: true },
    reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
    joiningDate: { type: Date },
    salaryBand: { type: String }, // e.g., "B3" — never raw salary by default

    // Optional, ORG_ADMIN-only fields used by the ROI service.
    // Stored only when the org enables ROI tracking; otherwise these stay null.
    monthlyCost: { type: Number },                       // total cost-to-company / month
    roleValuePerHour: { type: Number },                  // org-defined value benchmark
    currency: { type: String, default: 'USD' },

    employmentType: { type: String, enum: ['full_time', 'part_time', 'contract', 'intern'], default: 'full_time' },
    workMode: { type: String, enum: ['office', 'hybrid', 'remote'], default: 'office' },
    status: { type: String, enum: Object.values(EMPLOYMENT_STATUS), default: EMPLOYMENT_STATUS.ACTIVE, index: true },
    lastAppraisalDate: { type: Date },
    lastSalaryRevisionDate: { type: Date },

    // Cached current risk for fast list views (also stored in RiskAssessment history)
    currentRiskScore: { type: Number, default: 0 },
    currentRiskCategory: { type: String, default: 'Low' },
    currentRiskTrend: { type: String, default: 'Stable' },
    currentRiskUpdatedAt: { type: Date },

    // Cached current productivity for fast list views
    currentProductivityScore: { type: Number, default: 0 },
    currentProductivityBand: { type: String, default: 'Stable' },
    currentProductivityUpdatedAt: { type: Date },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

employeeSchema.index({ organizationId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('Employee', employeeSchema);
