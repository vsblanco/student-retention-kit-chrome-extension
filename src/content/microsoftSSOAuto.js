// Microsoft 365 SSO Auto-Click for Five9
// Automatically clicks the Five9 app tile/button when the Microsoft 365 page loads

console.log("SRK: Microsoft SSO Auto-Click script loaded");

/**
 * Attempts to find and click the Five9 app tile/button
 * Tries multiple selector strategies to find the Five9 link
 */
function findAndClickFive9() {
    // Strategy 1: Find links/buttons containing "Five9" text
    const textElements = Array.from(document.querySelectorAll('a, button, div[role="button"]'));
    const five9ByText = textElements.find(el =>
        el.textContent && el.textContent.toLowerCase().includes('five9')
    );

    if (five9ByText) {
        console.log("SRK: Found Five9 by text content:", five9ByText);
        five9ByText.click();
        return true;
    }

    // Strategy 2: Find links with "five9" in href
    const five9ByHref = document.querySelector('a[href*="five9" i]');
    if (five9ByHref) {
        console.log("SRK: Found Five9 by href:", five9ByHref);
        five9ByHref.click();
        return true;
    }

    // Strategy 3: Find by aria-label
    const five9ByAria = document.querySelector('[aria-label*="five9" i], [aria-label*="Five9"]');
    if (five9ByAria) {
        console.log("SRK: Found Five9 by aria-label:", five9ByAria);
        five9ByAria.click();
        return true;
    }

    // Strategy 4: Find by title attribute
    const five9ByTitle = document.querySelector('[title*="five9" i], [title*="Five9"]');
    if (five9ByTitle) {
        console.log("SRK: Found Five9 by title:", five9ByTitle);
        five9ByTitle.click();
        return true;
    }

    // Strategy 5: Find app tiles (Microsoft 365 typically uses specific classes for app tiles)
    const appTiles = document.querySelectorAll('[class*="app"], [class*="tile"], [data-app-name]');
    for (const tile of appTiles) {
        const tileText = tile.textContent || '';
        const dataAppName = tile.getAttribute('data-app-name') || '';
        if (tileText.toLowerCase().includes('five9') || dataAppName.toLowerCase().includes('five9')) {
            console.log("SRK: Found Five9 app tile:", tile);
            tile.click();
            return true;
        }
    }

    return false;
}

/**
 * Attempts to find and click Five9 with retries
 * Uses MutationObserver to watch for dynamic content
 */
function autoClickWithRetries() {
    let attempts = 0;
    const maxAttempts = 10;
    const retryInterval = 500; // ms

    const tryClick = () => {
        attempts++;
        console.log(`SRK: Attempt ${attempts}/${maxAttempts} to find Five9 button...`);

        if (findAndClickFive9()) {
            console.log("✅ SRK: Successfully clicked Five9 button!");
            return;
        }

        if (attempts < maxAttempts) {
            setTimeout(tryClick, retryInterval);
        } else {
            console.warn("⚠️ SRK: Could not find Five9 button after", maxAttempts, "attempts");
            console.log("SRK: You may need to manually click the Five9 app tile");
        }
    };

    // Initial attempt
    tryClick();

    // Also watch for DOM changes (in case content loads dynamically)
    const observer = new MutationObserver((mutations) => {
        if (attempts < maxAttempts) {
            // Debounce: only try clicking once per second max during mutations
            clearTimeout(tryClick.timeout);
            tryClick.timeout = setTimeout(() => {
                if (!document.querySelector('[data-five9-clicked="true"]')) {
                    findAndClickFive9();
                }
            }, 1000);
        } else {
            observer.disconnect();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Stop observing after 15 seconds
    setTimeout(() => observer.disconnect(), 15000);
}

// Start auto-click when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoClickWithRetries);
} else {
    autoClickWithRetries();
}
