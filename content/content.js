/*
* Timestamp: 2025-09-15 08:46 AM
* Version: 8.0
*/

// Constants cannot be imported in content scripts, so they are defined here directly.
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

const CHECKER_MODES = {
    SUBMISSION: 'submission',
    MISSING: 'missing'
};


(async function() {
  const settings = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const extensionState = settings[STORAGE_KEYS.EXTENSION_STATE] || 'off';
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

      if (extensionState === 'off') {
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
        chrome.runtime.sendMessage({ action: 'foundSubmission', payload: foundEntry });
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
        chrome.runtime.sendMessage({ action: 'inspectionResult', found: true, entry: foundEntry });
      } else {
        chrome.runtime.sendMessage({ action: 'inspectionResult', found: false, entry: null });
      }
    }

    walkTheDOM(document.body);
  }

  // --- MISSING ASSIGNMENT CHECK LOGIC ---
  function runMissingCheck() {
    console.log("Content script loaded in MISSING mode.");
    const studentName = getFirstStudentName();
    const assignmentRows = document.querySelectorAll('tr.student_assignment');
    const missingAssignments = [];
    const now = new Date();

    assignmentRows.forEach(row => {
      const dueCell = row.querySelector('td.due');
      const submittedCell = row.querySelector('td.submitted');
      const titleLink = row.querySelector('th.title a');

      if (!dueCell || !submittedCell || !titleLink) return;

      const dueDateStr = dueCell.textContent.trim();
      const submittedContent = submittedCell.textContent.trim();
      const title = titleLink.textContent.trim();
      const link = titleLink.href;

      if (submittedContent === '') {
        try {
          // Attempt to parse dates like "Aug 26 by 11:59pm"
          const dueDate = new Date(dueDateStr.replace(/by/g, ''));
          if (!isNaN(dueDate) && dueDate < now) {
            missingAssignments.push({ title, link, dueDate: dueDate.toLocaleDateString() });
          }
        } catch (e) {
            // This will gracefully ignore dates that JS can't parse, like "Varies"
        }
      }
    });

    if (missingAssignments.length > 0) {
      const payload = {
          studentName: studentName,
          count: missingAssignments.length,
          assignments: missingAssignments
      };
      chrome.runtime.sendMessage({ action: 'foundMissingAssignments', payload });
    }

    if (isLooperRun) {
      chrome.runtime.sendMessage({ action: 'inspectionResult', found: false, entry: null });
    }
  }

  // --- SCRIPT EXECUTION ---
  if (checkerMode === CHECKER_MODES.MISSING) {
      runMissingCheck();
  } else {
      runSubmissionCheck();
  }

})();

