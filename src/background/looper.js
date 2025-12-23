// [2025-12-10 11:30 AM]
// Version: 18.1
import { STORAGE_KEYS, CHECKER_MODES, ADVANCED_FILTER_REGEX, DEFAULT_SETTINGS, EXTENSION_STATES, MESSAGE_TYPES } from '../constants/index.js';

let isLooping = false;
let batchQueue = [];
let foundUrlCache = new Set();
let currentLoopIndex = 0;
let maxConcurrentRequests = 5; 
let currentCheckerMode = DEFAULT_SETTINGS[STORAGE_KEYS.CHECKER_MODE];
let onCompleteCallback = null;
let onFoundCallback = null;
let onMissingFoundCallback = null;
let activeRequests = 0;

// Progress Tracking Variables
let totalStudents = 0;
let processedCount = 0;

const BATCH_SIZE = 30;
const REQUEST_TIMEOUT_MS = 30000; 

function parseIdsFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const regex = /courses\/(\d+)\/grades\/(\d+)/;
        const match = urlObj.pathname.match(regex);
        if (match) {
            return { 
                origin: urlObj.origin,
                courseId: match[1], 
                studentId: match[2] 
            };
        }
    } catch (e) {
        console.warn('Invalid URL object:', url);
    }
    return null;
}

function getNextPageUrl(linkHeader) {
    if (!linkHeader) return null;
    const links = linkHeader.split(',');
    const nextLink = links.find(link => link.includes('rel="next"'));
    if (!nextLink) return null;
    const match = nextLink.match(/<([^>]+)>/);
    return match ? match[1] : null;
}

async function fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

async function fetchPaged(url, items = []) {
    const headers = {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
    };

    try {
        const response = await fetchWithTimeout(url, { method: 'GET', credentials: 'include', headers });
        
        if (!response.ok) {
            if (items.length > 0) return items;
            throw new Error(`HTTP ${response.status}`);
        }

        const newItems = await response.json();
        const allItems = items.concat(newItems);

        const linkHeader = response.headers.get('Link');
        const nextUrl = getNextPageUrl(linkHeader);

        if (nextUrl) {
            return fetchPaged(nextUrl, allItems);
        }

        return allItems;
    } catch (e) {
        if (e.name === 'AbortError') {
            console.warn("Request timed out - returning partial data.");
            return items;
        }
        throw e;
    }
}

async function fetchBatchData(batch) {
    const firstEntry = batch[0];
    const { origin, courseId } = firstEntry.parsed;
    const studentIds = batch.map(e => e.parsed.studentId);
    
    // 1. Submissions Endpoint
    const idsQuery = studentIds.map(id => `student_ids[]=${id}`).join('&');
    const submissionsEndpoint = `${origin}/api/v1/courses/${courseId}/students/submissions?${idsQuery}&include[]=assignment&per_page=100`;

    // 2. Users Endpoint
    const userIdsQuery = studentIds.map(id => `user_ids[]=${id}`).join('&');
    const usersEndpoint = `${origin}/api/v1/courses/${courseId}/users?${userIdsQuery}&include[]=enrollments&per_page=100`;

    let submissionsData = [];
    let usersData = [];
    let error = null;

    try {
        submissionsData = await fetchPaged(submissionsEndpoint);
    } catch (e) {
        console.error(`Submissions fetch failed for course ${courseId}:`, e);
        return { batch, error: e.message };
    }

    try {
        usersData = await fetchPaged(usersEndpoint);
    } catch (e) {
        console.warn(`Users/Grades fetch failed for course ${courseId} (continuing with blank grades):`, e);
    }

    return { batch, submissionsData, usersData };
}

function logToDebug(level, message) {
    chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.LOG_TO_PANEL,
        level: level,
        args: [message]
    }).catch(() => {});
}

async function processBatchResult(result) {
    if (!result || result.error) return;
    const { batch, submissionsData, usersData } = result;

    const batchResults = [];

    for (const entry of batch) {
        const studentId = parseInt(entry.parsed.studentId, 10);
        
        const studentSubmissions = submissionsData ? submissionsData.filter(sub => sub.user_id === studentId) : [];
        const studentUser = usersData ? usersData.find(u => u.id === studentId) : null;

        if (currentCheckerMode === CHECKER_MODES.MISSING) {
            const studentResult = await analyzeMissingMode(entry, studentSubmissions, studentUser);
            if (studentResult) batchResults.push(studentResult);
        } else {
            await analyzeSubmissionMode(entry, studentSubmissions);
        }
    }

    if (batchResults.length > 0 && onMissingFoundCallback) {
        batchResults.forEach(payload => onMissingFoundCallback(payload));
    }
}

