/**
 * Tethernet Background Script - Extension as Data Server
 * The extension is the SOURCE OF TRUTH for all browser data.
 * The MCP server is a stateless proxy that queries the extension on-demand.
 */

let SERVER_URL = null;

// Buffer configuration
const BUFFER_CONFIG = {
  maxConsoleLogs: 1000,
  maxNetworkRequests: 500,
  maxWebSocketMessages: 500,
  maxJSErrors: 200,
  maxDOMSnapshots: 10,
  maxScreenshots: 5
};

// Local buffer storage - Extension owns all data
const tabBuffers = new Map(); // tabId -> TabBuffer

let ws = null;
let connectionState = 'disconnected'; // 'connected', 'connecting', 'disconnected'
let connectedAt = null; // Timestamp when connection was established
let sessionInfo = null; // MCP server session info {pid, cwd, projectName, port}
let requestHandlers = new Map(); // requestId -> {resolve, reject, timeout}

// Track tabs with content script injected
const contentScriptTabs = new Set();

// Buffer structure for each tab
function createTabBuffer(tabInfo = {}) {
  return {
    tabInfo: {
      id: tabInfo.id || 0,
      url: tabInfo.url || '',
      title: tabInfo.title || '',
      active: tabInfo.active || false,
      windowId: tabInfo.windowId || 0
    },
    consoleLogs: [],
    networkRequests: [],
    webSocketMessages: [],
    jsErrors: [],
    domSnapshots: [],
    screenshots: [],
    lastActivity: Date.now()
  };
}

// Get or create buffer for a tab
function getOrCreateBuffer(tabId, tabInfo = {}) {
  if (!tabBuffers.has(tabId)) {
    tabBuffers.set(tabId, createTabBuffer({ id: tabId, ...tabInfo }));
  }
  const buffer = tabBuffers.get(tabId);
  buffer.lastActivity = Date.now();
  return buffer;
}

// FIFO eviction helper
function addToBuffer(array, item, maxSize) {
  array.push(item);
  while (array.length > maxSize) {
    array.shift();
  }
}

// Buffer query handlers
function handleQueryBuffer(params) {
  const { type, transform, tabId } = params;

  let data = [];

  if (tabId) {
    const buffer = tabBuffers.get(tabId);
    if (!buffer) {
      return [];
    }

    switch (type) {
      case 'console':
        data = buffer.consoleLogs;
        break;
      case 'errors':
        data = buffer.jsErrors;
        break;
      case 'network':
        data = buffer.networkRequests;
        break;
      case 'websocket':
        data = buffer.webSocketMessages;
        break;
      default:
        return { error: `Unknown buffer type: ${type}` };
    }
  } else {
    // Query across all tabs
    switch (type) {
      case 'console':
        data = Array.from(tabBuffers.values()).flatMap(b => b.consoleLogs);
        break;
      case 'errors':
        data = Array.from(tabBuffers.values()).flatMap(b => b.jsErrors);
        break;
      case 'network':
        data = Array.from(tabBuffers.values()).flatMap(b => b.networkRequests);
        break;
      case 'websocket':
        data = Array.from(tabBuffers.values()).flatMap(b => b.webSocketMessages);
        break;
      default:
        return { error: `Unknown buffer type: ${type}` };
    }
  }

  // Apply transform if provided
  if (transform) {
    try {
      const transformFn = new Function('data', `return data${transform}`);
      data = transformFn(data);
    } catch (error) {
      return { error: `Transform failed: ${error.message}` };
    }
  }

  return data;
}

function handleGetNetworkDetail(params) {
  const { requestId, tabId } = params;

  if (tabId) {
    const buffer = tabBuffers.get(tabId);
    if (!buffer) {
      return { error: `No buffer found for tab ${tabId}` };
    }
    const request = buffer.networkRequests.find(r => r.requestId === requestId);
    return request || { error: 'Request not found' };
  }

  // Search all tabs
  for (const buffer of tabBuffers.values()) {
    const request = buffer.networkRequests.find(r => r.requestId === requestId);
    if (request) {
      return request;
    }
  }

  return { error: 'Request not found in any tab' };
}

