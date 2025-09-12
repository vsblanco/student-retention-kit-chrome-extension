// background.js

import { startLoop, stopLoop, openNextTabInLoop } from './looper.js';

// The tabs.onUpdated listener that injected scripts has been removed.

chrome.runtime.onMessage.addListener((msg, sender) => {
  switch (msg.action) {
    case 'inspectionResult':
      // This message now comes from the smart content.js
      if (!sender.tab || !sender.tab.id) return;

      if (msg.found) {
        // Keyword was found. The content script handles highlighting.
        // We just need to focus the tab and let it stay open.
        // The content script will have already sent other notifications.
        chrome.tabs.update(sender.tab.id, { active: true });
        stopLoop();
      } else {
        // Keyword not found. Close tab and continue loop.
        chrome.tabs.remove(sender.tab.id).catch(e => {});
        openNextTabInLoop();
      }
      break;
    
    // --- Other message handlers ---
    case 'focusTab': // This is now only used by highlighter logic in content.js
      if (sender.tab?.id) {
        chrome.tabs.update(sender.tab.id, { active: true });
      }
      break;
    case 'addNames':
      chrome.storage.local.get({ foundEntries: [] }, data => {
        const map = new Map(data.foundEntries.map(e => [e.name, e]));
        msg.entries.forEach(e => map.set(e.name, e));
        chrome.storage.local.set({ foundEntries: Array.from(map.values()) });
      });
      break;
    case 'runFlow':
      chrome.storage.local.get('extensionState', data => {
        if (data.extensionState === 'on') {
          triggerPowerAutomate(msg.payload);
        }
      });
      break;
  }
});


// ---- Supporting Functions and Listeners (Unchanged from your working version) ----

const FLOW_URL =
  "https://prod-10.westus.logic.azure.com:443/workflows/a9e08bd1329c40ffb9bf28bbc35e710a/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=cR_TUW8U-2foOb1XEAPmKxbK-2PLMK_IntYpxd2WOSo";

async function triggerPowerAutomate(payload) {
  try {
    const resp = await fetch(FLOW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    console.log("Flow triggered successfully. Status:", resp.status);
  } catch (e) {
    console.error("Flow error", e);
  }
}

function updateBadge() {
  chrome.storage.local.get(['extensionState', 'foundEntries'], (data) => {
    const isExtensionOn = data.extensionState === 'on';
    const foundCount = data.foundEntries?.length || 0;

    if (isExtensionOn) {
      chrome.action.setBadgeBackgroundColor({ color: '#0052cc' });
      if (foundCount > 0) {
        chrome.action.setBadgeText({ text: foundCount.toString() });
      } else {
        chrome.action.setBadgeText({ text: 'ON' });
      }
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  });
}

function handleStateChange(state) {
    if (state === 'on') {
        startLoop();
    } else {
        stopLoop();
    }
}

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
  chrome.storage.local.get('extensionState', data => handleStateChange(data.extensionState));
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.extensionState) {
    handleStateChange(changes.extensionState.newValue);
  }
  if (changes.extensionState || changes.foundEntries) {
    updateBadge();
  }
});

updateBadge();
chrome.storage.local.get('extensionState', data => handleStateChange(data.extensionState));