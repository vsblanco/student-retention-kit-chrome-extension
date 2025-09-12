/*
* Timestamp: 2025-09-12 17:40 PM
* Version: 8.0
*/

(async function() {
  // These keys are duplicated here but would be replaced by an import
  // in a bundled extension.
  const STORAGE_KEYS = {
    EXTENSION_STATE: 'extensionState',
    HIGHLIGHT_COLOR: 'highlightColor',
    CUSTOM_KEYWORD: 'customKeyword',
    CHECKER_MODE: 'checkerMode'
  };

  const CHECKER_MODES = {
    SUBMISSION: 'submission',
    MISSING: 'missing'
  };

  // --- SHARED UTILITY ---
  function getFirstStudentName() {
    const re = /Grades for\s*([\w ,'-]+)/g;
    let match;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const txt = walker.currentNode.nodeValue;
      while ((match = re.exec(txt))) return match[1].trim();
    }
    return 'Unknown student';
  }
  
  // --- CHECKER MODE 1: FIND SUBMISSIONS ---
  async function runSubmissionCheck() {
    const { 
      [STORAGE_KEYS.EXTENSION_STATE]: extensionState = 'off', 
      [STORAGE_KEYS.HIGHLIGHT_COLOR]: highlightColor = '#ffff00',
      [STORAGE_KEYS.CUSTOM_KEYWORD]: customKeyword = '' 
    } = await chrome.storage.local.get([
        STORAGE_KEYS.EXTENSION_STATE, 
        STORAGE_KEYS.HIGHLIGHT_COLOR, 
        STORAGE_KEYS.CUSTOM_KEYWORD
    ]);
    
    const isLooperRun = new URLSearchParams(window.location.search).has('looper');
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
        console.log('Keyword FOUND on a looper-opened tab.');
        
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
        let attempts = 0;
        const maxAttempts = 15;
        const interval = 200;
  
        const gradeFinder = setInterval(() => {
          const finalGradeContainer = document.querySelector('.student_assignment.final_grade');
          let gradeFound = false;
  
          if (finalGradeContainer) {
            const textContent = finalGradeContainer.textContent;
            const gradeMatch = textContent.match(/(\d+\.?\d*)\s*%/);
            
            if (gradeMatch && gradeMatch[1]) {
              const gradeValue = parseFloat(gradeMatch[1]);
              if (!isNaN(gradeValue)) {
                foundEntry.grade = gradeValue;
                gradeFound = true;
              }
            }
          }
  
          if (gradeFound || attempts >= maxAttempts) {
            clearInterval(gradeFinder);
            if (!gradeFound) {
              console.log('Grade not found after polling, sending N/A.');
              foundEntry.grade = 'N/A';
            }
            chrome.runtime.sendMessage({ action: 'inspectionResult', found: true, entry: foundEntry });
          }
  
          attempts++;
        }, interval);
      } else {
        chrome.runtime.sendMessage({ action: 'inspectionResult', found: false, entry: null });
      }
    }
  
    console.log(`Submission Check: Using keyword: "${todayStr}"`);
    walkTheDOM(document.body);
  }

  // --- CHECKER MODE 2: FIND MISSING ASSIGNMENTS (REVISED) ---
  function runMissingCheck() {
    console.log("Missing Assignment Check: Running...");
    const isLooperRun = new URLSearchParams(window.location.search).has('looper');
    const studentName = getFirstStudentName().trim();
    let missingCount = 0;

    /**
     * Parses Canvas's "Month Day by Time" format into a Date object.
     * Example: "Aug 26 by 11:59pm" -> Date object for Aug 26 of the current year.
     * @param {string} dateString - The date string from the .due cell.
     * @returns {Date|null} - A Date object or null if parsing fails.
     */
    function parseDueDate(dateString) {
        try {
            // Remove the "by" part and handle potential whitespace issues.
            const cleanString = dateString.replace('by', '').trim();
            // Append the current year to make the date string complete.
            const fullDateString = `${cleanString} ${new Date().getFullYear()}`;
            const date = new Date(fullDateString);
            return isNaN(date) ? null : date;
        } catch (e) {
            console.warn("Could not parse due date:", dateString);
            return null;
        }
    }

    const today = new Date();
    // Set hours, minutes, seconds, and ms to 0 to compare dates only.
    today.setHours(0, 0, 0, 0); 

    const assignmentRows = document.querySelectorAll('tr.student_assignment');
    
    assignmentRows.forEach(row => {
        const dueCell = row.querySelector('td.due');
        const submittedCell = row.querySelector('td.submitted');
        
        if (!dueCell || !submittedCell) return; // Skip if essential cells are missing

        const dueDateString = dueCell.textContent.trim();
        const submittedContent = submittedCell.textContent.trim();
        
        const dueDate = parseDueDate(dueDateString);
        
        // Logic: Due date must exist, be in the past, and the submitted cell must be empty.
        if (dueDate && dueDate < today && submittedContent === '') {
            const titleCell = row.querySelector('th.title a');
            const assignmentTitle = titleCell ? titleCell.textContent.trim() : 'Unknown Title';
            const assignmentLink = titleCell ? titleCell.href : '#';

            missingCount++;
            console.log(
                `%cMISSING ASSIGNMENT FOUND for ${studentName}:`, 
                'color: red; font-weight: bold;', 
                {
                    title: assignmentTitle,
                    dueDate: dueDateString,
                    link: assignmentLink
                }
            );
        }
    });
    
    if (missingCount > 0) {
        console.log(`Total missing past-due assignments for ${studentName}: ${missingCount}`);
    } else {
        console.log(`No missing past-due assignments found for ${studentName}.`);
    }

    // This part is crucial for the looper to continue its process.
    if (isLooperRun) {
        // We send 'found: false' because we are not adding this to the 'Found' list.
        chrome.runtime.sendMessage({ action: 'inspectionResult', found: false, entry: null });
    }
  }

  // --- MAIN SCRIPT EXECUTION ---
  (async () => {
    const { [STORAGE_KEYS.CHECKER_MODE]: checkerMode = CHECKER_MODES.SUBMISSION } = 
        await chrome.storage.local.get(STORAGE_KEYS.CHECKER_MODE);

    if (checkerMode === CHECKER_MODES.MISSING) {
        // Wait for the page to be fully loaded before checking,
        // as we need all assignment rows to be present.
        if (document.readyState === 'complete') {
            runMissingCheck();
        } else {
            window.addEventListener('load', runMissingCheck, { once: true });
        }
    } else {
        // The submission check can run earlier as it walks the DOM as it loads
        runSubmissionCheck();
    }
  })();

})();

