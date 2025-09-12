// popup.js

const MASTER_FLOW_URL =
  "https://prod-10.westus.logic.azure.com:443/workflows/a9e08bd1329c40ffb9bf28bbc35e710a/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=cR_TUW8U-2foOb1XEAPmKxbK-2PLMK_IntYpxd2WOSo";

// Helper to render the Found list
function renderFoundList(entries) {
  const list = document.getElementById('foundList');
  list.innerHTML = '';
  entries.forEach(({ name, time, url }) => {
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.textContent = name;
    a.href = '#';
    a.style.color = 'var(--accent-color)';
    a.style.textDecoration = 'none';
    a.addEventListener('click', e => {
      e.preventDefault();
      chrome.tabs.create({ url });
      window.close();
    });
    li.appendChild(a);
    li.appendChild(document.createTextNode(`  ${time}`));
    list.appendChild(li);
  });
}

// --- THIS FUNCTION IS UPDATED ---
// Helper to render the Master list with phone numbers
function renderMasterList(entries) {
  const list = document.getElementById('masterList');
  list.innerHTML = '';
  entries.forEach(({ name, time, url, phone }) => { // Destructure the new 'phone' property
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.textContent = name;
    a.href = '#';
    a.style.color = 'var(--accent-color)';
    a.style.textDecoration = 'none';
    a.addEventListener('click', e => {
      e.preventDefault();
      chrome.tabs.create({ url });
      window.close();
    });
    li.appendChild(a);

    // If a phone number exists, create and append a styled span for it
    if (phone) {
        const phoneSpan = document.createElement('span');
        phoneSpan.className = 'phone-number'; // Use the new CSS class
        phoneSpan.textContent = phone;
        li.appendChild(phoneSpan);
    }
    
    // The 'time' property is likely unused for the master list, but we'll leave it
    if (time) {
        li.appendChild(document.createTextNode(`  ${time}`));
    }
    list.appendChild(li);
  });
}

// --- THIS FUNCTION IS UPDATED ---
async function updateMaster() {
  const list = document.getElementById('masterList');
  list.innerHTML = '<li>Loading…</li>';
  try {
    const resp = await fetch(MASTER_FLOW_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'  
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const students = data.students || [];

    // Map the new 'phone' property from the response to our storage format
    const entries = students.map(s => ({
      name: s.name,
      time: s.time || '',
      url:  s.url,
      phone: s.phone || '' // Add the phone number property
    }));

    await new Promise(res => chrome.storage.local.set({ masterEntries: entries }, res));
    document.querySelector('.tab-button[data-tab="master"] .count')
      .textContent = entries.length;
    renderMasterList(entries);
  } catch (e) {
    console.error('Failed to update master list', e);
    list.innerHTML = '<li>Error loading list</li>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  let isStarted; 
  const manifest = chrome.runtime.getManifest();
  document.getElementById('version-display').textContent = `Version ${manifest.version}`;
  const now = new Date();
  const opts = { month: 'short', day: 'numeric' };
  document.getElementById('keyword').textContent =
    now.toLocaleDateString('en-US', opts).replace(',', '') + ' at';

  // --- Functions below this line are unchanged ---
  chrome.storage.local.get({ foundEntries: [] }, data => {
    document.querySelector('.tab-button[data-tab="found"] .count')
      .textContent = data.foundEntries.length;
    if (data.foundEntries.length) renderFoundList(data.foundEntries);
    else {
      document.getElementById('foundList').innerHTML = '<li>None yet</li>';
    }
  });
  chrome.storage.local.get({ masterEntries: [] }, data => {
    const badge = document.querySelector('.tab-button[data-tab="master"] .count');
    badge.textContent = data.masterEntries.length;
    if (data.masterEntries.length) renderMasterList(data.masterEntries);
    else {
      document.getElementById('masterList').innerHTML = '<li>None yet</li>';
    }
  });
  document.getElementById('clearBtn')
    .addEventListener('click', () => {
      chrome.storage.local.set({ foundEntries: [] }, () => location.reload());
    });
  document.getElementById('updateMasterBtn')
    .addEventListener('click', updateMaster);
  const tabs = document.querySelectorAll('.tab-button');
  const panes = document.querySelectorAll('.tab-content');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.toggle('active', b === btn));
      panes.forEach(p => p.classList.toggle('active', p.id === btn.dataset.tab));
    });
  });
  const startBtn = document.getElementById('startBtn');
  const startBtnText = document.getElementById('startBtnText');
  function updateButtonState(state) {
    isStarted = (state === 'on');
    if (isStarted) {
      startBtn.style.backgroundColor = 'var(--light-accent-color)';
      startBtnText.textContent = 'Stop';
    } else {
      startBtn.style.backgroundColor = 'var(--accent-color)';
      startBtnText.textContent = 'Start';
    }
  }
  if (startBtn && startBtnText) {
    chrome.storage.local.get({ extensionState: 'off' }, data => {
      updateButtonState(data.extensionState);
    });
    startBtn.addEventListener('click', (event) => {
      const rect = startBtn.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = 'ripple';
      ripple.style.height = ripple.style.width = Math.max(rect.width, rect.height) + "px";
      const x = event.clientX - rect.left - ripple.offsetWidth / 2;
      const y = event.clientY - rect.top - ripple.offsetHeight / 2;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      startBtn.appendChild(ripple);
      setTimeout(() => {
        ripple.remove();
      }, 600);
      const newState = !isStarted ? 'on' : 'off';
      chrome.storage.local.set({ extensionState: newState });
      updateButtonState(newState);
    });
  }
});