function handleGetTabBufferSummary(params) {
  const summaries = Array.from(tabBuffers.entries()).map(([id, buffer]) => ({
    tabId: id,
    tabInfo: buffer.tabInfo,
    consoleLogs: buffer.consoleLogs.length,
    networkRequests: buffer.networkRequests.length,
    webSocketMessages: buffer.webSocketMessages.length,
    jsErrors: buffer.jsErrors.length,
    domSnapshots: buffer.domSnapshots.length,
    screenshots: buffer.screenshots.length,
    lastActivity: buffer.lastActivity
  }));

  return {
    totalTabs: tabBuffers.size,
    bufferSizes: Object.fromEntries(
      summaries.map(s => [s.tabId, {
        consoleLogs: s.consoleLogs,
        networkRequests: s.networkRequests,
        webSocketMessages: s.webSocketMessages,
        jsErrors: s.jsErrors
      }])
    ),
    summaries
  };
}

function handleClearBuffer(params) {
  const { tabId, dataType } = params;

  if (tabId) {
    const buffer = tabBuffers.get(tabId);
    if (!buffer) {
      return { success: false, error: `No buffer found for tab ${tabId}` };
    }

    if (dataType) {
      switch (dataType) {
        case 'console': buffer.consoleLogs = []; break;
        case 'errors': buffer.jsErrors = []; break;
        case 'network': buffer.networkRequests = []; break;
        case 'websocket': buffer.webSocketMessages = []; break;
        case 'dom': buffer.domSnapshots = []; break;
        case 'screenshots': buffer.screenshots = []; break;
        default: return { success: false, error: `Unknown buffer type: ${dataType}` };
      }
    } else {
      tabBuffers.set(tabId, createTabBuffer(buffer.tabInfo));
    }
    return { success: true };
  }

  // Clear all tabs
  if (dataType) {
    for (const buffer of tabBuffers.values()) {
      switch (dataType) {
        case 'console': buffer.consoleLogs = []; break;
        case 'errors': buffer.jsErrors = []; break;
        case 'network': buffer.networkRequests = []; break;
        case 'websocket': buffer.webSocketMessages = []; break;
        case 'dom': buffer.domSnapshots = []; break;
        case 'screenshots': buffer.screenshots = []; break;
      }
    }
  } else {
    tabBuffers.clear();
  }

  return { success: true };
}

function handleGetDomSnapshot(params) {
  const { tabId } = params;
  const buffer = tabBuffers.get(tabId);
  return buffer ? buffer.domSnapshots : [];
}

function handleGetScreenshots(params) {
  const { tabId } = params;
  const buffer = tabBuffers.get(tabId);
  return buffer ? buffer.screenshots : [];
}

