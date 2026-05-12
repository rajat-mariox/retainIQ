const router = require('express').Router();
const ctrl = require('../controllers/organization.controller');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);

// Super admin
router.get('/', requireRoles(ROLES.SUPER_ADMIN), ctrl.listAll);
router.put('/:id/toggle-active', requireRoles(ROLES.SUPER_ADMIN), ctrl.toggleActive);
router.put('/:id/approve', requireRoles(ROLES.SUPER_ADMIN), ctrl.approve);
router.put('/:id/reject', requireRoles(ROLES.SUPER_ADMIN), ctrl.reject);

// Department management within an org
router.get('/departments/list', ctrl.departments);
router.post('/departments', requireRoles(ROLES.ORG_ADMIN), ctrl.createDepartment);

module.exports = router;
