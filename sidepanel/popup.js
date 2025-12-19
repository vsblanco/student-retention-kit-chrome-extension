// [2025-12-18 09:30 AM]
// Version: 10.16 - Refactored call logic to dedicated callManager.js
import {
    STORAGE_KEYS,
    EXTENSION_STATES,
    CANVAS_DOMAIN,
    GENERIC_AVATAR_URL,
    CSV_FIELD_ALIASES,
    EXPORT_MASTER_LIST_COLUMNS,
    EXPORT_MISSING_ASSIGNMENTS_COLUMNS
} from '../constants.js';
import {
    getCachedData,
    setCachedData,
    getCacheStats,
    clearAllCache
} from '../canvasCache.js';
import CallManager from './callManager.js';

// --- STATE MANAGEMENT ---
let isScanning = false;
let selectedQueue = []; // Tracks multiple selected students
let callManager; // Manages all call-related functionality
let isDebugMode = false; // Controls whether call functionality is enabled

// --- DOM ELEMENTS CACHE ---
const elements = {};

document.addEventListener('DOMContentLoaded', () => {
    // --- Block Text Highlighting Globally ---
    const style = document.createElement('style');
    style.textContent = `
        * {
            -webkit-user-select: none; /* Safari/Chrome */
            user-select: none;
        }
        input, textarea {
            -webkit-user-select: text;
            user-select: text;
        }
    `;
    document.head.appendChild(style);

    cacheDomElements();
    initializeApp();
});

function cacheDomElements() {
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
    
    // Call Tab - Up Next Card (New v10.14)
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
}

async function initializeApp() {
    setupEventListeners();

    // Initialize call manager with UI callbacks
    const uiCallbacks = {
        updateCurrentStudent: (student) => {
            setActiveStudent(student);
        },
        finalizeAutomation: (lastStudent) => {
            // Reset to single-student mode with the last student
            selectedQueue = [lastStudent];
            callManager.updateQueue(selectedQueue);

            // Clear multi-selection visual indicators
            document.querySelectorAll('.glass-list li').forEach(el => el.classList.remove('multi-selected'));

            // Find and highlight the last student in the list
            const listItems = document.querySelectorAll('.glass-list li.expandable');
            listItems.forEach(li => {
                const name = li.getAttribute('data-name');
                if (name === lastStudent.name) {
                    li.classList.add('multi-selected');
                }
            });

            setActiveStudent(lastStudent);
        },
        cancelAutomation: (currentStudent) => {
            // Reset to single-student mode with only the current student
            selectedQueue = [currentStudent];
            callManager.updateQueue(selectedQueue);

            // Clear multi-selection visual indicators
            document.querySelectorAll('.glass-list li').forEach(el => el.classList.remove('multi-selected'));

            // Find and highlight the current student in the list
            const listItems = document.querySelectorAll('.glass-list li.expandable');
            listItems.forEach(li => {
                const name = li.getAttribute('data-name');
                if (name === currentStudent.name) {
                    li.classList.add('multi-selected');
                }
            });

            // Update master list selection
            updateMasterListSelection();

            // Ensure active student is set
            setActiveStudent(currentStudent);
        }
    };
    callManager = new CallManager(elements, uiCallbacks);

    await loadStorageData();
    setActiveStudent(null);
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // --- NEW: DETECT CTRL KEY RELEASE TO SWITCH TAB ---
    document.addEventListener('keyup', (e) => {
        // Check for Control (Windows) or Meta (Mac Command)
        if (e.key === 'Control' || e.key === 'Meta') {
            // Only switch if we have multiple students selected (Automation Mode)
            if (selectedQueue.length > 1) {
                switchTab('contact');
            }
        }
    });
    // --------------------------------------------------

    if (elements.headerSettingsBtn) elements.headerSettingsBtn.addEventListener('click', () => switchTab('settings'));
    
    if (elements.versionText) elements.versionText.addEventListener('click', () => elements.versionModal.style.display = 'flex');
    if (elements.closeVersionBtn) elements.closeVersionBtn.addEventListener('click', () => elements.versionModal.style.display = 'none');

    // Scan Filter Modal
    if (elements.scanFilterBtn) elements.scanFilterBtn.addEventListener('click', openScanFilterModal);
    if (elements.closeScanFilterBtn) elements.closeScanFilterBtn.addEventListener('click', closeScanFilterModal);
    if (elements.failingToggle) elements.failingToggle.addEventListener('click', () => {
        toggleFailingFilter();
        updateScanFilterCount();
    });
    if (elements.daysOutOperator) elements.daysOutOperator.addEventListener('change', updateScanFilterCount);
    if (elements.daysOutValue) elements.daysOutValue.addEventListener('input', updateScanFilterCount);
    if (elements.saveScanFilterBtn) elements.saveScanFilterBtn.addEventListener('click', saveScanFilterSettings);

    // Queue Modal
    if (elements.manageQueueBtn) elements.manageQueueBtn.addEventListener('click', openQueueModal);
    if (elements.closeQueueModalBtn) elements.closeQueueModalBtn.addEventListener('click', closeQueueModal);

    window.addEventListener('click', (e) => {
        if (elements.versionModal && e.target === elements.versionModal) elements.versionModal.style.display = 'none';
        if (elements.scanFilterModal && e.target === elements.scanFilterModal) closeScanFilterModal();
        if (elements.queueModal && e.target === elements.queueModal) closeQueueModal();
    });

    // Cache Management
    if (elements.clearCacheBtn) {
        elements.clearCacheBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to clear all cached Canvas API data? This will require fresh API calls on the next master list update.')) {
                await clearAllCache();
                updateCacheStats();
            }
        });
    }

    // Debug Mode Toggle
    if (elements.debugModeToggle) {
        elements.debugModeToggle.addEventListener('click', toggleDebugMode);
    }

    if (elements.startBtn) elements.startBtn.addEventListener('click', toggleScanState);
    if (elements.clearListBtn) elements.clearListBtn.addEventListener('click', () => chrome.storage.local.set({ [STORAGE_KEYS.FOUND_ENTRIES]: [] }));

    if (elements.foundSearch) {
        elements.foundSearch.addEventListener('input', filterFoundList);
    }

    if (elements.dialBtn) elements.dialBtn.addEventListener('click', () => callManager.toggleCallState());

    // Skip button for automation mode
    if (elements.skipStudentBtn) {
        elements.skipStudentBtn.addEventListener('click', () => {
            if (callManager) {
                callManager.skipToNext();
            }
        });
    }

    const dispositionContainer = document.querySelector('.disposition-grid');
    if (dispositionContainer) {
        dispositionContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.disposition-btn');
            if (!btn) return;
            if (btn.innerText.includes('Other')) elements.otherInputArea.style.display = 'block';
            else callManager.handleDisposition(btn.innerText.trim());
        });
    }

    if (elements.confirmNoteBtn) {
        elements.confirmNoteBtn.addEventListener('click', () => {
            const note = elements.customNote.value;
            callManager.handleDisposition(`Custom Note: ${note}`);
            elements.otherInputArea.style.display = 'none';
            elements.customNote.value = '';
        });
    }

    if (elements.updateMasterBtn) {
        elements.updateMasterBtn.addEventListener('click', async () => {
            if (elements.updateQueueSection) {
                elements.updateQueueSection.style.display = 'block';
                elements.updateQueueSection.scrollIntoView({ behavior: 'smooth' });
                
                resetQueueUI();

                // --- CHECK CLIPBOARD FOR JSON ---
                try {
                    const text = await navigator.clipboard.readText();
                    const trimmed = text ? text.trim() : '';
                    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                        let jsonData;
                        try {
                            jsonData = JSON.parse(trimmed);
                        } catch (e) { /* invalid json */ }

                        if (jsonData && Array.isArray(jsonData) && jsonData.length > 0) {
                            handleJsonClipboardProcess(jsonData);
                            return;
                        }
                    }
                } catch (err) {
                    console.log("Clipboard check failed or empty:", err);
                }
                // -------------------------------------
                
                // Fallback to Standard CSV Upload
                restoreDefaultQueueUI();
                
                const step1 = document.getElementById('step1');
                if(step1) {
                    step1.className = 'queue-item active';
                    step1.querySelector('i').className = 'fas fa-spinner';
                }

                if(elements.studentPopFile) {
                    elements.studentPopFile.click();
                }
            }
        });
    }
    
    if (elements.studentPopFile) {
        elements.studentPopFile.addEventListener('change', (e) => {
            handleFileImport(e.target.files[0]);
        });
    }
    
    if (elements.queueCloseBtn) {
        elements.queueCloseBtn.addEventListener('click', () => {
            elements.updateQueueSection.style.display = 'none';
        });
    }

    if (elements.masterSearch) elements.masterSearch.addEventListener('input', filterMasterList);
    if (elements.sortSelect) elements.sortSelect.addEventListener('change', sortMasterList);
    if (elements.downloadMasterBtn) elements.downloadMasterBtn.addEventListener('click', exportMasterListCSV);
}

