/**
 * services/geminiClient.js — Wrapper around Google Generative AI SDK
 *
 * Provides a single `generate(prompt)` function that:
 *  - Returns the AI text response on success
 *  - Returns null on ANY failure (429, network, bad key, etc.)
 *  - Never throws — callers can safely fallback to rule-based logic
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;

/**
 * Lazily initialise the SDK so we don't crash at import time
 * if the key is missing.
 */
function init() {
    if (model) return true;
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'YOUR_GEMINI_API_KEY_HERE') {
        console.warn('⚠️  Gemini API key not configured — AI features disabled');
        return false;
    }
    try {
        genAI = new GoogleGenerativeAI(key);
        model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        return true;
    } catch (err) {
        console.error('❌ Gemini SDK init error:', err.message);
        return false;
    }
}

/**
 * Generate text from Gemini.
 * @param {string} prompt — The full prompt to send
 * @returns {string|null} — AI response text, or null on failure
 */
async function generate(prompt) {
    if (process.env.USE_AI !== 'true') return null;
    if (!init()) return null;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        return response.text();
    } catch (err) {
        const status = err?.status || err?.code || '';
        console.error(`❌ Gemini API error (${status}):`, err.message);
        return null; // graceful degradation
    }
}

module.exports = { generate };
