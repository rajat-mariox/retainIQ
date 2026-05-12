const jwt = require('jsonwebtoken');
const { HttpError } = require('./errorHandler');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { ORGANIZATION_APPROVAL_STATUS, ROLES } = require('../config/constants');

/**
 * authenticate — verifies JWT, loads user, attaches req.user and req.organizationId
 */
async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Missing token');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) throw new HttpError(401, 'Invalid session');
    if (user.role !== ROLES.SUPER_ADMIN) {
      const organization = user.organizationId ? await Organization.findById(user.organizationId) : null;
      if (!organization) throw new HttpError(403, 'Organization not found');
      if (organization.approvalStatus === ORGANIZATION_APPROVAL_STATUS.PENDING) {
        throw new HttpError(403, 'Organization approval is pending. Please wait for super admin approval.');
      }
      if (organization.approvalStatus === ORGANIZATION_APPROVAL_STATUS.REJECTED) {
        throw new HttpError(403, 'Organization registration was rejected by the super admin.');
      }
      if (!organization.isActive) {
        throw new HttpError(403, 'Organization is inactive. Please contact the super admin.');
      }
    }
    req.user = user;
    req.organizationId = user.organizationId ? String(user.organizationId) : null;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new HttpError(401, 'Invalid or expired token'));
    }
    next(err);
  }
}

/**
 * requireRoles — gate endpoints by role.
 *   requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN)
 */
function requireRoles(...allowed) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'Unauthenticated'));
    if (!allowed.includes(req.user.role)) {
      return next(new HttpError(403, 'Insufficient permissions'));
    }
    next();
  };
}

/**
 * requireSameOrg — enforce that req.params.id or body.organizationId belongs to caller's org.
 * For most queries we instead inject organizationId in service layer; this is for hard-checks.
 */
function requireSameOrg(req, _res, next) {
  if (req.user.role === ROLES.SUPER_ADMIN) return next();
  if (!req.organizationId) return next(new HttpError(403, 'No organization context'));
  next();
}

module.exports = { authenticate, requireRoles, requireSameOrg };
