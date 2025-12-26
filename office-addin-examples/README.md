# Office Add-in Example Code

This folder contains ready-to-use example code for implementing Office user info fetching in your **Office Add-in project** (separate from this Chrome extension).

## 📁 Files in This Folder

| File | Description |
|------|-------------|
| `userInfo.js` | Core module for fetching user info via Office SSO |
| `chromeExtensionIntegration.js` | Integration code to send user info to Chrome extension |
| `manifest-example.xml` | Example manifest.xml showing required SSO configuration |
| `README.md` | This file |

## 🚀 Quick Start

### Step 1: Copy Files to Your Office Add-in Project

```bash
# In your Office Add-in project directory
cp path/to/office-addin-examples/userInfo.js ./src/
cp path/to/office-addin-examples/chromeExtensionIntegration.js ./src/
```

### Step 2: Install Dependencies

```bash
npm install jwt-decode
```

### Step 3: Update Your Manifest

Open your `manifest.xml` and add the `<WebApplicationInfo>` section shown in `manifest-example.xml`.

**Important**: Replace `YOUR_APPLICATION_CLIENT_ID` with your actual Azure App Registration client ID.

### Step 4: Initialize in Your Add-in

In your main taskpane or commands file:

```javascript
import { initializeUserInfoSync } from './chromeExtensionIntegration.js';

Office.onReady((info) => {
    if (info.host === Office.HostType.Excel) {
        // Initialize user info sync
        initializeUserInfoSync();

        // Your other initialization code...
    }
});
```

## 📋 What Each File Does

### userInfo.js

This is the **core authentication module** that handles:
- ✅ Fetching Office user tokens via SSO
- ✅ Decoding JWT tokens to extract user info
- ✅ Fallback authentication via dialog API
- ✅ Error handling for all SSO error codes
- ✅ Caching user info to avoid repeated auth calls

**Key Functions:**
- `getOfficeUserInfo()` - Fetches user info via SSO
- `fallbackAuthGetUserInfo()` - Fallback authentication method
- `getUserInfoWithFallback()` - **Recommended** - Tries SSO, falls back to dialog
- `getCachedUserInfo()` - Returns cached user info (avoids repeated auth)
- `clearUserInfoCache()` - Clears the cache

### chromeExtensionIntegration.js

This module **sends user info to the Chrome extension**:
- ✅ Sends user info via `window.postMessage`
- ✅ Handles errors gracefully
- ✅ Provides periodic refresh (optional)
- ✅ Includes examples for common scenarios

**Key Functions:**
- `sendUserInfoToExtension()` - Sends user info to Chrome extension
- `initializeUserInfoSync()` - **Recommended** - Call this on add-in load
- `checkChromeExtension()` - Checks if extension is installed

### manifest-example.xml

Shows the required manifest.xml configuration:
- ✅ `<WebApplicationInfo>` section for SSO
- ✅ Required scopes (openid, profile, email, User.Read)
- ✅ App domains for Microsoft auth
- ✅ Resource URL format for dev and production

## 🔧 Configuration Required

### 1. Azure App Registration

You **must** create an Azure App Registration:

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Create a new registration
4. Configure API permissions (User.Read, profile, email, openid)
5. Copy the **Application (client) ID**

### 2. Update Manifest

In your `manifest.xml`, add:

```xml
<WebApplicationInfo>
  <Id>YOUR_APPLICATION_CLIENT_ID</Id>
  <Resource>api://localhost:3000/YOUR_APPLICATION_CLIENT_ID</Resource>
  <Scopes>
    <Scope>User.Read</Scope>
    <Scope>profile</Scope>
    <Scope>email</Scope>
    <Scope>openid</Scope>
  </Scopes>
</WebApplicationInfo>
```

### 3. Update Code

In `fallbackAuthGetUserInfo()` function in `userInfo.js`, replace:

```javascript
client_id: 'YOUR_APPLICATION_CLIENT_ID',  // ⚠️ REPLACE THIS
```

## 📦 Data Format Sent to Chrome Extension

The user info sent to the Chrome extension has this format:

```javascript
{
  type: "SRK_OFFICE_USER_INFO",
  data: {
    name: "John Doe",
    email: "john.doe@school.edu",
    userId: "abc123-456-789...",
    jobTitle: "Academic Advisor",           // Optional
    department: "Student Services",         // Optional
    officeLocation: "Building A, Room 123", // Optional
    timestamp: "2025-12-26T10:30:00.000Z"
  }
}
```

