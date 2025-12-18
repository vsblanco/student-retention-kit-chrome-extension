// [2025-12-18] Version 1.3 - Call Manager Module
// Handles all call state management, automation, and Five9 integration
// v1.2: Skip button marks students to skip over without removing from queue
// v1.3: Dial button cancels automation and keeps only current student

/**
 * CallManager class - Manages call state, timers, and automation sequences
 */
export default class CallManager {
    constructor(elements, uiCallbacks = {}) {
        this.elements = elements;
        this.isCallActive = false;
        this.callTimerInterval = null;
        this.selectedQueue = [];
        this.debugMode = false;
        this.automationMode = false;
        this.currentAutomationIndex = 0;
        this.skippedIndices = new Set(); // Track indices of students to skip
        this.uiCallbacks = uiCallbacks; // Callbacks for UI updates
    }

    /**
     * Updates the reference to the selected queue
     * @param {Array} queue - Array of selected student entries
     */
    updateQueue(queue) {
        this.selectedQueue = queue;
    }

    /**
     * Sets debug mode state
     * @param {boolean} enabled - Whether debug mode is enabled
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
        this.updateCallInterfaceState();
    }

    /**
     * Gets current call active state
     * @returns {boolean} Whether a call is currently active
     */
    getCallActiveState() {
        return this.isCallActive;
    }

    /**
     * Toggles call state between active and inactive
     * Handles both single calls and automation mode
     * @param {boolean} forceEnd - Force end the call regardless of current state
     */
    toggleCallState(forceEnd = false) {
        // --- CHECK DEBUG MODE ---
        if (!this.debugMode && !this.isCallActive) {
            alert('Call functionality is disabled.\n\nTo enable the call demo, turn on Debug Mode in Settings.');
            return;
        }
        // ----------------------

        // --- CANCEL AUTOMATION MODE ---
        // If in automation mode and call is active, cancel automation
        if (this.automationMode && this.isCallActive) {
            this.cancelAutomation();
            return;
        }
        // --------------------------------------

        // --- CHECK FOR AUTOMATION MODE ---
        if (this.selectedQueue.length > 1 && !this.isCallActive) {
            this.startAutomationSequence();
            return;
        }
        // --------------------------------------

        if (forceEnd && !this.isCallActive) return;
        this.isCallActive = !this.isCallActive;
        if (forceEnd) this.isCallActive = false;

        if (this.isCallActive) {
            this.elements.dialBtn.style.background = '#ef4444';
            this.elements.dialBtn.style.transform = 'rotate(135deg)';
            this.elements.callStatusText.innerHTML = '<span class="status-indicator" style="background:#ef4444; animation: blink 1s infinite;"></span> Connected';

            // Show Disposition Grid
            if (this.elements.callDispositionSection) {
                this.elements.callDispositionSection.style.display = 'flex';
            }

            this.startCallTimer();
        } else {
            this.elements.dialBtn.style.background = '#10b981';
            this.elements.dialBtn.style.transform = 'rotate(0deg)';
            this.elements.callStatusText.innerHTML = '<span class="status-indicator ready"></span> Ready to Connect';

            // Hide Disposition Grid
            if (this.elements.callDispositionSection) {
                this.elements.callDispositionSection.style.display = 'none';
            }

            // Hide custom input area if it was open
            if (this.elements.otherInputArea) {
                this.elements.otherInputArea.style.display = 'none';
            }

            this.stopCallTimer();
        }
    }

    /**
     * Starts the automation sequence for multiple students
     */
    startAutomationSequence() {
        if (this.selectedQueue.length === 0) {
            alert('No students selected for automation.');
            return;
        }

        this.automationMode = true;
        this.currentAutomationIndex = 0;
        this.skippedIndices.clear(); // Reset skipped indices

        // Start calling the first student
        this.callNextStudentInQueue();
    }

    /**
     * Finds the next non-skipped student index starting from a given index
     * @param {number} startIndex - Index to start searching from
     * @returns {number} Next non-skipped index, or -1 if none found
     */
    findNextNonSkippedIndex(startIndex) {
        for (let i = startIndex; i < this.selectedQueue.length; i++) {
            if (!this.skippedIndices.has(i)) {
                return i;
            }
        }
        return -1; // No non-skipped students found
    }

