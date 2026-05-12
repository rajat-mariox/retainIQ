module.exports = {
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:5000/api',
  screenshotIntervalMinutes: Number(process.env.SCREENSHOT_INTERVAL_MINUTES || 10),
  idleThresholdMinutes: Number(process.env.IDLE_THRESHOLD_MINUTES || 5),
  eventSyncIntervalMinutes: Number(process.env.EVENT_SYNC_INTERVAL_MINUTES || 5),
  appTrackingIntervalSeconds: Number(process.env.APP_TRACKING_INTERVAL_SECONDS || 30),
};
