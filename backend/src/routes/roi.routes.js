const router = require('express').Router();
const ctrl = require('../controllers/roi.controller');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);
router.get('/dashboard', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN), ctrl.dashboard);
router.post('/calculate/:employeeId', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN), ctrl.computeForEmployee);

module.exports = router;
