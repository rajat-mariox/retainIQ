const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const axios = require('axios');
const screenshot = require('screenshot-desktop');
const cron = require('node-cron');
const config = require('../config');

// Local IPC HTTP server — lets the web app push signals (e.g. logout) to the
// running agent without triggering Chrome's custom-protocol prompt. Bound to
// loopback only, so only processes on this machine can reach it.
const IPC_PORT = 48723;

// active-win v9+ is ESM-only and exports `activeWindow` (no default export).
// Resolve the module once and reuse the function reference.
let activeWinFn = null;
let activeWinError = null;
const activeWinReady = (async () => {
  try {
    const m = await import('active-win');
    activeWinFn = m.activeWindow || m.default || null;
    if (!activeWinFn) throw new Error('active-win did not expose activeWindow()');
  } catch (err) {
    activeWinError = err;
    console.error('[agent] active-win unavailable:', err.message);
  }
})();
async function activeWin() {
  await activeWinReady;
  if (!activeWinFn) return null;
  try {
    return await activeWinFn();
  } catch (err) {
    if (!activeWinError) console.error('[agent] active-win call failed:', err.message);
    activeWinError = err;
    return null;
  }
}

let uiohook = null;
try {
  uiohook = require('uiohook-napi').uIOhook;
} catch {
  uiohook = null;
}

let win;
let session = null;
let auth = null;
let status = 'Ended';
let lastInputAt = Date.now();
let keyboardCount = 0;
let mouseCount = 0;
let eventBuffer = [];
let appUsageBuffer = [];
let lastWindow = null;
let lastWindowAt = Date.now();
let lastScreenshotAt = null;
let timers = [];
let screenshotTask = null;
let today = { activeMinutes: 0, idleMinutes: 0, breakMinutes: 0 };

// Effective tracker config — starts from local defaults, overridden by the
// org's settings (fetched from /api/settings on session start).
let effectiveConfig = {
  screenshotIntervalMinutes: config.screenshotIntervalMinutes,
  screenshotsEnabled: true,
};

async function loadOrgSettings() {
  if (!auth?.accessToken) return;
  try {
    const { data } = await api().get('/settings');
    const agentCfg = data?.settings?.agent || {};
    if (Number.isFinite(agentCfg.screenshotIntervalMinutes)) {
      effectiveConfig.screenshotIntervalMinutes = Math.max(1, Math.min(240, agentCfg.screenshotIntervalMinutes));
    }
    if (typeof agentCfg.screenshotsEnabled === 'boolean') {
      effectiveConfig.screenshotsEnabled = agentCfg.screenshotsEnabled;
    }
    console.log(`[agent] org settings loaded — screenshotInterval=${effectiveConfig.screenshotIntervalMinutes}m enabled=${effectiveConfig.screenshotsEnabled}`);
  } catch (err) {
    console.warn('[agent] failed to load org settings, using local defaults:', err.message);
  }
}

// Daily aggregate buffer pushed to /api/activity/sync every 5 min
// and to /api/activity/end-day on End Work. Counters here are deltas
// since the last successful sync — they are zeroed once the server
// acknowledges the upsert.
let pendingSync = null;
function freshSyncBuffer() {
  return {
    totalWorkMinutes: 0,
    activeMinutes: 0,
    idleMinutes: 0,
    breakMinutes: 0,
    keyboardCount: 0,
    mouseCount: 0,
    productiveAppMinutes: 0,
    neutralAppMinutes: 0,
    unproductiveAppMinutes: 0,
    appUsage: [],      // { appName, windowTitle, category, durationMinutes }
    screenshots: [],   // { imageUrl, activeApp, capturedAt }
  };
}
pendingSync = freshSyncBuffer();

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addAppUsageMinutes(category, minutes) {
  if (category === 'productive') pendingSync.productiveAppMinutes += minutes;
  else if (category === 'unproductive') pendingSync.unproductiveAppMinutes += minutes;
  else pendingSync.neutralAppMinutes += minutes;
}

