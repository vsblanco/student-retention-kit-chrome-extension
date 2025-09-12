/*
* Timestamp: 2025-09-12 17:17 PM
* Version: 8.0
*/

// Centralized configuration for the Submission Checker extension.

/**
 * An enum-like object for the different checker modes.
 */
export const CHECKER_MODES = {
    SUBMISSION: 'submission',
    MISSING: 'missing'
};

/**
 * Keys for data stored in chrome.storage.local.
 */
export const STORAGE_KEYS = {
    EXTENSION_STATE: 'extensionState',
    FOUND_ENTRIES: 'foundEntries',
    MASTER_ENTRIES: 'masterEntries',
    LAST_UPDATED: 'lastUpdated',
    LOOP_STATUS: 'loopStatus',
    CONNECTIONS: 'connections',
    DEBUG_MODE: 'debugMode',
    // Settings
    CHECKER_MODE: 'checkerMode', // <-- NEW
    CONCURRENT_TABS: 'concurrentTabs',
    HIGHLIGHT_COLOR: 'highlightColor',
    CUSTOM_KEYWORD: 'customKeyword',
    LOOPER_DAYS_OUT_FILTER: 'looperDaysOutFilter',
    EMBED_IN_CANVAS: 'embedInCanvas',
};

/**
 * Default values for all extension settings.
 */
export const DEFAULT_SETTINGS = {
    [STORAGE_KEYS.CHECKER_MODE]: CHECKER_MODES.SUBMISSION, // <-- NEW
    [STORAGE_KEYS.CONCURRENT_TABS]: 3,
    [STORAGE_KEYS.HIGHLIGHT_COLOR]: '#ffff00',
    [STORAGE_KEYS.CUSTOM_KEYWORD]: '',
    [STORAGE_KEYS.LOOPER_DAYS_OUT_FILTER]: 'all',
    [STORAGE_KEYS.DEBUG_MODE]: false,
    [STORAGE_KEYS.EMBED_IN_CANVAS]: true,
};

/**
 * Regular expression for parsing advanced filter queries like '>=5' or '<10'.
 */
export const ADVANCED_FILTER_REGEX = /^\s*([><]=?|=)\s*(\d+)\s*$/;

/**
 * SharePoint URL for the "SharePoint" button in the settings tab.
 */
export const SHAREPOINT_URL = "https://edukgroup3_sharepoint.com/sites/SM-StudentServices/SitePages/CollabHome.aspx";

