// File Handler - CSV/Excel import and export functionality
import {
    STORAGE_KEYS,
    CSV_FIELD_ALIASES,
    EXPORT_MASTER_LIST_COLUMNS,
    EXPORT_MISSING_ASSIGNMENTS_COLUMNS
} from '../constants/index.js';
import { elements } from './ui-manager.js';

/**
 * Validates if a string is a valid student name
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
 * @param {String|ArrayBuffer} data - File content
 * @param {Boolean} isCSV - True if parsing CSV, false for Excel
 * @returns {Array} Array of student objects
 */
export function parseFileWithSheetJS(data, isCSV) {
    try {
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not loaded. Please refresh the page.');
        }

        let workbook;
        if (isCSV) {
            workbook = XLSX.read(data, { type: 'string' });
        } else {
            workbook = XLSX.read(data, { type: 'array' });
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
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

/**
 * Handles CSV/Excel file import
 * @param {File} file - The uploaded file
 * @param {Function} onSuccess - Callback after successful import
 */
export function handleFileImport(file, onSuccess) {
    if (!file) {
        resetQueueUI();
        return;
    }

    const step1 = document.getElementById('step1');
    const timeSpan = step1.querySelector('.step-time');
    const startTime = Date.now();

    const isCSV = file.name.toLowerCase().endsWith('.csv');
    const isXLSX = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');

    if (!isCSV && !isXLSX) {
        alert("Unsupported file type. Please use .csv or .xlsx files.");
        resetQueueUI();
        return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
        const content = e.target.result;
        let students = [];

        try {
            students = parseFileWithSheetJS(content, isCSV);

            if (students.length === 0) {
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

                if (elements.lastUpdatedText) {
                    elements.lastUpdatedText.textContent = lastUpdated;
                }

                if (onSuccess) {
                    onSuccess(students);
                }
            });

        } catch (error) {
            console.error("Error parsing file:", error);
            step1.querySelector('i').className = 'fas fa-times';
            step1.style.color = '#ef4444';
            timeSpan.textContent = 'Error: ' + error.message;
        }

        elements.studentPopFile.value = '';
    };

    if (isCSV) {
        reader.readAsText(file);
    } else if (isXLSX) {
        reader.readAsArrayBuffer(file);
    }
}

/**
 * Handles JSON clipboard import
 * @param {Array} data - JSON data from clipboard
 * @param {Function} onSuccess - Callback after successful import
 */
export function handleJsonClipboardProcess(data, onSuccess) {
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    const step4 = document.getElementById('step4');

    // Rename Step 1
    if (step1) {
        step1.querySelector('.queue-content').innerHTML = '<i class="fas fa-spinner"></i> Read JSON from Clipboard';
        step1.className = 'queue-item active';
    }

    // Hide intermediate steps
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'none';

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
            // Normalize Data
            const normalized = data.map(entry => {
                return {
                    name: entry.name || entry.StudentName || 'Unknown',
                    url: entry.GradeBook || entry.url || entry.link || null,
                    daysout: parseInt(entry.daysout || entry.DaysOut || 0),
                    missingCount: parseInt(entry.missing || entry.missingCount || entry.Missing || 0),
                    grade: entry.grade || entry.Grade || null,
                    phone: entry.phone || entry.Phone || entry.PrimaryPhone || null,
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

            if (onSuccess) {
                onSuccess(normalized);
            }

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

/**
 * Resets the queue UI to default state
 */
export function resetQueueUI() {
    const steps = ['step1', 'step2', 'step3', 'step4'];
    steps.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.className = 'queue-item';
        el.querySelector('i').className = 'far fa-circle';
        el.querySelector('.step-time').textContent = '';
        el.style.color = '';
    });
    const totalTimeDisplay = document.getElementById('queueTotalTime');
    if (totalTimeDisplay) totalTimeDisplay.style.display = 'none';
}

/**
 * Restores default queue UI for CSV import
 */
export function restoreDefaultQueueUI() {
    const s1 = document.getElementById('step1');
    const s2 = document.getElementById('step2');
    const s3 = document.getElementById('step3');
    const s4 = document.getElementById('step4');

    if (s1) {
        s1.style.display = '';
        s1.querySelector('.queue-content').innerHTML = '<i class="far fa-circle"></i> Student Population Report';
    }
    if (s2) { s2.style.display = ''; }
    if (s3) { s3.style.display = ''; }
    if (s4) {
        s4.style.display = '';
        s4.querySelector('.queue-content').innerHTML = '<i class="far fa-circle"></i> Compiling Report';
    }
}

/**
 * Helper function to get nested property value from an object
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

/**
 * Exports master list to Excel file with two sheets
 */
export async function exportMasterListCSV() {
    try {
        const result = await chrome.storage.local.get([STORAGE_KEYS.MASTER_ENTRIES]);
        const students = result[STORAGE_KEYS.MASTER_ENTRIES] || [];

        if (students.length === 0) {
            alert('No data to export. Please update the master list first.');
            return;
        }

        // --- SHEET 1: MASTER LIST ---
        const masterListHeaders = EXPORT_MASTER_LIST_COLUMNS.map(col => col.header);
        const masterListData = [masterListHeaders];

        students.forEach(student => {
            const row = EXPORT_MASTER_LIST_COLUMNS.map(col => {
                let value = getFieldValue(student, col.field, col.fallback);

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
        const missingAssignmentsHeaders = EXPORT_MISSING_ASSIGNMENTS_COLUMNS.map(col => col.header);
        const missingAssignmentsData = [missingAssignmentsHeaders];

        students.forEach(student => {
            if (student.missingAssignments && student.missingAssignments.length > 0) {
                student.missingAssignments.forEach(assignment => {
                    if (assignment.submissionLink) {
                        assignment.assignmentLink = assignment.submissionLink.replace(/\/submissions\/.*$/, '');
                    }

                    const row = EXPORT_MISSING_ASSIGNMENTS_COLUMNS.map(col => {
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

        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `student_report_${timestamp}.xlsx`;

        XLSX.writeFile(wb, filename);

        console.log(`✓ Exported ${students.length} students to Excel file: ${filename}`);

    } catch (error) {
        console.error('Error exporting to Excel:', error);
        alert('Error creating Excel file. Check console for details.');
    }
}
