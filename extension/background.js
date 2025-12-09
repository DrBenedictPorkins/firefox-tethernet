/**
 * FoxHole Background Script
 * Manages WebSocket connection to server and coordinates all extension functionality
 */

const SERVER_URL = 'ws://localhost:19888/extension';
const RECONNECT_INTERVAL = 2000;

let ws = null;
let reconnectTimer = null;
let connectionState = 'disconnected'; // 'connected', 'connecting', 'disconnected'
let requestHandlers = new Map(); // requestId -> {resolve, reject, timeout}

// Track tabs with content script injected
const contentScriptTabs = new Set();

// Connection management
function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  connectionState = 'connecting';
  updateIcon();

  try {
    ws = new WebSocket(SERVER_URL);

    ws.onopen = () => {
      console.log('[FoxHole] Connected to server');
      connectionState = 'connected';
      updateIcon();
      clearTimeout(reconnectTimer);

      // Send initial tab list
      sendTabList();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerCommand(message);
      } catch (error) {
        console.error('[FoxHole] Failed to parse server message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[FoxHole] WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('[FoxHole] Disconnected from server');
      connectionState = 'disconnected';
      updateIcon();
      ws = null;

      // Auto-reconnect
      reconnectTimer = setTimeout(connect, RECONNECT_INTERVAL);
    };
  } catch (error) {
    console.error('[FoxHole] Failed to connect:', error);
    connectionState = 'disconnected';
    updateIcon();
    reconnectTimer = setTimeout(connect, RECONNECT_INTERVAL);
  }
}

function updateIcon() {
  const iconPath = connectionState === 'connected'
    ? 'icons/icon-connected-'
    : 'icons/icon-';

  browser.browserAction.setIcon({
    path: {
      16: iconPath + '16.png',
      32: iconPath + '32.png',
      48: iconPath + '48.png',
      96: iconPath + '96.png'
    }
  }).catch(() => {
    // Icon files might not exist, silently fail
  });
}

// Update badge for a specific tab based on content script status
function updateTabBadge(tabId) {
  const hasContentScript = contentScriptTabs.has(tabId);

  if (hasContentScript) {
    // Clear badge when content script is ready
    browser.browserAction.setBadgeText({ text: '', tabId }).catch(() => {});
  } else {
    // Show "!" badge when content script is NOT injected
    browser.browserAction.setBadgeText({ text: '!', tabId }).catch(() => {});
    browser.browserAction.setBadgeBackgroundColor({ color: '#ffc107', tabId }).catch(() => {});
  }
}

// Check if content script is ready in a tab (ping it)
async function checkContentScript(tabId) {
  try {
    const response = await browser.tabs.sendMessage(tabId, { action: 'ping' }, { frameId: 0 });
    if (response && response.pong) {
      contentScriptTabs.add(tabId);
      updateTabBadge(tabId);
      return true;
    }
  } catch (e) {
    // Content script not available
    contentScriptTabs.delete(tabId);
    updateTabBadge(tabId);
  }
  return false;
}

function sendToServer(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Tab management
async function sendTabList() {
  try {
    const tabs = await browser.tabs.query({});
    const tabList = tabs.map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      windowId: tab.windowId
    }));

    sendToServer({
      type: 'tab_list',
      data: { tabs: tabList }
    });
  } catch (error) {
    console.error('[FoxHole] Failed to get tab list:', error);
  }
}

