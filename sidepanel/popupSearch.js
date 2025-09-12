// popupSearch.js

import { renderFoundList } from './popup.js';

document.addEventListener('DOMContentLoaded', () => {
  // --- Found List Search Logic ---
  const searchFoundInput = document.getElementById('searchFoundListInput');
  if(searchFoundInput) {
    searchFoundInput.addEventListener('input', () => {
      const term = searchFoundInput.value.trim().toLowerCase();

      chrome.storage.local.get({ foundEntries: [] }, data => {
        const entries = data.foundEntries;

        const filtered = entries.filter(entry => {
          return entry.name.toLowerCase().includes(term);
        });

        renderFoundList(filtered);

        const badge = document.querySelector('.tab-button[data-tab="found"] .count');
        if (badge) {
          badge.textContent = filtered.length;
        }
      });
    });
  }
});