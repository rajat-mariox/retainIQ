const router = require('express').Router();
const ctrl = require('../controllers/task.controller');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
