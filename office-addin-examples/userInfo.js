/**
 * Office Add-in User Info Module
 *
 * This file should be added to your Office Add-in project.
 * It handles fetching the authenticated user's information using Office SSO.
 *
 * Installation:
 * npm install jwt-decode
 */

import jwt_decode from 'jwt-decode';

/**
 * Gets the authenticated Office user's information using SSO
 * @returns {Promise<Object>} User info object with name, email, userId, etc.
 */
export async function getOfficeUserInfo() {
    try {
        console.log('🔐 Attempting to get Office user token...');

        // Get access token from Office using SSO
        const userTokenEncoded = await OfficeRuntime.auth.getAccessToken({
            allowSignInPrompt: true,      // Show sign-in UI if needed
            allowConsentPrompt: true,     // Show consent UI if needed
            forMSGraphAccess: true        // Optimize token for Microsoft Graph
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

            // Optional fields (may not be present in all tokens)
            jobTitle: userToken.jobTitle || null,
            department: userToken.department || null,
            officeLocation: userToken.officeLocation || null,

            timestamp: new Date().toISOString()
        };

        console.log('✅ User info extracted:', userInfo);
        return userInfo;

    } catch (error) {
        console.error('❌ Error getting Office user info:', error);

        // Handle specific SSO error codes
        handleSSOError(error);

        throw error;
    }
}

/**
 * Handles and logs specific SSO error codes
 * @param {Error} error - The error object
 */
function handleSSOError(error) {
    if (!error.code) return;

    const errorMessages = {
        13001: 'User cancelled the sign-in dialog',
        13002: 'User is not signed in to Office',
        13003: 'User type is not supported (personal accounts may not work)',
        13004: 'Internal Office error occurred',
        13005: 'This Office host does not support SSO',
        13006: 'This Office version does not support SSO (update required)',
        13007: 'Add-in is not registered for SSO in manifest',
        13008: 'Add-in failed to get access token',
        13009: 'Token expired, user needs to sign in again',
        13010: 'User not signed in with valid organization account',
        13011: 'User needs to update Windows',
        13012: 'Admin consent required for requested permissions',
        13013: 'User needs to trust the add-in'
    };

    const message = errorMessages[error.code] || `Unknown SSO error code: ${error.code}`;
    console.error(`SSO Error ${error.code}: ${message}`);
}

/**
 * Fallback authentication using Office dialog API
 * Use this when SSO is not available or fails
 *
 * IMPORTANT: Replace YOUR_APPLICATION_CLIENT_ID with your Azure app registration ID
 *
 * @returns {Promise<Object>} User info object
 */
export async function fallbackAuthGetUserInfo() {
    console.log('⚠️ Using fallback dialog authentication...');

    return new Promise((resolve, reject) => {
        // Construct Microsoft login URL with OAuth parameters
        const dialogUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' +
            new URLSearchParams({
                client_id: 'YOUR_APPLICATION_CLIENT_ID',  // ⚠️ REPLACE THIS
                response_type: 'token id_token',
                redirect_uri: window.location.origin + '/dialog.html',
                scope: 'openid profile email User.Read',
                response_mode: 'fragment',
                state: '12345',
                nonce: Math.random().toString(36)
            });

        // Open authentication dialog
        Office.context.ui.displayDialogAsync(
            dialogUrl,
            { height: 60, width: 30 },
            (result) => {
                if (result.status === Office.AsyncResultStatus.Failed) {
                    reject(new Error('Failed to open sign-in dialog: ' + result.error.message));
                    return;
                }

                const dialog = result.value;

                // Handle messages from dialog
                dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
                    dialog.close();

                    try {
                        const tokenResponse = JSON.parse(arg.message);

                        if (tokenResponse.error) {
                            reject(new Error(tokenResponse.error));
                            return;
                        }

                        // Decode the ID token
                        const userToken = jwt_decode(tokenResponse.id_token);

                        const userInfo = {
                            name: userToken.name || null,
                            email: userToken.preferred_username || userToken.email || null,
                            userId: userToken.oid || userToken.sub || null,
                            timestamp: new Date().toISOString()
                        };

                        console.log('✅ Fallback auth successful:', userInfo);
                        resolve(userInfo);

                    } catch (error) {
                        console.error('❌ Error processing dialog response:', error);
                        reject(error);
                    }
                });

                // Handle dialog errors
                dialog.addEventHandler(Office.EventType.DialogEventReceived, (arg) => {
                    console.error('Dialog event:', arg);
                    dialog.close();
                    reject(new Error('Dialog closed or failed: ' + arg.error));
                });
            }
        );
    });
}

/**
 * Gets user info with automatic fallback to dialog auth if SSO fails
 * This is the recommended function to use - it tries SSO first, then falls back
 *
 * @returns {Promise<Object>} User info object
 */
export async function getUserInfoWithFallback() {
    try {
        // Try SSO first (preferred method)
        console.log('Attempting SSO authentication...');
        return await getOfficeUserInfo();

    } catch (ssoError) {
        console.warn('SSO failed, trying fallback dialog authentication...', ssoError);

        // Fall back to dialog-based auth
        try {
            return await fallbackAuthGetUserInfo();

        } catch (fallbackError) {
            console.error('Both SSO and fallback authentication failed:', fallbackError);

            // Return minimal info to allow add-in to continue
            return {
                name: 'Unknown User',
                email: null,
                userId: null,
                timestamp: new Date().toISOString(),
                authenticationFailed: true
            };
        }
    }
}

/**
 * Simple wrapper that caches user info for the session
 * Useful to avoid repeated authentication calls
 */
let cachedUserInfo = null;

export async function getCachedUserInfo(forceRefresh = false) {
    if (cachedUserInfo && !forceRefresh) {
        console.log('Using cached user info');
        return cachedUserInfo;
    }

    console.log('Fetching fresh user info...');
    cachedUserInfo = await getUserInfoWithFallback();
    return cachedUserInfo;
}

/**
 * Clears the cached user info
 * Call this when user signs out or you need fresh data
 */
export function clearUserInfoCache() {
    cachedUserInfo = null;
    console.log('User info cache cleared');
}
