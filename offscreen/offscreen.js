// offscreen.js

// This script runs in the offscreen document, which has access to the 'window' object.
chrome.runtime.onMessage.addListener(handleMessages);

function handleMessages(message) {
  // We only expect 'trigger-pusher' messages from the service worker.
  if (message.target === 'offscreen' && message.type === 'trigger-pusher') {
    triggerPusher(message.connection, message.payload);
  }
}

function triggerPusher(connection, payload) {
    try {
        // Because this script runs in a context with a 'window' object,
        // we can safely initialize and use the Pusher library here.
        const pusher = new Pusher(connection.key, {
            cluster: connection.cluster
        });
        pusher.trigger(connection.channel, connection.event, payload);
        console.log("Offscreen: Pusher event triggered successfully.");
    } catch (e) {
        console.error("Offscreen: Pusher error:", e);
    }
}