async function analyzeMissingMode(entry, submissions, userObject) {
    const now = new Date();
    const collectedAssignments = [];

    let debugStats = { 
        total: submissions.length, 
        foundMissing: 0 
    };

    let currentGrade = "";
    if (userObject && userObject.enrollments) {
        const enrollment = userObject.enrollments.find(e => e.type === 'StudentEnrollment') || userObject.enrollments[0];
        
        if (enrollment && enrollment.grades) {
            if (enrollment.grades.current_score != null) {
                currentGrade = enrollment.grades.current_score;
            } else if (enrollment.grades.final_score != null) {
                currentGrade = enrollment.grades.final_score;
            } else if (enrollment.grades.current_grade != null) {
                currentGrade = String(enrollment.grades.current_grade).replace(/%/g, ''); 
            }
        }
    }

    submissions.forEach(sub => {
        const dueDate = sub.cached_due_date ? new Date(sub.cached_due_date) : null;

        if (dueDate && dueDate > now) return;

        // Check if score indicates completion (e.g., "complete", "Complete", "COMPLETE")
        const scoreStr = String(sub.score || sub.grade || '').toLowerCase();
        const isComplete = scoreStr === 'complete';

        // Skip assignments marked as complete - they're submitted even if score is 0 or null
        if (isComplete) return;

        const isMissing = (sub.missing === true) ||
                          ((sub.workflow_state === 'unsubmitted' || sub.workflow_state === 'unsubmitted (ungraded)') && (dueDate && dueDate < now)) ||
                          (sub.score === 0);

        if (isMissing) {
            debugStats.foundMissing++;
            collectedAssignments.push({
                title: sub.assignment ? sub.assignment.name : 'Unknown Assignment',
                link: entry.url,
                submissionLink: sub.preview_url || entry.url,
                dueDate: sub.cached_due_date ? new Date(sub.cached_due_date).toLocaleDateString() : 'No Date',
                score: sub.grade || (sub.score !== null ? sub.score : '-'),
                isMissing: isMissing
            });
        }
    });

    if (debugStats.foundMissing > 0) {
        logToDebug('log', `[DEBUG] ${entry.name}: Grade=${currentGrade} | Found ${debugStats.foundMissing}`);
    }

    return {
        studentName: entry.name,
        gradeBook: entry.url,
        currentGrade: currentGrade, 
        count: collectedAssignments.length, 
        duration: "0.2", 
        assignments: collectedAssignments
    };
}

async function analyzeSubmissionMode(entry, submissions) {
    const settings = await chrome.storage.local.get([
        STORAGE_KEYS.CUSTOM_KEYWORD,
        STORAGE_KEYS.USE_SPECIFIC_DATE,
        STORAGE_KEYS.SPECIFIC_SUBMISSION_DATE
    ]);

    let keyword = settings[STORAGE_KEYS.CUSTOM_KEYWORD];
    const isCustomKeyword = !!keyword; // Check if user provided a specific custom keyword

    // Check if using a specific submission date
    const useSpecificDate = settings[STORAGE_KEYS.USE_SPECIFIC_DATE];
    const specificDate = settings[STORAGE_KEYS.SPECIFIC_SUBMISSION_DATE];

    let now = new Date();

    // If using specific date and it's set, use that date instead of today
    if (useSpecificDate && specificDate) {
        now = new Date(specificDate);
        console.log(`%c [LOOPER] Using specific date: ${specificDate} -> ${now}`, 'color: #FF5722; font-weight: bold;');
    }

    if (!keyword) {
        keyword = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).replace(',', '');
    }

    console.log(`%c [LOOPER] Checking ${entry.name} - Keyword: "${keyword}" | Custom: ${isCustomKeyword} | Submissions: ${submissions.length}`, 'color: #00BCD4;');

    let found = false;
    let foundDetails = null;

    for (const sub of submissions) {
        if (sub.submitted_at) {
            const subDate = new Date(sub.submitted_at);
            const subDateStr = subDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).replace(',', '');

            // FIX: If using default date (Today), use strict equality (===) to prevent "Dec 10" matching "Dec 1".
            // If using a custom keyword (e.g. "Dec"), allow .includes() for partial matching.
            let isMatch = false;
            if (isCustomKeyword) {
                isMatch = subDateStr.includes(keyword);
            } else {
                isMatch = subDateStr === keyword;
            }

            console.log(`  [SUB] "${subDateStr}" ${isCustomKeyword ? 'includes' : '==='} "${keyword}" = ${isMatch} | Assignment: ${sub.assignment?.name || 'Unknown'}`);

            if (isMatch) {
                found = true;

                foundDetails = {
                    name: entry.name,
                    time: subDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                    url: entry.url,
                    timestamp: sub.submitted_at,
                    assignment: sub.assignment ? sub.assignment.name : 'Unknown Assignment',
                    syStudentId: entry.SyStudentId || null
                };
                break;
            }
        }
    }

    if (found && foundDetails) {
        console.log('%c [LOOPER] Submission detected!', 'background: #FF9800; color: white; font-weight: bold; padding: 2px 4px;', foundDetails);
        logToDebug('log', `Found submission: ${foundDetails.name} - ${foundDetails.assignment}`);
        if (onFoundCallback) {
            console.log('%c [LOOPER] Calling onFoundCallback', 'background: #9C27B0; color: white; font-weight: bold; padding: 2px 4px;');
            onFoundCallback(foundDetails);
        } else {
            console.warn('[LOOPER] onFoundCallback is not set!');
        }
    }
}

