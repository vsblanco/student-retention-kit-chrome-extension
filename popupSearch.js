// popupSearch.js

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('newItemInput');
  if (!searchInput) return;

  searchInput.addEventListener('input', () => {
    const term = searchInput.value.trim().toLowerCase();
    
    // --- THIS IS THE NEW PART ---
    // Create a version of the search term with only numbers for phone number matching.
    const numericTerm = term.replace(/[^0-9]/g, '');

    chrome.storage.local.get({ masterEntries: [] }, data => {
      const entries = data.masterEntries;

      // Filter by checking the name OR the numeric parts of the phone number.
      const filtered = entries.filter(entry => {
        const nameMatch = entry.name.toLowerCase().includes(term);
        
        let phoneMatch = false;
        // Only perform the phone number check if the user has typed numbers.
        if (entry.phone && numericTerm.length > 0) {
            // Strip non-numeric characters from the stored phone number for comparison.
            const numericPhone = entry.phone.replace(/[^0-9]/g, '');
            phoneMatch = numericPhone.includes(numericTerm);
        }
        
        return nameMatch || phoneMatch;
      });

      // Re-render the list with only matching entries
      renderMasterList(filtered);
      
      // Update the badge to reflect number of matches
      const badge = document.querySelector('.tab-button[data-tab="master"] .count');
      if (badge) badge.textContent = filtered.length;
    });
  });
});