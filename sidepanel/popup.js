// [2025-09-16 14:34 PM]
// Version: 12.3
import { STORAGE_KEYS, DEFAULT_SETTINGS, ADVANCED_FILTER_REGEX, SHAREPOINT_URL, CHECKER_MODES, EXTENSION_STATES, MESSAGE_TYPES, CONNECTION_TYPES } from '../constants.js';

let lastActiveTab = 'found'; // Variable to store the last active tab before 'about'

// --- RENDER FUNCTIONS ---
export function renderFoundList(entries) {
  const list = document.getElementById('foundList');
  list.innerHTML = '';
  if (!entries || entries.length === 0) {
      list.innerHTML = '<li>None yet</li>';
      return;
  }

  entries.sort((a, b) => {
    if (!a.timestamp || !b.timestamp) return 0;
    return b.timestamp.localeCompare(a.timestamp);
  });

  entries.forEach(entry => {
    const { name, time, url } = entry;
    const li = document.createElement('li');
    li.dataset.entry = JSON.stringify(entry); // Store data on the entire list item
    
    const a  = document.createElement('a');
    a.textContent = name;
    a.href = '#';
    a.addEventListener('click', e => {
      e.preventDefault();
      chrome.tabs.create({ url });
    });
    li.appendChild(a);
    if (time) {
        const timeBadge = document.createElement('span');
        timeBadge.className = 'pill-badge align-right';
        timeBadge.textContent = time;
        li.appendChild(timeBadge);
    }
    list.appendChild(li);
  });
}

export function renderMasterList(entries, showPhones) {
  const list = document.getElementById('masterList');
  list.innerHTML = '';
  entries.forEach((entry) => {
    const { name, url, phone, daysout } = entry;
    const li = document.createElement('li');
    li.dataset.entry = JSON.stringify(entry); // Store data on the entire list item

    if (url && url !== '#N/A' && url.startsWith('http')) {
      const a  = document.createElement('a');
      a.textContent = name;
      a.href = url;
      a.addEventListener('click', e => {
        e.preventDefault();
        chrome.tabs.create({ url });
      });
      li.appendChild(a);
    } else {
      const nameSpan = document.createElement('span');
      nameSpan.textContent = name;
      nameSpan.style.color = '#888';
      nameSpan.title = 'Invalid URL. Please update on the master list.';
      li.appendChild(nameSpan);
    }

    if (daysout != null) {
        const daysoutSpan = document.createElement('span');
        daysoutSpan.className = 'pill-badge';
        daysoutSpan.textContent = daysout;
        
        const styles = getDaysOutStyle(daysout);
        Object.assign(daysoutSpan.style, styles);

        daysoutSpan.style.fontSize = '0.9em';

        li.appendChild(daysoutSpan);
    }

    if (showPhones && phone) {
        const phoneSpan = document.createElement('span');
        phoneSpan.className = 'pill-badge';
        phoneSpan.textContent = phone;
        li.appendChild(phoneSpan);
    }
    list.appendChild(li);
  });
}

function renderConnectionsList(connections = []) {
    const list = document.getElementById('connectionsList');
    list.innerHTML = '';

    if (connections.length === 0) {
        list.innerHTML = '<li>No connections configured.</li>';
        return;
    }

    connections.forEach((conn, index) => {
        const li = document.createElement('li');
        
        const icon = document.createElement('img');
        icon.className = 'connection-icon';
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'connection-info';

        const typeSpan = document.createElement('span');
        typeSpan.className = 'connection-type';
        
        const detailSpan = document.createElement('span');
        detailSpan.className = 'connection-detail';

        if (conn.type === CONNECTION_TYPES.POWER_AUTOMATE) {
            icon.src = '../assets/pictures/power-automate-icon.png';
            typeSpan.textContent = 'Power Automate';
            detailSpan.textContent = conn.name;
        } else if (conn.type === CONNECTION_TYPES.PUSHER) {
            icon.src = '../assets/pictures/pusher-icon.png';
            typeSpan.textContent = 'Pusher';
            detailSpan.textContent = conn.name;
        }

        li.appendChild(icon);
        infoDiv.appendChild(typeSpan);
        infoDiv.appendChild(detailSpan);
        li.appendChild(infoDiv);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'connection-actions';

        const menuBtn = document.createElement('button');
        menuBtn.className = 'connection-actions-btn';
        menuBtn.title = 'Actions';
        menuBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z" /></svg>`;

        const menu = document.createElement('div');
        menu.className = 'connection-menu';

        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => {
            openEditConnectionModal(conn, index);
            menu.classList.remove('active');
        });

        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export';
        exportBtn.addEventListener('click', () => {
            connectionToExport = conn;
            document.getElementById('exportIncludeSecretToggle').checked = false;
            updateExportView();
            openModal('export-modal');
            menu.classList.remove('active');
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'delete-action';
        deleteBtn.addEventListener('click', () => {
            connectionToDelete = conn.id;
            openModal('delete-confirm-modal');
            menu.classList.remove('active');
        });

        menu.appendChild(editBtn);
        menu.appendChild(exportBtn);
        menu.appendChild(deleteBtn);
        actionsDiv.appendChild(menuBtn);
        actionsDiv.appendChild(menu);
        li.appendChild(actionsDiv);

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const listContainer = document.getElementById('connectionsList');
            document.querySelectorAll('.connection-menu.active').forEach(m => {
                if (m !== menu) m.classList.remove('active');
            });
            menu.classList.toggle('active');
            listContainer.classList.toggle('overflow-visible', menu.classList.contains('active'));
        });

        list.appendChild(li);
    });
}

function renderReportContent(reportData, container) {
    container.innerHTML = '';

    if (!reportData || !reportData.details || reportData.details.length === 0) {
        container.innerHTML = '<p class="placeholder-text">No missing assignments found in the latest report, or a report has not been generated yet.</p>';
        return;
    }

    reportData.details.forEach(student => {
        const details = document.createElement('details');
        details.className = 'report-student-details';

        const summary = document.createElement('summary');
        summary.className = 'report-student-summary';
        summary.textContent = student.studentName;
        details.appendChild(summary);

        const assignmentsList = document.createElement('ul');
        assignmentsList.className = 'report-assignments-list';
        
        student.assignments.forEach(assignment => {
            const li = document.createElement('li');
            
            const title = document.createElement('a');
            title.className = 'assignment-title';
            title.textContent = assignment.title;
            title.href = '#'; // Prevent page jump
            title.addEventListener('click', (e) => {
                e.preventDefault();
                if (assignment.link) {
                    chrome.tabs.create({ url: assignment.link });
                }
            });
            li.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'assignment-meta';
            
            const dueDate = document.createElement('span');
            dueDate.textContent = `Due: ${assignment.dueDate}`;
            meta.appendChild(dueDate);

            const score = document.createElement('span');
            score.textContent = `Score: ${assignment.score}`;
            meta.appendChild(score);

            li.appendChild(meta);
            assignmentsList.appendChild(li);
        });
        
        details.appendChild(assignmentsList);
        container.appendChild(details);
    });
}

// Function for the modal
function renderFormattedReport(reportData) {
    const container = document.getElementById('report-formatted-view');
    renderReportContent(reportData, container);
}