// --- FILE IMPORT LOGIC (STEP 1) ---

function handleFileImport(file) {
    if (!file) {
        resetQueueUI();
        return;
    }

    const step1 = document.getElementById('step1');
    const timeSpan = step1.querySelector('.step-time');
    const startTime = Date.now();

    // Determine file type and appropriate reader method
    const isCSV = file.name.toLowerCase().endsWith('.csv');
    const isXLSX = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');

    if (!isCSV && !isXLSX) {
        alert("Unsupported file type. Please use .csv or .xlsx files.");
        resetQueueUI();
        return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        const content = e.target.result;
        let students = [];

        try {
            // Use SheetJS for both CSV and Excel files
            students = parseFileWithSheetJS(content, isCSV);

            if(students.length === 0) {
                throw new Error("No valid student data found (Check header row).");
            }

            const lastUpdated = new Date().toLocaleString();

            chrome.storage.local.set({
                [STORAGE_KEYS.MASTER_ENTRIES]: students,
                [STORAGE_KEYS.LAST_UPDATED]: lastUpdated
            }, () => {
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                step1.className = 'queue-item completed';
                step1.querySelector('i').className = 'fas fa-check';
                timeSpan.textContent = `${duration}s`;

                if(elements.lastUpdatedText) {
                    elements.lastUpdatedText.textContent = lastUpdated;
                }

                renderMasterList(students);

                // --- TRIGGER STEP 2 AUTOMATICALLY ---
                processStep2(students);
            });

        } catch (error) {
            console.error("Error parsing file:", error);
            step1.querySelector('i').className = 'fas fa-times';
            step1.style.color = '#ef4444';
            timeSpan.textContent = 'Error: ' + error.message;
        }

        elements.studentPopFile.value = '';
    };

    // Use appropriate FileReader method based on file type
    // Both CSV and Excel can be read as ArrayBuffer with SheetJS
    if (isCSV) {
        reader.readAsText(file);
    } else if (isXLSX) {
        reader.readAsArrayBuffer(file);
    }
}

// --- SPECIAL JSON IMPORT LOGIC ---

function handleJsonClipboardProcess(data) {
    // 1. UI Setup for JSON Mode
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    const step4 = document.getElementById('step4');

    // Rename Step 1
    if (step1) {
        step1.querySelector('.queue-content').innerHTML = '<i class="fas fa-spinner"></i> Read JSON from Clipboard';
        step1.className = 'queue-item active';
    }
    
    // Hide intermediate steps (skipping API calls)
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'none';

    // Step 4 "Compiling Report"
    
    // Process Data
    setTimeout(async () => {
        const startTime = Date.now();
        
        // Mark Step 1 complete
        if (step1) {
            step1.className = 'queue-item completed';
            step1.querySelector('i').className = 'fas fa-check';
            step1.querySelector('.step-time').textContent = '0.1s';
        }

        // Activate Step 4 (Compiling)
        if (step4) {
            step4.className = 'queue-item active';
            step4.querySelector('i').className = 'fas fa-spinner';
        }

        try {
            // Normalize Data (map various potential formats to internal structure)
            const normalized = data.map(entry => {
                return {
                    name: entry.name || entry.StudentName || 'Unknown',
                    // UPDATED: Mapped 'GradeBook' to internal 'url'
                    url: entry.GradeBook || entry.url || entry.link || null,
                    daysout: parseInt(entry.daysout || entry.DaysOut || 0),
                    missingCount: parseInt(entry.missing || entry.missingCount || entry.Missing || 0),
                    grade: entry.grade || entry.Grade || null,
                    // UPDATED: Mapping PrimaryPhone from JSON (Assuming 'except' was typo for 'accept')
                    phone: entry.phone || entry.Phone || entry.PrimaryPhone || null,
                    // UPDATED: Explicitly capture LDA
                    lda: entry.LDA || entry.lda || null,
                    StudentNumber: entry.StudentNumber || null,
                    SyStudentId: entry.SyStudentId || null,
                    lastSubmission: entry.lastSubmission || null,
                    isNew: entry.isNew || false,
                    Photo: entry.Photo || null
                };
            });

            const lastUpdated = new Date().toLocaleString();
            
            await chrome.storage.local.set({ 
                [STORAGE_KEYS.MASTER_ENTRIES]: normalized,
                [STORAGE_KEYS.LAST_UPDATED]: lastUpdated
            });

            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            
            if (step4) {
                step4.className = 'queue-item completed';
                step4.querySelector('i').className = 'fas fa-check';
                step4.querySelector('.step-time').textContent = `${duration}s`;
            }

            if (elements.lastUpdatedText) {
                elements.lastUpdatedText.textContent = lastUpdated;
            }

            renderMasterList(normalized);

        } catch (e) {
            console.error("JSON Import Error", e);
            if (step4) {
                step4.querySelector('i').className = 'fas fa-times';
                step4.style.color = '#ef4444';
                step4.querySelector('.step-time').textContent = 'Error';
            }
        }
    }, 500); 
}

function restoreDefaultQueueUI() {
    const s1 = document.getElementById('step1');
    const s2 = document.getElementById('step2');
    const s3 = document.getElementById('step3');
    const s4 = document.getElementById('step4');

    if(s1) { 
        s1.style.display = ''; 
        s1.querySelector('.queue-content').innerHTML = '<i class="far fa-circle"></i> Student Population Report'; 
    }
    if(s2) { s2.style.display = ''; }
    if(s3) { s3.style.display = ''; }
    if(s4) { 
        s4.style.display = ''; 
        s4.querySelector('.queue-content').innerHTML = '<i class="far fa-circle"></i> Compiling Report'; 
    }
}

// --- HELPER: PRELOAD IMAGE ---
function preloadImage(url) {
    if (!url) return;
    const img = new Image();
    img.src = url;
}

// --- STEP 2: FETCH CANVAS IDs, COURSES & PHOTOS ---

