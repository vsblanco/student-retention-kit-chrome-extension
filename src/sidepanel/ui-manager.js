// UI Manager - Handles DOM element caching, tab switching, and UI state updates
import { EXTENSION_STATES } from '../constants/index.js';

// --- DOM ELEMENTS CACHE ---
export const elements = {};

/**
 * Caches all DOM elements for efficient access throughout the app
 */
export function cacheDomElements() {
    // Navigation
    elements.tabs = document.querySelectorAll('.tab-button');
    elements.contents = document.querySelectorAll('.tab-content');

    // Header
    elements.headerSettingsBtn = document.getElementById('headerSettingsBtn');
    elements.versionText = document.getElementById('versionText');

    // Checker Tab
    elements.startBtn = document.getElementById('startBtn');
    elements.startBtnText = document.getElementById('startBtnText');
    elements.startBtnIcon = elements.startBtn ? elements.startBtn.querySelector('i') : null;
    elements.statusDot = document.getElementById('statusDot');
    elements.statusText = document.getElementById('statusText');
    elements.foundList = document.querySelector('#checker .glass-list');
    elements.clearListBtn = document.querySelector('#checker .btn-secondary');
    elements.foundSearch = document.querySelector('#checker input[type="text"]');

    // Call Tab
    elements.dialBtn = document.getElementById('dialBtn');
    elements.callStatusText = document.querySelector('.call-status-bar');
    elements.callTimer = document.querySelector('.call-timer');
    elements.callDispositionSection = document.getElementById('callDispositionSection');
    elements.otherInputArea = document.getElementById('otherInputArea');
    elements.customNote = document.getElementById('customNote');
    elements.confirmNoteBtn = elements.otherInputArea ? elements.otherInputArea.querySelector('.btn-primary') : null;
    elements.dispositionGrid = document.querySelector('.disposition-grid');

    // Call Tab - Up Next Card
    elements.upNextCard = document.getElementById('upNextCard');
    elements.upNextName = document.getElementById('upNextName');
    elements.skipStudentBtn = document.getElementById('skipStudentBtn');

    // Call Tab - Student Card & Placeholder Logic
    const contactTab = document.getElementById('contact');
    if (contactTab) {
        elements.contactCard = contactTab.querySelector('.setting-card');

        // --- INJECT PLACEHOLDER ---
        let placeholder = document.getElementById('contactPlaceholder');
        if (!placeholder) {
            placeholder = document.createElement('div');
            placeholder.id = 'contactPlaceholder';
            placeholder.style.cssText = 'display:none; flex-direction:column; align-items:center; justify-content:flex-start; padding-top:80px; height:100%; min-height:400px; color:#9ca3af; text-align:center; padding-left:20px; padding-right:20px;';
            placeholder.innerHTML = `
                <i class="fas fa-user-graduate" style="font-size:3em; margin-bottom:15px; opacity:0.5;"></i>
                <span style="font-size:1.1em; font-weight:500;">No Student Selected</span>
                <span style="font-size:0.9em; margin-top:5px; color:#6b7280;">Select a student from the Master List<br>to view details and make calls.</span>
            `;
            contactTab.insertBefore(placeholder, contactTab.firstChild);
        }
        elements.contactPlaceholder = placeholder;

        // --- INJECT FIVE9 CONNECTION INDICATOR ---
        let five9Indicator = document.getElementById('five9ConnectionIndicator');
        if (!five9Indicator) {
            five9Indicator = document.createElement('div');
            five9Indicator.id = 'five9ConnectionIndicator';
            five9Indicator.style.cssText = 'display:none; flex-direction:column; align-items:center; justify-content:flex-start; padding-top:80px; height:100%; min-height:400px; color:#6b7280; text-align:center; padding-left:20px; padding-right:20px;';
            five9Indicator.innerHTML = `
                <i class="fas fa-spinner fa-spin" style="font-size:3em; margin-bottom:15px; opacity:0.4;"></i>
                <span style="font-size:1.1em; font-weight:500; color:#374151;">Connecting to Five9...</span>
                <span style="font-size:0.9em; margin-top:5px; color:#6b7280;">Attempting automatic SSO login in background</span>
            `;
            contactTab.insertBefore(five9Indicator, contactTab.firstChild);
        }
        elements.five9ConnectionIndicator = five9Indicator;

        // Cache Card Details
        if (elements.contactCard) {
            elements.contactAvatar = contactTab.querySelector('.setting-card div[style*="border-radius:50%"]');
            const infoContainer = contactTab.querySelector('.setting-card div > div:not([style])');
            if (infoContainer) {
                elements.contactName = infoContainer.children[0];
                elements.contactDetail = infoContainer.children[1];
            } else {
                elements.contactName = contactTab.querySelector('.setting-card div > div:first-child');
                elements.contactDetail = contactTab.querySelector('.setting-card div > div:last-child');
            }
            elements.contactPhone = contactTab.querySelector('.phone-number-display');
        }
    }

    // Data Tab
    elements.masterList = document.getElementById('masterList');
    elements.masterSearch = document.getElementById('masterSearch');
    elements.sortSelect = document.getElementById('sortSelect');
    elements.updateMasterBtn = document.getElementById('updateMasterBtn');
    elements.downloadMasterBtn = document.getElementById('downloadMasterBtn');
    elements.updateQueueSection = document.getElementById('updateQueueSection');
    elements.queueCloseBtn = elements.updateQueueSection ? elements.updateQueueSection.querySelector('.icon-btn') : null;
    elements.lastUpdatedText = document.getElementById('lastUpdatedText');
    elements.totalCountText = document.getElementById('totalCountText');

    // Step 1 File Input
    elements.studentPopFile = document.getElementById('studentPopFile');

    // Modals & Settings
    elements.versionModal = document.getElementById('versionModal');
    elements.closeVersionBtn = document.getElementById('closeVersionBtn');

    // Scan Filter Modal
    elements.scanFilterModal = document.getElementById('scanFilterModal');
    elements.scanFilterBtn = document.getElementById('scanFilterBtn');
    elements.closeScanFilterBtn = document.getElementById('closeScanFilterBtn');
    elements.daysOutOperator = document.getElementById('daysOutOperator');
    elements.daysOutValue = document.getElementById('daysOutValue');
    elements.failingToggle = document.getElementById('failingToggle');
    elements.saveScanFilterBtn = document.getElementById('saveScanFilterBtn');
    elements.studentCountValue = document.getElementById('studentCountValue');

    // Queue Modal
    elements.queueModal = document.getElementById('queueModal');
    elements.closeQueueModalBtn = document.getElementById('closeQueueModalBtn');
    elements.manageQueueBtn = document.getElementById('manageQueueBtn');
    elements.queueList = document.getElementById('queueList');
    elements.queueCount = document.getElementById('queueCount');

    // Cache Management
    elements.cacheStatsText = document.getElementById('cacheStatsText');
    elements.clearCacheBtn = document.getElementById('clearCacheBtn');

    // Debug Mode Toggle
    elements.debugModeToggle = document.getElementById('debugModeToggle');

    // Settings
    elements.embedHelperToggle = document.getElementById('embedHelperToggle');
    elements.highlightColorPicker = document.getElementById('highlightColorPicker');
}

