/**
 * Ledger Routes
 * Mounted at /api/collectors.
 */
const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { getLedger, getDashboard } = require('../controllers/ledger.controller');

const router = Router();

// GET /collectors/me/dashboard — collector home screen
router.get('/me/dashboard', authenticate, getDashboard);

// GET /collectors/me/ledger — convenience alias for the caller's own ledger
router.get(
  '/me/ledger',
  authenticate,
  (req, _res, next) => {
    req.params.id = req.user.id;
    next();
  },
  getLedger
);

// GET /collectors/:id/ledger
router.get(
  '/:id/ledger',
  authenticate,
  validate({ params: z.object({ id: z.string().uuid() }) }),
  getLedger
);

module.exports = router;
