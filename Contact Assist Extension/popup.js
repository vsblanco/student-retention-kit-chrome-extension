// [2025-12-12] Version 3.3 - Automation "Power Dialer" Logic
document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const mainContainer = document.getElementById('main-container');
    const messageEl = document.getElementById('message');
    const clipboardInfoEl = document.getElementById('clipboard-info');
    const nameEl = document.getElementById('contact-name');
    const phoneEl = document.getElementById('contact-phone'); 
    const syncBtn = document.getElementById('sync-btn');
    const syncStatusEl = document.getElementById('sync-status');
    const lastUpdatedEl = document.getElementById('last-updated');
    const initialsToggle = document.getElementById('initials-toggle');
    const autoInsertToggle = document.getElementById('auto-insert-toggle');
    const userNameInput = document.getElementById('user-name-input');
    const messageBankSection = document.getElementById('message-bank-section');
    const premadeMessagesContainer = document.getElementById('premade-messages-container');
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    const dataverseIcon = document.getElementById('dataverse-icon');

    // --- Custom Message Elements ---
    const customMessageInput = document.getElementById('custom-message-input');
    const addMessageBtn = document.getElementById('add-message-btn');
    const placeholderPills = document.querySelectorAll('.pill-btn');
    const customMessagesList = document.getElementById('custom-messages-list');
    
    // --- Action Button Element ---
    const actionBtn = document.getElementById('action-btn');
    const callStatusEl = document.getElementById('call-status');

    // --- State & Constants ---
    let currentMatchData = []; 
    let activeMatchIndex = 0; 
    let currentStudentName = null;
    let isAutomationRunning = false; // Tracks if we are in "Power Dial" mode

    const DEFAULT_MESSAGE_TEMPLATES = [
        "Hello {studentFirstName}, this is {userName} from Florida Technical College. I noticed it has been a couple of days since you last engaged with your course. Will you be able to submit an assignment by today?",
        "Hey {studentFirstName}, hope your day is going well. Will you be able to submit an assignment today?"
    ];
    
    if (dataverseIcon) {
        dataverseIcon.src = chrome.runtime.getURL('dataverse.webp');
        dataverseIcon.alt = 'Clipboard icon'; 
    }
    const version = chrome.runtime.getManifest().version;
    const versionEl = document.getElementById('version-number');
    if (versionEl) versionEl.textContent = `v${version}`;

    // --- Helper Functions ---
    const getFirstName = (fullName) => {
        if (!fullName) return '';
        if (fullName.includes(',')) {
            const parts = fullName.split(',');
            return parts[1] ? parts[1].trim() : fullName;
        }
        const parts = fullName.split(' ');
        return parts[0];
    };

    const openTab = (e) => {
        const tabId = e.currentTarget.dataset.tab;
        tabContents.forEach(tab => tab.style.display = 'none');
        tabLinks.forEach(link => link.classList.remove('active'));
        document.getElementById(tabId).style.display = (tabId === 'main-tab') ? 'flex' : 'block';
        e.currentTarget.classList.add('active');
    };

    // --- SMART BUTTON STATE LOGIC ---
    const updateButtonState = () => {
        if (!actionBtn) return;
        actionBtn.disabled = false;

        const count = currentMatchData.length;
        const isMulti = count > 1;

        if (isAutomationRunning) {
            // AUTOMATION MODE: ACTIVE
            // We are inside an automation sequence.
            actionBtn.dataset.state = 'auto-next';
            actionBtn.className = 'hangup-state'; // Red
            
            const nextIndex = activeMatchIndex + 1;
            if (nextIndex < count) {
                actionBtn.innerHTML = `<span>⏭️</span> <span>End & Call #${nextIndex + 1}</span>`;
            } else {
                actionBtn.innerHTML = `<span>🏁</span> <span>End & Finish</span>`;
            }

        } else {
            // STANDARD / START MODES
            if (isMulti) {
                // Multi-number detected, but not started yet
                actionBtn.dataset.state = 'auto-start';
                actionBtn.className = 'automation-start-state'; // Purple/Blue
                actionBtn.innerHTML = `<span>🚀</span> <span>Start Automation (${count})</span>`;
            } else {
                // Single number normal mode
                // Check if we are currently "in call" based on UI state (simple toggle logic)
                if (actionBtn.dataset.state === 'hangup') {
                    actionBtn.className = 'hangup-state';
                    actionBtn.innerHTML = '<span>❌</span> <span>End Call</span>';
                } else {
                    actionBtn.dataset.state = 'call';
                    actionBtn.className = 'call-state'; // Green
                    actionBtn.innerHTML = '<span>📞</span> <span>Call via Five9</span>';
                }
            }
        }
    };

    const renderActiveContact = async () => {
        const match = currentMatchData[activeMatchIndex];
        if (!match) return;

        // 1. Update Name
        nameEl.innerHTML = '<strong>Contact Match:</strong> ';
        if (match.name) {
            nameEl.appendChild(document.createTextNode(match.name));
            currentStudentName = match.name;
        } else {
            nameEl.appendChild(document.createTextNode('(Number not in your contacts)'));
            currentStudentName = null;
        }

        // 2. Update Phone (Dropdown)
        phoneEl.innerHTML = ''; 
        if (currentMatchData.length > 1) {
            const label = document.createElement('strong');
            label.textContent = `Active (${activeMatchIndex + 1} of ${currentMatchData.length}): `;
            phoneEl.appendChild(label);

            const select = document.createElement('select');
            select.style.marginLeft = '5px';
            select.style.padding = '2px';
            select.style.borderRadius = '4px';
            
            currentMatchData.forEach((m, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = m.phoneNumber;
                if (idx === activeMatchIndex) opt.selected = true;
                select.appendChild(opt);
            });

            select.addEventListener('change', (e) => {
                // If user manually changes dropdown, we break automation to prevent confusion
                if (isAutomationRunning) {
                    isAutomationRunning = false;
                    callStatusEl.textContent = "Automation paused by user.";
                }
                activeMatchIndex = parseInt(e.target.value);
                renderActiveContact(); 
                updateButtonState();
            });
            phoneEl.appendChild(select);
        } else {
            phoneEl.innerHTML = '<strong>Active Number:</strong> ';
            phoneEl.appendChild(document.createTextNode(match.phoneNumber));
        }

        // 3. Generate Messages
        const data = await chrome.storage.local.get(['pinnedMessages', 'customMessageTemplates', 'userName']);
        generatePremadeMessages(currentStudentName, userNameInput.value || data.userName, data.pinnedMessages || [], data.customMessageTemplates || []);
    };

    // --- Main Initialization ---
    const initializePopup = async () => {
        try {
            const data = await chrome.storage.local.get(['lastSyncTimestamp', 'contactMap', 'showInitials', 'userName', 'pinnedMessages', 'customMessageTemplates', 'autoInsertMessage']);
            
            syncBtn.querySelector('span').textContent = 'Update Master List';
            initialsToggle.checked = !!data.showInitials;
            autoInsertToggle.checked = !!data.autoInsertMessage;
            if (data.userName) userNameInput.value = data.userName;

            if (data.lastSyncTimestamp) {
                const d = new Date(data.lastSyncTimestamp);
                lastUpdatedEl.textContent = `Last Updated: ${d.toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true })}`;
            } else {
                lastUpdatedEl.textContent = 'No contacts synced yet.';
            }
            
            renderCustomMessages(data.customMessageTemplates || []);

            chrome.runtime.sendMessage({ type: 'getContactDataFromClipboard' }, (response) => {
                if (chrome.runtime.lastError) return;

                if (response && response.matches && response.matches.length > 0) {
                    messageEl.style.display = 'none';
                    clipboardInfoEl.style.display = 'block';
                    
                    // Only reset if it's a "fresh" load (not a refresh during automation)
                    if (!isAutomationRunning) {
                        currentMatchData = response.matches;
                        activeMatchIndex = 0;
                    }
                    
                    renderActiveContact();
                    updateButtonState();

                } else {
                    messageEl.textContent = 'No active phone number found.';
                    clipboardInfoEl.style.display = 'none';
                    if (messageBankSection) messageBankSection.style.display = 'none';
                }
            });
        } catch (error) {
            console.error("Failed to initialize popup:", error);
        } finally {
            mainContainer.style.visibility = 'visible';
            mainContainer.style.opacity = '1';
        }
    };

    const generatePremadeMessages = (studentName, userName, pinnedTemplates, customTemplates) => {
        if (!messageBankSection) return;

        if (!studentName) {
            messageBankSection.style.display = 'none';
            return;
        }

        const studentFirstName = getFirstName(studentName);
        const finalUserName = userName || '[Your Name]';
        const allTemplates = [...DEFAULT_MESSAGE_TEMPLATES, ...customTemplates];
        
        const messageObjects = allTemplates.map(template => {
            const finalText = template
                .replace(/{studentFirstName}/g, studentFirstName)
                .replace(/{userName}/g, finalUserName);
            
            return {
                text: finalText,
                genericTemplate: template,
                isPinned: pinnedTemplates.includes(template)
            };
        }).sort((a, b) => b.isPinned - a.isPinned);

        premadeMessagesContainer.innerHTML = '';

        messageObjects.forEach(msgObj => {
            const messageItem = document.createElement('div');
            messageItem.className = 'premade-message-item';
            if (msgObj.isPinned) {
                messageItem.classList.add('pinned');
                const pinIcon = document.createElement('span');
                pinIcon.className = 'pin-icon';
                pinIcon.textContent = '📌';
                messageItem.appendChild(pinIcon);
            }
            
            const textP = document.createElement('p');
            textP.textContent = msgObj.text;
            messageItem.appendChild(textP);

            messageItem.addEventListener('click', () => copyToClipboard(msgObj.text, textP, messageItem));
            messageItem.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e, msgObj.genericTemplate, msgObj.isPinned);
            });

            premadeMessagesContainer.appendChild(messageItem);
        });

        messageBankSection.style.display = 'flex';
    };

    tabLinks.forEach(link => link.addEventListener('click', openTab));

    syncBtn.addEventListener('click', () => {
        syncStatusEl.textContent = 'Reading clipboard...';
        syncBtn.disabled = true;
        chrome.runtime.sendMessage({ type: 'syncContacts' }, (response) => {
            if (response && response.success) {
                syncStatusEl.textContent = `Sync successful! ${response.count} contacts loaded.`;
                initializePopup();
            } else {
                syncStatusEl.textContent = `Sync failed: ${response.error || 'Check JSON'}`;
            }
            syncBtn.disabled = false;
        });
    });
    
    // --- SMART ACTION BUTTON HANDLER ---
    if (actionBtn) {
        actionBtn.addEventListener('click', () => {
            const state = actionBtn.dataset.state;
            const activeMatch = currentMatchData[activeMatchIndex];
            
            // 1. STANDARD CALL (Single Number)
            if (state === 'call') {
                actionBtn.disabled = true;
                actionBtn.innerHTML = 'Dialing...';
                callStatusEl.textContent = 'Dialing...';
                chrome.runtime.sendMessage({ type: 'triggerFive9Call', phoneNumber: activeMatch.phoneNumber });
            } 
            
            // 2. START AUTOMATION (Multi Number)
            else if (state === 'auto-start') {
                isAutomationRunning = true;
                activeMatchIndex = 0; // Ensure we start at the top
                renderActiveContact(); // Update UI to first contact
                updateButtonState(); // Will switch to "End & Call Next" style
                
                // Trigger First Call
                actionBtn.disabled = true;
                callStatusEl.textContent = 'Starting Automation...';
                chrome.runtime.sendMessage({ type: 'triggerFive9Call', phoneNumber: currentMatchData[0].phoneNumber });
            }

            // 3. AUTOMATION STEP (End & Next)
            else if (state === 'auto-next') {
                actionBtn.disabled = true;
                actionBtn.innerHTML = 'Ending...';
                callStatusEl.textContent = 'Ending current call...';
                // Trigger Hangup. The 'hangupStatus' listener below will handle the "Next" logic.
                chrome.runtime.sendMessage({ type: 'triggerFive9Hangup' });
            }

            // 4. STANDARD HANGUP
            else if (state === 'hangup') {
                actionBtn.disabled = true;
                actionBtn.innerHTML = 'Ending...';
                chrome.runtime.sendMessage({ type: 'triggerFive9Hangup' });
            }
        });
    }

    initialsToggle.addEventListener('change', () => {
        const showInitials = initialsToggle.checked;
        chrome.storage.local.set({ showInitials: showInitials }, () => {
            chrome.tabs.query({ active: true, url: ["*://voice.google.com/*", "*://app-atl.five9.com/*"] }, (tabs) => {
                tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'settingsChanged' }).catch(e => {}));
            });
        });
    });

    autoInsertToggle.addEventListener('change', () => {
        chrome.storage.local.set({ autoInsertMessage: autoInsertToggle.checked });
    });

    userNameInput.addEventListener('input', async () => {
        const name = userNameInput.value;
        await chrome.storage.local.set({ userName: name });
        if (currentStudentName) {
            const data = await chrome.storage.local.get(['pinnedMessages', 'customMessageTemplates']);
            generatePremadeMessages(currentStudentName, name, data.pinnedMessages || [], data.customMessageTemplates || []);
        }
    });
    
    // ... (togglePinMessage, showContextMenu, hideContextMenu, copyToClipboard, etc. - keep existing) ...
    // Note: Copied for brevity, assume standard helper functions here as in previous versions.
    const togglePinMessage = async (genericTemplate) => {
        const { pinnedMessages = [], customMessageTemplates = [] } = await chrome.storage.local.get(['pinnedMessages', 'customMessageTemplates']);
        const messageIndex = pinnedMessages.indexOf(genericTemplate);
        if (messageIndex > -1) pinnedMessages.splice(messageIndex, 1);
        else pinnedMessages.push(genericTemplate);
        await chrome.storage.local.set({ pinnedMessages });
        generatePremadeMessages(currentStudentName, userNameInput.value, pinnedMessages, customMessageTemplates);
    };

    const showContextMenu = (event, genericTemplate, isPinned) => {
        hideContextMenu();
        const menu = document.createElement('div');
        menu.id = 'custom-context-menu';
        menu.className = 'custom-context-menu';
        menu.style.top = `${event.clientY}px`;
        menu.style.left = `${event.clientX}px`;
        const pinOption = document.createElement('div');
        pinOption.className = 'custom-context-menu-item';
        pinOption.textContent = isPinned ? 'Unpin' : 'Pin';
        pinOption.onclick = () => { togglePinMessage(genericTemplate); hideContextMenu(); };
        menu.appendChild(pinOption);
        document.body.appendChild(menu);
    };

    const hideContextMenu = () => {
        const existingMenu = document.getElementById('custom-context-menu');
        if (existingMenu) existingMenu.remove();
    };
    
    const copyToClipboard = (textToCopy, textElement, itemElement) => {
        chrome.runtime.sendMessage({ type: 'copyToClipboard', text: textToCopy }, () => {
            const originalText = textElement.textContent;
            textElement.textContent = 'Copied!';
            itemElement.style.backgroundColor = '#cce0ff';
            setTimeout(() => {
                textElement.textContent = originalText;
                itemElement.style.backgroundColor = ''; 
            }, 1500);
        });
    };
    
    const insertPlaceholder = (placeholder) => {
        const start = customMessageInput.selectionStart;
        const end = customMessageInput.selectionEnd;
        const text = customMessageInput.value;
        customMessageInput.value = text.substring(0, start) + placeholder + text.substring(end);
        customMessageInput.focus();
        customMessageInput.selectionEnd = start + placeholder.length;
    };

    const saveCustomMessage = async () => {
        const newTemplate = customMessageInput.value.trim();
        if (!newTemplate) return;
        addMessageBtn.disabled = true;
        const { customMessageTemplates = [], pinnedMessages = [] } = await chrome.storage.local.get(['customMessageTemplates', 'pinnedMessages']);
        if (!customMessageTemplates.includes(newTemplate)) {
            customMessageTemplates.push(newTemplate);
            await chrome.storage.local.set({ customMessageTemplates });
            renderCustomMessages(customMessageTemplates);
            customMessageInput.value = '';
            if (currentStudentName) generatePremadeMessages(currentStudentName, userNameInput.value, pinnedMessages, customMessageTemplates);
        }
        addMessageBtn.disabled = false;
    };

    const deleteCustomMessage = async (templateToDelete) => {
        const { customMessageTemplates = [], pinnedMessages = [] } = await chrome.storage.local.get(['customMessageTemplates', 'pinnedMessages']);
        const newTemplates = customMessageTemplates.filter(t => t !== templateToDelete);
        const newPinned = pinnedMessages.filter(p => p !== templateToDelete);
        await chrome.storage.local.set({ customMessageTemplates: newTemplates, pinnedMessages: newPinned });
        renderCustomMessages(newTemplates);
        if (currentStudentName) generatePremadeMessages(currentStudentName, userNameInput.value, newPinned, newTemplates);
    };

    const renderCustomMessages = (templates) => {
        customMessagesList.innerHTML = '';
        templates.forEach(template => {
            const item = document.createElement('div');
            item.className = 'custom-message-list-item';
            const text = document.createElement('span');
            text.textContent = template;
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = 'Delete message';
            deleteBtn.onclick = () => deleteCustomMessage(template);
            item.appendChild(text); item.appendChild(deleteBtn);
            customMessagesList.appendChild(item);
        });
    };

    placeholderPills.forEach(pill => {
        pill.addEventListener('click', () => insertPlaceholder(pill.dataset.placeholder));
    });

    addMessageBtn.addEventListener('click', saveCustomMessage);
    document.addEventListener('click', hideContextMenu);

    // --- GLOBAL MESSAGE LISTENER ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!sender.tab && message.type === 'dataChanged') {
            console.log('Side panel detected data change, reloading...');
            if (!isAutomationRunning) {
                initializePopup(); // Only reload if not currently automating
            }
        }

        // --- CALL STATUS ---
        if (message.type === 'callStatus') {
            if (callStatusEl) {
                if (message.success) {
                    if (isAutomationRunning) {
                        callStatusEl.textContent = `Dialing #${activeMatchIndex + 1}...`;
                    } else {
                        // Standard mode
                        actionBtn.dataset.state = 'hangup';
                        updateButtonState();
                        callStatusEl.textContent = 'Calling!';
                    }
                    callStatusEl.style.color = 'green';
                } else {
                    // Call Failed
                    actionBtn.disabled = false;
                    callStatusEl.textContent = message.error || 'Call failed.';
                    callStatusEl.style.color = 'red';
                }
            }
            updateButtonState();
        }
        
        // --- HANGUP STATUS (CRITICAL FOR AUTOMATION) ---
        if (message.type === 'hangupStatus') {
            if (callStatusEl) {
                if (message.success) {
                    callStatusEl.textContent = 'Ended.';
                    
                    // *** AUTOMATION LOGIC ***
                    if (isAutomationRunning) {
                        activeMatchIndex++; // Move to next number
                        
                        if (activeMatchIndex < currentMatchData.length) {
                            // NEXT NUMBER EXISTS -> DIAL IT
                            callStatusEl.textContent = `Auto-dialing #${activeMatchIndex + 1}...`;
                            renderActiveContact(); // Update Name/Messages UI
                            updateButtonState();   // Update Button Text
                            
                            // Trigger Call after short delay
                            setTimeout(() => {
                                chrome.runtime.sendMessage({ 
                                    type: 'triggerFive9Call', 
                                    phoneNumber: currentMatchData[activeMatchIndex].phoneNumber 
                                });
                            }, 1000); 
                        } else {
                            // LIST FINISHED
                            isAutomationRunning = false;
                            activeMatchIndex = 0; // Reset
                            callStatusEl.textContent = 'Automation Complete.';
                            renderActiveContact();
                            updateButtonState();
                        }
                    } else {
                        // STANDARD MODE -> RESET TO CALL BUTTON
                        actionBtn.dataset.state = 'call';
                        updateButtonState();
                    }
                } else {
                    // Hangup Failed
                    callStatusEl.textContent = message.error || 'Hangup failed.';
                    callStatusEl.style.color = 'red';
                    // We allow button re-click even on fail
                    actionBtn.disabled = false;
                }
            }
        }
    });

    // --- Initial Execution ---
    initializePopup();
});