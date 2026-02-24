/**
 * controllers/promptController.js — API request handlers
 *
 * Endpoints:
 *  POST /api/prompt   — Analyze a raw prompt (1 AI call)
 *  POST /api/clarify  — Merge selected constraint chips and re-analyze (1 AI call)
 *  POST /api/refine   — Further refine the prompt + drift check (1 AI call)
 *  GET  /api/prompt/:id — Fetch a stored prompt by ID
 *
 * Architecture: Only promptAnalyzer makes AI calls (1 per endpoint).
 * All other services (intent, scoring, drift) are purely rule-based.
 */

const { v4: uuidv4 } = require('uuid');
const intentDetector = require('../services/intentDetector');
const constraintDetector = require('../services/constraintDetector');
const scoringEngine = require('../services/scoringEngine');
const promptAnalyzer = require('../services/promptAnalyzer');
const driftDetector = require('../services/driftDetector');
const warningGenerator = require('../services/warningGenerator');

// Try to load the Prompt model — may fail if MongoDB is not connected
let Prompt;
try {
    Prompt = require('../models/Prompt');
} catch (e) {
    Prompt = null;
}

/* ── Helper: persist to DB if available ────────────────── */
async function savePrompt(doc) {
    if (!Prompt) return null;
    try {
        const existing = await Prompt.findOne({ promptId: doc.promptId });
        if (existing) {
            Object.assign(existing, doc);
            return await existing.save();
        }
        return await Prompt.create(doc);
    } catch (err) {
        console.error('DB save error:', err.message);
        return null;
    }
}

async function findPrompt(promptId) {
    if (!Prompt) return null;
    try {
        return await Prompt.findOne({ promptId });
    } catch {
        return null;
    }
}

/* ════════════════════════════════════════════════════════
   POST /api/prompt — Initial prompt analysis
   1 AI call (promptAnalyzer) + rule-based intent, scoring, warnings
   ════════════════════════════════════════════════════════ */
