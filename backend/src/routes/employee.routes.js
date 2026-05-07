const router = require('express').Router();
const ctrl = require('../controllers/employee.controller');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);

router.post('/', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN), ctrl.create);
router.post('/bulk-import', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN), ctrl.bulkImport);
router.put('/:id', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN), ctrl.update);
router.delete('/:id', requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN), ctrl.remove);

module.exports = router;
