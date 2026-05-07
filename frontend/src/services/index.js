import { api } from './api';

export const authService = {
  registerOrg: (payload) => api.post('/auth/register-org', payload).then((r) => r.data),
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
};

export const employeeService = {
  list: (params) => api.get('/employees', { params }).then((r) => r.data),
  get: (id) => api.get(`/employees/${id}`).then((r) => r.data),
  create: (payload) => api.post('/employees', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/employees/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/employees/${id}`).then((r) => r.data),
};

export const signalService = {
  create: (payload) => api.post('/signals', payload).then((r) => r.data),
  forEmployee: (employeeId) => api.get(`/signals/${employeeId}`).then((r) => r.data),
};

export const riskService = {
  calculate: (employeeId) => api.post(`/risk/calculate/${employeeId}`).then((r) => r.data),
  calculateAll: () => api.post('/risk/calculate-all').then((r) => r.data),
  latest: (employeeId) => api.get(`/risk/${employeeId}`).then((r) => r.data),
  dashboard: () => api.get('/risk/dashboard').then((r) => r.data),
};

export const interventionService = {
  list: (params) => api.get('/interventions', { params }).then((r) => r.data),
  byEmployee: (employeeId) => api.get(`/interventions/employee/${employeeId}`).then((r) => r.data),
  create: (payload) => api.post('/interventions', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/interventions/${id}`, payload).then((r) => r.data),
};

export const pulseService = {
  submit: (payload) => api.post('/pulse', payload).then((r) => r.data),
  myHistory: () => api.get('/pulse/me').then((r) => r.data),
  dashboard: () => api.get('/pulse/dashboard').then((r) => r.data),
};

export const notificationService = {
  list: () => api.get('/notifications').then((r) => r.data),
  markRead: (id) => api.put(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.put('/notifications/read-all').then((r) => r.data),
};

export const settingsService = {
  get: () => api.get('/settings').then((r) => r.data),
  update: (payload) => api.put('/settings', payload).then((r) => r.data),
};

export const orgService = {
  listAll: () => api.get('/organizations').then((r) => r.data),
  toggleActive: (id) => api.put(`/organizations/${id}/toggle-active`).then((r) => r.data),
  departments: () => api.get('/organizations/departments/list').then((r) => r.data),
  createDepartment: (payload) => api.post('/organizations/departments', payload).then((r) => r.data),
};

export const activityService = {
  upsert: (payload) => api.post('/activity', payload).then((r) => r.data),
  bulk: (items) => api.post('/activity/bulk', { items }).then((r) => r.data),
  forEmployee: (employeeId, days = 30) => api.get(`/activity/${employeeId}`, { params: { days } }).then((r) => r.data),
};

export const productivityService = {
  dashboard: () => api.get('/productivity/dashboard').then((r) => r.data),
  leaderboard: (params) => api.get('/productivity/leaderboard', { params }).then((r) => r.data),
  scoresFor: (employeeId, days = 30) => api.get(`/productivity/${employeeId}/scores`, { params: { days } }).then((r) => r.data),
  workPattern: (employeeId) => api.get(`/productivity/${employeeId}/work-pattern`).then((r) => r.data),
  burnoutCheck: (employeeId) => api.get(`/productivity/${employeeId}/burnout-check`).then((r) => r.data),
  calculate: (employeeId) => api.post(`/productivity/calculate/${employeeId}`).then((r) => r.data),
  calculateAll: () => api.post('/productivity/calculate-all').then((r) => r.data),
};

export const reportService = {
  list: (params) => api.get('/reports', { params }).then((r) => r.data),
  generate: (payload) => api.post('/reports/generate', payload).then((r) => r.data),
  preview: (employeeId, period = 'weekly') => api.get(`/reports/preview/${employeeId}`, { params: { period } }).then((r) => r.data),
  get: (id) => api.get(`/reports/${id}`).then((r) => r.data),
};

export const roiService = {
  dashboard: (period = 'monthly') => api.get('/roi/dashboard', { params: { period } }).then((r) => r.data),
  calculate: (employeeId) => api.post(`/roi/calculate/${employeeId}`).then((r) => r.data),
};

export const alertService = {
  list: (params) => api.get('/alerts', { params }).then((r) => r.data),
  summary: () => api.get('/alerts/summary').then((r) => r.data),
  acknowledge: (id) => api.put(`/alerts/${id}/acknowledge`).then((r) => r.data),
};
