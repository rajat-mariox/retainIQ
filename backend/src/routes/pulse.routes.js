const router = require('express').Router();
const ctrl = require('../controllers/pulse.controller');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);

router.post('/', ctrl.submit);
router.get('/me', ctrl.myHistory);
router.get('/dashboard', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN), ctrl.dashboard);

module.exports = router;