// Function for the new Report tab
function renderReportInTab(reportData) {
    const container = document.getElementById('report-formatted-view-sidepanel');
    const toggleBtn = document.getElementById('toggleReportViewBtnSidePanel');
    const downloadBtn = document.getElementById('downloadReportCsvBtnSidePanel');
    const jsonView = document.getElementById('report-json-view-sidepanel');
    const formattedView = document.getElementById('report-formatted-view-sidepanel');
    const timestampEl = document.getElementById('reportGeneratedTime');
    const headerEl = timestampEl.parentElement;

    latestReportData = reportData; // Store for CSV download and JSON view

    const hasReport = reportData && reportData.details && reportData.details.length > 0;

    if (toggleBtn) toggleBtn.disabled = !hasReport;
    if (downloadBtn) downloadBtn.disabled = !hasReport;

    if (reportData && reportData.reportGenerated) {
        const date = new Date(reportData.reportGenerated);
        const timestampStr = date.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
        }).replace(',', '');
        timestampEl.textContent = `Generated: ${timestampStr}`;
        headerEl.style.display = 'block';
    } else {
        timestampEl.textContent = '';
        headerEl.style.display = 'none';
    }

    // Reset view state to default (formatted)
    if (formattedView) formattedView.style.display = 'block';
    if (jsonView) jsonView.style.display = 'none';
    if (toggleBtn) toggleBtn.textContent = 'View JSON';
    
    if (container) {
        renderReportContent(reportData, container);
    }
}


// --- ABOUT TAB & README FUNCTIONS ---
function simpleMarkdownToHtml(markdown) {
    let html = markdown
        // Remove backslashes escaping punctuation
        .replace(/\\([^\w\s])/g, '$1')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');

    // Handle unordered lists
    html = html.replace(/^\s*[\-\*] (.*)/gm, '<ul><li>$1</li></ul>');
    html = html.replace(/<\/ul>\n<ul>/g, '');

    // Handle ordered lists
    html = html.replace(/^\s*\d+\. (.*)/gm, '<ol><li>$1</li></ol>');
    html = html.replace(/<\/ol>\n<ol>/g, '');

    // Handle code blocks
    html = html.replace(/```([\s\S]*?)```/g, (match, p1) => {
        const code = p1.trim();
        return `<pre><code>${code}</code></pre>`;
    });

    // Handle paragraphs
    html = html.split(/\n\n+/).map(p => {
        if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<ol') || p.startsWith('<pre')) {
            return p;
        }
        return p.trim() ? `<p>${p.replace(/\n/g, '<br>')}</p>` : '';
    }).join('');

    return html;
}

async function loadAboutContent() {
    const readmeDisplay = document.getElementById('readme-display');
    try {
        const response = await fetch('../README.md');
        if (!response.ok) throw new Error('Failed to fetch README.md');
        const rawReadmeContent = await response.text();
        readmeDisplay.innerHTML = simpleMarkdownToHtml(rawReadmeContent);
    } catch (error) {
        console.error("Error loading README content:", error);
        readmeDisplay.innerHTML = '<p>Error loading content. Please try again.</p>';
    }
}


// --- DATA & STATE MANAGEMENT ---
let activeSort = { criterion: 'none', direction: 'none' };
let connectionToDelete = null;
let connectionToExport = null;
let currentSessionId = null;
let finalReportData = null; // Store the final report data for the modal
let latestReportData = null; // Store the latest report data for the side panel tab

async function displayMasterList() {
    const { [STORAGE_KEYS.MASTER_ENTRIES]: masterEntries = [] } = await chrome.storage.local.get(STORAGE_KEYS.MASTER_ENTRIES);
    
    const searchInput = document.getElementById('newItemInput');
    const term = searchInput ? searchInput.value.trim() : '';
    const lowerTerm = term.toLowerCase();

    const advancedMatch = term.match(ADVANCED_FILTER_REGEX);

    const filteredEntries = masterEntries.filter(entry => {
        if (advancedMatch) {
            const operator = advancedMatch[1];
            const value = parseInt(advancedMatch[2], 10);
            const daysout = entry.daysout;

            if (daysout == null) return false;

            switch (operator) {
                case '>':  return daysout > value;
                case '<':  return daysout < value;
                case '>=': return daysout >= value;
                case '<=': return daysout <= value;
                case '=':  return daysout === value;
                default:   return false;
            }
        }

        if (term === '') return true;

        const nameMatch = entry.name.toLowerCase().includes(lowerTerm);
        let extraMatch = false;
        
        if (entry.daysout != null && !isNaN(term) && term !== '') {
             extraMatch = String(entry.daysout) === term;
        }
        
        return nameMatch || extraMatch;
    });

    let finalEntries = [...filteredEntries];
    if (activeSort.criterion === 'daysout') {
        finalEntries.sort((a, b) => {
            const valA = a.daysout || 0;
            const valB = b.daysout || 0;
            return activeSort.direction === 'desc' ? valB - valA : valA - valB;
        });
    } else if (activeSort.criterion === 'name') {
        finalEntries.sort((a, b) => {
            return activeSort.direction === 'asc' 
                ? a.name.localeCompare(b.name) 
                : b.name.localeCompare(a.name);
        });
    }

    renderMasterList(finalEntries, false);

    const badge = document.querySelector('.tab-button[data-tab="master"] .count');
    if (badge) badge.textContent = finalEntries.length;
}

async function updateMasterFromClipboard() {
  const updateBtn = document.getElementById('updateMasterBtn');
  const list = document.getElementById('masterList');
  
  updateBtn.classList.remove('btn-success', 'btn-error');
  updateBtn.textContent = 'Processing...';
  list.innerHTML = '<li>Reading from clipboard...</li>';

  try {
    const clipboardText = await navigator.clipboard.readText();
    if (!clipboardText) throw new Error("Clipboard is empty.");
    
    const data = JSON.parse(clipboardText);
    if (!Array.isArray(data)) throw new Error("Clipboard data is not a valid JSON array.");

    const entries = data.map(s => {
        if (!s.StudentName || !s.GradeBook) {
            console.warn("Skipping invalid entry:", s);
            return null;
        }
        return {
          name: s.StudentName,
          url: s.GradeBook,
          daysout: s.DaysOut,
          lda: s.LDA,
          grade: s.Grade,
          phone: '', 
          time: ''
        };
    }).filter(Boolean);

    const now = new Date();
    const timestampStr = now.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    }).replace(',', '');
    
    await chrome.storage.local.set({ 
        [STORAGE_KEYS.MASTER_ENTRIES]: entries, 
        [STORAGE_KEYS.LAST_UPDATED]: timestampStr 
    });
    
    displayMasterList();
    
    const lastUpdatedSpan = document.getElementById('lastUpdatedTime');
    if(lastUpdatedSpan) lastUpdatedSpan.textContent = `Last updated: ${timestampStr}`;

    updateBtn.classList.add('btn-success');
    updateBtn.textContent = `Success! ${entries.length} students loaded.`;

  } catch (e) {
    console.error('Failed to update master list from clipboard', e);
    updateBtn.classList.add('btn-error');
    updateBtn.textContent = 'Error: Invalid clipboard data.';
    list.innerHTML = '<li>Error loading list. Please copy the correct JSON data and try again.</li>';
  } finally {
    setTimeout(() => {
        updateBtn.classList.remove('btn-success', 'btn-error');
        updateBtn.textContent = 'Update Master List';
    }, 4000);
  }
}

