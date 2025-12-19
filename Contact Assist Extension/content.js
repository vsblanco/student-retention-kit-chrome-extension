// [2025-12-12] Version 3.4 - Robust Automation (Handles Manual Hangup)
// This script runs on supported pages to find and replace phone numbers.

// --- Site-Specific Configurations ---
const siteConfigs = {
    'voice.google.com': {
        itemSelector: 'gv-thread-list-item',
        processFunction: processGoogleVoiceItem,
        initialize: initializeGoogleVoice,
    },
    'app-atl.five9.com': {
        itemSelector: 'div.column-callable, span.info-contact',
        processFunction: processGenericItem,
        initialize: initializeGenericSite,
    }
};

// --- Helper Functions ---

function reformatName(name) {
    if (name.includes(',')) {
        const parts = name.split(',').map(part => part.trim());
        if (parts.length === 2 && parts[0] && parts[1]) {
            return `${parts[1]} ${parts[0]}`;
        }
    }
    return name;
}

function getFirstName(fullName) {
    if (!fullName) return '';
    if (fullName.includes(',')) {
        const parts = fullName.split(',');
        return parts[1] ? parts[1].trim().split(' ')[0] : fullName;
    }
    const parts = fullName.split(' ');
    return parts[0];
};

// --- Generic Processing Function ---

function processGenericItem(element) {
    if (!element || !element.textContent || element.hasAttribute('data-processed')) return;

    const phoneRegex = /(\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/;
    const match = element.textContent.match(phoneRegex);

    if (match) {
        const phoneNumber = match[0];
        element.setAttribute('data-processed', 'true');

        chrome.runtime.sendMessage({ type: 'getNameForNumber', phoneNumber: phoneNumber }, (response) => {
            if (chrome.runtime.lastError || !document.body.contains(element)) return;

            if (response && response.name) {
                const formattedName = reformatName(response.name);
                element.dataset.originalNumber = phoneNumber;
                element.dataset.resolvedName = formattedName;
                element.textContent = element.textContent.replace(phoneNumber, formattedName);

                const revertObserver = new MutationObserver(() => {
                    if (!document.body.contains(element)) {
                        revertObserver.disconnect();
                        return;
                    }
                    if (element.textContent.includes(element.dataset.originalNumber)) {
                        console.log(`Contact Assist: Re-applying name for ${element.dataset.originalNumber}`);
                        revertObserver.disconnect();
                        element.textContent = element.textContent.replace(element.dataset.originalNumber, element.dataset.resolvedName);
                        revertObserver.observe(element, { childList: true, characterData: true, subtree: true });
                    }
                });
                revertObserver.observe(element, { childList: true, characterData: true, subtree: true });
            } else {
                element.removeAttribute('data-processed');
            }
        });
    }
}

// --- Google Voice Specific Functions ---

function getInitials(fullName) {
    const parts = fullName.split(' ');
    if (parts.length > 1) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0]) {
        return parts[0][0].toUpperCase();
    }
    return '';
}

function createInitialsAvatar(initials, color) {
    const avatar = document.createElement('div');
    avatar.textContent = initials;
    avatar.className = 'avatar contact-assist-avatar';
    Object.assign(avatar.style, {
        width: '36px', height: '36px', borderRadius: '50%',
        backgroundColor: color || '#00796b', color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '14px', fontWeight: 'bold', flexShrink: '0'
    });
    return avatar;
}

