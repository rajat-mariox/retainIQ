const router = require('express').Router();
const ctrl = require('../controllers/reports.controller');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);
router.get('/', ctrl.list);
router.post('/generate', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN, ROLES.MANAGER), ctrl.generate);
router.get('/preview/:employeeId', ctrl.previewEmployee);
router.get('/:id', ctrl.get);

module.exports = router;
