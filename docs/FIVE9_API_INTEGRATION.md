# Five9 API Integration Analysis

**Date:** 2025-12-19
**Source:** Contact Assist Extension
**Target:** Student Retention Kit Extension

---

## Overview

This document dissects how the Five9 call feature works in the Contact Assist Extension and explains the implementation in the Student Retention Kit extension.

---

## Architecture

The Five9 integration uses a **three-layer architecture**:

1. **UI Layer** (Popup/Sidepanel) - User interface and call controls
2. **Background Layer** (Service Worker) - Message broker and tab management
3. **Content Script Layer** (Five9 Page) - Direct API communication with Five9

```
┌─────────────────────┐
│   Popup/Sidepanel   │  User clicks "Call" button
│   (popup.js)        │
└──────────┬──────────┘
           │ chrome.runtime.sendMessage({ type: 'triggerFive9Call', phoneNumber })
           ▼
┌─────────────────────┐
│   Background.js     │  Finds Five9 tab, forwards message
│ (Service Worker)    │
└──────────┬──────────┘
           │ chrome.tabs.sendMessage(five9TabId, { type: 'executeFive9Call', phoneNumber })
           ▼
┌─────────────────────┐
│ five9_connector.js  │  Makes actual API calls to Five9
│  (Content Script)   │
└─────────────────────┘
```

---

## Five9 API Endpoints

### 1. **Get User Metadata**
- **Endpoint:** `GET https://app-atl.five9.com/appsvcs/rs/svc/auth/metadata`
- **Purpose:** Retrieve the current user's `userId` needed for other API calls
- **Response:**
  ```json
  {
    "userId": "agent123",
    ...
  }
  ```

### 2. **Make External Call**
- **Endpoint:** `POST https://app-atl.five9.com/appsvcs/rs/svc/agents/{userId}/interactions/make_external_call`
- **Headers:** `Content-Type: application/json`
- **Payload:**
  ```json
  {
    "number": "+15551234567",
    "skipDNCCheck": false,
    "checkMultipleContacts": true,
    "campaignId": "300000000000483"
  }
  ```
- **Notes:**
  - Phone number should be in format `+1XXXXXXXXXX` (E.164 format)
  - Campaign ID must be valid for your Five9 organization

### 3. **Get Active Interactions**
- **Endpoint:** `GET https://app-atl.five9.com/appsvcs/rs/svc/agents/{userId}/interactions`
- **Purpose:** Get list of active calls/interactions
- **Response:**
  ```json
  [
    {
      "interactionId": "abc123",
      "channelType": "CALL",
      ...
    }
  ]
  ```

### 4. **Disconnect Call**
- **Endpoint:** `PUT https://app-atl.five9.com/appsvcs/rs/svc/agents/{userId}/interactions/calls/{interactionId}/disconnect`
- **Purpose:** Step 1 of hangup - Disconnect the active call
- **Headers:** `Content-Type: application/json`

### 5. **Dispose Call**
- **Endpoint:** `PUT https://app-atl.five9.com/appsvcs/rs/svc/agents/{userId}/interactions/calls/{interactionId}/dispose`
- **Purpose:** Step 2 of hangup - Mark call with disposition code
- **Headers:** `Content-Type: application/json`
- **Payload:**
  ```json
  {
    "dispositionId": "300000000000046"
  }
  ```
- **Notes:** Disposition ID must be valid for your Five9 organization

---

## Call Flow (Making a Call)

### Step-by-Step Process:

1. **User clicks "Call" button** in popup/sidepanel
   - Event handler in `popup.js` triggers

2. **Send message to background:**
   ```javascript
   chrome.runtime.sendMessage({
     type: 'triggerFive9Call',
     phoneNumber: '+15551234567'
   });
   ```

3. **Background.js finds Five9 tab:**
   ```javascript
   const tabs = await chrome.tabs.query({ url: "https://app-atl.five9.com/*" });
   if (tabs.length === 0) {
     // Error: Five9 tab not found
     chrome.runtime.sendMessage({
       type: 'callStatus',
       success: false,
       error: "Five9 tab not found. Please open Five9."
     });
     return;
   }
   ```

4. **Background.js cleans phone number:**
   ```javascript
   let cleanNumber = phoneNumber.replace(/[^0-9+]/g, '');
   if (!cleanNumber.startsWith('+1') && cleanNumber.length === 10) {
     cleanNumber = '+1' + cleanNumber;
   }
   ```

