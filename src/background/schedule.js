// [2025-09-16 15:39 PM]
// Version: 1.2
import { STORAGE_KEYS, CHECKER_MODES, EXTENSION_STATES, SCHEDULED_ALARM_NAME } from '../constants/index.js';

export async function setupSchedule() {
  const settings = await chrome.storage.local.get([
      STORAGE_KEYS.SCHEDULED_CHECK_ENABLED, 
      STORAGE_KEYS.SCHEDULED_CHECK_TIME
    ]);
  
  await chrome.alarms.clear(SCHEDULED_ALARM_NAME);

  if (settings[STORAGE_KEYS.SCHEDULED_CHECK_ENABLED]) {
    const time = settings[STORAGE_KEYS.SCHEDULED_CHECK_TIME] || '08:00';
    const [hour, minute] = time.split(':').map(Number);
    
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(hour, minute, 0, 0);

    if (nextRun < now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    const delayInMinutes = (nextRun.getTime() - now.getTime()) / 60000;

    chrome.alarms.create(SCHEDULED_ALARM_NAME, {
      delayInMinutes: delayInMinutes,
      periodInMinutes: 24 * 60 // 24 hours
    });
    console.log(`Scheduler: Daily check scheduled. Next run at: ${nextRun.toLocaleString()}`);
  } else {
    console.log("Scheduler: Daily check is disabled. No alarm set.");
  }
}

export async function runScheduledCheck() {
  console.log("Scheduler: Woke up to run the daily check.");
  const settings = await chrome.storage.local.get([
      STORAGE_KEYS.SCHEDULED_CHECK_ENABLED, 
      STORAGE_KEYS.SCHEDULED_MASTER_LIST
    ]);

  if (!settings[STORAGE_KEYS.SCHEDULED_CHECK_ENABLED]) {
    console.log("Scheduler: Check is disabled, going back to sleep.");
    return;
  }
  
  const scheduledListJson = settings[STORAGE_KEYS.SCHEDULED_MASTER_LIST];
  if (scheduledListJson && scheduledListJson.trim() !== '') {
      try {
          const entries = JSON.parse(scheduledListJson);
          if (!Array.isArray(entries)) throw new Error("Scheduled list is not a valid JSON array.");

          const validatedEntries = entries.map(s => {
              if (!s.StudentName || !s.GradeBook) return null;
              return {
                  name: s.StudentName,
                  url: s.GradeBook,
                  daysout: s.DaysOut,
                  lda: s.LDA,
                  grade: s.Grade,
                  phone: '', 
                  time: ''
              };
          }).filter(Boolean);

          await chrome.storage.local.set({ [STORAGE_KEYS.MASTER_ENTRIES]: validatedEntries });
          console.log(`Scheduler: Successfully loaded ${validatedEntries.length} students from the scheduled Master List.`);
      } catch (e) {
          console.error("Scheduler: Could not parse the scheduled Master List. It might be invalid JSON. Using the existing Master List instead.", e);
      }
  } else {
      console.log("Scheduler: No scheduled Master List found. Using the existing list.");
  }

  console.log("Scheduler: Starting Missing Assignments check.");
  await chrome.storage.local.set({
    [STORAGE_KEYS.CHECKER_MODE]: CHECKER_MODES.MISSING,
    [STORAGE_KEYS.EXTENSION_STATE]: EXTENSION_STATES.ON
  });
}

