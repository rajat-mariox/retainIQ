const { HttpError } = require('../middlewares/errorHandler');
const Employee = require('../models/Employee');
const { ROLES } = require('../config/constants');

async function currentEmployeeFor(user) {
  if (!user?.organizationId) return null;
  if (user.employeeId) {
    const byId = await Employee.findOne({ _id: user.employeeId, organizationId: user.organizationId });
    if (byId) return byId;
  }
  return Employee.findOne({ organizationId: user.organizationId, email: user.email });
}

async function assertEmployeeAccess(req, employeeId, { write = false } = {}) {
  const { user } = req;
  if (!user) throw new HttpError(401, 'Unauthenticated');
  if (user.role === ROLES.SUPER_ADMIN) {
    throw new HttpError(403, 'Super admins manage tenants only');
  }

  const employee = await Employee.findOne({ _id: employeeId, organizationId: req.organizationId });
  if (!employee) throw new HttpError(404, 'Employee not found');

  if (user.role === ROLES.EMPLOYEE) {
    const me = await currentEmployeeFor(user);
    if (!me || String(me._id) !== String(employee._id)) {
      throw new HttpError(403, 'Employees can only access their own activity');
    }
    return employee;
  }

  if (user.role === ROLES.MANAGER) {
    const manager = await currentEmployeeFor(user);
    const isReport = manager && String(employee.reportingManagerId || '') === String(manager._id);
    if (write || !isReport) {
      throw new HttpError(403, 'Managers can only view assigned employees');
    }
    return employee;
  }

  if ([ROLES.HR_ADMIN, ROLES.ORG_ADMIN].includes(user.role)) return employee;
  throw new HttpError(403, 'Insufficient permissions');
}

async function resolveSubmittingEmployee(req, bodyEmployeeId) {
  if (req.user.role !== ROLES.EMPLOYEE) throw new HttpError(403, 'Only employees can submit tracker activity');
  const employee = await currentEmployeeFor(req.user);
  if (!employee) throw new HttpError(403, 'Employee profile not linked to this user');
  if (bodyEmployeeId && String(bodyEmployeeId) !== String(employee._id)) {
    throw new HttpError(403, 'Employees can only submit their own activity');
  }
  return employee;
}

module.exports = {
  assertEmployeeAccess,
  currentEmployeeFor,
  resolveSubmittingEmployee,
};