// Command handlers
async function handleServerCommand(message) {
  const { action, params, requestId } = message;

  try {
    let result;

    switch (action) {
      case 'list_tabs':
        result = await handleListTabs();
        break;

      case 'create_tab':
        result = await handleCreateTab(params);
        break;

      case 'close_tab':
        result = await handleCloseTab(params);
        break;

      case 'focus_tab':
        result = await handleFocusTab(params);
        break;

      case 'navigate':
        result = await handleNavigate(params);
        break;

      case 'reload_tab':
        result = await handleReloadTab(params);
        break;

      case 'go_back':
        result = await handleGoBack(params);
        break;

      case 'go_forward':
        result = await handleGoForward(params);
        break;

      case 'list_frames':
        result = await handleListFrames(params);
        break;

      case 'take_screenshot':
        result = await handleTakeScreenshot(params);
        break;

      case 'get_cookies':
        result = await handleGetCookies(params);
        break;

      case 'set_cookie':
        result = await handleSetCookie(params);
        break;

      case 'delete_cookie':
        result = await handleDeleteCookie(params);
        break;

      case 'set_request_headers':
        result = handleSetRequestHeaders(params);
        break;

      case 'block_urls':
        result = handleBlockUrls(params);
        break;

      case 'clear_request_headers':
        result = handleClearRequestHeaders(params);
        break;

      case 'clear_blocked_urls':
        result = handleClearBlockedUrls(params);
        break;

      // Commands forwarded to content script
      case 'get_dom':
      case 'query_selector':
      case 'get_computed_styles':
      case 'get_element_properties':
      case 'get_page_text':
      case 'execute_script':
      case 'click_element':
      case 'type_text':
      case 'press_key':
      case 'scroll':
      case 'scroll_to_element':
      case 'hover_element':
      case 'focus_element':
      case 'select_option':
      case 'set_checkbox':
      case 'get_storage':
      case 'set_storage':
      case 'clear_storage':
      case 'get_element_bounds':
        result = await forwardToContentScript(params.tabId, action, params);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    if (requestId) {
      sendToServer({
        requestId,
        result,
        error: null
      });
    }
  } catch (error) {
    console.error(`[FoxHole] Command ${action} failed:`, error);
    if (requestId) {
      sendToServer({
        requestId,
        result: null,
        error: error.message
      });
    }
  }
}

async function handleListTabs() {
  const tabs = await browser.tabs.query({});

  // Check content script status for all tabs in parallel
  await Promise.all(tabs.map(tab => checkContentScript(tab.id)));

  return tabs.map(tab => ({
    id: tab.id,
    url: tab.url,
    title: tab.title,
    active: tab.active,
    windowId: tab.windowId,
    status: tab.status,
    contentScriptReady: contentScriptTabs.has(tab.id)
  }));
}

async function handleCreateTab(params) {
  const { url, active } = params;
  const tab = await browser.tabs.create({ url, active });
  return { tabId: tab.id };
}

async function handleCloseTab(params) {
  const { tabId } = params;
  await browser.tabs.remove(tabId);
  return { success: true };
}

async function handleFocusTab(params) {
  const { tabId } = params;
  await browser.tabs.update(tabId, { active: true });
  const tab = await browser.tabs.get(tabId);
  await browser.windows.update(tab.windowId, { focused: true });
  return { success: true };
}

async function handleNavigate(params) {
  const { tabId, url } = params;
  await browser.tabs.update(tabId, { url });
  return { success: true };
}

async function handleReloadTab(params) {
  const { tabId, bypassCache } = params;
  await browser.tabs.reload(tabId, { bypassCache: bypassCache || false });
  return { success: true };
}

async function handleGoBack(params) {
  const { tabId } = params;
  await browser.tabs.goBack(tabId);
  return { success: true };
}

async function handleGoForward(params) {
  const { tabId } = params;
  await browser.tabs.goForward(tabId);
  return { success: true };
}

async function handleListFrames(params) {
  const { tabId } = params;

  // Get all frames in the tab using webNavigation API
  try {
    const frames = await browser.webNavigation.getAllFrames({ tabId });

    return {
      frames: frames.map(frame => ({
        frameId: frame.frameId,
        parentFrameId: frame.parentFrameId,
        url: frame.url,
        isTopFrame: frame.frameId === 0,
        // errorOccurred is available in Firefox
        errorOccurred: frame.errorOccurred || false
      }))
    };
  } catch (error) {
    return { error: error.message, frames: [] };
  }
}

async function handleTakeScreenshot(params) {
  const { tabId, format, quality } = params;
  const options = {
    format: format || 'png'
  };
  if (quality) options.quality = quality;

  const dataUrl = await browser.tabs.captureVisibleTab(null, options);
  return { dataUrl };
}

async function handleGetCookies(params) {
  const { url } = params;
  const cookies = await browser.cookies.getAll({ url });
  return { cookies };
}

async function handleSetCookie(params) {
  const { cookie } = params;
  await browser.cookies.set(cookie);
  return { success: true };
}

async function handleDeleteCookie(params) {
  const { url, name } = params;
  await browser.cookies.remove({ url, name });
  return { success: true };
}

function handleSetRequestHeaders(params) {
  const { tabId, headers } = params;
  if (!tabId) {
    throw new Error('tabId is required for set_request_headers');
  }
  // Merge with existing headers for this tab
  const existingHeaders = customHeaders.get(tabId) || {};
  customHeaders.set(tabId, { ...existingHeaders, ...headers });
  return { success: true, tabId, headerCount: Object.keys(customHeaders.get(tabId)).length };
}

function handleBlockUrls(params) {
  const { tabId, patterns } = params;
  if (!tabId) {
    throw new Error('tabId is required for block_urls');
  }
  if (!Array.isArray(patterns)) {
    throw new Error('patterns must be an array');
  }
  // Add to existing patterns for this tab
  const existingPatterns = blockedUrlPatterns.get(tabId) || [];
  const newPatterns = [...new Set([...existingPatterns, ...patterns])];
  blockedUrlPatterns.set(tabId, newPatterns);
  return { success: true, tabId, patternCount: newPatterns.length };
}

function handleClearRequestHeaders(params) {
  const { tabId } = params;
  if (tabId) {
    customHeaders.delete(tabId);
  } else {
    customHeaders.clear();
  }
  return { success: true };
}

function handleClearBlockedUrls(params) {
  const { tabId } = params;
  if (tabId) {
    blockedUrlPatterns.delete(tabId);
  } else {
    blockedUrlPatterns.clear();
  }
  return { success: true };
}

async function forwardToContentScript(tabId, action, params) {
  try {
    // Default to frameId 0 (top frame) to avoid cross-origin iframes responding first
    const frameId = params.frameId ?? 0;
    const response = await browser.tabs.sendMessage(tabId, {
      action,
      params
    }, { frameId });
    return response;
  } catch (error) {
    throw new Error(`Failed to communicate with content script: ${error.message}`);
  }
}

// Network request capture
const networkRequests = new Map();

// Custom headers per tab (tabId -> { headerName: headerValue })
const customHeaders = new Map();

// Blocked URL patterns per tab (tabId -> [patterns])
const blockedUrlPatterns = new Map();

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { requestId, url, method, tabId, type, timeStamp } = details;

    // Check if URL should be blocked
    const patterns = blockedUrlPatterns.get(tabId);
    if (patterns && patterns.length > 0) {
      for (const pattern of patterns) {
        // Convert glob pattern to regex
        const regexPattern = pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        const regex = new RegExp(regexPattern, 'i');
        if (regex.test(url)) {
          console.log(`[FoxHole] Blocked URL: ${url} (pattern: ${pattern})`);
          return { cancel: true };
        }
      }
    }

    networkRequests.set(requestId, {
      requestId,
      url,
      method,
      tabId,
      type,
      startTime: timeStamp,
      requestBody: details.requestBody
    });
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'requestBody']
);

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const request = networkRequests.get(details.requestId);
    if (request) {
      request.requestHeaders = details.requestHeaders;
    }

    // Add custom headers for this tab
    const headers = customHeaders.get(details.tabId);
    if (headers && Object.keys(headers).length > 0) {
      const requestHeaders = [...details.requestHeaders];
      for (const [name, value] of Object.entries(headers)) {
        // Remove existing header with same name (case-insensitive)
        const existingIndex = requestHeaders.findIndex(
          h => h.name.toLowerCase() === name.toLowerCase()
        );
        if (existingIndex !== -1) {
          requestHeaders.splice(existingIndex, 1);
        }
        // Add the custom header
        requestHeaders.push({ name, value });
      }
      return { requestHeaders };
    }
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'requestHeaders']
);

