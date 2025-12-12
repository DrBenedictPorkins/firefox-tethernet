/**
 * FoxHole Popup Script
 * Displays connection status and extension information
 */

const statusElement = document.getElementById('status');
const sessionInfoElement = document.getElementById('session-info');
const serverPortElement = document.getElementById('server-port');
const tabsCountElement = document.getElementById('tabs-count');
const captureSourceToggle = document.getElementById('capture-source-toggle');
const sourceWarning = document.getElementById('source-warning');
const tabStatusElement = document.getElementById('tab-status');
const tabInfoElement = document.getElementById('tab-info');
const reloadNotice = document.getElementById('reload-notice');
const reloadBtn = document.getElementById('reload-btn');
const connectionTimeElement = document.getElementById('connection-time');
const clearBuffersBtn = document.getElementById('clear-buffers-btn');
const consoleCountEl = document.getElementById('console-count');
const networkCountEl = document.getElementById('network-count');
const errorsCountEl = document.getElementById('errors-count');
const websocketCountEl = document.getElementById('websocket-count');

let connectedAt = null;
let updateTimer = null;
let bufferStatsTimer = null;

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

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function updateConnectionTime() {
  if (connectedAt) {
    const duration = Date.now() - connectedAt;
    connectionTimeElement.textContent = `Connected for ${formatDuration(duration)}`;
    connectionTimeElement.classList.remove('hidden');
  } else {
    connectionTimeElement.classList.add('hidden');
  }
}

function updateSessionInfo(session) {
  if (!session) {
    sessionInfoElement.innerHTML = '<span class="session-none">No session connected</span>';
    return;
  }

  const duration = session.connectedAt ? formatDuration(Date.now() - session.connectedAt) : '';
  sessionInfoElement.innerHTML = `
    <div class="session-project">${session.projectName || 'Unknown'}</div>
    <div class="session-details">PID: ${session.pid} • ${duration}</div>
  `;
}

function updateStatus(state, serverUrl, timestamp) {
  const config = statusConfig[state] || statusConfig.disconnected;

  statusElement.textContent = config.text;
  statusElement.className = `status-badge ${config.class}`;

  // Extract port from server URL
  if (serverUrl) {
    try {
      const url = new URL(serverUrl);
      serverPortElement.textContent = url.port || '19888';
    } catch {
      serverPortElement.textContent = '19888';
    }
  }

  connectedAt = timestamp;
  updateConnectionTime();

  // Start/stop timer for updating duration
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }

  if (state === 'connected' && connectedAt) {
    updateTimer = setInterval(updateConnectionTime, 1000);
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
      updateStatus(response.connectionState, response.serverUrl, response.connectedAt);
      updateSessionInfo(response.sessionInfo);
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

// Buffer stats functions
function updateBufferStats(stats) {
  if (!stats) return;

  // Update tabs count
  tabsCountElement.textContent = stats.totalTabs || 0;

  // Sum up stats across all tabs
  let totalConsole = 0;
  let totalNetwork = 0;
  let totalErrors = 0;
  let totalWebSocket = 0;

  if (stats.bufferSizes) {
    Object.values(stats.bufferSizes).forEach(tabStats => {
      totalConsole += tabStats.consoleLogs || 0;
      totalNetwork += tabStats.networkRequests || 0;
      totalErrors += tabStats.jsErrors || 0;
      totalWebSocket += tabStats.webSocketMessages || 0;
    });
  }

  consoleCountEl.textContent = totalConsole;
  networkCountEl.textContent = totalNetwork;
  errorsCountEl.textContent = totalErrors;
  websocketCountEl.textContent = totalWebSocket;
}

function fetchBufferStats() {
  browser.runtime.sendMessage({ type: 'get_buffer_stats' })
    .then(updateBufferStats)
    .catch(error => {
      console.error('[FoxHole Popup] Failed to get buffer stats:', error);
    });
}

// Handle clear buffers button
clearBuffersBtn.addEventListener('click', () => {
  clearBuffersBtn.disabled = true;
  clearBuffersBtn.textContent = 'Clearing...';

  browser.runtime.sendMessage({ type: 'clear_all_buffers' })
    .then(() => {
      // Refresh stats after clearing
      fetchBufferStats();
      clearBuffersBtn.textContent = 'Clear All';
      clearBuffersBtn.disabled = false;
    })
    .catch(error => {
      console.error('[FoxHole Popup] Failed to clear buffers:', error);
      clearBuffersBtn.textContent = 'Clear All';
      clearBuffersBtn.disabled = false;
    });
});

// Initial fetch of buffer stats
fetchBufferStats();

// Refresh buffer stats every 2 seconds while popup is open
bufferStatsTimer = setInterval(fetchBufferStats, 2000);

// Cleanup on popup close
window.addEventListener('unload', () => {
  if (bufferStatsTimer) {
    clearInterval(bufferStatsTimer);
  }
});

console.log('[FoxHole] Popup initialized');
