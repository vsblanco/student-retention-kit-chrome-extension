// [2025-09-15]
// Version: 9.1
import { startLoop, stopLoop, processNextInQueue, addToFoundUrlCache } from './looper.js';
import { STORAGE_KEYS, CHECKER_MODES, MESSAGE_TYPES, EXTENSION_STATES, CONNECTION_TYPES } from '../constants.js';

let logBuffer = [];
const MAX_LOG_BUFFER_SIZE = 100;

// --- State for collecting missing assignment results ---
let missingAssignmentsCollector = [];
let wasLastRunMissingMode = false;

function addToLogBuffer(level, payload) {
    logBuffer.push({ level, payload, timestamp: new Date().toISOString() });
    if (logBuffer.length > MAX_LOG_BUFFER_SIZE) {
        logBuffer.shift();
    }
}

// --- CORE LISTENERS ---

chrome.action.onClicked.addListener((tab) => chrome.sidePanel.open({ windowId: tab.windowId }));
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === '_execute_action') chrome.sidePanel.open({ windowId: tab.windowId });
});
chrome.runtime.onStartup.addListener(() => {
  updateBadge();
  chrome.storage.local.get(STORAGE_KEYS.EXTENSION_STATE, data => handleStateChange(data[STORAGE_KEYS.EXTENSION_STATE]));
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEYS.EXTENSION_STATE]) {
    handleStateChange(changes[STORAGE_KEYS.EXTENSION_STATE].newValue, changes[STORAGE_KEYS.EXTENSION_STATE].oldValue);
  }
  if (changes[STORAGE_KEYS.EXTENSION_STATE] || changes[STORAGE_KEYS.FOUND_ENTRIES]) {
    updateBadge();
  }
});
chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.action === MESSAGE_TYPES.INSPECTION_RESULT) {
    if (msg.found && msg.entry) {
      await addStudentToFoundList(msg.entry);
      sendConnectionPings(msg.entry);
    }
    if (sender.tab?.id) {
      chrome.tabs.remove(sender.tab.id).catch(e => console.error(`Error removing tab ${sender.tab.id}:`, e));
      processNextInQueue(sender.tab.id);
    }
  } else if (msg.action === MESSAGE_TYPES.FOUND_SUBMISSION) {
      const logPayload = { type: 'SUBMISSION', ...msg.payload };
      addToLogBuffer('log', logPayload);
      chrome.runtime.sendMessage({ type: MESSAGE_TYPES.LOG_TO_PANEL, level: 'log', payload: logPayload });
  } else if (msg.action === MESSAGE_TYPES.FOUND_MISSING_ASSIGNMENTS) {
      missingAssignmentsCollector.push(msg.payload);
  } else if (msg.action === MESSAGE_TYPES.MISSING_CHECK_COMPLETED) {
      if (missingAssignmentsCollector.length > 0) {
          const summaryPayload = {
              type: 'MISSING_SUMMARY',
              totalStudentsWithMissing: missingAssignmentsCollector.length,
              details: missingAssignmentsCollector
          };
          addToLogBuffer('warn', summaryPayload);
          chrome.runtime.sendMessage({ type: MESSAGE_TYPES.LOG_TO_PANEL, level: 'warn', payload: summaryPayload });
      } else {
          const summaryPayload = { type: 'MISSING_SUMMARY', message: "SUCCESS: No missing assignments found for any students in the list." };
          addToLogBuffer('log', summaryPayload);
          chrome.runtime.sendMessage({ type: MESSAGE_TYPES.LOG_TO_PANEL, level: 'log', payload: summaryPayload });
      }
      chrome.storage.local.set({ [STORAGE_KEYS.EXTENSION_STATE]: EXTENSION_STATES.OFF });
  } else if (msg.type === MESSAGE_TYPES.REQUEST_STORED_LOGS) {
      if (logBuffer.length > 0) {
          chrome.runtime.sendMessage({ type: MESSAGE_TYPES.STORED_LOGS, payload: logBuffer });
          logBuffer = [];
      }
  } else if (msg.type === MESSAGE_TYPES.TEST_CONNECTION_PA) {
    handlePaConnectionTest(msg.connection);
  } else if (msg.type === MESSAGE_TYPES.SEND_DEBUG_PAYLOAD) {
    if (msg.payload) {
      sendConnectionPings(msg.payload);
    }
  }
});

