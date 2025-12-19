// Sidepanel Main - Orchestrates all modules and manages app lifecycle
import { STORAGE_KEYS, EXTENSION_STATES } from '../constants/index.js';
import { hasDispositionCode } from '../constants/dispositions.js';
import { getCacheStats, clearAllCache } from '../utils/canvasCache.js';
import CallManager from './callManager.js';

// Import all module functions
import {
    elements,
    cacheDomElements,
    switchTab,
    updateTabBadge,
    updateButtonVisuals,
    updateDebugModeUI,
    blockTextSelection
} from './ui-manager.js';

import {
    setActiveStudent,
    renderFoundList,
    filterFoundList,
    renderMasterList,
    filterMasterList,
    sortMasterList
} from './student-renderer.js';

import {
    handleFileImport,
    handleJsonClipboardProcess,
    resetQueueUI,
    restoreDefaultQueueUI,
    exportMasterListCSV
} from './file-handler.js';

import { processStep2, processStep3 } from './canvas-integration.js';

import {
    openScanFilterModal,
    closeScanFilterModal,
    updateScanFilterCount,
    toggleFailingFilter,
    saveScanFilterSettings,
    openQueueModal,
    closeQueueModal,
    renderQueueModal,
    openVersionModal,
    closeVersionModal
} from './modal-manager.js';

import { QueueManager } from './queue-manager.js';

import {
    updateFive9ConnectionIndicator,
    startFive9ConnectionMonitor,
    stopFive9ConnectionMonitor,
    setupFive9StatusListeners
} from './five9-integration.js';

// --- STATE MANAGEMENT ---
let isScanning = false;
let callManager;
let queueManager;
let isDebugMode = false;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    blockTextSelection();
    cacheDomElements();
    initializeApp();
});