async function processStep2(students) {
    const step2 = document.getElementById('step2');
    const timeSpan = step2.querySelector('.step-time');

    step2.className = 'queue-item active';
    step2.querySelector('i').className = 'fas fa-spinner';

    const startTime = Date.now();

    try {
        console.log(`[Step 2] Pinging Canvas API: ${CANVAS_DOMAIN}`);
        console.log(`[Step 2] Processing ${students.length} students in batches of 20`);

        const BATCH_SIZE = 20;
        const BATCH_DELAY_MS = 100; // 100ms delay between batches to avoid rate limiting

        let processedCount = 0;
        let cacheHits = 0;
        let apiFetches = 0;
        let updatedStudents = [...students];

        const totalBatches = Math.ceil(updatedStudents.length / BATCH_SIZE);

        for (let i = 0; i < updatedStudents.length; i += BATCH_SIZE) {
            const batch = updatedStudents.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

            console.log(`[Step 2] Processing batch ${batchNumber}/${totalBatches} (students ${i + 1}-${Math.min(i + BATCH_SIZE, updatedStudents.length)})`);

            const promises = batch.map(student => fetchCanvasDetails(student));

            const results = await Promise.all(promises);

            results.forEach((updatedStudent, index) => {
                updatedStudents[i + index] = updatedStudent;
            });

            processedCount += batch.length;
            timeSpan.textContent = `${Math.round((processedCount / updatedStudents.length) * 100)}%`;

            // Add delay between batches (except after the last batch)
            if (i + BATCH_SIZE < updatedStudents.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
        }

        await chrome.storage.local.set({ [STORAGE_KEYS.MASTER_ENTRIES]: updatedStudents });

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        step2.className = 'queue-item completed';
        step2.querySelector('i').className = 'fas fa-check';
        timeSpan.textContent = `${duration}s`;

        console.log(`[Step 2] ✓ Complete in ${duration}s - ${students.length} students processed`);

        renderMasterList(updatedStudents);

        // --- TRIGGER STEP 3 AUTOMATICALLY ---
        processStep3(updatedStudents);

    } catch (error) {
        console.error("[Step 2 Error]", error);
        step2.querySelector('i').className = 'fas fa-times';
        step2.style.color = '#ef4444';
        timeSpan.textContent = 'Error';
    }
}

// --- STEP 3: CHECK MISSING ASSIGNMENTS & GRADES ---

function parseGradebookUrl(url) {
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
        console.warn('Invalid gradebook URL:', url);
    }
    return null;
}

async function fetchPaged(url, items = []) {
    const headers = {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
    };

    try {
        const response = await fetch(url, { method: 'GET', credentials: 'include', headers });

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
        console.warn('Fetch error:', e);
        return items;
    }
}

function getNextPageUrl(linkHeader) {
    if (!linkHeader) return null;
    const links = linkHeader.split(',');
    const nextLink = links.find(link => link.includes('rel="next"'));
    if (!nextLink) return null;
    const match = nextLink.match(/<([^>]+)>/);
    return match ? match[1] : null;
}

async function fetchMissingAssignments(student) {
    if (!student.url) {
        console.log(`[Step 3] ${student.name}: No gradebook URL, skipping`);
        return { ...student, missingCount: 0, missingAssignments: [] };
    }

    const parsed = parseGradebookUrl(student.url);
    if (!parsed) {
        console.warn(`[Step 3] ${student.name}: Failed to parse gradebook URL: ${student.url}`);
        return { ...student, missingCount: 0, missingAssignments: [] };
    }

    const { origin, courseId, studentId } = parsed;

    try {
        // Fetch submissions
        const submissionsUrl = `${origin}/api/v1/courses/${courseId}/students/submissions?student_ids[]=${studentId}&include[]=assignment&per_page=100`;
        const submissions = await fetchPaged(submissionsUrl);

        // Fetch user enrollment data for current grade
        const usersUrl = `${origin}/api/v1/courses/${courseId}/users?user_ids[]=${studentId}&include[]=enrollments&per_page=100`;
        const users = await fetchPaged(usersUrl);
        const userObject = users && users.length > 0 ? users[0] : null;

        // Analyze for missing assignments
        const result = analyzeMissingAssignments(submissions, userObject, student.name);

        if (result.count > 0) {
            console.log(`[Step 3] ${student.name}: Found ${result.count} missing assignment(s), Grade: ${result.currentGrade || 'N/A'}`);
        }

        return {
            ...student,
            missingCount: result.count,
            missingAssignments: result.assignments,
            currentGrade: result.currentGrade
        };

    } catch (e) {
        console.error(`[Step 3] ${student.name}: Error fetching data:`, e);
        return { ...student, missingCount: 0, missingAssignments: [] };
    }
}

function analyzeMissingAssignments(submissions, userObject, studentName) {
    const now = new Date();
    const collectedAssignments = [];

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

        // Skip future assignments (assignments without due dates are included)
        if (dueDate && dueDate > now) return;

        // Check if score indicates completion (e.g., "complete", "Complete", "COMPLETE")
        const scoreStr = String(sub.score || sub.grade || '').toLowerCase();
        const isComplete = scoreStr === 'complete';

        // Skip assignments marked as complete - they're submitted even if score is 0 or null
        if (isComplete) return;

        // Missing if: marked as missing OR unsubmitted + past due OR score is 0
        // NOTE: This matches the exact logic from background/looper.js analyzeMissingMode
        const isMissing = (sub.missing === true) ||
                          ((sub.workflow_state === 'unsubmitted' || sub.workflow_state === 'unsubmitted (ungraded)') && (dueDate && dueDate < now)) ||
                          (sub.score === 0);

        if (isMissing) {
            collectedAssignments.push({
                title: sub.assignment ? sub.assignment.name : 'Unknown Assignment',
                submissionLink: sub.preview_url || '',
                dueDate: sub.cached_due_date ? new Date(sub.cached_due_date).toLocaleDateString() : 'No Date',
                score: sub.grade || (sub.score !== null ? sub.score : '-'),
                workflow_state: sub.workflow_state // Add for debugging
            });
        }
    });

    return {
        currentGrade: currentGrade,
        count: collectedAssignments.length,
        assignments: collectedAssignments
    };
}

