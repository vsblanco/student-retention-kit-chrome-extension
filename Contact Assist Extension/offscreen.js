// This script runs in the offscreen document to handle clipboard operations.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen-doc') {
        return;
    }

    // Handles reading from the clipboard
    if (message.type === 'read-from-clipboard') {
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);
        textarea.select();
        try {
            if (document.execCommand('paste')) {
                sendResponse({ text: textarea.value });
            } else {
                sendResponse({ text: null });
            }
        } catch (err) {
            console.error('Error executing paste command: ', err);
            sendResponse({ text: null });
        } finally {
            document.body.removeChild(textarea);
        }
    }

    // --- RESTORED: Handles writing to the clipboard ---
    if (message.type === 'write-to-clipboard') {
        const textarea = document.createElement('textarea');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.value = message.text;
        textarea.select();
        try {
            const success = document.execCommand('copy');
            sendResponse({ success });
        } catch (err) {
            console.error('Error executing copy command: ', err);
            sendResponse({ success: false });
        } finally {
            document.body.removeChild(textarea);
        }
    }
});
