// background.js

import { startLoop, stopLoop, processNextInQueue, addToFoundUrlCache } from './looper.js';
import { SUBMISSION_FOUND_URL } from './constants.js';

// Open the side panel on action click
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Also handle the keyboard shortcut
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === '_execute_action') {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

async function triggerPowerAutomate(payload) {
  try {
    const { debugMode = false } = await chrome.storage.local.get('debugMode');
    const bodyPayload = { ...payload };

    if (debugMode) {
      bodyPayload.debug = true;
    }

    const resp = await fetch(SUBMISSION_FOUND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    console.log("Flow triggered successfully. Status:", resp.status, "Payload:", bodyPayload);
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

async function addStudentToFoundList(entry) {
    const { foundEntries = [] } = await chrome.storage.local.get('foundEntries');
    const map = new Map(foundEntries.map(e => [e.url, e]));
    
    map.set(entry.url, entry);
    
    addToFoundUrlCache(entry.url);
    
    await chrome.storage.local.set({ foundEntries: Array.from(map.values()) });
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

chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.action === 'inspectionResult') {
    if (msg.found && msg.entry) {
        await addStudentToFoundList(msg.entry);

        const { name, url, timestamp, grade } = msg.entry;
        triggerPowerAutomate({ name, url, timestamp, grade });
    }

    if (sender.tab?.id) {
        chrome.tabs.remove(sender.tab.id).catch(e => {});
        processNextInQueue(sender.tab.id);
    }
  }
});
