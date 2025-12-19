// [2025-12-19] Call Disposition Constants
// Maps disposition types to their Five9 disposition IDs

export const DISPOSITION_CODES = {
    "Left Voicemail": "300000000000046",
    "No Answer": "",        // TODO: Add Five9 disposition code
    "Disconnected": "",     // TODO: Add Five9 disposition code
    "Other": ""            // TODO: Add Five9 disposition code
};

/**
 * Gets the disposition code for a given disposition type
 * @param {string} dispositionType - The disposition type (e.g., "Left Voicemail")
 * @returns {string|null} The Five9 disposition code, or null if not found/empty
 */
export function getDispositionCode(dispositionType) {
    // Handle custom notes (starts with "Custom Note:")
    if (dispositionType.startsWith("Custom Note:")) {
        return DISPOSITION_CODES["Other"];
    }

    return DISPOSITION_CODES[dispositionType] || null;
}

/**
 * Checks if a disposition type has a valid code
 * @param {string} dispositionType - The disposition type
 * @returns {boolean} True if the disposition has a non-empty code
 */
export function hasDispositionCode(dispositionType) {
    const code = DISPOSITION_CODES[dispositionType];
    return code !== undefined && code !== "";
}
