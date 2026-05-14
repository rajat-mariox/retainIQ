const router = require('express').Router();
const ctrl = require('../controllers/pulse.controller');
const qctrl = require('../controllers/pulseQuestion.controller');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/constants');

router.use(authenticate);

const adminOnly = requireRoles(ROLES.ORG_ADMIN, ROLES.HR_ADMIN);

router.post('/', ctrl.submit);
router.get('/me', ctrl.myHistory);
router.get('/dashboard', adminOnly, ctrl.dashboard);

// HR-defined custom questions. List is readable by all authenticated users in
// the org (employees need it to render the survey); CUD is admin-only.
router.get('/questions', qctrl.list);
router.post('/questions', adminOnly, qctrl.create);
router.put('/questions/:id', adminOnly, qctrl.update);
router.delete('/questions/:id', adminOnly, qctrl.remove);

module.exports = router;
