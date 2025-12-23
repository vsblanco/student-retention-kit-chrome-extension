// content/excel_connector.js

// Prevent multiple injections
if (window.hasSRKConnectorRun) {
  // Script already loaded, stop here.
  console.log("SRK Connector already active.");
} else {
  window.hasSRKConnectorRun = true;

  console.log("%c SRK: Excel Connector Script LOADED", "background: #222; color: #bada55; font-size: 14px");

  // Notify extension that connector is active
  chrome.runtime.sendMessage({
      type: "SRK_CONNECTOR_ACTIVE",
      timestamp: Date.now()
  }).catch(() => {
      // Extension might not be ready yet, that's ok
  });

  window.addEventListener("message", (event) => {
      if (!event.data || !event.data.type) return;

      // Check for the Ping from Office Add-in
      if (event.data.type === "SRK_CHECK_EXTENSION") {
          console.log("%c SRK Connector: Ping Received! Ponging Sender...", "color: green; font-weight: bold");

          // Reply specifically to the window that sent the message
          if (event.source) {
              event.source.postMessage({ type: "SRK_EXTENSION_INSTALLED" }, "*");
          }

          // Notify extension that Office Add-in is connected
          chrome.runtime.sendMessage({
              type: "SRK_OFFICE_ADDIN_CONNECTED",
              timestamp: Date.now()
          }).catch(() => {
              // Extension might not be ready, that's ok
          });
      }

      // Handle Master List Request
      else if (event.data.type === "SRK_REQUEST_MASTER_LIST") {
          console.log("%c SRK Connector: Master List Request Received", "color: blue; font-weight: bold");
          console.log("Request timestamp:", event.data.timestamp);

          // Check setting to determine if we should accept the data
          checkIfShouldAcceptMasterList(event.source);
      }

      // Handle Master List Data
      else if (event.data.type === "SRK_MASTER_LIST_DATA") {
          console.log("%c SRK Connector: Master List Data Received!", "color: green; font-weight: bold");
          handleMasterListData(event.data.data);
      }

      // Handle Selected Students
      else if (event.data.type === "SRK_SELECTED_STUDENTS") {
          console.log("%c SRK Connector: Selected Students Received!", "color: purple; font-weight: bold");
          handleSelectedStudents(event.data.data);
      }
  });

  /**
   * Checks if we should accept the master list update based on user settings
   * @param {MessageEventSource} source - The event source to send response to
   */
  function checkIfShouldAcceptMasterList(source) {
      chrome.storage.local.get(['autoUpdateMasterList', 'lastUpdated'], (result) => {
          const setting = result.autoUpdateMasterList || 'always';
          let wantsData = false;

          if (setting === 'never') {
              console.log("%c Auto-update is disabled. Rejecting data.", "color: orange");
              wantsData = false;
          } else if (setting === 'always') {
              console.log("%c Auto-update is set to always. Accepting data.", "color: green");
              wantsData = true;
          } else if (setting === 'once-daily') {
              // Check if last update was today
              const lastUpdated = result.lastUpdated;
              const isToday = checkIfUpdatedToday(lastUpdated);

              if (isToday) {
                  console.log("%c Already updated today. Rejecting data.", "color: orange");
                  wantsData = false;
              } else {
                  console.log("%c Not updated today. Accepting data.", "color: green");
                  wantsData = true;
              }
          }

          // Send response
          if (source) {
              source.postMessage({
                  type: "SRK_MASTER_LIST_RESPONSE",
                  wantsData: wantsData
              }, "*");
          }
      });
  }

  /**
   * Checks if the last update timestamp was today
   * @param {string} lastUpdated - The last updated timestamp
   * @returns {boolean} True if last update was today
   */
  function checkIfUpdatedToday(lastUpdated) {
      if (!lastUpdated) return false;

      try {
          const lastUpdateDate = new Date(lastUpdated);
          const today = new Date();

          return lastUpdateDate.getDate() === today.getDate() &&
                 lastUpdateDate.getMonth() === today.getMonth() &&
                 lastUpdateDate.getFullYear() === today.getFullYear();
      } catch (error) {
          console.error("Error parsing last updated date:", error);
          return false;
      }
  }

  /**
   * Handles incoming Master List data from the Office Add-in
   * Transforms the data from add-in format to extension format and stores it
   */
  function handleMasterListData(data) {
      try {
          console.log(`Processing Master List with ${data.totalStudents} students`);
          console.log("Data timestamp:", data.timestamp);

          // Transform students from add-in format to extension format
          const transformedStudents = data.students.map(student => ({
              name: student.studentName || 'Unknown',
              phone: student.primaryPhone || student.otherPhone || null,
              grade: student.grade !== undefined && student.grade !== null ? String(student.grade) : null,
              StudentNumber: student.studentNumber || null,
              SyStudentId: student.studentId || null,
              daysout: parseInt(student.daysOut) || 0,
              missingCount: 0,
              url: student.gradeBook || null,
              assignments: [],
              // Additional fields that might be useful
              lastLda: student.lastLda || null,
              studentEmail: student.studentEmail || null,
              personalEmail: student.personalEmail || null,
              assigned: student.assigned || null,
              outreach: student.outreach || null
          }));

          const lastUpdated = new Date().toLocaleString('en-US', {
              year: 'numeric',
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
          });

          // Store the transformed data using chrome storage
          chrome.storage.local.set({
              masterEntries: transformedStudents,
              lastUpdated: lastUpdated,
              masterListSourceTimestamp: data.timestamp
          }, () => {
              console.log(`%c ✓ Master List Updated Successfully!`, "color: green; font-weight: bold");
              console.log(`   Students: ${transformedStudents.length}`);
              console.log(`   Updated: ${lastUpdated}`);

              // Notify the extension that master list has been updated
              chrome.runtime.sendMessage({
                  type: "SRK_MASTER_LIST_UPDATED",
                  timestamp: Date.now(),
                  studentCount: transformedStudents.length,
                  sourceTimestamp: data.timestamp
              }).catch(() => {
                  // Extension might not be ready, that's ok
              });
          });

      } catch (error) {
          console.error("%c Error processing Master List data:", "color: red; font-weight: bold", error);

          // Notify extension of error
          chrome.runtime.sendMessage({
              type: "SRK_MASTER_LIST_ERROR",
              error: error.message,
              timestamp: Date.now()
          }).catch(() => {});
      }
  }

  /**
   * Handles incoming Selected Students data from the Office Add-in
   * Transforms and sends student data to the extension
   * @param {Object} data - The selected students data
   */
  function handleSelectedStudents(data) {
      try {
          console.log(`Processing ${data.count} selected student(s)`);
          console.log("Selection timestamp:", data.timestamp);

          if (!data.students || data.students.length === 0) {
              console.log("No students selected");
              return;
          }

          // Check if sync active student is enabled
          chrome.storage.local.get(['syncActiveStudent'], (result) => {
              const syncEnabled = result.syncActiveStudent !== undefined ? result.syncActiveStudent : true;

              if (!syncEnabled) {
                  console.log("%c Sync Active Student is disabled. Skipping student sync.", "color: orange; font-weight: bold");
                  return;
              }

              // Transform all students from add-in format to extension format
              const transformedStudents = data.students.map(student => ({
                  name: student.name || 'Unknown',
                  phone: student.phone || student.otherPhone || null,
                  SyStudentId: student.syStudentId || null,
                  // Set defaults for fields not provided by the Office add-in
                  grade: null,
                  StudentNumber: null,
                  daysout: 0,
                  missingCount: 0,
                  url: null,
                  assignments: []
              }));

              if (data.count === 1) {
                  console.log(`Setting active student: ${transformedStudents[0].name}`);
              } else {
                  console.log(`Setting up automation mode with ${data.count} students`);
              }

              // Send to extension (works for both single and multiple)
              chrome.runtime.sendMessage({
                  type: "SRK_SELECTED_STUDENTS",
                  students: transformedStudents,
                  count: data.count,
                  timestamp: Date.now(),
                  sourceTimestamp: data.timestamp
              }).catch(() => {
                  // Extension might not be ready, that's ok
              });
          });

      } catch (error) {
          console.error("%c Error processing Selected Students data:", "color: red; font-weight: bold", error);
      }
  }

  // Periodically announce presence to extension
  setInterval(() => {
      chrome.runtime.sendMessage({
          type: "SRK_CONNECTOR_HEARTBEAT",
          timestamp: Date.now()
      }).catch(() => {
          // Silently fail if extension is not available
      });
  }, 5000); // Every 5 seconds
}