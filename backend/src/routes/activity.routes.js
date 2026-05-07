const router = require('express').Router();
const ctrl = require('../controllers/activity.controller');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);
router.post('/', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE), ctrl.upsert);
router.post('/bulk', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN), ctrl.bulk);
router.get('/:employeeId', ctrl.forEmployee);

module.exports = router;