async function loadLatestReport() {
    const { [STORAGE_KEYS.LATEST_MISSING_REPORT]: reportData } = await chrome.storage.local.get(STORAGE_KEYS.LATEST_MISSING_REPORT);
    renderReportInTab(reportData);
}

// --- UI HELPER FUNCTIONS ---
function getDaysOutStyle(daysout) {
    if (daysout == null) return {};
    if (daysout >= 10) return { backgroundColor: 'hsl(0, 85%, 55%)', color: 'white', fontWeight: 'bold' };
    if (daysout >= 5) return { backgroundColor: 'hsl(35, 95%, 55%)', color: 'white', fontWeight: 'bold' };
    return { backgroundColor: 'hsl(130, 65%, 90%)', color: 'hsl(130, 40%, 25%)', border: '1px solid hsl(130, 40%, 80%)' };
}

function createRipple(event) {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = 'ripple';
    ripple.style.height = ripple.style.width = Math.max(rect.width, rect.height) + "px";
    const x = event.clientX - rect.left - ripple.offsetWidth / 2;
    const y = event.clientY - rect.top - ripple.offsetHeight / 2;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
}

function switchTab(tabName) {
    if (tabName !== 'about') {
        lastActiveTab = tabName;
    }
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(pane => {
        const isActive = pane.id === tabName;
        pane.style.display = isActive ? 'flex' : 'none';
        pane.classList.toggle('active', isActive);
    });
}

function updateExportView() {
    if (!connectionToExport) return;
    
    const includeSecretToggle = document.getElementById('exportIncludeSecretToggle');
    const includeSecret = includeSecretToggle.checked;
    const exportableConn = { ...connectionToExport };

    if (!includeSecret) {
        if (exportableConn.secret) {
            exportableConn.secret = '';
        }
        if (exportableConn.type === CONNECTION_TYPES.POWER_AUTOMATE && exportableConn.url) {
            exportableConn.url = ''; 
        }
    }
    
    document.getElementById('exportJsonContent').textContent = JSON.stringify(exportableConn, null, 2);
}

function updateScheduleDisplay() {
    chrome.storage.local.get({
        [STORAGE_KEYS.SCHEDULED_CHECK_ENABLED]: false,
        [STORAGE_KEYS.SCHEDULED_CHECK_TIME]: '08:00'
    }, (settings) => {
        const isEnabled = settings[STORAGE_KEYS.SCHEDULED_CHECK_ENABLED];
        const time = settings[STORAGE_KEYS.SCHEDULED_CHECK_TIME];
        const statusEl = document.getElementById('scheduleStatus');

        if (!statusEl) return;

        if (isEnabled && time) {
            // Convert 24-hour time to 12-hour AM/PM format
            let [hours, minutes] = time.split(':');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12; // Convert hour "0" to "12"
            const formattedTime = `${hours}:${minutes} ${ampm}`;

            statusEl.textContent = `Daily at ${formattedTime}`;
            statusEl.classList.remove('disabled');
        } else {
            statusEl.textContent = 'Not Configured';
            statusEl.classList.add('disabled');
        }
    });
}

// --- MODAL FUNCTIONS ---
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'flex';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';

    if (modalId === 'connections-modal') {
        document.getElementById('connection-chooser').style.display = 'block';
        document.getElementById('connection-form-container').style.display = 'none';
        document.querySelectorAll('.connection-form').forEach(f => {
            f.style.display = 'none';
            f.reset();
            const status = f.querySelector('.test-status');
            if (status) {
                status.textContent = '';
                status.className = 'test-status';
            }
            delete f.dataset.editingId;
        });
        document.querySelectorAll('.connection-choice-btn').forEach(btn => {
            btn.classList.remove('clipboard-match');
        });
    }
}

function openEditConnectionModal(connection, index) {
  openModal('connections-modal');
  document.getElementById('connection-chooser').style.display = 'none';
  document.getElementById('connection-form-container').style.display = 'block';
  
  const form = document.getElementById(`${connection.type}-form`);
  form.style.display = 'block';
  form.dataset.editingId = connection.id;

  if (connection.type === CONNECTION_TYPES.POWER_AUTOMATE) {
      document.getElementById('pa-name').value = connection.name;
      document.getElementById('pa-url').value = connection.url;
  } else if (connection.type === CONNECTION_TYPES.PUSHER) {
      document.getElementById('pusher-name').value = connection.name;
      document.getElementById('pusher-key').value = connection.key;
      document.getElementById('pusher-cluster').value = connection.cluster;
      document.getElementById('pusher-secret').value = connection.secret;
      document.getElementById('pusher-channel').value = connection.channel.replace('private-', '');
      document.getElementById('pusher-event').value = connection.event.replace('client-', '');
  }
}