// --- CONNECTION HANDLING ---
async function sendConnectionPings(payload) {
    const data = await chrome.storage.local.get([STORAGE_KEYS.CONNECTIONS, STORAGE_KEYS.DEBUG_MODE]);
    const connections = data[STORAGE_KEYS.CONNECTIONS] || [];
    const debugMode = data[STORAGE_KEYS.DEBUG_MODE] || false;
    const bodyPayload = { ...payload };
    if (!bodyPayload.debug && debugMode) {
      bodyPayload.debug = true;
    }
    for (const conn of connections) {
        if (conn.type === CONNECTION_TYPES.POWER_AUTOMATE) {
            triggerPowerAutomate(conn, bodyPayload);
        } else if (conn.type === CONNECTION_TYPES.PUSHER) {
            chrome.runtime.sendMessage({
                type: MESSAGE_TYPES.TRIGGER_PUSHER,
                target: 'offscreen',
                connection: conn,
                payload: bodyPayload
            }).catch(e => console.error("Error sending to offscreen:", e));
        }
    }
}
async function handlePaConnectionTest(connection) {
    const testPayload = { name: 'Test Submission', url: '#', grade: '100', timestamp: new Date().toISOString(), test: true };
    const result = await triggerPowerAutomate(connection, testPayload);
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CONNECTION_TEST_RESULT, connectionType: CONNECTION_TYPES.POWER_AUTOMATE, success: result.success, error: result.error || 'Check service worker console for details.' });
}
async function triggerPowerAutomate(connection, payload) {
  try {
    const resp = await fetch(connection.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!resp.ok && resp.status !== 202) { throw new Error(`HTTP Error: ${resp.status}`); }
    console.log("Power Automate flow triggered successfully. Status:", resp.status);
    return { success: true };
  } catch (e) {
    console.error("Power Automate flow error:", e);
    return { success: false, error: e.message };
  }
}

// --- STATE & DATA MANAGEMENT ---
function updateBadge() {
  chrome.storage.local.get([STORAGE_KEYS.EXTENSION_STATE, STORAGE_KEYS.FOUND_ENTRIES], (data) => {
    const isExtensionOn = data[STORAGE_KEYS.EXTENSION_STATE] === EXTENSION_STATES.ON;
    const foundCount = data[STORAGE_KEYS.FOUND_ENTRIES]?.length || 0;
    if (isExtensionOn) {
      chrome.action.setBadgeBackgroundColor({ color: '#0052cc' });
      chrome.action.setBadgeText({ text: foundCount > 0 ? foundCount.toString() : 'ON' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  });
}

async function handleStateChange(newState, oldState) {
    if (newState === EXTENSION_STATES.ON) {
        const settings = await chrome.storage.local.get(STORAGE_KEYS.CHECKER_MODE);
        const currentMode = settings[STORAGE_KEYS.CHECKER_MODE] || CHECKER_MODES.SUBMISSION;
        
        wasLastRunMissingMode = (currentMode === CHECKER_MODES.MISSING);
        
        if (wasLastRunMissingMode) {
            missingAssignmentsCollector = [];
            console.log("Starting Missing Assignments check. Collector has been cleared.");
        }
        startLoop();
    } else if (newState === EXTENSION_STATES.OFF && oldState === EXTENSION_STATES.ON) {
        stopLoop();
    }
}

async function addStudentToFoundList(entry) {
    const data = await chrome.storage.local.get(STORAGE_KEYS.FOUND_ENTRIES);
    const foundEntries = data[STORAGE_KEYS.FOUND_ENTRIES] || [];
    const map = new Map(foundEntries.map(e => [e.url, e]));
    map.set(entry.url, entry);
    addToFoundUrlCache(entry.url);
    await chrome.storage.local.set({ [STORAGE_KEYS.FOUND_ENTRIES]: Array.from(map.values()) });
}

// --- INITIALIZATION ---
updateBadge();
chrome.storage.local.get(STORAGE_KEYS.EXTENSION_STATE, data => {
    handleStateChange(data[STORAGE_KEYS.EXTENSION_STATE]);
});
