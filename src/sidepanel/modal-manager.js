// Modal Manager - Handles all modal dialogs (scan filter, queue, version history)
import { STORAGE_KEYS } from '../constants/index.js';
import { elements } from './ui-manager.js';
import { resolveStudentData } from './student-renderer.js';

/**
 * Opens the scan filter modal
 */
export async function openScanFilterModal() {
    if (!elements.scanFilterModal) return;

    // Load current settings
    const settings = await chrome.storage.local.get([
        STORAGE_KEYS.SCAN_FILTER_DAYS_OUT,
        STORAGE_KEYS.SCAN_FILTER_INCLUDE_FAILING
    ]);

    const daysOutFilter = settings[STORAGE_KEYS.SCAN_FILTER_DAYS_OUT] || '>=5';
    const includeFailing = settings[STORAGE_KEYS.SCAN_FILTER_INCLUDE_FAILING] || false;

    // Parse days out filter (e.g., ">=5" -> operator: ">=", value: "5")
    const match = daysOutFilter.match(/^\s*([><]=?|=)\s*(\d+)\s*$/);
    if (match && elements.daysOutOperator && elements.daysOutValue) {
        elements.daysOutOperator.value = match[1];
        elements.daysOutValue.value = match[2];
    }

    // Set failing toggle state
    if (elements.failingToggle) {
        if (includeFailing) {
            elements.failingToggle.className = 'fas fa-toggle-on';
            elements.failingToggle.style.color = 'var(--primary-color)';
        } else {
            elements.failingToggle.className = 'fas fa-toggle-off';
            elements.failingToggle.style.color = 'gray';
        }
    }

    // Calculate and display initial count
    await updateScanFilterCount();

    // Show modal
    elements.scanFilterModal.style.display = 'flex';
}

/**
 * Closes the scan filter modal
 */
export function closeScanFilterModal() {
    if (!elements.scanFilterModal) return;
    elements.scanFilterModal.style.display = 'none';
}

/**
 * Updates the student count based on current filter settings
 */
export async function updateScanFilterCount() {
    if (!elements.daysOutOperator || !elements.daysOutValue || !elements.failingToggle || !elements.studentCountValue) return;

    const operator = elements.daysOutOperator.value;
    const value = parseInt(elements.daysOutValue.value, 10);
    const includeFailing = elements.failingToggle.classList.contains('fa-toggle-on');

    const data = await chrome.storage.local.get([STORAGE_KEYS.MASTER_ENTRIES]);
    const masterEntries = data[STORAGE_KEYS.MASTER_ENTRIES] || [];

    let filteredCount = 0;

    masterEntries.forEach(entry => {
        const daysout = entry.daysout;

        let meetsDaysOutCriteria = false;
        if (daysout != null) {
            switch (operator) {
                case '>': meetsDaysOutCriteria = daysout > value; break;
                case '<': meetsDaysOutCriteria = daysout < value; break;
                case '>=': meetsDaysOutCriteria = daysout >= value; break;
                case '<=': meetsDaysOutCriteria = daysout <= value; break;
                case '=': meetsDaysOutCriteria = daysout === value; break;
                default: meetsDaysOutCriteria = false;
            }
        }

        let isFailing = false;
        if (includeFailing && entry.grade != null) {
            const grade = parseFloat(entry.grade);
            if (!isNaN(grade) && grade < 60) {
                isFailing = true;
            }
        }

        if (meetsDaysOutCriteria || isFailing) {
            filteredCount++;
        }
    });

    elements.studentCountValue.textContent = filteredCount;
}

/**
 * Toggles the failing filter state
 */
export function toggleFailingFilter() {
    if (!elements.failingToggle) return;

    const isOn = elements.failingToggle.classList.contains('fa-toggle-on');
    if (isOn) {
        elements.failingToggle.className = 'fas fa-toggle-off';
        elements.failingToggle.style.color = 'gray';
    } else {
        elements.failingToggle.className = 'fas fa-toggle-on';
        elements.failingToggle.style.color = 'var(--primary-color)';
    }
}

