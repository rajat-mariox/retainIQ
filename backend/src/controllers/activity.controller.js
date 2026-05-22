const { z } = require('zod');
const fs = require('fs');
const path = require('path');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/errorHandler');
const ActivityLog = require('../models/ActivityLog');
const ActivitySession = require('../models/ActivitySession');
const ActivityEvent = require('../models/ActivityEvent');
const ScreenshotLog = require('../models/ScreenshotLog');
const AppUsageLog = require('../models/AppUsageLog');
const Employee = require('../models/Employee');
const Organization = require('../models/Organization');
const Signal = require('../models/Signal');
const PulseSurvey = require('../models/PulseSurvey');
const RiskAssessment = require('../models/RiskAssessment');
const { ROLES } = require('../config/constants');
const { assertEmployeeAccess, resolveSubmittingEmployee } = require('../services/activityAccessService');
const { calculateAndPersistActivityScore } = require('../services/activityProductivityService');
const { calculateRisk } = require('../services/riskScoringService');
const { refreshActivityRiskSignals } = require('../services/activityRiskSignalService');
const { generateActivitySummary } = require('../services/productivityAIService');
const ProductivityScore = require('../models/ProductivityScore');

const activitySchema = z.object({
  employeeId: z.string(),
  date: z.string(), // ISO date
  loginTime: z.string().optional(),
  logoutTime: z.string().optional(),
  activeMinutes: z.number().min(0).max(1440).optional(),
  idleMinutes: z.number().min(0).max(1440).optional(),
  meetingMinutes: z.number().min(0).max(1440).optional(),
  breakMinutes: z.number().min(0).max(1440).optional(),
  totalLoggedMinutes: z.number().min(0).max(1440).optional(),
  appUsageMinutes: z.object({
    coding: z.number().optional(),
    communication: z.number().optional(),
    docs: z.number().optional(),
    design: z.number().optional(),
    meeting: z.number().optional(),
    idle: z.number().optional(),
    other: z.number().optional(),
  }).optional(),
  tasksCompleted: z.number().min(0).optional(),
  tasksOverdue: z.number().min(0).optional(),
  commits: z.number().min(0).optional(),
  pullRequests: z.number().min(0).optional(),
  ticketsResolved: z.number().min(0).optional(),
  appSwitchCount: z.number().min(0).optional(),
  deepWorkSessions: z.number().min(0).optional(),
  deepWorkMinutes: z.number().min(0).optional(),
  source: z.enum(['hrms', 'pm_tool', 'calendar', 'self_report', 'desktop_agent', 'system']).optional(),
  note: z.string().optional(),
});

function dayKey(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}