browser.webRequest.onCompleted.addListener(
  (details) => {
    const request = networkRequests.get(details.requestId);
    if (request) {
      request.statusCode = details.statusCode;
      request.responseHeaders = details.responseHeaders;
      request.endTime = details.timeStamp;
      request.duration = details.timeStamp - request.startTime;

      sendToServer({
        type: 'network_request',
        tabId: request.tabId,
        data: request
      });

      networkRequests.delete(details.requestId);
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

browser.webRequest.onErrorOccurred.addListener(
  (details) => {
    const request = networkRequests.get(details.requestId);
    if (request) {
      request.error = details.error;
      request.endTime = details.timeStamp;
      request.duration = details.timeStamp - request.startTime;

      sendToServer({
        type: 'network_request',
        tabId: request.tabId,
        data: request
      });

      networkRequests.delete(details.requestId);
    }
  },
  { urls: ['<all_urls>'] }
);

// Listen for messages from content scripts
browser.runtime.onMessage.addListener((message, sender) => {
  const { type, data } = message;

  // Handle content script registration
  if (type === 'content_script_ready') {
    const tabId = sender.tab?.id;
    if (tabId) {
      contentScriptTabs.add(tabId);
      updateTabBadge(tabId);
      console.log(`[FoxHole] Content script ready in tab ${tabId}`);
    }
    return false;
  }

  // Add tab information
  const enrichedData = {
    ...data,
    url: sender.tab?.url,
    frameId: sender.frameId
  };

  sendToServer({
    type,
    tabId: sender.tab?.id,
    data: enrichedData
  });

  return false;
});

// Listen for tab events
browser.tabs.onCreated.addListener((tab) => {
  sendToServer({
    type: 'tab_created',
    data: {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      windowId: tab.windowId
    }
  });
});

browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // Clean up content script tracking
  contentScriptTabs.delete(tabId);

  sendToServer({
    type: 'tab_closed',
    data: { tabId, windowId: removeInfo.windowId }
  });
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title || changeInfo.status) {
    sendToServer({
      type: 'tab_updated',
      data: {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        status: tab.status,
        changeInfo
      }
    });
  }
});

