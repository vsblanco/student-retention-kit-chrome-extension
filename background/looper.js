// [2025-09-24 17:36 PM]
// Version: 9.5
import { STORAGE_KEYS, CHECKER_MODES, ADVANCED_FILTER_REGEX, DEFAULT_SETTINGS, EXTENSION_STATES, MESSAGE_TYPES } from '../constants.js';

let currentLoopIndex = 0;
let isLooping = false;
let masterListCache = [];
let foundUrlCache = new Set();
// activeTabs will now store { entry, timeoutId }
let activeTabs = new Map();
let maxConcurrentTabs = DEFAULT_SETTINGS[STORAGE_KEYS.CONCURRENT_TABS];
let currentCheckerMode = DEFAULT_SETTINGS[STORAGE_KEYS.CHECKER_MODE];
let onCompleteCallback = null; // To hold the callback function from background.js

const TAB_TIMEOUT_MS = 20000; // 20 second timeout

export function addToFoundUrlCache(url) {
  if (!url || foundUrlCache.has(url)) return;
  console.log(`Adding ${url} to the found cache to prevent re-checks.`);
  foundUrlCache.add(url);
}

async function loadSettings() {
    const settings = await chrome.storage.local.get([
        STORAGE_KEYS.CONCURRENT_TABS, 
        STORAGE_KEYS.CHECKER_MODE
    ]);
    maxConcurrentTabs = settings[STORAGE_KEYS.CONCURRENT_TABS] || maxConcurrentTabs;
    currentCheckerMode = settings[STORAGE_KEYS.CHECKER_MODE] || currentCheckerMode;
}

export async function startLoop(options = {}) {
  // Check if this is a recursive call or a new start from the background script
  if (options.onComplete) {
    onCompleteCallback = options.onComplete;
  } else if (options !== true) { // A fresh start without a specific callback
    onCompleteCallback = null;
  }

  // The 'force' parameter was previously passed as a boolean 'true' for restarts
  const force = options === true || options.force;
  if (isLooping && !force) return;
  
  console.log('START command received.');

  isLooping = true;
  currentLoopIndex = 0;
  
  // Clear any lingering timeouts from a previous run
  for (const tabInfo of activeTabs.values()) {
    if (tabInfo.timeoutId) {
      clearTimeout(tabInfo.timeoutId);
    }
  }
  activeTabs.clear();

  await loadSettings();
  
  const data = await chrome.storage.local.get([
      STORAGE_KEYS.MASTER_ENTRIES, 
      STORAGE_KEYS.FOUND_ENTRIES, 
      STORAGE_KEYS.LOOPER_DAYS_OUT_FILTER
    ]);

  const masterEntries = data[STORAGE_KEYS.MASTER_ENTRIES] || [];
  const foundEntries = data[STORAGE_KEYS.FOUND_ENTRIES] || [];
  const looperDaysOutFilter = data[STORAGE_KEYS.LOOPER_DAYS_OUT_FILTER] || 'all';
  
  foundUrlCache = new Set(foundEntries.map(e => e.url).filter(Boolean));
  if (foundUrlCache.size > 0) {
    console.log(`${foundUrlCache.size} URLs already in 'Found' list will be skipped during SUBMISSION check.`);
  }

  if (!masterEntries || masterEntries.length === 0) {
    console.warn('Master list is empty.');
    stopLoop();
    return;
  }
  
  let filteredMasterList = masterEntries;
  const filterText = looperDaysOutFilter.trim().toLowerCase();

  if (filterText !== 'all' && filterText !== '') {
    const match = filterText.match(ADVANCED_FILTER_REGEX);
    if (match) {
        filteredMasterList = masterEntries.filter(entry => {
            const operator = match[1];
            const value = parseInt(match[2], 10);
            const daysout = entry.daysout;
            if (daysout == null) return false;
            switch (operator) {
                case '>':  return daysout > value;
                case '<':  return daysout < value;
                case '>=': return daysout >= value;
                case '<=': return daysout <= value;
                case '=':  return daysout === value;
                default:   return false;
            }
        });
        console.log(`Looper will run on a filtered list of ${filteredMasterList.length} students (condition: ${filterText}).`);
    } else {
        console.warn(`Invalid looper filter format: "${filterText}". Running on all ${masterEntries.length} students.`);
    }
  }

  masterListCache = filteredMasterList;
  
  chrome.storage.local.set({ [STORAGE_KEYS.LOOP_STATUS]: { current: 0, total: masterListCache.length } });
  
  for (let i = 0; i < maxConcurrentTabs; i++) {
    processNextInQueue();
  }
}