async function processStep3(students) {
    const step3 = document.getElementById('step3');
    const timeSpan = step3.querySelector('.step-time');

    step3.className = 'queue-item active';
    step3.querySelector('i').className = 'fas fa-spinner';

    const startTime = Date.now();

    try {
        console.log(`[Step 3] Checking student gradebooks for missing assignments`);
        console.log(`[Step 3] Processing ${students.length} students in batches of 20`);

        const BATCH_SIZE = 20;
        const BATCH_DELAY_MS = 100;

        let processedCount = 0;
        let updatedStudents = [...students];

        const totalBatches = Math.ceil(updatedStudents.length / BATCH_SIZE);

        for (let i = 0; i < updatedStudents.length; i += BATCH_SIZE) {
            const batch = updatedStudents.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

            console.log(`[Step 3] Processing batch ${batchNumber}/${totalBatches} (students ${i + 1}-${Math.min(i + BATCH_SIZE, updatedStudents.length)})`);

            const promises = batch.map(student => fetchMissingAssignments(student));
            const results = await Promise.all(promises);

            results.forEach((updatedStudent, index) => {
                updatedStudents[i + index] = updatedStudent;
            });

            processedCount += batch.length;
            timeSpan.textContent = `${Math.round((processedCount / updatedStudents.length) * 100)}%`;

            // Add delay between batches (except after the last batch)
            if (i + BATCH_SIZE < updatedStudents.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
        }

        // Save updated students with missing assignment data
        await chrome.storage.local.set({ [STORAGE_KEYS.MASTER_ENTRIES]: updatedStudents });

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        step3.className = 'queue-item completed';
        step3.querySelector('i').className = 'fas fa-check';
        timeSpan.textContent = `${duration}s`;

        const totalMissing = updatedStudents.reduce((sum, s) => sum + (s.missingCount || 0), 0);
        console.log(`[Step 3] ✓ Complete in ${duration}s - Found ${totalMissing} total missing assignments`);

        renderMasterList(updatedStudents);

    } catch (error) {
        console.error("[Step 3 Error]", error);
        step3.querySelector('i').className = 'fas fa-times';
        step3.style.color = '#ef4444';
        timeSpan.textContent = 'Error';
    }
}

async function fetchCanvasDetails(student) {
    if (!student.SyStudentId) return student;

    try {
        // Check cache first
        const cachedData = await getCachedData(student.SyStudentId);

        let userData;
        let courses;

        if (cachedData) {
            // Use cached data
            console.log(`✓ Cache hit for ${student.name || student.SyStudentId}`);
            userData = cachedData.userData;
            courses = cachedData.courses;
        } else {
            // Fetch from Canvas API
            console.log(`→ Fetching fresh data for ${student.name || student.SyStudentId}`);

            const userUrl = `${CANVAS_DOMAIN}/api/v1/users/sis_user_id:${student.SyStudentId}`;
            const userResp = await fetch(userUrl, { headers: { 'Accept': 'application/json' } });

            if (!userResp.ok) {
                console.warn(`✗ Failed to fetch user data for ${student.SyStudentId}: ${userResp.status} ${userResp.statusText}`);
                return student;
            }
            userData = await userResp.json();

            const canvasUserId = userData.id;

            if (canvasUserId) {
                const coursesUrl = `${CANVAS_DOMAIN}/api/v1/users/${canvasUserId}/courses?include[]=enrollments&enrollment_state=active&per_page=100`;
                const coursesResp = await fetch(coursesUrl, { headers: { 'Accept': 'application/json' } });

                if (coursesResp.ok) {
                    courses = await coursesResp.json();
                    console.log(`✓ Cached data for ${student.name || student.SyStudentId}`);
                } else {
                    console.warn(`✗ Failed to fetch courses for ${student.SyStudentId}: ${coursesResp.status} ${coursesResp.statusText}`);
                    courses = [];
                }

                // Cache the results (even if courses fetch failed, we have user data)
                await setCachedData(student.SyStudentId, userData, courses);
            }
        }

        // Process userData
        if (userData.name) student.name = userData.name;
        if (userData.sortable_name) student.sortable_name = userData.sortable_name;

        if (userData.avatar_url && userData.avatar_url !== GENERIC_AVATAR_URL) {
            student.Photo = userData.avatar_url;
            preloadImage(userData.avatar_url);
        }

        if (userData.created_at) {
            student.created_at = userData.created_at;
            const createdDate = new Date(userData.created_at);
            const today = new Date();
            const timeDiff = today - createdDate;
            const daysDiff = timeDiff / (1000 * 3600 * 24);

            if (daysDiff < 60) {
                student.isNew = true;
            }
        }

        const canvasUserId = userData.id;

        // Process courses
        if (canvasUserId && courses && courses.length > 0) {
            const now = new Date();
            const validCourses = courses.filter(c => c.name && !c.name.toUpperCase().includes('CAPV'));

            let activeCourse = null;

            activeCourse = validCourses.find(c => {
                if (!c.start_at || !c.end_at) return false;
                const start = new Date(c.start_at);
                const end = new Date(c.end_at);
                return now >= start && now <= end;
            });

            if (!activeCourse && validCourses.length > 0) {
                validCourses.sort((a, b) => {
                    const dateA = a.start_at ? new Date(a.start_at) : new Date(0);
                    const dateB = b.start_at ? new Date(b.start_at) : new Date(0);
                    return dateB - dateA;
                });
                activeCourse = validCourses[0];
            }

            if (activeCourse) {
                student.url = `${CANVAS_DOMAIN}/courses/${activeCourse.id}/grades/${canvasUserId}`;

                if (activeCourse.enrollments && activeCourse.enrollments.length > 0) {
                    const enrollment = activeCourse.enrollments.find(e => e.type === 'StudentEnrollment') || activeCourse.enrollments[0];
                    if (enrollment && enrollment.grades && enrollment.grades.current_score) {
                        student.grade = enrollment.grades.current_score + '%';
                    }
                }
            } else {
                student.url = `${CANVAS_DOMAIN}/users/${canvasUserId}/grades`;
            }
        }

        return student;

    } catch (e) {
        console.error(`✗ Error fetching Canvas details for ${student.SyStudentId}:`, e);
        return student;
    }
}

/**
 * Validates if a string is a valid student name
 * Rejects numeric-only strings and strings containing forward slashes
 */
function isValidStudentName(name) {
    if (!name) return false;
    if (/^\d+$/.test(name)) return false;  // All digits
    if (name.includes('/')) return false;   // Contains date-like patterns
    return true;
}

/**
 * Normalizes a header string by removing quotes and converting to lowercase
 */
function normalizeHeader(header) {
    if (!header) return '';
    return String(header).trim().toLowerCase();
}

/**
 * Finds the column index for a field using aliases
 */
function findColumnIndex(headers, aliases) {
    return headers.findIndex(h => aliases.includes(normalizeHeader(h)));
}

/**
 * Unified parser for both CSV and Excel files using SheetJS
 * @param {String|ArrayBuffer} data - File content (string for CSV, ArrayBuffer for Excel)
 * @param {Boolean} isCSV - True if parsing CSV, false for Excel
 * @returns {Array} Array of student objects
 */
function parseFileWithSheetJS(data, isCSV) {
    try {
        // Check if XLSX library is loaded
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not loaded. Please refresh the page.');
        }

        // Read the file with SheetJS
        let workbook;
        if (isCSV) {
            workbook = XLSX.read(data, { type: 'string' });
        } else {
            workbook = XLSX.read(data, { type: 'array' });
        }

        // Get the first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert sheet to JSON (array of arrays)
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        if (rows.length < 2) {
            return [];
        }

        // Find header row
        let headerRowIndex = -1;
        let headers = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            // Check if this row contains a name-like header
            const hasNameField = row.some(cell =>
                CSV_FIELD_ALIASES.name.includes(normalizeHeader(cell))
            );

            if (hasNameField) {
                headerRowIndex = i;
                headers = row;
                break;
            }
        }

        if (headerRowIndex === -1) {
            return [];
        }

        // Map column indices using aliases
        const columnIndices = {
            name: findColumnIndex(headers, CSV_FIELD_ALIASES.name),
            phone: findColumnIndex(headers, CSV_FIELD_ALIASES.phone),
            grade: findColumnIndex(headers, CSV_FIELD_ALIASES.grade),
            StudentNumber: findColumnIndex(headers, CSV_FIELD_ALIASES.StudentNumber),
            SyStudentId: findColumnIndex(headers, CSV_FIELD_ALIASES.SyStudentId),
            daysOut: findColumnIndex(headers, CSV_FIELD_ALIASES.daysOut)
        };

        // Validate that we at least have a name column
        if (columnIndices.name === -1) {
            return [];
        }

        // Parse data rows
        const students = [];
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const studentName = row[columnIndices.name];
            if (!isValidStudentName(studentName)) continue;

            // Helper to safely get cell value
            const getValue = (field) => {
                const index = columnIndices[field];
                if (index === -1 || index >= row.length) return null;
                const value = row[index];
                return value !== null && value !== undefined ? String(value) : null;
            };

            const entry = {
                name: String(studentName),
                phone: getValue('phone'),
                grade: getValue('grade'),
                StudentNumber: getValue('StudentNumber'),
                SyStudentId: getValue('SyStudentId'),
                daysout: parseInt(getValue('daysOut')) || 0,
                missingCount: 0,
                url: null,
                assignments: []
            };

            students.push(entry);
        }

        return students;

    } catch (error) {
        console.error('Error parsing file with SheetJS:', error);
        throw new Error(`File parsing failed: ${error.message}`);
    }
}

function resetQueueUI() {
    const steps = ['step1', 'step2', 'step3', 'step4'];
    steps.forEach(id => {
        const el = document.getElementById(id);
        if(!el) return;
        el.className = 'queue-item';
        el.querySelector('i').className = 'far fa-circle';
        el.querySelector('.step-time').textContent = '';
        el.style.color = '';
    });
    const totalTimeDisplay = document.getElementById('queueTotalTime');
    if(totalTimeDisplay) totalTimeDisplay.style.display = 'none';
}

