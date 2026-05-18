module.exports = {
  API_BASE_URL: process.env.API_BASE_URL || 'https://retainiq.marioxsoftware.in/api',
  WEB_APP_ORIGINS: (process.env.WEB_APP_ORIGINS || 'https://retainiq.marioxsoftware.in,https://www.retainiq.marioxsoftware.in')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  screenshotIntervalMinutes: Number(process.env.SCREENSHOT_INTERVAL_MINUTES || 10),
  idleThresholdMinutes: Number(process.env.IDLE_THRESHOLD_MINUTES || 5),
  eventSyncIntervalMinutes: Number(process.env.EVENT_SYNC_INTERVAL_MINUTES || 5),
  appTrackingIntervalSeconds: Number(process.env.APP_TRACKING_INTERVAL_SECONDS || 30),
};
