// popup.js

// MASTER_LIST_URL is no longer needed and has been removed.

function getDaysOutStyle(daysout) {
    if (daysout == null) return {};

    if (daysout >= 10) {
        return {
            backgroundColor: 'hsl(0, 85%, 55%)',
            color: 'white',
            fontWeight: 'bold'
        };
    }
    
    if (daysout >= 5) {
        return {
            backgroundColor: 'hsl(35, 95%, 55%)',
            color: 'white',
            fontWeight: 'bold'
        };
    }

    return {
        backgroundColor: 'hsl(130, 65%, 90%)',
        color: 'hsl(130, 40%, 25%)',
        border: '1px solid hsl(130, 40%, 80%)'
    };
}


export function renderFoundList(entries) {
  const list = document.getElementById('foundList');
  list.innerHTML = '';
  if (!entries || entries.length === 0) {
      list.innerHTML = '<li>None yet</li>';
      return;
  }

  entries.sort((a, b) => {
    if (!a.timestamp || !b.timestamp) return 0;
    return b.timestamp.localeCompare(a.timestamp);
  });

  entries.forEach(({ name, time, url }) => {
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.textContent = name;
    a.href = '#';
    a.style.color = 'var(--accent-color)';
    a.style.textDecoration = 'none';
    a.addEventListener('click', e => {
      e.preventDefault();
      chrome.tabs.create({ url });
    });
    li.appendChild(a);
    if (time) {
        const timeBadge = document.createElement('span');
        timeBadge.className = 'pill-badge align-right';
        timeBadge.textContent = time;
        li.appendChild(timeBadge);
    }
    list.appendChild(li);
  });
}

export function renderMasterList(entries, showPhones) {
  const list = document.getElementById('masterList');
  list.innerHTML = '';
  entries.forEach(({ name, time, url, phone, daysout }) => {
    const li = document.createElement('li');
    if (url && url !== '#N/A' && url.startsWith('http')) {
      const a  = document.createElement('a');
      a.textContent = name;
      a.href = url;
      a.style.color = 'var(--accent-color)';
      a.style.textDecoration = 'none';
      a.addEventListener('click', e => {
        e.preventDefault();
        chrome.tabs.create({ url });
      });
      li.appendChild(a);
    } else {
      const nameSpan = document.createElement('span');
      nameSpan.textContent = name;
      nameSpan.style.color = '#888';
      nameSpan.title = 'Invalid URL. Please update on the master list.';
      li.appendChild(nameSpan);
    }

    if (daysout != null) {
        const daysoutSpan = document.createElement('span');
        daysoutSpan.className = 'pill-badge';
        daysoutSpan.textContent = daysout;
        
        const styles = getDaysOutStyle(daysout);
        Object.assign(daysoutSpan.style, styles);

        daysoutSpan.style.fontSize = '0.9em';

        li.appendChild(daysoutSpan);
    }

    if (showPhones && phone) {
        const phoneSpan = document.createElement('span');
        phoneSpan.className = 'pill-badge';
        phoneSpan.textContent = phone;
        li.appendChild(phoneSpan);
    }
    list.appendChild(li);
  });
}

/**
 * --- NEW FUNCTION ---
 * Reads JSON from the clipboard to update the master list.
 */