// --- CSV Generation ---
function escapeCsvCell(cell) {
    let cellString = String(cell == null ? '' : cell);
    if (cellString.includes(',') || cellString.includes('"') || cellString.includes('\n')) {
        cellString = '"' + cellString.replace(/"/g, '""') + '"';
    }
    return cellString;
}

function generateCsvContent(reportData) {
    if (!reportData || !reportData.details || reportData.details.length === 0) {
        return '';
    }

    const headers = ["Student Name", "Current Grade", "Assignment Title", "Due Date", "Score", "Link"];
    const rows = [headers];

    reportData.details.forEach(student => {
        student.assignments.forEach(assignment => {
            const row = [
                student.studentName,
                student.currentGrade,
                assignment.title,
                assignment.dueDate,
                assignment.score,
                assignment.link
            ];
            rows.push(row);
        });
    });
    
    return rows.map(row => row.map(escapeCsvCell).join(',')).join('\n');
}

function downloadCsv(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}


// --- Clipboard Auto-Detect ---
async function checkClipboardForConnection() {
    try {
        const text = await navigator.clipboard.readText();
        const data = JSON.parse(text);

        const paBtn = document.querySelector('.connection-choice-btn[data-type="power-automate"]');
        const pusherBtn = document.querySelector('.connection-choice-btn[data-type="pusher"]');

        paBtn.classList.remove('clipboard-match');
        pusherBtn.classList.remove('clipboard-match');

        if (data.type === CONNECTION_TYPES.POWER_AUTOMATE && data.name && data.url) {
            paBtn.classList.add('clipboard-match');
        } else if (data.type === CONNECTION_TYPES.PUSHER && data.name && data.key && data.cluster && data.secret && data.channel && data.event) {
            pusherBtn.classList.add('clipboard-match');
        }
    } catch (e) {
        // Silently fail if clipboard is empty or not valid JSON
    }
}

function autoFillForm(type) {
    navigator.clipboard.readText().then(text => {
        const data = JSON.parse(text);
        const form = document.getElementById(`${type}-form`);
        
        document.getElementById('connection-chooser').style.display = 'none';
        document.getElementById('connection-form-container').style.display = 'block';
        form.style.display = 'block';
        
        const inputsToHighlight = [];

        if (type === CONNECTION_TYPES.POWER_AUTOMATE) {
            document.getElementById('pa-name').value = data.name;
            document.getElementById('pa-url').value = data.url;
            inputsToHighlight.push(document.getElementById('pa-name'), document.getElementById('pa-url'));
        } else if (type === CONNECTION_TYPES.PUSHER) {
            document.getElementById('pusher-name').value = data.name;
            document.getElementById('pusher-key').value = data.key;
            document.getElementById('pusher-cluster').value = data.cluster;
            document.getElementById('pusher-secret').value = data.secret;
            document.getElementById('pusher-channel').value = data.channel.replace('private-', '');
            document.getElementById('pusher-event').value = data.event.replace('client-', '');
            inputsToHighlight.push(
                document.getElementById('pusher-name'),
                document.getElementById('pusher-key'),
                document.getElementById('pusher-cluster'),
                document.getElementById('pusher-secret'),
                form.querySelector('#pusher-channel'),
                form.querySelector('#pusher-event')
            );
        }

        inputsToHighlight.forEach(input => {
            input.classList.add('auto-filled');
            setTimeout(() => input.classList.remove('auto-filled'), 2500);
        });
    }).catch(err => {
        console.error("Failed to auto-fill from clipboard:", err);
    });
}

// --- DOMContentLoaded: MAIN SETUP ---

document.addEventListener('DOMContentLoaded', () => {

  // --- FLOATING DEBUG CONSOLE LOGIC ---
  function setupDebugConsole() {
      const consoleEl = document.getElementById('debug-console');
      const consoleContent = document.getElementById('debug-console-content');
      const consoleHeader = document.getElementById('debug-console-header');
      const logArea = document.getElementById('debug-console-log-area');
      const toggleBtn = document.getElementById('toggleConsoleBtn');
      const closeBtn = document.getElementById('closeConsoleBtn');
      const clearBtn = document.getElementById('clearConsoleBtn');

      toggleBtn.addEventListener('click', () => {
          const isHidden = !consoleEl.classList.contains('visible');
          consoleEl.classList.toggle('visible', isHidden);
          toggleBtn.textContent = isHidden ? 'Hide Console' : 'Show Console';
      });

      closeBtn.addEventListener('click', () => {
          consoleEl.classList.remove('visible');
          toggleBtn.textContent = 'Show Console';
      });

      clearBtn.addEventListener('click', () => {
          logArea.innerHTML = '';
      });

      makeDraggable(consoleContent, consoleHeader);
      overrideConsole(logArea);
      console.log("Debug console initialized.");
  }

  function makeDraggable(element, handle) {
      let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

      handle.onmousedown = dragMouseDown;

      function dragMouseDown(e) {
          e.preventDefault();
          pos3 = e.clientX;
          pos4 = e.clientY;
          document.onmouseup = closeDragElement;
          document.onmousemove = elementDrag;
      }

      function elementDrag(e) {
          e.preventDefault();
          pos1 = pos3 - e.clientX;
          pos2 = pos4 - e.clientY;
          pos3 = e.clientX;
          pos4 = e.clientY;
          element.style.top = (element.offsetTop - pos2) + "px";
          element.style.left = (element.offsetLeft - pos1) + "px";
      }

      function closeDragElement() {
          document.onmouseup = null;
          document.onmousemove = null;
      }
  }

  function overrideConsole(logArea) {
      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;

      const createLogEntry = (args, type) => {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;

        // Handle special session start logs
        if (typeof args[0] === 'object' && args[0] !== null && args[0].type === 'sessionStart') {
            const { sessionId, title } = args[0];
            entry.innerHTML = `<details class="log-details" id="${sessionId}" open><summary class="log-summary">${title} (<span>...</span>)</summary><div class="session-body"></div></details>`;
        }
        // Handle explicit args from background script for formatted logs
        else if (Array.isArray(args)) {
            const title = args[0];
            const payload = args[1];

            if (typeof payload === 'object' && payload !== null) {
                entry.innerHTML = `<details class="log-details"><summary class="log-summary">${title}</summary><pre>${JSON.stringify(payload, null, 2)}</pre></details>`;
            } else {
                entry.textContent = title;
            }
        }
        // Handle generic console logs
        else {
            const message = Array.from(args).map(arg => {
                if (typeof arg === 'object' && arg !== null) {
                    try {
                        return JSON.stringify(arg, null, 2);
                    } catch (e) {
                        return '[Unserializable Object]';
                    }
                }
                return String(arg);
            }).join(' ');
            entry.textContent = message;
        }

        logArea.appendChild(entry);
        logArea.scrollTop = logArea.scrollHeight;
      };

      console.log = function(...args) {
          originalLog.apply(console, args);
          createLogEntry(args, 'log');
      };
      console.warn = function(...args) {
          originalWarn.apply(console, args);
          createLogEntry(args, 'warn');
      };
      console.error = function(...args) {
          originalError.apply(console, args);
          createLogEntry(args, 'error');
      };
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === MESSAGE_TYPES.LOG_TO_PANEL) {
        const { level, payload, args } = msg;

        if (payload && payload.type === 'SUBMISSION' && currentSessionId) {
            const sessionLog = document.getElementById(currentSessionId);
            if (sessionLog) {
                const sessionBody = sessionLog.querySelector('.session-body');
                const studentEntry = document.createElement('div');
                studentEntry.className = 'log-entry log';
                studentEntry.textContent = `Found: ${payload.name} at ${payload.time}`;
                sessionBody.appendChild(studentEntry);
                return; 
            }
        }
        
        const logFunction = level === 'warn' ? console.warn : console.log;
        if (args) {
            logFunction(...args);
        } else {
            logFunction(payload);
        }
    } else if (msg.type === MESSAGE_TYPES.SHOW_MISSING_ASSIGNMENTS_REPORT) {
        finalReportData = msg.payload;
        const summaryEl = document.getElementById('reportSummaryText');
        const formattedView = document.getElementById('report-formatted-view');
        const jsonView = document.getElementById('report-json-view');
        const toggleBtn = document.getElementById('toggleReportViewBtn');

        if (finalReportData && finalReportData.details && finalReportData.details.length > 0) {
            summaryEl.textContent = `Scan complete. Found missing assignments for ${finalReportData.totalStudentsWithMissing} student(s).`;
        } else {
            summaryEl.textContent = "Scan complete. No missing assignments were found for any students in the list.";
        }
        
        // Render the new formatted view and show it by default
        renderFormattedReport(finalReportData);
        formattedView.style.display = 'block';
        jsonView.style.display = 'none';
        toggleBtn.textContent = 'View JSON';

        openModal('report-modal');
    }
  });

  const manifest = chrome.runtime.getManifest();
  document.getElementById('version-display').textContent = `Version ${manifest.version}`;
  const keywordDisplay = document.getElementById('keyword');
  const loopCounterDisplay = document.getElementById('loop-counter');
  let contextMenuEntry = null;

  function updateLoopCounter() {
    chrome.storage.local.get([STORAGE_KEYS.LOOP_STATUS, STORAGE_KEYS.EXTENSION_STATE], (data) => {
        const loopStatus = data[STORAGE_KEYS.LOOP_STATUS];
        const extensionState = data[STORAGE_KEYS.EXTENSION_STATE];
        const counterText = (loopStatus && loopStatus.total > 0) ? `${loopStatus.current} / ${loopStatus.total}` : '';

        if (extensionState === EXTENSION_STATES.ON && counterText) {
            loopCounterDisplay.textContent = counterText;
            loopCounterDisplay.style.display = 'block';

            if (currentSessionId) {
                const sessionLog = document.getElementById(currentSessionId);
                if (sessionLog) {
                    const counterSpan = sessionLog.querySelector('.log-summary span');
                    if(counterSpan) counterSpan.textContent = counterText;
                }
            }
        } else {
            loopCounterDisplay.style.display = 'none';
        }
    });
  }

  function updateKeywordDisplay() {
    chrome.storage.local.get({ [STORAGE_KEYS.CUSTOM_KEYWORD]: '' }, (data) => {
        const customKeyword = data[STORAGE_KEYS.CUSTOM_KEYWORD];
        if (customKeyword) {
            keywordDisplay.textContent = customKeyword;
        } else {
            const now = new Date();
            const opts = { month: 'short', day: 'numeric' };
            keywordDisplay.textContent = now.toLocaleDateString('en-US', opts).replace(',', '') + ' at';
        }
    });
  }
  
  function updateModeDisplay(mode) {
    const display = document.getElementById('activeModeDisplay');
    const keywordSection = document.querySelector('.keyword-section');
    const foundTabButton = document.querySelector('.tab-button[data-tab="found"]');
    const reportTabButton = document.querySelector('.tab-button[data-tab="report"]');
    
    if (mode === CHECKER_MODES.MISSING) {
        display.textContent = 'Missing Assignments';
        keywordSection.style.display = 'none';
        
        foundTabButton.style.display = 'none';
        reportTabButton.style.display = 'flex';
        
        if (foundTabButton.classList.contains('active')) {
            switchTab('report');
        }
        
    } else { // SUBMISSION mode
        display.textContent = 'Submission Check';
        keywordSection.style.display = 'block';
        
        foundTabButton.style.display = 'flex';
        reportTabButton.style.display = 'none';
        
        if (reportTabButton.classList.contains('active')) {
            switchTab('found');
        }
    }
  }

  // Initial Loads
  updateKeywordDisplay();
  updateLoopCounter();
  displayMasterList();
  loadLatestReport();
  updateScheduleDisplay();
  
  chrome.storage.local.get({ [STORAGE_KEYS.FOUND_ENTRIES]: [] }, data => {
    const entries = data[STORAGE_KEYS.FOUND_ENTRIES];
    const badge = document.querySelector('.tab-button[data-tab="found"] .count');
    if(badge) badge.textContent = entries.length;
    renderFoundList(entries);
  });
  
  chrome.storage.local.get([STORAGE_KEYS.LAST_UPDATED], data => {
    const lastUpdated = data[STORAGE_KEYS.LAST_UPDATED];
    const lastUpdatedSpan = document.getElementById('lastUpdatedTime');
    if (lastUpdatedSpan && lastUpdated) { 
        lastUpdatedSpan.textContent = `Last updated: ${lastUpdated}`; 
    }
  });
  
  chrome.storage.local.get({ [STORAGE_KEYS.CONNECTIONS]: [] }, data => {
      renderConnectionsList(data[STORAGE_KEYS.CONNECTIONS]);
  });
  
  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    updateModeDisplay(settings[STORAGE_KEYS.CHECKER_MODE]);
  });

  // Event Listeners for Storage
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEYS.FOUND_ENTRIES]) {
      const newEntries = changes[STORAGE_KEYS.FOUND_ENTRIES].newValue || [];
      renderFoundList(newEntries);
      const badge = document.querySelector('.tab-button[data-tab="found"] .count');
      if (badge) badge.textContent = newEntries.length;
    }
    if (changes[STORAGE_KEYS.LOOP_STATUS]) {
      updateLoopCounter();
    }
    if (changes[STORAGE_KEYS.EXTENSION_STATE]) {
      updateButtonState(changes[STORAGE_KEYS.EXTENSION_STATE].newValue);
    }
    if (changes[STORAGE_KEYS.MASTER_ENTRIES]) {
      displayMasterList();
    }
    if (changes[STORAGE_KEYS.CONNECTIONS]) {
      renderConnectionsList(changes[STORAGE_KEYS.CONNECTIONS].newValue);
    }
    if (changes[STORAGE_KEYS.CHECKER_MODE]) {
      updateModeDisplay(changes[STORAGE_KEYS.CHECKER_MODE].newValue);
    }
    if (changes[STORAGE_KEYS.LATEST_MISSING_REPORT]) {
      renderReportInTab(changes[STORAGE_KEYS.LATEST_MISSING_REPORT].newValue);
    }
    if (changes[STORAGE_KEYS.SCHEDULED_CHECK_ENABLED] || changes[STORAGE_KEYS.SCHEDULED_CHECK_TIME]) {
      updateScheduleDisplay();
    }
  });

  document.querySelector('.tabs').addEventListener('click', (event) => {
      const tabButton = event.target.closest('.tab-button');
      if (tabButton && tabButton.dataset.tab) switchTab(tabButton.dataset.tab);
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    chrome.storage.local.set({ [STORAGE_KEYS.FOUND_ENTRIES]: [] }, () => location.reload());
  });

  document.getElementById('updateMasterBtn').addEventListener('click', (event) => {
    createRipple(event);
    updateMasterFromClipboard();
  });

  document.getElementById('newItemInput').addEventListener('input', displayMasterList);

  // Sorting
  const daysOutSortBtn = document.getElementById('daysOutSortBtn');
  const nameSortBtn = document.getElementById('nameSortBtn');
  function updateSortButtons() {
    daysOutSortBtn.classList.remove('active');
    nameSortBtn.classList.remove('active');
    daysOutSortBtn.textContent = 'Sort by Days Out';
    nameSortBtn.textContent = 'Sort by Name';
    if (activeSort.criterion === 'daysout') {
        daysOutSortBtn.classList.add('active');
        daysOutSortBtn.textContent = activeSort.direction === 'desc' ? 'Days Out (High-Low)' : 'Days Out (Low-High)';
    } else if (activeSort.criterion === 'name') {
        nameSortBtn.classList.add('active');
        nameSortBtn.textContent = activeSort.direction === 'asc' ? 'Name (A-Z)' : 'Name (Z-A)';
    }
  }
  daysOutSortBtn.addEventListener('click', () => {
      if (activeSort.criterion !== 'daysout') {
          activeSort.criterion = 'daysout';
          activeSort.direction = 'desc';
      } else {
          activeSort.direction = activeSort.direction === 'desc' ? 'asc' : 'asc';
      }
      updateSortButtons();
      displayMasterList();
  });
  nameSortBtn.addEventListener('click', () => {
      if (activeSort.criterion !== 'name') {
          activeSort.criterion = 'name';
          activeSort.direction = 'asc';
      } else {
          activeSort.direction = activeSort.direction === 'asc' ? 'desc' : 'asc';
      }
      updateSortButtons();
      displayMasterList();
  });

  // --- Start/Stop Button ---
  const startBtn = document.getElementById('startBtn');
  const startBtnText = document.getElementById('startBtnText');
  let isStarted;
  function updateButtonState(state) {
    isStarted = (state === EXTENSION_STATES.ON);
    startBtn.classList.toggle('active', isStarted);
    startBtnText.textContent = isStarted ? 'Stop' : 'Start';
    if (!isStarted) {
        currentSessionId = null; 
    }
    updateLoopCounter();
  }
  chrome.storage.local.get({ [STORAGE_KEYS.EXTENSION_STATE]: EXTENSION_STATES.OFF }, data => updateButtonState(data[STORAGE_KEYS.EXTENSION_STATE]));
  startBtn.addEventListener('click', (event) => {
    createRipple(event);
    const newState = !isStarted ? EXTENSION_STATES.ON : EXTENSION_STATES.OFF;
    
    if (newState === EXTENSION_STATES.ON) {
        currentSessionId = `run_${Date.now()}`;
        chrome.storage.local.get({ [STORAGE_KEYS.CHECKER_MODE]: CHECKER_MODES.SUBMISSION }, (settings) => {
            const mode = settings[STORAGE_KEYS.CHECKER_MODE];
            const modeText = mode === CHECKER_MODES.MISSING ? 'Missing Assignments' : 'Submission Check';
            console.log({ type: 'sessionStart', sessionId: currentSessionId, title: `Checker started in ${modeText} mode` });
        });
    } else {
        console.log("Checker stopped.");
    }

    chrome.storage.local.set({ [STORAGE_KEYS.EXTENSION_STATE]: newState });
  });

  // --- Modals Logic ---
  document.getElementById('showJsonExampleBtn').addEventListener('click', () => openModal('json-modal'));
  document.getElementById('payloadExampleBtn').addEventListener('click', () => openModal('payload-modal'));
  document.getElementById('createConnectionBtn').addEventListener('click', () => {
      openModal('connections-modal');
      checkClipboardForConnection();
  });
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
      if (connectionToDelete) {
          const { [STORAGE_KEYS.CONNECTIONS]: currentConnections = [] } = await chrome.storage.local.get(STORAGE_KEYS.CONNECTIONS);
          const updatedConnections = currentConnections.filter(c => c.id !== connectionToDelete);
          await chrome.storage.local.set({ [STORAGE_KEYS.CONNECTIONS]: updatedConnections });
          connectionToDelete = null;
          closeModal('delete-confirm-modal');
      }
  });
  document.getElementById('cancelDeleteBtn').addEventListener('click', () => closeModal('delete-confirm-modal'));
  document.getElementById('copyExportBtn').addEventListener('click', (event) => {
    const text = document.getElementById('exportJsonContent').textContent;
    navigator.clipboard.writeText(text);
    const btn = event.target;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
  });
  document.getElementById('exportIncludeSecretToggle').addEventListener('change', updateExportView);

  document.getElementById('scheduleCardBtn').addEventListener('click', () => {
      openModal('schedule-modal');
  });

  // --- Report Modal Logic ---
  document.getElementById('toggleReportViewBtn').addEventListener('click', (e) => {
      const btn = e.target;
      const formattedView = document.getElementById('report-formatted-view');
      const jsonView = document.getElementById('report-json-view');
      const isJsonVisible = jsonView.style.display === 'block';

      if (isJsonVisible) {
          jsonView.style.display = 'none';
          formattedView.style.display = 'block';
          btn.textContent = 'View JSON';
      } else {
          jsonView.style.display = 'block';
          formattedView.style.display = 'none';
          btn.textContent = 'Formatted View';
          const jsonContent = document.getElementById('reportJsonContent');
          if (finalReportData) {
              jsonContent.textContent = JSON.stringify(finalReportData, null, 2);
          }
      }
  });

  document.getElementById('downloadReportCsvBtn').addEventListener('click', () => {
      if (!finalReportData) {
          console.error("No report data available to download.");
          return;
      }
      const csvContent = generateCsvContent(finalReportData);
      if (!csvContent) {
          alert("There is no data to export.");
          return;
      }
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const filename = `Missing_Assignments_Report_${dateStr}.csv`;
      downloadCsv(csvContent, filename);
  });
  
  // --- Report Tab Logic ---
  document.getElementById('downloadReportCsvBtnSidePanel').addEventListener('click', () => {
      if (!latestReportData) return;
      const csvContent = generateCsvContent(latestReportData);
      if (!csvContent) return;
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const filename = `Missing_Assignments_Report_${dateStr}.csv`;
      downloadCsv(csvContent, filename);
  });

  document.getElementById('toggleReportViewBtnSidePanel').addEventListener('click', (e) => {
      const btn = e.target;
      const formattedView = document.getElementById('report-formatted-view-sidepanel');
      const jsonView = document.getElementById('report-json-view-sidepanel');
      const isJsonVisible = jsonView.style.display === 'block';

      if (isJsonVisible) {
          jsonView.style.display = 'none';
          formattedView.style.display = 'block';
          btn.textContent = 'View JSON';
      } else {
          formattedView.style.display = 'none';
          jsonView.style.display = 'block';
          btn.textContent = 'Formatted View';
          const jsonContentEl = document.getElementById('reportJsonContentSidePanel');
          if (latestReportData && jsonContentEl) {
              jsonContentEl.textContent = JSON.stringify(latestReportData, null, 2);
          }
      }
  });
  
  document.getElementById('copyReportJsonBtnSidePanel').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const jsonText = document.getElementById('reportJsonContentSidePanel').textContent;
      
      navigator.clipboard.writeText(jsonText).then(() => {
          const copyIcon = btn.querySelector('.copy-icon');
          const checkmarkIcon = btn.querySelector('.checkmark-icon');
          copyIcon.style.display = 'none';
          checkmarkIcon.style.display = 'inline-block';
          
          setTimeout(() => {
              copyIcon.style.display = 'inline-block';
              checkmarkIcon.style.display = 'none';
          }, 2000);
      }).catch(err => {
          console.error('Failed to copy side panel JSON: ', err);
      });
  });

  document.getElementById('copyReportJsonBtn').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const jsonText = document.getElementById('reportJsonContent').textContent;
      
      navigator.clipboard.writeText(jsonText).then(() => {
          const copyIcon = btn.querySelector('.copy-icon');
          const checkmarkIcon = btn.querySelector('.checkmark-icon');
          copyIcon.style.display = 'none';
          checkmarkIcon.style.display = 'inline-block';
          
          setTimeout(() => {
              copyIcon.style.display = 'inline-block';
              checkmarkIcon.style.display = 'none';
          }, 2000);
      }).catch(err => {
          console.error('Failed to copy JSON: ', err);
      });
  });


  document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.modalId));
  });
  window.addEventListener('click', (event) => {
      if (event.target.classList.contains('modal-overlay')) {
          closeModal(event.target.id);
      }
      if (!event.target.closest('.connection-actions')) {
        document.querySelectorAll('.connection-menu.active').forEach(menu => {
            menu.classList.remove('active');
            menu.closest('li').querySelector('.connections-list')?.classList.remove('overflow-visible');
        });
      }
      if (!event.target.closest('#list-context-menu')) {
          document.getElementById('list-context-menu').style.display = 'none';
      }
  });
  
  // --- Connections Modal Specific Logic ---
  document.querySelectorAll('.connection-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
          const type = btn.dataset.type;
          if (btn.classList.contains('clipboard-match')) {
              autoFillForm(type);
          } else {
              document.getElementById('connection-chooser').style.display = 'none';
              document.getElementById('connection-form-container').style.display = 'block';
              document.getElementById(`${type}-form`).style.display = 'block';
          }
      });
  });

  document.querySelectorAll('.form-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => closeModal('connections-modal'));
  });

  document.getElementById('power-automate-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const editingId = form.dataset.editingId;
      const { [STORAGE_KEYS.CONNECTIONS]: connections = [] } = await chrome.storage.local.get(STORAGE_KEYS.CONNECTIONS);
      
      const connectionData = {
          type: CONNECTION_TYPES.POWER_AUTOMATE,
          name: document.getElementById('pa-name').value,
          url: document.getElementById('pa-url').value
      };

      if (editingId) {
          const updatedConnections = connections.map(conn => conn.id === editingId ? { ...conn, ...connectionData } : conn);
          await chrome.storage.local.set({ [STORAGE_KEYS.CONNECTIONS]: updatedConnections });
      } else {
          const newConnection = { id: `conn_${Date.now()}`, ...connectionData };
          await chrome.storage.local.set({ [STORAGE_KEYS.CONNECTIONS]: [...connections, newConnection] });
      }
      closeModal('connections-modal');
  });

  document.getElementById('pusher-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const editingId = form.dataset.editingId;
      const { [STORAGE_KEYS.CONNECTIONS]: connections = [] } = await chrome.storage.local.get(STORAGE_KEYS.CONNECTIONS);
      
      const connectionData = {
          type: CONNECTION_TYPES.PUSHER,
          name: document.getElementById('pusher-name').value,
          key: document.getElementById('pusher-key').value,
          cluster: document.getElementById('pusher-cluster').value,
          secret: document.getElementById('pusher-secret').value,
          channel: 'private-' + document.getElementById('pusher-channel').value,
          event: 'client-' + document.getElementById('pusher-event').value
      };

      if (editingId) {
          const updatedConnections = connections.map(conn => conn.id === editingId ? { ...conn, ...connectionData } : conn);
          await chrome.storage.local.set({ [STORAGE_KEYS.CONNECTIONS]: updatedConnections });
      } else {
          const newConnection = { id: `conn_${Date.now()}`, ...connectionData };
          await chrome.storage.local.set({ [STORAGE_KEYS.CONNECTIONS]: [...connections, newConnection] });
      }
      closeModal('connections-modal');
  });

  // --- Connection Test & Pusher Logic ---
  function str2ab(str) {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
  }

  async function triggerPusher(connection, payload) {
    try {
        const pusher = new Pusher(connection.key, {
            cluster: connection.cluster,
            authorizer: (channel, options) => {
                return {
                    authorize: async (socketId, callback) => {
                        try {
                            const stringToSign = `${socketId}:${connection.channel}`;
                            const cryptoKey = await crypto.subtle.importKey(
                                "raw",
                                str2ab(connection.secret),
                                { name: "HMAC", hash: "SHA-256" },
                                false,
                                ["sign"]
                            );
                            const signature = await crypto.subtle.sign("HMAC", cryptoKey, str2ab(stringToSign));
                            const signatureHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
                            callback(null, { auth: `${connection.key}:${signatureHex}` });
                        } catch (err) {
                            const errorMsg = "Failed to sign auth request. Check App Secret.";
                            console.error(errorMsg, err);
                            callback(new Error(errorMsg), null);
                        }
                    }
                };
            }
        });

        const channel = pusher.subscribe(connection.channel);
        await new Promise((resolve, reject) => {
            channel.bind('pusher:subscription_succeeded', () => {
                channel.trigger(connection.event, payload);
                console.log("Pusher event triggered from popup.");
                setTimeout(() => {
                    pusher.disconnect();
                    resolve();
                }, 500);
            });
            channel.bind('pusher:subscription_error', (status) => {
                console.error("Pusher subscription error:", JSON.stringify(status, null, 2));
                pusher.disconnect();
                reject(new Error(`Subscription failed with status: ${status.status}`));
            });
        });
        return { success: true };
    } catch (e) {
        console.error("Pusher error:", e);
        return { success: false, error: e.message };
    }
  }

  document.querySelector('#power-automate-form .form-test-btn').addEventListener('click', async () => {
      const url = document.getElementById('pa-url').value;
      const statusEl = document.getElementById('pa-test-status');
      if (!url) {
          statusEl.textContent = 'URL is required.';
          statusEl.className = 'test-status error';
          return;
      }
      statusEl.textContent = 'Testing...';
      statusEl.className = 'test-status';
      chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.TEST_CONNECTION_PA,
          connection: { type: CONNECTION_TYPES.POWER_AUTOMATE, url }
      });
  });

  document.querySelector('#pusher-form .form-test-btn').addEventListener('click', async () => {
      const statusEl = document.getElementById('pusher-test-status');
      
      const connection = {
          name: document.getElementById('pusher-name').value,
          key: document.getElementById('pusher-key').value,
          cluster: document.getElementById('pusher-cluster').value,
          secret: document.getElementById('pusher-secret').value,
          channel: 'private-' + document.getElementById('pusher-channel').value,
          event: 'client-' + document.getElementById('pusher-event').value
      };

      if (!connection.name || !connection.key || !connection.cluster || !connection.secret || !connection.channel || !connection.event) {
          statusEl.textContent = 'All fields are required.';
          statusEl.className = 'test-status error';
          return;
      }
      statusEl.textContent = 'Testing...';
      statusEl.className = 'test-status';
      const testPayload = {
          name: "Jane Doe (Test Submission)",
          grade: "95%",
          timestamp: new Date().toISOString(),
          url: "#test-url",
          test: true 
      };
      const result = await triggerPusher(connection, testPayload);

      if (result.success) {
          statusEl.textContent = 'Success! Test event sent.';
          statusEl.className = 'test-status success';
      } else {
          statusEl.textContent = `Failed: ${result.error}`;
          statusEl.className = 'test-status error';
      }
  });

  chrome.runtime.onMessage.addListener(async (message) => {
      if (message.type === MESSAGE_TYPES.CONNECTION_TEST_RESULT && message.connectionType === CONNECTION_TYPES.POWER_AUTOMATE) {
          const { success, error } = message;
          const statusEl = document.getElementById('pa-test-status');
          if (success) {
              statusEl.textContent = 'Success! Connection is working.';
              statusEl.className = 'test-status success';
          } else {
              statusEl.textContent = `Failed: ${error}`;
              statusEl.className = 'test-status error';
          }
      } else if (message.type === MESSAGE_TYPES.TRIGGER_PUSHER) {
          await triggerPusher(message.connection, message.payload);
      }
  });


  // --- Settings Inputs ---
  const settingsToSync = {
    concurrentTabsInput: { key: STORAGE_KEYS.CONCURRENT_TABS, type: 'number' },
    looperDaysOutFilterInput: { key: STORAGE_KEYS.LOOPER_DAYS_OUT_FILTER, type: 'text' },
    customKeywordInput: { key: STORAGE_KEYS.CUSTOM_KEYWORD, type: 'text' },
  };

  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    Object.entries(settingsToSync).forEach(([id, { key, type }]) => {
      const input = document.getElementById(id);
      if (input) {
        input.value = (key === STORAGE_KEYS.LOOPER_DAYS_OUT_FILTER && settings[key] === 'all') ? '' : settings[key];
      }
    });

    const colorPicker = document.getElementById('colorPicker');
    colorPicker.value = settings[STORAGE_KEYS.HIGHLIGHT_COLOR];

    const debugToggle = document.getElementById('debugToggle');
    debugToggle.checked = settings[STORAGE_KEYS.DEBUG_MODE];
    document.body.classList.toggle('debug-mode', settings[STORAGE_KEYS.DEBUG_MODE]);

    if (settings[STORAGE_KEYS.DEBUG_MODE]) {
        const consoleEl = document.getElementById('debug-console');
        const toggleBtn = document.getElementById('toggleConsoleBtn');
        consoleEl.classList.add('visible');
        toggleBtn.textContent = 'Hide Console';
    }

    const scheduleToggle = document.getElementById('scheduleToggle');
    const scheduleTime = document.getElementById('scheduleTime');
    const scheduleMasterList = document.getElementById('scheduleMasterList');

    if (scheduleToggle && scheduleTime && scheduleMasterList) {
        scheduleToggle.checked = settings[STORAGE_KEYS.SCHEDULED_CHECK_ENABLED];
        scheduleTime.value = settings[STORAGE_KEYS.SCHEDULED_CHECK_TIME];
        scheduleMasterList.value = settings[STORAGE_KEYS.SCHEDULED_MASTER_LIST];
        scheduleTime.disabled = !settings[STORAGE_KEYS.SCHEDULED_CHECK_ENABLED];
    }
  });

  Object.entries(settingsToSync).forEach(([id, { key, type }]) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('change', (event) => {
        let value = event.target.value.trim();
        if (type === 'number') {
            value = parseInt(value, 10);
            if (isNaN(value) || value < 1) value = 1;
            if (value > 10) value = 10;
            event.target.value = value;
        }
        chrome.storage.local.set({ [key]: value });
        if (key === STORAGE_KEYS.CUSTOM_KEYWORD) updateKeywordDisplay();
    });
  });
  
  document.getElementById('colorPicker').addEventListener('input', (event) => {
    chrome.storage.local.set({ [STORAGE_KEYS.HIGHLIGHT_COLOR]: event.target.value });
  });

  document.getElementById('debugToggle').addEventListener('change', (event) => {
    const isEnabled = event.target.checked;
    chrome.storage.local.set({ [STORAGE_KEYS.DEBUG_MODE]: isEnabled });
    document.body.classList.toggle('debug-mode', isEnabled);
    
    const consoleEl = document.getElementById('debug-console');
    const toggleBtn = document.getElementById('toggleConsoleBtn');
    if (isEnabled) {
        consoleEl.classList.add('visible');
        toggleBtn.textContent = 'Hide Console';
    } else {
        consoleEl.classList.remove('visible');
        toggleBtn.textContent = 'Show Console';
    }
  });

  const scheduleToggle = document.getElementById('scheduleToggle');
  const scheduleTime = document.getElementById('scheduleTime');
  const scheduleMasterList = document.getElementById('scheduleMasterList');

  if (scheduleToggle && scheduleTime && scheduleMasterList) {
      scheduleToggle.addEventListener('change', (event) => {
          const isEnabled = event.target.checked;
          scheduleTime.disabled = !isEnabled;
          chrome.storage.local.set({ [STORAGE_KEYS.SCHEDULED_CHECK_ENABLED]: isEnabled }, () => {
              chrome.runtime.sendMessage({ type: MESSAGE_TYPES.UPDATE_SCHEDULE });
          });
      });
    
      scheduleTime.addEventListener('change', (event) => {
          const time = event.target.value;
          chrome.storage.local.set({ [STORAGE_KEYS.SCHEDULED_CHECK_TIME]: time }, () => {
              chrome.runtime.sendMessage({ type: MESSAGE_TYPES.UPDATE_SCHEDULE });
          });
      });

      scheduleMasterList.addEventListener('change', (event) => {
        const listJson = event.target.value;
        chrome.storage.local.set({ [STORAGE_KEYS.SCHEDULED_MASTER_LIST]: listJson });
      });
  }
  
  const modeDisplayBtn = document.getElementById('activeModeDisplay');
    modeDisplayBtn.addEventListener('click', () => {
      chrome.storage.local.get({ [STORAGE_KEYS.CHECKER_MODE]: CHECKER_MODES.SUBMISSION }, (data) => {
        const currentMode = data[STORAGE_KEYS.CHECKER_MODE];
        const newMode = currentMode === CHECKER_MODES.SUBMISSION ? CHECKER_MODES.MISSING : CHECKER_MODES.SUBMISSION;
        chrome.storage.local.set({ [STORAGE_KEYS.CHECKER_MODE]: newMode });
        
        modeDisplayBtn.classList.add('animate-pop');
        modeDisplayBtn.addEventListener('animationend', () => {
          modeDisplayBtn.classList.remove('animate-pop');
        }, { once: true });
      });
    });

  document.getElementById('sharepointBtn').addEventListener('click', (event) => {
      createRipple(event);
      chrome.tabs.create({ url: SHAREPOINT_URL });
  });

  // --- Tooltip & Context Menu Logic ---
  document.addEventListener('mouseover', event => {
      const icon = event.target.closest('.info-icon');
      if (icon) {
          const rect = icon.getBoundingClientRect();
          const containerRect = document.querySelector('.container').getBoundingClientRect();
          
          icon.classList.remove('tooltip-left', 'tooltip-right');

          if (rect.left < containerRect.left + 10) {
              icon.classList.add('tooltip-right');
          } else if (rect.right > containerRect.right - 10) {
              icon.classList.add('tooltip-left');
          }
      }
  });
  
  const showContextMenu = (e) => {
      const listItem = e.target.closest('li');
      if (listItem && listItem.dataset.entry) {
          e.preventDefault();
          contextMenuEntry = JSON.parse(listItem.dataset.entry);
          
          const menu = document.getElementById('list-context-menu');
          const copyUrlBtn = document.getElementById('copyUrlBtn');
          const debugSendBtn = document.getElementById('debugSendBtn');
          
          const hasValidUrl = contextMenuEntry.url && contextMenuEntry.url.startsWith('http');
          copyUrlBtn.disabled = !hasValidUrl;
          debugSendBtn.disabled = !hasValidUrl;

          menu.style.display = 'block';
          menu.style.left = `${e.clientX}px`;
          menu.style.top = `${e.clientY}px`;
      }
  };

  document.getElementById('foundList').addEventListener('contextmenu', showContextMenu);
  document.getElementById('masterList').addEventListener('contextmenu', showContextMenu);

  document.getElementById('copyNameBtn').addEventListener('click', () => {
    if (contextMenuEntry && contextMenuEntry.name) {
        navigator.clipboard.writeText(contextMenuEntry.name);
    }
    document.getElementById('list-context-menu').style.display = 'none';
  });
  
  document.getElementById('copyUrlBtn').addEventListener('click', () => {
    if (contextMenuEntry && contextMenuEntry.url) {
        navigator.clipboard.writeText(contextMenuEntry.url);
    }
    document.getElementById('list-context-menu').style.display = 'none';
  });

  document.getElementById('debugSendBtn').addEventListener('click', () => {
    if (contextMenuEntry) {
        const payload = { ...contextMenuEntry, debug: true };
        chrome.runtime.sendMessage({ type: MESSAGE_TYPES.SEND_DEBUG_PAYLOAD, payload });
        console.log("Sent debug payload:", payload);
    }
    document.getElementById('list-context-menu').style.display = 'none';
  });

  // --- ABOUT TAB LOGIC ---
  loadAboutContent();

  // Final setup
    document.getElementById('version-display').addEventListener('click', () => {
        const aboutTab = document.getElementById('about');
        if (aboutTab.classList.contains('active')) {
            switchTab(lastActiveTab);
        } else {
            switchTab('about');
        }
    });

  // Set the default active tab based on the current mode
  chrome.storage.local.get({ [STORAGE_KEYS.CHECKER_MODE]: CHECKER_MODES.SUBMISSION }, (data) => {
      const initialTab = data[STORAGE_KEYS.CHECKER_MODE] === CHECKER_MODES.MISSING ? 'report' : 'found';
      switchTab(initialTab);
  });

  setupDebugConsole();
});

