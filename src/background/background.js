// [2025-12-17 01:25 PM]
// Version: 14.4 - Added Five9 Integration
import { startLoop, stopLoop, addToFoundUrlCache } from './looper.js';
import { STORAGE_KEYS, CHECKER_MODES, MESSAGE_TYPES, EXTENSION_STATES, CONNECTION_TYPES, SCHEDULED_ALARM_NAME } from '../constants/index.js';
import { setupSchedule, runScheduledCheck } from './schedule.js';

let logBuffer = [];
const MAX_LOG_BUFFER_SIZE = 100;

// --- State for collecting missing assignment results ---
let missingAssignmentsCollector = [];
let missingCheckStartTime = null;

function addToLogBuffer(level, payload) {
    logBuffer.push({ level, payload, timestamp: new Date().toISOString() });
    if (logBuffer.length > MAX_LOG_BUFFER_SIZE) {
        logBuffer.shift();
    }
}

// --- CALLBACKS FOR LOOPER ---

// Handle found submissions (Submission Mode)
async function onSubmissionFound(entry) {
    console.log('%c [SRK] onSubmissionFound triggered', 'background: #2196F3; color: white; font-weight: bold; padding: 2px 4px;', entry);

    await addStudentToFoundList(entry);
    await sendConnectionPings(entry);
    await sendHighlightStudentRowPayload(entry);

    const logPayload = { type: 'SUBMISSION', ...entry };
    addToLogBuffer('log', logPayload);
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.LOG_TO_PANEL, level: 'log', payload: logPayload }).catch(() => {});
}

// Handle found missing assignments (Missing Mode)
function onMissingFound(payload) {
    missingAssignmentsCollector.push(payload);
    
    const logMessage = payload.count > 0 
          ? `Missing Found: ${payload.studentName} (${payload.count})`
          : `Clean: ${payload.studentName}`;
          
    chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.LOG_TO_PANEL,
          level: payload.count > 0 ? 'warn' : 'log',
          args: [ logMessage ]
    }).catch(() => {});
}

async function onMissingCheckCompleted() {
    console.log("MESSAGE RECEIVED: MISSING_CHECK_COMPLETED");
    const completionEndTime = Date.now();
    const settings = await chrome.storage.local.get(STORAGE_KEYS.INCLUDE_ALL_ASSIGNMENTS);
    const includeAll = settings[STORAGE_KEYS.INCLUDE_ALL_ASSIGNMENTS];

    let finalPayload;

    if (missingAssignmentsCollector.length > 0) {
        const transformedData = missingAssignmentsCollector.map(studentReport => {
            const transformedAssignments = studentReport.assignments.map(assignment => ({
                assignmentTitle: assignment.title,
                link: assignment.link,
                submissionLink: assignment.submissionLink,
                dueDate: assignment.dueDate,
                score: assignment.score
            }));

            return {
                studentName: studentReport.studentName,
                studentGrade: studentReport.currentGrade,
                totalMissing: studentReport.count,
                gradeBook: studentReport.gradeBook,
                assignments: transformedAssignments,
                gradeBookLink: studentReport.gradeBook 
            };
        });
        
        const studentsWithMissingCount = missingAssignmentsCollector.filter(studentReport => 
            studentReport.count > 0
        ).length;

        // --- Performance Calculations ---
        let totalCompletionTime = null;
        if (missingCheckStartTime) {
            totalCompletionTime = `${((completionEndTime - missingCheckStartTime) / 1000).toFixed(2)} seconds`;
        }
        
        finalPayload = {
            reportGenerated: new Date().toISOString(),
            totalStudentsInReport: missingAssignmentsCollector.length,
            totalStudentsWithMissing: studentsWithMissingCount,
            totalCompletionTime: totalCompletionTime,
            type: "MISSING_ASSIGNMENTS_REPORT",
            mode: "API_HEADLESS",
            CUSTOM_IMPORT: {
                importName: "Missing Assignments Report",
                dataArrayKey: "assignments",
                targetSheet: "Missing Assignments",
                overwriteTargetSheet: true,
                sheetKeyColumn: ["submissionLink", "Grade Book"],
                columnMappings: [
                  { source: "studentName", target: "Student Name" },
                  { source: "studentGrade", target: ["grade", "Grade"] },
                  { source: "totalMissing", target: "Missing Assignments" },
                  { source: "assignmentTitle", target: "Assignment Title" },
                  { source: "dueDate", target: "Due Date" },
                  { source: "score", target: "Score" },
                  { source: "gradeBook", target: "Grade Book" },
                  { source: "submissionLink", target: "submissionLink" },
                  { source: "gradeBookLink", target: "gradeBookLink" }
                ],
                data: transformedData
            }
        };
        
        await sendConnectionPings(finalPayload);

        chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.LOG_TO_PANEL,
            level: 'warn',
            args: [ `Final Missing Assignments Report (API Mode)`, finalPayload ]
        }).catch(() => {});
        
        addToLogBuffer('warn', finalPayload);
        
    } else {
        const successMessage = "Missing Assignments Check Complete: No missing assignments were found.";
        finalPayload = { 
            reportGenerated: new Date().toISOString(),
            totalStudentsInReport: 0,
            totalStudentsWithMissing: 0,
            type: 'MISSING_ASSIGNMENTS_REPORT',
            message: successMessage,
            CUSTOM_IMPORT: { data: [] }
        };
        addToLogBuffer('log', finalPayload);
        
        chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.LOG_TO_PANEL,
            level: 'log',
            args: [ successMessage ]
        }).catch(() => {});
    }
    
    await chrome.storage.local.set({ [STORAGE_KEYS.LATEST_MISSING_REPORT]: finalPayload });
    
    missingCheckStartTime = null;

    chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.SHOW_MISSING_ASSIGNMENTS_REPORT,
        payload: finalPayload
    }).catch(() => {});
    
    chrome.storage.local.set({ [STORAGE_KEYS.EXTENSION_STATE]: EXTENSION_STATES.OFF });
}

