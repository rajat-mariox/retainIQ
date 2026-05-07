const router = require('express').Router();
const ctrl = require('../controllers/risk.controller');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);

router.post('/calculate/:employeeId',
  requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN, ROLES.MANAGER),
  ctrl.calculateOne);

router.post('/calculate-all',
  requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN),
  ctrl.calculateAll);

router.get('/dashboard',
  requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN, ROLES.MANAGER),
  ctrl.dashboard);

router.get('/:employeeId', ctrl.latest);

module.exports = router;