/**
 * Saves the scan filter settings
 */
export async function saveScanFilterSettings() {
    if (!elements.daysOutOperator || !elements.daysOutValue || !elements.failingToggle) return;

    const operator = elements.daysOutOperator.value;
    const value = elements.daysOutValue.value;
    const daysOutFilter = `${operator}${value}`;
    const includeFailing = elements.failingToggle.classList.contains('fa-toggle-on');

    await chrome.storage.local.set({
        [STORAGE_KEYS.SCAN_FILTER_DAYS_OUT]: daysOutFilter,
        [STORAGE_KEYS.SCAN_FILTER_INCLUDE_FAILING]: includeFailing,
        [STORAGE_KEYS.LOOPER_DAYS_OUT_FILTER]: daysOutFilter // Backward compatibility
    });

    closeScanFilterModal();
    console.log('Scan filter settings saved:', { daysOutFilter, includeFailing });
}

/**
 * Opens the queue management modal
 */
export function openQueueModal(selectedQueue, onReorder, onRemove) {
    if (!elements.queueModal || !elements.queueList) return;

    renderQueueModal(selectedQueue, onReorder, onRemove);
    elements.queueModal.style.display = 'flex';
}

/**
 * Closes the queue management modal
 */
export function closeQueueModal() {
    if (!elements.queueModal) return;
    elements.queueModal.style.display = 'none';
}

/**
 * Renders the queue modal content
 */
