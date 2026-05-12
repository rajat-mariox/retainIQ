const { z } = require('zod');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/tokens');
const { ORGANIZATION_APPROVAL_STATUS, ROLES } = require('../config/constants');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Plan = require('../models/Plan');

const registerSchema = z.object({
  organizationName: z.string().min(2),
  domain: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

exports.registerOrg = asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);

  const existing = await User.findOne({ email: data.adminEmail.toLowerCase() });
  if (existing) throw new HttpError(409, 'Email already registered');

  const org = await Organization.create({
    name: data.organizationName,
    domain: data.domain,
    industry: data.industry,
    size: data.size,
    plan: 'trial',
    isActive: false,
    approvalStatus: ORGANIZATION_APPROVAL_STATUS.PENDING,
  });

  await Plan.create({
    organizationId: org._id,
    plan: 'trial',
    seats: 25,
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });

  const passwordHash = await User.hashPassword(data.password);
  const admin = await User.create({
    organizationId: org._id,
    name: data.adminName,
    email: data.adminEmail.toLowerCase(),
    passwordHash,
    role: ROLES.ORG_ADMIN,
  });

  res.status(201).json({
    organization: org,
    user: admin.toSafeJSON(),
    message: 'Organization registration submitted. A super admin must approve it before login.',
  });
});

function assertOrganizationCanLogin(user, organization) {
  if (user.role === ROLES.SUPER_ADMIN) return;
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

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.isActive) throw new HttpError(401, 'Invalid credentials');
  const ok = await user.comparePassword(password);
  if (!ok) throw new HttpError(401, 'Invalid credentials');

  let organization = null;
  if (user.organizationId) organization = await Organization.findById(user.organizationId);
  assertOrganizationCanLogin(user, organization);

  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  res.json({ user: user.toSafeJSON(), organization, accessToken, refreshToken });
});

exports.refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) throw new HttpError(400, 'Missing refresh token');
  let payload;
  try { payload = verifyRefreshToken(refreshToken); }
  catch { throw new HttpError(401, 'Invalid refresh token'); }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new HttpError(401, 'Invalid session');
  let organization = null;
  if (user.organizationId) organization = await Organization.findById(user.organizationId);
  assertOrganizationCanLogin(user, organization);
  res.json({ accessToken: signAccessToken(user) });
});

exports.logout = asyncHandler(async (_req, res) => {
  // For stateless JWT we just instruct the client to discard tokens.
  // For production: maintain a refresh-token blacklist or rotation table.
  res.json({ ok: true });
});

exports.me = asyncHandler(async (req, res) => {
  let organization = null;
  if (req.user.organizationId) organization = await Organization.findById(req.user.organizationId);
  res.json({ user: req.user.toSafeJSON(), organization });
});
