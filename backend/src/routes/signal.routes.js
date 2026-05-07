const router = require('express').Router();
const ctrl = require('../controllers/signal.controller');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);

router.post('/', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN, ROLES.MANAGER), ctrl.create);
router.post('/bulk', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN), ctrl.bulkCreate);
router.get('/:employeeId', ctrl.listForEmployee);

module.exports = router;