function mergeAppUsage(entry) {
  const existing = pendingSync.appUsage.find(
    (a) => a.appName === entry.appName && a.category === entry.category
  );
  if (existing) {
    existing.durationMinutes += entry.durationMinutes;
    if (entry.windowTitle) existing.windowTitle = entry.windowTitle;
  } else {
    pendingSync.appUsage.push({ ...entry });
  }
}

const storePath = () => path.join(app.getPath('userData'), 'session.json');

// Shared axios instance with a refresh-on-401 interceptor. The Authorization
// header is set per-request from the live `auth` object, so token rotation
// after a refresh is picked up immediately.
const httpClient = axios.create({
  baseURL: config.API_BASE_URL,
  timeout: 30000,
});

httpClient.interceptors.request.use((reqConfig) => {
  if (auth?.accessToken) {
    reqConfig.headers = reqConfig.headers || {};
    reqConfig.headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  return reqConfig;
});

let refreshInFlight = null;
async function doRefresh() {
  if (!auth?.refreshToken) throw new Error('No refresh token available');
  const { data } = await axios.post(
    `${config.API_BASE_URL}/auth/refresh`,
    { refreshToken: auth.refreshToken },
    { timeout: 30000 }
  );
  if (!data?.accessToken) throw new Error('Refresh response missing accessToken');
  saveAuth({ ...auth, accessToken: data.accessToken });
  return data.accessToken;
}

httpClient.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    const isAuthEndpoint = (original.url || '').includes('/auth/');
    if (status === 401 && !original._retried && !isAuthEndpoint && auth?.refreshToken) {
      original._retried = true;
      try {
        if (!refreshInFlight) refreshInFlight = doRefresh().finally(() => { refreshInFlight = null; });
        await refreshInFlight;
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${auth.accessToken}`;
        console.log('[agent] access token refreshed — retrying original request');
        return httpClient.request(original);
      } catch (refreshErr) {
        console.error('[agent] refresh failed — forcing logout:', refreshErr.message);
        clearAuth();
        stopTimers();
        session = null;
        emitState();
      }
    }
    return Promise.reject(error);
  }
);

function api() {
  return httpClient;
}

function saveAuth(nextAuth) {
  auth = nextAuth;
  fs.writeFileSync(storePath(), JSON.stringify(nextAuth, null, 2));
}

function loadAuth() {
  try {
    auth = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
  } catch {
    auth = null;
  }
}

function clearAuth() {
  auth = null;
  try { fs.unlinkSync(storePath()); } catch {}
}

function emitState() {
  win?.webContents.send('agent:state', {
    authenticated: Boolean(auth?.accessToken),
    user: auth?.user,
    status,
    session,
    today,
    lastScreenshotAt,
    config,
  });
}

function agentState() {
  return {
    authenticated: Boolean(auth?.accessToken),
    user: auth?.user,
    status,
    session,
    today,
    lastScreenshotAt,
    config,
  };
}

function classifyApp(appName = '', title = '') {
  const text = `${appName} ${title}`.toLowerCase();
  if (/(code|visual studio|terminal|github|jira|notion|figma|slack|teams|excel|sheets|docs|chrome|edge)/.test(text)) return 'productive';
  if (/(youtube|netflix|spotify|game|instagram|facebook|x\.com|twitter)/.test(text)) return 'unproductive';
  return 'neutral';
}

function queueInputEvent(type, count) {
  if (!session?._id || status === 'Break' || status === 'Ended') return;
  eventBuffer.push({
    sessionId: session._id,
    type,
    count,
    capturedAt: new Date().toISOString(),
  });
}

function startInputHooks() {
  if (!uiohook) return;
  uiohook.on('keydown', () => {
    keyboardCount += 1;
    lastInputAt = Date.now();
  });
  uiohook.on('mousemove', () => {
    mouseCount += 1;
    lastInputAt = Date.now();
  });
  uiohook.on('mousedown', () => {
    mouseCount += 1;
    lastInputAt = Date.now();
  });
  uiohook.start();
}

async function syncEvents() {
  if (!eventBuffer.length || !session?._id) return;
  const items = eventBuffer.splice(0, eventBuffer.length);
  try {
    await api().post('/activity/event/bulk', { items });
  } catch {
    eventBuffer.unshift(...items);
  }
}

async function syncAppUsage() {
  if (!appUsageBuffer.length || !session?._id) {
    console.log(`[agent] syncAppUsage skipped (buffer=${appUsageBuffer.length}, session=${Boolean(session?._id)})`);
    return;
  }
  const items = appUsageBuffer.splice(0, appUsageBuffer.length);
  try {
    await api().post('/activity/app-usage/bulk', { items });
    console.log(`[agent] /activity/app-usage/bulk OK — sent ${items.length} entries`);
  } catch (err) {
    console.error(`[agent] /activity/app-usage/bulk FAIL — ${err.response?.status || ''} ${err.message}`);
    appUsageBuffer.unshift(...items);
  }
}

// Push the daily aggregate buffer to /api/activity/sync. On success the
// buffer is zeroed; on failure it is retained for the next attempt.
async function syncDailyAggregate(extra = {}) {
  if (!auth?.accessToken) return null;
  const payload = { date: todayKey(), ...pendingSync, ...extra };
  const hasContent = payload.totalWorkMinutes
    || payload.activeMinutes
    || payload.idleMinutes
    || payload.breakMinutes
    || payload.keyboardCount
    || payload.mouseCount
    || (payload.appUsage && payload.appUsage.length)
    || (payload.screenshots && payload.screenshots.length);
  if (!hasContent && !extra.force) {
    console.log('[agent] syncDailyAggregate skipped — buffer empty');
    return null;
  }
  try {
    const { data } = await api().post('/activity/sync', payload);
    console.log(`[agent] /activity/sync OK — apps=${payload.appUsage?.length || 0} active=${payload.activeMinutes}m idle=${payload.idleMinutes}m`);
    pendingSync = freshSyncBuffer();
    return data;
  } catch (err) {
    console.error(`[agent] /activity/sync FAIL — ${err.response?.status || ''} ${err.message}`);
    return null;
  }
}

function startTimers() {
  stopTimers();

  timers.push(setInterval(() => {
    if (!session?._id || status === 'Ended') return;
    pendingSync.totalWorkMinutes += 1;
    if (status === 'Break') {
      today.breakMinutes += 1;
      pendingSync.breakMinutes += 1;
      emitState();
      return;
    }
    const idle = Date.now() - lastInputAt >= config.idleThresholdMinutes * 60000;
    if (keyboardCount || mouseCount) {
      queueInputEvent('keyboard', keyboardCount);
      queueInputEvent('mouse', mouseCount);
      pendingSync.keyboardCount += keyboardCount;
      pendingSync.mouseCount += mouseCount;
      keyboardCount = 0;
      mouseCount = 0;
    }
    queueInputEvent(idle ? 'idle' : 'active', 1);
    if (idle) {
      status = 'Idle';
      today.idleMinutes += 1;
      pendingSync.idleMinutes += 1;
    } else {
      status = 'Working';
      today.activeMinutes += 1;
      pendingSync.activeMinutes += 1;
    }
    emitState();
  }, 60000));

  timers.push(setInterval(syncEvents, config.eventSyncIntervalMinutes * 60000));
  timers.push(setInterval(syncAppUsage, config.eventSyncIntervalMinutes * 60000));
  timers.push(setInterval(syncDailyAggregate, config.eventSyncIntervalMinutes * 60000));
  timers.push(setInterval(trackActiveWindow, config.appTrackingIntervalSeconds * 1000));

  if (effectiveConfig.screenshotsEnabled) {
    const interval = Math.max(1, effectiveConfig.screenshotIntervalMinutes || 10);
    // node-cron accepts */1 but normalizing to '*' avoids any edge-case quirk.
    const cronExpr = interval === 1 ? '* * * * *' : `*/${interval} * * * *`;
    console.log(`[agent] scheduling screenshots — cron="${cronExpr}" (every ${interval} min)`);
    screenshotTask = cron.schedule(cronExpr, captureScreenshot);
  } else {
    console.log('[agent] screenshots disabled by org settings');
  }
}

function stopTimers() {
  timers.forEach((timer) => clearInterval(timer));
  timers = [];
  if (screenshotTask) screenshotTask.stop();
  screenshotTask = null;
}

let trackActiveWindowLoggedFirst = false;
async function trackActiveWindow() {
  if (!session?._id || status === 'Break' || status === 'Ended') return;
  const current = await activeWin().catch(() => null);
  const now = Date.now();
  if (current && !trackActiveWindowLoggedFirst) {
    console.log(`[agent] active-win OK — first window: "${current.owner?.name || '?'}"`);
    trackActiveWindowLoggedFirst = true;
  }
  if (!current && !trackActiveWindowLoggedFirst && activeWinError) {
    console.warn('[agent] active-win returning null — app usage will stay empty');
  }
  if (lastWindow) {
    const appName = lastWindow.owner?.name || lastWindow.owner?.path || 'Unknown app';
    const category = classifyApp(appName, lastWindow.title);
    const seconds = Math.max(1, Math.round((now - lastWindowAt) / 1000));
    const minutes = seconds / 60;

    appUsageBuffer.push({
      sessionId: session._id,
      appName,
      windowTitle: lastWindow.title || '',
      category,
      durationSeconds: seconds,
      capturedAt: new Date(lastWindowAt).toISOString(),
    });

    mergeAppUsage({
      appName,
      windowTitle: lastWindow.title || '',
      category,
      durationMinutes: minutes,
    });
    addAppUsageMinutes(category, minutes);
  }
  lastWindow = current;
  lastWindowAt = now;
}

async function captureScreenshot() {
  console.log(`[agent] screenshot tick — session=${Boolean(session?._id)} status=${status}`);
  if (!session?._id || status === 'Break' || status === 'Ended') {
    console.log('[agent] screenshot skipped — no active working session');
    return;
  }
  let img;
  try {
    img = await screenshot({ format: 'png' });
  } catch (err) {
    console.error('[agent] screenshot-desktop FAILED:', err.message);
    return;
  }
  if (!img) {
    console.warn('[agent] screenshot-desktop returned empty buffer');
    return;
  }
  const current = await activeWin().catch(() => null);
  const appName = current?.owner?.name || current?.owner?.path || 'Unknown app';
  const capturedAt = new Date().toISOString();
  try {
    const { data } = await api().post('/activity/screenshot', {
      sessionId: session._id,
      imageBase64: img.toString('base64'),
      extension: 'png',
      activeApp: appName,
      capturedAt,
    });
    console.log(`[agent] screenshot saved -> ${data?.imageUrl || '(no url)'}`);
    if (data?.imageUrl) {
      pendingSync.screenshots.push({
        imageUrl: data.imageUrl,
        activeApp: appName,
        capturedAt,
      });
    }
  } catch (err) {
    console.error('[agent] /activity/screenshot upload FAILED:', err.response?.status || '', err.message);
  }
  lastScreenshotAt = capturedAt;
  emitState();
}

async function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 640,
    minWidth: 380,
    minHeight: 560,
    title: 'RetainIQ Activity Agent',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  emitState();
}

const AGENT_ALLOWED_ROLES = ['EMPLOYEE', 'MANAGER'];

ipcMain.handle('auth:login', async (_event, credentials) => {
  let data;
  try {
    const res = await axios.post(`${config.API_BASE_URL}/auth/login`, credentials);
    data = res.data;
  } catch (err) {
    const serverMsg = err.response?.data?.error || err.response?.data?.message;
    if (serverMsg) throw new Error(serverMsg);
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      throw new Error(`Cannot reach backend at ${config.API_BASE_URL}. Is the server running?`);
    }
    throw new Error(err.message || 'Login failed');
  }
  if (!AGENT_ALLOWED_ROLES.includes(data.user?.role)) {
    throw new Error('Only employee and manager accounts can use the activity agent');
  }
  saveAuth(data);
  emitState();
  return data;
});

// Exchange a short-lived launch ticket (delivered via retainiq-agent:// deep
// link from the web app) for a full session. Used to auto-login the agent
// after the user logs in on the web.
async function exchangeLaunchTicket(ticket) {
  if (!ticket) throw new Error('Missing launch ticket');
  let data;
  try {
    const res = await axios.post(`${config.API_BASE_URL}/auth/agent-exchange`, { ticket });
    data = res.data;
  } catch (err) {
    const serverMsg = err.response?.data?.error || err.response?.data?.message;
    throw new Error(serverMsg || err.message || 'Agent launch ticket exchange failed');
  }
  if (!AGENT_ALLOWED_ROLES.includes(data.user?.role)) {
    throw new Error('Only employee and manager accounts can use the activity agent');
  }
  saveAuth(data);
  emitState();
  return data;
}

function extractLaunchTicket(urlOrArg) {
  if (!urlOrArg || typeof urlOrArg !== 'string') return null;
  if (!urlOrArg.toLowerCase().startsWith('retainiq-agent://')) return null;
  try {
    const url = new URL(urlOrArg);
    return url.searchParams.get('ticket');
  } catch {
    return null;
  }
}

function findLaunchUrlInArgv(argv) {
  if (!Array.isArray(argv)) return null;
  return argv.find((a) => typeof a === 'string' && a.toLowerCase().startsWith('retainiq-agent://')) || null;
}

function parseDeepLinkAction(urlOrArg) {
  if (!urlOrArg || typeof urlOrArg !== 'string') return null;
  if (!urlOrArg.toLowerCase().startsWith('retainiq-agent://')) return null;
  try {
    const url = new URL(urlOrArg);
    // retainiq-agent://launch?ticket=… → hostname='launch'
    // retainiq-agent://logout         → hostname='logout'
    return (url.hostname || '').toLowerCase() || null;
  } catch {
    return null;
  }
}

// End the work-day cleanly: flush buffers, end the session, post end-day
// summary. Used by both the manual "End Work" button and the web-driven
// remote logout. Safe to call when no session is active (will short-circuit).
async function endWorkDay() {
  if (!auth?.accessToken || !session?._id) {
    stopTimers();
    status = 'Ended';
    pendingSync = freshSyncBuffer();
    emitState();
    return { session: null, endDay: null };
  }
  await trackActiveWindow();
  await Promise.all([syncEvents(), syncAppUsage()]);
  await syncDailyAggregate({ force: true });

  let sessionData = null;
  try {
    const res = await api().post('/activity/session/end', {});
    sessionData = res.data;
    session = sessionData;
  } catch (err) {
    console.error('[agent] session/end failed:', err.message);
  }

  let endDayResult = null;
  try {
    const { data } = await api().post('/activity/end-day', {
      date: todayKey(),
      totalWorkMinutes: today.activeMinutes + today.idleMinutes + today.breakMinutes,
      activeMinutes: today.activeMinutes,
      idleMinutes: today.idleMinutes,
      breakMinutes: today.breakMinutes,
    });
    endDayResult = data;
  } catch (err) {
    console.error('[agent] end-day failed:', err.message);
  }

  status = 'Ended';
  pendingSync = freshSyncBuffer();
  stopTimers();
  emitState();
  return { session: sessionData, endDay: endDayResult };
}

async function startWorkSession() {
  await loadOrgSettings();
  const { data } = await api().post('/activity/session/start', {});
  session = data;
  status = 'Working';
  lastInputAt = Date.now();
  today = { activeMinutes: 0, idleMinutes: 0, breakMinutes: 0 };
  pendingSync = freshSyncBuffer();
  startTimers();
  emitState();
  return data;
}

async function startBreakSession() {
  const { data } = await api().post('/activity/session/break', {});
  session = data;
  status = 'Break';
  emitState();
  return data;
}

async function resumeWorkSession() {
  const { data } = await api().post('/activity/session/resume', {});
  session = data;
  status = 'Working';
  lastInputAt = Date.now();
  emitState();
  return data;
}

// Triggered by retainiq-agent://logout from the web app — finalize any
// active work session, drop local auth, then quit the agent process.
async function handleRemoteLogout() {
  console.log('[agent] remote logout received from web — closing agent');
  try {
    // Cap cleanup at 5s so a hung network doesn't trap the user.
    await Promise.race([
      endWorkDay(),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  } catch (err) {
    console.error('[agent] cleanup during remote logout failed:', err.message);
  }
  clearAuth();
  session = null;
  status = 'Ended';
  emitState();
  // Give the renderer one tick to receive the state update, then quit.
  setTimeout(() => app.quit(), 200);
}

async function handleLaunchUrl(urlOrArg, { focus = true } = {}) {
  const action = parseDeepLinkAction(urlOrArg);
  if (!action) return;

  if (action === 'logout') {
    await handleRemoteLogout();
    return;
  }

  if (action === 'launch') {
    const ticket = extractLaunchTicket(urlOrArg);
    if (!ticket) return;
    try {
      await exchangeLaunchTicket(ticket);
      console.log('[agent] deep-link login OK — session established');
    } catch (err) {
      console.error('[agent] deep-link login FAILED:', err.message);
      win?.webContents.send('agent:launch-error', err.message);
    }
    if (focus && win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
    return;
  }

  console.warn(`[agent] unknown deep-link action: "${action}"`);
}

let ipcServer = null;
function startIpcServer() {
  if (ipcServer) return;
  ipcServer = http.createServer((req, res) => {
    // CORS — only allow localhost dev origins. The server itself is bound to
    // loopback below, so this is just defense-in-depth.
    const origin = req.headers.origin || '';
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        ok: true,
        ...agentState(),
      }));
      return;
    }

    const actionRoutes = {
      '/break': startBreakSession,
      '/resume': resumeWorkSession,
      '/end': endWorkDay,
    };

    if (req.method === 'POST' && actionRoutes[req.url]) {
      res.setHeader('content-type', 'application/json');
      actionRoutes[req.url]()
        .then((result) => {
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, result, state: agentState() }));
        })
        .catch((err) => {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: err.message || 'Action failed', state: agentState() }));
        });
      return;
    }

    if (req.method === 'POST' && req.url === '/logout') {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
      // Respond first, then run cleanup + quit — the fetch should not hang
      // while we end-day on the backend.
      handleRemoteLogout().catch((err) => {
        console.error('[agent] handleRemoteLogout from IPC failed:', err.message);
      });
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  ipcServer.on('error', (err) => {
    console.error(`[agent] local IPC server error: ${err.code || ''} ${err.message}`);
  });

  ipcServer.listen(IPC_PORT, '127.0.0.1', () => {
    console.log(`[agent] local IPC server listening on 127.0.0.1:${IPC_PORT}`);
  });
}

ipcMain.handle('auth:logout', async () => {
  stopTimers();
  clearAuth();
  session = null;
  status = 'Ended';
  emitState();
  return { ok: true };
});

ipcMain.handle('agent:start', async () => {
  return startWorkSession();
});

ipcMain.handle('agent:break', async () => {
  return startBreakSession();
});

ipcMain.handle('agent:resume', async () => {
  return resumeWorkSession();
});

ipcMain.handle('agent:end', async () => endWorkDay());

ipcMain.handle('agent:get-state', async () => {
  emitState();
  return agentState();
});

// Register retainiq-agent:// so the web app can deep-link the user back into
// the agent with a launch ticket. Must run before app.whenReady().
const PROTOCOL = 'retainiq-agent';
if (process.defaultApp) {
  // Dev mode: electron-prebuilt-compile launches via `electron .` — pass the
  // entry script so the OS can re-invoke us with the deep-link URL appended.
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Single-instance lock — if a second launch happens (e.g. user clicks the
// deep-link in the browser while the agent is already running), the OS spawns
// a new process; we forward its argv to the original instance and exit.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const launchUrl = findLaunchUrlInArgv(argv);
    if (launchUrl) handleLaunchUrl(launchUrl);
    else if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  // macOS delivers protocol URLs through open-url instead of argv.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleLaunchUrl(url);
  });

  app.whenReady().then(async () => {
    loadAuth();
    startInputHooks();
    startIpcServer();
    await createWindow();
    // First-launch case: the protocol URL is appended to our own argv.
    const launchUrl = findLaunchUrlInArgv(process.argv);
    if (launchUrl) handleLaunchUrl(launchUrl);
  });
}

app.on('before-quit', () => {
  if (ipcServer) {
    try { ipcServer.close(); } catch {}
    ipcServer = null;
  }
});

app.on('window-all-closed', () => {
  stopTimers();
  if (process.platform !== 'darwin') app.quit();
});
