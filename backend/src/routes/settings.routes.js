const router = require('express').Router();
const ctrl = require('../controllers/settings.controller');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);
router.get('/', ctrl.get);
router.put('/', requireRoles(ROLES.ORG_ADMIN), ctrl.update);

module.exports = router;
