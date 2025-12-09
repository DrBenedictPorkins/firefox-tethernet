/**
 * FoxHole Content Script
 * Intercepts console, errors, and WebSocket messages
 * Handles DOM manipulation commands from background script
 */

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__foxhole_injected) {
    return;
  }
  window.__foxhole_injected = true;

  // Settings - default to capturing source (on by default)
  let captureLogSource = true;

  // Load setting from storage
  browser.storage.local.get('captureLogSource').then(result => {
    captureLogSource = result.captureLogSource !== false;
    // Update the page script setting
    window.postMessage({ type: '__foxhole_setting', captureLogSource }, '*');
  }).catch(() => {
    // Ignore errors, use default
  });

  // Listen for console logs from page context
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === '__foxhole_console') {
      try {
        browser.runtime.sendMessage({
          type: 'console_log',
          data: event.data.data
        }).catch(() => {});
      } catch (e) {
        // Ignore
      }
    }
  });

  // Inject console hook into page context
  const pageScript = `
(function() {
  if (window.__foxhole_page_injected) return;
  window.__foxhole_page_injected = true;

  let captureLogSource = true;

  // Listen for setting updates from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === '__foxhole_setting' && 'captureLogSource' in event.data) {
      captureLogSource = event.data.captureLogSource;
    }
  });

  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
  };

  function interceptConsole(level) {
    console[level] = function(...args) {
      originalConsole[level].apply(console, args);

      let source = null;
      if (captureLogSource) {
        try {
          const stack = new Error().stack;
          if (stack) {
            const lines = stack.split('\\n');
            for (let i = 2; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              // Skip our injected script
              if (line.includes('__foxhole')) continue;

              let match = line.match(/@(.+):(\\d+):(\\d+)$/);
              if (!match) match = line.match(/\\((.+):(\\d+):(\\d+)\\)$/);
              if (!match) match = line.match(/at (.+):(\\d+):(\\d+)$/);

              if (match) {
                source = { file: match[1], line: parseInt(match[2], 10), column: parseInt(match[3], 10) };
                break;
              }
            }
          }
        } catch (e) {}
      }

      try {
        window.postMessage({
          type: '__foxhole_console',
          data: {
            level,
            args: args.map(arg => {
              try {
                if (arg instanceof Error) {
                  return { type: 'Error', message: arg.message, stack: arg.stack };
                }
                return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
              } catch (e) {
                return String(arg);
              }
            }),
            timestamp: Date.now(),
            location: window.location.href,
            source
          }
        }, '*');
      } catch (e) {}
    };
  }

  ['log', 'warn', 'error', 'info', 'debug'].forEach(interceptConsole);
})();
`;

  // Inject script into page context
  const script = document.createElement('script');
  script.textContent = pageScript;
  (document.documentElement || document.head || document.body).appendChild(script);
  script.remove();

  // Error interception
  window.addEventListener('error', (event) => {
    try {
      browser.runtime.sendMessage({
        type: 'js_error',
        data: {
          message: event.message,
          source: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error ? {
            message: event.error.message,
            stack: event.error.stack
          } : null,
          timestamp: Date.now(),
          location: window.location.href
        }
      }).catch(() => {});
    } catch (e) {
      // Ignore
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    try {
      // Serialize the rejection reason properly
      let reasonMessage;
      let reasonData = null;
      const reason = event.reason;

      if (reason instanceof Error) {
        reasonMessage = reason.message;
      } else if (typeof reason === 'string') {
        reasonMessage = reason;
      } else if (reason && typeof reason === 'object') {
        try {
          reasonMessage = JSON.stringify(reason);
          reasonData = reason;
        } catch (e) {
          reasonMessage = reason.message || reason.toString();
        }
      } else {
        reasonMessage = String(reason);
      }

      browser.runtime.sendMessage({
        type: 'js_error',
        data: {
          message: 'Unhandled Promise Rejection: ' + reasonMessage,
          error: reason ? {
            message: reasonMessage,
            stack: reason?.stack,
            data: reasonData
          } : null,
          timestamp: Date.now(),
          location: window.location.href
        }
      }).catch(() => {});
    } catch (e) {
      // Ignore
    }
  });

  // WebSocket interception (wrapped in try-catch as Firefox marks WebSocket as read-only)
  try {
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(...args) {
      const ws = new OriginalWebSocket(...args);
      const url = args[0];

      ws.addEventListener('message', (event) => {
        try {
          browser.runtime.sendMessage({
            type: 'websocket_message',
            data: {
              direction: 'receive',
              url,
              data: event.data,
              timestamp: Date.now(),
              location: window.location.href
            }
          }).catch(() => {});
        } catch (e) {
          // Ignore
        }
      });

      const originalSend = ws.send;
      ws.send = function(data) {
        try {
          browser.runtime.sendMessage({
            type: 'websocket_message',
            data: {
              direction: 'send',
              url,
              data,
              timestamp: Date.now(),
              location: window.location.href
            }
          }).catch(() => {});
        } catch (e) {
          // Ignore
        }
        return originalSend.call(this, data);
      };

      return ws;
    };
  } catch (e) {
    // WebSocket interception not available (Firefox marks it as read-only)
    // Continue without WebSocket monitoring
  }

  // Command handlers from background script
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { action, params } = message;

    // Handle command asynchronously
    handleCommand(action, params)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));

    return true; // Keep channel open for async response
  });

  async function handleCommand(action, params) {
    switch (action) {
      case 'ping':
        return { pong: true };

      case 'get_dom':
        return { html: document.documentElement.outerHTML };

      case 'query_selector':
        return handleQuerySelector(params);

      case 'get_computed_styles':
        return handleGetComputedStyles(params);

      case 'get_element_properties':
        return handleGetElementProperties(params);

      case 'get_page_text':
        return { text: document.body.innerText };

      case 'execute_script':
        return handleExecuteScript(params);

      case 'click_element':
        return handleClickElement(params);

      case 'type_text':
        return handleTypeText(params);

      case 'press_key':
        return handlePressKey(params);

      case 'scroll':
        return handleScroll(params);

      case 'scroll_to_element':
        return handleScrollToElement(params);

      case 'hover_element':
        return handleHoverElement(params);

      case 'focus_element':
        return handleFocusElement(params);

      case 'select_option':
        return handleSelectOption(params);

      case 'set_checkbox':
        return handleSetCheckbox(params);

      case 'get_storage':
        return handleGetStorage(params);

      case 'set_storage':
        return handleSetStorage(params);

      case 'clear_storage':
        return handleClearStorage(params);

      case 'get_element_bounds':
        return handleGetElementBounds(params);

      case 'update_setting':
        if ('captureLogSource' in params) {
          captureLogSource = params.captureLogSource;
          // Also update the page script
          window.postMessage({ type: '__foxhole_setting', captureLogSource: params.captureLogSource }, '*');
        }
        return { success: true };

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  function findElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    return element;
  }

  function handleQuerySelector(params) {
    const { selector, all } = params;

    if (all) {
      const elements = Array.from(document.querySelectorAll(selector));
      return {
        elements: elements.map((el, index) => ({
          index,
          tagName: el.tagName,
          id: el.id,
          className: el.className,
          textContent: el.textContent?.substring(0, 100)
        }))
      };
    } else {
      const element = document.querySelector(selector);
      if (!element) {
        return { found: false };
      }
      return {
        found: true,
        tagName: element.tagName,
        id: element.id,
        className: element.className,
        textContent: element.textContent?.substring(0, 200),
        innerHTML: element.innerHTML?.substring(0, 500)
      };
    }
  }

  function handleGetComputedStyles(params) {
    const { selector } = params;
    const element = findElement(selector);
    const styles = window.getComputedStyle(element);

    const styleObject = {};
    for (let prop of styles) {
      styleObject[prop] = styles.getPropertyValue(prop);
    }

    return { styles: styleObject };
  }

  function handleGetElementProperties(params) {
    const { selector, properties } = params;
    const element = findElement(selector);

    const result = {
      tagName: element.tagName,
      id: element.id,
      className: element.className,
      textContent: element.textContent?.substring(0, 200),
    };

    // If specific properties requested, get those too
    if (properties && Array.isArray(properties)) {
      for (const prop of properties) {
        if (prop in element) {
          const value = element[prop];
          // Handle different value types
          if (typeof value === 'function') {
            continue; // Skip methods
          } else if (value instanceof Element) {
            result[prop] = { tagName: value.tagName, id: value.id };
          } else if (typeof value === 'object' && value !== null) {
            try {
              result[prop] = JSON.stringify(value);
            } catch (e) {
              result[prop] = String(value);
            }
          } else {
            result[prop] = value;
          }
        }
      }
    }

    return { properties: result };
  }

  async function handleExecuteScript(params) {
    const { script, preview, force } = params;
    const PAYLOAD_LIMIT = 50000; // 50KB threshold

    let result = eval(script);
    // Handle promises returned from evaluated scripts
    if (result && typeof result.then === 'function') {
      result = await result;
    }

    // Check payload size
    let serialized;
    try {
      serialized = JSON.stringify(result);
    } catch (e) {
      serialized = String(result);
    }

    const payloadSize = serialized.length;

    // If payload exceeds limit and not forced/preview
    if (payloadSize > PAYLOAD_LIMIT && !preview && !force) {
      return {
        error: 'payload_too_large',
        size: payloadSize,
        sizeFormatted: (payloadSize / 1024).toFixed(1) + 'KB',
        limit: PAYLOAD_LIMIT,
        limitFormatted: (PAYLOAD_LIMIT / 1024).toFixed(0) + 'KB',
        message: `Result exceeds ${(PAYLOAD_LIMIT / 1024).toFixed(0)}KB (actual: ${(payloadSize / 1024).toFixed(1)}KB). Options: 1) Rewrite JS to filter/limit results, 2) Use preview:true for first ${(PAYLOAD_LIMIT / 1024).toFixed(0)}KB sample, 3) Use force:true to get full payload.`
      };
    }

    // Preview mode - return truncated sample
    if (preview && payloadSize > PAYLOAD_LIMIT) {
      return {
        preview: true,
        sample: serialized.slice(0, PAYLOAD_LIMIT),
        truncatedAt: PAYLOAD_LIMIT,
        totalSize: payloadSize,
        totalSizeFormatted: (payloadSize / 1024).toFixed(1) + 'KB',
        message: `Showing first ${(PAYLOAD_LIMIT / 1024).toFixed(0)}KB of ${(payloadSize / 1024).toFixed(1)}KB. Use force:true for full payload or rewrite JS for targeted extraction.`
      };
    }

    return { result };
  }

  function handleClickElement(params) {
    const { selector } = params;
    const element = findElement(selector);
    element.click();
    return { success: true };
  }

  function handleTypeText(params) {
    const { selector, text, clear } = params;
    const element = findElement(selector);

    if (clear) {
      element.value = '';
    }

    element.focus();
    element.value += text;

    // Trigger input events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true };
  }

  function handlePressKey(params) {
    const { selector, key, ctrlKey, shiftKey, altKey, metaKey } = params;
    const element = selector ? findElement(selector) : document.activeElement;

    const eventOptions = {
      key,
      code: key,
      ctrlKey: ctrlKey || false,
      shiftKey: shiftKey || false,
      altKey: altKey || false,
      metaKey: metaKey || false,
      bubbles: true,
      cancelable: true
    };

    element.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    element.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
    element.dispatchEvent(new KeyboardEvent('keyup', eventOptions));

    return { success: true };
  }

  function handleScroll(params) {
    const { x, y } = params;
    window.scrollTo(x || 0, y || 0);
    return { success: true };
  }

  function handleScrollToElement(params) {
    const { selector, behavior } = params;
    const element = findElement(selector);
    element.scrollIntoView({ behavior: behavior || 'smooth', block: 'center' });
    return { success: true };
  }

  function handleHoverElement(params) {
    const { selector } = params;
    const element = findElement(selector);

    const rect = element.getBoundingClientRect();
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };

    element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
    element.dispatchEvent(new MouseEvent('mouseenter', eventOptions));

    return { success: true };
  }

  function handleFocusElement(params) {
    const { selector } = params;
    const element = findElement(selector);
    element.focus();
    return { success: true };
  }

  function handleSelectOption(params) {
    const { selector, value, index } = params;
    const element = findElement(selector);

    if (element.tagName !== 'SELECT') {
      throw new Error('Element is not a SELECT element');
    }

    if (value !== undefined) {
      element.value = value;
    } else if (index !== undefined) {
      element.selectedIndex = index;
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  }

  function handleSetCheckbox(params) {
    const { selector, checked } = params;
    const element = findElement(selector);

    if (element.type !== 'checkbox' && element.type !== 'radio') {
      throw new Error('Element is not a checkbox or radio button');
    }

    element.checked = checked;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  }

  function handleGetStorage(params) {
    const { type } = params;
    const storage = type === 'session' ? sessionStorage : localStorage;

    const data = {};
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      data[key] = storage.getItem(key);
    }

    return { data };
  }

  function handleSetStorage(params) {
    const { type, key, value } = params;
    const storage = type === 'session' ? sessionStorage : localStorage;
    storage.setItem(key, value);
    return { success: true };
  }

  function handleClearStorage(params) {
    const { type } = params;
    const storage = type === 'session' ? sessionStorage : localStorage;
    storage.clear();
    return { success: true };
  }

  function handleGetElementBounds(params) {
    const { selector } = params;
    const element = findElement(selector);
    const rect = element.getBoundingClientRect();

    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left
    };
  }

  // Notify background script that content script is ready
  browser.runtime.sendMessage({ type: 'content_script_ready' }).catch(() => {
    // Ignore errors if background script isn't ready yet
  });

  console.log('[FoxHole] Content script initialized');
})();