function createDefaultIcon() {
    const icon = document.createElement('mat-icon');
    icon.setAttribute('role', 'img');
    icon.className = 'mat-icon notranslate person mat-icon-no-color ng-star-inserted';
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fit="" preserveAspectRatio="xMidYMid meet" focusable="false"><path d="M12 6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2m0 9c2.7 0 5.8 1.29 6 2v1H6v-.99c.2-.72 3.3-2.01 6-2.01m0-11C9.79 4 8 5.79 8 8s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 9c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4z"></path></svg>`;
    return icon;
}

function showCopiedFeedback(element) {
    const feedback = document.createElement('div');
    feedback.textContent = 'Copied!';
    Object.assign(feedback.style, {
        position: 'absolute', top: '10px', right: '10px',
        backgroundColor: 'rgba(0, 120, 212, 0.9)', color: 'white',
        padding: '4px 8px', borderRadius: '4px', fontSize: '12px',
        fontWeight: 'bold', zIndex: '9999', opacity: '1',
        transition: 'opacity 0.5s ease-out'
    });
    if (getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
    }
    element.appendChild(feedback);
    setTimeout(() => {
        feedback.style.opacity = '0';
        setTimeout(() => feedback.remove(), 500);
    }, 1000);
}

function processGoogleVoiceItem(threadContainer, showInitials) {
    if (!chrome || !chrome.runtime?.id) return;

    const textElement = threadContainer.querySelector('div.primary-text, gv-annotation.participants');
    if (!textElement || !textElement.textContent) return;

    const originalText = textElement.textContent;
    const cleanedText = originalText.replace(/[\u202A-\u202F]/g, '').trim();
    const phoneRegex = /(\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/;
    
    let numberToProcess = null;
    if (phoneRegex.test(cleanedText)) {
        numberToProcess = cleanedText.match(phoneRegex)[0];
        threadContainer.dataset.phoneNumber = numberToProcess;
    } else {
        numberToProcess = threadContainer.dataset.phoneNumber;
    }

    if (phoneRegex.test(cleanedText) && !threadContainer.hasAttribute('data-processing')) {
        threadContainer.setAttribute('data-processing', 'true');
        chrome.runtime.sendMessage({ type: 'getNameForNumber', phoneNumber: numberToProcess }, (response) => {
            if (chrome.runtime.lastError || !document.body.contains(threadContainer)) return;
            if (response && response.name) {
                const formattedName = reformatName(response.name);
                updateGoogleVoiceText(textElement, cleanedText, formattedName);
                updateGoogleVoiceAvatar(threadContainer, formattedName, showInitials);
            }
            threadContainer.removeAttribute('data-processing');
        });
    } else if (!phoneRegex.test(cleanedText)) {
        const name = cleanedText.split(' - ')[0]; 
        updateGoogleVoiceAvatar(threadContainer, name, showInitials);
    }
}

function updateGoogleVoiceText(textElement, phoneText, formattedName) {
    if (textElement.matches('div.primary-text')) {
        textElement.textContent = `${formattedName} - ${phoneText}`;
    } else if (textElement.matches('gv-annotation.participants')) {
        textElement.textContent = formattedName;
    }
}

function updateGoogleVoiceAvatar(threadContainer, name, showInitials) {
    const avatarWrapper = threadContainer.querySelector('.avatar-container, gv-avatar');
    if (!avatarWrapper) return;
    const existingInitials = avatarWrapper.querySelector('.contact-assist-avatar');
    const existingIconContainer = avatarWrapper.querySelector('div.avatar:not(.contact-assist-avatar)');

    if (showInitials && existingIconContainer) {
        const originalColor = existingIconContainer.style.backgroundColor;
        const initials = getInitials(name);
        if (initials) existingIconContainer.replaceWith(createInitialsAvatar(initials, originalColor));
    } else if (!showInitials && existingInitials) {
        const newDefaultAvatarDiv = document.createElement('div');
        newDefaultAvatarDiv.className = 'avatar';
        newDefaultAvatarDiv.appendChild(createDefaultIcon());
        existingInitials.replaceWith(newDefaultAvatarDiv);
    }
}

async function handleMessageInputClick(event) {
    if (!chrome.runtime?.id) return;
    const { autoInsertMessage, pinnedMessages, userName } = await chrome.storage.local.get(['autoInsertMessage', 'pinnedMessages', 'userName']);
    if (!autoInsertMessage || !pinnedMessages || pinnedMessages.length === 0) return;

    let rawItemId = null, phoneNumberFromClipboard = null;
    const url = new URL(location.href);

    if (!location.href.includes('draft')) {
        rawItemId = url.searchParams.get('itemId');
        if (!rawItemId) {
            const pathMatch = location.pathname.match(/\/messages\/(t\.%252B\d+)/);
            if (pathMatch) rawItemId = decodeURIComponent(pathMatch[1]);
        }
        if (!rawItemId) {
            const b1Match = location.href.match(/[Bb]1(\d+)/);
            if (b1Match) rawItemId = `t.+${b1Match[1]}`;
        }
    }

    if (!rawItemId || !rawItemId.startsWith('t.+')) {
        const clipboardResponse = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'getClipboardTextOnly' }, resolve));
        if (clipboardResponse && clipboardResponse.text) {
            phoneNumberFromClipboard = clipboardResponse.text.match(/(\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/)?.[0];
        }
        if (!phoneNumberFromClipboard) return;
    }

    let normalizedPhone = (phoneNumberFromClipboard || rawItemId).replace(/\D/g, '');
    if (normalizedPhone.length === 11 && normalizedPhone.startsWith('1')) normalizedPhone = normalizedPhone.substring(1);
    if (!normalizedPhone) return;

    const contactName = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'getNameForNumber', phoneNumber: normalizedPhone }, response => resolve(response ? response.name : null));
    });
    if (!contactName) return;

    const studentFirstName = getFirstName(reformatName(contactName));
    if (!studentFirstName) return;

    const finalUserName = userName || '[Your Name]';
    const randomTemplate = pinnedMessages[Math.floor(Math.random() * pinnedMessages.length)];
    const finalText = randomTemplate.replace(/{studentFirstName}/g, studentFirstName).replace(/{userName}/g, finalUserName);

    const messageInput = document.querySelector('textarea.message-input');
    if (messageInput) {
        messageInput.value = finalText;
        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function main() {
    const host = window.location.hostname;
    const configKey = Object.keys(siteConfigs).find(key => host.includes(key));
    if (configKey) siteConfigs[configKey].initialize(siteConfigs[configKey]);
}

function initializeGenericSite(config) {
    const observer = new MutationObserver(() => scanPage(config));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    scanPage(config);
}

function initializeGoogleVoice(config) {
    let previousUrl = location.href;
    let lastCopiedItemId = null;
    initializeGenericSite(config);

    const messageInput = document.querySelector('textarea.message-input');
    if (messageInput && !messageInput.dataset.contactAssistListener) {
        messageInput.dataset.contactAssistListener = 'true';
        messageInput.addEventListener('click', handleMessageInputClick);
    }

    const intervalId = setInterval(() => {
        if (!window.location.hostname.includes('voice.google.com')) return;
        if (location.href !== previousUrl) {
            previousUrl = location.href;
            if (!location.href.includes('draft')) {
                let rawItemId = null;
                const url = new URL(location.href);
                rawItemId = url.searchParams.get('itemId');
                if (!rawItemId) {
                    const pathMatch = location.pathname.match(/\/messages\/(t\.%252B\d+)/);
                    if (pathMatch) rawItemId = decodeURIComponent(pathMatch[1]);
                }
                if (!rawItemId) {
                    const b1Match = location.href.match(/[Bb]1(\d+)/);
                    if (b1Match) rawItemId = `t.+${b1Match[1]}`;
                }

                if (rawItemId && rawItemId !== lastCopiedItemId) {
                    lastCopiedItemId = rawItemId;
                    let numberToCopy = rawItemId.replace(/\D/g, '');
                    if (numberToCopy.length === 11 && numberToCopy.startsWith('1')) numberToCopy = numberToCopy.substring(1);
                    
                    chrome.runtime.sendMessage({ type: 'urlNumberUpdate', phoneNumber: numberToCopy });
                    chrome.runtime.sendMessage({ type: 'copyToClipboard', text: numberToCopy });

                    setTimeout(() => {
                        const header = document.querySelector('gv-cn-header .header-text');
                        if (header) showCopiedFeedback(header.parentElement);
                    }, 500);
                }
            }
            scanPage(config);
        }
    }, 200);

    const messageListener = (request) => {
        if (request.type === 'settingsChanged') scanPage(config);
    };
    chrome.runtime.onMessage.addListener(messageListener);
    window.addEventListener('pagehide', () => {
        clearInterval(intervalId);
        chrome.runtime.onMessage.removeListener(messageListener);
    }, { once: true });
}

let scanLock = false;
async function scanPage(config) {
    if (!chrome.runtime?.id || scanLock) return;
    scanLock = true;
    try {
        const { showInitials } = await chrome.storage.local.get('showInitials');
        if (!chrome.runtime.lastError) {
            document.querySelectorAll(config.itemSelector).forEach(item => config.processFunction(item, !!showInitials));
        }
    } catch (error) {
        if (!error.message.includes("Extension context invalidated")) console.error(error);
    } finally {
        setTimeout(() => { scanLock = false; }, 500);
    }
}

// --- Five9 Call & Hangup Handling ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'executeFive9Call') {
        handleFive9Call(request.phoneNumber, sendResponse);
        return true; 
    }
    if (request.type === 'executeFive9Hangup') {
        handleFive9Hangup(sendResponse);
        return true; 
    }
});

async function handleFive9Call(phoneNumber, sendResponse) {
    try {
        const metadataResp = await fetch("https://app-atl.five9.com/appsvcs/rs/svc/auth/metadata");
        if (!metadataResp.ok) throw new Error("Could not fetch User Metadata");
        const metadata = await metadataResp.json();
        
        const url = `https://app-atl.five9.com/appsvcs/rs/svc/agents/${metadata.userId}/interactions/make_external_call`;
        const payload = {
            "number": phoneNumber,
            "skipDNCCheck": false,
            "checkMultipleContacts": true,
            "campaignId": "300000000000483" 
        };

        const callResp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (callResp.ok) sendResponse({ success: true });
        else sendResponse({ success: false, error: `${callResp.status} - ${await callResp.text()}` });

    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function handleFive9Hangup(sendResponse) {
    try {
        console.log("Contact Assist: Attempting TWO-STEP hangup...");

        const metadataResp = await fetch("https://app-atl.five9.com/appsvcs/rs/svc/auth/metadata");
        if (!metadataResp.ok) throw new Error("Could not fetch User Metadata");
        const metadata = await metadataResp.json();
        
        // Fetch active interactions
        const interactionsResp = await fetch(`https://app-atl.five9.com/appsvcs/rs/svc/agents/${metadata.userId}/interactions`);
        if (!interactionsResp.ok) throw new Error("Could not fetch active interactions");
        const interactions = await interactionsResp.json();

        const activeCall = interactions.find(i => i.channelType === 'CALL');

        // *** ROBUSTNESS FIX: Handle Manual Hangup ***
        if (!activeCall) {
            console.warn("Contact Assist: No active CALL found (assuming already ended).");
            // We return SUCCESS so the automation continues to the next number
            sendResponse({ success: true, warning: "Call was already ended manually." });
            return;
        }

        console.log(`Contact Assist: STEP 1 - Disconnecting interaction ${activeCall.interactionId}...`);

        // STEP 1: DISCONNECT
        const disconnectUrl = `https://app-atl.five9.com/appsvcs/rs/svc/agents/${metadata.userId}/interactions/calls/${activeCall.interactionId}/disconnect`;
        const disconnectResp = await fetch(disconnectUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/json" }
        });

        if (!disconnectResp.ok) {
             console.warn("Disconnect step warning:", disconnectResp.status);
        }

        await new Promise(r => setTimeout(r, 500));

        console.log(`Contact Assist: STEP 2 - Disposing interaction...`);

        // STEP 2: DISPOSE
        const disposeUrl = `https://app-atl.five9.com/appsvcs/rs/svc/agents/${metadata.userId}/interactions/calls/${activeCall.interactionId}/dispose`;
        const payload = { "dispositionId": "300000000000046" };

        const disposeResp = await fetch(disposeUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (disposeResp.ok) {
            console.log("Contact Assist: Hangup Complete.");
            sendResponse({ success: true });
        } else {
            const errorText = await disposeResp.text();
            console.error("Dispose Error:", disposeResp.status, errorText);
            
            if (disposeResp.status === 404 || disposeResp.status === 435) {
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: `${disposeResp.status} - ${errorText}` });
            }
        }

    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

main();