/**
 * Switches to a different tab
 * @param {string} targetId - The ID of the tab to switch to
 */
export function switchTab(targetId) {
    elements.tabs.forEach(t => t.classList.remove('active'));
    elements.contents.forEach(c => c.classList.remove('active'));

    const targetContent = document.getElementById(targetId);
    if (targetContent) targetContent.classList.add('active');

    const targetTab = document.querySelector(`.tab-button[data-tab="${targetId}"]`);
    if (targetTab) targetTab.classList.add('active');
}

/**
 * Updates the badge count on a tab
 * @param {string} tabId - The tab ID
 * @param {number} count - The count to display
 */
export function updateTabBadge(tabId, count) {
    const badge = document.querySelector(`.tab-button[data-tab="${tabId}"] .badge`);
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

/**
 * Updates the start/stop button visuals based on scanning state
 * @param {string} state - The extension state (ON or OFF)
 */
export function updateButtonVisuals(state) {
    if (!elements.startBtn) return;
    const isScanning = (state === EXTENSION_STATES.ON);

    if (isScanning) {
        elements.startBtn.style.background = '#ef4444';
        elements.startBtnText.textContent = 'Stop';
        elements.startBtnIcon.className = 'fas fa-stop';
        elements.statusDot.style.background = '#10b981';
        elements.statusDot.style.animation = 'pulse 2s infinite';
        elements.statusText.textContent = 'Monitoring...';
    } else {
        elements.startBtn.style.background = 'rgba(0, 90, 156, 0.7)';
        elements.startBtnText.textContent = 'Start';
        elements.startBtnIcon.className = 'fas fa-play';
        elements.statusDot.style.background = '#cbd5e1';
        elements.statusDot.style.animation = 'none';
        elements.statusText.textContent = 'Ready to Scan';
    }
}

/**
 * Updates debug mode toggle UI
 * @param {boolean} isDebugMode - Whether debug mode is enabled
 */
export function updateDebugModeUI(isDebugMode) {
    if (!elements.debugModeToggle) return;

    if (isDebugMode) {
        elements.debugModeToggle.className = 'fas fa-toggle-on';
        elements.debugModeToggle.style.color = 'var(--primary-color)';
    } else {
        elements.debugModeToggle.className = 'fas fa-toggle-off';
        elements.debugModeToggle.style.color = 'gray';
    }
}

/**
 * Updates embed helper toggle UI
 * @param {boolean} isEnabled - Whether embed helper is enabled
 */
export function updateEmbedHelperUI(isEnabled) {
    if (!elements.embedHelperToggle) return;

    if (isEnabled) {
        elements.embedHelperToggle.className = 'fas fa-toggle-on';
        elements.embedHelperToggle.style.color = 'var(--primary-color)';
    } else {
        elements.embedHelperToggle.className = 'fas fa-toggle-off';
        elements.embedHelperToggle.style.color = 'gray';
    }
}

/**
 * Updates highlight color picker UI
 * @param {string} color - The highlight color (hex format)
 */
export function updateHighlightColorUI(color) {
    if (!elements.highlightColorPicker) return;
    elements.highlightColorPicker.value = color;
}

/**
 * Blocks text selection globally (except for inputs/textareas)
 */
export function blockTextSelection() {
    const style = document.createElement('style');
    style.textContent = `
        * {
            -webkit-user-select: none;
            user-select: none;
        }
        input, textarea {
            -webkit-user-select: text;
            user-select: text;
        }
    `;
    document.head.appendChild(style);
}
