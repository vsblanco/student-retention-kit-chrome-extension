// [2025-09-25 13:28 PM]
// Version: 13.3
import { startLoop, stopLoop, processNextInQueue, addToFoundUrlCache, getActiveTabs } from './looper.js';
import { STORAGE_KEYS, CHECKER_MODES, MESSAGE_TYPES, EXTENSION_STATES, CONNECTION_TYPES, SCHEDULED_ALARM_NAME } from '../constants.js';
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

// This function holds the logic for when the missing check is complete.
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
                assignments: transformedAssignments
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
        
        const validDurations = missingAssignmentsCollector
            .map(report => parseFloat(report.duration))
            .filter(duration => !isNaN(duration));
            
        let averageTimePerTab = null;
        let minTimePerTab = null;
        let maxTimePerTab = null;
        let medianTimePerTab = null;
        let firstQuartileTimePerTab = null;
        let thirdQuartileTimePerTab = null;

        if (validDurations.length > 0) {
            const sortedDurations = [...validDurations].sort((a, b) => a - b);
            const n = sortedDurations.length;

            const getMedian = (arr) => {
                if (arr.length === 0) return 0;
                const mid = Math.floor(arr.length / 2);
                return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
            };

            minTimePerTab = `${sortedDurations[0].toFixed(2)} seconds`;
            maxTimePerTab = `${sortedDurations[n - 1].toFixed(2)} seconds`;
            medianTimePerTab = `${getMedian(sortedDurations).toFixed(2)} seconds`;

            const midIndex = Math.floor(n / 2);
            const lowerHalf = sortedDurations.slice(0, midIndex);
            const upperHalf = n % 2 === 0 ? sortedDurations.slice(midIndex) : sortedDurations.slice(midIndex + 1);

            if (lowerHalf.length > 0) {
                firstQuartileTimePerTab = `${getMedian(lowerHalf).toFixed(2)} seconds`;
            }
             if (upperHalf.length > 0) {
                thirdQuartileTimePerTab = `${getMedian(upperHalf).toFixed(2)} seconds`;
            }
            
            const totalDurationSum = validDurations.reduce((acc, curr) => acc + curr, 0);
            averageTimePerTab = `${(totalDurationSum / validDurations.length).toFixed(2)} seconds`;
        }
        // --- End of Performance Calculations ---

        finalPayload = {
            reportGenerated: new Date().toISOString(),
            totalStudentsInReport: missingAssignmentsCollector.length,
            totalStudentsWithMissing: studentsWithMissingCount,
            totalCompletionTime: totalCompletionTime,
            performanceMetrics: {
                average: averageTimePerTab,
                min: minTimePerTab,
                q1: firstQuartileTimePerTab,
                median: medianTimePerTab,
                q3: thirdQuartileTimePerTab,
                max: maxTimePerTab
            },
            type: "MISSING_ASSIGNMENTS_REPORT",
            CUSTOM_IMPORT: {
                importName: "Missing Assignments Report",
                dataArrayKey: "assignments",
                targetSheet: "Missing Assignments",
				overwriteTargetSheet: true,
                sheetKeyColumn: ["submissionLink", "Grade Book"],
                columnMappings: [
                  { source: "studentName", target: "Student Name" },
                  { source: "studentGrade", target: ["grade", "Grade"], targetSheet: "Master List", overwriteTargetSheet: false },
                  { source: "totalMissing", target: "Missing Assignments", targetSheet: "Master List", overwriteTargetSheet: false },
                  { source: "assignmentTitle", target: "Assignment Title" },
                  { source: "dueDate", target: "Due Date" },
                  { source: "score", target: "Score" },
                  { source: "gradeBook", target: "Grade Book", targetSheet: "Master List", overwriteTargetSheet: false },
                  { source: "link", target: "Link" },
                  { source: "submissionLink", target: "submissionLink" }
                ],
                data: transformedData
            }
        };
        
        await sendConnectionPings(finalPayload);

        chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.LOG_TO_PANEL,
            level: 'warn',
            args: [ `Final Missing Assignments Report`, finalPayload ]
        });
        
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
        });
    }
    
    await chrome.storage.local.set({ [STORAGE_KEYS.LATEST_MISSING_REPORT]: finalPayload });
    
    missingCheckStartTime = null; // Reset timer

    chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.SHOW_MISSING_ASSIGNMENTS_REPORT,
        payload: finalPayload
    });
    
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

