/**
 * history.js — Full-page History View for Prompt Intelligence
 *
 * Reads analysis history from chrome.storage.local and renders
 * a rich card grid with scores, intents, timestamps, and delete actions.
 */

(function () {
    'use strict';

    const body = document.getElementById('history-body');
    const emptyState = document.getElementById('history-empty');
    const clearBtn = document.getElementById('clear-all');
    const countEl = document.getElementById('history-count');

    /* ── Load and Render ────────────────────────────────── */

    function loadHistory() {
        chrome.storage.local.get({ piHistory: [] }, (result) => {
            renderHistory(result.piHistory);
        });
    }

    function renderHistory(history) {
        body.innerHTML = '';

        if (!history || history.length === 0) {
            body.style.display = 'none';
            emptyState.style.display = 'flex';
            clearBtn.style.display = 'none';
            countEl.textContent = '';
            return;
        }

        body.style.display = 'grid';
        emptyState.style.display = 'none';
        clearBtn.style.display = 'inline-flex';
        countEl.textContent = `${history.length} prompt${history.length !== 1 ? 's' : ''}`;

        history.forEach((entry, index) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.setAttribute('data-id', entry.id);
            card.style.animationDelay = `${index * 0.05}s`;

            const pct = Math.round((entry.score / (entry.maxScore || 40)) * 100);
            const grade = pct >= 80 ? 'excellent' : pct >= 60 ? 'good' : pct >= 40 ? 'fair' : 'poor';

            card.innerHTML = `
        <div class="card__header">
          <div class="card__score card__score--${grade}">
            <span class="card__score-num">${entry.score}</span>
            <span class="card__score-max">/${entry.maxScore || 40}</span>
          </div>
          <span class="card__intent">${(entry.intent || 'general').replace(/_/g, ' ')}</span>
          <button class="card__delete" data-id="${entry.id}" title="Remove">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="card__text">${escapeHtml(entry.text || '')}</div>
        <div class="card__footer">
          <span class="card__time">${formatTime(entry.timestamp)}</span>
          <span class="card__grade-label card__grade-label--${grade}">${gradeLabel(pct)}</span>
        </div>
      `;

            body.appendChild(card);
        });

        // Wire delete buttons
        body.querySelectorAll('.card__delete').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteEntry(btn.getAttribute('data-id'));
            });
        });
    }

    /* ── Actions ─────────────────────────────────────────── */

    function deleteEntry(id) {
        chrome.storage.local.get({ piHistory: [] }, (result) => {
            const updated = result.piHistory.filter((e) => e.id !== id);
            chrome.storage.local.set({ piHistory: updated }, () => {
                const card = body.querySelector(`[data-id="${id}"]`);
                if (card) {
                    card.classList.add('card--removing');
                    setTimeout(() => renderHistory(updated), 350);
                } else {
                    renderHistory(updated);
                }
            });
        });
    }

    clearBtn.addEventListener('click', () => {
        if (confirm('Clear all prompt history?')) {
            chrome.storage.local.set({ piHistory: [] }, () => {
                renderHistory([]);
            });
        }
    });

    /* ── Utilities ───────────────────────────────────────── */

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function gradeLabel(pct) {
        if (pct >= 80) return 'Excellent';
        if (pct >= 60) return 'Good';
        if (pct >= 40) return 'Fair';
        return 'Needs Work';
    }

    function formatTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const now = new Date();
        const diffMs = now - d;
        const diffSec = Math.floor(diffMs / 1000);

        if (diffSec < 60) return 'just now';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        const diffDay = Math.floor(diffHr / 24);
        if (diffDay < 7) return `${diffDay}d ago`;

        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    }

    /* ── Init ────────────────────────────────────────────── */
    loadHistory();
})();