browser.tabs.onActivated.addListener((activeInfo) => {
  // Check content script status for the newly active tab
  checkContentScript(activeInfo.tabId);

  sendToServer({
    type: 'tab_activated',
    data: activeInfo
  });
});

// Settings state
let settings = {
  captureLogSource: true  // Default on
};

// Load settings on startup
browser.storage.local.get('captureLogSource').then(result => {
  settings.captureLogSource = result.captureLogSource !== false;
});

// Handle popup state requests and setting changes
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get_state') {
    // Get current tab and check content script status
    browser.tabs.query({ active: true, currentWindow: true }).then(async tabs => {
      const currentTab = tabs[0];
      let contentScriptReady = false;

      if (currentTab) {
        contentScriptReady = await checkContentScript(currentTab.id);
      }

      sendResponse({
        connectionState,
        serverUrl: SERVER_URL,
        currentTab: currentTab ? {
          id: currentTab.id,
          url: currentTab.url,
          title: currentTab.title,
          contentScriptReady
        } : null
      });
    });
    return true; // Async response
  }

  if (message.type === 'setting_changed') {
    if (message.setting === 'captureLogSource') {
      settings.captureLogSource = message.value;
      // Broadcast to all content scripts
      browser.tabs.query({}).then(tabs => {
        for (const tab of tabs) {
          browser.tabs.sendMessage(tab.id, {
            action: 'update_setting',
            params: { captureLogSource: message.value }
          }).catch(() => {
            // Content script may not be injected yet, ignore
          });
        }
      });
    }
    return false;
  }

  if (message.type === 'get_settings') {
    sendResponse(settings);
    return false;
  }
});

// Initialize
connect();

console.log('[FoxHole] Background script initialized');
