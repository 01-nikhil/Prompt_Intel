/**
 * popup.js — History Popup for Prompt Intelligence
 *
 * Reads analysis history from chrome.storage.local and renders
 * a scrollable list with score badges, timestamps, and delete actions.
 */

(function () {
    'use strict';

    const body = document.getElementById('popup-body');
    const emptyState = document.getElementById('popup-empty');
    const clearBtn = document.getElementById('clear-all');

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
            return;
        }

        body.style.display = 'block';
        emptyState.style.display = 'none';
        clearBtn.style.display = 'flex';

        for (const entry of history) {
            const card = document.createElement('div');
            card.className = 'history-card';
            card.setAttribute('data-id', entry.id);

            const pct = Math.round((entry.score / (entry.maxScore || 40)) * 100);
            const grade = pct >= 80 ? 'excellent' : pct >= 60 ? 'good' : pct >= 40 ? 'fair' : 'poor';

            card.innerHTML = `
        <div class="history-card__top">
          <span class="history-score history-score--${grade}">${entry.score}/${entry.maxScore || 40}</span>
          <span class="history-intent">${(entry.intent || 'general').replace(/_/g, ' ')}</span>
          <button class="history-delete" data-id="${entry.id}" title="Remove">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="history-card__text">${escapeHtml(truncate(entry.text, 120))}</div>
        <div class="history-card__time">${timeAgo(entry.timestamp)}</div>
      `;

            body.appendChild(card);
        }

        // Wire delete buttons
        body.querySelectorAll('.history-delete').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                deleteEntry(id);
            });
        });
    }

    /* ── Actions ─────────────────────────────────────────── */

    function deleteEntry(id) {
        chrome.storage.local.get({ piHistory: [] }, (result) => {
            const updated = result.piHistory.filter((e) => e.id !== id);
            chrome.storage.local.set({ piHistory: updated }, () => {
                // Animate removal
                const card = body.querySelector(`[data-id="${id}"]`);
                if (card) {
                    card.classList.add('history-card--removing');
                    setTimeout(() => renderHistory(updated), 300);
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

    function truncate(str, max) {
        if (!str) return '';
        return str.length > max ? str.slice(0, max) + '…' : str;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function timeAgo(ts) {
        const seconds = Math.floor((Date.now() - ts) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return new Date(ts).toLocaleDateString();
    }

    /* ── Init ────────────────────────────────────────────── */
    loadHistory();
})();
