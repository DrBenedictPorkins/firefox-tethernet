/**
 * FoxHole Popup Script
 * Displays connection status and extension information
 */

const statusElement = document.getElementById('status');
const serverUrlElement = document.getElementById('server-url');
const captureSourceToggle = document.getElementById('capture-source-toggle');
const sourceWarning = document.getElementById('source-warning');
const tabStatusElement = document.getElementById('tab-status');
const tabInfoElement = document.getElementById('tab-info');
const reloadNotice = document.getElementById('reload-notice');
const reloadBtn = document.getElementById('reload-btn');

// Protected URL patterns where content scripts cannot be injected
const PROTECTED_URL_PATTERNS = [
  /^about:/,
  /^chrome:/,
  /^moz-extension:/,
  /^https?:\/\/addons\.mozilla\.org/,
  /^https?:\/\/accounts\.firefox\.com/,
  /^file:\/\//,
  /^data:/,
  /^view-source:/
];

// Status text and classes
const statusConfig = {
  connected: { text: 'Connected', class: 'connected' },
  connecting: { text: 'Connecting', class: 'connecting' },
  disconnected: { text: 'Disconnected', class: 'disconnected' }
};

function updateStatus(state, serverUrl) {
  const config = statusConfig[state] || statusConfig.disconnected;

  statusElement.textContent = config.text;
  statusElement.className = `status-badge ${config.class}`;

  if (serverUrl) {
    serverUrlElement.textContent = serverUrl;
  }
}

function isProtectedUrl(url) {
  if (!url) return true;
  return PROTECTED_URL_PATTERNS.some(pattern => pattern.test(url));
}

function updateTabStatus(currentTab) {
  if (!currentTab) {
    tabStatusElement.textContent = 'Unknown';
    tabStatusElement.className = 'tab-badge not-ready';
    tabInfoElement.textContent = '';
    reloadNotice.classList.add('hidden');
    return;
  }

  const isProtected = isProtectedUrl(currentTab.url);
  const isReady = currentTab.contentScriptReady;

  // Update tab info
  tabInfoElement.textContent = currentTab.url || 'No URL';

  if (isProtected) {
    tabStatusElement.textContent = 'Protected';
    tabStatusElement.className = 'tab-badge protected';
    reloadNotice.classList.add('hidden');
  } else if (isReady) {
    tabStatusElement.textContent = 'Ready';
    tabStatusElement.className = 'tab-badge ready';
    reloadNotice.classList.add('hidden');
  } else {
    tabStatusElement.textContent = 'Reload Needed';
    tabStatusElement.className = 'tab-badge not-ready';
    reloadNotice.classList.remove('hidden');
  }
}

// Store current tab ID for reload
let currentTabId = null;

function updateWarningVisibility(isEnabled) {
  if (isEnabled) {
    sourceWarning.classList.remove('hidden');
  } else {
    sourceWarning.classList.add('hidden');
  }
}

// Load saved setting
browser.storage.local.get('captureLogSource').then(result => {
  // Default to true if not set
  const isEnabled = result.captureLogSource !== false;
  captureSourceToggle.checked = isEnabled;
  updateWarningVisibility(isEnabled);
});

// Handle toggle change
captureSourceToggle.addEventListener('change', (e) => {
  const isEnabled = e.target.checked;
  browser.storage.local.set({ captureLogSource: isEnabled });
  updateWarningVisibility(isEnabled);

  // Notify background script of the change
  browser.runtime.sendMessage({
    type: 'setting_changed',
    setting: 'captureLogSource',
    value: isEnabled
  });
});

// Get state from background script
browser.runtime.sendMessage({ type: 'get_state' })
  .then(response => {
    if (response) {
      updateStatus(response.connectionState, response.serverUrl);
      if (response.currentTab) {
        currentTabId = response.currentTab.id;
        updateTabStatus(response.currentTab);
      }
    }
  })
  .catch(error => {
    console.error('[FoxHole Popup] Failed to get state:', error);
    updateStatus('disconnected');
  });

// Handle reload button click
reloadBtn.addEventListener('click', () => {
  if (currentTabId) {
    browser.tabs.reload(currentTabId).then(() => {
      // Close popup after reload
      window.close();
    }).catch(error => {
      console.error('[FoxHole Popup] Failed to reload tab:', error);
    });
  }
});

console.log('[FoxHole] Popup initialized');
