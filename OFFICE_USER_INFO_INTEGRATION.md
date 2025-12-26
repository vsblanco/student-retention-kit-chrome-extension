# Office User Info Integration Guide

## Overview

This guide explains how to configure your Office Add-in to fetch the authenticated user's name, email, and other profile information, then send it to the Chrome extension for storage and use.

The Chrome extension is now configured to receive and store Office user information. This document focuses on what you need to implement **in your Office Add-in project**.

## Architecture

```
Office Add-in (Excel)
    ↓ (SSO Authentication)
Microsoft Identity Platform
    ↓ (Access Token with user claims)
Office Add-in
    ↓ (window.postMessage)
Chrome Extension (excelConnector.js)
    ↓ (chrome.storage.local)
Stored User Info
```

## Prerequisites

Before you begin, ensure you have:

- ✅ An Azure account with permissions to register applications
- ✅ Your Office Add-in project
- ✅ The Chrome extension installed and working
- ✅ Node.js and npm installed for Office Add-in development

## Step 1: Azure App Registration

### 1.1 Create App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations** → **New registration**
3. Fill in the details:
   - **Name**: `Student Retention Add-in SSO`
   - **Supported account types**: Select based on your organization's needs
     - Single tenant (recommended for school/org-specific use)
     - Multi-tenant (if users from different orgs will use it)
   - **Redirect URI**: Leave blank for now (we'll add this later)
4. Click **Register**

### 1.2 Configure API Permissions

After registration, configure permissions:

1. Go to **API permissions** → **Add a permission**
2. Select **Microsoft Graph** → **Delegated permissions**
3. Add these permissions:
   - `User.Read` (required for basic profile)
   - `profile` (required for name)
   - `email` (required for email address)
   - `openid` (required for authentication)
4. Click **Add permissions**
5. Click **Grant admin consent** (if you have admin rights)

### 1.3 Configure Authentication

1. Go to **Authentication** → **Add a platform** → **Single-page application**
2. Add your add-in's redirect URIs:
   ```
   https://localhost:3000/taskpane.html
   https://your-addin-domain.com/taskpane.html
   ```
3. Under **Implicit grant and hybrid flows**, check:
   - ✅ Access tokens (used for implicit flows)
   - ✅ ID tokens (used for implicit and hybrid flows)
4. Click **Configure**

### 1.4 Get Your Application (client) ID

1. Go to **Overview**
2. Copy the **Application (client) ID**
3. Copy the **Directory (tenant) ID**
4. Save these for the next steps

## Step 2: Update Office Add-in Manifest

### 2.1 Add WebApplicationInfo Section

Add this to your `manifest.xml` file (inside the `<VersionOverrides>` section):

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

Replace `YOUR_APPLICATION_CLIENT_ID` with the Application (client) ID from Step 1.4.

For production, update the Resource URL:
```xml
<Resource>api://your-addin-domain.com/YOUR_APPLICATION_CLIENT_ID</Resource>
```

### 2.2 Update App Domains

Add your authentication domains to the manifest:

```xml
<AppDomains>
  <AppDomain>https://login.microsoftonline.com</AppDomain>
  <AppDomain>https://login.windows.net</AppDomain>
</AppDomains>
```

## Step 3: Install Dependencies

In your Office Add-in project, install required packages:

```bash
npm install jwt-decode
```

## Step 4: Implement SSO in Your Office Add-in

### 4.1 Create User Info Module

Create a new file `src/userInfo.js` in your Office Add-in project:

```javascript
import jwt_decode from 'jwt-decode';

/**
 * Gets the authenticated Office user's information using SSO
 * @returns {Promise<Object>} User info object with name, email, userId, etc.
 */
export async function getOfficeUserInfo() {
    try {
        console.log('🔐 Attempting to get Office user token...');

        // Get access token from Office
        const userTokenEncoded = await OfficeRuntime.auth.getAccessToken({
            allowSignInPrompt: true,
            allowConsentPrompt: true,
            forMSGraphAccess: true
        });

        console.log('✅ Token received, decoding...');

        // Decode the JWT token to get user claims
        const userToken = jwt_decode(userTokenEncoded);

        console.log('User token decoded:', {
            name: userToken.name,
            email: userToken.preferred_username || userToken.upn,
            userId: userToken.oid
        });

        // Extract user information from token claims
        const userInfo = {
            name: userToken.name || null,
            email: userToken.preferred_username || userToken.upn || userToken.email || null,
            userId: userToken.oid || userToken.sub || null,
            jobTitle: userToken.jobTitle || null,
            department: userToken.department || null,
            officeLocation: userToken.officeLocation || null,
            timestamp: new Date().toISOString()
        };

        return userInfo;

    } catch (error) {
        console.error('❌ Error getting Office user info:', error);

        // Handle specific error codes
        if (error.code === 13001) {
            console.error('User cancelled sign-in dialog');
        } else if (error.code === 13002) {
            console.error('User is not signed in');
        } else if (error.code === 13003) {
            console.error('User type is not supported');
        } else if (error.code === 13004) {
            console.error('Internal error occurred');
        } else if (error.code === 13005) {
            console.error('Office host does not support SSO');
        } else if (error.code === 13006) {
            console.error('Office version does not support SSO');
        } else if (error.code === 13007) {
            console.error('Add-in is not registered for SSO');
        } else if (error.code === 13012) {
            console.error('User needs to consent to permissions');
        }

        throw error;
    }
}

/**
 * Fallback authentication using dialog API
 * Use this when SSO is not available or fails
 * @returns {Promise<Object>} User info object
 */
export async function fallbackAuthGetUserInfo() {
    console.log('⚠️ Using fallback authentication method...');

    return new Promise((resolve, reject) => {
        const dialogUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' +
            new URLSearchParams({
                client_id: 'YOUR_APPLICATION_CLIENT_ID',
                response_type: 'token id_token',
                redirect_uri: window.location.origin + '/dialog.html',
                scope: 'openid profile email User.Read',
                response_mode: 'fragment',
                state: '12345',
                nonce: Math.random().toString(36)
            });

        Office.context.ui.displayDialogAsync(
            dialogUrl,
            { height: 60, width: 30 },
            (result) => {
                if (result.status === Office.AsyncResultStatus.Failed) {
                    reject(new Error('Failed to open sign-in dialog'));
                    return;
                }

                const dialog = result.value;
                dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
                    dialog.close();
                    try {
                        const tokenResponse = JSON.parse(arg.message);
                        const userToken = jwt_decode(tokenResponse.id_token);

                        const userInfo = {
                            name: userToken.name || null,
                            email: userToken.preferred_username || userToken.email || null,
                            userId: userToken.oid || userToken.sub || null,
                            timestamp: new Date().toISOString()
                        };

                        resolve(userInfo);
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );
    });
}

/**
 * Gets user info with automatic fallback to dialog auth if SSO fails
 * @returns {Promise<Object>} User info object
 */
export async function getUserInfoWithFallback() {
    try {
        // Try SSO first
        return await getOfficeUserInfo();
    } catch (ssoError) {
        console.warn('SSO failed, trying fallback authentication...', ssoError);

        // Fall back to dialog-based auth
        try {
            return await fallbackAuthGetUserInfo();
        } catch (fallbackError) {
            console.error('Both SSO and fallback authentication failed:', fallbackError);
            throw new Error('Could not authenticate user');
        }
    }
}
```

### 4.2 Send User Info to Chrome Extension

In your main Office Add-in code (e.g., `taskpane.js` or `commands.js`), add this function:

```javascript
import { getUserInfoWithFallback } from './userInfo.js';

/**
 * Fetches and sends Office user info to Chrome extension
 */
async function sendUserInfoToExtension() {
    try {
        console.log('📤 Fetching Office user info to send to extension...');

        // Get user information
        const userInfo = await getUserInfoWithFallback();

        console.log('Sending user info to Chrome extension:', userInfo);

        // Send to Chrome extension via postMessage
        window.postMessage({
            type: "SRK_OFFICE_USER_INFO",
            data: userInfo
        }, "*");

        console.log('✅ User info sent to Chrome extension');

    } catch (error) {
        console.error('❌ Failed to send user info to extension:', error);

        // Send error notification
        window.postMessage({
            type: "SRK_OFFICE_USER_INFO_ERROR",
            error: error.message,
            timestamp: new Date().toISOString()
        }, "*");
    }
}
```

### 4.3 Call on Add-in Initialization

Add this to your Office Add-in initialization code:

```javascript
Office.onReady((info) => {
    if (info.host === Office.HostType.Excel) {
        console.log('Office Add-in ready in Excel');

        // Send user info when add-in loads
        sendUserInfoToExtension();

        // Your existing initialization code...
    }
});
```

## Step 5: Testing

### 5.1 Test the Integration

1. **Start your Office Add-in** in development mode
2. **Open Excel** with your add-in loaded
3. **Open Chrome DevTools** (F12)
4. **Check Console** for these messages:
   ```
   🔐 Attempting to get Office user token...
   ✅ Token received, decoding...
   📤 Fetching Office user info to send to extension...
   ✅ User info sent to Chrome extension
   ```
5. **In the extension console**, look for:
   ```
   SRK Connector: Office User Info Received!
   Processing Office User Info
     Name: John Doe
     Email: john.doe@school.edu
   ✓ Office User Info Stored Successfully!
   ```

### 5.2 Verify Storage

Open Chrome DevTools → Application → Storage → Local Storage → Chrome Extension:

Check for `officeUserInfo` with data like:
```json
{
  "name": "John Doe",
  "email": "john.doe@school.edu",
  "userId": "abc123...",
  "lastUpdated": "2025-12-26T10:30:00.000Z"
}
```

### 5.3 Test from Code

In your Chrome extension console or code:

```javascript
chrome.storage.local.get(['officeUserInfo'], (result) => {
    console.log('Stored Office User Info:', result.officeUserInfo);
});
```

## Step 6: Using User Info in Chrome Extension

The user info is now available throughout your Chrome extension via `chrome.storage.local`.

### Example: Display User Name in UI

```javascript
// In your sidepanel or popup
chrome.storage.local.get(['officeUserInfo'], (result) => {
    const userInfo = result.officeUserInfo;
    if (userInfo && userInfo.name) {
        document.getElementById('userName').textContent = userInfo.name;
        document.getElementById('userEmail').textContent = userInfo.email;
    }
});
```

### Example: Include in API Requests

```javascript
async function makeAPIRequest(data) {
    // Get user info
    const result = await chrome.storage.local.get(['officeUserInfo']);
    const userInfo = result.officeUserInfo;

    // Include in request
    const payload = {
        ...data,
        submittedBy: userInfo?.name,
        submitterEmail: userInfo?.email,
        userId: userInfo?.userId
    };

    // Send request...
}
```

## Troubleshooting

### Issue: "Add-in is not registered for SSO" (Error 13007)

**Solution**:
- Verify your `manifest.xml` has the `<WebApplicationInfo>` section
- Check that the Application (client) ID matches your Azure app registration
- Ensure the Resource URL is correct

### Issue: User consent dialog appears every time

**Solution**:
- Grant admin consent in Azure Portal → App registrations → API permissions
- Or have each user consent once (this is cached)

### Issue: Token doesn't contain user email

**Solution**:
- Check that `email` scope is requested in manifest
- Verify API permissions in Azure include `User.Read` and `email`
- Grant admin consent for the permissions

### Issue: SSO not working in Excel Online

**Solution**:
- Ensure you're using HTTPS (localhost is okay for dev)
- Check browser console for CORS errors
- Verify AppDomains in manifest include Microsoft auth domains

### Issue: "User type is not supported" (Error 13003)

**Solution**:
- SSO doesn't work with personal Microsoft accounts in some scenarios
- Use an organizational/school account
- Implement fallback authentication

### Issue: User info not appearing in Chrome extension

**Solution**:
1. Check that the Office Add-in is sending the message:
   ```javascript
   // In Office Add-in console
   window.postMessage({ type: "SRK_OFFICE_USER_INFO", data: { name: "Test" } }, "*");
   ```
2. Verify the Chrome extension content script is loaded on the Excel page
3. Check Chrome extension console for error messages

## Security Considerations

1. **Token Storage**: Never store the raw access token - only store the decoded user claims you need
2. **HTTPS Only**: Always use HTTPS in production (localhost is okay for dev)
3. **Minimal Scopes**: Only request the minimum permissions you need
4. **Token Expiration**: Access tokens expire after ~1 hour. The extension stores decoded claims, not the token itself, so this is not an issue for basic profile info.
5. **Validate Origin**: In production, consider validating `event.origin` in postMessage handlers

## Additional Resources

- [Office Add-ins SSO Documentation](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/sso-in-office-add-ins)
- [Azure App Registration Guide](https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
- [Microsoft Graph Permissions Reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [JWT Decoder (for debugging)](https://jwt.io/)

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review Azure app registration configuration
3. Check browser and Office Add-in console logs
4. Verify manifest.xml configuration
5. Test with a simple token fetch first before adding Chrome extension integration

## Next Steps

Now that user info is being captured, you can:

- Display the logged-in user's name in the extension UI
- Include user info in outreach logs and reports
- Track which staff member performed which actions
- Filter data based on assigned staff member
- Send personalized notifications

The Chrome extension is fully configured to receive, store, and use this data!