    /**
     * Calls the next student in the automation queue
     */
    callNextStudentInQueue() {
        // Find next non-skipped student
        const nextIndex = this.findNextNonSkippedIndex(this.currentAutomationIndex);

        if (nextIndex === -1) {
            // No more non-skipped students - automation complete
            this.endAutomationSequence();
            return;
        }

        // Update current index to the next non-skipped student
        this.currentAutomationIndex = nextIndex;
        const currentStudent = this.selectedQueue[this.currentAutomationIndex];

        // Update UI to show current student
        if (this.uiCallbacks.updateCurrentStudent) {
            this.uiCallbacks.updateCurrentStudent(currentStudent);
        }

        // Update "Up Next" card
        this.updateUpNextCard();

        // Start the call
        this.isCallActive = true;
        this.elements.dialBtn.style.background = '#ef4444';
        this.elements.dialBtn.style.transform = 'rotate(135deg)';
        this.elements.callStatusText.innerHTML = '<span class="status-indicator" style="background:#ef4444; animation: blink 1s infinite;"></span> Connected';

        // Show Disposition Grid
        if (this.elements.callDispositionSection) {
            this.elements.callDispositionSection.style.display = 'flex';
        }

        this.startCallTimer();
    }

    /**
     * Updates the "Up Next" card during automation
     */
    updateUpNextCard() {
        if (!this.elements.upNextCard || !this.elements.upNextName) return;

        if (!this.automationMode) {
            this.elements.upNextCard.style.display = 'none';
            return;
        }

        // Find next non-skipped student
        const nextIndex = this.findNextNonSkippedIndex(this.currentAutomationIndex + 1);

        if (nextIndex !== -1) {
            // Show next non-skipped student
            this.elements.upNextCard.style.display = 'block';
            this.elements.upNextName.textContent = this.selectedQueue[nextIndex].name;
        } else {
            // No more non-skipped students
            this.elements.upNextCard.style.display = 'none';
        }

        // Update skip button state
        this.updateSkipButtonState();
    }

    /**
     * Skips the "Up Next" student (marks them to be skipped without calling)
     */
    skipToNext() {
        if (!this.automationMode) {
            console.warn('Skip only available in automation mode');
            return;
        }

        if (!this.isCallActive) {
            console.warn('No active call');
            return;
        }

        // Find the next non-skipped student index
        const upNextIndex = this.findNextNonSkippedIndex(this.currentAutomationIndex + 1);

        // Check if there is a student to skip
        if (upNextIndex === -1) {
            console.warn('No up next student to skip');
            return;
        }

        // Mark this student as skipped
        this.skippedIndices.add(upNextIndex);
        const skippedStudent = this.selectedQueue[upNextIndex];
        console.log(`Marked student to skip: ${skippedStudent.name}`);

        // Update the "Up Next" card to show the new next non-skipped student
        this.updateUpNextCard();

        // Update skip button state
        this.updateSkipButtonState();
    }

    /**
     * Updates skip button enabled/disabled state
     */
    updateSkipButtonState() {
        if (!this.elements.skipStudentBtn) return;

        // Check if there's a non-skipped student after the current one
        const upNextIndex = this.findNextNonSkippedIndex(this.currentAutomationIndex + 1);
        const hasUpNext = this.automationMode && upNextIndex !== -1;

        if (hasUpNext) {
            // Enable skip button
            this.elements.skipStudentBtn.disabled = false;
            this.elements.skipStudentBtn.style.opacity = '1';
            this.elements.skipStudentBtn.style.cursor = 'pointer';
        } else {
            // Disable skip button
            this.elements.skipStudentBtn.disabled = true;
            this.elements.skipStudentBtn.style.opacity = '0.3';
            this.elements.skipStudentBtn.style.cursor = 'not-allowed';
        }
    }

    /**
     * Ends the automation sequence
     */
    endAutomationSequence() {
        const totalCalled = this.selectedQueue.length;
        const lastStudent = this.selectedQueue[this.selectedQueue.length - 1];

        this.automationMode = false;
        this.currentAutomationIndex = 0;

        // Hide "Up Next" card
        if (this.elements.upNextCard) {
            this.elements.upNextCard.style.display = 'none';
        }

        // Reset call UI to regular mode
        if (this.elements.dialBtn) {
            this.elements.dialBtn.classList.remove('automation');
            this.elements.dialBtn.innerHTML = '<i class="fas fa-phone"></i>';
            this.elements.dialBtn.style.background = '#10b981';
            this.elements.dialBtn.style.transform = 'rotate(0deg)';
        }

        if (this.elements.callStatusText) {
            this.elements.callStatusText.innerHTML = '<span class="status-indicator ready"></span> Ready to Connect';
        }

        // Hide disposition section
        if (this.elements.callDispositionSection) {
            this.elements.callDispositionSection.style.display = 'none';
        }

        // Update UI to show last student and reset to single-student mode
        if (lastStudent) {
            if (this.uiCallbacks.finalizeAutomation) {
                this.uiCallbacks.finalizeAutomation(lastStudent);
            } else if (this.uiCallbacks.updateCurrentStudent) {
                // Fallback if finalizeAutomation not provided
                this.uiCallbacks.updateCurrentStudent(lastStudent);
            }
        }

        // Notify completion
        alert(`Automation complete! Called ${totalCalled} students.`);
    }

