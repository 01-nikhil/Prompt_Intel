/**
 * background.js — Chrome Extension Service Worker (Manifest v3)
 *
 * Responsibilities:
 *  - Register "Improve Prompt" context menu on installation
 *  - Handle context menu click and Ctrl+I keyboard shortcut
 *  - Inject content script if needed, then send selected text
 */

/* ── Register context menu on install / update ─────────── */
chrome.runtime.onInstalled.addListener((details) => {
    chrome.contextMenus.create({
        id: 'improve-prompt',
        title: 'Improve Prompt',
        contexts: ['selection'],
    });
    console.log('[Prompt Intelligence] Context menu registered.');

    // Open onboarding page on first install only
    if (details.reason === 'install') {
        chrome.storage.local.get('piOnboardingDone', (result) => {
            if (!result.piOnboardingDone) {
                chrome.tabs.create({ url: 'welcome.html' });
            }
        });
    }
});

/* ── Inject content script and send message ────────────── */
async function injectAndSend(tab, selectedText) {
    // Skip chrome:// and other restricted URLs
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
        console.warn('[Prompt Intelligence] Cannot run on restricted pages.');
        return;
    }

    try {
        // Inject the content script + CSS programmatically
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
        });
        await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['panel.css'],
        });
    } catch (err) {
        console.warn('[Prompt Intelligence] Could not inject script:', err.message);
    }

    // Small delay to let the script initialize
    setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, {
            action: 'IMPROVE_PROMPT',
            text: selectedText,
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[Prompt Intelligence] Message send failed:', chrome.runtime.lastError.message);
            }
        });
    }, 100);
}

/* ── Handle context menu click ─────────────────────────── */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'improve-prompt') return;

    const selectedText = info.selectionText;
    if (!selectedText || selectedText.trim().length === 0) return;

    await injectAndSend(tab, selectedText.trim());
});

/* ── Handle keyboard shortcut (Ctrl+I) ────────────────── */
chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'improve-prompt') return;

    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Skip restricted pages
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        return;
    }

    // Execute a small script to grab selected text (works on input fields too)
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // Try regular selection first
                const selection = window.getSelection().toString().trim();
                if (selection) return selection;

                // Try active input/textarea selection
                const el = document.activeElement;
                if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                    const start = el.selectionStart;
                    const end = el.selectionEnd;
                    if (start !== end) {
                        return el.value.substring(start, end).trim();
                    }
                }

                return '';
            },
        });

        const selectedText = results?.[0]?.result;
        if (!selectedText) {
            console.warn('[Prompt Intelligence] No text selected.');
            return;
        }

        await injectAndSend(tab, selectedText);
    } catch (err) {
        console.warn('[Prompt Intelligence] Could not get selection:', err.message);
    }
});
