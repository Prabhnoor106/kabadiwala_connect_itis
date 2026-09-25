/**
 * Safety Routes
 */
const { Router } = require('express');
const { getGuidance } = require('../controllers/safety.controller');

const router = Router();

// GET /safety/guidance — public (safety content by category + language)
router.get('/guidance', getGuidance);

module.exports = router;
