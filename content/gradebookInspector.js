// [2025-09-15]
// Version: 10.3
// Note: This content script cannot use ES6 modules, so constants are redefined here.

const CHECKER_MODES = {
    SUBMISSION: 'submission',
    MISSING: 'missing'
};

const EXTENSION_STATES = {
    ON: 'on',
    OFF: 'off'
};

const MESSAGE_TYPES = {
    INSPECTION_RESULT: 'inspectionResult',
    FOUND_SUBMISSION: 'foundSubmission',
    FOUND_MISSING_ASSIGNMENTS: 'foundMissingAssignments'
};

const STORAGE_KEYS = {
    CONCURRENT_TABS: 'concurrentTabs',
    LOOPER_DAYS_OUT_FILTER: 'looperDaysOutFilter',
    CUSTOM_KEYWORD: 'customKeyword',
    HIGHLIGHT_COLOR: 'highlightColor',
    DEBUG_MODE: 'debugMode',
    CHECKER_MODE: 'checkerMode',
    CONNECTIONS: 'connections',
    EXTENSION_STATE: 'extensionState',
    FOUND_ENTRIES: 'foundEntries',
    LOOP_STATUS: 'loopStatus',
    MASTER_ENTRIES: 'masterEntries',
    LAST_UPDATED: 'lastUpdated'
};