5. **Forward to Five9 content script:**
   ```javascript
   chrome.tabs.sendMessage(five9TabId, {
     type: 'executeFive9Call',
     phoneNumber: cleanNumber
   }, (response) => {
     chrome.runtime.sendMessage({
       type: 'callStatus',
       success: response?.success,
       error: response?.error
     });
   });
   ```

6. **Content script makes API calls:**
   ```javascript
   // Get user metadata
   const metadataResp = await fetch("https://app-atl.five9.com/appsvcs/rs/svc/auth/metadata");
   const metadata = await metadataResp.json();

   // Make external call
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

   if (callResp.ok) {
     sendResponse({ success: true });
   } else {
     sendResponse({ success: false, error: `${callResp.status}` });
   }
   ```

7. **Background broadcasts status:**
   - Sends `callStatus` message to all listeners (popup, sidepanel, etc.)

8. **UI updates to show call active:**
   - Listen for `callStatus` message in popup.js
   - Update button state, timer, etc.

---

## Hangup Flow (Ending a Call)

### Two-Step Hangup Process:

The Five9 API requires a **two-step process** to properly end a call:

1. **Disconnect** - Ends the active connection
2. **Dispose** - Marks the call with a disposition code

### Step-by-Step Process:

1. **User clicks "End Call" button**

2. **Send message to background:**
   ```javascript
   chrome.runtime.sendMessage({ type: 'triggerFive9Hangup' });
   ```

3. **Background.js forwards to Five9 tab:**
   ```javascript
   chrome.tabs.sendMessage(five9TabId, { type: 'executeFive9Hangup' }, (response) => {
     chrome.runtime.sendMessage({
       type: 'hangupStatus',
       success: response?.success,
       error: response?.error
     });
   });
   ```

4. **Content script executes two-step hangup:**
   ```javascript
   // Get user metadata
   const metadataResp = await fetch("https://app-atl.five9.com/appsvcs/rs/svc/auth/metadata");
   const metadata = await metadataResp.json();

   // Get active interactions
   const interactionsResp = await fetch(`https://app-atl.five9.com/appsvcs/rs/svc/agents/${metadata.userId}/interactions`);
   const interactions = await interactionsResp.json();
   const activeCall = interactions.find(i => i.channelType === 'CALL');

   // ROBUSTNESS: Handle manual hangup
   if (!activeCall) {
     console.warn("No active CALL found (assuming already ended).");
     sendResponse({ success: true, warning: "Call was already ended manually." });
     return;
   }

   // STEP 1: DISCONNECT
   const disconnectUrl = `https://app-atl.five9.com/appsvcs/rs/svc/agents/${metadata.userId}/interactions/calls/${activeCall.interactionId}/disconnect`;
   const disconnectResp = await fetch(disconnectUrl, {
     method: "PUT",
     headers: { "Content-Type": "application/json" }
   });

   await new Promise(r => setTimeout(r, 500)); // Wait 500ms

   // STEP 2: DISPOSE
   const disposeUrl = `https://app-atl.five9.com/appsvcs/rs/svc/agents/${metadata.userId}/interactions/calls/${activeCall.interactionId}/dispose`;
   const payload = { "dispositionId": "300000000000046" };
   const disposeResp = await fetch(disposeUrl, {
     method: "PUT",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify(payload)
   });

   if (disposeResp.ok) {
     sendResponse({ success: true });
   } else {
     // Handle 404/435 as success (call already ended)
     if (disposeResp.status === 404 || disposeResp.status === 435) {
       sendResponse({ success: true });
     } else {
       sendResponse({ success: false, error: `${disposeResp.status}` });
     }
   }
   ```

5. **Background broadcasts status:**
   - Sends `hangupStatus` message to all listeners

6. **UI updates to show call ended:**
   - Listen for `hangupStatus` message
   - Reset button state, timer, etc.

---

## Power Dialer / Automation Mode

The Contact Assist Extension has an advanced "Power Dialer" feature for calling multiple numbers sequentially.

### Automation Flow:

1. **Multiple phone numbers detected** → Show "Start Automation" button
2. **User clicks button** → Start automation sequence
3. **For each number:**
   - Call number
   - Show "End & Call Next" button
   - User clicks → Hangup current call, dial next
4. **Last number** → Show "End & Finish" button
5. **Automation complete** → Reset to normal mode

### Key Features:

- **Sequential calling** - Automatically dials next number after hangup
- **Skip functionality** - Can skip to next number without calling
- **Cancellation** - Can cancel automation mid-sequence
- **Progress tracking** - Shows current position (e.g., "#2 of 5")
- **Robustness** - Handles manual hangups gracefully

### Implementation in Contact Assist:

**popup.js** manages automation state:
```javascript
let isAutomationRunning = false;
let currentMatchData = []; // Array of phone numbers
let activeMatchIndex = 0;