async function initializeApp() {
    // Initialize call manager with UI callbacks
    const uiCallbacks = {
        updateCurrentStudent: (student) => {
            setActiveStudent(student, callManager);
        },
        finalizeAutomation: (lastStudent) => {
            queueManager.setQueue([lastStudent]);
            setActiveStudent(lastStudent, callManager);
        },
        cancelAutomation: (currentStudent) => {
            queueManager.setQueue([currentStudent]);
            setActiveStudent(currentStudent, callManager);
        }
    };
    callManager = new CallManager(elements, uiCallbacks);

    // Initialize queue manager
    queueManager = new QueueManager(callManager);

    setupEventListeners();
    await loadStorageData();
    setActiveStudent(null, callManager);

    // Start Five9 connection monitoring
    startFive9ConnectionMonitor(() => queueManager.getQueue());

    // Setup Five9 status listeners
    setupFive9StatusListeners(callManager);
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Tab switching
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
            if (tab.dataset.tab === 'settings') {
                updateCacheStats();
            }
        });
    });

    // CTRL key release detection for automation mode
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Control' || e.key === 'Meta') {
            if (queueManager.getLength() > 1) {
                switchTab('contact');
            }
        }
    });

    // Header and modals
    if (elements.headerSettingsBtn) {
        elements.headerSettingsBtn.addEventListener('click', () => switchTab('settings'));
    }

    if (elements.versionText) {
        elements.versionText.addEventListener('click', openVersionModal);
    }

    if (elements.closeVersionBtn) {
        elements.closeVersionBtn.addEventListener('click', closeVersionModal);
    }

    // Scan Filter Modal
    if (elements.scanFilterBtn) {
        elements.scanFilterBtn.addEventListener('click', openScanFilterModal);
    }

    if (elements.closeScanFilterBtn) {
        elements.closeScanFilterBtn.addEventListener('click', closeScanFilterModal);
    }

    if (elements.failingToggle) {
        elements.failingToggle.addEventListener('click', () => {
            toggleFailingFilter();
            updateScanFilterCount();
        });
    }

    if (elements.daysOutOperator) {
        elements.daysOutOperator.addEventListener('change', updateScanFilterCount);
    }

    if (elements.daysOutValue) {
        elements.daysOutValue.addEventListener('input', updateScanFilterCount);
    }

    if (elements.saveScanFilterBtn) {
        elements.saveScanFilterBtn.addEventListener('click', saveScanFilterSettings);
    }

    // Queue Modal
    if (elements.manageQueueBtn) {
        elements.manageQueueBtn.addEventListener('click', () => {
            openQueueModal(
                queueManager.getQueue(),
                (fromIndex, toIndex) => {
                    queueManager.reorderQueue(fromIndex, toIndex);
                    renderQueueModal(
                        queueManager.getQueue(),
                        (fromIdx, toIdx) => queueManager.reorderQueue(fromIdx, toIdx),
                        (index) => handleQueueRemoval(index)
                    );
                },
                (index) => handleQueueRemoval(index)
            );
        });
    }

    if (elements.closeQueueModalBtn) {
        elements.closeQueueModalBtn.addEventListener('click', closeQueueModal);
    }

    // Modal outside click handlers
    window.addEventListener('click', (e) => {
        if (elements.versionModal && e.target === elements.versionModal) {
            closeVersionModal();
        }
        if (elements.scanFilterModal && e.target === elements.scanFilterModal) {
            closeScanFilterModal();
        }
        if (elements.queueModal && e.target === elements.queueModal) {
            closeQueueModal();
        }
    });

    // Cache Management
    if (elements.clearCacheBtn) {
        elements.clearCacheBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to clear all cached Canvas API data?')) {
                await clearAllCache();
                updateCacheStats();
            }
        });
    }

    // Debug Mode Toggle
    if (elements.debugModeToggle) {
        elements.debugModeToggle.addEventListener('click', toggleDebugMode);
    }

    // Checker Tab
    if (elements.startBtn) {
        elements.startBtn.addEventListener('click', toggleScanState);
    }

    if (elements.clearListBtn) {
        elements.clearListBtn.addEventListener('click', () => {
            chrome.storage.local.set({ [STORAGE_KEYS.FOUND_ENTRIES]: [] });
        });
    }

    if (elements.foundSearch) {
        elements.foundSearch.addEventListener('input', filterFoundList);
    }

    // Call Tab
    if (elements.dialBtn) {
        elements.dialBtn.addEventListener('click', () => callManager.toggleCallState());
    }

    if (elements.skipStudentBtn) {
        elements.skipStudentBtn.addEventListener('click', () => {
            if (callManager) {
                callManager.skipToNext();
            }
        });
    }

    // Disposition buttons
    const dispositionContainer = document.querySelector('.disposition-grid');
    if (dispositionContainer) {
        dispositionContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.disposition-btn');
            if (!btn) return;

            if (btn.classList.contains('disabled')) {
                console.warn('This disposition does not have a code set yet.');
                return;
            }

            if (btn.innerText.includes('Other')) {
                elements.otherInputArea.style.display = 'block';
            } else {
                callManager.handleDisposition(btn.innerText.trim());
            }
        });

        initializeDispositionButtons();
    }

    if (elements.confirmNoteBtn) {
        elements.confirmNoteBtn.addEventListener('click', () => {
            const note = elements.customNote.value;
            callManager.handleDisposition(`Custom Note: ${note}`);
            elements.otherInputArea.style.display = 'none';
            elements.customNote.value = '';
        });
    }

    // Data Tab
    if (elements.updateMasterBtn) {
        elements.updateMasterBtn.addEventListener('click', handleUpdateMasterList);
    }

    if (elements.studentPopFile) {
        elements.studentPopFile.addEventListener('change', (e) => {
            handleFileImport(e.target.files[0], (students) => {
                renderMasterList(students, (entry, li, evt) => {
                    queueManager.handleStudentClick(entry, li, evt);
                });
                processStep2(students, (updatedStudents) => {
                    renderMasterList(updatedStudents, (entry, li, evt) => {
                        queueManager.handleStudentClick(entry, li, evt);
                    });
                    processStep3(updatedStudents, (finalStudents) => {
                        renderMasterList(finalStudents, (entry, li, evt) => {
                            queueManager.handleStudentClick(entry, li, evt);
                        });
                    });
                });
            });
        });
    }

    if (elements.queueCloseBtn) {
        elements.queueCloseBtn.addEventListener('click', () => {
            elements.updateQueueSection.style.display = 'none';
        });
    }

    if (elements.masterSearch) {
        elements.masterSearch.addEventListener('input', filterMasterList);
    }

    if (elements.sortSelect) {
        elements.sortSelect.addEventListener('change', sortMasterList);
    }

    if (elements.downloadMasterBtn) {
        elements.downloadMasterBtn.addEventListener('click', exportMasterListCSV);
    }
}

// --- HELPER FUNCTIONS ---

/**
 * Initializes disposition button states
 */
function initializeDispositionButtons() {
    const dispositionButtons = document.querySelectorAll('.disposition-btn');

    dispositionButtons.forEach(btn => {
        const buttonText = btn.innerText.trim();

        if (buttonText.includes('Other')) {
            return;
        }

        if (!hasDispositionCode(buttonText)) {
            btn.classList.add('disabled');
            btn.style.opacity = '0.4';
            btn.style.cursor = 'not-allowed';
            btn.title = 'Disposition code not set - add to constants/dispositions.js';
        } else {
            btn.classList.remove('disabled');
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.title = '';
        }
    });
}

/**
 * Handles queue removal operations
 */
function handleQueueRemoval(index) {
    const result = queueManager.removeFromQueue(index);
    if (result === 'close') {
        closeQueueModal();
    } else if (result === 'refresh') {
        renderQueueModal(
            queueManager.getQueue(),
            (fromIdx, toIdx) => queueManager.reorderQueue(fromIdx, toIdx),
            (idx) => handleQueueRemoval(idx)
        );
    }
}