// --- LOGIC: STORAGE & RENDERING ---
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
    updateTabBadge('checker', foundEntries.length); // --- UPDATED: Load badge count immediately

    renderMasterList(data[STORAGE_KEYS.MASTER_ENTRIES] || []);

    if (elements.lastUpdatedText && data[STORAGE_KEYS.LAST_UPDATED]) {
        elements.lastUpdatedText.textContent = data[STORAGE_KEYS.LAST_UPDATED];
    }

    updateButtonVisuals(data[STORAGE_KEYS.EXTENSION_STATE] || EXTENSION_STATES.OFF);

    // Load debug mode state
    isDebugMode = data[STORAGE_KEYS.DEBUG_MODE] || false;
    updateDebugModeUI();
    if (callManager) {
        callManager.setDebugMode(isDebugMode);
    }
}

chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEYS.FOUND_ENTRIES]) {
        renderFoundList(changes[STORAGE_KEYS.FOUND_ENTRIES].newValue);
        updateTabBadge('checker', (changes[STORAGE_KEYS.FOUND_ENTRIES].newValue || []).length);
    }
    if (changes[STORAGE_KEYS.MASTER_ENTRIES]) {
        renderMasterList(changes[STORAGE_KEYS.MASTER_ENTRIES].newValue);
    }
    if (changes[STORAGE_KEYS.EXTENSION_STATE]) {
        updateButtonVisuals(changes[STORAGE_KEYS.EXTENSION_STATE].newValue);
    }
});

