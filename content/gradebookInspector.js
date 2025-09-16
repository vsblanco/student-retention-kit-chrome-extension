// [2025-09-16]
// Version: 10.4
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
      const submittedCell = row.querySelector('td.submitted');
      const gradeCell = row.querySelector('td.grade');
      const scoreCell = row.querySelector('td.assignment_score');

      const dueDateStr = dueCell ? dueCell.textContent.trim() : 'No due date';
      const submittedContent = submittedCell ? submittedCell.textContent.trim() : 'N/A';
      const gradeText = gradeCell ? gradeCell.textContent.trim() : 'N/A';
      
      let scoreText = 'N/A';
      let scoreValue = null;

      if (scoreCell) {
        const scoreSpan = scoreCell.querySelector('span.grade');
        const totalSpan = scoreCell.querySelector('span.tooltip > span:last-child');
        
        if (scoreSpan && totalSpan) {
            const scoreStr = scoreSpan.textContent.trim();
            const totalStr = totalSpan.textContent.replace('/', '').trim();
            const score = parseFloat(scoreStr);
            const total = parseFloat(totalStr);

            if (!isNaN(score) && !isNaN(total) && total > 0) {
                scoreText = (score / total) * 100;
                scoreValue = score;
            } else if (!isNaN(score)) {
                scoreText = scoreStr;
                scoreValue = score;
            }
        } else {
            scoreText = scoreCell.textContent.trim();
            const parsedScore = parseFloat(scoreText);
            if (!isNaN(parsedScore)) {
                scoreValue = parsedScore;
                scoreText = parsedScore;
            }
        }
      }

      const hasSubmission = submittedContent !== '';
      const hasZeroScore = scoreValue === 0;

      let dueDate = null;
      let isPastDue = false;
      let formattedDueDate = 'Invalid Date';

      if (dueCell) {
          const dateRegex = /(\w{3})\s(\d{1,2})\s(?:by\s)?(\d{1,2}:\d{2}(?:am|pm))?/;
          const match = dueDateStr.match(dateRegex);
          if (match) {
              const month = monthMap[match[1]];
              const day = parseInt(match[2], 10);
              const year = now.getFullYear();
              
              dueDate = new Date(year, month, day);

              if (match[3]) {
                  let [time, modifier] = [match[3].slice(0, -2), match[3].slice(-2)];
                  let [hours, minutes] = time.split(':');
                  if (hours === '12') hours = '0';
                  if (modifier === 'pm') hours = parseInt(hours, 10) + 12;
                  dueDate.setHours(hours, parseInt(minutes, 10), 59, 999);
              } else {
                  dueDate.setHours(23, 59, 59, 999);
              }
              isPastDue = dueDate < now;
              formattedDueDate = dueDate.toString();
          }
      }
      
      allAssignmentsForLog.push({
          name: title,
          link: link,
          dueDate: dueDateStr,
          grade: gradeText,
          score: scoreText,
          submitted: submittedContent,
          hasSubmission: hasSubmission,
          isPastDue: isPastDue,
          hasZeroScore: hasZeroScore,
          formattedDueDate: formattedDueDate
      });

      const isMissing = !hasSubmission && isPastDue && hasZeroScore;

      if (isMissing) {
        missingAssignments.push({
            title: title,
            link: link,
            dueDate: dueDateStr,
            score: scoreText,
        });
      }
    });

    console.log(`Scanning gradebook for ${studentName}... Found ${assignmentRows.length} total assignments.`);
    console.log("All assignment details:", allAssignmentsForLog);

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
  if (checkerMode === CHECKER_MODES.MISSING) {
      runMissingCheck();
  } else {
      runSubmissionCheck();
  }

})();

