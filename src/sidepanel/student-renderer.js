// Student Renderer - Handles rendering of student lists and active student display
import { elements } from './ui-manager.js';
import { GENERIC_AVATAR_URL } from '../constants/index.js';

/**
 * Normalizes student data for consistent rendering
 */
export function resolveStudentData(entry) {
    return {
        name: entry.name || 'Unknown Student',
        sortable_name: entry.sortable_name || null,
        phone: entry.phone || null,
        daysOut: parseInt(entry.daysout || 0),
        missing: parseInt(entry.missingCount || 0),
        StudentNumber: entry.StudentNumber || null,
        SyStudentId: entry.SyStudentId || null,
        url: entry.url || null,
        Photo: entry.Photo || null,
        isNew: entry.isNew || false,
        created_at: entry.created_at || null,
        timestamp: entry.timestamp || null,
        assignment: entry.assignment || null
    };
}

/**
 * Sets the active student in the contact tab
 * @param {Object|null} rawEntry - The student data or null to clear
 * @param {Object} callManager - Reference to call manager for state updates
 */
export function setActiveStudent(rawEntry, callManager) {
    const contactTab = document.getElementById('contact');
    if (!contactTab) return;

    // Reset automation styles when switching (but not during active automation)
    if (!callManager?.automationMode) {
        if (elements.dialBtn) {
            elements.dialBtn.classList.remove('automation');
            elements.dialBtn.innerHTML = '<i class="fas fa-phone"></i>';
        }
        if (callManager) {
            callManager.updateCallInterfaceState();
        }
        if (elements.upNextCard) {
            elements.upNextCard.style.display = 'none';
        }
        if (elements.manageQueueBtn) {
            elements.manageQueueBtn.style.display = 'none';
        }
    }

    // 1. Handle "No Student Selected" State
    if (!rawEntry) {
        Array.from(contactTab.children).forEach(child => {
            if (child.id === 'contactPlaceholder') {
                child.style.display = 'flex';
            } else if (child.id === 'five9ConnectionIndicator') {
                // Five9 indicator managed separately
            } else {
                child.style.display = 'none';
            }
        });
        return;
    }

    // 2. Handle "Student Selected" State
    Array.from(contactTab.children).forEach(child => {
        if (child.id === 'contactPlaceholder') {
            child.style.display = 'none';
        } else if (child.id === 'five9ConnectionIndicator') {
            // Five9 indicator managed separately
        } else {
            child.style.display = '';
        }
    });

    const data = resolveStudentData(rawEntry);

    // Generate initials from name
    const nameParts = data.name.trim().split(/\s+/);
    let initials = '';
    if (nameParts.length > 0) {
        const firstInitial = nameParts[0][0] || '';
        const lastInitial = nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : '';
        initials = (firstInitial + lastInitial).toUpperCase();
        if (!initials) initials = '?';
    }

    const displayPhone = data.phone ? data.phone : "No Phone Listed";

    // AVATAR LOGIC
    if (elements.contactAvatar) {
        elements.contactAvatar.style.color = '';
        if (data.Photo && data.Photo !== GENERIC_AVATAR_URL) {
            elements.contactAvatar.textContent = '';
            elements.contactAvatar.style.backgroundImage = `url('${data.Photo}')`;
            elements.contactAvatar.style.backgroundSize = 'cover';
            elements.contactAvatar.style.backgroundPosition = 'center';
            elements.contactAvatar.style.backgroundColor = 'transparent';
        } else {
            elements.contactAvatar.style.backgroundImage = 'none';
            elements.contactAvatar.textContent = initials;
            elements.contactAvatar.style.backgroundColor = '#e0e7ff';
        }
    }

    if (elements.contactName) elements.contactName.textContent = data.name;
    if (elements.contactPhone) elements.contactPhone.textContent = displayPhone;

    if (elements.contactDetail) {
        elements.contactDetail.textContent = `${data.daysOut} Days Out`;
        elements.contactDetail.style.display = 'block';
    }

    let colorCode = '#10b981';
    if (data.daysOut > 10) colorCode = '#ef4444';
    else if (data.daysOut > 5) colorCode = '#f97316';
    else if (data.daysOut > 2) colorCode = '#f59e0b';

    if (elements.contactCard) {
        elements.contactCard.style.borderLeftColor = colorCode;
    }
}

/**
 * Sets the automation mode UI with gray styling
 * @param {number} queueLength - Number of students in queue
 */
