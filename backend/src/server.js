/**
 * RetainIQ Backend Server
 * ----------------------------------------------------------------------------
 * DECISION-SUPPORT DISCLAIMER:
 * This system provides decision-support insights about employee retention risk.
 * It MUST NOT be used as the sole basis for any employment decision (termination,
 * compensation, promotion). Output is a probabilistic indicator derived from
 * HR-domain signals the organization already owns. No keystroke logging, screen
 * recording, or private message reading is performed by this platform.
 * ----------------------------------------------------------------------------
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { connectDB } = require('./config/db');
const { errorHandler, notFound } = require('./middlewares/errorHandler');

const authRoutes = require('./routes/auth.routes');
const employeeRoutes = require('./routes/employee.routes');
const signalRoutes = require('./routes/signal.routes');
const riskRoutes = require('./routes/risk.routes');
const interventionRoutes = require('./routes/intervention.routes');
const pulseRoutes = require('./routes/pulse.routes');
const notificationRoutes = require('./routes/notification.routes');
const settingsRoutes = require('./routes/settings.routes');
const orgRoutes = require('./routes/organization.routes');

// Workforce Intelligence & Productivity Engine
const activityRoutes = require('./routes/activity.routes');
const productivityRoutes = require('./routes/productivity.routes');
const reportsRoutes = require('./routes/reports.routes');
const roiRoutes = require('./routes/roi.routes');
const alertsRoutes = require('./routes/alerts.routes');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 200 });
app.use('/api/', apiLimiter);

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/risk', riskRoutes);
app.use('/api/interventions', interventionRoutes);
app.use('/api/pulse', pulseRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/organizations', orgRoutes);

// Workforce Intelligence & Productivity Engine
app.use('/api/activity', activityRoutes);
app.use('/api/productivity', productivityRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/roi', roiRoutes);
app.use('/api/alerts', alertsRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => console.log(`[server] RetainIQ API running on :${PORT}`));
  } catch (err) {
    console.error('[server] Failed to start', err);
    process.exit(1);
  }
})();

module.exports = app;