/**
 * Handles Update Master List button click
 */
async function handleUpdateMasterList() {
    if (elements.updateQueueSection) {
        elements.updateQueueSection.style.display = 'block';
        elements.updateQueueSection.scrollIntoView({ behavior: 'smooth' });

        resetQueueUI();

        // Check clipboard for JSON
        try {
            const text = await navigator.clipboard.readText();
            const trimmed = text ? text.trim() : '';
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                let jsonData;
                try {
                    jsonData = JSON.parse(trimmed);
                } catch (e) { /* invalid json */ }

                if (jsonData && Array.isArray(jsonData) && jsonData.length > 0) {
                    handleJsonClipboardProcess(jsonData, (students) => {
                        renderMasterList(students, (entry, li, evt) => {
                            queueManager.handleStudentClick(entry, li, evt);
                        });
                    });
                    return;
                }
            }
        } catch (err) {
            console.log("Clipboard check failed or empty:", err);
        }

        // Fallback to CSV upload
        restoreDefaultQueueUI();

        const step1 = document.getElementById('step1');
        if (step1) {
            step1.className = 'queue-item active';
            step1.querySelector('i').className = 'fas fa-spinner';
        }

        if (elements.studentPopFile) {
            elements.studentPopFile.click();
        }
    }
}

/**
 * Loads data from storage and updates UI
 */
async function loadStorageData() {
    const data = await chrome.storage.local.get([
        STORAGE_KEYS.FOUND_ENTRIES,
        STORAGE_KEYS.MASTER_ENTRIES,
        STORAGE_KEYS.LAST_UPDATED,
        STORAGE_KEYS.EXTENSION_STATE,
        STORAGE_KEYS.DEBUG_MODE
    ]);

    const foundEntries = data[STORAGE_KEYS.FOUND_ENTRIES] || [];
    renderFoundList(foundEntries);
    updateTabBadge('checker', foundEntries.length);

    renderMasterList(data[STORAGE_KEYS.MASTER_ENTRIES] || [], (entry, li, evt) => {
        queueManager.handleStudentClick(entry, li, evt);
    });

    if (elements.lastUpdatedText && data[STORAGE_KEYS.LAST_UPDATED]) {
        elements.lastUpdatedText.textContent = data[STORAGE_KEYS.LAST_UPDATED];
    }

    updateButtonVisuals(data[STORAGE_KEYS.EXTENSION_STATE] || EXTENSION_STATES.OFF);

    isDebugMode = data[STORAGE_KEYS.DEBUG_MODE] || false;
    updateDebugModeUI(isDebugMode);
    if (callManager) {
        callManager.setDebugMode(isDebugMode);
    }
}

// Storage change listener
chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEYS.FOUND_ENTRIES]) {
        renderFoundList(changes[STORAGE_KEYS.FOUND_ENTRIES].newValue);
        updateTabBadge('checker', (changes[STORAGE_KEYS.FOUND_ENTRIES].newValue || []).length);
    }
    if (changes[STORAGE_KEYS.MASTER_ENTRIES]) {
        renderMasterList(changes[STORAGE_KEYS.MASTER_ENTRIES].newValue, (entry, li, evt) => {
            queueManager.handleStudentClick(entry, li, evt);
        });
    }
    if (changes[STORAGE_KEYS.EXTENSION_STATE]) {
        updateButtonVisuals(changes[STORAGE_KEYS.EXTENSION_STATE].newValue);
    }
});

/**
 * Toggles scanning state
 */
function toggleScanState() {
    isScanning = !isScanning;
    const newState = isScanning ? EXTENSION_STATES.ON : EXTENSION_STATES.OFF;
    chrome.storage.local.set({ [STORAGE_KEYS.EXTENSION_STATE]: newState });
}

/**
 * Toggles debug mode
 */
async function toggleDebugMode() {
    isDebugMode = !isDebugMode;
    await chrome.storage.local.set({ [STORAGE_KEYS.DEBUG_MODE]: isDebugMode });
    updateDebugModeUI(isDebugMode);
    if (callManager) {
        callManager.setDebugMode(isDebugMode);
    }
    updateFive9ConnectionIndicator(queueManager.getQueue());
}

/**
 * Updates cache statistics display
 */
async function updateCacheStats() {
    if (!elements.cacheStatsText) return;

    try {
        const stats = await getCacheStats();

        if (stats.totalEntries === 0) {
            elements.cacheStatsText.textContent = 'No cached data';
        } else {
            const validText = stats.validEntries === 1 ? 'entry' : 'entries';
            const expiredText = stats.expiredEntries > 0
                ? ` (${stats.expiredEntries} expired)`
                : '';
            elements.cacheStatsText.textContent = `${stats.validEntries} valid ${validText}${expiredText}`;
        }
    } catch (error) {
        console.error('Error updating cache stats:', error);
        elements.cacheStatsText.textContent = 'Error loading stats';
    }
}