// Connection management
function connect() {
  if (!SERVER_URL) return;
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  connectionState = 'connecting';
  updateIcon();

  try {
    ws = new WebSocket(SERVER_URL);

    ws.onopen = () => {
      console.log('[Tethernet] Connected to server');
      connectionState = 'connected';
      connectedAt = Date.now();
      updateIcon();

      // Send initial tab list
      sendTabList();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Handle session info from MCP server
        if (message.type === 'session_info') {
          sessionInfo = message.data;
          console.log('[Tethernet] Session info received:', sessionInfo.projectName, 'PID:', sessionInfo.pid);
          return;
        }

        handleServerCommand(message);
      } catch (error) {
        console.error('[Tethernet] Failed to parse server message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[Tethernet] WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('[Tethernet] Disconnected from server');
      connectionState = 'disconnected';
      connectedAt = null;
      sessionInfo = null;
      SERVER_URL = null;
      ws = null;
      updateIcon();
    };
  } catch (error) {
    console.error('[Tethernet] Failed to connect:', error);
    connectionState = 'disconnected';
    SERVER_URL = null;
    updateIcon();
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

  browser.runtime.sendMessage({
    type: 'state_changed',
    connectionState,
    connectedAt,
    sessionInfo
  }).catch(() => {
    // Popup may not be open
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
    console.error('[Tethernet] Failed to get tab list:', error);
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

      case 'execute_background_script':
        result = await handleExecuteBackgroundScript(params);
        break;

      // Buffer query commands (MCP server forwards these to extension)
      case 'query_buffer':
        result = handleQueryBuffer(params);
        break;

      case 'get_network_request_detail':
        result = handleGetNetworkDetail(params);
        break;

      case 'get_tab_buffer_summary':
        result = handleGetTabBufferSummary(params);
        break;

      case 'clear_buffer':
        result = handleClearBuffer(params);
        break;

      case 'get_dom_snapshot':
        result = handleGetDomSnapshot(params);
        break;

      case 'get_screenshots':
        result = handleGetScreenshots(params);
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
    console.error(`[Tethernet] Command ${action} failed:`, error);
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
  const { tabId, format, quality, cropTo, selector } = params;
  const options = {
    format: format || 'png'
  };
  if (quality) options.quality = quality;

  const dataUrl = await browser.tabs.captureVisibleTab(null, options);

  // Apply crop if requested
  if (cropTo || selector) {
    let rect = cropTo;

    if (selector) {
      // Get element bounds from the page
      const results = await browser.tabs.executeScript(tabId, {
        code: `(function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.left, y: r.top, width: r.width, height: r.height };
        })()`
      });
      rect = results && results[0];
    }

    if (rect && rect.width > 0 && rect.height > 0) {
      const dprResults = await browser.tabs.executeScript(tabId, {
        code: 'window.devicePixelRatio || 1'
      });
      const dpr = (dprResults && dprResults[0]) || 1;
      return { dataUrl: await cropDataUrl(dataUrl, rect, dpr) };
    }
  }

  return { dataUrl };
}

function cropDataUrl(dataUrl, cssRect, dpr) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const x = Math.max(0, Math.round(cssRect.x * dpr));
      const y = Math.max(0, Math.round(cssRect.y * dpr));
      const w = Math.min(Math.round(cssRect.width * dpr), img.width - x);
      const h = Math.min(Math.round(cssRect.height * dpr), img.height - y);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load screenshot for cropping'));
    img.src = dataUrl;
  });
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

async function handleExecuteBackgroundScript(params) {
  const { code } = params;
  try {
    // Wrap in async IIFE to support await
    const fn = new Function('browser', `return (async () => { ${code} })()`);
    const result = await fn(browser);
    return { result };
  } catch (error) {
    return { error: error.message };
  }
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

// Helper function to serialize request body (ArrayBuffer cannot be JSON stringified)
function serializeRequestBody(requestBody) {
  if (!requestBody) return null;

  try {
    // Handle raw data (e.g., JSON POST bodies)
    if (requestBody.raw && Array.isArray(requestBody.raw)) {
      const decoder = new TextDecoder('utf-8');
      const parts = requestBody.raw.map(part => {
        if (part.bytes instanceof ArrayBuffer) {
          return decoder.decode(part.bytes);
        }
        return '';
      });
      const rawText = parts.join('');

      // Try to parse as JSON if it looks like JSON
      if (rawText.startsWith('{') || rawText.startsWith('[')) {
        try {
          return JSON.parse(rawText);
        } catch (e) {
          // Return as string if not valid JSON
          return rawText;
        }
      }
      return rawText;
    }

    // Handle form data
    if (requestBody.formData) {
      return { formData: requestBody.formData };
    }

    return null;
  } catch (e) {
    console.error('[Tethernet] Error serializing request body:', e);
    return null;
  }
}

// Store response body data per request (populated by filterResponseData)
const responseBodyChunks = new Map();

// Content types we want to capture response bodies for
const CAPTURABLE_CONTENT_TYPES = [
  'application/json',
  'text/plain',
  'text/html',
  'text/xml',
  'application/xml',
  'application/javascript',
  'text/javascript'
];

// Check if we should capture response body based on request type
function shouldCaptureResponseBody(details) {
  // Only capture XHR/fetch requests (most likely to be API calls)
  return details.type === 'xmlhttprequest';
}

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
          console.log(`[Tethernet] Blocked URL: ${url} (pattern: ${pattern})`);
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
      requestBody: serializeRequestBody(details.requestBody)
    });

    // Set up response body capture for XHR requests
    if (shouldCaptureResponseBody(details)) {
      try {
        const filter = browser.webRequest.filterResponseData(requestId);
        const chunks = [];

        filter.ondata = (event) => {
          // Store the chunk
          chunks.push(new Uint8Array(event.data));
          // Pass data through unchanged to the page
          filter.write(event.data);
        };

        filter.onstop = () => {
          // Combine all chunks into a single array
          const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const combined = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }

          // Decode as text
          const decoder = new TextDecoder('utf-8');
          const text = decoder.decode(combined);

          // Try to parse as JSON, otherwise store as string
          let responseBody = text;
          if (text.startsWith('{') || text.startsWith('[')) {
            try {
              responseBody = JSON.parse(text);
            } catch (e) {
              // Keep as string
            }
          }

          // Store for later retrieval by onCompleted
          responseBodyChunks.set(requestId, responseBody);

          // Clean up the filter
          filter.disconnect();
        };

        filter.onerror = (event) => {
          console.error(`[Tethernet] Filter error for ${url}:`, filter.error);
          filter.disconnect();
        };
      } catch (e) {
        // filterResponseData may fail for some request types, ignore
        console.warn(`[Tethernet] Could not filter response for ${url}:`, e.message);
      }
    }
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
      request.responseTimestamp = details.timeStamp;
      request.duration = details.timeStamp - request.startTime;

      // Attach captured response body if available
      if (responseBodyChunks.has(details.requestId)) {
        request.responseBody = responseBodyChunks.get(details.requestId);
        responseBodyChunks.delete(details.requestId);
      }

      // Store in local buffer (extension is source of truth)
      if (request.tabId) {
        const buffer = getOrCreateBuffer(request.tabId);
        addToBuffer(buffer.networkRequests, request, BUFFER_CONFIG.maxNetworkRequests);
      }

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

      // Store in local buffer (extension is source of truth)
      if (request.tabId) {
        const buffer = getOrCreateBuffer(request.tabId);
        addToBuffer(buffer.networkRequests, request, BUFFER_CONFIG.maxNetworkRequests);
      }

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
      console.log(`[Tethernet] Content script ready in tab ${tabId}`);
    }
    return false;
  }

  const tabId = sender.tab?.id;
  if (!tabId) return false;

  // Store events in local buffers (extension is source of truth)
  const buffer = getOrCreateBuffer(tabId, {
    id: tabId,
    url: sender.tab?.url,
    title: sender.tab?.title
  });

  // Enrich data with context
  const enrichedData = {
    ...data,
    url: sender.tab?.url,
    frameId: sender.frameId,
    timestamp: data.timestamp || Date.now()
  };

  switch (type) {
    case 'console_log':
      addToBuffer(buffer.consoleLogs, enrichedData, BUFFER_CONFIG.maxConsoleLogs);
      break;

    case 'js_error':
      addToBuffer(buffer.jsErrors, enrichedData, BUFFER_CONFIG.maxJSErrors);
      break;

    case 'websocket_message':
      addToBuffer(buffer.webSocketMessages, enrichedData, BUFFER_CONFIG.maxWebSocketMessages);
      break;

    case 'dom_snapshot':
      addToBuffer(buffer.domSnapshots, enrichedData, BUFFER_CONFIG.maxDOMSnapshots);
      break;

    default:
      // Unknown message types are logged but not stored
      console.warn(`[Tethernet] Unknown message type: ${type}`);
  }

  return false;
});