export function setAutomationModeUI(queueLength) {
    const contactTab = document.getElementById('contact');
    if (!contactTab) return;

    // Ensure content is visible (hide placeholder)
    Array.from(contactTab.children).forEach(child => {
        if (child.id === 'contactPlaceholder') {
            child.style.display = 'none';
        } else {
            child.style.display = '';
        }
    });

    // Update Contact Card
    if (elements.contactName) elements.contactName.textContent = "Automation Mode";
    if (elements.contactDetail) elements.contactDetail.textContent = `${queueLength} Students Selected`;
    if (elements.contactPhone) elements.contactPhone.textContent = "Multi-Dial Queue";

    // Create visual badge for count
    if (elements.contactAvatar) {
        elements.contactAvatar.textContent = queueLength;
        elements.contactAvatar.style.backgroundImage = 'none';
        elements.contactAvatar.style.backgroundColor = '#6b7280';
        elements.contactAvatar.style.color = '#ffffff';
    }

    // Transform the Dial Button to Gray
    if (elements.dialBtn) {
        elements.dialBtn.classList.add('automation');
        elements.dialBtn.innerHTML = '<i class="fas fa-robot"></i>';
    }

    // Update Status Text
    if (elements.callStatusText) {
        elements.callStatusText.innerHTML = `<span class="status-indicator" style="background:#6b7280;"></span> Ready to Auto-Dial`;
    }

    if (elements.contactCard) {
        elements.contactCard.style.borderLeftColor = '#6b7280';
    }

    // Show Manage Queue Button
    if (elements.manageQueueBtn) {
        elements.manageQueueBtn.style.display = 'block';
    }
}

/**
 * Renders the found submissions list
 * @param {Array} rawEntries - Array of found submissions
 */
