/**
 * services/driftDetector.js — Intent drift detection
 *
 * Compares the original raw prompt against a refined prompt
 * to detect if the refinement has changed the user's original intent.
 *
 * Uses keyword overlap heuristic as baseline; optionally uses AI
 * for deeper semantic comparison.
 */

const gemini = require('./groqClient');

/**
 * Extract meaningful keywords from text (lowercase, no stop words).
 */
function extractKeywords(text) {
    const STOP_WORDS = new Set([
        'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
        'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
        'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
        'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each',
        'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some',
        'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very', 'just',
        'about', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
        'he', 'she', 'they', 'them', 'this', 'that', 'these', 'those',
        'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why',
        'if', 'then', 'else', 'while', 'up', 'out', 'off',
    ]);

    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Rule-based drift detection using keyword overlap.
 * If less than 40% of original keywords survive in refined text → drift.
 */
function detectByRules(originalText, refinedText) {
    const origKeywords = extractKeywords(originalText);
    const refinedKeywords = new Set(extractKeywords(refinedText));

    if (origKeywords.length === 0) {
        return { driftDetected: false, driftWarning: '' };
    }

    const overlap = origKeywords.filter((kw) => refinedKeywords.has(kw)).length;
    const overlapRatio = overlap / origKeywords.length;

    if (overlapRatio < 0.4) {
        return {
            driftDetected: true,
            driftWarning:
                `Intent drift detected: only ${Math.round(overlapRatio * 100)}% of original keywords ` +
                `are preserved in the refined prompt. The refinement may have altered your original intent.`,
        };
    }

    return { driftDetected: false, driftWarning: '' };
}

/**
 * AI-based drift detection via Gemini.
 */
async function detectByAI(originalText, refinedText) {
    const prompt = `Compare these two prompts and determine if the refined version preserves the original intent.

Original: "${originalText}"
Refined: "${refinedText}"

Return ONLY a JSON object with:
- "driftDetected": boolean (true if intent changed)
- "driftWarning": string (explanation if drift detected, empty string otherwise)

Respond with ONLY valid JSON, no markdown.`;

    const raw = await gemini.generate(prompt);
    if (!raw) return null;

    try {
        const cleaned = raw.replace(/```json\n?|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
            driftDetected: !!parsed.driftDetected,
            driftWarning: parsed.driftWarning || '',
        };
    } catch {
        return null;
    }
}

/**
 * Main entry point — pure rule-based keyword overlap detection.
 * AI is no longer used for drift detection.
 */
async function detect(originalText, refinedText) {
    return detectByRules(originalText, refinedText);
}

module.exports = { detect };