function updateTabBadge(tabId, count) {
    const badge = document.querySelector(`.tab-button[data-tab="${tabId}"] .badge`);
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// --- HELPER: DATA NORMALIZATION ---
function resolveStudentData(entry) {
    return {
        name: entry.name || 'Unknown Student',
        sortable_name: entry.sortable_name || null,
        phone: entry.phone || null,
        daysOut: parseInt(entry.daysout || 0),
        missing: parseInt(entry.missingCount || 0),
        StudentNumber: entry.StudentNumber || null,
        SyStudentId: entry.SyStudentId || null,
        url: entry.url || null,
        Photo: entry.Photo || null,
        isNew: entry.isNew || false, 
        created_at: entry.created_at || null, 
        timestamp: entry.timestamp || null,
        assignment: entry.assignment || null
    };
}

// --- STUDENT & CALL MANAGEMENT ---

function setActiveStudent(rawEntry) {
    const contactTab = document.getElementById('contact');
    if (!contactTab) return;

    // --- RESET AUTOMATION STYLES WHEN SWITCHING (but not during active automation) ---
    // Only reset if not in active automation mode
    if (!callManager?.automationMode) {
        if (elements.dialBtn) {
            elements.dialBtn.classList.remove('automation');
            elements.dialBtn.innerHTML = '<i class="fas fa-phone"></i>';
        }
        // Call status is managed by callManager.updateCallInterfaceState()
        if (callManager) {
            callManager.updateCallInterfaceState();
        }
        // Hide Up Next Card in standard mode
        if (elements.upNextCard) {
            elements.upNextCard.style.display = 'none';
        }
        // Hide Manage Queue button in single student mode
        if (elements.manageQueueBtn) {
            elements.manageQueueBtn.style.display = 'none';
        }
    }
    // ---------------------------------------------------

    // 1. Handle "No Student Selected" State
    if (!rawEntry) {
        Array.from(contactTab.children).forEach(child => {
            if (child.id === 'contactPlaceholder') {
                child.style.display = 'flex';
            } else if (child.id === 'five9ConnectionIndicator') {
                // Five9 indicator managed separately - don't touch it here
            } else {
                child.style.display = 'none';
            }
        });
        // Update Five9 indicator (will hide it since no student selected)
        updateFive9ConnectionIndicator();
        return;
    }

    // 2. Handle "Student Selected" State
    Array.from(contactTab.children).forEach(child => {
        if (child.id === 'contactPlaceholder') {
            child.style.display = 'none';
        } else if (child.id === 'five9ConnectionIndicator') {
            // Five9 indicator managed separately - don't touch it here
        } else {
            child.style.display = '';
        }
    });

    // Update Five9 indicator (will show if needed)
    updateFive9ConnectionIndicator();

    const data = resolveStudentData(rawEntry);

    const nameParts = data.name.trim().split(/\s+/);
    let initials = '';
    if (nameParts.length > 0) {
        const firstInitial = nameParts[0][0] || '';
        const lastInitial = nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : '';
        initials = (firstInitial + lastInitial).toUpperCase();
        if (!initials) initials = '?';
    }

    const displayPhone = data.phone ? data.phone : "No Phone Listed";

    // AVATAR LOGIC
    if (elements.contactAvatar) {
        elements.contactAvatar.style.color = ''; // Reset potential automation color
        if (data.Photo && data.Photo !== GENERIC_AVATAR_URL) {
            elements.contactAvatar.textContent = '';
            elements.contactAvatar.style.backgroundImage = `url('${data.Photo}')`;
            elements.contactAvatar.style.backgroundSize = 'cover';
            elements.contactAvatar.style.backgroundPosition = 'center';
            elements.contactAvatar.style.backgroundColor = 'transparent';
        } else {
            elements.contactAvatar.style.backgroundImage = 'none';
            elements.contactAvatar.textContent = initials;
            elements.contactAvatar.style.backgroundColor = '#e0e7ff';
        }
    }

    if (elements.contactName) elements.contactName.textContent = data.name;
    if (elements.contactPhone) elements.contactPhone.textContent = displayPhone;

    if (elements.contactDetail) {
        elements.contactDetail.textContent = `${data.daysOut} Days Out`;
        elements.contactDetail.style.display = 'block';
    }

    let colorCode = '#10b981'; 
    if (data.daysOut > 10) colorCode = '#ef4444';
    else if (data.daysOut > 5) colorCode = '#f97316';
    else if (data.daysOut > 2) colorCode = '#f59e0b';

    if (elements.contactCard) {
        elements.contactCard.style.borderLeftColor = colorCode;
    }
}

// --- NEW: MULTI-SELECT HELPERS ---
function toggleMultiSelection(entry, liElement) {
    const index = selectedQueue.findIndex(s => s.name === entry.name);

    if (index > -1) {
        // Deselect
        selectedQueue.splice(index, 1);
        liElement.classList.remove('multi-selected');
    } else {
        // Select
        selectedQueue.push(entry);
        liElement.classList.add('multi-selected');
    }

    // Update call manager's queue reference
    callManager.updateQueue(selectedQueue);

    // Update UI based on queue size
    if (selectedQueue.length === 1) {
        setActiveStudent(selectedQueue[0]); // Revert to single view
    } else if (selectedQueue.length > 1) {
        setAutomationModeUI(); // Switch to Automation View
    } else {
        setActiveStudent(null); // Clear view
    }
}

// --- UPDATED: Uses Gray Color Scheme for Automation Mode ---
function setAutomationModeUI() {
    const contactTab = document.getElementById('contact');
    if (!contactTab) return;

    // Ensure content is visible (hide placeholder)
    Array.from(contactTab.children).forEach(child => {
        if (child.id === 'contactPlaceholder') {
            child.style.display = 'none';
        } else {
            child.style.display = '';
        }
    });

    // 1. Update Contact Card (Placeholder for Batch)
    if (elements.contactName) elements.contactName.textContent = "Automation Mode";
    if (elements.contactDetail) elements.contactDetail.textContent = `${selectedQueue.length} Students Selected`;
    if (elements.contactPhone) elements.contactPhone.textContent = "Multi-Dial Queue";

    // Create/Update visual badge for count
    if (elements.contactAvatar) {
        elements.contactAvatar.textContent = selectedQueue.length;
        elements.contactAvatar.style.backgroundImage = 'none';
        elements.contactAvatar.style.backgroundColor = '#6b7280'; // Updated to Gray
        elements.contactAvatar.style.color = '#ffffff';
    }

    // 2. Transform the Dial Button to Gray
    if (elements.dialBtn) {
        elements.dialBtn.classList.add('automation');
        elements.dialBtn.innerHTML = '<i class="fas fa-robot"></i>'; // Change icon to Robot
    }

    // 3. Update Status Text
    if (elements.callStatusText) {
        elements.callStatusText.innerHTML = `<span class="status-indicator" style="background:#6b7280;"></span> Ready to Auto-Dial`;
    }

    if (elements.contactCard) {
        elements.contactCard.style.borderLeftColor = '#6b7280';
    }

    // 4. Show Manage Queue Button
    if (elements.manageQueueBtn) {
        elements.manageQueueBtn.style.display = 'block';
    }
}

// --- RENDERING LISTS ---

function renderFoundList(rawEntries) {
    if (!elements.foundList) return;
    elements.foundList.innerHTML = '';

    if (!rawEntries || rawEntries.length === 0) {
        elements.foundList.innerHTML = '<li style="justify-content:center; color:gray;">No submissions found yet.</li>';
        return;
    }

    const entries = rawEntries.map(resolveStudentData);
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    entries.forEach(data => {
        const li = document.createElement('li');
        let timeDisplay = 'Just now';
        if (data.timestamp) {
            timeDisplay = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const assignmentTitle = data.assignment || 'Untitled Assignment';

        li.innerHTML = `
            <div style="display: flex; align-items: center; width:100%;">
                <div class="heatmap-indicator heatmap-green"></div>
                <div style="flex-grow:1; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; flex-direction:column;">
                        <span class="student-name" style="font-weight:500; color:var(--primary-color); cursor:pointer;">${data.name}</span>
                        <span style="font-size:0.8em; color:var(--text-secondary);">${assignmentTitle}</span>
                    </div>
                    <span class="timestamp-pill">${timeDisplay}</span>
                </div>
            </div>
        `;
        
        const nameLink = li.querySelector('.student-name');
        nameLink.addEventListener('click', (e) => {
             e.stopPropagation();
             if(data.url) chrome.tabs.create({ url: data.url });
        });
        nameLink.addEventListener('mouseenter', () => nameLink.style.textDecoration = 'underline');
        nameLink.addEventListener('mouseleave', () => nameLink.style.textDecoration = 'none');

        elements.foundList.appendChild(li);
    });
}

function filterFoundList(e) {
    const term = e.target.value.toLowerCase();
    const items = elements.foundList.querySelectorAll('li');
    items.forEach(li => {
        const text = li.textContent.toLowerCase();
        li.style.display = text.includes(term) ? 'flex' : 'none';
    });
}

function renderMasterList(rawEntries) {
    if (!elements.masterList) return;
    elements.masterList.innerHTML = '';

    // --- NEW: UPDATE TOTAL COUNT INDICATOR ---
    if (elements.totalCountText) {
        const count = rawEntries ? rawEntries.length : 0;
        elements.totalCountText.textContent = `Total Students: ${count}`;
    }
    // ----------------------------------------

    if (!rawEntries || rawEntries.length === 0) {
        elements.masterList.innerHTML = '<li style="justify-content:center;">Master list is empty.</li>';
        return;
    }

    rawEntries.forEach(rawEntry => {
        const data = resolveStudentData(rawEntry);
        
        const li = document.createElement('li');
        li.className = 'expandable';
        li.style.cursor = 'pointer'; 
        
        li.setAttribute('data-name', data.name);
        li.setAttribute('data-missing', data.missing);
        li.setAttribute('data-days', data.daysOut);
        li.setAttribute('data-created', data.created_at || '');

        let heatmapClass = data.daysOut > 10 ? 'heatmap-red' : (data.daysOut > 5 ? 'heatmap-orange' : (data.daysOut > 2 ? 'heatmap-yellow' : 'heatmap-green'));

        let missingPillHtml = '';
        if(data.missing > 0) {
            missingPillHtml = `<span class="missing-pill">${data.missing} Missing <i class="fas fa-chevron-down" style="font-size:0.8em; margin-left:4px;"></i></span>`;
        }

        let newTagHtml = '';
        if(data.isNew) {
            newTagHtml = `<span style="background:#e0f2fe; color:#0369a1; font-size:0.7em; padding:2px 6px; border-radius:8px; margin-left:6px; font-weight:bold; border:1px solid #bae6fd;">New</span>`;
        }

        // Build missing assignments details HTML
        let missingDetailsHtml = '<li><em>No missing assignments found.</em></li>';
        if (rawEntry.missingAssignments && rawEntry.missingAssignments.length > 0) {
            missingDetailsHtml = rawEntry.missingAssignments.map(assignment => {
                const linkHtml = assignment.submissionLink
                    ? `<a href="${assignment.submissionLink}" target="_blank" style="color:#2563eb; text-decoration:none;">${assignment.title}</a>`
                    : assignment.title;
                return `<li style="margin-bottom:6px;">
                    ${linkHtml}
                    <div style="font-size:0.9em; color:#6b7280; margin-top:2px;">
                        Due: ${assignment.dueDate} | Score: ${assignment.score}
                    </div>
                </li>`;
            }).join('');
        }

        li.innerHTML = `
            <div style="display: flex; align-items: center; width:100%;">
                <div class="heatmap-indicator ${heatmapClass}"></div>
                <div style="flex-grow:1;">
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <div style="display:flex; align-items:center;">
                            <span class="student-name" style="font-weight: 500; color:var(--text-main); position:relative; z-index:2;">${data.name}</span>
                            ${newTagHtml}
                        </div>
                        ${missingPillHtml}
                    </div>
                    <span style="font-size:0.8em; color:gray;">${data.daysOut} Days Out</span>
                </div>
            </div>
            <div class="missing-details" style="display: none; margin-top: 10px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 8px; cursor: default;">
                <ul style="padding: 0; margin: 0; font-size: 0.85em; color: #4b5563; list-style-type: none;">
                    ${missingDetailsHtml}
                </ul>
            </div>
        `;

        // --- UPDATED CLICK LISTENER FOR MULTI-SELECT ---
        li.addEventListener('click', (e) => {
            // Check for CTRL (Windows) or COMMAND (Mac)
            if (e.ctrlKey || e.metaKey) {
                toggleMultiSelection(rawEntry, li);
            } else {
                // Standard Single Select (Clears previous multi-selection)
                selectedQueue = [rawEntry];
                callManager.updateQueue(selectedQueue);

                // Visually clear other rows
                document.querySelectorAll('.glass-list li').forEach(el => el.classList.remove('multi-selected'));
                li.classList.add('multi-selected');

                setActiveStudent(rawEntry);
                switchTab('contact');
            }
        });

        const nameLink = li.querySelector('.student-name');
        if(nameLink) {
            nameLink.addEventListener('click', (e) => {
                e.stopPropagation(); 
                if(data.url) chrome.tabs.create({ url: data.url });
            });
            nameLink.addEventListener('mouseenter', () => {
                nameLink.style.textDecoration = 'underline';
                nameLink.style.color = 'var(--primary-color)';
            });
            nameLink.addEventListener('mouseleave', () => {
                nameLink.style.textDecoration = 'none';
                nameLink.style.color = 'var(--text-main)';
            });
        }

        const pill = li.querySelector('.missing-pill');
        if(pill) {
            pill.addEventListener('click', (e) => {
                e.stopPropagation(); 
                const details = li.querySelector('.missing-details');
                const icon = pill.querySelector('i');
                if (details) {
                    const isHidden = details.style.display === 'none' || !details.style.display;
                    details.style.display = isHidden ? 'block' : 'none';
                    if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
                }
            });
        }

        const detailsDiv = li.querySelector('.missing-details');
        if(detailsDiv) {
            detailsDiv.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        elements.masterList.appendChild(li);
    });
}

// --- LOGIC: TABS & SCANNER ---
function switchTab(targetId) {
    elements.tabs.forEach(t => t.classList.remove('active'));
    elements.contents.forEach(c => c.classList.remove('active'));

    const targetContent = document.getElementById(targetId);
    if (targetContent) targetContent.classList.add('active');

    const targetTab = document.querySelector(`.tab-button[data-tab="${targetId}"]`);
    if (targetTab) targetTab.classList.add('active');

    // Update cache stats when settings tab is opened
    if (targetId === 'settings') {
        updateCacheStats();
    }
}

function toggleScanState() {
    isScanning = !isScanning;
    const newState = isScanning ? EXTENSION_STATES.ON : EXTENSION_STATES.OFF;
    chrome.storage.local.set({ [STORAGE_KEYS.EXTENSION_STATE]: newState });
}

function updateButtonVisuals(state) {
    if (!elements.startBtn) return;
    isScanning = (state === EXTENSION_STATES.ON);

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

// --- CALL LOGIC NOW HANDLED BY callManager.js ---
// All call-related functions have been moved to the CallManager class

// --- DEBUG MODE MANAGEMENT ---
async function toggleDebugMode() {
    isDebugMode = !isDebugMode;
    await chrome.storage.local.set({ [STORAGE_KEYS.DEBUG_MODE]: isDebugMode });
    updateDebugModeUI();
    if (callManager) {
        callManager.setDebugMode(isDebugMode);
    }
    // Update Five9 connection indicator when debug mode changes
    updateFive9ConnectionIndicator();
}

function updateDebugModeUI() {
    if (!elements.debugModeToggle) return;

    if (isDebugMode) {
        elements.debugModeToggle.className = 'fas fa-toggle-on';
        elements.debugModeToggle.style.color = 'var(--primary-color)';
    } else {
        elements.debugModeToggle.className = 'fas fa-toggle-off';
        elements.debugModeToggle.style.color = 'gray';
    }
}

// --- QUEUE MANAGEMENT MODAL ---
function openQueueModal() {
    if (!elements.queueModal || !elements.queueList) return;

    // Render current queue
    renderQueueModal();

    // Show modal
    elements.queueModal.style.display = 'flex';
}

function closeQueueModal() {
    if (!elements.queueModal) return;
    elements.queueModal.style.display = 'none';
}

function renderQueueModal() {
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
        li.addEventListener('dragstart', handleDragStart);
        li.addEventListener('dragend', handleDragEnd);
        li.addEventListener('dragover', handleDragOver);
        li.addEventListener('drop', handleDrop);
        li.addEventListener('dragleave', handleDragLeave);

        // Remove button
        const removeBtn = li.querySelector('.queue-remove-btn');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromQueue(index);
        });

        elements.queueList.appendChild(li);
    });
}

