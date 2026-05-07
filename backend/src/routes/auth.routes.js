const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth');

router.post('/register-org', ctrl.registerOrg);
router.post('/login', ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);

module.exports = router;