export function stopLoop() {
  if (!isLooping) return;
  console.log('STOP command received.');
  isLooping = false;
  
  chrome.storage.local.remove(STORAGE_KEYS.LOOP_STATUS);
  
  for (const [tabId, tabInfo] of activeTabs.entries()) {
    if (tabInfo.timeoutId) {
      clearTimeout(tabInfo.timeoutId);
    }
    chrome.tabs.remove(tabId).catch(e => {});
  }
  activeTabs.clear();
}

export function processNextInQueue(finishedTabId = null) {
  if (!isLooping) return;

  if (finishedTabId) {
    const tabInfo = activeTabs.get(finishedTabId);
    if (tabInfo && tabInfo.timeoutId) {
      clearTimeout(tabInfo.timeoutId);
    }
    activeTabs.delete(finishedTabId);
  }

  if (currentLoopIndex >= masterListCache.length && activeTabs.size === 0) {
    if (currentCheckerMode === CHECKER_MODES.MISSING) {
        console.log('Completed single run for Missing Assignments check.');
        if (onCompleteCallback) {
            onCompleteCallback();
            onCompleteCallback = null;
        }
        return;
    } else { // SUBMISSION mode
        console.log('Looped through entire list. Starting over.');
        startLoop({ force: true });
        return;
    }
  }

  if (currentLoopIndex < masterListCache.length && activeTabs.size < maxConcurrentTabs) {
    const entry = masterListCache[currentLoopIndex];
    currentLoopIndex++;
    
    chrome.storage.local.set({ [STORAGE_KEYS.LOOP_STATUS]: { current: currentLoopIndex, total: masterListCache.length } });
    
    if (currentCheckerMode === CHECKER_MODES.SUBMISSION && foundUrlCache.has(entry.url)) {
      console.log(`Skipping already found URL: ${entry.url}`);
      setTimeout(() => processNextInQueue(), 0);
      return;
    }

    if (!entry.url || !entry.url.startsWith('http')) {
        console.warn(`Skipping invalid URL for student "${entry.name}": ${entry.url}`);
        setTimeout(() => processNextInQueue(), 50);
        return;
    }
    
    openTab(entry);
  }
}

async function openTab(entry) {
    if (!isLooping) return;

    const urlToOpen = new URL(entry.url);
    urlToOpen.searchParams.set('looper', 'true');
    
    console.log(`Opening tab for index #${currentLoopIndex - 1}: ${entry.name}`);
    try {
        const tab = await chrome.tabs.create({ url: urlToOpen.href, active: false });
        
        const timeoutId = setTimeout(() => {
            const timeoutMessage = `Tab for ${entry.name} timed out after ${TAB_TIMEOUT_MS / 1000} seconds. Closing and continuing.`;
            console.error(timeoutMessage);
            chrome.runtime.sendMessage({
              type: MESSAGE_TYPES.LOG_TO_PANEL,
              level: 'error',
              args: [timeoutMessage]
            });

            chrome.tabs.remove(tab.id).catch(e => {}); // Ignore errors if tab is already closed
            processNextInQueue(tab.id);
        }, TAB_TIMEOUT_MS);

        activeTabs.set(tab.id, { entry, timeoutId });

    } catch (error) {
        console.error(`Failed to create tab for ${entry.name}: ${error.message}. Continuing.`);
        setTimeout(() => processNextInQueue(), 100);
    }
}