// --- SCAN FILTER MODAL ---
async function openScanFilterModal() {
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

function closeScanFilterModal() {
    if (!elements.scanFilterModal) return;
    elements.scanFilterModal.style.display = 'none';
}

async function updateScanFilterCount() {
    if (!elements.daysOutOperator || !elements.daysOutValue || !elements.failingToggle || !elements.studentCountValue) return;

    // Get current filter settings from UI
    const operator = elements.daysOutOperator.value;
    const value = parseInt(elements.daysOutValue.value, 10);
    const includeFailing = elements.failingToggle.classList.contains('fa-toggle-on');

    // Get master entries from storage
    const data = await chrome.storage.local.get([STORAGE_KEYS.MASTER_ENTRIES]);
    const masterEntries = data[STORAGE_KEYS.MASTER_ENTRIES] || [];

    // Apply the same filter logic as looper.js
    let filteredCount = 0;

    masterEntries.forEach(entry => {
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
        if (meetsDaysOutCriteria || isFailing) {
            filteredCount++;
        }
    });

    // Update the display
    elements.studentCountValue.textContent = filteredCount;
}

function toggleFailingFilter() {
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

async function saveScanFilterSettings() {
    if (!elements.daysOutOperator || !elements.daysOutValue || !elements.failingToggle) return;

    const operator = elements.daysOutOperator.value;
    const value = elements.daysOutValue.value;
    const daysOutFilter = `${operator}${value}`;
    const includeFailing = elements.failingToggle.classList.contains('fa-toggle-on');

    // Save to storage
    await chrome.storage.local.set({
        [STORAGE_KEYS.SCAN_FILTER_DAYS_OUT]: daysOutFilter,
        [STORAGE_KEYS.SCAN_FILTER_INCLUDE_FAILING]: includeFailing
    });

    // Also update the legacy LOOPER_DAYS_OUT_FILTER for backward compatibility
    await chrome.storage.local.set({
        [STORAGE_KEYS.LOOPER_DAYS_OUT_FILTER]: daysOutFilter
    });

    // Close modal
    closeScanFilterModal();

    // Show confirmation (optional)
    console.log('Scan filter settings saved:', { daysOutFilter, includeFailing });
}

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
    // Remove all drag-over indicators
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

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    const dropIndex = parseInt(e.currentTarget.dataset.index);

    if (draggedIndex !== dropIndex) {
        // Reorder the queue
        const [movedStudent] = selectedQueue.splice(draggedIndex, 1);
        selectedQueue.splice(dropIndex, 0, movedStudent);

        // Update call manager
        callManager.updateQueue(selectedQueue);

        // Update automation mode UI if needed
        if (selectedQueue.length > 1) {
            setAutomationModeUI();
        }

        // Re-render modal
        renderQueueModal();
    }

    return false;
}

function removeFromQueue(index) {
    selectedQueue.splice(index, 1);

    // Update call manager
    callManager.updateQueue(selectedQueue);

    // Update master list visual selection
    updateMasterListSelection();

    // Update UI based on remaining queue size
    if (selectedQueue.length === 0) {
        setActiveStudent(null);
        closeQueueModal();
    } else if (selectedQueue.length === 1) {
        setActiveStudent(selectedQueue[0]);
        closeQueueModal();
    } else {
        setAutomationModeUI();
        renderQueueModal();
    }
}

function updateMasterListSelection() {
    // Clear all selections first
    document.querySelectorAll('.glass-list li.expandable').forEach(el => {
        el.classList.remove('multi-selected');
    });

    // Re-apply selections based on current queue
    const listItems = document.querySelectorAll('.glass-list li.expandable');
    listItems.forEach(li => {
        const name = li.getAttribute('data-name');
        const isInQueue = selectedQueue.some(s => s.name === name);
        if (isInQueue) {
            li.classList.add('multi-selected');
        }
    });
}

// --- LOGIC: FILTER & SORT ---
function filterMasterList(e) {
    const term = e.target.value.toLowerCase();
    const listItems = elements.masterList.querySelectorAll('li.expandable');
    listItems.forEach(li => {
        const name = li.getAttribute('data-name').toLowerCase();
        li.style.display = name.includes(term) ? 'flex' : 'none';
    });
}

function sortMasterList() {
    const criteria = elements.sortSelect.value;
    const listItems = Array.from(elements.masterList.querySelectorAll('li.expandable'));

    listItems.sort((a, b) => {
        if (criteria === 'name') {
            return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));
        } else if (criteria === 'missing') {
            return parseInt(b.getAttribute('data-missing')) - parseInt(a.getAttribute('data-missing'));
        } else if (criteria === 'days') {
            return parseInt(b.getAttribute('data-days')) - parseInt(a.getAttribute('data-days'));
        } else if (criteria === 'newest') {
            const dateA = new Date(a.getAttribute('data-created') || 0);
            const dateB = new Date(b.getAttribute('data-created') || 0);
            return dateB - dateA;
        }
    });
    listItems.forEach(item => elements.masterList.appendChild(item));
}

