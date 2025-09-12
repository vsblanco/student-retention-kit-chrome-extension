// content.js

(async function() {
  // First, get the current on/off state of the extension from storage.
  const { extensionState = 'off' } = await chrome.storage.local.get('extensionState');
  const isLooperRun = new URLSearchParams(window.location.search).has('looper');
  let keywordFound = false;

  const now = new Date();
  const opts = { month: 'short', day: 'numeric' };
  const todayStr = now.toLocaleDateString('en-US', opts).replace(',', '') + ' at';

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

    // --- Highlighting Logic ---
    const parent = node.parentNode;
    const span = document.createElement('span');
    span.textContent = node.nodeValue.slice(idx, idx + todayStr.length);
    span.style.backgroundColor = 'yellow';
    span.style.fontWeight = 'bold';
    span.style.fontSize = '1.1em';
    
    parent.insertBefore(document.createTextNode(node.nodeValue.slice(0, idx)), node);
    parent.insertBefore(span, node);
    parent.insertBefore(document.createTextNode(node.nodeValue.slice(idx + todayStr.length)), node);
    parent.removeChild(node);

    // --- THIS IS THE NEW PART ---
    // If the extension is off (i.e., not in loop mode), scroll to the keyword.
    if (extensionState === 'off') {
        console.log("Extension is off. Scrolling to keyword.");
        span.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // --- Notification Logic (only for looper) ---
    if (isLooperRun) {
      console.log('Keyword FOUND on a looper-opened tab.');
      const studentName = getFirstStudentName();
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const url = window.location.href;

      chrome.runtime.sendMessage({ action: 'addNames', entries: [{ name: studentName, time: timeStr, url }] });
      chrome.runtime.sendMessage({ action: 'runFlow', payload: { name: studentName, url, timestamp: now.toISOString() } });
      chrome.runtime.sendMessage({ action: 'focusTab' });
    }
  }

  function walkTheDOM(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    function processChunk() {
        let count = 0;
        while ((node = walker.nextNode()) && count < 200) {
            highlightAndNotify(node);
            count++;
        }
        if (node) {
            setTimeout(processChunk, 50);
        } else {
            finishCheck();
        }
    }
    processChunk();
  }

  function finishCheck() {
    if (isLooperRun) {
        chrome.runtime.sendMessage({ action: 'inspectionResult', found: keywordFound });
    }
  }

  // --- Main Execution ---
  console.log("Content script loaded. Current state:", extensionState);
  walkTheDOM(document.body);

})();