// --- Safety Net Listener for Network Errors ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Check if the tab has finished loading and its URL is not a Chrome internal page
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
        const activeTabs = getActiveTabs(); // Get the active tabs map from the looper
        if (activeTabs.has(tabId)) {
            // Check for common network error titles
            const errorTitles = [
                "This site can’t be reached",
                "No internet",
                "err_connection_refused",
                "err_connection_timed_out",
				"Your connection was interrupted",
                "Aw, Snap!"
            ];

            const isErrorPage = errorTitles.some(errorTitle => tab.title.toLowerCase().includes(errorTitle.toLowerCase()));

            if (isErrorPage) {
                const { entry } = activeTabs.get(tabId);
                const errorMessage = `Network error for ${entry.name}: "${tab.title}". Closing tab and skipping.`;
                console.warn(errorMessage);

                // Log to the side panel console
                chrome.runtime.sendMessage({
                  type: MESSAGE_TYPES.LOG_TO_PANEL,
                  level: 'warn',
                  args: [errorMessage]
                }).catch(e => console.error("Error sending log to panel:", e));

                // Close the faulty tab and process the next in queue
                await chrome.tabs.remove(tabId).catch(e => console.error(`Error removing faulty tab ${tabId}:`, e));
                processNextInQueue(tabId);
            }
        }
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SCHEDULED_ALARM_NAME) {
    runScheduledCheck();
  }
});

chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === MESSAGE_TYPES.INSPECTION_RESULT) {
    if (msg.found && msg.entry) {
      await addStudentToFoundList(msg.entry);
      await sendConnectionPings(msg.entry);
    }
    if (sender.tab?.id) {
      chrome.tabs.remove(sender.tab.id).catch(e => console.error(`Error removing tab ${sender.tab.id}:`, e));
      processNextInQueue(sender.tab.id);
    }
  } else if (msg.type === MESSAGE_TYPES.FOUND_SUBMISSION) {
      const logPayload = { type: 'SUBMISSION', ...msg.payload };
      addToLogBuffer('log', logPayload);
      chrome.runtime.sendMessage({ type: MESSAGE_TYPES.LOG_TO_PANEL, level: 'log', payload: logPayload });
  } else if (msg.type === MESSAGE_TYPES.FOUND_MISSING_ASSIGNMENTS) {
      missingAssignmentsCollector.push(msg.payload);
      const durationText = msg.payload.duration ? ` | ${msg.payload.duration} seconds` : '';
      const logMessage = msg.payload.count > 0 
          ? `Missing Assignments Found for ${msg.payload.studentName}${durationText}`
          : `No missing assignments for ${msg.payload.studentName}${durationText}`;
      chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.LOG_TO_PANEL,
          level: msg.payload.count > 0 ? 'warn' : 'log',
          args: [ logMessage, msg.payload ]
      });
  } else if (msg.type === MESSAGE_TYPES.REQUEST_STORED_LOGS) {
      if (logBuffer.length > 0) {
          chrome.runtime.sendMessage({ type: MESSAGE_TYPES.STORED_LOGS, payload: logBuffer });
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
    console.log("All connection pings have been sent.");
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
        
        if (currentMode === CHECKER_MODES.MISSING) {
            missingAssignmentsCollector = [];
            missingCheckStartTime = Date.now();
            console.log("Starting Missing Assignments check. Collector has been cleared.");
            // Pass the callback function to the looper.
            startLoop({ onComplete: onMissingCheckCompleted });
        } else {
            startLoop();
        }
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
setupSchedule();
chrome.storage.local.get(STORAGE_KEYS.EXTENSION_STATE, data => {
    handleStateChange(data[STORAGE_KEYS.EXTENSION_STATE]);
});

