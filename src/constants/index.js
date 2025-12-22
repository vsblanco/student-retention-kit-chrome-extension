// [2025-12-18 09:30 AM]
// Version: 15.0
/*
* Timestamp: 2025-12-18 09:30 AM
* Version: 15.0
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
 * An enum-like object for the possible states of the extension.
 */
export const EXTENSION_STATES = {
    ON: 'on',
    OFF: 'off',
    PAUSED: 'paused'
};

/**
 * An enum-like object for message types sent between components.
 */
export const MESSAGE_TYPES = {
    INSPECTION_RESULT: 'inspectionResult',
    FOUND_SUBMISSION: 'foundSubmission',
    FOUND_MISSING_ASSIGNMENTS: 'foundMissingAssignments',
    MISSING_CHECK_COMPLETED: 'missingCheckCompleted',
    REQUEST_STORED_LOGS: 'requestingStoredLogs',
    STORED_LOGS: 'storedLogs',
    TEST_CONNECTION_PA: 'test-connection-pa',
    CONNECTION_TEST_RESULT: 'connection-test-result',
    SEND_DEBUG_PAYLOAD: 'send-debug-payload',
    TRIGGER_PUSHER: 'trigger-pusher',
    LOG_TO_PANEL: 'logToPanel',
    SHOW_MISSING_ASSIGNMENTS_REPORT: 'showMissingAssignmentsReport',
    UPDATE_SCHEDULE: 'updateSchedule',
    SRK_CONNECTOR_ACTIVE: 'SRK_CONNECTOR_ACTIVE',
    SRK_CONNECTOR_HEARTBEAT: 'SRK_CONNECTOR_HEARTBEAT',
    SRK_OFFICE_ADDIN_CONNECTED: 'SRK_OFFICE_ADDIN_CONNECTED'
};

/**
 * An enum-like object for connection types.
 */
export const CONNECTION_TYPES = {
    POWER_AUTOMATE: 'power-automate',
    PUSHER: 'pusher',
    EXCEL: 'excel'
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
    LATEST_MISSING_REPORT: 'latestMissingReport',
    // Settings
    CHECKER_MODE: 'checkerMode',
    CONCURRENT_TABS: 'concurrentTabs',
    HIGHLIGHT_COLOR: 'highlightColor',
    CUSTOM_KEYWORD: 'customKeyword',
    LOOPER_DAYS_OUT_FILTER: 'looperDaysOutFilter',
    EMBED_IN_CANVAS: 'embedInCanvas',
    SCHEDULED_CHECK_ENABLED: 'scheduledCheckEnabled',
    SCHEDULED_CHECK_TIME: 'scheduledCheckTime',
    SCHEDULED_MASTER_LIST: 'scheduledMasterList',
    INCLUDE_ALL_ASSIGNMENTS: 'includeAllAssignments',
    CANVAS_API_CACHE: 'canvasApiCache',
    // Scan Filter Settings
    SCAN_FILTER_DAYS_OUT: 'scanFilterDaysOut',
    SCAN_FILTER_INCLUDE_FAILING: 'scanFilterIncludeFailing'
};

/**
 * Default values for all extension settings.
 */
export const DEFAULT_SETTINGS = {
    [STORAGE_KEYS.CHECKER_MODE]: CHECKER_MODES.SUBMISSION,
    [STORAGE_KEYS.CONCURRENT_TABS]: 5, // Increased default since API is faster
    [STORAGE_KEYS.HIGHLIGHT_COLOR]: '#ffff00',
    [STORAGE_KEYS.CUSTOM_KEYWORD]: '',
    [STORAGE_KEYS.LOOPER_DAYS_OUT_FILTER]: 'all',
    [STORAGE_KEYS.DEBUG_MODE]: false,
    [STORAGE_KEYS.EMBED_IN_CANVAS]: true,
    [STORAGE_KEYS.SCHEDULED_CHECK_ENABLED]: false,
    [STORAGE_KEYS.SCHEDULED_CHECK_TIME]: '08:00',
    [STORAGE_KEYS.SCHEDULED_MASTER_LIST]: '',
    [STORAGE_KEYS.INCLUDE_ALL_ASSIGNMENTS]: false,
    [STORAGE_KEYS.SCAN_FILTER_DAYS_OUT]: '>=5',
    [STORAGE_KEYS.SCAN_FILTER_INCLUDE_FAILING]: false
};

/**
 * The name for the scheduled alarm.
 */
export const SCHEDULED_ALARM_NAME = 'daily_missing_check';

/**
 * The name for the network recovery alarm.
 */
export const NETWORK_RECOVERY_ALARM_NAME = 'network_recovery_check';

/**
 * Regular expression for parsing advanced filter queries like '>=5' or '<10'.
 */
export const ADVANCED_FILTER_REGEX = /^\s*([><]=?|=)\s*(\d+)\s*$/;

/**
 * SharePoint URL for the "SharePoint" button in the settings tab.
 */
export const SHAREPOINT_URL = "https://edukgroup3_sharepoint.com/sites/SM-StudentServices/SitePages/CollabHome.aspx";

/**
 * Canvas LMS domain URL.
 */
export const CANVAS_DOMAIN = "https://nuc.instructure.com";

/**
 * Generic avatar URL used by Canvas for users without custom avatars.
 */
export const GENERIC_AVATAR_URL = "https://nuc.instructure.com/images/messages/avatar-50.png";

/**
 * CSV field aliases for flexible header matching during file imports.
 * Maps internal field names to acceptable column header variations.
 */
export const CSV_FIELD_ALIASES = {
    name: ['student name', 'name', 'studentname', 'student'],
    phone: ['primaryphone', 'phone', 'phone number', 'mobile', 'cell', 'cell phone', 'contact', 'telephone'],
    grade: ['grade', 'grade level', 'level'],
    StudentNumber: ['studentnumber', 'student id', 'sis id'],
    SyStudentId: ['systudentid', 'student sis'],
    daysOut: ['days out', 'dayssincepriorlda', 'days inactive', 'days']
};

/**
 * Excel Export Column Configurations
 * Modify these arrays to customize what columns appear in the downloaded Excel file.
 */

/**
 * Master List sheet columns
 * Each object defines: { header: 'Column Name', field: 'propertyName', formatter: optional function }
 */
export const EXPORT_MASTER_LIST_COLUMNS = [
    { header: 'Student Name', field: 'name' },
	{ header: 'SyStudentId', field: 'SyStudentId' },
	{ header: 'Student Number', field: 'StudentNumber' },
	{ header: 'Grade Book', field: 'url' },
    { header: 'Missing Assignments', field: 'missingCount' },
    { header: 'Days Out', field: 'daysout' },
    { header: 'Grade', field: 'grade', fallback: 'currentGrade' },
    { header: 'Phone', field: 'phone' },
    
];

/**
 * Missing Assignments sheet columns
 * Use 'student.' prefix for student fields and 'assignment.' prefix for assignment fields
 * Special field 'assignmentLink' is auto-generated from submissionLink
 */
export const EXPORT_MISSING_ASSIGNMENTS_COLUMNS = [
    { header: 'Student Name', field: 'student.name' },
	{ header: 'Grade Book', field: 'student.url' },
	{ header: 'Overall Grade', field: 'student.currentGrade', fallback: 'student.grade' },
    { header: 'Assignment Title', field: 'assignment.title' },
    { header: 'Due Date', field: 'assignment.dueDate' },
    { header: 'Score', field: 'assignment.score' },
    { header: 'Assignment Link', field: 'assignment.assignmentLink' },
    { header: 'Submission Link', field: 'assignment.submissionLink' }
];
