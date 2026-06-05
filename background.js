// background.js - Service worker for global keyboard command support
// Listens for Ctrl+Shift+A (or Cmd+Shift+A on Mac) to toggle annotation instantly.

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-annotation') {
    try {
      const [tab] = await chrome.tabs.query({ 
        active: true, 
        currentWindow: true 
      });
      
      if (tab && tab.id) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['annotate.js']
        });
      }
    } catch (error) {
      console.warn('[Annotate] Global shortcut failed on this page:', error.message);
      // Silent fail on protected pages — user will use popup instead
    }
  }
});

// Optional: On install, could show welcome but kept minimal as per philosophy
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('%c[Annotate Pro] Installed. Use Ctrl+Shift+A or click the icon to annotate any page.', 'color:#ff0000');
  }
});

// Handle messages from content script (annotate.js)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capture-screenshot') {
    (async () => {
      try {
        const tabId = sender.tab ? sender.tab.id : null;
        if (!tabId) {
          sendResponse({ success: false, error: 'No tab' });
          return;
        }

        // Capture the visible tab (includes our canvas overlay)
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        
        // Auto-download the screenshot
        const filename = `annotation-${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.png`;
        await chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: false
        });
        
        sendResponse({ success: true, filename });
      } catch (error) {
        console.error('[Annotate] Screenshot capture failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async
  }
  
  if (message.action === 'get-status') {
    // This can be used if needed; status is mainly handled via direct sendMessage in popup
    sendResponse({ loaded: true });
  }
});