// Listen for tab events
browser.tabs.onCreated.addListener((tab) => {
  // Create buffer for new tab
  getOrCreateBuffer(tab.id, {
    id: tab.id,
    url: tab.url,
    title: tab.title,
    active: tab.active,
    windowId: tab.windowId
  });
});

browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // Clean up content script tracking
  contentScriptTabs.delete(tabId);

  // Remove buffer
  tabBuffers.delete(tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title || changeInfo.status) {
    // Update buffer's tabInfo
    const buffer = getOrCreateBuffer(tabId);
    buffer.tabInfo = {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      windowId: tab.windowId
    };
  }
});

browser.tabs.onActivated.addListener((activeInfo) => {
  // Check content script status for the newly active tab
  checkContentScript(activeInfo.tabId);
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
        connectedAt,
        serverUrl: SERVER_URL,
        sessionInfo,
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

  if (message.type === 'reconnect') {
    SERVER_URL = message.serverUrl;
    if (ws) { ws.onclose = null; ws.onerror = null; ws.close(); ws = null; }
    connect();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'disconnect') {
    if (ws) { ws.onclose = null; ws.onerror = null; ws.close(); ws = null; }
    SERVER_URL = null;
    connectionState = 'disconnected';
    connectedAt = null;
    sessionInfo = null;
    updateIcon();
    browser.storage.local.remove('tethernetServerUrl');
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'get_buffer_stats') {
    const result = handleGetTabBufferSummary({});
    sendResponse(result);
    return false;
  }

  if (message.type === 'clear_all_buffers') {
    handleClearBuffer({ clearAll: true });
    sendResponse({ success: true });
    return false;
  }
});

// Initialize — always start fully reset. No auto-connect on startup.
// User must manually connect each session via the popup.
browser.storage.local.remove('tethernetServerUrl');
connectionState = 'disconnected';
updateIcon();

console.log('[Tethernet] Background script initialized');