export function renderQueueModal(selectedQueue, onReorder, onRemove) {
    if (!elements.queueList || !elements.queueCount) return;

    elements.queueList.innerHTML = '';

    if (selectedQueue.length === 0) {
        elements.queueList.innerHTML = '<li style="justify-content:center; color:gray;">No students in queue</li>';
        elements.queueCount.textContent = '0 students';
        return;
    }

    elements.queueCount.textContent = `${selectedQueue.length} student${selectedQueue.length !== 1 ? 's' : ''}`;

    selectedQueue.forEach((student, index) => {
        const li = document.createElement('li');
        li.className = 'queue-item-draggable';
        li.draggable = true;
        li.dataset.index = index;

        const data = resolveStudentData(student);

        li.innerHTML = `
            <div style="display: flex; align-items: center; width: 100%; justify-content: space-between;">
                <div style="display: flex; align-items: center; flex-grow: 1;">
                    <i class="fas fa-grip-vertical queue-drag-handle"></i>
                    <div style="margin-right: 10px; font-weight: 600; color: var(--text-secondary); min-width: 20px;">#${index + 1}</div>
                    <div>
                        <div style="font-weight: 500; color: var(--text-main);">${data.name}</div>
                        <div style="font-size: 0.8em; color: var(--text-secondary);">${data.daysOut} Days Out</div>
                    </div>
                </div>
                <button class="queue-remove-btn" data-index="${index}" title="Remove from queue">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Drag events
        li.addEventListener('dragstart', (e) => handleDragStart(e));
        li.addEventListener('dragend', (e) => handleDragEnd(e));
        li.addEventListener('dragover', (e) => handleDragOver(e));
        li.addEventListener('drop', (e) => handleDrop(e, onReorder));
        li.addEventListener('dragleave', (e) => handleDragLeave(e));

        // Remove button
        const removeBtn = li.querySelector('.queue-remove-btn');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onRemove) {
                onRemove(index);
            }
        });

        elements.queueList.appendChild(li);
    });
}

// Drag and drop state
let draggedElement = null;
let draggedIndex = null;

function handleDragStart(e) {
    draggedElement = e.currentTarget;
    draggedIndex = parseInt(e.currentTarget.dataset.index);
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.queue-item-draggable').forEach(item => {
        item.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';

    const afterElement = e.currentTarget;
    if (afterElement !== draggedElement) {
        afterElement.classList.add('drag-over');
    }

    return false;
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e, onReorder) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    const dropIndex = parseInt(e.currentTarget.dataset.index);

    if (draggedIndex !== dropIndex && onReorder) {
        onReorder(draggedIndex, dropIndex);
    }

    return false;
}

/**
 * Opens the version history modal
 */
export function openVersionModal() {
    if (elements.versionModal) {
        elements.versionModal.style.display = 'flex';
    }
}

/**
 * Closes the version history modal
 */
export function closeVersionModal() {
    if (elements.versionModal) {
        elements.versionModal.style.display = 'none';
    }
}

/**
 * Opens the connections modal for a specific connection type
 * @param {string} connectionType - 'excel', 'powerAutomate', or 'canvas'
 */
export function openConnectionsModal(connectionType) {
    if (!elements.connectionsModal) return;

    // Show the modal
    elements.connectionsModal.style.display = 'flex';

    // Hide all configuration content
    if (elements.excelConfigContent) {
        elements.excelConfigContent.style.display = 'none';
    }
    if (elements.powerAutomateConfigContent) {
        elements.powerAutomateConfigContent.style.display = 'none';
    }
    if (elements.canvasConfigContent) {
        elements.canvasConfigContent.style.display = 'none';
    }
    if (elements.five9ConfigContent) {
        elements.five9ConfigContent.style.display = 'none';
    }

    // Show the appropriate configuration content
    if (connectionType === 'excel') {
        if (elements.connectionModalTitle) {
            elements.connectionModalTitle.textContent = 'Excel Add-in Settings';
        }
        if (elements.excelConfigContent) {
            elements.excelConfigContent.style.display = 'block';
        }
    } else if (connectionType === 'powerAutomate') {
        if (elements.connectionModalTitle) {
            elements.connectionModalTitle.textContent = 'Power Automate Settings';
        }
        if (elements.powerAutomateConfigContent) {
            elements.powerAutomateConfigContent.style.display = 'block';
        }
    } else if (connectionType === 'canvas') {
        if (elements.connectionModalTitle) {
            elements.connectionModalTitle.textContent = 'Canvas Settings';
        }
        if (elements.canvasConfigContent) {
            elements.canvasConfigContent.style.display = 'block';
        }
    } else if (connectionType === 'five9') {
        if (elements.connectionModalTitle) {
            elements.connectionModalTitle.textContent = 'Five9 Settings';
        }
        if (elements.five9ConfigContent) {
            elements.five9ConfigContent.style.display = 'block';
        }
    }

    // Load current settings into modal
    chrome.storage.local.get(['autoUpdateMasterList', 'powerAutomateUrl', 'embedInCanvas', 'highlightColor', 'debugMode'], (result) => {
        // Load auto-update setting
        const setting = result.autoUpdateMasterList || 'always';
        if (elements.autoUpdateSelectModal) {
            elements.autoUpdateSelectModal.value = setting;
        }

        // Load Power Automate URL
        const paUrl = result.powerAutomateUrl || '';
        if (elements.powerAutomateUrlInput) {
            elements.powerAutomateUrlInput.value = paUrl;
        }

        // Load Canvas settings
        const embedHelper = result.embedInCanvas !== undefined ? result.embedInCanvas : true;
        updateEmbedHelperModalUI(embedHelper);

        const highlightColor = result.highlightColor || '#ffff00';
        if (elements.highlightColorPickerModal) {
            elements.highlightColorPickerModal.value = highlightColor;
        }

        // Load Five9 settings
        const debugMode = result.debugMode || false;
        updateDebugModeModalUI(debugMode);

        // Load cache stats
        loadCacheStatsForModal();
    });
}

/**
 * Updates the embed helper toggle UI in the modal
 * @param {boolean} isEnabled - Whether embed helper is enabled
 */
function updateEmbedHelperModalUI(isEnabled) {
    if (!elements.embedHelperToggleModal) return;

    if (isEnabled) {
        elements.embedHelperToggleModal.className = 'fas fa-toggle-on';
        elements.embedHelperToggleModal.style.color = 'var(--primary-color)';
    } else {
        elements.embedHelperToggleModal.className = 'fas fa-toggle-off';
        elements.embedHelperToggleModal.style.color = 'gray';
    }
}

/**
 * Updates the debug mode toggle UI in the modal
 * @param {boolean} isEnabled - Whether debug mode is enabled
 */
function updateDebugModeModalUI(isEnabled) {
    if (!elements.debugModeToggleModal) return;

    if (isEnabled) {
        elements.debugModeToggleModal.className = 'fas fa-toggle-on';
        elements.debugModeToggleModal.style.color = 'var(--primary-color)';
    } else {
        elements.debugModeToggleModal.className = 'fas fa-toggle-off';
        elements.debugModeToggleModal.style.color = 'gray';
    }
}

/**
 * Loads cache stats for the modal
 */
async function loadCacheStatsForModal() {
    if (!elements.cacheStatsTextModal) return;

    try {
        const { getCacheStats } = await import('../utils/canvasCache.js');
        const stats = await getCacheStats();
        elements.cacheStatsTextModal.textContent = stats;
    } catch (error) {
        console.error('Error loading cache stats:', error);
        elements.cacheStatsTextModal.textContent = 'Error loading stats';
    }
}

/**
 * Closes the connections modal
 */
export function closeConnectionsModal() {
    if (elements.connectionsModal) {
        elements.connectionsModal.style.display = 'none';
    }
}

/**
 * Saves connections settings from the modal
 */
export async function saveConnectionsSettings() {
    const settingsToSave = {};

    // Save auto-update setting
    if (elements.autoUpdateSelectModal) {
        const newSetting = elements.autoUpdateSelectModal.value;
        settingsToSave.autoUpdateMasterList = newSetting;
        console.log(`Auto-update master list setting saved: ${newSetting}`);
    }

    // Save Power Automate URL
    if (elements.powerAutomateUrlInput) {
        const paUrl = elements.powerAutomateUrlInput.value.trim();
        settingsToSave.powerAutomateUrl = paUrl;
        console.log(`Power Automate URL saved: ${paUrl ? 'URL configured' : 'URL cleared'}`);

        // Update status text immediately
        updatePowerAutomateStatus(paUrl);
    }

    // Save Canvas settings
    if (elements.embedHelperToggleModal) {
        const embedEnabled = elements.embedHelperToggleModal.classList.contains('fa-toggle-on');
        settingsToSave.embedInCanvas = embedEnabled;
        console.log(`Embed Helper setting saved: ${embedEnabled}`);
    }

    if (elements.highlightColorPickerModal) {
        const highlightColor = elements.highlightColorPickerModal.value;
        settingsToSave.highlightColor = highlightColor;
        console.log(`Highlight Color saved: ${highlightColor}`);
    }

    // Save Five9 settings
    if (elements.debugModeToggleModal) {
        const debugEnabled = elements.debugModeToggleModal.classList.contains('fa-toggle-on');
        settingsToSave.debugMode = debugEnabled;
        console.log(`Debug Mode setting saved: ${debugEnabled}`);
    }

    // Save all settings
    await chrome.storage.local.set(settingsToSave);

    // Close modal after saving
    closeConnectionsModal();
}

/**
 * Updates the Power Automate connection status text
 * @param {string} url - The Power Automate URL (empty if not configured)
 */
export function updatePowerAutomateStatus(url) {
    if (!elements.powerAutomateStatusText) return;

    if (url && url.trim()) {
        elements.powerAutomateStatusText.textContent = 'Connected';
        elements.powerAutomateStatusText.style.color = 'green';
        if (elements.powerAutomateStatusDot) {
            elements.powerAutomateStatusDot.style.backgroundColor = '#10b981';
            elements.powerAutomateStatusDot.title = 'Connected';
        }
    } else {
        elements.powerAutomateStatusText.textContent = 'Not configured';
        elements.powerAutomateStatusText.style.color = 'var(--text-secondary)';
        if (elements.powerAutomateStatusDot) {
            elements.powerAutomateStatusDot.style.backgroundColor = '#9ca3af';
            elements.powerAutomateStatusDot.title = 'Not configured';
        }
    }
}

/**
 * Updates the Canvas connection status text based on login state
 */
export async function updateCanvasStatus() {
    if (!elements.canvasStatusText) return;

    try {
        // Check if user is logged in by attempting to fetch current user profile
        const response = await fetch('https://nuc.instructure.com/api/v1/users/self', {
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });

        if (response.ok) {
            // User is logged in
            elements.canvasStatusText.textContent = 'Connected';
            elements.canvasStatusText.style.color = 'green';
            if (elements.canvasStatusDot) {
                elements.canvasStatusDot.style.backgroundColor = '#10b981';
                elements.canvasStatusDot.title = 'Connected';
            }
        } else {
            // Not logged in or authentication failed
            elements.canvasStatusText.textContent = 'No user logged in';
            elements.canvasStatusText.style.color = 'var(--text-secondary)';
            if (elements.canvasStatusDot) {
                elements.canvasStatusDot.style.backgroundColor = '#9ca3af';
                elements.canvasStatusDot.title = 'No user logged in';
            }
        }
    } catch (error) {
        console.error('Error checking Canvas status:', error);
        elements.canvasStatusText.textContent = 'No user logged in';
        elements.canvasStatusText.style.color = 'var(--text-secondary)';
        if (elements.canvasStatusDot) {
            elements.canvasStatusDot.style.backgroundColor = '#9ca3af';
            elements.canvasStatusDot.title = 'No user logged in';
        }
    }
}

/**
 * Toggles the embed helper setting in the modal
 */
export function toggleEmbedHelperModal() {
    if (!elements.embedHelperToggleModal) return;

    const isCurrentlyOn = elements.embedHelperToggleModal.classList.contains('fa-toggle-on');
    updateEmbedHelperModalUI(!isCurrentlyOn);
}

/**
 * Toggles the debug mode setting in the modal
 */
export function toggleDebugModeModal() {
    if (!elements.debugModeToggleModal) return;

    const isCurrentlyOn = elements.debugModeToggleModal.classList.contains('fa-toggle-on');
    updateDebugModeModalUI(!isCurrentlyOn);
}

/**
 * Updates the Five9 connection status text based on active tabs
 */
export async function updateFive9Status() {
    if (!elements.five9StatusText) return;

    try {
        // Check if user has an active Five9 session by querying for Five9 tabs
        const five9Tabs = await chrome.tabs.query({ url: "https://*.five9.com/*" });
        const isConnected = five9Tabs.length > 0;

        if (isConnected) {
            elements.five9StatusText.textContent = 'Connected';
            elements.five9StatusText.style.color = 'green';
            if (elements.five9StatusDot) {
                elements.five9StatusDot.style.backgroundColor = '#10b981';
                elements.five9StatusDot.title = 'Connected';
            }
        } else {
            elements.five9StatusText.textContent = 'Not connected';
            elements.five9StatusText.style.color = 'var(--text-secondary)';
            if (elements.five9StatusDot) {
                elements.five9StatusDot.style.backgroundColor = '#9ca3af';
                elements.five9StatusDot.title = 'Not connected';
            }
        }
    } catch (error) {
        console.error('Error checking Five9 status:', error);
        elements.five9StatusText.textContent = 'Not connected';
        elements.five9StatusText.style.color = 'var(--text-secondary)';
        if (elements.five9StatusDot) {
            elements.five9StatusDot.style.backgroundColor = '#9ca3af';
            elements.five9StatusDot.title = 'Not connected';
        }
    }
}

/**
 * Clears the Canvas API cache from the modal
 */
export async function clearCacheFromModal() {
    try {
        const { clearAllCache } = await import('../utils/canvasCache.js');
        await clearAllCache();

        // Reload stats
        await loadCacheStatsForModal();

        console.log('Canvas API cache cleared from modal');
    } catch (error) {
        console.error('Error clearing cache from modal:', error);
    }
}