async function updateMasterFromClipboard() {
  const updateBtn = document.getElementById('updateMasterBtn');
  const list = document.getElementById('masterList');
  
  // Reset button state and provide user feedback
  updateBtn.classList.remove('btn-success', 'btn-error');
  updateBtn.textContent = 'Processing...';
  list.innerHTML = '<li>Reading from clipboard...</li>';

  try {
    const clipboardText = await navigator.clipboard.readText();
    if (!clipboardText) {
      throw new Error("Clipboard is empty.");
    }
    
    const data = JSON.parse(clipboardText);

    if (!Array.isArray(data)) {
      throw new Error("Clipboard data is not a valid JSON array.");
    }

    // Map the new clipboard format to the extension's internal format
    const entries = data.map(s => {
        if (!s.StudentName || !s.GradeBook) {
            console.warn("Skipping invalid entry:", s);
            return null;
        }
        return {
          name: s.StudentName,
          url: s.GradeBook,
          daysout: s.DaysOut,
          // Add other fields from your JSON for future use if needed
          lda: s.LDA,
          grade: s.Grade,
          // Ensure old fields have default values
          phone: '', 
          time: ''
        };
    }).filter(Boolean); // Filter out any null entries that were skipped

    const now = new Date();
    const timestampStr = now.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    }).replace(',', '');
    
    await new Promise(res => chrome.storage.local.set({ masterEntries: entries, lastUpdated: timestampStr }, res));
    
    displayMasterList(); // Refresh the list in the UI
    
    const lastUpdatedSpan = document.getElementById('lastUpdatedTime');
    if(lastUpdatedSpan) lastUpdatedSpan.textContent = `Last updated: ${timestampStr}`;

    // Success visual cue
    updateBtn.classList.add('btn-success');
    updateBtn.textContent = `Success! ${entries.length} students loaded.`;

  } catch (e) {
    console.error('Failed to update master list from clipboard', e);
    
    // Error visual cue
    updateBtn.classList.add('btn-error');
    updateBtn.textContent = 'Error: Invalid clipboard data.';
    list.innerHTML = '<li>Error loading list. Please copy the correct JSON data and try again.</li>';
  } finally {
    // Reset button text after a delay to allow user to see the status
    setTimeout(() => {
        updateBtn.classList.remove('btn-success', 'btn-error');
        updateBtn.textContent = 'Update Master List';
    }, 4000);
  }
}


function createRipple(event) {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = 'ripple';
    ripple.style.height = ripple.style.width = Math.max(rect.width, rect.height) + "px";
    const x = event.clientX - rect.left - ripple.offsetWidth / 2;
    const y = event.clientY - rect.top - ripple.offsetHeight / 2;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    button.appendChild(ripple);
    setTimeout(() => {
      ripple.remove();
    }, 600);
}

let activeSort = {
    criterion: 'none',
    direction: 'none'
};

async function displayMasterList() {
    const { masterEntries = [] } = await chrome.storage.local.get(['masterEntries']);
    
    const searchInput = document.getElementById('newItemInput');
    const term = searchInput ? searchInput.value.trim() : '';
    const lowerTerm = term.toLowerCase();

    const advancedFilterRegex = /^\s*([><]=?|=)\s*(\d+)\s*$/;
    const advancedMatch = term.match(advancedFilterRegex);

    const filteredEntries = masterEntries.filter(entry => {
        if (advancedMatch) {
            const operator = advancedMatch[1];
            const value = parseInt(advancedMatch[2], 10);
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
        }

        if (term === '') return true;

        const nameMatch = entry.name.toLowerCase().includes(lowerTerm);
        let extraMatch = false;
        
        if (entry.daysout != null && !isNaN(term) && term !== '') {
             extraMatch = String(entry.daysout) === term;
        }
        
        return nameMatch || extraMatch;
    });

    let finalEntries = [...filteredEntries];
    if (activeSort.criterion === 'daysout') {
        finalEntries.sort((a, b) => {
            const valA = a.daysout || 0;
            const valB = b.daysout || 0;
            return activeSort.direction === 'desc' ? valB - valA : valA - valB;
        });
    } else if (activeSort.criterion === 'name') {
        finalEntries.sort((a, b) => {
            return activeSort.direction === 'asc' 
                ? a.name.localeCompare(b.name) 
                : b.name.localeCompare(a.name);
        });
    }

    renderMasterList(finalEntries, false); // Always pass false for showPhones

    const badge = document.querySelector('.tab-button[data-tab="master"] .count');
    if (badge) badge.textContent = finalEntries.length;
}

function switchTab(tabName) {
    const tabs = document.querySelectorAll('.tab-button');
    const panes = document.querySelectorAll('.tab-content');
    
    tabs.forEach(btn => {
        const isActive = btn.dataset.tab === tabName;
        btn.classList.toggle('active', isActive);
    });

    panes.forEach(pane => {
        const isActive = pane.id === tabName;
        if (isActive) {
            pane.style.display = 'flex';
            pane.classList.add('active');
        } else {
            pane.style.display = 'none';
            pane.classList.remove('active');
        }
    });
}


