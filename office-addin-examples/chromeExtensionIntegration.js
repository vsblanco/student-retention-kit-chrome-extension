/**
 * Chrome Extension Integration for Office Add-in
 *
 * This file shows how to send user info to the Chrome extension.
 * Add this to your Office Add-in's main taskpane or commands file.
 */

import { getUserInfoWithFallback, getCachedUserInfo } from './userInfo.js';

/**
 * Sends Office user info to the Chrome extension
 * The Chrome extension will receive and store this data
 *
 * @param {boolean} useCache - Whether to use cached user info (default: true)
 * @returns {Promise<void>}
 */
export async function sendUserInfoToExtension(useCache = true) {
    try {
        console.log('📤 Preparing to send user info to Chrome extension...');

        // Get user information (with caching for performance)
        const userInfo = useCache
            ? await getCachedUserInfo()
            : await getUserInfoWithFallback();

        if (!userInfo) {
            console.error('No user info available to send');
            return;
        }

        console.log('Sending user info to Chrome extension:', {
            name: userInfo.name,
            email: userInfo.email,
            hasUserId: !!userInfo.userId
        });

        // Send to Chrome extension via window.postMessage
        window.postMessage({
            type: "SRK_OFFICE_USER_INFO",
            data: userInfo
        }, "*");

        console.log('✅ User info sent to Chrome extension successfully');

    } catch (error) {
        console.error('❌ Failed to send user info to Chrome extension:', error);

        // Send error notification to extension
        window.postMessage({
            type: "SRK_OFFICE_USER_INFO_ERROR",
            error: {
                message: error.message,
                code: error.code || 'UNKNOWN',
                timestamp: new Date().toISOString()
            }
        }, "*");
    }
}

/**
 * Initializes user info sync with Chrome extension
 * Call this when your add-in loads
 *
 * This function:
 * 1. Sends user info immediately
 * 2. Sets up periodic refresh (optional)
 */
export async function initializeUserInfoSync() {
    console.log('🚀 Initializing user info sync with Chrome extension...');

    // Send user info on initialization
    await sendUserInfoToExtension(false); // Don't use cache on first load

    // Optional: Refresh user info periodically (every 30 minutes)
    // This ensures token doesn't expire and data stays fresh
    const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

    setInterval(async () => {
        console.log('🔄 Refreshing user info (periodic sync)...');
        await sendUserInfoToExtension(false); // Force fresh data
    }, REFRESH_INTERVAL);

    console.log('✅ User info sync initialized');
}

/**
 * Example: Send user info when a specific action occurs
 * (e.g., when user clicks a button or performs an action)
 */
export async function onUserAction() {
    // Your action logic here...

    // Send fresh user info
    await sendUserInfoToExtension(false);
}

// ============================================
// Example Integration in Your Office Add-in
// ============================================

/**
 * EXAMPLE 1: Basic integration in taskpane.js
 *
 * Add this to your main Office Add-in initialization:
 */
/*
import { initializeUserInfoSync } from './chromeExtensionIntegration.js';

Office.onReady((info) => {
    if (info.host === Office.HostType.Excel) {
        console.log('Office Add-in ready in Excel');

        // Initialize user info sync with Chrome extension
        initializeUserInfoSync();

        // Your other initialization code...
        initializeUI();
        loadData();
    }
});
*/

/**
 * EXAMPLE 2: Send user info on button click
 */
/*
import { sendUserInfoToExtension } from './chromeExtensionIntegration.js';

document.getElementById('myButton').addEventListener('click', async () => {
    // Send fresh user info before performing action
    await sendUserInfoToExtension(false);

    // Your button action...
    console.log('Button clicked!');
});
*/

/**
 * EXAMPLE 3: Send user info with master list data
 */
/*
import { getCachedUserInfo } from './userInfo.js';

async function sendMasterListData(students) {
    // Get user info
    const userInfo = await getCachedUserInfo();

    // Include user info in the payload
    window.postMessage({
        type: "SRK_MASTER_LIST_DATA",
        data: {
            sheetName: "Master List",
            students: students,
            totalStudents: students.length,
            timestamp: new Date().toISOString(),
            // Include who sent this data
            sentBy: {
                name: userInfo.name,
                email: userInfo.email,
                userId: userInfo.userId
            }
        }
    }, "*");
}
*/

/**
 * EXAMPLE 4: Complete initialization with error handling
 */
export async function completeInitializationExample() {
    try {
        console.log('Initializing Office Add-in...');

        // Wait for Office to be ready
        await Office.onReady();

        // Initialize user info sync
        await initializeUserInfoSync();

        // Check if Chrome extension is installed
        const extensionInstalled = await checkChromeExtension();

        if (extensionInstalled) {
            console.log('✅ Chrome extension detected and user info sent');
        } else {
            console.warn('⚠️ Chrome extension not detected');
            showInstallExtensionMessage();
        }

        // Continue with other initialization...

    } catch (error) {
        console.error('❌ Initialization failed:', error);
        showErrorMessage('Failed to initialize add-in: ' + error.message);
    }
}

/**
 * Checks if Chrome extension is installed by sending a ping
 * @returns {Promise<boolean>}
 */
function checkChromeExtension() {
    return new Promise((resolve) => {
        // Send ping to extension
        window.postMessage({ type: "SRK_CHECK_EXTENSION" }, "*");

        // Listen for response
        const listener = (event) => {
            if (event.data && event.data.type === "SRK_EXTENSION_INSTALLED") {
                window.removeEventListener("message", listener);
                resolve(true);
            }
        };

        window.addEventListener("message", listener);

        // Timeout after 2 seconds
        setTimeout(() => {
            window.removeEventListener("message", listener);
            resolve(false);
        }, 2000);
    });
}

/**
 * Example UI helper functions
 */
function showInstallExtensionMessage() {
    console.warn('Please install the Student Retention Kit Chrome Extension');
    // Show UI notification to user...
}

function showErrorMessage(message) {
    console.error(message);
    // Show UI error to user...
}
