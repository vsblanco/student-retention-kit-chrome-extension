/**
 * Canvas API Response Cache Module
 *
 * Caches Canvas API responses (user data and courses) to reduce API calls.
 * Uses course end_at dates as cache expiration timestamps.
 *
 * Version: 1.0
 * Date: 2025-12-18
 */

const CANVAS_CACHE_KEY = 'canvasApiCache';

/**
 * Cache entry structure:
 * {
 *   [SyStudentId]: {
 *     userData: {...},           // Canvas user profile data
 *     courses: [...],            // Array of course objects
 *     expiresAt: Date ISO string, // Latest course end_at date
 *     cachedAt: Date ISO string  // When this was cached
 *   }
 * }
 */

/**
 * Retrieves the entire cache from Chrome storage
 * @returns {Promise<Object>} The cache object
 */
async function getCache() {
    try {
        const result = await chrome.storage.local.get(CANVAS_CACHE_KEY);
        return result[CANVAS_CACHE_KEY] || {};
    } catch (error) {
        console.error('Error retrieving cache:', error);
        return {};
    }
}

/**
 * Saves the cache to Chrome storage
 * @param {Object} cache - The cache object to save
 * @returns {Promise<void>}
 */
async function saveCache(cache) {
    try {
        await chrome.storage.local.set({ [CANVAS_CACHE_KEY]: cache });
    } catch (error) {
        console.error('Error saving cache:', error);
    }
}

/**
 * Gets cached data for a specific student
 * @param {string} syStudentId - The SyStudentId to look up
 * @returns {Promise<Object|null>} The cached data or null if not found/expired
 */
export async function getCachedData(syStudentId) {
    if (!syStudentId) return null;

    const cache = await getCache();
    const entry = cache[syStudentId];

    if (!entry) {
        return null; // No cache entry
    }

    // Check if cache has expired
    const now = new Date();
    const expiresAt = new Date(entry.expiresAt);

    if (now > expiresAt) {
        // Cache expired, remove it
        await removeCachedData(syStudentId);
        return null;
    }

    return {
        userData: entry.userData,
        courses: entry.courses,
        expiresAt: entry.expiresAt,
        cachedAt: entry.cachedAt
    };
}

/**
 * Caches Canvas API data for a student
 * @param {string} syStudentId - The SyStudentId
 * @param {Object} userData - The Canvas user profile data
 * @param {Array} courses - The array of course objects
 * @returns {Promise<void>}
 */
export async function setCachedData(syStudentId, userData, courses) {
    if (!syStudentId) return;

    // Determine expiration date from courses
    let latestEndDate = null;

    if (courses && courses.length > 0) {
        // Find the latest end_at date among all courses
        for (const course of courses) {
            if (course.end_at) {
                const endDate = new Date(course.end_at);
                if (!latestEndDate || endDate > latestEndDate) {
                    latestEndDate = endDate;
                }
            }
        }
    }

    // If no end dates found, set expiration to 30 days from now as fallback
    if (!latestEndDate) {
        latestEndDate = new Date();
        latestEndDate.setDate(latestEndDate.getDate() + 30);
    }

    const cache = await getCache();

    cache[syStudentId] = {
        userData: userData,
        courses: courses,
        expiresAt: latestEndDate.toISOString(),
        cachedAt: new Date().toISOString()
    };

    await saveCache(cache);
}

/**
 * Removes cached data for a specific student
 * @param {string} syStudentId - The SyStudentId
 * @returns {Promise<void>}
 */
export async function removeCachedData(syStudentId) {
    if (!syStudentId) return;

    const cache = await getCache();
    delete cache[syStudentId];
    await saveCache(cache);
}

/**
 * Clears all cached Canvas API data
 * @returns {Promise<void>}
 */
export async function clearAllCache() {
    await chrome.storage.local.remove(CANVAS_CACHE_KEY);
}

/**
 * Gets cache statistics (total entries, expired entries, etc.)
 * @returns {Promise<Object>} Statistics about the cache
 */
export async function getCacheStats() {
    const cache = await getCache();
    const entries = Object.entries(cache);
    const now = new Date();

    let totalEntries = entries.length;
    let expiredEntries = 0;
    let validEntries = 0;

    for (const [syStudentId, entry] of entries) {
        const expiresAt = new Date(entry.expiresAt);
        if (now > expiresAt) {
            expiredEntries++;
        } else {
            validEntries++;
        }
    }

    return {
        totalEntries,
        validEntries,
        expiredEntries
    };
}

/**
 * Cleans up expired cache entries
 * @returns {Promise<number>} Number of entries removed
 */
export async function cleanupExpiredCache() {
    const cache = await getCache();
    const entries = Object.entries(cache);
    const now = new Date();
    let removedCount = 0;

    for (const [syStudentId, entry] of entries) {
        const expiresAt = new Date(entry.expiresAt);
        if (now > expiresAt) {
            delete cache[syStudentId];
            removedCount++;
        }
    }

    if (removedCount > 0) {
        await saveCache(cache);
    }

    return removedCount;
}