async function loadSettings() {
    const settings = await chrome.storage.local.get([
        STORAGE_KEYS.CONCURRENT_TABS, 
        STORAGE_KEYS.CHECKER_MODE
    ]);
    maxConcurrentRequests = settings[STORAGE_KEYS.CONCURRENT_TABS] || 5;
    currentCheckerMode = settings[STORAGE_KEYS.CHECKER_MODE] || DEFAULT_SETTINGS[STORAGE_KEYS.CHECKER_MODE];
}

function prepareBatches(entries) {
    const courses = {};
    entries.forEach(entry => {
        const parsed = parseIdsFromUrl(entry.url);
        if (parsed) {
            entry.parsed = parsed;
            if (!courses[parsed.courseId]) {
                courses[parsed.courseId] = [];
            }
            courses[parsed.courseId].push(entry);
        }
    });

    const batches = [];
    Object.values(courses).forEach(courseEntries => {
        for (let i = 0; i < courseEntries.length; i += BATCH_SIZE) {
            batches.push(courseEntries.slice(i, i + BATCH_SIZE));
        }
    });

    return batches;
}

// NEW: Core Logic extracted to allow re-runs
async function performLoop() {
    console.log('%c [LOOPER] performLoop() called', 'background: #673AB7; color: white; font-weight: bold; padding: 4px;');

    // Reset state for new cycle
    currentLoopIndex = 0;
    processedCount = 0;
    activeRequests = 0;

    await loadSettings();
    console.log(`[LOOPER] Settings loaded - Mode: ${currentCheckerMode}, Concurrent: ${maxConcurrentRequests}`);

    // 1. Fetch Fresh Data
    const data = await chrome.storage.local.get([
        STORAGE_KEYS.MASTER_ENTRIES,
        STORAGE_KEYS.FOUND_ENTRIES,
        STORAGE_KEYS.LOOPER_DAYS_OUT_FILTER,
        STORAGE_KEYS.SCAN_FILTER_INCLUDE_FAILING
    ]);

    const masterEntries = data[STORAGE_KEYS.MASTER_ENTRIES] || [];
    const foundEntries = data[STORAGE_KEYS.FOUND_ENTRIES] || [];
    const filterText = (data[STORAGE_KEYS.LOOPER_DAYS_OUT_FILTER] || 'all').trim().toLowerCase();
    const includeFailing = data[STORAGE_KEYS.SCAN_FILTER_INCLUDE_FAILING] || false;

    console.log(`[LOOPER] Data loaded - Master: ${masterEntries.length} students, Found: ${foundEntries.length}, Filter: "${filterText}", IncludeFailing: ${includeFailing}`);

    // 2. Re-build Cache
    foundUrlCache = new Set(foundEntries.map(e => e.url).filter(Boolean));

    let filteredList = masterEntries;

    // 3. Apply Filters
    if (filterText !== 'all' && filterText !== '') {
        const match = filterText.match(ADVANCED_FILTER_REGEX);
        if (match) {
            filteredList = masterEntries.filter(entry => {
                const operator = match[1];
                const value = parseInt(match[2], 10);
                const daysout = entry.daysout;

                // Check if student meets days out criteria
                let meetsDaysOutCriteria = false;
                if (daysout != null) {
                    switch (operator) {
                        case '>':  meetsDaysOutCriteria = daysout > value; break;
                        case '<':  meetsDaysOutCriteria = daysout < value; break;
                        case '>=': meetsDaysOutCriteria = daysout >= value; break;
                        case '<=': meetsDaysOutCriteria = daysout <= value; break;
                        case '=':  meetsDaysOutCriteria = daysout === value; break;
                        default:   meetsDaysOutCriteria = false;
                    }
                }

                // Check if student is failing (grade < 60)
                let isFailing = false;
                if (includeFailing && entry.grade != null) {
                    const grade = parseFloat(entry.grade);
                    if (!isNaN(grade) && grade < 60) {
                        isFailing = true;
                    }
                }

                // Include student if they meet days out criteria OR are failing (if toggle is enabled)
                return meetsDaysOutCriteria || isFailing;
            });
        }
    }

    // 4. Remove Already Found Students (Submission Mode)
    if (currentCheckerMode === CHECKER_MODES.SUBMISSION) {
        const initialCount = filteredList.length;
        filteredList = filteredList.filter(entry => !foundUrlCache.has(entry.url));
        if (initialCount !== filteredList.length) {
            console.log(`Skipping ${initialCount - filteredList.length} already found students.`);
        }
    }

    if (filteredList.length === 0) {
        if (currentCheckerMode === CHECKER_MODES.SUBMISSION) {
             console.log("No students to check. Waiting...");
             // Update UI to show 0/0 so user knows it's waiting
             chrome.storage.local.set({ 
                [STORAGE_KEYS.LOOP_STATUS]: { current: 0, total: 0 } 
             });
             // Poll again in 5 seconds (keeps loop alive)
             setTimeout(() => { if (isLooping) performLoop(); }, 5000);
             return;
        }
        console.warn('No students to check (Missing Mode). Stopping.');
        stopLoop();
        return;
    }

    // 5. Build Batches
    totalStudents = filteredList.length;
    batchQueue = prepareBatches(filteredList);

    console.log('%c ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00BCD4;');
    console.log(`%c [LOOPER] Prepared ${batchQueue.length} batches from ${totalStudents} students`, 'background: #00BCD4; color: white; font-weight: bold; padding: 4px;');
    console.log('%c ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00BCD4;');

    // Update UI immediately
    chrome.storage.local.set({
        [STORAGE_KEYS.LOOP_STATUS]: { current: 0, total: totalStudents }
    });

    // 6. Launch
    console.log(`[LOOPER] Launching ${maxConcurrentRequests} concurrent workers...`);
    for (let i = 0; i < maxConcurrentRequests; i++) {
        next();
    }
}

