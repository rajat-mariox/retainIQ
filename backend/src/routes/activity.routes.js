const router = require('express').Router();
const ctrl = require('../controllers/activity.controller');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);

// --- Desktop activity agent (employee-only) -------------------------------
const employeeOnly = requireRoles(ROLES.EMPLOYEE);

router.post('/session/start', employeeOnly, ctrl.startSession);
router.post('/session/break', employeeOnly, ctrl.breakSession);
router.post('/session/resume', employeeOnly, ctrl.resumeSession);
router.post('/session/end', employeeOnly, ctrl.endSession);

router.post('/event', employeeOnly, ctrl.createEvent);
router.post('/event/bulk', employeeOnly, ctrl.bulkEvents);

router.post('/app-usage', employeeOnly, ctrl.createAppUsage);
router.post('/app-usage/bulk', employeeOnly, ctrl.bulkAppUsage);

router.post('/screenshot', employeeOnly, ctrl.createScreenshot);

router.post('/sync', employeeOnly, ctrl.sync);
router.post('/end-day', employeeOnly, ctrl.endDay);

// --- Legacy / source-system aggregate ingestion ---------------------------
router.post('/', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE), ctrl.upsert);
router.post('/bulk', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN), ctrl.bulk);

// --- Read endpoints for managers / HR / employee (own data) ---------------
router.get('/:employeeId/screenshots', ctrl.screenshotsForEmployee);
router.get('/:employeeId/apps', ctrl.appsForEmployee);
router.get('/:employeeId/ai-summary', ctrl.aiSummary);
router.get('/:employeeId', ctrl.forEmployee);

module.exports = router;
