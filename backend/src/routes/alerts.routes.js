const router = require('express').Router();
const ctrl = require('../controllers/alerts.controller');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);
router.get('/', ctrl.list);
router.get('/summary', ctrl.summary);
router.put('/:id/acknowledge', ctrl.acknowledge);

module.exports = router;