// --- CORE LISTENERS ---

chrome.action.onClicked.addListener((tab) => chrome.sidePanel.open({ tabId: tab.id }));
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === '_execute_action') chrome.sidePanel.open({ tabId: tab.id });
});
chrome.runtime.onStartup.addListener(() => {
  updateBadge();
  setupSchedule();
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

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SCHEDULED_ALARM_NAME) {
    runScheduledCheck();
  }
});

chrome.webRequest.onErrorOccurred.addListener(
  async (details) => {
    if (details.url.includes('/api/v1/courses/')) {
        console.warn('API Connection Error:', details.error);
    }
  },
  { urls: ["https://nuc.instructure.com/api/*"] }
);

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.type === MESSAGE_TYPES.REQUEST_STORED_LOGS) {
      if (logBuffer.length > 0) {
          chrome.runtime.sendMessage({ type: MESSAGE_TYPES.STORED_LOGS, payload: logBuffer }).catch(() => {});
          logBuffer = [];
      }
  } else if (msg.type === MESSAGE_TYPES.TEST_CONNECTION_PA) {
    await handlePaConnectionTest(msg.connection);
  } else if (msg.type === MESSAGE_TYPES.SEND_DEBUG_PAYLOAD) {
    if (msg.payload) {
      await sendConnectionPings(msg.payload);
    }
  } else if (msg.type === MESSAGE_TYPES.UPDATE_SCHEDULE) {
    await setupSchedule();
  } else if (msg.type === MESSAGE_TYPES.LOG_TO_PANEL) {
      // Re-broadcast logs
  }

  // --- MASTER LIST UPDATE HANDLERS ---
  else if (msg.type === MESSAGE_TYPES.SRK_MASTER_LIST_UPDATED) {
      console.log(`%c [Background] Master List Updated!`, "color: green; font-weight: bold");
      console.log(`   Students: ${msg.studentCount}`);
      console.log(`   Source Timestamp: ${msg.sourceTimestamp}`);

      // Log to panel
      chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.LOG_TO_PANEL,
          level: 'log',
          args: [`Master List auto-updated: ${msg.studentCount} students`]
      }).catch(() => {});

      // Update badge to reflect new data
      updateBadge();
  }
  else if (msg.type === MESSAGE_TYPES.SRK_MASTER_LIST_ERROR) {
      console.error(`%c [Background] Master List Update Error:`, "color: red; font-weight: bold", msg.error);

      // Log error to panel
      chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.LOG_TO_PANEL,
          level: 'error',
          args: [`Master List update failed: ${msg.error}`]
      }).catch(() => {});
  }
  else if (msg.type === MESSAGE_TYPES.SRK_SELECTED_STUDENTS) {
      const studentText = msg.count === 1
          ? msg.students[0]?.name
          : `${msg.count} students`;
      console.log(`%c [Background] Selected Students Received:`, "color: purple; font-weight: bold", studentText);

      // Forward to sidepanel to set as active student or automation mode
      chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.SRK_SELECTED_STUDENTS,
          students: msg.students,
          count: msg.count,
          timestamp: msg.timestamp,
          sourceTimestamp: msg.sourceTimestamp
      }).catch(() => {
          // Sidepanel might not be open, that's ok
      });
  }

  // --- FIVE9 INTEGRATION ---
  else if (msg.type === 'triggerFive9Call') {
      (async () => {
          const tabs = await chrome.tabs.query({ url: "https://app-atl.five9.com/*" });
          if (tabs.length === 0) {
              chrome.runtime.sendMessage({ 
                  type: 'callStatus', 
                  success: false, 
                  error: "Five9 tab not found. Please open Five9." 
              });
              return;
          }
          
          const five9TabId = tabs[0].id;
          // Clean number logic
          let cleanNumber = msg.phoneNumber.replace(/[^0-9+]/g, '');
          if (!cleanNumber.startsWith('+1') && cleanNumber.length === 10) {
              cleanNumber = '+1' + cleanNumber;
          }

          chrome.tabs.sendMessage(five9TabId, { 
              type: 'executeFive9Call', 
              phoneNumber: cleanNumber 
          }, (response) => {
              if (chrome.runtime.lastError) {
                  console.error("Five9 Connection Error:", chrome.runtime.lastError.message); 
                  chrome.runtime.sendMessage({ type: 'callStatus', success: false, error: "Five9 disconnected. Refresh tab." });
              } else {
                  chrome.runtime.sendMessage({ type: 'callStatus', success: response?.success, error: response?.error });
              }
          });
      })();
      return true;
  }
  else if (msg.type === 'triggerFive9Hangup') {
      (async () => {
          const tabs = await chrome.tabs.query({ url: "https://app-atl.five9.com/*" });
          if (tabs.length === 0) {
              chrome.runtime.sendMessage({ type: 'hangupStatus', success: false, error: "Five9 tab not found." });
              return;
          }

          chrome.tabs.sendMessage(tabs[0].id, {
              type: 'executeFive9Hangup',
              dispositionType: msg.dispositionType
          }, (response) => {
              if (chrome.runtime.lastError) {
                  console.error("Five9 Hangup Error:", chrome.runtime.lastError.message);
                  chrome.runtime.sendMessage({ type: 'hangupStatus', success: false, error: "Five9 disconnected." });
              } else {
                  chrome.runtime.sendMessage({ type: 'hangupStatus', success: response?.success, error: response?.error });
              }
          });
      })();
      return true;
  }
});

