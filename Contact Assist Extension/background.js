// [2025-12-12] Version 3.2 - Multi-Number Clipboard Support
// This is the service worker for the extension.

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';
let creating; 
let lastClipboardText = ''; 

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "syncContacts",
        title: "Update Master List",
        contexts: ["page"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "syncContacts") {
        syncContactsFromClipboard(null);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'urlNumberUpdate') {
        (async () => {
            // URL updates are always single numbers
            await chrome.storage.local.set({ 
                lastSeenPhoneNumbers: [message.phoneNumber] 
            });
            chrome.runtime.sendMessage({ type: 'dataChanged' });
            sendResponse({success: true}); 
        })();
        return true; 
    }
    
    // UPDATED: Now returns an ARRAY of numbers found
    if (message.type === 'getContactDataFromClipboard') {
        (async () => {
            const { lastSeenPhoneNumbers, contactMap } = await chrome.storage.local.get(['lastSeenPhoneNumbers', 'contactMap']);

            if (!lastSeenPhoneNumbers || lastSeenPhoneNumbers.length === 0) {
                sendResponse({ matches: [] });
                return;
            }
            
            // Map over ALL found numbers to find their contact names
            const matches = lastSeenPhoneNumbers.map(rawPhone => {
                let normalized = rawPhone.replace(/\D/g, '');
                if (normalized.length === 11 && normalized.startsWith('1')) {
                    normalized = normalized.substring(1);
                }
                const name = contactMap ? contactMap[normalized] : null;
                return { phoneNumber: rawPhone, name: name };
            });

            sendResponse({ matches: matches });
        })();
        return true;
    }

    if (message.type === 'copyToClipboard') {
        (async () => {
            await writeToClipboard(message.text);
            sendResponse({ success: true });
        })();
        return true;
    }

    if (message.type === 'syncContacts') {
        syncContactsFromClipboard(sendResponse);
        return true;
    }
    
    if (message.type === 'getNameForNumber') {
        (async () => {
            const { contactMap } = await chrome.storage.local.get('contactMap');
            if (contactMap) {
                let normalizedPhone = message.phoneNumber.replace(/\D/g, '');
                if (normalizedPhone.length === 11 && normalizedPhone.startsWith('1')) {
                    normalizedPhone = normalizedPhone.substring(1);
                }
                const name = contactMap[normalizedPhone];
                sendResponse({ name: name || null });
            } else {
                sendResponse({ name: null });
            }
        })();
        return true;
    }

    if (message.type === 'getClipboardTextOnly') {
        (async () => {
            const clipboardText = await getClipboardText();
            sendResponse({ text: clipboardText });
        })();
        return true; 
    }

    // Five9 Call Trigger
    if (message.type === 'triggerFive9Call') {
        (async () => {
            const tabs = await chrome.tabs.query({ url: "https://app-atl.five9.com/*" });
            if (tabs.length === 0) {
                chrome.runtime.sendMessage({ 
                    type: 'callStatus', 
                    success: false, 
                    error: "Five9 tab not found. Please open Five9." 
                });
                return;
            }
            
            const five9TabId = tabs[0].id;
            // Clean number logic
            let cleanNumber = message.phoneNumber.replace(/[^0-9+]/g, '');
            if (!cleanNumber.startsWith('+1') && cleanNumber.length === 10) {
                cleanNumber = '+1' + cleanNumber;
            }

            chrome.tabs.sendMessage(five9TabId, { 
                type: 'executeFive9Call', 
                phoneNumber: cleanNumber 
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Five9 Connection Error:", chrome.runtime.lastError.message); 
                    chrome.runtime.sendMessage({ type: 'callStatus', success: false, error: "Five9 disconnected. Refresh tab." });
                } else {
                    chrome.runtime.sendMessage({ type: 'callStatus', success: response?.success, error: response?.error });
                }
            });
        })();
        return true;
    }

    // Five9 Hangup Trigger
    if (message.type === 'triggerFive9Hangup') {
        (async () => {
            const tabs = await chrome.tabs.query({ url: "https://app-atl.five9.com/*" });
            if (tabs.length === 0) {
                chrome.runtime.sendMessage({ type: 'hangupStatus', success: false, error: "Five9 tab not found." });
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, { type: 'executeFive9Hangup' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Five9 Hangup Error:", chrome.runtime.lastError.message);
                    chrome.runtime.sendMessage({ type: 'hangupStatus', success: false, error: "Five9 disconnected." });
                } else {
                    chrome.runtime.sendMessage({ type: 'hangupStatus', success: response?.success, error: response?.error });
                }
            });
        })();
        return true;
    }
});