export function renderFoundList(rawEntries) {
    if (!elements.foundList) return;
    elements.foundList.innerHTML = '';

    if (!rawEntries || rawEntries.length === 0) {
        elements.foundList.innerHTML = '<li style="justify-content:center; color:gray;">No submissions found yet.</li>';
        return;
    }

    const entries = rawEntries.map(resolveStudentData);
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    entries.forEach(data => {
        const li = document.createElement('li');
        let timeDisplay = 'Just now';
        if (data.timestamp) {
            timeDisplay = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const assignmentTitle = data.assignment || 'Untitled Assignment';

        li.innerHTML = `
            <div style="display: flex; align-items: center; width:100%;">
                <div class="heatmap-indicator heatmap-green"></div>
                <div style="flex-grow:1; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; flex-direction:column;">
                        <span class="student-name" style="font-weight:500; color:var(--primary-color); cursor:pointer;">${data.name}</span>
                        <span style="font-size:0.8em; color:var(--text-secondary);">${assignmentTitle}</span>
                    </div>
                    <span class="timestamp-pill">${timeDisplay}</span>
                </div>
            </div>
        `;

        const nameLink = li.querySelector('.student-name');
        nameLink.addEventListener('click', (e) => {
            e.stopPropagation();
            if (data.url) chrome.tabs.create({ url: data.url });
        });
        nameLink.addEventListener('mouseenter', () => nameLink.style.textDecoration = 'underline');
        nameLink.addEventListener('mouseleave', () => nameLink.style.textDecoration = 'none');

        elements.foundList.appendChild(li);
    });
}

/**
 * Filters the found list based on search term
 * @param {Event} e - Input event
 */
export function filterFoundList(e) {
    const term = e.target.value.toLowerCase();
    const items = elements.foundList.querySelectorAll('li');
    items.forEach(li => {
        const text = li.textContent.toLowerCase();
        li.style.display = text.includes(term) ? 'flex' : 'none';
    });
}

/**
 * Renders the master student list
 * @param {Array} rawEntries - Array of student data
 * @param {Function} onStudentClick - Callback when student is clicked
 */
export function renderMasterList(rawEntries, onStudentClick) {
    if (!elements.masterList) return;
    elements.masterList.innerHTML = '';

    // Update total count indicator
    if (elements.totalCountText) {
        const count = rawEntries ? rawEntries.length : 0;
        elements.totalCountText.textContent = `Total Students: ${count}`;
    }

    if (!rawEntries || rawEntries.length === 0) {
        elements.masterList.innerHTML = '<li style="justify-content:center;">Master list is empty.</li>';
        return;
    }

    rawEntries.forEach(rawEntry => {
        const data = resolveStudentData(rawEntry);

        const li = document.createElement('li');
        li.className = 'expandable';
        li.style.cursor = 'pointer';

        li.setAttribute('data-name', data.name);
        li.setAttribute('data-missing', data.missing);
        li.setAttribute('data-days', data.daysOut);
        li.setAttribute('data-created', data.created_at || '');

        let heatmapClass = data.daysOut > 10 ? 'heatmap-red' : (data.daysOut > 5 ? 'heatmap-orange' : (data.daysOut > 2 ? 'heatmap-yellow' : 'heatmap-green'));

        let missingPillHtml = '';
        if (data.missing > 0) {
            missingPillHtml = `<span class="missing-pill">${data.missing} Missing <i class="fas fa-chevron-down" style="font-size:0.8em; margin-left:4px;"></i></span>`;
        }

        let newTagHtml = '';
        if (data.isNew) {
            newTagHtml = `<span style="background:#e0f2fe; color:#0369a1; font-size:0.7em; padding:2px 6px; border-radius:8px; margin-left:6px; font-weight:bold; border:1px solid #bae6fd;">New</span>`;
        }

        // Build missing assignments details HTML
        let missingDetailsHtml = '<li><em>No missing assignments found.</em></li>';
        if (rawEntry.missingAssignments && rawEntry.missingAssignments.length > 0) {
            missingDetailsHtml = rawEntry.missingAssignments.map(assignment => {
                const linkHtml = assignment.submissionLink
                    ? `<a href="${assignment.submissionLink}" target="_blank" style="color:#2563eb; text-decoration:none;">${assignment.title}</a>`
                    : assignment.title;
                return `<li style="margin-bottom:6px;">
                    ${linkHtml}
                    <div style="font-size:0.9em; color:#6b7280; margin-top:2px;">
                        Due: ${assignment.dueDate} | Score: ${assignment.score}
                    </div>
                </li>`;
            }).join('');
        }

        li.innerHTML = `
            <div style="display: flex; align-items: center; width:100%;">
                <div class="heatmap-indicator ${heatmapClass}"></div>
                <div style="flex-grow:1;">
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <div style="display:flex; align-items:center;">
                            <span class="student-name" style="font-weight: 500; color:var(--text-main); position:relative; z-index:2;">${data.name}</span>
                            ${newTagHtml}
                        </div>
                        ${missingPillHtml}
                    </div>
                    <span style="font-size:0.8em; color:gray;">${data.daysOut} Days Out</span>
                </div>
            </div>
            <div class="missing-details" style="display: none; margin-top: 10px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 8px; cursor: default;">
                <ul style="padding: 0; margin: 0; font-size: 0.85em; color: #4b5563; list-style-type: none;">
                    ${missingDetailsHtml}
                </ul>
            </div>
        `;

        // Click listener for student selection
        li.addEventListener('click', (e) => {
            if (onStudentClick) {
                onStudentClick(rawEntry, li, e);
            }
        });

        // Student name click - open gradebook
        const nameLink = li.querySelector('.student-name');
        if (nameLink) {
            nameLink.addEventListener('click', (e) => {
                e.stopPropagation();
                if (data.url) chrome.tabs.create({ url: data.url });
            });
            nameLink.addEventListener('mouseenter', () => {
                nameLink.style.textDecoration = 'underline';
                nameLink.style.color = 'var(--primary-color)';
            });
            nameLink.addEventListener('mouseleave', () => {
                nameLink.style.textDecoration = 'none';
                nameLink.style.color = 'var(--text-main)';
            });
        }

        // Missing pill click - toggle details
        const pill = li.querySelector('.missing-pill');
        if (pill) {
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                const details = li.querySelector('.missing-details');
                const icon = pill.querySelector('i');
                if (details) {
                    const isHidden = details.style.display === 'none' || !details.style.display;
                    details.style.display = isHidden ? 'block' : 'none';
                    if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
                }
            });
        }

        // Prevent click propagation on details div
        const detailsDiv = li.querySelector('.missing-details');
        if (detailsDiv) {
            detailsDiv.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        elements.masterList.appendChild(li);
    });
}

/**
 * Filters the master list based on search term
 * @param {Event} e - Input event
 */
export function filterMasterList(e) {
    const term = e.target.value.toLowerCase();
    const listItems = elements.masterList.querySelectorAll('li.expandable');
    listItems.forEach(li => {
        const name = li.getAttribute('data-name').toLowerCase();
        li.style.display = name.includes(term) ? 'flex' : 'none';
    });
}

/**
 * Sorts the master list based on selected criteria
 */
export function sortMasterList() {
    const criteria = elements.sortSelect.value;
    const listItems = Array.from(elements.masterList.querySelectorAll('li.expandable'));

    listItems.sort((a, b) => {
        if (criteria === 'name') {
            return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));
        } else if (criteria === 'missing') {
            return parseInt(b.getAttribute('data-missing')) - parseInt(a.getAttribute('data-missing'));
        } else if (criteria === 'days') {
            return parseInt(b.getAttribute('data-days')) - parseInt(a.getAttribute('data-days'));
        } else if (criteria === 'newest') {
            const dateA = new Date(a.getAttribute('data-created') || 0);
            const dateB = new Date(b.getAttribute('data-created') || 0);
            return dateB - dateA;
        }
    });
    listItems.forEach(item => elements.masterList.appendChild(item));
}
