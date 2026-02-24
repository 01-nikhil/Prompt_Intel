/**
 * services/intentDetector.js — Hybrid intent detection
 *
 * Strategy:
 *  1. Run rule-based keyword matching (always available)
 *  2. If USE_AI=true, ask Gemini for semantic intent
 *  3. If AI succeeds, return AI result with source="ai"
 *  4. If AI fails, return rule-based result with source="rule"
 */

const gemini = require('./groqClient');

/* ── Intent Categories ─────────────────────────────────── */
const INTENT_RULES = [
    {
        intent: 'code_generation',
        keywords: ['write', 'code', 'implement', 'function', 'program', 'script', 'algorithm', 'build', 'create a', 'develop'],
    },
    {
        intent: 'explanation',
        keywords: ['explain', 'what is', 'how does', 'describe', 'tell me about', 'define', 'meaning of', 'why does'],
    },
    {
        intent: 'debugging',
        keywords: ['fix', 'debug', 'error', 'bug', 'issue', 'not working', 'wrong', 'broken', 'failing'],
    },
    {
        intent: 'creative_writing',
        keywords: ['write a story', 'poem', 'essay', 'blog', 'article', 'creative', 'narrative', 'fiction'],
    },
    {
        intent: 'data_analysis',
        keywords: ['analyze', 'data', 'chart', 'graph', 'statistics', 'dataset', 'csv', 'visualize', 'plot'],
    },
    {
        intent: 'summarization',
        keywords: ['summarize', 'summary', 'tldr', 'shorten', 'condense', 'brief', 'key points'],
    },
    {
        intent: 'translation',
        keywords: ['translate', 'convert to', 'in spanish', 'in french', 'in hindi', 'localize'],
    },
    {
        intent: 'comparison',
        keywords: ['compare', 'difference between', 'vs', 'versus', 'pros and cons', 'better'],
    },
    {
        intent: 'instruction',
        keywords: ['how to', 'steps to', 'guide', 'tutorial', 'instructions', 'walk me through', 'show me how'],
    },
];

/**
 * Rule-based intent detection.
 * Returns the first matching intent or "general".
 */
function detectByRules(text) {
    const lower = text.toLowerCase();
    for (const rule of INTENT_RULES) {
        for (const kw of rule.keywords) {
            if (lower.includes(kw)) {
                return { detected: rule.intent, confidence: 'medium', source: 'rule' };
            }
        }
    }
    return { detected: 'general', confidence: 'low', source: 'rule' };
}

/**
 * AI-based intent detection via Gemini.
 */
async function detectByAI(text) {
    const prompt = `Analyze the following user prompt and return ONLY a JSON object with two fields:
- "intent": one of [code_generation, explanation, debugging, creative_writing, data_analysis, summarization, translation, comparison, instruction, general]
- "confidence": one of [high, medium, low]

User prompt: "${text}"

Respond with ONLY valid JSON, no markdown, no explanation.`;

    const raw = await gemini.generate(prompt);
    if (!raw) return null;

    try {
        const cleaned = raw.replace(/```json\n?|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
            detected: parsed.intent || 'general',
            confidence: parsed.confidence || 'medium',
            source: 'ai',
        };
    } catch {
        return null;
    }
}

/**
 * Main entry point — pure rule-based detection.
 * AI is handled by the combined promptAnalyzer service instead.
 */
async function detect(text) {
    return detectByRules(text);
}

module.exports = { detect };
