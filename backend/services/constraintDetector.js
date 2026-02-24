/**
 * services/constraintDetector.js — Hybrid constraint-gap detection
 *
 * Detects missing constraints in a user prompt:
 *  - language, level, output_format, scope, examples
 *
 * For each gap found, returns structured suggestion chips
 * so the user can click to fill in the missing information.
 */

const gemini = require('./groqClient');

/* ── Keyword lists used for rule-based detection ───────── */
const LANGUAGES = [
    'javascript', 'python', 'java', 'c++', 'c#', 'ruby', 'go', 'rust',
    'typescript', 'php', 'swift', 'kotlin', 'scala', 'r', 'matlab',
    'sql', 'html', 'css', 'bash', 'shell', 'powershell', 'dart',
];

const LEVELS = [
    'beginner', 'intermediate', 'advanced', 'expert', 'novice',
    'basic', 'simple', 'complex', 'in-depth',
];

const OUTPUT_FORMATS = [
    'code only', 'code + explanation', 'step by step', 'bullet points',
    'table', 'json', 'markdown', 'diagram', 'pseudocode', 'list',
];

const SCOPE_INDICATORS = [
    'function', 'class', 'module', 'full app', 'snippet', 'project',
    'component', 'api', 'endpoint', 'page', 'service', 'script',
];

const EXAMPLE_INDICATORS = [
    'example', 'for instance', 'e.g.', 'such as', 'like this',
    'sample', 'demo', 'illustration',
];

/* ── Default suggestion chips per constraint ───────────── */
const DEFAULT_SUGGESTIONS = {
    language: ['Python', 'JavaScript', 'Java', 'TypeScript', 'C++', 'Go'],
    level: ['Beginner', 'Intermediate', 'Advanced'],
    output_format: ['Code only', 'Code + Explanation', 'Step-by-step', 'Bullet points'],
    scope: ['Function', 'Class', 'Full module', 'Code snippet'],
    examples: ['Include examples', 'No examples needed'],
};

/**
 * Rule-based constraint gap detection.
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectByRules(text) {
    const lower = text.toLowerCase();
    const gaps = [];
    const suggestions = {};

    // Check language (use word boundary for short keywords to avoid false matches)
    const hasLanguage = LANGUAGES.some((lang) => {
        if (lang.length <= 3) {
            return new RegExp(`\\b${escapeRegex(lang)}\\b`, 'i').test(lower);
        }
        return lower.includes(lang);
    });
    if (!hasLanguage) {
        gaps.push('language');
        suggestions.language = DEFAULT_SUGGESTIONS.language;
    }

    // Check level
    const hasLevel = LEVELS.some((lvl) => lower.includes(lvl));
    if (!hasLevel) {
        gaps.push('level');
        suggestions.level = DEFAULT_SUGGESTIONS.level;
    }

    // Check output format
    const hasFormat = OUTPUT_FORMATS.some((fmt) => lower.includes(fmt));
    if (!hasFormat) {
        gaps.push('output_format');
        suggestions.output_format = DEFAULT_SUGGESTIONS.output_format;
    }

    // Check scope
    const hasScope = SCOPE_INDICATORS.some((s) => lower.includes(s));
    if (!hasScope) {
        gaps.push('scope');
        suggestions.scope = DEFAULT_SUGGESTIONS.scope;
    }

    // Check examples
    const hasExamples = EXAMPLE_INDICATORS.some((e) => lower.includes(e));
    if (!hasExamples) {
        gaps.push('examples');
        suggestions.examples = DEFAULT_SUGGESTIONS.examples;
    }

    return { gaps, suggestions };
}

/**
 * AI-based constraint gap detection via Gemini.
 * Returns context-aware suggestions instead of generic defaults.
 */
async function detectByAI(text) {
    const prompt = `Analyze this user prompt and identify missing constraints.

User prompt: "${text}"

Return ONLY a JSON object with:
- "gaps": array of missing constraints from [language, level, output_format, scope, examples]
- "suggestions": object where each gap key maps to an array of 3-6 relevant suggestion strings

Example response:
{"gaps":["language","level"],"suggestions":{"language":["Python","JavaScript","Java"],"level":["Beginner","Intermediate","Advanced"]}}

Respond with ONLY valid JSON, no markdown, no explanation.`;

    const raw = await gemini.generate(prompt);
    if (!raw) return null;

    try {
        const cleaned = raw.replace(/```json\n?|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed.gaps) && parsed.suggestions) {
            return { gaps: parsed.gaps, suggestions: parsed.suggestions };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Main entry point — pure rule-based detection.
 * Context-aware AI suggestions are handled by promptAnalyzer instead.
 */
async function detect(text) {
    return detectByRules(text);
}

module.exports = { detect };
