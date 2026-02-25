/**
 * content.js — Content Script for Prompt Intelligence Extension
 *
 * Injects a floating panel into the current page when the user
 * triggers "Improve Prompt" from the context menu. The panel
 * displays analysis results, suggestion chips, and the refined prompt.
 *
 * Uses Shadow DOM for style isolation from the host page.
 *
 * Theme: "Warm Aurora" — amber / coral / rose
 */

/* ── Guard against double-injection ────────────────────── */
if (window.__PI_CONTENT_LOADED__) {
  // Script already loaded — skip re-initialization
} else {
  window.__PI_CONTENT_LOADED__ = true;

  /* ── Configuration ─────────────────────────────────────── */
  const API_BASE = 'https://promptintel-livid.vercel.app/api';

  /* ── State ─────────────────────────────────────────────── */
  let panelHost = null;
  let shadowRoot = null;
  let currentPromptId = null;
  let originalText = '';
  let accumulatedSelections = {};
  let sourceElementInfo = null; // For paste-back feature

  /* ── Listen for messages from background worker ────────── */
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'IMPROVE_PROMPT' && message.text) {
      // Capture source element BEFORE opening panel (selection is still alive)
      captureSourceElement();
      originalText = message.text;
      openPanel(message.text);
    }
  });

  /* ════════════════════════════════════════════════════════
     Source Element Capture & Paste-Back
     ════════════════════════════════════════════════════════ */

  function captureSourceElement() {
    try {
      const el = document.activeElement;

      // Textarea or text input
      if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text'))) {
        sourceElementInfo = {
          type: 'input',
          element: el,
          selectionStart: el.selectionStart,
          selectionEnd: el.selectionEnd,
        };
        return;
      }

      // Contenteditable element (like ChatGPT, Notion, etc.)
      if (el && el.isContentEditable) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          sourceElementInfo = {
            type: 'contenteditable',
            element: el,
            range: sel.getRangeAt(0).cloneRange(),
          };
          return;
        }
      }

      // Generic page selection (non-editable text)
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        // Check if the selection is inside a contenteditable ancestor
        const anchor = sel.anchorNode;
        const editableAncestor = anchor?.parentElement?.closest('[contenteditable="true"]');
        if (editableAncestor) {
          sourceElementInfo = {
            type: 'contenteditable',
            element: editableAncestor,
            range: sel.getRangeAt(0).cloneRange(),
          };
          return;
        }
        sourceElementInfo = { type: 'readonly' };
        return;
      }
    } catch (e) {
      console.warn('[PI] Could not capture source element:', e);
    }
    sourceElementInfo = null;
  }

  function pasteToSource(text) {
    if (!sourceElementInfo) return false;

    try {
      if (sourceElementInfo.type === 'input') {
        const el = sourceElementInfo.element;
        if (!el || !document.body.contains(el)) return false;

        const start = sourceElementInfo.selectionStart;
        const end = sourceElementInfo.selectionEnd;

        el.focus();
        el.setSelectionRange(start, end);

        // Try execCommand for React / framework compatibility
        if (!document.execCommand('insertText', false, text)) {
          // Fallback: native setter + input event
          const proto = el.tagName === 'TEXTAREA'
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          const before = el.value.substring(0, start);
          const after = el.value.substring(end);
          setter.call(el, before + text + after);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
      }

      if (sourceElementInfo.type === 'contenteditable') {
        const el = sourceElementInfo.element;
        if (!el || !document.body.contains(el)) return false;

        el.focus();
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(sourceElementInfo.range);
        document.execCommand('insertText', false, text);
        return true;
      }
    } catch (e) {
      console.warn('[PI] Paste to source failed:', e);
    }
    return false;
  }

  /* ════════════════════════════════════════════════════════
     Panel Creation & Management
     ════════════════════════════════════════════════════════ */

  function openPanel(text) {
    // Remove existing panel if any
    closePanel();
    accumulatedSelections = {};

    // Create host element
    panelHost = document.createElement('div');
    panelHost.id = 'pi-panel-host';
    panelHost.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(panelHost);

    // Attach shadow DOM for style isolation
    shadowRoot = panelHost.attachShadow({ mode: 'open' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = getPanelStyles();
    shadowRoot.appendChild(style);

    // Create panel structure
    const panel = document.createElement('div');
    panel.className = 'pi-panel';
    panel.innerHTML = buildPanelHTML();
    shadowRoot.appendChild(panel);

    // Trigger open animation
    requestAnimationFrame(() => {
      panel.classList.add('pi-panel--open');
    });

    // Wire event listeners
    wireEvents(panel);

    // Send to backend for analysis
    analyzePrompt(text);
  }

  function closePanel() {
    // Remove ALL existing panel hosts to prevent stacking
    document.querySelectorAll('#pi-panel-host').forEach((el) => el.remove());

    if (panelHost) {
      const panel = shadowRoot?.querySelector('.pi-panel');
      if (panel) {
        panel.classList.remove('pi-panel--open');
        panel.classList.add('pi-panel--closing');
        setTimeout(() => {
          panelHost?.remove();
          panelHost = null;
          shadowRoot = null;
          currentPromptId = null;
        }, 300);
      } else {
        panelHost.remove();
        panelHost = null;
        shadowRoot = null;
      }
    } else {
      panelHost = null;
      shadowRoot = null;
      currentPromptId = null;
    }
  }

  /* ════════════════════════════════════════════════════════
     HTML Template
     ════════════════════════════════════════════════════════ */

  function buildPanelHTML() {
    return `
    <div class="pi-header">
      <div class="pi-header__left">
        <svg class="pi-logo" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <span class="pi-title">Prompt Intelligence</span>
      </div>
      <button class="pi-close" aria-label="Close">&times;</button>
    </div>

    <div class="pi-body">
      <!-- Loading state -->
      <div class="pi-loading" id="pi-loading">
        <div class="pi-spinner"></div>
        <span>Analyzing your prompt…</span>
      </div>

      <!-- Results section (hidden until analysis completes) -->
      <div class="pi-results" id="pi-results" style="display:none;">

        <!-- Original prompt -->
        <div class="pi-section">
          <div class="pi-section__label" style="display:flex;align-items:center;justify-content:space-between;">
            Your Prompt
            <button class="pi-btn pi-btn--edit pi-btn--sm" id="pi-edit-original">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit
            </button>
          </div>
          <div class="pi-original" id="pi-original-text"></div>
          <textarea class="pi-original-edit" id="pi-original-edit" style="display:none;" rows="3"></textarea>
          <button class="pi-btn pi-btn--primary pi-btn--sm" id="pi-reanalyze" style="display:none;margin-top:6px;">
            Re-analyze
          </button>
        </div>

        <!-- Intent -->
        <div class="pi-section">
          <div class="pi-section__label">Detected Intent</div>
          <div class="pi-intent-row">
            <span class="pi-badge pi-badge--intent" id="pi-intent"></span>
            <span class="pi-badge pi-badge--confidence" id="pi-confidence"></span>
          </div>
        </div>

        <!-- Score -->
        <div class="pi-section">
          <div class="pi-section__label">Quality Score</div>
          <div class="pi-score-total" id="pi-score-total"></div>
          <div class="pi-score-bars" id="pi-score-bars"></div>
        </div>

        <!-- Warnings -->
        <div class="pi-section" id="pi-warnings-section" style="display:none;">
          <div class="pi-section__label">Warnings</div>
          <div class="pi-warnings" id="pi-warnings"></div>
        </div>

        <!-- Suggestion Chips -->
        <div class="pi-section" id="pi-chips-section" style="display:none;">
          <div class="pi-section__label">Fill Missing Constraints</div>
          <div class="pi-chips-container" id="pi-chips"></div>
          <button class="pi-btn pi-btn--primary" id="pi-apply-chips" style="display:none;">
            Apply Selections
          </button>
        </div>

        <!-- Refined Prompt -->
        <div class="pi-section" id="pi-refined-section" style="display:none;">
          <div class="pi-section__label">Improved Prompt</div>
          <div class="pi-refined" id="pi-refined-text"></div>
          <div class="pi-actions">
            <button class="pi-btn pi-btn--paste" id="pi-paste">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
                <rect x="8" y="2" width="8" height="4" rx="1"/>
                <path d="M12 11v6m-3-3l3 3 3-3"/>
              </svg>
              Paste
            </button>
            <button class="pi-btn pi-btn--copy" id="pi-copy">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              Copy
            </button>
            <button class="pi-btn pi-btn--edit" id="pi-edit">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit
            </button>
            <button class="pi-btn pi-btn--secondary" id="pi-refine-more">
              Refine Further
            </button>
          </div>
        </div>

      </div>

      <!-- Error state -->
      <div class="pi-error" id="pi-error" style="display:none;">
        <span>⚠️ </span>
        <span id="pi-error-msg"></span>
        <button class="pi-btn pi-btn--secondary" id="pi-retry">Retry</button>
      </div>
    </div>
  `;
  }

  /* ════════════════════════════════════════════════════════
     Event Wiring
     ════════════════════════════════════════════════════════ */

  function wireEvents(panel) {
    // Close button
    panel.querySelector('.pi-close').addEventListener('click', closePanel);

    // ─── Edit original prompt (textarea swap) ───
    panel.querySelector('#pi-edit-original').addEventListener('click', () => {
      const origDiv = panel.querySelector('#pi-original-text');
      const textarea = panel.querySelector('#pi-original-edit');
      const editBtn = panel.querySelector('#pi-edit-original');
      const reanalyzeBtn = panel.querySelector('#pi-reanalyze');
      const isEditing = textarea.style.display !== 'none';

      if (isEditing) {
        // Done → save and switch back to display mode
        const edited = textarea.value.trim();
        if (edited) origDiv.textContent = edited;
        textarea.style.display = 'none';
        origDiv.style.display = '';
        reanalyzeBtn.style.display = 'none';
        editBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit`;
      } else {
        // Edit → swap to textarea
        textarea.value = origDiv.textContent;
        origDiv.style.display = 'none';
        textarea.style.display = 'block';
        textarea.focus();
        reanalyzeBtn.style.display = 'inline-flex';
        editBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          Done`;
      }
    });

    // Re-analyze button (after editing original)
    panel.querySelector('#pi-reanalyze').addEventListener('click', () => {
      const textarea = panel.querySelector('#pi-original-edit');
      const origDiv = panel.querySelector('#pi-original-text');
      const editedText = textarea.value.trim();
      if (!editedText) return;

      // Exit edit mode
      origDiv.textContent = editedText;
      textarea.style.display = 'none';
      origDiv.style.display = '';
      panel.querySelector('#pi-reanalyze').style.display = 'none';
      panel.querySelector('#pi-edit-original').innerHTML = `
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit`;

      // Update state and re-analyze
      originalText = editedText;
      accumulatedSelections = {};
      analyzePrompt(editedText);
    });

    // ─── Paste button — paste refined text into source element ───
    const PASTE_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M12 11v6m-3-3l3 3 3-3"/></svg>`;

    panel.querySelector('#pi-paste').addEventListener('click', () => {
      const refinedEl = panel.querySelector('#pi-refined-text');
      const text = refinedEl.getAttribute('contenteditable') === 'true'
        ? refinedEl.innerText
        : refinedEl.textContent;
      const btn = panel.querySelector('#pi-paste');

      const success = pasteToSource(text);

      if (success) {
        btn.textContent = '✓ Pasted!';
        btn.classList.add('pi-btn--pasted');
        setTimeout(() => {
          btn.innerHTML = `${PASTE_SVG} Paste`;
          btn.classList.remove('pi-btn--pasted');
        }, 2000);
      } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = '📋 Copied!';
          btn.classList.add('pi-btn--pasted');
          setTimeout(() => {
            btn.innerHTML = `${PASTE_SVG} Paste`;
            btn.classList.remove('pi-btn--pasted');
          }, 2000);
        });
      }
    });

    // ─── Copy button ───
    const COPY_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;

    panel.querySelector('#pi-copy').addEventListener('click', () => {
      const refinedEl = panel.querySelector('#pi-refined-text');
      const refined = refinedEl.getAttribute('contenteditable') === 'true'
        ? refinedEl.innerText
        : refinedEl.textContent;
      navigator.clipboard.writeText(refined).then(() => {
        const btn = panel.querySelector('#pi-copy');
        btn.textContent = '✓ Copied!';
        btn.classList.add('pi-btn--copied');
        setTimeout(() => {
          btn.innerHTML = `${COPY_SVG} Copy`;
          btn.classList.remove('pi-btn--copied');
        }, 2000);
      });
    });

    // ─── Edit / Save refined prompt ───
    const EDIT_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    const SAVE_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;

    panel.querySelector('#pi-edit').addEventListener('click', () => {
      const refinedEl = panel.querySelector('#pi-refined-text');
      const editBtn = panel.querySelector('#pi-edit');
      const isEditing = refinedEl.getAttribute('contenteditable') === 'true';

      if (isEditing) {
        // Save mode
        refinedEl.setAttribute('contenteditable', 'false');
        refinedEl.classList.remove('pi-refined--editing');
        editBtn.innerHTML = `${EDIT_SVG} Edit`;
      } else {
        // Edit mode
        refinedEl.setAttribute('contenteditable', 'true');
        refinedEl.classList.add('pi-refined--editing');
        refinedEl.focus();
        editBtn.innerHTML = `${SAVE_SVG} Save`;
      }
    });

    // Apply selections button
    panel.querySelector('#pi-apply-chips').addEventListener('click', () => {
      applyClarifications();
    });

    // Refine further button
    panel.querySelector('#pi-refine-more').addEventListener('click', () => {
      const refinedEl = panel.querySelector('#pi-refined-text');
      const currentText = refinedEl.getAttribute('contenteditable') === 'true'
        ? refinedEl.innerText
        : refinedEl.textContent;
      const constraints = gatherSelections();
      refinePrompt(currentText, constraints);
    });

    // Retry button
    panel.querySelector('#pi-retry').addEventListener('click', () => {
      analyzePrompt(originalText);
    });
  }

  /* ════════════════════════════════════════════════════════
     API Calls
     ════════════════════════════════════════════════════════ */

  async function analyzePrompt(text) {
    showLoading();

    try {
      const res = await fetch(`${API_BASE}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();
      currentPromptId = data.promptId;
      renderResults(data);
      saveToHistory(text, data);
    } catch (err) {
      showError(err.message);
    }
  }

  async function applyClarifications() {
    const newSelections = gatherSelections();
    if (Object.keys(newSelections).length === 0) return;

    // Deep-merge new array selections with previously applied ones
    for (const [gap, values] of Object.entries(newSelections)) {
      const prev = accumulatedSelections[gap] || [];
      const merged = [...new Set([...prev, ...values])];
      accumulatedSelections[gap] = merged;
    }

    showLoading();

    try {
      const res = await fetch(`${API_BASE}/clarify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptId: currentPromptId,
          selections: accumulatedSelections,
          originalText,
        }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();
      renderResults(data, true);
    } catch (err) {
      showError(err.message);
    }
  }

  async function refinePrompt(text, constraints = {}) {
    showLoading();

    try {
      const res = await fetch(`${API_BASE}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptId: currentPromptId,
          text,
          originalText,
          constraints,
        }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();
      renderRefined(data);
    } catch (err) {
      showError(err.message);
    }
  }

  /* ════════════════════════════════════════════════════════
     UI Rendering
     ════════════════════════════════════════════════════════ */

  function showLoading() {
    const loading = shadowRoot.querySelector('#pi-loading');
    const results = shadowRoot.querySelector('#pi-results');
    const error = shadowRoot.querySelector('#pi-error');
    loading.style.display = 'flex';
    results.style.display = 'none';
    error.style.display = 'none';
  }

  function showError(msg) {
    const loading = shadowRoot.querySelector('#pi-loading');
    const error = shadowRoot.querySelector('#pi-error');
    loading.style.display = 'none';
    error.style.display = 'flex';
    shadowRoot.querySelector('#pi-error-msg').textContent = msg;
  }

  function renderResults(data, isClarified = false) {
    const loading = shadowRoot.querySelector('#pi-loading');
    const results = shadowRoot.querySelector('#pi-results');
    loading.style.display = 'none';
    results.style.display = 'block';

    // Original prompt
    shadowRoot.querySelector('#pi-original-text').textContent = originalText;

    // Intent
    if (data.intent) {
      shadowRoot.querySelector('#pi-intent').textContent =
        (data.intent.detected || 'general').replace(/_/g, ' ');
      const confEl = shadowRoot.querySelector('#pi-confidence');
      confEl.textContent = data.intent.confidence || 'low';
      confEl.className = `pi-badge pi-badge--confidence pi-badge--${data.intent.confidence || 'low'}`;
    }

    // Scores
    if (data.scores) {
      renderScores(data.scores);
    }

    // Warnings
    const warningsSection = shadowRoot.querySelector('#pi-warnings-section');
    const warningsEl = shadowRoot.querySelector('#pi-warnings');
    if (data.warnings && data.warnings.length > 0) {
      warningsSection.style.display = 'block';
      warningsEl.innerHTML = data.warnings.map((w) =>
        `<div class="pi-warning-item">${escapeHtml(w)}</div>`
      ).join('');
    } else {
      warningsSection.style.display = 'none';
    }

    // Suggestion chips
    const chipsSection = shadowRoot.querySelector('#pi-chips-section');
    const chipsEl = shadowRoot.querySelector('#pi-chips');
    if (data.gaps && data.gaps.length > 0 && data.suggestions) {
      chipsSection.style.display = 'block';
      chipsEl.innerHTML = '';
      renderChips(data.gaps, data.suggestions);
      shadowRoot.querySelector('#pi-apply-chips').style.display = 'inline-flex';
    } else {
      chipsSection.style.display = 'none';
    }

    // Refined prompt (show if clarified or if we have a v1+ version)
    const refinedSection = shadowRoot.querySelector('#pi-refined-section');
    if (isClarified && data.refined) {
      refinedSection.style.display = 'block';
      shadowRoot.querySelector('#pi-refined-text').textContent = data.refined;
    } else if (data.versions && data.versions.length > 1) {
      refinedSection.style.display = 'block';
      shadowRoot.querySelector('#pi-refined-text').textContent =
        data.versions[data.versions.length - 1].text;
    } else {
      refinedSection.style.display = 'none';
    }
  }

  function renderRefined(data) {
    const loading = shadowRoot.querySelector('#pi-loading');
    loading.style.display = 'none';

    const results = shadowRoot.querySelector('#pi-results');
    results.style.display = 'block';

    // Update scores if available
    if (data.scores) renderScores(data.scores);

    // Update warnings
    const warningsSection = shadowRoot.querySelector('#pi-warnings-section');
    const warningsEl = shadowRoot.querySelector('#pi-warnings');
    if (data.warnings && data.warnings.length > 0) {
      warningsSection.style.display = 'block';
      warningsEl.innerHTML = data.warnings.map((w) =>
        `<div class="pi-warning-item">${escapeHtml(w)}</div>`
      ).join('');
    } else {
      warningsSection.style.display = 'none';
    }

    // Hide the chips section — user is past constraint selection
    const chipsSection = shadowRoot.querySelector('#pi-chips-section');
    chipsSection.style.display = 'none';

    // Show refined prompt
    const refinedSection = shadowRoot.querySelector('#pi-refined-section');
    refinedSection.style.display = 'block';
    shadowRoot.querySelector('#pi-refined-text').textContent =
      data.refined || (data.versions && data.versions[data.versions.length - 1].text) || '';
  }

  function renderScores(scores) {
    const total = scores.total || 0;
    const max = 40;
    const pct = Math.round((total / max) * 100);
    const grade = pct >= 80 ? 'excellent' : pct >= 60 ? 'good' : pct >= 40 ? 'fair' : 'poor';

    shadowRoot.querySelector('#pi-score-total').innerHTML =
      `<div class="pi-score-ring pi-score-ring--${grade}">
      <span class="pi-score-number">${total}</span>
      <span class="pi-score-max">/ ${max}</span>
    </div>`;

    const dims = [
      { label: 'Clarity', value: scores.clarity || 0 },
      { label: 'Completeness', value: scores.completeness || 0 },
      { label: 'Specificity', value: scores.specificity || 0 },
      { label: 'Intent Alignment', value: scores.intentAlignment || 0 },
    ];

    shadowRoot.querySelector('#pi-score-bars').innerHTML = dims.map((d) => {
      const barPct = (d.value / 10) * 100;
      const barGrade = d.value >= 8 ? 'excellent' : d.value >= 6 ? 'good' : d.value >= 4 ? 'fair' : 'poor';
      return `
      <div class="pi-bar-row">
        <span class="pi-bar-label">${d.label}</span>
        <div class="pi-bar-track">
          <div class="pi-bar-fill pi-bar-fill--${barGrade}" style="width:${barPct}%"></div>
        </div>
        <span class="pi-bar-value">${d.value}</span>
      </div>`;
    }).join('');
  }

  function renderChips(gaps, suggestions) {
    const container = shadowRoot.querySelector('#pi-chips');

    for (const gap of gaps) {
      const options = suggestions[gap] || [];
      if (options.length === 0) continue;

      const group = document.createElement('div');
      group.className = 'pi-chip-group';
      group.setAttribute('data-gap', gap);

      const label = document.createElement('div');
      label.className = 'pi-chip-label';
      label.textContent = gap.replace(/_/g, ' ');
      group.appendChild(label);

      const chipsRow = document.createElement('div');
      chipsRow.className = 'pi-chips-row';

      for (const option of options) {
        const chip = document.createElement('button');
        chip.className = 'pi-chip';
        chip.textContent = option;
        chip.setAttribute('data-gap', gap);
        chip.setAttribute('data-value', option);

        chip.addEventListener('click', () => {
          // Toggle selection (multi-select per gap group)
          chip.classList.toggle('pi-chip--selected');
        });

        chipsRow.appendChild(chip);
      }

      group.appendChild(chipsRow);
      container.appendChild(group);
    }
  }

  function gatherSelections() {
    const selectedChips = shadowRoot.querySelectorAll('.pi-chip--selected');
    const selections = {};
    selectedChips.forEach((chip) => {
      const gap = chip.getAttribute('data-gap');
      const value = chip.getAttribute('data-value');
      if (gap && value) {
        if (!selections[gap]) selections[gap] = [];
        selections[gap].push(value);
      }
    });
    return selections;
  }

  /* ── History Persistence ────────────────────────────────── */

  function saveToHistory(promptText, data) {
    try {
      const entry = {
        id: data.promptId || Date.now().toString(),
        text: promptText,
        score: data.scores?.total || 0,
        maxScore: 40,
        intent: data.intent?.detected || 'general',
        timestamp: Date.now(),
      };

      chrome.storage.local.get({ piHistory: [] }, (result) => {
        const history = result.piHistory;
        // Prepend new entry and cap at 50
        history.unshift(entry);
        if (history.length > 50) history.length = 50;
        chrome.storage.local.set({ piHistory: history });
      });
    } catch (e) {
      console.warn('[PI] Could not save to history:', e);
    }
  }

  /* ── Utilities ─────────────────────────────────────────── */

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /* ════════════════════════════════════════════════════════
     Inline Styles — Original Indigo Theme
     ════════════════════════════════════════════════════════ */

  function getPanelStyles() {
    return `
    /* ── Reset inside shadow DOM ── */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* ── Panel Container ── */
    .pi-panel {
      position: fixed;
      top: 16px;
      right: 16px;
      width: 390px;
      max-height: calc(100vh - 32px);
      background: rgba(17, 17, 27, 0.97);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(129, 140, 248, 0.12);
      border-radius: 14px;
      box-shadow:
        0 0 0 1px rgba(129, 140, 248, 0.06),
        0 8px 40px rgba(0, 0, 0, 0.55),
        0 0 60px rgba(129, 140, 248, 0.03);
      color: #e2e2f0;
      font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      z-index: 2147483647;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      pointer-events: auto;

      opacity: 0;
      transform: translateX(20px) scale(0.97);
      transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                  transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .pi-panel--open {
      opacity: 1;
      transform: translateX(0) scale(1);
    }

    .pi-panel--closing {
      opacity: 0;
      transform: translateX(20px) scale(0.97);
    }

    /* ── Header ── */
    .pi-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      position: relative;
      background: rgba(129, 140, 248, 0.03);
    }

    .pi-header::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(129, 140, 248, 0.3), rgba(167, 139, 250, 0.2), transparent);
    }

    .pi-header__left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pi-logo {
      color: #818cf8;
    }

    .pi-title {
      font-size: 14px;
      font-weight: 600;
      background: linear-gradient(135deg, #818cf8, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .pi-close {
      background: none;
      border: none;
      color: #6b6b80;
      font-size: 20px;
      cursor: pointer;
      padding: 2px 6px;
      line-height: 1;
      transition: all 0.2s;
      border-radius: 6px;
    }

    .pi-close:hover {
      color: #e2e2f0;
      background: rgba(255, 255, 255, 0.06);
    }

    /* ── Body ── */
    .pi-body {
      padding: 16px;
      overflow-y: auto;
      flex: 1;
      max-height: calc(100vh - 100px);
    }

    .pi-body::-webkit-scrollbar {
      width: 4px;
    }
    .pi-body::-webkit-scrollbar-track {
      background: transparent;
    }
    .pi-body::-webkit-scrollbar-thumb {
      background: rgba(129, 140, 248, 0.15);
      border-radius: 10px;
    }

    /* ── Loading ── */
    .pi-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 40px 0;
      color: #6b6b80;
    }

    .pi-spinner {
      width: 26px;
      height: 26px;
      border: 2.5px solid rgba(129, 140, 248, 0.15);
      border-top-color: #818cf8;
      border-radius: 50%;
      animation: pi-spin 0.7s linear infinite;
    }

    @keyframes pi-spin {
      to { transform: rotate(360deg); }
    }

    /* ── Sections ── */
    .pi-section {
      margin-bottom: 16px;
    }

    .pi-section__label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: #6b6b80;
      margin-bottom: 8px;
    }

    /* ── Original Prompt ── */
    .pi-original {
      padding: 10px 12px;
      background: rgba(129, 140, 248, 0.03);
      border: 1px solid rgba(129, 140, 248, 0.08);
      border-radius: 10px;
      color: #b0b0c8;
      font-size: 12.5px;
      max-height: 80px;
      overflow-y: auto;
      word-break: break-word;
    }

    /* ── Editable Textarea for Original Prompt ── */
    .pi-original-edit {
      width: 100%;
      padding: 10px 12px;
      background: rgba(129, 140, 248, 0.04);
      border: 1px solid rgba(129, 140, 248, 0.25);
      border-radius: 10px;
      color: #e2e2f0;
      font-size: 12.5px;
      font-family: inherit;
      line-height: 1.5;
      resize: vertical;
      min-height: 60px;
      max-height: 160px;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .pi-original-edit:focus {
      border-color: rgba(129, 140, 248, 0.5);
      box-shadow: 0 0 16px rgba(129, 140, 248, 0.08);
    }

    /* ── Intent Badges ── */
    .pi-intent-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .pi-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: capitalize;
    }

    .pi-badge--intent {
      background: rgba(129, 140, 248, 0.12);
      color: #a5b4fc;
      border: 1px solid rgba(129, 140, 248, 0.25);
    }

    .pi-badge--confidence {
      font-size: 10px;
      font-weight: 500;
    }

    .pi-badge--high {
      background: rgba(52, 211, 153, 0.12);
      color: #6ee7b7;
      border: 1px solid rgba(52, 211, 153, 0.25);
    }

    .pi-badge--medium {
      background: rgba(251, 191, 36, 0.12);
      color: #fbbf24;
      border: 1px solid rgba(251, 191, 36, 0.25);
    }

    .pi-badge--low {
      background: rgba(239, 68, 68, 0.12);
      color: #fca5a5;
      border: 1px solid rgba(239, 68, 68, 0.25);
    }

    /* ── Score ── */
    .pi-score-total {
      display: flex;
      justify-content: center;
      margin-bottom: 12px;
    }

    .pi-score-ring {
      display: flex;
      align-items: baseline;
      gap: 2px;
      padding: 8px 20px;
      border-radius: 12px;
    }

    .pi-score-ring--excellent {
      background: rgba(52, 211, 153, 0.1);
      border: 1px solid rgba(52, 211, 153, 0.2);
    }
    .pi-score-ring--good {
      background: rgba(129, 140, 248, 0.1);
      border: 1px solid rgba(129, 140, 248, 0.2);
    }
    .pi-score-ring--fair {
      background: rgba(251, 191, 36, 0.1);
      border: 1px solid rgba(251, 191, 36, 0.2);
    }
    .pi-score-ring--poor {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
    }

    .pi-score-number {
      font-size: 28px;
      font-weight: 700;
      color: #f0f0f8;
    }

    .pi-score-max {
      font-size: 13px;
      color: #6b6b80;
    }

    /* ── Score Bars ── */
    .pi-bar-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .pi-bar-label {
      width: 100px;
      font-size: 11px;
      color: #8888a0;
      flex-shrink: 0;
    }

    .pi-bar-track {
      flex: 1;
      height: 5px;
      background: rgba(129, 140, 248, 0.06);
      border-radius: 3px;
      overflow: hidden;
    }

    .pi-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .pi-bar-fill--excellent { background: linear-gradient(90deg, #34d399, #6ee7b7); }
    .pi-bar-fill--good { background: linear-gradient(90deg, #818cf8, #a5b4fc); }
    .pi-bar-fill--fair { background: linear-gradient(90deg, #fbbf24, #fcd34d); }
    .pi-bar-fill--poor { background: linear-gradient(90deg, #ef4444, #f87171); }

    .pi-bar-value {
      width: 20px;
      text-align: right;
      font-size: 11px;
      font-weight: 600;
      color: #b0b0c8;
    }

    /* ── Warnings ── */
    .pi-warning-item {
      padding: 8px 12px;
      background: rgba(251, 191, 36, 0.06);
      border: 1px solid rgba(251, 191, 36, 0.15);
      border-radius: 8px;
      font-size: 12px;
      color: #fbbf24;
      margin-bottom: 6px;
      line-height: 1.4;
    }

    /* ── Chips ── */
    .pi-chip-group {
      margin-bottom: 12px;
    }

    .pi-chip-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: capitalize;
      color: #8888a0;
      margin-bottom: 6px;
    }

    .pi-chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }

    .pi-chip {
      padding: 5px 12px;
      border-radius: 20px;
      border: 1px solid rgba(129, 140, 248, 0.12);
      background: rgba(129, 140, 248, 0.04);
      color: #b0b0c8;
      font-size: 11.5px;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .pi-chip:hover {
      border-color: rgba(129, 140, 248, 0.35);
      background: rgba(129, 140, 248, 0.08);
      color: #e2e2f0;
    }

    .pi-chip--selected {
      border-color: #818cf8;
      background: rgba(129, 140, 248, 0.18);
      color: #c7d2fe;
      box-shadow: 0 0 12px rgba(129, 140, 248, 0.12);
    }

    /* ── Refined Prompt ── */
    .pi-refined {
      padding: 12px 14px;
      background: rgba(129, 140, 248, 0.04);
      border: 1px solid rgba(129, 140, 248, 0.12);
      border-radius: 10px;
      color: #e2e2f0;
      font-size: 12.5px;
      line-height: 1.6;
      margin-bottom: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 200px;
      overflow-y: auto;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .pi-refined--editing {
      border-color: rgba(129, 140, 248, 0.4);
      box-shadow: 0 0 16px rgba(129, 140, 248, 0.08);
      outline: none;
    }

    /* ── Buttons ── */
    .pi-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .pi-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      font-family: inherit;
    }

    .pi-btn--primary {
      background: linear-gradient(135deg, #6366f1, #818cf8);
      color: #fff;
      margin-top: 8px;
    }

    .pi-btn--primary:hover {
      background: linear-gradient(135deg, #818cf8, #a5b4fc);
      box-shadow: 0 4px 18px rgba(129, 140, 248, 0.3);
    }

    .pi-btn--secondary {
      background: rgba(129, 140, 248, 0.08);
      border: 1px solid rgba(129, 140, 248, 0.15);
      color: #b0b0c8;
    }

    .pi-btn--secondary:hover {
      background: rgba(129, 140, 248, 0.14);
      color: #e2e2f0;
    }

    .pi-btn--edit {
      background: rgba(129, 140, 248, 0.08);
      border: 1px solid rgba(129, 140, 248, 0.15);
      color: #a5b4fc;
    }

    .pi-btn--edit:hover {
      background: rgba(129, 140, 248, 0.16);
      box-shadow: 0 4px 15px rgba(129, 140, 248, 0.1);
    }

    .pi-btn--sm {
      padding: 4px 10px;
      font-size: 11px;
    }

    .pi-btn--paste {
      background: rgba(167, 139, 250, 0.1);
      border: 1px solid rgba(167, 139, 250, 0.2);
      color: #c4b5fd;
    }

    .pi-btn--paste:hover {
      background: rgba(167, 139, 250, 0.18);
      box-shadow: 0 4px 15px rgba(167, 139, 250, 0.12);
    }

    .pi-btn--pasted {
      background: rgba(52, 211, 153, 0.2) !important;
      color: #6ee7b7 !important;
      border-color: rgba(52, 211, 153, 0.3) !important;
    }

    .pi-btn--copy {
      background: rgba(52, 211, 153, 0.1);
      border: 1px solid rgba(52, 211, 153, 0.2);
      color: #6ee7b7;
    }

    .pi-btn--copy:hover {
      background: rgba(52, 211, 153, 0.18);
      box-shadow: 0 4px 15px rgba(52, 211, 153, 0.12);
    }

    .pi-btn--copied {
      background: rgba(52, 211, 153, 0.25) !important;
      color: #a7f3d0 !important;
    }

    /* ── Error ── */
    .pi-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 30px 0;
      color: #fca5a5;
      text-align: center;
    }

    #pi-error-msg {
      font-size: 12px;
      color: #8888a0;
    }
  `;
  }

} // end of double-injection guard
