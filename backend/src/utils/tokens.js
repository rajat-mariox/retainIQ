const jwt = require('jsonwebtoken');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, org: user.organizationId?.toString() },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

function signAgentLaunchTicket(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, purpose: 'agent-launch' },
    process.env.JWT_SECRET,
    { expiresIn: '60s' }
  );
}

function verifyAgentLaunchTicket(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.purpose !== 'agent-launch') {
    const err = new Error('Not an agent-launch ticket');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return payload;
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signAgentLaunchTicket,
  verifyAgentLaunchTicket,
};
