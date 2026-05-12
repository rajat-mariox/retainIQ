const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const screenshot = require('screenshot-desktop');
const cron = require('node-cron');
const config = require('../config');

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
  if (data.user?.role !== 'EMPLOYEE') throw new Error('Only employee accounts can use the activity agent');
  saveAuth(data);
  emitState();
  return data;
});

ipcMain.handle('auth:logout', async () => {
  stopTimers();
  clearAuth();
  session = null;
  status = 'Ended';
  emitState();
  return { ok: true };
});

ipcMain.handle('agent:start', async () => {
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
});

ipcMain.handle('agent:break', async () => {
  const { data } = await api().post('/activity/session/break', {});
  session = data;
  status = 'Break';
  emitState();
  return data;
});

ipcMain.handle('agent:resume', async () => {
  const { data } = await api().post('/activity/session/resume', {});
  session = data;
  status = 'Working';
  lastInputAt = Date.now();
  emitState();
  return data;
});

ipcMain.handle('agent:end', async () => {
  await trackActiveWindow();
  await Promise.all([syncEvents(), syncAppUsage()]);

  // Push any remaining buffered aggregates so /end-day can replace with the full picture.
  await syncDailyAggregate({ force: true });

  // End the session record (legacy per-event flow).
  const { data: sessionData } = await api().post('/activity/session/end', {});
  session = sessionData;

  // Final daily summary + immediate productivity score.
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
    console.error('[agent] end-day failed', err.message);
  }

  status = 'Ended';
  pendingSync = freshSyncBuffer();
  stopTimers();
  emitState();
  return { session: sessionData, endDay: endDayResult };
});

ipcMain.handle('agent:get-state', async () => {
  emitState();
  return { authenticated: Boolean(auth?.accessToken), user: auth?.user, status, session, today, lastScreenshotAt, config };
});

app.whenReady().then(() => {
  loadAuth();
  startInputHooks();
  createWindow();
});

app.on('window-all-closed', () => {
  stopTimers();
  if (process.platform !== 'darwin') app.quit();
});
