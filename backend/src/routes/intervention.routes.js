const router = require('express').Router();
const ctrl = require('../controllers/intervention.controller');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);

router.get('/', ctrl.list);
router.get('/employee/:employeeId', ctrl.byEmployee);
router.post('/', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN, ROLES.MANAGER), ctrl.create);
router.put('/:id', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN, ROLES.MANAGER), ctrl.update);

module.exports = router;
