// [2025-09-16 16:06 PM]
// Version: 10.7
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
    FOUND_MISSING_ASSIGNMENTS: 'foundMissingAssignments',
    LOG_TO_PANEL: 'logToPanel'
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
        chrome.runtime.sendMessage({ type: MESSAGE_TYPES.FOUND_SUBMISSION, payload: foundEntry });
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
        chrome.runtime.sendMessage({ type: MESSAGE_TYPES.INSPECTION_RESULT, found: true, entry: foundEntry });
      } else {
        chrome.runtime.sendMessage({ type: MESSAGE_TYPES.INSPECTION_RESULT, found: false, entry: null });
      }
    }

    walkTheDOM(document.body);
  }
  
  /**
   * Waits for the grade element to contain a numerical value.
   * @returns {Promise<number|string>} A promise that resolves with the parsed grade or rejects on timeout.
   */
  async function getCurrentGrade() {
      console.log('Searching for current grade...');
      const selector = '.student_assignment.final_grade .grade';
      
      return new Promise((resolve, reject) => {
          const timeout = 5000;
          const intervalTime = 100;
          let elapsedTime = 0;

          const interval = setInterval(() => {
              const finalGradeElement = document.querySelector(selector);
              if (finalGradeElement) {
                  const gradeText = finalGradeElement.textContent.trim();
                  const gradeValue = parseFloat(gradeText.replace('%', ''));

                  // Check if the parsed value is a valid number
                  if (!isNaN(gradeValue)) {
                      clearInterval(interval);
                      console.log(`Success: Found grade element. Parsed grade is: ${gradeValue}`);
                      resolve(gradeValue);
                      return;
                  }
              }

              elapsedTime += intervalTime;
              if (elapsedTime >= timeout) {
                  clearInterval(interval);
                  console.log(`Failure: Timed out after ${timeout}ms waiting for a valid grade.`);
                  resolve('N/A'); // Resolve with N/A instead of rejecting
              }
          }, intervalTime);
      });
  }

  function isAssignmentMissing(row, now, monthMap) {
      const submittedCell = row.querySelector('td.submitted');
      const scoreCell = row.querySelector('td.assignment_score');
      const dueCell = row.querySelector('td.due');

      // Condition 1: Must have no submission.
      const hasSubmission = submittedCell ? submittedCell.textContent.trim() !== '' : true;
      if (hasSubmission) return false;

      // Condition 2: Score must be 0 or '-'.
      let isConsideredUngraded = false;
      if (scoreCell) {
          const scoreSpan = scoreCell.querySelector('span.grade');
          const scoreContentForCheck = scoreSpan ? scoreSpan.textContent.trim() : scoreCell.textContent.trim();
          if (scoreContentForCheck === '-') {
              isConsideredUngraded = true;
          } else {
              const parsedScore = parseFloat(scoreContentForCheck);
              if (!isNaN(parsedScore) && parsedScore === 0) {
                  isConsideredUngraded = true;
              }
          }
      }
      if (!isConsideredUngraded) return false;

      // Condition 3: Must be past due.
      let isPastDue = false;
      if (dueCell) {
          const dueDateStr = dueCell.textContent.trim();
          const dateRegex = /(\w{3})\s(\d{1,2})/;
          const match = dueDateStr.match(dateRegex);
          if (match) {
              const month = monthMap[match[1]];
              const day = parseInt(match[2], 10);
              const year = now.getFullYear();
              const dueDate = new Date(year, month, day);
              dueDate.setHours(23, 59, 59, 999);
              if (dueDate < now) {
                  isPastDue = true;
              }
          }
      }
      if (!isPastDue) return false;
      
      return true; // All conditions met
  }

  function injectMissingPill(row) {
      const statusCell = row.querySelector('td.status');
      if (statusCell && !statusCell.querySelector('.submission-missing-pill')) {
          const pillWrapper = document.createElement('span');
          pillWrapper.className = 'submission-missing-pill';
          pillWrapper.innerHTML = '<span dir="ltr" class="css-1pqqu0s-view--inlineBlock"><div class="css-12pzab8-pill"><div class="css-xbajoi-pill__text">missing</div></div></span>';
          statusCell.prepend(pillWrapper);
      }
  }


  // --- MISSING ASSIGNMENT CHECK LOGIC ---
  async function runMissingCheck() {
    console.log("Content script loaded in MISSING mode.");
    const studentName = getFirstStudentName();
    const assignmentRows = document.querySelectorAll('tr.student_assignment');
    const missingAssignments = [];
    const allAssignmentsForLog = [];
    const now = new Date();
    
    const monthMap = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

    assignmentRows.forEach(row => {
      const titleLink = row.querySelector('th.title a');
      if (!titleLink) return;

      const title = titleLink.textContent.trim();
      let link = titleLink.href;

      const submissionIndex = link.indexOf('/submissions');
      if (submissionIndex !== -1) {
        link = link.substring(0, submissionIndex);
      }
      
      const dueCell = row.querySelector('td.due');
      const scoreCell = row.querySelector('td.assignment_score');
      const scoreText = scoreCell ? (scoreCell.querySelector('span.grade') || scoreCell).textContent.trim() : 'N/A';
      const dueDateStr = dueCell ? dueCell.textContent.trim() : 'No due date';

      if (isAssignmentMissing(row, now, monthMap)) {
        missingAssignments.push({
            title: title,
            link: link,
            dueDate: dueDateStr,
            score: scoreText,
        });
      }
    });

    console.log(`Scanning gradebook for ${studentName}... Found ${assignmentRows.length} total assignments.`);

    if (missingAssignments.length > 0) {
      console.log(`Found ${missingAssignments.length} missing assignments for ${studentName}:`, missingAssignments);
      
      const currentGrade = await getCurrentGrade();
      
      const payload = {
          studentName: studentName,
          currentGrade: currentGrade,
          count: missingAssignments.length,
          assignments: missingAssignments
      };
      chrome.runtime.sendMessage({ type: MESSAGE_TYPES.FOUND_MISSING_ASSIGNMENTS, payload });
    } else {
      console.log(`No missing assignments found for ${studentName}.`);
    }

    if (isLooperRun) {
      chrome.runtime.sendMessage({ type: MESSAGE_TYPES.INSPECTION_RESULT, found: false, entry: null });
    }
  }

  // --- SCRIPT EXECUTION ---
  
  // Passive check: Always run this when a user is just browsing, not during an active loop.
  if (!isLooperRun) {
      const assignmentRows = document.querySelectorAll('tr.student_assignment');
      const now = new Date();
      const monthMap = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
      assignmentRows.forEach(row => {
          if (isAssignmentMissing(row, now, monthMap)) {
              injectMissingPill(row);
          }
      });
  }

  // Active check: Only run the appropriate checker if the extension is turned on.
  if (extensionState === EXTENSION_STATES.ON) {
      if (checkerMode === CHECKER_MODES.MISSING) {
          runMissingCheck();
      } else {
          runSubmissionCheck();
      }
  }

})();

