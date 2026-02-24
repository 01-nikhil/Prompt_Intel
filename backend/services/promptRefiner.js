/**
 * services/promptRefiner.js — Prompt refinement service
 *
 * Restructures and improves a prompt for clarity and formatting:
 *  - Does NOT change the user's original intent
 *  - Does NOT invent constraints the user didn't specify
 *  - Merges selected constraint chips into the prompt
 *  - Uses AI when available, otherwise applies rule-based templates
 */

const gemini = require('./groqClient');

/**
 * Rule-based prompt refinement.
 * Applies structural improvements without changing meaning.
 */
function refineByRules(text, constraints = {}) {
    let refined = text.trim();

    // Capitalize first letter
    if (refined.length > 0) {
        refined = refined.charAt(0).toUpperCase() + refined.slice(1);
    }

    // Ensure it ends with proper punctuation
    if (!/[.!?]$/.test(refined)) {
        refined += '.';
    }

    // Append selected constraints as structured requirements
    const constraintLines = [];
    if (constraints.language) {
        constraintLines.push(`Programming language: ${constraints.language}`);
    }
    if (constraints.level) {
        constraintLines.push(`Target audience level: ${constraints.level}`);
    }
    if (constraints.output_format) {
        constraintLines.push(`Output format: ${constraints.output_format}`);
    }
    if (constraints.scope) {
        constraintLines.push(`Scope: ${constraints.scope}`);
    }
    if (constraints.examples) {
        constraintLines.push(`Examples: ${constraints.examples}`);
    }

    if (constraintLines.length > 0) {
        refined += '\n\nRequirements:\n' + constraintLines.map((l) => `- ${l}`).join('\n');
    }

    return refined;
}

/**
 * AI-based prompt refinement via Gemini.
 * Improves clarity and structure, preserves intent.
 */
async function refineByAI(text, constraints = {}) {
    const constraintStr = Object.entries(constraints)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

    const constraintSection = constraintStr
        ? `\nThe user also specified these constraints: ${constraintStr}\nIncorporate them naturally.`
        : '';

    const prompt = `You are a prompt engineering expert. Improve the following user prompt for clarity, structure, and precision.

Rules:
1. Do NOT change the original intent
2. Do NOT invent new constraints or requirements not present
3. Do NOT add information the user didn't ask for
4. Improve grammar, clarity, and formatting
5. Make it more actionable and specific
${constraintSection}

Original prompt: "${text}"

Return ONLY the improved prompt text. No explanations, no markdown wrapping, no quotes.`;

    const raw = await gemini.generate(prompt);
    if (!raw) return null;

    return raw.trim();
}

/**
 * Main entry point — tries AI refinement, falls back to rules.
 */
async function refine(text, constraints = {}) {
    const aiResult = await refineByAI(text, constraints);
    if (aiResult) return aiResult;

    return refineByRules(text, constraints);
}

module.exports = { refine };