The Chrome extension will:
1. Receive this message via `excelConnector.js`
2. Store it in `chrome.storage.local` under the key `officeUserInfo`
3. Make it available throughout the extension

## 🧪 Testing

### Test Authentication

```javascript
import { getOfficeUserInfo } from './userInfo.js';

// Test SSO authentication
async function testAuth() {
    try {
        const userInfo = await getOfficeUserInfo();
        console.log('✅ Authentication successful:', userInfo);
    } catch (error) {
        console.error('❌ Authentication failed:', error);
    }
}

testAuth();
```

### Test Chrome Extension Communication

```javascript
import { sendUserInfoToExtension } from './chromeExtensionIntegration.js';

// Test sending to extension
async function testExtensionComm() {
    await sendUserInfoToExtension(false); // false = don't use cache
    console.log('User info sent to extension - check extension console');
}

testExtensionComm();
```

### Verify in Chrome Extension

Open Chrome DevTools on the Excel page and check console for:

```
SRK Connector: Office User Info Received!
Processing Office User Info
  Name: John Doe
  Email: john.doe@school.edu
✓ Office User Info Stored Successfully!
```

## 🔍 Troubleshooting

### "Add-in is not registered for SSO" (Error 13007)

- ✅ Check that `<WebApplicationInfo>` is in your manifest
- ✅ Verify the Application (client) ID is correct
- ✅ Ensure Resource URL format is correct

### Token doesn't contain email

- ✅ Add `email` scope to manifest
- ✅ Verify API permissions in Azure include `email`
- ✅ Grant admin consent in Azure Portal

### User info not appearing in extension

1. Check Office Add-in console for errors
2. Check Chrome extension console for "SRK Connector: Office User Info Received!"
3. Verify the Chrome extension is installed and active on the Excel tab

### SSO not working at all

- ✅ Use fallback authentication: `getUserInfoWithFallback()`
- ✅ Check Office version supports SSO (Office 2016 or later)
- ✅ Ensure using HTTPS (or localhost for dev)

## 📚 Additional Resources

For complete setup instructions, see:
- **[OFFICE_USER_INFO_INTEGRATION.md](../OFFICE_USER_INFO_INTEGRATION.md)** - Full setup guide
- [Office SSO Documentation](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/sso-in-office-add-ins)
- [Azure App Registration](https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)

## 💡 Usage Examples

### Example 1: Basic Initialization

```javascript
import { initializeUserInfoSync } from './chromeExtensionIntegration.js';

Office.onReady(() => {
    initializeUserInfoSync();
});
```

### Example 2: Send User Info with Master List

```javascript
import { getCachedUserInfo } from './userInfo.js';

async function sendMasterList(students) {
    const userInfo = await getCachedUserInfo();

    window.postMessage({
        type: "SRK_MASTER_LIST_DATA",
        data: {
            students: students,
            sentBy: {
                name: userInfo.name,
                email: userInfo.email
            }
        }
    }, "*");
}
```

### Example 3: Display User Name in Add-in UI

```javascript
import { getCachedUserInfo } from './userInfo.js';

async function showWelcomeMessage() {
    const userInfo = await getCachedUserInfo();
    document.getElementById('welcomeMessage').textContent =
        `Welcome, ${userInfo.name}!`;
}
```

## ⚠️ Important Notes

1. **These files go in your Office Add-in project, NOT the Chrome extension**
2. The Chrome extension is already configured to receive this data
3. You must complete Azure App Registration before SSO will work
4. Test with `getUserInfoWithFallback()` to handle SSO failures gracefully
5. User info is cached to avoid repeated authentication prompts

## 🎯 Next Steps

1. ✅ Set up Azure App Registration
2. ✅ Copy files to your Office Add-in project
3. ✅ Update manifest.xml
4. ✅ Replace `YOUR_APPLICATION_CLIENT_ID` in code
5. ✅ Test authentication
6. ✅ Test Chrome extension integration
7. ✅ Deploy to production

---

**Need help?** Check the full guide in [OFFICE_USER_INFO_INTEGRATION.md](../OFFICE_USER_INFO_INTEGRATION.md)