// --- Helper Functions ---

async function syncContactsFromClipboard(sendResponse) {
    try {
        const clipboardText = await getClipboardText();
        if (!clipboardText) throw new Error("Clipboard is empty.");
        
        let contactList;
        try {
            contactList = JSON.parse(clipboardText);
            if (!Array.isArray(contactList)) throw new Error("Clipboard content is not a valid JSON array.");
        } catch (e) {
            console.error('Failed to parse clipboard as JSON:', e);
            throw new Error("Clipboard content is not in the expected JSON array format.");
        }
        
        const contactMap = {};
        for (const contact of contactList) {
            if (contact && contact.PrimaryPhone && contact.StudentName) {
                const normalizedPhone = String(contact.PrimaryPhone).replace(/\D/g, '');
                const phoneToStore = normalizedPhone.length === 11 && normalizedPhone.startsWith('1') 
                                     ? normalizedPhone.substring(1) 
                                     : normalizedPhone.length === 10 ? normalizedPhone : null;

                if (phoneToStore) {
                    contactMap[phoneToStore] = contact.StudentName.trim();
                }
            }
        }

        if (Object.keys(contactMap).length === 0) throw new Error("No valid contacts extracted.");
        
        await chrome.storage.local.set({
            contactMap: contactMap,
            lastSyncTimestamp: new Date().toISOString()
        });
        
        if (sendResponse) sendResponse({ success: true, count: Object.keys(contactMap).length });
    } catch (error) {
        console.error('Error syncing contacts:', error);
        if (sendResponse) sendResponse({ success: false, error: error.message });
    }
}

// UPDATED: Finds MULTIPLE phone numbers
function extractPhoneNumbersFromText(text) {
    if (!text) return [];
    // Global flag 'g' to find all occurrences
    const phoneRegex = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/g;
    const matches = text.match(phoneRegex);
    // Return unique matches only
    return matches ? [...new Set(matches)] : [];
}

async function getClipboardText() {
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
    const response = await chrome.runtime.sendMessage({ type: 'read-from-clipboard', target: 'offscreen-doc' });
    return response ? response.text : null; 
}

async function writeToClipboard(text) {
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
    await chrome.runtime.sendMessage({ type: 'write-to-clipboard', target: 'offscreen-doc', text: text });
}

async function setupOffscreenDocument(path) {
    const offscreenUrl = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });
    if (existingContexts.length > 0) return;
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: ['CLIPBOARD'],
            justification: 'Clipboard access',
        });
        await creating;
        creating = null;
    }
}

// UPDATED: Stores array of numbers
async function monitorClipboard() {
    const currentText = await getClipboardText();
    if (currentText && currentText.trim() && currentText !== lastClipboardText) {
        lastClipboardText = currentText;
        const phoneNumbers = extractPhoneNumbersFromText(currentText);
        
        if (phoneNumbers.length > 0) {
            console.log(`New numbers detected: ${phoneNumbers.length}`);
            // Store as an array
            await chrome.storage.local.set({ lastSeenPhoneNumbers: phoneNumbers });
            chrome.runtime.sendMessage({ type: 'dataChanged' });
        }
    }
}

setInterval(monitorClipboard, 2000);