async function analyzePrompt(req, res) {
    try {
        const { text } = req.body;
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ error: 'Missing or empty "text" field.' });
        }

        const rawText = text.trim();
        const promptId = uuidv4();

        // Rule-based analysis (no AI calls)
        const intent = await intentDetector.detect(rawText);
        const ruleConstraints = await constraintDetector.detect(rawText);

        // Single AI call: get context-aware gaps, suggestions, and refined text
        const aiResult = await promptAnalyzer.analyze(rawText);

        // Use AI results if available, otherwise fall back to rule-based
        const gaps = aiResult ? aiResult.gaps : ruleConstraints.gaps;
        const suggestions = aiResult ? aiResult.suggestions : ruleConstraints.suggestions;
        const structuredText = aiResult ? aiResult.refined : rawText;

        // Rule-based scoring with the detected gaps
        const finalScores = await scoringEngine.score(rawText, gaps);
        const warnings = warningGenerator.generate(finalScores, gaps, intent);

        // Build version history
        const versions = [
            { label: 'v0_raw', text: rawText },
            { label: 'v1_structured', text: structuredText },
        ];

        const result = {
            promptId,
            intent,
            gaps,
            suggestions,
            scores: finalScores,
            warnings,
            versions,
            driftWarning: '',
        };

        // Persist to database (non-blocking — don't slow down the response)
        savePrompt({
            promptId,
            versions,
            intent,
            constraints: {},
            gaps,
            suggestions,
            scores: finalScores,
            warnings,
            driftWarning: '',
        }).catch(() => { });

        return res.json(result);
    } catch (err) {
        console.error('analyzePrompt error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}

/* ════════════════════════════════════════════════════════
   POST /api/clarify — Merge selected chips & re-analyze
   1 AI call (promptAnalyzer with constraints)
   ════════════════════════════════════════════════════════ */
async function clarifyPrompt(req, res) {
    try {
        const { promptId, selections } = req.body;
        if (!promptId || !selections) {
            return res.status(400).json({ error: 'Missing "promptId" or "selections".' });
        }

        // Retrieve existing prompt
        const existing = await findPrompt(promptId);
        const rawText = existing
            ? existing.versions[0].text
            : (req.body.originalText || '');

        if (!rawText) {
            return res.status(404).json({ error: 'Prompt not found. Provide "originalText".' });
        }

        // Single AI call: refine with constraints + get remaining gaps
        const aiResult = await promptAnalyzer.analyze(rawText, selections);

        // Fallback if AI fails
        let refined, gaps, suggestions;
        if (aiResult) {
            refined = aiResult.refined;
            gaps = aiResult.gaps;
            suggestions = aiResult.suggestions;
        } else {
            // Simple rule-based fallback: append constraints to prompt
            refined = rawText + ' [' + Object.entries(selections).map(([k, v]) => `${k}: ${v}`).join(', ') + ']';
            const ruleResult = await constraintDetector.detect(refined);
            gaps = ruleResult.gaps;
            suggestions = ruleResult.suggestions;
        }

        // Rule-based scoring and warnings
        const scores = await scoringEngine.score(refined, gaps);
        const warnings = warningGenerator.generate(scores, gaps, existing?.intent || {});

        // Build new version
        const versionLabel = existing
            ? `v${existing.versions.length}_clarified`
            : 'v2_clarified';

        const versions = existing
            ? [...existing.versions, { label: versionLabel, text: refined }]
            : [
                { label: 'v0_raw', text: rawText },
                { label: versionLabel, text: refined },
            ];

        const result = {
            promptId,
            refined,
            constraints: selections,
            gaps,
            suggestions,
            scores,
            warnings,
            versions,
        };

        // Update in database (non-blocking)
        savePrompt({
            promptId,
            versions,
            constraints: selections,
            gaps,
            suggestions,
            scores,
            warnings,
        }).catch(() => { });

        return res.json(result);
    } catch (err) {
        console.error('clarifyPrompt error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}

/* ════════════════════════════════════════════════════════
   POST /api/refine — Further refinement + drift check
   1 AI call (promptAnalyzer)
   ════════════════════════════════════════════════════════ */
async function refinePrompt(req, res) {
    try {
        const { promptId, text, constraints } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Missing "text" field.' });
        }

        // Retrieve original for drift comparison
        const existing = await findPrompt(promptId);
        const originalText = existing
            ? existing.versions[0].text
            : (req.body.originalText || text);

        // Single AI call: refine further with constraints
        const aiResult = await promptAnalyzer.analyze(text, constraints || {});
        const refined = aiResult ? aiResult.refined : text;

        // Rule-based drift detection
        const drift = await driftDetector.detect(originalText, refined);

        // Rule-based scoring
        const ruleConstraints = await constraintDetector.detect(refined);
        const scores = await scoringEngine.score(refined, ruleConstraints.gaps);
        const warnings = warningGenerator.generate(scores, ruleConstraints.gaps, existing?.intent || {});

        // Add drift warning if detected
        if (drift.driftDetected) {
            warnings.unshift(`🔀 ${drift.driftWarning}`);
        }

        // Build version
        const versionLabel = existing
            ? `v${existing.versions.length}_refined`
            : 'v2_refined';

        const versions = existing
            ? [...existing.versions, { label: versionLabel, text: refined }]
            : [
                { label: 'v0_raw', text: originalText },
                { label: versionLabel, text: refined },
            ];

        const result = {
            promptId: promptId || uuidv4(),
            refined,
            scores,
            warnings,
            driftWarning: drift.driftWarning,
            driftDetected: drift.driftDetected,
            versions,
        };

        // Update in database (non-blocking)
        savePrompt({
            promptId: result.promptId,
            versions,
            scores,
            warnings,
            driftWarning: drift.driftWarning,
        }).catch(() => { });

        return res.json(result);
    } catch (err) {
        console.error('refinePrompt error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}

/* ════════════════════════════════════════════════════════
   GET /api/prompt/:id — Retrieve stored prompt
   ════════════════════════════════════════════════════════ */
async function getPrompt(req, res) {
    try {
        const { id } = req.params;
        const prompt = await findPrompt(id);
        if (!prompt) {
            return res.status(404).json({ error: 'Prompt not found.' });
        }
        return res.json(prompt);
    } catch (err) {
        console.error('getPrompt error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}

module.exports = {
    analyzePrompt,
    clarifyPrompt,
    refinePrompt,
    getPrompt,
};
