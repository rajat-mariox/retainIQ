const router = require('express').Router();
const ctrl = require('../controllers/productivity.controller');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);

router.post('/calculate/:employeeId',
  requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN, ROLES.MANAGER), ctrl.computeDaily);
router.post('/calculate-all',
  requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN), ctrl.computeAllDaily);

router.get('/dashboard',
  requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN, ROLES.MANAGER), ctrl.dashboard);
router.get('/leaderboard', ctrl.leaderboard);

router.get('/:employeeId/scores', ctrl.scoresFor);
router.get('/:employeeId/work-pattern', ctrl.workPattern);
router.get('/:employeeId/burnout-check', ctrl.burnoutCheck);

module.exports = router;
