/*
* Timestamp: 2025-10-24 09:00 AM
* Version: 8.1
*/

// Note: Cannot use ES6 modules in content scripts directly.
(function() {
    // Renamed to avoid collision with other scripts
    const INJECTOR_STORAGE_KEYS = {
        EMBED_IN_CANVAS: 'embedInCanvas',
        MASTER_ENTRIES: 'masterEntries'
    };

    // Only run this script if the setting is enabled
    chrome.storage.local.get({ [INJECTOR_STORAGE_KEYS.EMBED_IN_CANVAS]: true }, (settings) => {
        if (!settings[INJECTOR_STORAGE_KEYS.EMBED_IN_CANVAS]) {
            console.log("Embed in Canvas is disabled. Injector will not run.");
            return;
        }

        // Only run on the student grades page
        if (!window.location.href.includes('/grades/')) {
            return;
        }

        console.log("Gradebook injector script loaded (Embed in Canvas is ON).");

        // Wait for the page to be fully loaded before trying to inject the UI
        if (document.readyState === 'complete') {
            injectSearchUI();
        } else {
            window.addEventListener('load', injectSearchUI, { once: true });
        }
    });

    function injectSearchUI() {
        const targetElement = document.getElementById('print-grades-container');
        if (!targetElement) {
            console.log("Could not find target element to inject search UI.");
            return;
        }

        const searchWrapper = document.createElement('div');
        searchWrapper.id = 'student-search-wrapper';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.id = 'student-search-input';
        searchInput.placeholder = 'Search for a student...';
        const dropdown = document.createElement('div');
        dropdown.id = 'student-search-dropdown';
        searchWrapper.appendChild(searchInput);
        searchWrapper.appendChild(dropdown);
        targetElement.parentNode.insertBefore(searchWrapper, targetElement.nextSibling);

        const styles = `
            #student-search-wrapper { position: relative; margin: 15px 0; width: 100%; max-width: 400px; }
            #student-search-input { width: 100%; padding: 10px; font-size: 16px; border: 1px solid #ccc; border-radius: 8px; }
            #student-search-dropdown { display: none; position: absolute; top: 100%; left: 0; right: 0; background-color: white; border: 1px solid #ccc; border-top: none; border-radius: 0 0 8px 8px; max-height: 300px; overflow-y: auto; z-index: 1000; }
            #student-search-dropdown a, #student-search-dropdown div { padding: 12px; border-bottom: 1px solid #eee; text-decoration: none; color: #333; display: block; }
            #student-search-dropdown a:hover { background-color: #f5f5f5; cursor: pointer; }
        `;
        const styleSheet = document.createElement("style");
        styleSheet.type = "text/css";
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);

        addSearchFunctionality(searchInput, dropdown);
    }

    function addSearchFunctionality(searchInput, dropdown) {
        chrome.storage.local.get({ [INJECTOR_STORAGE_KEYS.MASTER_ENTRIES]: [] }, (data) => {
            const masterList = data[INJECTOR_STORAGE_KEYS.MASTER_ENTRIES];
            searchInput.addEventListener('input', () => {
                const term = searchInput.value.trim();
                const lowerTerm = term.toLowerCase();
                dropdown.innerHTML = '';

                if (!term) {
                    dropdown.style.display = 'none';
                    return;
                }

                const filtered = masterList.filter(entry => 
                    entry.name.toLowerCase().includes(lowerTerm)
                );
                filtered.sort((a, b) => {
                    const nameA = a.name.toLowerCase();
                    const nameB = b.name.toLowerCase();
                    const aStartsWith = nameA.startsWith(lowerTerm);
                    const bStartsWith = nameB.startsWith(lowerTerm);
                    if (aStartsWith && !bStartsWith) return -1;
                    if (!aStartsWith && bStartsWith) return 1;
                    return nameA.localeCompare(nameB);
                });

                if (filtered.length > 0) {
                    filtered.forEach(student => {
                        if (student.url && student.url !== '#N/A' && student.url.startsWith('http')) {
                            const link = document.createElement('a');
                            link.href = student.url;
                            link.textContent = student.name;
                            link.addEventListener('click', (e) => {
                                e.preventDefault();
                                window.location.href = student.url;
                            });
                            dropdown.appendChild(link);
                        } else {
                            const invalidEntry = document.createElement('div');
                            invalidEntry.textContent = student.name;
                            invalidEntry.style.color = '#888';
                            invalidEntry.style.cursor = 'not-allowed';
                            invalidEntry.title = 'Invalid URL. Please update on the master list.';
                            dropdown.appendChild(invalidEntry);
                        }
                    });
                    dropdown.style.display = 'block';
                } else {
                    dropdown.style.display = 'none';
                }
            });
        });

        document.addEventListener('click', (event) => {
            if (!searchInput.contains(event.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

})();