    /**
     * Cancels the automation sequence and returns to normal calling mode
     * Keeps only the current student being called
     */
    cancelAutomation() {
        // Get the current student (the one currently being called)
        const currentStudent = this.selectedQueue[this.currentAutomationIndex];

        // End the current call
        this.isCallActive = false;
        this.stopCallTimer();

        // Exit automation mode
        this.automationMode = false;
        this.currentAutomationIndex = 0;
        this.skippedIndices.clear();

        // Hide "Up Next" card
        if (this.elements.upNextCard) {
            this.elements.upNextCard.style.display = 'none';
        }

        // Reset call UI to regular mode
        if (this.elements.dialBtn) {
            this.elements.dialBtn.classList.remove('automation');
            this.elements.dialBtn.innerHTML = '<i class="fas fa-phone"></i>';
            this.elements.dialBtn.style.background = '#10b981';
            this.elements.dialBtn.style.transform = 'rotate(0deg)';
        }

        if (this.elements.callStatusText) {
            this.elements.callStatusText.innerHTML = '<span class="status-indicator ready"></span> Ready to Connect';
        }

        // Hide disposition section
        if (this.elements.callDispositionSection) {
            this.elements.callDispositionSection.style.display = 'none';
        }

        // Hide custom input area if it was open
        if (this.elements.otherInputArea) {
            this.elements.otherInputArea.style.display = 'none';
        }

        // Clear queue to only current student and update UI
        if (currentStudent && this.uiCallbacks.cancelAutomation) {
            this.uiCallbacks.cancelAutomation(currentStudent);
        }
    }

    /**
     * Starts the call timer and updates display every second
     */
    startCallTimer() {
        let seconds = 0;
        this.elements.callTimer.textContent = "00:00";
        clearInterval(this.callTimerInterval);

        this.callTimerInterval = setInterval(() => {
            seconds++;
            const m = Math.floor(seconds / 60).toString().padStart(2, '0');
            const s = (seconds % 60).toString().padStart(2, '0');
            this.elements.callTimer.textContent = `${m}:${s}`;
        }, 1000);
    }

    /**
     * Stops the call timer and resets display
     */
    stopCallTimer() {
        clearInterval(this.callTimerInterval);
        this.callTimerInterval = null;
        this.elements.callTimer.textContent = "00:00";
    }

    /**
     * Handles call disposition selection and ends the call
     * @param {string} type - The disposition type selected
     */
    handleDisposition(type) {
        console.log("Logged Disposition:", type);

        // TODO: Store disposition data
        // Future implementation:
        // - Save disposition to chrome.storage
        // - Associate with current student
        // - Track disposition history

        // End current call
        this.isCallActive = false;
        this.stopCallTimer();

        // Check if in automation mode
        if (this.automationMode) {
            // Move to next student
            this.currentAutomationIndex++;

            // Hide disposition section temporarily
            if (this.elements.callDispositionSection) {
                this.elements.callDispositionSection.style.display = 'none';
            }

            // Brief delay before next call (for demo purposes)
            setTimeout(() => {
                this.callNextStudentInQueue();
            }, 500);
        } else {
            // Single call mode - just end the call
            this.toggleCallState(true);
        }
    }

    /**
     * Initiates a call through Five9
     * @param {string} phoneNumber - Phone number to dial
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async initiateCall(phoneNumber) {
        if (!phoneNumber || phoneNumber === "No Phone Listed") {
            return { success: false, error: "No valid phone number" };
        }

        try {
            // Send message to Five9 connector content script
            const response = await chrome.runtime.sendMessage({
                type: 'executeFive9Call',
                phoneNumber: phoneNumber
            });

            return response;
        } catch (error) {
            console.error("Error initiating call:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Hangs up the current Five9 call
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async hangupCall() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'executeFive9Hangup'
            });

            return response;
        } catch (error) {
            console.error("Error hanging up call:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Updates the call interface visual state based on debug mode
     */
    updateCallInterfaceState() {
        if (!this.elements.dialBtn || !this.elements.callStatusText) return;

        if (this.debugMode) {
            // Enable call interface
            this.elements.dialBtn.style.opacity = '1';
            this.elements.dialBtn.style.cursor = 'pointer';
            this.elements.dialBtn.title = '';
            if (!this.isCallActive) {
                this.elements.callStatusText.innerHTML = '<span class="status-indicator ready"></span> Ready to Connect';
            }
        } else {
            // Disable call interface
            this.elements.dialBtn.style.opacity = '0.5';
            this.elements.dialBtn.style.cursor = 'not-allowed';
            this.elements.dialBtn.title = 'Enable Debug Mode in Settings to use call functionality';
            this.elements.callStatusText.innerHTML = '<span class="status-indicator" style="background:#f59e0b;"></span> Calls Disabled (Enable Debug Mode)';
        }
    }

    /**
     * Cleanup method - call when disposing the manager
     */
    cleanup() {
        this.stopCallTimer();
        this.selectedQueue = [];
        this.isCallActive = false;
    }
}