exports.upsert = asyncHandler(async (req, res) => {
  const data = activitySchema.parse(req.body);
  if (req.user.role === ROLES.EMPLOYEE) await resolveSubmittingEmployee(req, data.employeeId);
  else await assertEmployeeAccess(req, data.employeeId, { write: false });

  const date = dayKey(data.date);
  const doc = await ActivityLog.findOneAndUpdate(
    { organizationId: req.organizationId, employeeId: data.employeeId, date },
    { ...data, date, organizationId: req.organizationId },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  res.status(201).json(doc);
});

exports.bulk = asyncHandler(async (req, res) => {
  const items = z.array(activitySchema).parse(req.body.items || []);
  const empIds = [...new Set(items.map((i) => i.employeeId))];
  const owned = await Employee.find({ _id: { $in: empIds }, organizationId: req.organizationId }).select('_id');
  const ownedSet = new Set(owned.map((e) => String(e._id)));

  const ops = items
    .filter((i) => ownedSet.has(i.employeeId))
    .map((i) => ({
      updateOne: {
        filter: { organizationId: req.organizationId, employeeId: i.employeeId, date: dayKey(i.date) },
        update: { ...i, date: dayKey(i.date), organizationId: req.organizationId },
        upsert: true,
      },
    }));
  if (ops.length === 0) return res.status(201).json({ written: 0, skipped: items.length });
  const result = await ActivityLog.bulkWrite(ops);
  res.status(201).json({ written: ops.length, skipped: items.length - ops.length, result });
});

exports.forEmployee = asyncHandler(async (req, res) => {
  await assertEmployeeAccess(req, req.params.employeeId);
  const days = Math.min(120, parseInt(req.query.days) || 30);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const [items, sessions] = await Promise.all([
    ActivityLog.find({
      organizationId: req.organizationId,
      employeeId: req.params.employeeId,
      date: { $gte: since },
    }).sort({ date: 1 }),
    ActivitySession.find({
      organizationId: req.organizationId,
      employeeId: req.params.employeeId,
      date: { $gte: since },
    }).sort({ startTime: -1 }),
  ]);
  const summary = sessions.reduce((acc, s) => {
    acc.totalMinutes += s.totalMinutes || 0;
    acc.activeMinutes += s.activeMinutes || 0;
    acc.idleMinutes += s.idleMinutes || 0;
    acc.breakMinutes += s.breakMinutes || 0;
    return acc;
  }, { totalMinutes: 0, activeMinutes: 0, idleMinutes: 0, breakMinutes: 0 });
  res.json({ items, sessions, summary });
});

function activeSessionQuery(employeeId, orgId) {
  return { organizationId: orgId, employeeId, status: { $in: ['working', 'break'] } };
}

async function getEmployeeSession(req, sessionId) {
  const session = await ActivitySession.findOne({ _id: sessionId, organizationId: req.organizationId });
  if (!session) throw new HttpError(404, 'Activity session not found');
  await assertEmployeeAccess(req, session.employeeId, { write: req.user.role === ROLES.EMPLOYEE });
  return session;
}

function minutesBetween(start, end) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

exports.startSession = asyncHandler(async (req, res) => {
  const employee = await resolveSubmittingEmployee(req, req.body.employeeId);
  const existing = await ActivitySession.findOne(activeSessionQuery(employee._id, req.organizationId)).sort({ startTime: -1 });
  if (existing) return res.status(200).json(existing);

  const now = req.body.startTime ? new Date(req.body.startTime) : new Date();
  const session = await ActivitySession.create({
    organizationId: req.organizationId,
    employeeId: employee._id,
    userId: req.user._id,
    date: dayKey(now),
    startTime: now,
    status: 'working',
  });
  res.status(201).json(session);
});

exports.breakSession = asyncHandler(async (req, res) => {
  const employee = await resolveSubmittingEmployee(req, req.body.employeeId);
  const session = await ActivitySession.findOne({ organizationId: req.organizationId, employeeId: employee._id, status: 'working' }).sort({ startTime: -1 });
  if (!session) throw new HttpError(404, 'No working session found');
  session.status = 'break';
  session.breakStartedAt = new Date();
  await session.save();
  res.json(session);
});

exports.resumeSession = asyncHandler(async (req, res) => {
  const employee = await resolveSubmittingEmployee(req, req.body.employeeId);
  const session = await ActivitySession.findOne({ organizationId: req.organizationId, employeeId: employee._id, status: 'break' }).sort({ startTime: -1 });
  if (!session) throw new HttpError(404, 'No break session found');
  if (session.breakStartedAt) session.breakMinutes += minutesBetween(session.breakStartedAt, new Date());
  session.status = 'working';
  session.breakStartedAt = undefined;
  await session.save();
  res.json(session);
});

exports.endSession = asyncHandler(async (req, res) => {
  const employee = await resolveSubmittingEmployee(req, req.body.employeeId);
  const session = await ActivitySession.findOne(activeSessionQuery(employee._id, req.organizationId)).sort({ startTime: -1 });
  if (!session) throw new HttpError(404, 'No active session found');
  const now = req.body.endTime ? new Date(req.body.endTime) : new Date();
  if (session.status === 'break' && session.breakStartedAt) {
    session.breakMinutes += minutesBetween(session.breakStartedAt, now);
  }
  session.endTime = now;
  session.status = 'ended';
  session.breakStartedAt = undefined;
  session.totalMinutes = minutesBetween(session.startTime, now);
  await session.save();

  await ActivityLog.findOneAndUpdate(
    { organizationId: req.organizationId, employeeId: employee._id, date: session.date },
    {
      organizationId: req.organizationId,
      employeeId: employee._id,
      date: session.date,
      loginTime: session.startTime,
      logoutTime: now,
      activeMinutes: session.activeMinutes,
      idleMinutes: session.idleMinutes,
      breakMinutes: session.breakMinutes,
      totalLoggedMinutes: session.totalMinutes,
      source: 'desktop_agent',
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.json(session);
});

const eventSchema = z.object({
  employeeId: z.string().optional(),
  sessionId: z.string(),
  type: z.enum(['keyboard', 'mouse', 'idle', 'active']),
  count: z.number().min(0).default(0),
  capturedAt: z.string().optional(),
});

async function createEvent(req, input) {
  const data = eventSchema.parse(input);
  const session = await getEmployeeSession(req, data.sessionId);
  const employee = await resolveSubmittingEmployee(req, data.employeeId || session.employeeId);
  if (String(session.employeeId) !== String(employee._id)) throw new HttpError(403, 'Session does not belong to employee');

  const doc = await ActivityEvent.create({
    organizationId: req.organizationId,
    employeeId: employee._id,
    sessionId: session._id,
    type: data.type,
    count: data.count,
    capturedAt: data.capturedAt ? new Date(data.capturedAt) : new Date(),
  });
  if (data.type === 'idle') session.idleMinutes += data.count || 1;
  if (data.type === 'active') session.activeMinutes += data.count || 1;
  await session.save();
  return doc;
}

exports.createEvent = asyncHandler(async (req, res) => {
  const doc = await createEvent(req, req.body);
  res.status(201).json(doc);
});

exports.bulkEvents = asyncHandler(async (req, res) => {
  const items = z.array(eventSchema).parse(req.body.items || []);
  const docs = [];
  for (const item of items) docs.push(await createEvent(req, item));
  res.status(201).json({ written: docs.length });
});

function decodeScreenshot(body) {
  const raw = body.imageBase64 || body.image || body.dataUrl;
  if (!raw) throw new HttpError(400, 'imageBase64 or dataUrl is required');
  const match = String(raw).match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  const ext = match ? (match[1] === 'jpeg' ? 'jpg' : match[1]) : (body.extension || 'png');
  const base64 = match ? match[2] : raw;
  return { buffer: Buffer.from(base64, 'base64'), ext };
}

exports.createScreenshot = asyncHandler(async (req, res) => {
  const session = await getEmployeeSession(req, req.body.sessionId);
  const employee = await resolveSubmittingEmployee(req, req.body.employeeId || session.employeeId);
  if (String(session.employeeId) !== String(employee._id)) throw new HttpError(403, 'Session does not belong to employee');

  const { buffer, ext } = decodeScreenshot(req.body);
  const uploadRoot = path.join(__dirname, '..', '..', 'uploads', 'screenshots');
  fs.mkdirSync(uploadRoot, { recursive: true });
  const safeName = `${employee._id}-${Date.now()}.${ext}`;
  const filePath = path.join(uploadRoot, safeName);
  fs.writeFileSync(filePath, buffer);

  const doc = await ScreenshotLog.create({
    organizationId: req.organizationId,
    employeeId: employee._id,
    sessionId: session._id,
    imageUrl: `/uploads/screenshots/${safeName}`,
    activeApp: req.body.activeApp,
    capturedAt: req.body.capturedAt ? new Date(req.body.capturedAt) : new Date(),
  });
  res.status(201).json(doc);
});

const appUsageSchema = z.object({
  employeeId: z.string().optional(),
  sessionId: z.string(),
  appName: z.string().min(1),
  windowTitle: z.string().optional().default(''),
  category: z.enum(['productive', 'neutral', 'unproductive']).default('neutral'),
  durationSeconds: z.number().min(0).default(0),
  capturedAt: z.string().optional(),
});

async function createAppUsage(req, input) {
  const data = appUsageSchema.parse(input);
  const session = await getEmployeeSession(req, data.sessionId);
  const employee = await resolveSubmittingEmployee(req, data.employeeId || session.employeeId);
  if (String(session.employeeId) !== String(employee._id)) throw new HttpError(403, 'Session does not belong to employee');
  return AppUsageLog.create({
    organizationId: req.organizationId,
    employeeId: employee._id,
    sessionId: session._id,
    appName: data.appName,
    windowTitle: data.windowTitle,
    category: data.category,
    durationSeconds: data.durationSeconds,
    capturedAt: data.capturedAt ? new Date(data.capturedAt) : new Date(),
  });
}

exports.createAppUsage = asyncHandler(async (req, res) => {
  const doc = await createAppUsage(req, req.body);
  res.status(201).json(doc);
});

exports.bulkAppUsage = asyncHandler(async (req, res) => {
  const items = z.array(appUsageSchema).parse(req.body.items || []);
  const docs = [];
  for (const item of items) docs.push(await createAppUsage(req, item));
  res.status(201).json({ written: docs.length });
});

exports.screenshotsForEmployee = asyncHandler(async (req, res) => {
  await assertEmployeeAccess(req, req.params.employeeId);
  const days = Math.min(30, parseInt(req.query.days) || 7);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const items = await ScreenshotLog.find({
    organizationId: req.organizationId,
    employeeId: req.params.employeeId,
    capturedAt: { $gte: since },
  }).sort({ capturedAt: -1 }).limit(Math.min(100, parseInt(req.query.limit) || 30));
  res.json({ items });
});

// ---------------------------------------------------------------------------
// /activity/sync — periodic delta push from the desktop agent.
// Counters (active/idle/break minutes, keyboard/mouse, app-minute buckets) are
// added on top of the day's row. appUsage entries are merged by (appName +
// category); screenshots are appended.
// ---------------------------------------------------------------------------
const appUsageEntrySyncSchema = z.object({
  appName: z.string().min(1),
  windowTitle: z.string().optional().default(''),
  category: z.enum(['productive', 'neutral', 'unproductive']).default('neutral'),
  durationMinutes: z.number().min(0).default(0),
});

const screenshotEntrySyncSchema = z.object({
  imageUrl: z.string().min(1),
  activeApp: z.string().optional().default(''),
  capturedAt: z.string().optional(),
});

const syncSchema = z.object({
  date: z.string(),
  totalWorkMinutes: z.number().min(0).default(0),
  activeMinutes: z.number().min(0).default(0),
  idleMinutes: z.number().min(0).default(0),
  breakMinutes: z.number().min(0).default(0),
  keyboardCount: z.number().min(0).default(0),
  mouseCount: z.number().min(0).default(0),
  productiveAppMinutes: z.number().min(0).default(0),
  neutralAppMinutes: z.number().min(0).default(0),
  unproductiveAppMinutes: z.number().min(0).default(0),
  appUsage: z.array(appUsageEntrySyncSchema).optional().default([]),
  screenshots: z.array(screenshotEntrySyncSchema).optional().default([]),
});

exports.sync = asyncHandler(async (req, res) => {
  const data = syncSchema.parse(req.body);
  const employee = await resolveSubmittingEmployee(req, req.body.employeeId);
  const date = dayKey(data.date);

  let log = await ActivityLog.findOne({
    organizationId: req.organizationId,
    employeeId: employee._id,
    date,
  });

  if (!log) {
    log = new ActivityLog({
      organizationId: req.organizationId,
      employeeId: employee._id,
      userId: req.user._id,
      date,
      loginTime: new Date(),
      source: 'desktop_agent',
    });
  }

  log.totalWorkMinutes = (log.totalWorkMinutes || 0) + data.totalWorkMinutes;
  log.activeMinutes = (log.activeMinutes || 0) + data.activeMinutes;
  log.idleMinutes = (log.idleMinutes || 0) + data.idleMinutes;
  log.breakMinutes = (log.breakMinutes || 0) + data.breakMinutes;
  log.keyboardCount = (log.keyboardCount || 0) + data.keyboardCount;
  log.mouseCount = (log.mouseCount || 0) + data.mouseCount;
  log.productiveAppMinutes = (log.productiveAppMinutes || 0) + data.productiveAppMinutes;
  log.neutralAppMinutes = (log.neutralAppMinutes || 0) + data.neutralAppMinutes;
  log.unproductiveAppMinutes = (log.unproductiveAppMinutes || 0) + data.unproductiveAppMinutes;
  log.totalLoggedMinutes = (log.activeMinutes || 0) + (log.idleMinutes || 0) + (log.breakMinutes || 0);
  log.source = 'desktop_agent';

  for (const entry of data.appUsage) {
    const existing = (log.appUsage || []).find(
      (a) => a.appName === entry.appName && a.category === entry.category
    );
    if (existing) {
      existing.durationMinutes = (existing.durationMinutes || 0) + entry.durationMinutes;
      if (entry.windowTitle) existing.windowTitle = entry.windowTitle;
    } else {
      log.appUsage.push(entry);
    }
  }

  for (const shot of data.screenshots) {
    log.screenshots.push({
      imageUrl: shot.imageUrl,
      activeApp: shot.activeApp || '',
      capturedAt: shot.capturedAt ? new Date(shot.capturedAt) : new Date(),
    });
  }

  await log.save();
  res.status(200).json(log);
});

// ---------------------------------------------------------------------------
// /activity/end-day — final totals for the day from the agent. These are
// authoritative replacements (not increments) for the time buckets, and the
// productivity score is recomputed immediately so the manager dashboard sees
// the result without waiting for the nightly job.
// ---------------------------------------------------------------------------
const endDaySchema = z.object({
  date: z.string(),
  totalWorkMinutes: z.number().min(0).default(0),
  activeMinutes: z.number().min(0).default(0),
  idleMinutes: z.number().min(0).default(0),
  breakMinutes: z.number().min(0).default(0),
});

async function upsertActivityRiskSignal(signal) {
  return Signal.findOneAndUpdate(
    {
      organizationId: signal.organizationId,
      employeeId: signal.employeeId,
      category: signal.category,
      metric: signal.metric,
      periodStart: signal.periodStart,
    },
    { $set: signal },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function emitActivityRiskSignals({ organizationId, employeeId, date, scoreDoc, activityLog }) {
  const currentScore = scoreDoc?.score;
  if (!Number.isFinite(currentScore)) return [];

  const previousScores = await ProductivityScore.find({
    organizationId,
    employeeId,
    period: 'daily',
    date: { $lt: date },
  })
    .sort({ date: -1 })
    .limit(7)
    .select('score');

  const signals = [];
  const periodEnd = new Date(date);
  periodEnd.setDate(periodEnd.getDate() + 1);

  if (previousScores.length >= 3) {
    const avg = previousScores.reduce((sum, item) => sum + (item.score || 0), 0) / previousScores.length;
    const declinePct = Math.max(0, Math.min(100, Math.round(100 - (currentScore / Math.max(1, avg)) * 100)));
    const trend = Number(((currentScore - avg) / 100).toFixed(2));

    if (declinePct >= 20) {
      signals.push({
        organizationId,
        employeeId,
        source: 'system',
        category: 'behavioral',
        metric: 'activity_decline_pct',
        value: declinePct,
        unit: 'percent',
        periodStart: date,
        periodEnd,
        note: `Activity agent productivity score declined ${declinePct}% vs recent average.`,
      });
    }

    if (trend <= -0.2) {
      signals.push({
        organizationId,
        employeeId,
        source: 'system',
        category: 'performance',
        metric: 'productivity_trend',
        value: trend,
        unit: 'ratio',
        periodStart: date,
        periodEnd,
        note: 'Activity agent daily productivity trend is below recent baseline.',
      });
    }
  }

  const totalMinutes = activityLog?.totalLoggedMinutes
    || activityLog?.totalWorkMinutes
    || ((activityLog?.activeMinutes || 0) + (activityLog?.idleMinutes || 0) + (activityLog?.breakMinutes || 0));
  const idleRatio = totalMinutes ? (activityLog?.idleMinutes || 0) / totalMinutes : 0;
  if (totalMinutes >= 60 && idleRatio >= 0.35) {
    signals.push({
      organizationId,
      employeeId,
      source: 'system',
      category: 'behavioral',
      metric: 'working_pattern_change',
      value: 1,
      unit: 'flag',
      periodStart: date,
      periodEnd,
      note: `Activity agent detected elevated idle time (${Math.round(idleRatio * 100)}%).`,
    });
  }

  const written = [];
  for (const signal of signals) written.push(await upsertActivityRiskSignal(signal));
  return written;
}

function minutesSinceMidnight(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

async function emitAttendanceRiskSignals({ organizationId, employeeId, date }) {
  const since30 = new Date(date);
  since30.setDate(since30.getDate() - 29);
  const since90 = new Date(date);
  since90.setDate(since90.getDate() - 89);
  const periodEnd = new Date(date);
  periodEnd.setDate(periodEnd.getDate() + 1);

  const [logs30, logs90] = await Promise.all([
    ActivityLog.find({ organizationId, employeeId, date: { $gte: since30, $lte: date } })
      .select('date loginTime logoutTime totalLoggedMinutes totalWorkMinutes activeMinutes idleMinutes breakMinutes'),
    ActivityLog.find({ organizationId, employeeId, date: { $gte: since90, $lte: date } })
      .select('date totalLoggedMinutes totalWorkMinutes activeMinutes idleMinutes breakMinutes'),
  ]);

  const workStart = 10 * 60;
  const workEnd = 18 * 60;
  const lateGraceMinutes = 15;
  const earlyGraceMinutes = 30;
  const absentThresholdMinutes = 60;
  const shortDayThresholdMinutes = 4 * 60;

  const totalMinutesFor = (log) => log.totalLoggedMinutes
    || log.totalWorkMinutes
    || ((log.activeMinutes || 0) + (log.idleMinutes || 0) + (log.breakMinutes || 0));

  const lateArrivals = logs30.filter((log) => {
    const loginMinutes = minutesSinceMidnight(log.loginTime);
    return loginMinutes != null && loginMinutes > workStart + lateGraceMinutes;
  }).length;

  const earlyLogouts = logs30.filter((log) => {
    const logoutMinutes = minutesSinceMidnight(log.logoutTime);
    return logoutMinutes != null && logoutMinutes < workEnd - earlyGraceMinutes;
  }).length;

  const absentDays = logs30.filter((log) => totalMinutesFor(log) < absentThresholdMinutes).length;
  const leaveFreq = logs90.filter((log) => {
    const total = totalMinutesFor(log);
    return total >= absentThresholdMinutes && total < shortDayThresholdMinutes;
  }).length;

  const metrics = [
    {
      metric: 'late_arrivals_30d',
      value: lateArrivals,
      note: `Activity agent detected ${lateArrivals} late arrival(s) in the last 30 tracked days.`,
    },
    {
      metric: 'early_logouts_30d',
      value: earlyLogouts,
      note: `Activity agent detected ${earlyLogouts} early logout(s) in the last 30 tracked days.`,
    },
    {
      metric: 'absent_days_30d',
      value: absentDays,
      note: `Activity agent detected ${absentDays} very low/no-activity tracked day(s) in the last 30 days.`,
    },
    {
      metric: 'leave_freq_90d',
      value: leaveFreq,
      note: `Activity agent detected ${leaveFreq} short tracked day(s) in the last 90 days.`,
    },
  ];

  const written = [];
  for (const item of metrics) {
    written.push(await upsertActivityRiskSignal({
      organizationId,
      employeeId,
      source: 'system',
      category: 'attendance',
      metric: item.metric,
      value: item.value,
      unit: 'count',
      periodStart: item.metric.endsWith('_90d') ? since90 : since30,
      periodEnd,
      note: item.note,
    }));
  }
  return written;
}

async function recalculateRiskAfterActivity(organizationId, employeeId) {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const [employee, signals, pulses, priorAssessments, org] = await Promise.all([
    Employee.findOne({ _id: employeeId, organizationId }),
    Signal.find({ organizationId, employeeId, periodEnd: { $gte: ninetyDaysAgo } }),
    PulseSurvey.find({ organizationId, employeeId }).sort({ createdAt: -1 }).limit(5),
    RiskAssessment.find({ organizationId, employeeId }).sort({ computedAt: -1 }).limit(3),
    Organization.findById(organizationId),
  ]);
  if (!employee) throw new HttpError(404, 'Employee not found');

  const result = calculateRisk({
    employee,
    signals,
    pulses,
    priorAssessments,
    weights: org?.settings?.riskWeights,
  });

  const assessment = await RiskAssessment.create({
    organizationId,
    employeeId,
    riskScore: result.riskScore,
    category: result.category,
    confidence: result.confidence,
    trend: result.trend,
    componentScores: result.componentScores,
    topFactors: result.topFactors,
    recommendedAction: result.recommendedAction,
    engineVersion: result.engineVersion,
  });

  employee.currentRiskScore = result.riskScore;
  employee.currentRiskCategory = result.category;
  employee.currentRiskTrend = result.trend;
  employee.currentRiskUpdatedAt = new Date();
  await employee.save();

  return assessment;
}

exports.endDay = asyncHandler(async (req, res) => {
  const data = endDaySchema.parse(req.body);
  const employee = await resolveSubmittingEmployee(req, req.body.employeeId);
  const date = dayKey(data.date);

  const log = await ActivityLog.findOneAndUpdate(
    { organizationId: req.organizationId, employeeId: employee._id, date },
    {
      $set: {
        organizationId: req.organizationId,
        employeeId: employee._id,
        userId: req.user._id,
        date,
        logoutTime: new Date(),
        totalWorkMinutes: data.totalWorkMinutes,
        activeMinutes: data.activeMinutes,
        idleMinutes: data.idleMinutes,
        breakMinutes: data.breakMinutes,
        totalLoggedMinutes: data.activeMinutes + data.idleMinutes + data.breakMinutes,
        source: 'desktop_agent',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  let scoreResult = null;
  let riskSignals = [];
  let riskAssessment = null;
  try {
    scoreResult = await calculateAndPersistActivityScore(req.organizationId, employee._id, date);
  } catch (err) {
    console.error('[activity] end-day score failed', err.message);
  }

  if (scoreResult?.score != null) {
    try {
      const signalResult = await refreshActivityRiskSignals({
        organizationId: req.organizationId,
        employeeId: employee._id,
        date,
        scoreDoc: scoreResult.score,
        activityLog: log,
      });
      riskSignals = signalResult.total;
      riskAssessment = await recalculateRiskAfterActivity(req.organizationId, employee._id);
    } catch (err) {
      console.error('[activity] risk refresh after end-day failed', err.message);
    }
  }

  res.status(200).json({
    log,
    score: scoreResult?.score || null,
    risk: riskAssessment || null,
    riskSignals,
  });
});

// HR-friendly narrative summary for the employee-activity detail page.
// Aggregates the same 30-day window the page itself shows, plus the latest
// productivity score and top apps, and asks the AI service for a 2–3 sentence
// write-up (deterministic fallback when no OpenAI key is set).
exports.aiSummary = asyncHandler(async (req, res) => {
  const employee = await assertEmployeeAccess(req, req.params.employeeId);
  const days = Math.min(90, parseInt(req.query.days) || 30);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const periodStart = new Date(Date.now() - 2 * days * 24 * 3600 * 1000);
  const priorEnd = since;

  const [sessions, logs, appUsage, currentScore, priorScore] = await Promise.all([
    ActivitySession.find({
      organizationId: req.organizationId,
      employeeId: employee._id,
      date: { $gte: since },
    }),
    ActivityLog.find({
      organizationId: req.organizationId,
      employeeId: employee._id,
      date: { $gte: since },
    }),
    AppUsageLog.find({
      organizationId: req.organizationId,
      employeeId: employee._id,
      capturedAt: { $gte: since },
    }),
    ProductivityScore.findOne({
      organizationId: req.organizationId,
      employeeId: employee._id,
      period: 'daily',
    }).sort({ date: -1 }),
    ProductivityScore.findOne({
      organizationId: req.organizationId,
      employeeId: employee._id,
      period: 'daily',
      date: { $gte: periodStart, $lt: priorEnd },
    }).sort({ date: -1 }),
  ]);

  const sessionTotals = sessions.reduce((acc, s) => {
    acc.totalMinutes += s.totalMinutes || 0;
    acc.activeMinutes += s.activeMinutes || 0;
    acc.idleMinutes += s.idleMinutes || 0;
    acc.breakMinutes += s.breakMinutes || 0;
    return acc;
  }, { totalMinutes: 0, activeMinutes: 0, idleMinutes: 0, breakMinutes: 0 });

  // Fall back to ActivityLog totals when sessions weren't recorded (e.g. the
  // agent sent /sync but never /session/end).
  if (!sessionTotals.totalMinutes) {
    for (const l of logs) {
      sessionTotals.totalMinutes += l.totalLoggedMinutes || l.totalWorkMinutes || 0;
      sessionTotals.activeMinutes += l.activeMinutes || 0;
      sessionTotals.idleMinutes += l.idleMinutes || 0;
      sessionTotals.breakMinutes += l.breakMinutes || 0;
    }
  }

  const appAgg = {};
  for (const a of appUsage) {
    const key = a.appName || 'Unknown';
    if (!appAgg[key]) appAgg[key] = { appName: key, durationSeconds: 0 };
    appAgg[key].durationSeconds += a.durationSeconds || 0;
  }
  const topApps = Object.values(appAgg).sort((a, b) => b.durationSeconds - a.durationSeconds);

  const result = await generateActivitySummary({
    totals: sessionTotals,
    score: currentScore ? { score: currentScore.score, band: currentScore.band } : null,
    prior: priorScore ? { score: priorScore.score } : null,
    topApps,
    period: `last ${days} days`,
    role: employee.designation || null,
  });

  res.json({
    summary: result.summary,
    source: result.source,
    period: { days, since },
    totals: sessionTotals,
    score: currentScore ? { score: currentScore.score, band: currentScore.band, date: currentScore.date } : null,
  });
});

exports.appsForEmployee = asyncHandler(async (req, res) => {
  await assertEmployeeAccess(req, req.params.employeeId);
  const days = Math.min(30, parseInt(req.query.days) || 7);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const items = await AppUsageLog.find({
    organizationId: req.organizationId,
    employeeId: req.params.employeeId,
    capturedAt: { $gte: since },
  }).sort({ capturedAt: -1 }).limit(Math.min(250, parseInt(req.query.limit) || 100));

  const summaryMap = {};
  for (const item of items) {
    const key = item.appName;
    if (!summaryMap[key]) summaryMap[key] = { appName: key, category: item.category, durationSeconds: 0 };
    summaryMap[key].durationSeconds += item.durationSeconds || 0;
  }
  res.json({ items, summary: Object.values(summaryMap).sort((a, b) => b.durationSeconds - a.durationSeconds) });
});