// Start automation
if (state === 'auto-start') {
  isAutomationRunning = true;
  activeMatchIndex = 0;
  chrome.runtime.sendMessage({
    type: 'triggerFive9Call',
    phoneNumber: currentMatchData[0].phoneNumber
  });
}

// Hangup and next
if (state === 'auto-next') {
  chrome.runtime.sendMessage({ type: 'triggerFive9Hangup' });
}

// Listen for hangup completion
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'hangupStatus' && message.success) {
    if (isAutomationRunning) {
      activeMatchIndex++;
      if (activeMatchIndex < currentMatchData.length) {
        // Dial next number
        setTimeout(() => {
          chrome.runtime.sendMessage({
            type: 'triggerFive9Call',
            phoneNumber: currentMatchData[activeMatchIndex].phoneNumber
          });
        }, 1000);
      } else {
        // Automation complete
        isAutomationRunning = false;
      }
    }
  }
});
```

---

## Student Retention Kit Implementation

### Current Status:

✅ **Implemented:**
- `content/five9_connector.js` - Complete Five9 API implementation
- `background/background.js` - Message handlers for `triggerFive9Call` and `triggerFive9Hangup`
- `sidepanel/callManager.js` - Power dialer/automation logic
- `manifest.json` - Five9 permissions and content script registration

❌ **Issues Found:**

1. **callManager.js line 434-436:** Sends wrong message type
   ```javascript
   // WRONG:
   chrome.runtime.sendMessage({
     type: 'executeFive9Call', // ❌ This goes directly to content script
     phoneNumber: phoneNumber
   });

   // CORRECT:
   chrome.runtime.sendMessage({
     type: 'triggerFive9Call', // ✅ This goes to background.js first
     phoneNumber: phoneNumber
   });
   ```

2. **callManager.js line 452-454:** Same issue for hangup

3. **popup.js:** Missing status listeners for `callStatus` and `hangupStatus`

4. **Dial button integration:** Not currently wired to actually call Five9 API

---

## Required Fixes

### 1. Fix callManager.js message types

**File:** `sidepanel/callManager.js`

**Line 427-444:** Fix `initiateCall()` method
```javascript
async initiateCall(phoneNumber) {
  if (!phoneNumber || phoneNumber === "No Phone Listed") {
    return { success: false, error: "No valid phone number" };
  }

  try {
    // Send message to background.js (NOT directly to content script)
    const response = await chrome.runtime.sendMessage({
      type: 'triggerFive9Call', // ✅ FIXED
      phoneNumber: phoneNumber
    });

    return response;
  } catch (error) {
    console.error("Error initiating call:", error);
    return { success: false, error: error.message };
  }
}
```

**Line 450-461:** Fix `hangupCall()` method
```javascript
async hangupCall() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'triggerFive9Hangup' // ✅ FIXED
    });

    return response;
  } catch (error) {
    console.error("Error hanging up call:", error);
    return { success: false, error: error.message };
  }
}
```

### 2. Add Five9 status listeners to popup.js

**File:** `sidepanel/popup.js`

Add these listeners to handle status updates from background.js:

```javascript
// Listen for Five9 call status updates
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'callStatus') {
    if (message.success) {
      console.log("Five9 call initiated successfully");
      // Update UI to show call active
    } else {
      console.error("Five9 call failed:", message.error);
      // Show error to user
      alert(`Call failed: ${message.error}`);
    }
  }

  if (message.type === 'hangupStatus') {
    if (message.success) {
      console.log("Five9 call ended successfully");
      // Update UI to show call ended
    } else {
      console.error("Five9 hangup failed:", message.error);
      alert(`Hangup failed: ${message.error}`);
    }
  }
});
```

### 3. Wire dial button to actually call Five9

**File:** `sidepanel/popup.js`

When dial button is clicked and call becomes active:

```javascript
// Example integration (adjust based on your existing code)
dialBtn.addEventListener('click', async () => {
  if (!callManager.getCallActiveState()) {
    // Starting a call
    const currentStudent = selectedQueue[0]; // Or however you track current student
    const phoneNumber = currentStudent.phone; // Or appropriate property

    // Actually initiate Five9 call
    const result = await callManager.initiateCall(phoneNumber);

    if (result.success) {
      // Toggle call state (updates UI)
      callManager.toggleCallState();
    } else {
      alert(`Failed to initiate call: ${result.error}`);
    }
  } else {
    // Ending a call
    const result = await callManager.hangupCall();

    if (result.success) {
      // Toggle call state (updates UI)
      callManager.toggleCallState(true);
    } else {
      alert(`Failed to end call: ${result.error}`);
    }
  }
});
```

---

## Configuration Notes

### Campaign ID
**Location:** `content/five9_connector.js` line 29

```javascript
"campaignId": "300000000000483"
```

⚠️ **Important:** This Campaign ID must be valid for your Five9 organization. To find your Campaign ID:
1. Log in to Five9
2. Navigate to Campaigns
3. Copy the Campaign ID you want to use for outbound calls

### Disposition ID
**Location:** `content/five9_connector.js` line 89

```javascript
"dispositionId": "300000000000046"
```

⚠️ **Important:** This Disposition ID must be valid for your Five9 organization. To find your Disposition IDs:
1. Log in to Five9
2. Navigate to Admin → Dispositions
3. Copy the Disposition ID you want to use when calls end

---

## Testing Checklist

- [ ] Five9 tab is open at `https://app-atl.five9.com/*`
- [ ] User is logged into Five9
- [ ] Campaign ID is valid for your organization
- [ ] Disposition ID is valid for your organization
- [ ] Click "Call" button → Call initiates in Five9
- [ ] Click "End Call" button → Call ends in Five9
- [ ] Test with multiple students → Automation mode works
- [ ] Test manual hangup in Five9 → Extension handles gracefully
- [ ] Check console for any errors