/**
 * Helper function to get a nested property value from an object
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
}

/**
 * Helper function to get field value with fallback support
 */
function getFieldValue(obj, field, fallback) {
    let value = getNestedValue(obj, field);
    if ((value === null || value === undefined || value === '') && fallback) {
        value = getNestedValue(obj, fallback);
    }
    return value || '';
}

async function exportMasterListCSV() {
    try {
        // Get the full student data from storage
        const result = await chrome.storage.local.get([STORAGE_KEYS.MASTER_ENTRIES]);
        const students = result[STORAGE_KEYS.MASTER_ENTRIES] || [];

        if (students.length === 0) {
            alert('No data to export. Please update the master list first.');
            return;
        }

        // --- SHEET 1: MASTER LIST ---
        // Build header row from configuration
        const masterListHeaders = EXPORT_MASTER_LIST_COLUMNS.map(col => col.header);
        const masterListData = [masterListHeaders];

        // Build data rows using column configuration
        students.forEach(student => {
            const row = EXPORT_MASTER_LIST_COLUMNS.map(col => {
                let value = getFieldValue(student, col.field, col.fallback);

                // Special handling for missingCount and daysout
                if (col.field === 'missingCount') {
                    value = value || 0;
                } else if (col.field === 'daysout') {
                    value = parseInt(value || 0);
                }

                return value;
            });
            masterListData.push(row);
        });

        // --- SHEET 2: MISSING ASSIGNMENTS ---
        // Build header row from configuration
        const missingAssignmentsHeaders = EXPORT_MISSING_ASSIGNMENTS_COLUMNS.map(col => col.header);
        const missingAssignmentsData = [missingAssignmentsHeaders];

        // Build data rows using column configuration
        students.forEach(student => {
            if (student.missingAssignments && student.missingAssignments.length > 0) {
                student.missingAssignments.forEach(assignment => {
                    // Derive assignment link from submission link by removing /submissions/...
                    if (assignment.submissionLink) {
                        assignment.assignmentLink = assignment.submissionLink.replace(/\/submissions\/.*$/, '');
                    }

                    const row = EXPORT_MISSING_ASSIGNMENTS_COLUMNS.map(col => {
                        // Handle student.* and assignment.* field paths
                        if (col.field.startsWith('student.')) {
                            const field = col.field.replace('student.', '');
                            return getFieldValue(student, field, col.fallback?.replace('student.', ''));
                        } else if (col.field.startsWith('assignment.')) {
                            const field = col.field.replace('assignment.', '');
                            return getFieldValue(assignment, field, col.fallback?.replace('assignment.', ''));
                        }
                        return '';
                    });
                    missingAssignmentsData.push(row);
                });
            }
        });

        // Create workbook with both sheets
        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.aoa_to_sheet(masterListData);
        const ws2 = XLSX.utils.aoa_to_sheet(missingAssignmentsData);

        XLSX.utils.book_append_sheet(wb, ws1, 'Master List');
        XLSX.utils.book_append_sheet(wb, ws2, 'Missing Assignments');

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const filename = `student_report_${timestamp}.xlsx`;

        // Download the Excel file
        XLSX.writeFile(wb, filename);

        console.log(`✓ Exported ${students.length} students to Excel file: ${filename}`);
        console.log(`  - Master List: ${EXPORT_MASTER_LIST_COLUMNS.length} columns`);
        console.log(`  - Missing Assignments: ${EXPORT_MISSING_ASSIGNMENTS_COLUMNS.length} columns`);

    } catch (error) {
        console.error('Error exporting to Excel:', error);
        alert('Error creating Excel file. Check console for details.');
    }
}

/**
 * Updates the cache statistics display in the settings tab
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

// ==========================================
// FIVE9 CONNECTION MONITOR
// ==========================================

let five9ConnectionCheckInterval = null;
let lastFive9ConnectionState = false;

/**
 * Checks if Five9 tab is currently open
 * @returns {Promise<boolean>} True if Five9 tab exists
 */
async function checkFive9Connection() {
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

        // Open Microsoft SSO in a hidden/background tab
        const tab = await chrome.tabs.create({
            url: 'https://m365.cloud.microsoft/',
            active: false // Don't switch to this tab
        });

        // Monitor for Five9 tab opening (result of SSO redirect)
        const checkForFive9 = setInterval(async () => {
            const five9Tabs = await chrome.tabs.query({ url: "https://app-atl.five9.com/*" });

            if (five9Tabs.length > 0) {
                // Five9 opened successfully - close the Microsoft tab
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
 * Only shows indicator when:
 * - Debug mode is OFF (live mode requires Five9)
 * - Five9 tab is NOT open
 * - A student is selected (otherwise "No Student Selected" shows)
 */
async function updateFive9ConnectionIndicator() {
    if (!elements.five9ConnectionIndicator) return;

    const isDebugMode = await chrome.storage.local.get(STORAGE_KEYS.DEBUG_MODE)
        .then(data => data[STORAGE_KEYS.DEBUG_MODE] || false);

    const isFive9Connected = await checkFive9Connection();
    const hasStudentSelected = selectedQueue.length > 0;

    // Only show Five9 indicator when:
    // 1. NOT in debug mode (demo mode doesn't need Five9)
    // 2. Five9 is NOT connected
    // 3. A student IS selected (otherwise "No Student Selected" placeholder shows)
    const shouldShowFive9Indicator = !isDebugMode && !isFive9Connected && hasStudentSelected;

    // Auto-connect if needed (only once per session)
    if (shouldShowFive9Indicator && !window.five9AutoConnectAttempted) {
        window.five9AutoConnectAttempted = true;
        autoConnectFive9();
    }

    // Update visibility
    const contactTab = document.getElementById('contact');
    if (contactTab) {
        Array.from(contactTab.children).forEach(child => {
            if (child.id === 'five9ConnectionIndicator') {
                child.style.display = shouldShowFive9Indicator ? 'flex' : 'none';
            } else if (child.id === 'contactPlaceholder') {
                // Keep placeholder logic as is - handled by setActiveStudent
            } else {
                // Hide other content if Five9 indicator is showing
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
function startFive9ConnectionMonitor() {
    // Initial check
    updateFive9ConnectionIndicator();

    // Check every 3 seconds
    five9ConnectionCheckInterval = setInterval(() => {
        updateFive9ConnectionIndicator();
    }, 3000);
}

/**
 * Stops monitoring Five9 connection status
 */
function stopFive9ConnectionMonitor() {
    if (five9ConnectionCheckInterval) {
        clearInterval(five9ConnectionCheckInterval);
        five9ConnectionCheckInterval = null;
    }
}

// Start monitoring when extension loads
startFive9ConnectionMonitor();

// ==========================================
// FIVE9 STATUS LISTENERS
// ==========================================

/**
 * Listen for Five9 call status updates from background.js
 */
chrome.runtime.onMessage.addListener((message, sender) => {
    // Handle Five9 call initiation status
    if (message.type === 'callStatus') {
        if (message.success) {
            console.log("✓ Five9 call initiated successfully");
            // Call UI is already updated by callManager.toggleCallState()
            // This just confirms the API call succeeded
        } else {
            console.error("✗ Five9 call failed:", message.error);
            // Revert call UI state if call failed
            if (callManager && callManager.getCallActiveState()) {
                callManager.toggleCallState(true); // Force end
            }
        }
    }

    // Handle Five9 hangup status
    if (message.type === 'hangupStatus') {
        if (message.success) {
            console.log("✓ Five9 call ended successfully");
            // Call UI is already updated by callManager.toggleCallState()
            // In automation mode, callManager.handleDisposition() moves to next student
        } else {
            console.error("✗ Five9 hangup failed:", message.error);
            // Don't revert UI - user probably wants to try again
        }
    }
});