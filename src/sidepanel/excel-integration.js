// Excel Integration - Monitors Excel connection status and displays status indicator
import { STORAGE_KEYS, MESSAGE_TYPES } from '../constants/index.js';

let excelConnectionCheckInterval = null;
let lastExcelConnectionState = 'disconnected'; // 'disconnected', 'searching', 'connected'
let lastOfficeAddinPing = 0; // Timestamp of last Office Add-in communication
let lastConnectorHeartbeat = 0; // Timestamp of last connector heartbeat
const CONNECTION_TIMEOUT = 10000; // 10 seconds without heartbeat = disconnected
const ADDIN_TIMEOUT = 15000; // 15 seconds without Office Add-in ping = searching

/**
 * Excel/SharePoint URL patterns to check for
 */
const EXCEL_URL_PATTERNS = [
    "https://excel.office.com/*",
    "https://*.officeapps.live.com/*",
    "https://*.sharepoint.com/*"
];

/**
 * Checks if Excel/SharePoint tab is currently open
 * @returns {Promise<boolean>}
 */
export async function checkExcelTabOpen() {
    try {
        const tabs = await chrome.tabs.query({ url: EXCEL_URL_PATTERNS });
        return tabs.length > 0;
    } catch (error) {
        console.error("Error checking Excel tab:", error);
        return false;
    }
}

/**
 * Checks if the Office add-in is actually connected by analyzing connector messages
 * @returns {Promise<'connected'|'searching'|'disconnected'>}
 */
export async function checkExcelConnectionStatus() {
    try {
        const hasExcelTab = await checkExcelTabOpen();

        if (!hasExcelTab) {
            // Reset connection state when tabs close
            if (lastOfficeAddinPing > 0) {
                lastOfficeAddinPing = 0;
                console.log('📊 Excel tab closed - resetting connection state');
            }
            return 'disconnected';
        }

        const now = Date.now();
        const hasRecentHeartbeat = (now - lastConnectorHeartbeat) < CONNECTION_TIMEOUT;

        if (!hasRecentHeartbeat) {
            // Excel tab is open but no connector heartbeat
            return 'searching';
        }

        // If we've ever received an add-in ping (and heartbeat is active), consider it connected
        // Office Add-in typically pings once on load, not continuously
        if (lastOfficeAddinPing > 0) {
            return 'connected';
        }

        // Connector is active but Office Add-in has never connected
        return 'searching';

    } catch (error) {
        console.error("Error checking Excel connection status:", error);
        return 'disconnected';
    }
}

/**
 * Handles incoming messages from the Excel connector
 * @param {object} message - The message from the connector
 */
function handleConnectorMessage(message) {
    if (!message || !message.type) return;

    const now = Date.now();

    switch (message.type) {
        case MESSAGE_TYPES.SRK_CONNECTOR_ACTIVE:
            lastConnectorHeartbeat = now;
            console.log('📊 Excel connector activated');
            break;

        case MESSAGE_TYPES.SRK_CONNECTOR_HEARTBEAT:
            lastConnectorHeartbeat = now;
            break;

        case MESSAGE_TYPES.SRK_OFFICE_ADDIN_CONNECTED:
            lastOfficeAddinPing = now;
            lastConnectorHeartbeat = now;
            console.log('✅ Office Add-in connected to Excel connector');
            break;
    }

    // Trigger immediate status update
    updateExcelConnectionIndicator();
}

/**
 * Updates the Excel connection status indicator in the settings page
 */
export async function updateExcelConnectionIndicator() {
    const statusDot = document.getElementById('excelStatusDot');
    const statusText = document.getElementById('excelStatusText');

    if (!statusDot || !statusText) return;

    const status = await checkExcelConnectionStatus();

    // Update UI based on status
    switch (status) {
        case 'connected':
            statusDot.style.backgroundColor = '#22c55e'; // Green
            statusDot.title = 'Connected';
            statusText.textContent = 'Connected';
            statusText.style.color = '#22c55e';
            break;

        case 'searching':
            statusDot.style.backgroundColor = '#eab308'; // Yellow
            statusDot.title = 'Searching...';
            statusText.textContent = 'Searching...';
            statusText.style.color = '#eab308';
            break;

        case 'disconnected':
        default:
            statusDot.style.backgroundColor = '#ef4444'; // Red
            statusDot.title = 'Disconnected';
            statusText.textContent = 'Disconnected';
            statusText.style.color = 'var(--text-secondary)';
            break;
    }

    // Log connection state changes
    if (status !== lastExcelConnectionState) {
        lastExcelConnectionState = status;
        console.log(`📊 Excel connection status changed to: ${status}`);
    }
}

/**
 * Starts monitoring Excel connection status
 * Checks every 3 seconds and listens for connector messages
 */
export function startExcelConnectionMonitor() {
    // Clear any existing interval
    if (excelConnectionCheckInterval) {
        clearInterval(excelConnectionCheckInterval);
    }

    // Set up message listener for connector messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        handleConnectorMessage(message);
    });

    // Initial check
    updateExcelConnectionIndicator();

    // Monitor every 3 seconds
    excelConnectionCheckInterval = setInterval(() => {
        updateExcelConnectionIndicator();
    }, 3000);

    console.log('🔄 Excel connection monitor started');
}

/**
 * Stops monitoring Excel connection status
 */
export function stopExcelConnectionMonitor() {
    if (excelConnectionCheckInterval) {
        clearInterval(excelConnectionCheckInterval);
        excelConnectionCheckInterval = null;
        console.log('⏹️ Excel connection monitor stopped');
    }
}

/**
 * Clean up on page unload
 */
export function cleanup() {
    stopExcelConnectionMonitor();
}