---

## Common Issues & Troubleshooting

### "Five9 tab not found"
- **Cause:** Five9 is not open in any tab
- **Solution:** Open `https://app-atl.five9.com/` in a new tab

### "Five9 disconnected. Refresh tab."
- **Cause:** Content script not loaded or Five9 tab was refreshed
- **Solution:** Refresh the Five9 tab and try again

### Call initiates but hangs up immediately
- **Cause:** Invalid Campaign ID or Disposition ID
- **Solution:** Verify IDs are correct for your Five9 organization

### "HTTP Error: 403" or "HTTP Error: 401"
- **Cause:** Not logged into Five9 or session expired
- **Solution:** Log in to Five9 and try again

### "Could not fetch User Metadata"
- **Cause:** Five9 API endpoint changed or network issue
- **Solution:** Check Five9 API documentation or contact Five9 support

---

## Security Considerations

1. **API Authentication:** Uses session cookies (user must be logged in)
2. **Content Script Isolation:** Only runs on `https://app-atl.five9.com/*`
3. **Permissions:** Requires `host_permissions` for Five9 domain
4. **No API Keys:** Does not store or transmit API keys
5. **Campaign/Disposition IDs:** Hard-coded (consider making configurable)

---

## Future Enhancements

1. **Dynamic Campaign Selection:** Allow users to select campaign from UI
2. **Dynamic Disposition Selection:** Show disposition options after call
3. **Call History:** Store call logs in chrome.storage
4. **Call Recording Integration:** If Five9 supports it
5. **CRM Integration:** Sync call data with external CRM
6. **Error Retry Logic:** Automatically retry failed API calls
7. **Offline Detection:** Warn user if Five9 connection is lost

---

## References

- **Five9 API Documentation:** Contact Five9 support or check developer portal
- **Chrome Extension Messaging:** https://developer.chrome.com/docs/extensions/mv3/messaging/
- **Content Scripts:** https://developer.chrome.com/docs/extensions/mv3/content_scripts/

---

**End of Document**
