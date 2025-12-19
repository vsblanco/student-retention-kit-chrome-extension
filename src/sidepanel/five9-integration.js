// Five9 Integration - Monitors Five9 connection status and handles auto-connect
import { STORAGE_KEYS } from '../constants/index.js';
import { elements } from './ui-manager.js';

let five9ConnectionCheckInterval = null;
let lastFive9ConnectionState = false;
let autoConnectAttempted = false;

/**
 * Checks if Five9 tab is currently open
 * @returns {Promise<boolean>}
 */
export async function checkFive9Connection() {
    try {
        const tabs = await chrome.tabs.query({ url: "https://app-atl.five9.com/*" });
        return tabs.length > 0;
    } catch (error) {
        console.error("Error checking Five9 connection:", error);
        return false;
    }
}

/**
 * Attempts to auto-connect to Five9 via background SSO
 */
async function autoConnectFive9() {
    try {
        console.log("🔄 Attempting background Five9 SSO connection...");

        const tab = await chrome.tabs.create({
            url: 'https://m365.cloud.microsoft/',
            active: false
        });

        // Monitor for Five9 tab opening
        const checkForFive9 = setInterval(async () => {
            const five9Tabs = await chrome.tabs.query({ url: "https://app-atl.five9.com/*" });

            if (five9Tabs.length > 0) {
                clearInterval(checkForFive9);
                try {
                    await chrome.tabs.remove(tab.id);
                    console.log("✅ Five9 SSO successful - Microsoft tab closed");
                } catch (e) {
                    // Tab might already be closed
                }
            }
        }, 1000);

        // Stop checking after 30 seconds
        setTimeout(() => {
            clearInterval(checkForFive9);
        }, 30000);

    } catch (error) {
        console.error("❌ Auto-connect failed:", error);
    }
}

/**
 * Updates the Five9 connection indicator visibility
 * Only shows when debug mode is OFF, Five9 is NOT connected, and student is selected
 */
export async function updateFive9ConnectionIndicator(selectedQueue) {
    if (!elements.five9ConnectionIndicator) return;

    const isDebugMode = await chrome.storage.local.get(STORAGE_KEYS.DEBUG_MODE)
        .then(data => data[STORAGE_KEYS.DEBUG_MODE] || false);

    const isFive9Connected = await checkFive9Connection();
    const hasStudentSelected = selectedQueue && selectedQueue.length > 0;

    const shouldShowFive9Indicator = !isDebugMode && !isFive9Connected && hasStudentSelected;

    // Auto-connect if needed (only once per session)
    if (shouldShowFive9Indicator && !autoConnectAttempted) {
        autoConnectAttempted = true;
        autoConnectFive9();
    }

    // Update visibility
    const contactTab = document.getElementById('contact');
    if (contactTab) {
        Array.from(contactTab.children).forEach(child => {
            if (child.id === 'five9ConnectionIndicator') {
                child.style.display = shouldShowFive9Indicator ? 'flex' : 'none';
            } else if (child.id === 'contactPlaceholder') {
                // Keep placeholder logic as is
            } else {
                if (shouldShowFive9Indicator) {
                    child.style.display = 'none';
                }
            }
        });
    }

    // Log connection state changes
    if (isFive9Connected !== lastFive9ConnectionState) {
        lastFive9ConnectionState = isFive9Connected;
        if (isFive9Connected) {
            console.log("✅ Five9 connected");
        } else {
            console.log("❌ Five9 disconnected");
        }
    }
}

/**
 * Starts monitoring Five9 connection status
 */
export function startFive9ConnectionMonitor(getSelectedQueue) {
    // Initial check
    if (getSelectedQueue) {
        updateFive9ConnectionIndicator(getSelectedQueue());
    }

    // Check every 3 seconds
    five9ConnectionCheckInterval = setInterval(() => {
        if (getSelectedQueue) {
            updateFive9ConnectionIndicator(getSelectedQueue());
        }
    }, 3000);
}

/**
 * Stops monitoring Five9 connection status
 */
export function stopFive9ConnectionMonitor() {
    if (five9ConnectionCheckInterval) {
        clearInterval(five9ConnectionCheckInterval);
        five9ConnectionCheckInterval = null;
    }
}

/**
 * Resets the auto-connect flag (useful for testing)
 */
export function resetAutoConnectFlag() {
    autoConnectAttempted = false;
}

/**
 * Setup Five9 status listeners from background.js
 */
export function setupFive9StatusListeners(callManager) {
    chrome.runtime.onMessage.addListener((message, sender) => {
        // Handle Five9 call initiation status
        if (message.type === 'callStatus') {
            if (message.success) {
                console.log("✓ Five9 call initiated successfully");
            } else {
                console.error("✗ Five9 call failed:", message.error);
                // Revert call UI state if call failed
                if (callManager && callManager.getCallActiveState()) {
                    callManager.toggleCallState(true);
                }
            }
        }

        // Handle Five9 hangup status
        if (message.type === 'hangupStatus') {
            if (message.success) {
                console.log("✓ Five9 call ended successfully");
            } else {
                console.error("✗ Five9 hangup failed:", message.error);
            }
        }
    });
}
