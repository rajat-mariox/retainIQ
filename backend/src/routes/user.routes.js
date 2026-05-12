const router = require('express').Router();
const ctrl = require('../controllers/user.controller');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);

router.get('/', requireRoles(ROLES.ORG_ADMIN), ctrl.list);
router.post('/', requireRoles(ROLES.ORG_ADMIN), ctrl.createOrgUser);
router.get('/managers', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN), ctrl.managers);

module.exports = router;
