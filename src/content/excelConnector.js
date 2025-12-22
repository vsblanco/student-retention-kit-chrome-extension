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
      // Check for the Ping from Office Add-in
      if (event.data && event.data.type === "SRK_CHECK_EXTENSION") {
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
  });

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