document.addEventListener('DOMContentLoaded', () => {
  let isStarted;
  const manifest = chrome.runtime.getManifest();
  document.getElementById('version-display').textContent = `Version ${manifest.version}`;
  const keywordDisplay = document.getElementById('keyword');
  const loopCounterDisplay = document.getElementById('loop-counter');

  const daysOutSortBtn = document.getElementById('daysOutSortBtn');
  const nameSortBtn = document.getElementById('nameSortBtn');

  function applyDebugModeStyles(enabled) {
      document.body.classList.toggle('debug-mode', enabled);
  }

  function updateLoopCounter() {
    chrome.storage.local.get(['loopStatus', 'extensionState'], ({ loopStatus, extensionState }) => {
        if (extensionState === 'on' && loopStatus && loopStatus.total > 0) {
            loopCounterDisplay.textContent = `${loopStatus.current} / ${loopStatus.total}`;
            loopCounterDisplay.style.display = 'block';
        } else {
            loopCounterDisplay.style.display = 'none';
        }
    });
  }

  function updateKeywordDisplay() {
    chrome.storage.local.get({ customKeyword: '' }, (data) => {
        if (data.customKeyword) {
            keywordDisplay.textContent = data.customKeyword;
        } else {
            const now = new Date();
            const opts = { month: 'short', day: 'numeric' };
            keywordDisplay.textContent = now.toLocaleDateString('en-US', opts).replace(',', '') + ' at';
        }
    });
  }
  
  function updateSortButtons() {
    daysOutSortBtn.classList.remove('active');
    nameSortBtn.classList.remove('active');
    daysOutSortBtn.textContent = 'Sort by Days Out';
    nameSortBtn.textContent = 'Sort by Name';

    if (activeSort.criterion === 'daysout') {
        daysOutSortBtn.classList.add('active');
        daysOutSortBtn.textContent = activeSort.direction === 'desc' ? 'Days Out (High-Low)' : 'Days Out (Low-High)';
    } else if (activeSort.criterion === 'name') {
        nameSortBtn.classList.add('active');
        nameSortBtn.textContent = activeSort.direction === 'asc' ? 'Name (A-Z)' : 'Name (Z-A)';
    }
  }

  updateKeywordDisplay();
  updateLoopCounter();

  chrome.storage.local.get({ foundEntries: [] }, data => {
    const badge = document.querySelector('.tab-button[data-tab="found"] .count');
    if(badge) badge.textContent = data.foundEntries.length;
    renderFoundList(data.foundEntries);
  });

  chrome.storage.local.get(['lastUpdated'], data => {
    const lastUpdatedSpan = document.getElementById('lastUpdatedTime');
    if (lastUpdatedSpan && data.lastUpdated) { lastUpdatedSpan.textContent = `Last updated: ${data.lastUpdated}`; }
  });
  
  displayMasterList();
  
  const searchMasterInput = document.getElementById('newItemInput');
  if (searchMasterInput) {
      searchMasterInput.addEventListener('input', displayMasterList);
  }

  if (daysOutSortBtn) {
      daysOutSortBtn.addEventListener('click', () => {
          if (activeSort.criterion !== 'daysout') {
              activeSort.criterion = 'daysout';
              activeSort.direction = 'desc';
          } else {
              activeSort.direction = activeSort.direction === 'desc' ? 'asc' : 'desc';
          }
          updateSortButtons();
          displayMasterList();
      });
  }
  if (nameSortBtn) {
      nameSortBtn.addEventListener('click', () => {
          if (activeSort.criterion !== 'name') {
              activeSort.criterion = 'name';
              activeSort.direction = 'asc';
          } else {
              activeSort.direction = activeSort.direction === 'asc' ? 'desc' : 'asc';
          }
          updateSortButtons();
          displayMasterList();
      });
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.foundEntries) {
      const newEntries = changes.foundEntries.newValue || [];
      renderFoundList(newEntries);
      const badge = document.querySelector('.tab-button[data-tab="found"] .count');
      if (badge) {
        badge.textContent = newEntries.length;
      }
    }
    if (changes.loopStatus || changes.extensionState) {
        updateLoopCounter();
    }
    if (changes.masterEntries) {
        displayMasterList();
    }
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    chrome.storage.local.set({ foundEntries: [] }, () => location.reload());
  });

  document.getElementById('updateMasterBtn').addEventListener('click', (event) => {
    createRipple(event);
    updateMasterFromClipboard();
  });

  const tabContainer = document.querySelector('.tabs');
  if (tabContainer) {
      tabContainer.addEventListener('click', (event) => {
          const tabButton = event.target.closest('.tab-button');
          if (tabButton && tabButton.dataset.tab) {
              switchTab(tabButton.dataset.tab);
          }
      });
  }

  // --- Modal Logic ---
  const modal = document.getElementById('json-modal');
  const showJsonBtn = document.getElementById('showJsonExampleBtn');
  const closeBtn = document.querySelector('.modal-close');

  if(showJsonBtn) {
    showJsonBtn.addEventListener('click', () => {
      if(modal) modal.style.display = 'flex';
    });
  }
  if(closeBtn) {
    closeBtn.addEventListener('click', () => {
      if(modal) modal.style.display = 'none';
    });
  }
  window.addEventListener('click', (event) => {
    if (event.target == modal) {
      modal.style.display = 'none';
    }
  });
  // --- End Modal Logic ---

  const concurrentTabsInput = document.getElementById('concurrentTabsInput');
  const looperDaysOutFilterInput = document.getElementById('looperDaysOutFilterInput');
  const embedToggle = document.getElementById('embedToggle');
  const colorPicker = document.getElementById('colorPicker');
  const customKeywordInput = document.getElementById('customKeywordInput');
  const debugToggle = document.getElementById('debugToggle');
  const sharepointBtn = document.getElementById('sharepointBtn');

  if (concurrentTabsInput) {
    chrome.storage.local.get({ concurrentTabs: 3 }, data => {
        concurrentTabsInput.value = data.concurrentTabs;
    });
    concurrentTabsInput.addEventListener('change', (event) => {
        let value = parseInt(event.target.value, 10);
        if (isNaN(value) || value < 1) value = 1;
        if (value > 10) value = 10;
        event.target.value = value;
        chrome.storage.local.set({ concurrentTabs: value });
    });
  }
  
  if (looperDaysOutFilterInput) {
      chrome.storage.local.get({ looperDaysOutFilter: 'all' }, (data) => {
          looperDaysOutFilterInput.value = data.looperDaysOutFilter === 'all' ? '' : data.looperDaysOutFilter;
      });
      looperDaysOutFilterInput.addEventListener('change', (event) => {
          const value = event.target.value.trim();
          chrome.storage.local.set({ looperDaysOutFilter: value });
      });
  }

  if (embedToggle) {
    chrome.storage.local.get({ embedInCanvas: true }, (data) => {
      embedToggle.checked = data.embedInCanvas;
    });
    embedToggle.addEventListener('change', (event) => {
      chrome.storage.local.set({ embedInCanvas: event.target.checked });
    });
  }

  if (colorPicker) {
    chrome.storage.local.get({ highlightColor: '#ffff00' }, (data) => { colorPicker.value = data.highlightColor; });
    colorPicker.addEventListener('input', (event) => { chrome.storage.local.set({ highlightColor: event.target.value }); });
  }
  if (customKeywordInput) {
    chrome.storage.local.get({ customKeyword: '' }, (data) => { customKeywordInput.value = data.customKeyword; });
    customKeywordInput.addEventListener('input', (event) => {
        const newKeyword = event.target.value.trim();
        chrome.storage.local.set({ customKeyword: newKeyword }, () => { updateKeywordDisplay(); });
    });
  }
  if (debugToggle) {
    chrome.storage.local.get({ debugMode: false }, (data) => {
      debugToggle.checked = data.debugMode;
      applyDebugModeStyles(data.debugMode);
    });
    debugToggle.addEventListener('change', (event) => {
      const isEnabled = event.target.checked;
      chrome.storage.local.set({ debugMode: isEnabled });
      applyDebugModeStyles(isEnabled);
    });
  }
  if (sharepointBtn) {
    sharepointBtn.addEventListener('click', (event) => {
        createRipple(event);
        chrome.tabs.create({ url: "https://edukgroup365.sharepoint.com/sites/SM-StudentServices/SitePages/CollabHome.aspx" });
    });
  }

  const startBtn = document.getElementById('startBtn');
  const startBtnText = document.getElementById('startBtnText');
  
  function updateButtonState(state) {
    isStarted = (state === 'on');
    if (isStarted) {
      startBtn.classList.add('active');
      startBtnText.textContent = 'Stop';
    } else {
      startBtn.classList.remove('active');
      startBtnText.textContent = 'Start';
    }
    updateLoopCounter();
  }

  if (startBtn && startBtnText) {
    chrome.storage.local.get({ extensionState: 'off' }, data => { updateButtonState(data.extensionState); });
    startBtn.addEventListener('click', (event) => {
      createRipple(event);
      const newState = !isStarted ? 'on' : 'off';
      chrome.storage.local.set({ extensionState: newState });
      updateButtonState(newState);
    });
  }

  switchTab('found');
});
