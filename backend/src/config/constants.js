const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ORG_ADMIN: 'ORG_ADMIN',
  HR_ADMIN: 'HR_ADMIN',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
});

const ORGANIZATION_APPROVAL_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const RISK_CATEGORIES = Object.freeze({
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
});

const TRENDS = Object.freeze({
  IMPROVING: 'Improving',
  STABLE: 'Stable',
  WORSENING: 'Worsening',
});

const EMPLOYMENT_STATUS = Object.freeze({
  ACTIVE: 'active',
  NOTICE: 'notice_period',
  RESIGNED: 'resigned',
  INACTIVE: 'inactive',
});

const INTERVENTION_TYPES = [
  '1:1 meeting',
  'salary review',
  'role change discussion',
  'workload discussion',
  'training support',
  'grievance handling',
  'manager feedback session',
];

const INTERVENTION_STATUSES = ['planned', 'in_progress', 'completed', 'ineffective'];

module.exports = {
  ROLES,
  ORGANIZATION_APPROVAL_STATUS,
  RISK_CATEGORIES,
  TRENDS,
  EMPLOYMENT_STATUS,
  INTERVENTION_TYPES,
  INTERVENTION_STATUSES,
};
