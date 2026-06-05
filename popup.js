// popup.js - Handles activation of annotation tool via dynamic script injection
// Keeps everything self-contained and production-ready.

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggle-btn');
  
  // Query current annotation status on popup open (for sync with toolbar)
  async function updateButtonState() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;
      
      // Try to ask the content script for status (only works if annotate.js is already injected)
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' }).catch(() => null);
      
      if (response && response.active) {
        toggleBtn.textContent = 'STOP ANNOTATING';
        toggleBtn.style.background = '#990000'; // darker red when stopping
      } else {
        toggleBtn.textContent = 'START ANNOTATING';
        toggleBtn.style.background = '#ff0000';
      }
    } catch (e) {
      // Not loaded or error → assume inactive
      toggleBtn.textContent = 'START ANNOTATING';
      toggleBtn.style.background = '#ff0000';
    }
  }
  
  // Initial state check
  updateButtonState();
  
  toggleBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showError('No active tab found');
        return;
      }
      
      toggleBtn.disabled = true;
      toggleBtn.style.opacity = '0.7';
      toggleBtn.textContent = 'PROCESSING...';
      
      // Inject / toggle via the script (the guard inside annotate.js handles toggle if already loaded)
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['annotate.js']
      });
      
      // Re-check status after toggle (in case popup stays open)
      setTimeout(async () => {
        await updateButtonState();
        toggleBtn.disabled = false;
        toggleBtn.style.opacity = '1';
        
        // Close for clean UX (user interacts with page toolbar)
        window.close();
      }, 180);
      
    } catch (error) {
      console.error('[Annotate] Failed:', error);
      toggleBtn.disabled = false;
      toggleBtn.style.opacity = '1';
      toggleBtn.textContent = 'START ANNOTATING';
      toggleBtn.style.background = '#ff0000';
      
      if (error.message.includes('cannot access') || error.message.includes('chrome://')) {
        showError('Cannot annotate Chrome internal pages');
      } else {
        showError('Action failed. Refresh the page and try again.');
      }
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement.id === 'toggle-btn') {
      toggleBtn.click();
    }
  });
  
  function showError(msg) {
    const content = document.querySelector('.content');
    const existing = document.querySelector('.error-msg');
    if (existing) existing.remove();
    
    const errorEl = document.createElement('div');
    errorEl.className = 'error-msg';
    errorEl.style.cssText = 'margin-top:12px; padding:10px 14px; background:#2a0a0a; border:1px solid #ff3333; color:#ff9999; font-size:12px; line-height:1.4; border-radius:0;';
    errorEl.textContent = msg;
    content.appendChild(errorEl);
    
    setTimeout(() => {
      if (errorEl.parentNode) errorEl.parentNode.removeChild(errorEl);
    }, 4200);
  }
});