(async function() {
  const settings = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const extensionState = settings[STORAGE_KEYS.EXTENSION_STATE] || EXTENSION_STATES.OFF;
  const highlightColor = settings[STORAGE_KEYS.HIGHLIGHT_COLOR] || '#ffff00';
  const customKeyword = settings[STORAGE_KEYS.CUSTOM_KEYWORD] || '';
  const checkerMode = settings[STORAGE_KEYS.CHECKER_MODE] || CHECKER_MODES.SUBMISSION;
  
  const isLooperRun = new URLSearchParams(window.location.search).has('looper');

  function getFirstStudentName() {
    const re = /Grades for\s*([\w ,'-]+)/g;
    let match;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const txt = walker.currentNode.nodeValue;
      while ((match = re.exec(txt))) return match[1].trim();
    }
    const studentNameEl = document.querySelector('h2.student-name');
    if (studentNameEl) return studentNameEl.textContent.trim();
    return 'Unknown Student';
  }

  // --- SUBMISSION CHECK LOGIC ---
  function runSubmissionCheck() {
    let keywordFound = false;
    let foundEntry = null;

    let todayStr;
    if (customKeyword) {
      todayStr = customKeyword;
    } else {
      const now = new Date();
      const opts = { month: 'short', day: 'numeric' };
      todayStr = now.toLocaleDateString('en-US', opts).replace(',', '') + ' at';
    }
    console.log(`Content script loaded in SUBMISSION mode. Using keyword: "${todayStr}"`);

    function highlightAndNotify(node) {
      if (keywordFound) return;
      const cell = node.parentElement?.closest('td.submitted');
      if (!cell) return;
      const idx = node.nodeValue.indexOf(todayStr);
      if (idx < 0) return;

      keywordFound = true;

      const parent = node.parentNode;
      const span = document.createElement('span');
      span.textContent = node.nodeValue.slice(idx, idx + todayStr.length);
      span.style.backgroundColor = highlightColor;
      span.style.fontWeight = 'bold';
      span.style.fontSize = '1.1em';
      
      parent.insertBefore(document.createTextNode(node.nodeValue.slice(0, idx)), node);
      parent.insertBefore(span, node);
      parent.insertBefore(document.createTextNode(node.nodeValue.slice(idx + todayStr.length)), node);
      parent.removeChild(node);

      if (extensionState === EXTENSION_STATES.OFF) {
          span.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      if (isLooperRun) {
        const studentName = getFirstStudentName().trim();
        const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const urlObject = new URL(window.location.href);
        urlObject.searchParams.delete('looper');
        const cleanUrl = urlObject.href;

        foundEntry = {
            name: studentName,
            time: timeStr,
            url: cleanUrl,
            timestamp: new Date().toISOString()
        };
        chrome.runtime.sendMessage({ action: MESSAGE_TYPES.FOUND_SUBMISSION, payload: foundEntry });
      }
    }

    function walkTheDOM(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while (!keywordFound && (node = walker.nextNode())) {
          highlightAndNotify(node);
      }
      finishCheck();
    }

    function finishCheck() {
      if (!isLooperRun) return;

      if (keywordFound) {
        chrome.runtime.sendMessage({ action: MESSAGE_TYPES.INSPECTION_RESULT, found: true, entry: foundEntry });
      } else {
        chrome.runtime.sendMessage({ action: MESSAGE_TYPES.INSPECTION_RESULT, found: false, entry: null });
      }
    }

    walkTheDOM(document.body);
  }

  // --- MISSING ASSIGNMENT CHECK LOGIC ---
  function runMissingCheck() {
    const studentName = getFirstStudentName();
    const assignmentRows = document.querySelectorAll('tr.student_assignment');
    const missingAssignments = [];
    const allAssignmentsDetails = [];
    const now = new Date();
    const currentYear = now.getFullYear();

    console.log(`Scanning ${assignmentRows.length} total assignments for ${studentName}...`);

    assignmentRows.forEach(row => {
        const titleLink = row.querySelector('th.title a');
        const dueCell = row.querySelector('td.due');
        const submittedCell = row.querySelector('td.submitted');
        const scoreCell = row.querySelector('td.assignment_score');

        const submittedContent = submittedCell ? submittedCell.textContent.trim() : '';
        const dueDateStr = dueCell ? dueCell.textContent.trim() : '';
        const hasSubmission = submittedContent !== '';

        let isPastDue = false;
        let dueDate = null;
        let formattedDueDate = 'N/A';
        
        if (dueDateStr && dueDateStr !== 'N/A') {
            try {
                // Manually parse the date string for robustness
                const monthMap = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
                const regex = /(\w{3})\s+(\d+)\s*(?:by\s*)?(\d{1,2}:\d{2}(am|pm))?/i;
                const match = dueDateStr.match(regex);
                
                if (match) {
                    const month = monthMap[match[1]];
                    const day = parseInt(match[2], 10);
                    let hours = 23;
                    let minutes = 59;
                    
                    if (match[3]) { // If time is present
                        let time = match[3];
                        let isPM = time.toLowerCase().includes('pm');
                        time = time.replace(/am|pm/i, '').trim();
                        let parts = time.split(':');
                        hours = parseInt(parts[0], 10);
                        minutes = parseInt(parts[1], 10);
                        if (isPM && hours < 12) {
                            hours += 12;
                        }
                        if (!isPM && hours === 12) {
                            hours = 0;
                        }
                    }
                    
                    dueDate = new Date(currentYear, month, day, hours, minutes);
                    
                    if (!isNaN(dueDate)) {
                        isPastDue = dueDate < now;
                        formattedDueDate = dueDate.toLocaleString();
                    } else {
                        formattedDueDate = 'Invalid Date';
                    }
                } else {
                   formattedDueDate = 'Could not parse date string';
                }
            } catch(e) { 
                formattedDueDate = 'Parsing Error';
            }
        }

        let score = 'N/A';
        let earnedScore = NaN;
        if (scoreCell) {
            const scoreText = scoreCell.textContent.trim().replace(/\s+/g, ' ');
            if (scoreText.includes('/')) {
                const parts = scoreText.split('/');
                const earned = parseFloat(parts[0].trim());
                const possible = parseFloat(parts[1].trim());

                if (!isNaN(earned)) {
                    earnedScore = earned;
                }

                if (!isNaN(earned) && !isNaN(possible) && possible > 0) {
                    const percentage = (earned / possible) * 100;
                    score = `${percentage.toFixed(0)}% (${earned} / ${possible})`;
                } else {
                    score = scoreText; // Could not parse numbers, show original
                }
            } else {
                score = scoreText; // No slash found
            }
        }
        
        const hasZeroScore = earnedScore === 0;

        const assignmentDetail = {
            name: titleLink ? titleLink.textContent.trim() : 'N/A',
            link: titleLink ? titleLink.href : '#',
            dueDate: dueDateStr,
            formattedDueDate: formattedDueDate,
            submitted: submittedContent,
            score: score,
            hasSubmission: hasSubmission,
            isPastDue: isPastDue,
            hasZeroScore: hasZeroScore
        };
        allAssignmentsDetails.push(assignmentDetail);

        if (!hasSubmission && isPastDue && hasZeroScore) {
            missingAssignments.push({ 
                title: assignmentDetail.name, 
                link: assignmentDetail.link, 
                dueDate: dueDate.toLocaleDateString() 
            });
        }
    });

    console.log('All assignment details:', allAssignmentsDetails);

    if (missingAssignments.length > 0) {
      console.log('Missing assignments found:', missingAssignments);
      const payload = {
          studentName: studentName,
          count: missingAssignments.length,
          assignments: missingAssignments
      };
      chrome.runtime.sendMessage({ action: MESSAGE_TYPES.FOUND_MISSING_ASSIGNMENTS, payload });
    } else {
      console.log(`No past-due missing assignments found for ${studentName}.`);
    }

    if (isLooperRun) {
      chrome.runtime.sendMessage({ action: MESSAGE_TYPES.INSPECTION_RESULT, found: false, entry: null });
    }
  }

  // --- SCRIPT EXECUTION ---
  if (checkerMode === CHECKER_MODES.MISSING) {
      runMissingCheck();
  } else {
      runSubmissionCheck();
  }

})();

