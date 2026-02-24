/**
 * routes/promptRoutes.js — Express router for prompt API endpoints
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/promptController');

// POST /api/prompt — Analyze raw prompt
router.post('/prompt', controller.analyzePrompt);

// POST /api/clarify — Merge selected chips and re-analyze
router.post('/clarify', controller.clarifyPrompt);

// POST /api/refine — AI refinement + drift detection
router.post('/refine', controller.refinePrompt);

// GET /api/prompt/:id — Retrieve stored prompt
router.get('/prompt/:id', controller.getPrompt);

// GET /api/debug — Test AI pipeline
router.get('/debug', controller.debugAI);

module.exports = router;
