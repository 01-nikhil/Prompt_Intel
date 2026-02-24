/**
 * services/groqClient.js — Wrapper around Groq API
 *
 * Provides a single `generate(prompt)` function that:
 *  - Returns the AI text response on success
 *  - Returns null on ANY failure (429, network, bad key, etc.)
 *  - Never throws — callers can safely fallback to rule-based logic
 *
 * Uses the OpenAI-compatible REST API at https://api.groq.com/openai/v1
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

/**
 * Generate text from Groq.
 * @param {string} prompt — The full prompt to send
 * @returns {string|null} — AI response text, or null on failure
 */
async function generate(prompt) {
    if (process.env.USE_AI !== 'true') return null;

    const key = process.env.GROQ_API_KEY;
    if (!key || key === 'YOUR_GROQ_API_KEY_HERE') {
        console.warn('⚠️  Groq API key not configured — AI features disabled');
        return null;
    }

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: 'user', content: prompt },
                ],
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.error(`❌ Groq API error (${response.status}):`, errText.slice(0, 300));
            return null; // graceful degradation
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        return text || null;
    } catch (err) {
        console.error('❌ Groq API error:', err.message);
        return null; // graceful degradation
    }
}

module.exports = { generate };