// --- HIGHLIGHT STUDENT ROW HANDLING ---
async function sendHighlightStudentRowPayload(entry) {
    console.log('%c [SRK] Submission Found - Sending payload to Office Add-in', 'background: #4CAF50; color: white; font-weight: bold; padding: 2px 4px;', entry.name);

    // Only send if we have the required SyStudentId
    if (!entry.syStudentId) {
        console.warn('[SRK] Cannot send highlight payload: missing SyStudentId');
        return;
    }

    // Load highlight settings
    const settings = await chrome.storage.local.get([
        STORAGE_KEYS.HIGHLIGHT_START_COL,
        STORAGE_KEYS.HIGHLIGHT_END_COL,
        STORAGE_KEYS.HIGHLIGHT_EDIT_COLUMN,
        STORAGE_KEYS.HIGHLIGHT_EDIT_TEXT,
        STORAGE_KEYS.HIGHLIGHT_TARGET_SHEET,
        STORAGE_KEYS.HIGHLIGHT_COLOR
    ]);

    // Process editText to replace {assignment} placeholder
    let editText = settings[STORAGE_KEYS.HIGHLIGHT_EDIT_TEXT] || 'Submitted {assignment}';
    if (entry.assignment) {
        editText = editText.replace(/{assignment}/g, entry.assignment);
    }

    // Process targetSheet to replace MM-DD-YYYY with current date
    let targetSheet = settings[STORAGE_KEYS.HIGHLIGHT_TARGET_SHEET] || 'LDA MM-DD-YYYY';
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    targetSheet = targetSheet.replace(/MM/g, month).replace(/DD/g, day).replace(/YYYY/g, year);

    // Build the payload
    const payload = {
        type: 'SRK_HIGHLIGHT_STUDENT_ROW',
        data: {
            studentName: entry.name,
            syStudentId: entry.syStudentId,
            startCol: settings[STORAGE_KEYS.HIGHLIGHT_START_COL] || 'Student Name',
            endCol: settings[STORAGE_KEYS.HIGHLIGHT_END_COL] || 'Outreach',
            targetSheet: targetSheet,
            color: settings[STORAGE_KEYS.HIGHLIGHT_COLOR] || '#92d050',
            editColumn: settings[STORAGE_KEYS.HIGHLIGHT_EDIT_COLUMN] || 'Outreach',
            editText: editText
        }
    };

    console.log('[SRK] Sending highlight student row payload:', payload);

    // Send to all Excel tabs
    try {
        const tabs = await chrome.tabs.query({ url: TARGET_URL_PATTERNS });
        for (const tab of tabs) {
            try {
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'postToPage',
                    message: payload
                });
                console.log(`[SRK] Sent highlight payload to tab ${tab.id}`);
            } catch (err) {
                console.warn(`[SRK] Failed to send highlight payload to tab ${tab.id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[SRK] Failed to query Excel tabs:', err);
    }
}

// --- CONNECTION HANDLING ---
async function sendConnectionPings(payload) {
    const data = await chrome.storage.local.get([STORAGE_KEYS.CONNECTIONS, STORAGE_KEYS.DEBUG_MODE]);
    const connections = data[STORAGE_KEYS.CONNECTIONS] || [];
    const debugMode = data[STORAGE_KEYS.DEBUG_MODE] || false;
    const bodyPayload = { ...payload };
    if (!bodyPayload.debug && debugMode) {
      bodyPayload.debug = true;
    }

    const pingPromises = [];

    for (const conn of connections) {
        if (conn.type === CONNECTION_TYPES.POWER_AUTOMATE) {
            pingPromises.push(triggerPowerAutomate(conn, bodyPayload));
        } else if (conn.type === CONNECTION_TYPES.PUSHER) {
            chrome.runtime.sendMessage({
                type: MESSAGE_TYPES.TRIGGER_PUSHER,
                target: 'offscreen',
                connection: conn,
                payload: bodyPayload
            }).catch(e => console.error("Error sending to offscreen:", e));
        }
    }
    await Promise.all(pingPromises);
}

async function handlePaConnectionTest(connection) {
    const testPayload = { name: 'Test Submission', url: '#', grade: '100', timestamp: new Date().toISOString(), test: true };
    const result = await triggerPowerAutomate(connection, testPayload);
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CONNECTION_TEST_RESULT, connectionType: CONNECTION_TYPES.POWER_AUTOMATE, success: result.success, error: result.error || 'Check service worker console for details.' }).catch(() => {});
}

async function triggerPowerAutomate(connection, payload) {
  try {
    const resp = await fetch(connection.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!resp.ok && resp.status !== 202) { throw new Error(`HTTP Error: ${resp.status}`); }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// --- STATE & DATA MANAGEMENT ---
function updateBadge() {
  chrome.storage.local.get([STORAGE_KEYS.EXTENSION_STATE, STORAGE_KEYS.FOUND_ENTRIES], (data) => {
    const state = data[STORAGE_KEYS.EXTENSION_STATE];
    const foundCount = data[STORAGE_KEYS.FOUND_ENTRIES]?.length || 0;
    
    if (state === EXTENSION_STATES.ON) {
      chrome.action.setBadgeBackgroundColor({ color: '#0052cc' });
      chrome.action.setBadgeText({ text: foundCount > 0 ? foundCount.toString() : 'API' });
    } else if (state === EXTENSION_STATES.PAUSED) {
      chrome.action.setBadgeBackgroundColor({ color: '#f5a623' });
      chrome.action.setBadgeText({ text: 'WAIT' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  });
}

async function handleStateChange(newState, oldState) {
    console.log(`%c [BACKGROUND] State Change: ${oldState} -> ${newState}`, 'background: #9C27B0; color: white; font-weight: bold; padding: 4px;');

    if (newState === EXTENSION_STATES.ON) {
        const settings = await chrome.storage.local.get(STORAGE_KEYS.CHECKER_MODE);
        const currentMode = settings[STORAGE_KEYS.CHECKER_MODE] || CHECKER_MODES.SUBMISSION;

        console.log(`%c ▶ STARTING CHECKER - Mode: ${currentMode}`, 'background: #4CAF50; color: white; font-weight: bold; font-size: 14px; padding: 4px;');

        if (currentMode === CHECKER_MODES.MISSING) {
            missingAssignmentsCollector = [];
            missingCheckStartTime = Date.now();
            console.log("Starting Missing Assignments check (API Mode).");
            startLoop({
                onComplete: onMissingCheckCompleted,
                onMissingFound: onMissingFound
            });
        } else {
            console.log("Starting Submission check (API Mode).");
            startLoop({ onFound: onSubmissionFound });
        }
    } else if (newState === EXTENSION_STATES.OFF && (oldState === EXTENSION_STATES.ON || oldState === EXTENSION_STATES.PAUSED)) {
        console.log(`%c ■ STOPPING CHECKER`, 'background: #F44336; color: white; font-weight: bold; font-size: 14px; padding: 4px;');
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

// --- INJECTION LOGIC FOR EXCEL CONNECTOR ---

const CONTENT_SCRIPT_FILE = "src/content/excelConnector.js";

// UPDATED PATTERNS: Added SharePoint
const TARGET_URL_PATTERNS = [
  "https://excel.office.com/*",
  "https://*.officeapps.live.com/*",
  "https://*.sharepoint.com/*",
  "https://vsblanco.github.io/*" 
];

async function injectScriptIntoTab(tabId, url) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: [CONTENT_SCRIPT_FILE]
    });
    console.log(`[SRK] SUCCESS: Injected connector into tab ${tabId} (${url})`);
  } catch (err) {
    console.warn(`[SRK] FAILED to inject into tab ${tabId}: ${err.message}`);
  }
}

// 1. On Install / Reload
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[SRK] Extension installed/updated. Scanning for open Excel tabs...");

  // Query specifically for our target URLs
  const tabs = await chrome.tabs.query({ url: TARGET_URL_PATTERNS });
  
  console.log(`[SRK] Found ${tabs.length} matching tabs.`);

  if (tabs.length === 0) {
      console.log("[SRK] No tabs matched. Listing first 3 open tabs to debug URL mismatches:");
      const allTabs = await chrome.tabs.query({});
      allTabs.slice(0, 3).forEach(t => console.log(" - Open URL:", t.url));
  }

  for (const tab of tabs) {
    injectScriptIntoTab(tab.id, tab.url);
  }
});

// 2. On Browser Startup
chrome.runtime.onStartup.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: TARGET_URL_PATTERNS });
  for (const tab of tabs) {
    injectScriptIntoTab(tab.id, tab.url);
  }
});

// --- INITIALIZATION ---
updateBadge();
setupSchedule();
chrome.storage.local.get(STORAGE_KEYS.EXTENSION_STATE, data => {
    handleStateChange(data[STORAGE_KEYS.EXTENSION_STATE]);
});