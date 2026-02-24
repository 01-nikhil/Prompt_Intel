/**
 * services/warningGenerator.js — Warning generation
 *
 * Generates user-facing warnings based on analysis results:
 *  - Hallucination risk (when prompt is vague or under-constrained)
 *  - Incomplete constraint warnings
 *  - Low score warnings
 */

/**
 * Generate warnings based on scores, gaps, and intent.
 *
 * @param {Object} scores   — { clarity, completeness, specificity, intentAlignment, total }
 * @param {string[]} gaps   — Array of missing constraint names
 * @param {Object} intent   — { detected, confidence }
 * @returns {string[]}      — Array of warning messages
 */
function generate(scores, gaps = [], intent = {}) {
    const warnings = [];

    // ── Hallucination risk warnings ──
    if (scores.specificity <= 3) {
        warnings.push(
            '⚠️ High hallucination risk: Your prompt is very vague. ' +
            'The AI may generate inaccurate or fabricated information.'
        );
    } else if (scores.specificity <= 5) {
        warnings.push(
            '⚠️ Moderate hallucination risk: Adding more specific details ' +
            'will help the AI produce more accurate results.'
        );
    }

    // ── Incomplete constraint warnings ──
    if (gaps.length >= 4) {
        warnings.push(
            '🔶 Most constraints are missing. Consider specifying language, ' +
            'difficulty level, output format, and scope for better results.'
        );
    } else if (gaps.length >= 2) {
        warnings.push(
            `🔶 Missing constraints: ${gaps.join(', ')}. ` +
            'Filling these in will improve the AI response quality.'
        );
    }

    // ── Low clarity warning ──
    if (scores.clarity <= 3) {
        warnings.push(
            '📝 Low clarity score. Try rephrasing your prompt with clearer ' +
            'language and proper sentence structure.'
        );
    }

    // ── Low intent alignment ──
    if (scores.intentAlignment <= 3) {
        warnings.push(
            '🎯 Unclear intent. Your prompt doesn\'t clearly express what ' +
            'action the AI should take. Try starting with a verb like ' +
            '"Write", "Explain", "Create", or "Compare".'
        );
    }

    // ── Low confidence intent detection ──
    if (intent.confidence === 'low') {
        warnings.push(
            '🔍 Intent detection confidence is low. The system may not ' +
            'have correctly understood what you\'re asking for.'
        );
    }

    // ── Very low total score ──
    if (scores.total <= 12) {
        warnings.push(
            '⚡ Overall prompt quality is low. Significant improvements ' +
            'are recommended before sending to an AI model.'
        );
    }

    return warnings;
}

module.exports = { generate };
