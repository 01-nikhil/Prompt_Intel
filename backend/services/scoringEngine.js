/**
 * services/scoringEngine.js — Prompt quality scoring
 *
 * Scores a prompt across four dimensions (0-10 each):
 *  - Clarity       : How clear and unambiguous is the prompt?
 *  - Completeness  : Does it include all necessary information?
 *  - Specificity   : How specific vs. vague is the request?
 *  - Intent Alignment : Does the prompt clearly express an actionable intent?
 *
 * Returns per-dimension breakdown + total (0-40).
 */

const gemini = require('./groqClient');

/**
 * Rule-based scoring heuristics.
 */
function scoreByRules(text, gaps = []) {
    const words = text.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const sentenceCount = (text.match(/[.!?]+/g) || []).length || 1;
    const hasQuestionMark = text.includes('?');
    const uniqueWords = new Set(words.map((w) => w.toLowerCase()));

    // ── Clarity (0-10) ──
    // Longer prompts with proper punctuation tend to be clearer
    let clarity = 3;
    if (wordCount >= 5) clarity += 1;
    if (wordCount >= 10) clarity += 1;
    if (wordCount >= 20) clarity += 1;
    if (sentenceCount >= 2) clarity += 1;
    if (text.includes(',')) clarity += 1;
    if (hasQuestionMark || text.includes('.')) clarity += 1;
    // Penalize very short prompts
    if (wordCount < 3) clarity = Math.max(1, clarity - 3);
    clarity = Math.min(10, clarity);

    // ── Completeness (0-10) ──
    // Based on how few constraint gaps exist
    let completeness = 10 - gaps.length * 2;
    if (wordCount >= 15) completeness += 1;
    if (wordCount >= 30) completeness += 1;
    completeness = Math.max(1, Math.min(10, completeness));

    // ── Specificity (0-10) ──
    // Higher vocabulary diversity + technical terms = more specific
    let specificity = 3;
    const diversityRatio = uniqueWords.size / Math.max(wordCount, 1);
    if (diversityRatio > 0.6) specificity += 1;
    if (diversityRatio > 0.8) specificity += 1;
    if (wordCount >= 8) specificity += 1;
    if (wordCount >= 15) specificity += 1;
    if (wordCount >= 25) specificity += 1;
    // Check for specific technical terms or numbers
    if (/\d+/.test(text)) specificity += 1;
    if (/[A-Z]{2,}/.test(text)) specificity += 1; // acronyms
    specificity = Math.min(10, specificity);

    // ── Intent Alignment (0-10) ──
    // Does the prompt have a clear action verb / question?
    let intentAlignment = 4;
    const actionVerbs = [
        'write', 'create', 'build', 'explain', 'fix', 'debug', 'analyze',
        'compare', 'list', 'generate', 'design', 'implement', 'describe',
        'summarize', 'translate', 'convert', 'show', 'tell', 'help', 'make',
    ];
    const lower = text.toLowerCase();
    const hasAction = actionVerbs.some((v) => lower.includes(v));
    if (hasAction) intentAlignment += 3;
    if (hasQuestionMark) intentAlignment += 1;
    if (wordCount >= 5) intentAlignment += 1;
    if (wordCount < 3) intentAlignment = Math.max(1, intentAlignment - 2);
    intentAlignment = Math.min(10, intentAlignment);

    const total = clarity + completeness + specificity + intentAlignment;

    return { clarity, completeness, specificity, intentAlignment, total };
}

/**
 * AI-based scoring via Gemini.
 */
async function scoreByAI(text) {
    const prompt = `Score this user prompt on four dimensions (0-10 each):
1. clarity: How clear and unambiguous is it?
2. completeness: Does it include necessary context and constraints?
3. specificity: How specific vs. vague is the request?
4. intentAlignment: Does it clearly express an actionable intent?

User prompt: "${text}"

Return ONLY a JSON object like: {"clarity":7,"completeness":5,"specificity":6,"intentAlignment":8,"total":26}
Respond with ONLY valid JSON, no markdown, no explanation.`;

    const raw = await gemini.generate(prompt);
    if (!raw) return null;

    try {
        const cleaned = raw.replace(/```json\n?|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        // Validate all fields are numbers in range
        const fields = ['clarity', 'completeness', 'specificity', 'intentAlignment'];
        for (const f of fields) {
            if (typeof parsed[f] !== 'number' || parsed[f] < 0 || parsed[f] > 10) {
                return null;
            }
        }
        parsed.total = fields.reduce((sum, f) => sum + parsed[f], 0);
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Main entry point — pure rule-based scoring.
 * AI is handled by the combined promptAnalyzer service instead.
 */
async function score(text, gaps = []) {
    return scoreByRules(text, gaps);
}

module.exports = { score };
