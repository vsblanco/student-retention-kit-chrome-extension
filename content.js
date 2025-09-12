// content.js

(async function() {
  // Fetch all settings from storage at once.
  const { 
    extensionState = 'off', 
    highlightColor = '#ffff00',
    customKeyword = '' 
  } = await chrome.storage.local.get(['extensionState', 'highlightColor', 'customKeyword']);
  
  const isLooperRun = new URLSearchParams(window.location.search).has('looper');
  let keywordFound = false;
  let foundEntry = null;

  // Decide which keyword to use: the custom one, or the default date.
  let todayStr;
  if (customKeyword) {
    todayStr = customKeyword;
  } else {
    const now = new Date();
    const opts = { month: 'short', day: 'numeric' };
    todayStr = now.toLocaleDateString('en-US', opts).replace(',', '') + ' at';
  }

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

      // Create the entry object here, grade will be added later
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
    // After the entire DOM has been checked, call finishCheck.
    finishCheck();
  }

  // --- UPDATED: This function now polls for the grade after the keyword is found ---
  function finishCheck() {
    if (!isLooperRun) return;

    if (keywordFound) {
      // If the keyword was found, poll for the grade element.
      let attempts = 0;
      const maxAttempts = 15; // Try for up to 3 seconds
      const interval = 200;   // every 200ms

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
      // Keyword was not found, send result immediately.
      chrome.runtime.sendMessage({ action: 'inspectionResult', found: false, entry: null });
    }
  }

  console.log(`Content script loaded. Using keyword: "${todayStr}"`);
  walkTheDOM(document.body);

})();