async function next() {
    if (!isLooping) return;

    if (currentLoopIndex >= batchQueue.length) {
        if (activeRequests === 0) finishLoop();
        return;
    }

    if (activeRequests >= maxConcurrentRequests) return;

    const batch = batchQueue[currentLoopIndex];
    currentLoopIndex++;

    processedCount += batch.length;
    
    chrome.storage.local.set({ 
        [STORAGE_KEYS.LOOP_STATUS]: { 
            current: Math.min(processedCount, totalStudents), 
            total: totalStudents 
        } 
    });

    activeRequests++;
    
    fetchBatchData(batch)
        .then(result => processBatchResult(result))
        .finally(() => {
            activeRequests--;
            next(); 
        });

    next();
}

function finishLoop() {
    // Removed old cleanup logic that didn't support refresh
    if (currentCheckerMode === CHECKER_MODES.MISSING) {
        isLooping = false;
        console.log('Batch API Check Completed.');
        chrome.storage.local.remove(STORAGE_KEYS.LOOP_STATUS);
        if (onCompleteCallback) onCompleteCallback();
    } else {
        console.log('Batch API Check Cycle Complete. Restarting...');
        setTimeout(() => {
            if (!isLooping) return;
            // Calls performLoop instead of resetting vars to ensure new Found items are filtered out
            performLoop(); 
        }, 2000);
    }
}

// --- Public Exports ---

export function getActiveTabs() { return new Map(); }
export function addToFoundUrlCache(url) { if (url) foundUrlCache.add(url); }

export async function startLoop(options = {}) {
    if (isLooping && !options.force) {
        console.log('%c [LOOPER] Already running, skipping start', 'color: orange; font-weight: bold;');
        return;
    }

    console.log('%c ═══════════════════════════════════════', 'color: #4CAF50; font-weight: bold;');
    console.log('%c [LOOPER] START BATCH API MODE', 'background: #4CAF50; color: white; font-weight: bold; font-size: 16px; padding: 4px;');
    console.log('%c ═══════════════════════════════════════', 'color: #4CAF50; font-weight: bold;');

    onCompleteCallback = options.onComplete || null;
    onFoundCallback = options.onFound || null;
    onMissingFoundCallback = options.onMissingFound || null;

    console.log('[LOOPER] Callbacks set:', {
        hasOnFound: !!onFoundCallback,
        hasOnComplete: !!onCompleteCallback,
        hasOnMissingFound: !!onMissingFoundCallback
    });

    isLooping = true;
    performLoop(); // Call the logic function
}

export function stopLoop() {
    console.log('%c ═══════════════════════════════════════', 'color: #F44336; font-weight: bold;');
    console.log('%c [LOOPER] STOP API MODE', 'background: #F44336; color: white; font-weight: bold; font-size: 16px; padding: 4px;');
    console.log('%c ═══════════════════════════════════════', 'color: #F44336; font-weight: bold;');

    isLooping = false;
    activeRequests = 0;
    onCompleteCallback = null;
    onFoundCallback = null;
    onMissingFoundCallback = null;
    chrome.storage.local.remove(STORAGE_KEYS.LOOP_STATUS);
}