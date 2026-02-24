/**
 * services/promptAnalyzer.js — Combined AI Analysis Service
 *
 * Makes a SINGLE AI call that returns:
 *  - gaps: missing constraints
 *  - suggestions: context-aware options for each gap
 *  - refined: improved version of the prompt
 *
 * This replaces multiple individual AI calls with one combined call,
 * reducing total AI usage from ~13 calls to ~3 for a full flow.
 */

const groq = require('./groqClient');

/**
 * Analyze a prompt and return gaps, context-aware suggestions, and a refined version.
 * @param {string} text — The prompt to analyze
 * @param {object} constraints — Any user-selected constraints (e.g. { language: 'Python' })
 * @returns {{ gaps: string[], suggestions: object, refined: string } | null}
 */
async function analyze(text, constraints = {}) {
    const constraintInfo = Object.keys(constraints).length > 0
        ? `\nThe user has already selected these constraints: ${JSON.stringify(constraints)}. Do NOT include these in gaps.`
        : '';

    const prompt = `You are a prompt engineering expert. Analyze the following user prompt and return a JSON object.

User Prompt: "${text}"${constraintInfo}

Return ONLY valid JSON with these exact keys:
{
  "gaps": ["list of missing constraint categories from: language, level, output_format, scope, examples — only include what is genuinely missing"],
  "suggestions": {
    "for_each_gap": ["3 context-aware options relevant to THIS specific prompt"]
  },
  "refined": "An improved, well-structured version of the prompt that incorporates any provided constraints and is clear, specific, and complete."
}

Rules:
- gaps: Only include constraints that are genuinely missing. If the prompt already specifies a language, do NOT include "language".
- suggestions: Keys must match the gap names. Each should have exactly 3 options that are SPECIFIC to this prompt's topic (not generic).
- refined: Rewrite the prompt to be clearer and more complete. If constraints were provided, incorporate them naturally.
- Return ONLY the JSON object. No markdown, no backticks, no explanation.`;

    const raw = await groq.generate(prompt);
    if (!raw) return null;

    try {
        // Strip any markdown fencing if present
        const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        const parsed = JSON.parse(cleaned);

        // Validate structure
        if (!parsed.gaps || !parsed.suggestions || !parsed.refined) {
            console.warn('⚠️  AI response missing required fields');
            return null;
        }

        return {
            gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
            suggestions: parsed.suggestions || {},
            refined: typeof parsed.refined === 'string' ? parsed.refined : null,
        };
    } catch (err) {
        console.error('❌ Failed to parse AI analysis response:', err.message);
        console.error('   Raw response:', raw.slice(0, 200));
        return null;
    }
}

module.exports = { analyze };
