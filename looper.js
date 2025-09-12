// looper.js

let currentLoopIndex = 0;
let isLooping = false;
let masterListCache = [];
let activeTabId = null;

export async function startLoop() {
  if (isLooping) return;
  console.log('START command received.');
  isLooping = true;
  currentLoopIndex = 0;
  
  const { masterEntries } = await chrome.storage.local.get('masterEntries');
  if (!masterEntries || masterEntries.length === 0) {
    console.log('Master list is empty.');
    stopLoop();
    return;
  }
  masterListCache = masterEntries;
  await openNextTabInLoop();
}

export function stopLoop() {
  console.log('STOP command received.');
  isLooping = false;
  if (activeTabId) {
    chrome.tabs.remove(activeTabId).catch(e => {});
  }
  activeTabId = null;
  chrome.storage.local.set({ extensionState: 'off' });
}

export async function openNextTabInLoop() {
  if (!isLooping) return;

  if (activeTabId) {
    await chrome.tabs.remove(activeTabId).catch(e => {});
    activeTabId = null;
  }

  if (currentLoopIndex >= masterListCache.length) {
    console.log('Looped through entire list. Starting over.');
    currentLoopIndex = 0;
  }

  const entry = masterListCache[currentLoopIndex];
  currentLoopIndex++;

  if (!entry.url || !entry.url.startsWith('http')) {
      console.warn(`Skipping invalid URL: ${entry.url}`);
      setTimeout(openNextTabInLoop, 100); 
      return;
  }
  
  // --- THIS IS THE CHANGE ---
  // Add a parameter to the URL to "tag" it as a looper tab.
  const urlToOpen = new URL(entry.url);
  urlToOpen.searchParams.set('looper', 'true');
  
  console.log(`Opening tab #${currentLoopIndex - 1}: ${urlToOpen.href}`);
  try {
    const tab = await chrome.tabs.create({ url: urlToOpen.href, active: false });
    activeTabId = tab.id;
  } catch (error) {
    console.error(`Failed to create tab: ${error.message}. Continuing.`);
    setTimeout(openNextTabInLoop, 100);
  }
}