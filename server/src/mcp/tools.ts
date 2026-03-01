import type { MCPToolDefinition } from './types.js';

export const TOOLS: MCPToolDefinition[] = [
  // Getting Started
  {
    name: 'get_started',
    description:
      'Call this first before starting any browser task. Returns instructions on how to use Tethernet effectively, including when to guide the user vs when to automate.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // Tab Management
  {
    name: 'list_tabs',
    description: 'List all open browser tabs with their URLs and titles',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_active_tab',
    description: 'Get information about the currently active tab',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'switch_tab',
    description: 'Switch to a specific tab by ID',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab to switch to',
        },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'set_primary_tab',
    description: 'Set the default tab for operations when tabId not specified',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab to set as primary',
        },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'get_primary_tab',
    description: 'Get the currently set primary tab',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_tab',
    description: 'Create a new browser tab with optional URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to open in the new tab',
        },
        active: {
          type: 'boolean',
          description: 'Whether to make the new tab active',
        },
      },
    },
  },
  {
    name: 'close_tab',
    description: 'Close a specific tab',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab to close',
        },
      },
      required: ['tabId'],
    },
  },

  // Navigation & Interaction
  {
    name: 'navigate',
    description: 'Navigate to a URL in the specified or primary tab',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'reload_page',
    description: 'Reload the page in the specified or primary tab',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
        bypassCache: {
          type: 'boolean',
          description: 'Whether to bypass the cache',
        },
      },
    },
  },
  {
    name: 'go_back',
    description: 'Go back in browser history',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
    },
  },
  {
    name: 'go_forward',
    description: 'Go forward in browser history',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
    },
  },

  // Buffer Query (consolidated)
  {
    name: 'query_buffer',
    description: 'Query buffered data with JS transform to shape/filter results.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['console', 'errors', 'network', 'websocket'],
          description: 'Buffer type to query',
        },
        transform: {
          type: 'string',
          description: 'Required JS expression applied to data array. Examples: .filter(x => x.level === "error").slice(-20) or .sort((a,b) => b.duration - a.duration).slice(0,5)',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
      required: ['type', 'transform'],
    },
  },

  // Network Detail (single item lookup)
  {
    name: 'get_network_request_detail',
    description: 'Get full details of a network request by ID (headers, bodies).',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID',
        },
        requestId: {
          type: 'string',
          description: 'The request ID to fetch',
        },
      },
      required: ['requestId'],
    },
  },
  // DOM & Content
  {
    name: 'list_frames',
    description: 'List all frames (iframes) with URLs and frameIds.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
    },
  },
  {
    name: 'dom_stats',
    description: 'Get DOM statistics (element count, depth, size) without full HTML.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
        frameId: {
          type: 'number',
          description: 'Frame ID for iframes (default: 0 = top frame)',
        },
        includeTags: {
          type: 'boolean',
          description: 'Include top 15 tag distribution (adds tokens, default false)',
        },
      },
    },
  },
  {
    name: 'get_page_content',
    description: 'Get full page HTML. Can be large - use dom_stats first to check size.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
        frameId: {
          type: 'number',
          description: 'Frame ID for iframes (default: 0 = top frame)',
        },
      },
    },
  },
  {
    name: 'get_dom_structure',
    description: 'Get DOM structure at specified depth. Shows element hierarchy with child counts beyond depth limit. Use for exploring large pages without fetching full HTML.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
        frameId: {
          type: 'number',
          description: 'Frame ID for iframes (default: 0 = top frame)',
        },
        selector: {
          type: 'string',
          description: 'CSS selector to start from (default: body)',
        },
        depth: {
          type: 'number',
          description: 'How many levels deep to expand (default: 2)',
        },
      },
    },
  },
  {
    name: 'get_dom_snapshot',
    description: 'Get stored DOM snapshots from buffer.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
    },
  },
  {
    name: 'query_selector',
    description: 'Query DOM elements using CSS selector.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
        frameId: {
          type: 'number',
          description: 'Frame ID for iframes (default: 0 = top frame)',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'get_element_properties',
    description: 'Get properties of a DOM element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element',
        },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Properties to retrieve',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
        frameId: {
          type: 'number',
          description: 'Frame ID for iframes (default: 0 = top frame)',
        },
      },
      required: ['selector'],
    },
  },

  // Element Interaction
  {
    name: 'click_element',
    description: 'Click on a DOM element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
        frameId: {
          type: 'number',
          description: 'Frame ID for iframes (default: 0 = top frame)',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'type_text',
    description: 'Type text into an input element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input element',
        },
        text: {
          type: 'string',
          description: 'Text to type',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
        frameId: {
          type: 'number',
          description: 'Frame ID for iframes (default: 0 = top frame)',
        },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'fill_form',
    description: 'Fill a form with multiple field values',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'object',
          description: 'Object mapping selectors to values',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
      required: ['fields'],
    },
  },
  {
    name: 'scroll_to',
    description: 'Scroll to a specific position or element',
    inputSchema: {
      type: 'object',
      properties: {
        x: {
          type: 'number',
          description: 'X coordinate',
        },
        y: {
          type: 'number',
          description: 'Y coordinate',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for element to scroll to',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
    },
  },

  // Screenshots
  {
    name: 'take_screenshot',
    description: 'Take screenshot. Default: JPEG q80, saves to /tmp and returns the file path — use the Read tool on that path to view the image (Claude Code). Set returnBase64=true to get an inline image response (Claude Desktop only). Use cropTo or selector to capture only the relevant area and minimize token usage. Use scale (e.g. 0.5) to halve dimensions — helpful on Retina displays where the native capture is 2x.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
        fullPage: {
          type: 'boolean',
          description: 'Capture full page or just viewport',
        },
        format: {
          type: 'string',
          enum: ['png', 'jpeg'],
          description: 'Image format (default: jpeg)',
        },
        quality: {
          type: 'number',
          description: 'JPEG quality 1-100 (default: 80). Ignored for PNG.',
        },
        scale: {
          type: 'number',
          description: 'Scale factor 0-1 to reduce output dimensions (e.g. 0.5 halves width and height). Useful on Retina/HiDPI displays to normalize to 1x.',
        },
        saveTo: {
          type: 'string',
          description: 'File path to save screenshot. Defaults to /tmp/tethernet-screenshot-{timestamp}.{format}',
        },
        returnBase64: {
          type: 'boolean',
          description: 'If true, returns base64 data instead of saving to file. Default: false',
        },
        cropTo: {
          type: 'object',
          description: 'Crop to a specific region (CSS pixels, viewport-relative). Use for token-efficient confirmation shots after actions.',
          properties: {
            x: { type: 'number', description: 'Left edge in CSS pixels' },
            y: { type: 'number', description: 'Top edge in CSS pixels' },
            width: { type: 'number', description: 'Width in CSS pixels' },
            height: { type: 'number', description: 'Height in CSS pixels' },
          },
          required: ['x', 'y', 'width', 'height'],
        },
        selector: {
          type: 'string',
          description: 'CSS selector — crops screenshot to that element\'s bounding box. Alternative to cropTo.',
        },
      },
    },
  },
  {
    name: 'get_screenshots',
    description: 'Get stored screenshots from buffer.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
    },
  },

  // Storage & Cookies
  {
    name: 'get_local_storage',
    description: 'Get localStorage data.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
    },
  },
  {
    name: 'get_session_storage',
    description: 'Get sessionStorage data.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
    },
  },
  {
    name: 'set_local_storage',
    description: 'Set localStorage item',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Storage key',
        },
        value: {
          type: 'string',
          description: 'Storage value',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'get_cookies',
    description: 'Get cookies for current page.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
    },
  },
  {
    name: 'set_cookie',
    description: 'Set a cookie',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Cookie name',
        },
        value: {
          type: 'string',
          description: 'Cookie value',
        },
        domain: {
          type: 'string',
          description: 'Cookie domain',
        },
        path: {
          type: 'string',
          description: 'Cookie path',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
      required: ['name', 'value'],
    },
  },

  // Script Execution
  {
    name: 'execute_background_script',
    description: `Execute JavaScript in the extension's background context with full browser.* API access.

USE FOR: Window management, notifications, history, bookmarks, downloads, extension storage, advanced tab control.

COMMON PATTERNS:
  // Focus window + draw attention (taskbar flash/dock bounce)
  browser.windows.update(windowId, { focused: true, drawAttention: true })

  // System notification
  browser.notifications.create({ type: "basic", title: "Done", message: "Task complete" })

  // Search history
  browser.history.search({ text: "github", maxResults: 10 })

  // Persistent storage (survives restarts)
  await browser.storage.local.set({ key: value })
  await browser.storage.local.get("key")

  // Mute/pin tab
  browser.tabs.update(tabId, { muted: true, pinned: true })

  // Get all windows
  browser.windows.getAll({ populate: true })

NOT FOR: DOM manipulation, page scraping (use execute_script instead).`,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute. Has access to all browser.* APIs. Use await for async operations.',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'execute_script',
    description: `Execute JavaScript in page context with full DOM access. Large payloads (>50KB) blocked unless preview:true or force:true.

USE FOR: DOM queries, data extraction, element manipulation, reading page state, evaluating expressions.

EXAMPLES:
  // Simple expression
  document.title

  // Extract data
  Array.from(document.querySelectorAll('.item')).map(el => el.textContent)

  // Complex logic (wrap in IIFE)
  (() => { const data = {}; /* logic */; return data; })()

NOT FOR: Browser APIs like history, bookmarks, notifications (use execute_background_script instead).`,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute. Returns the result of the last expression.',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
        frameId: {
          type: 'number',
          description: 'Frame ID for iframes (default: 0 = top frame)',
        },
        preview: {
          type: 'boolean',
          description: 'If true, returns first 50KB of large payloads as sample instead of blocking',
        },
        force: {
          type: 'boolean',
          description: 'If true, returns full payload regardless of size (use with caution)',
        },
      },
      required: ['code'],
    },
  },

  // Buffer Management
  {
    name: 'clear_buffer',
    description: 'Clear data buffers for a tab',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID to clear buffers for',
        },
        dataType: {
          type: 'string',
          enum: ['console', 'network', 'websocket', 'errors', 'dom', 'screenshots', 'storage', 'cookies'],
          description: 'Specific data type to clear (clears all if not specified)',
        },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'get_buffer_stats',
    description: 'Get statistics about buffer usage across all tabs',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // Connection Info
  {
    name: 'get_connection_info',
    description: 'Returns the WebSocket URL and port for the Firefox extension. Use this to find the host:port to enter in the extension popup.',
    inputSchema: { type: 'object', properties: {} },
  },

  // Connection Status
  {
    name: 'get_connection_status',
    description: 'Get the status of the extension connection',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // Wait & Timing
  {
    name: 'wait_for_element',
    description: 'Wait for an element to appear in the DOM',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector to wait for',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default 5000)',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
        frameId: {
          type: 'number',
          description: 'Frame ID for iframes (default: 0 = top frame)',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'wait_for_navigation',
    description: 'Wait for navigation to complete',
    inputSchema: {
      type: 'object',
      properties: {
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default 30000)',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
    },
  },

  // Advanced
  {
    name: 'set_request_headers',
    description: 'Set custom request headers for a tab',
    inputSchema: {
      type: 'object',
      properties: {
        headers: {
          type: 'object',
          description: 'Headers to set',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
      required: ['headers'],
    },
  },
  {
    name: 'block_urls',
    description: 'Block specific URLs or patterns from loading',
    inputSchema: {
      type: 'object',
      properties: {
        patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'URL patterns to block',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
      },
      required: ['patterns'],
    },
  },

  // Ollama Integration (Local LLM)
  {
    name: 'ollama_analyze_page',
    description: 'Send page HTML to local Ollama for analysis. Returns error if unavailable.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Analysis instructions for the model (e.g., "Extract all product names and prices as JSON")',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
        model: {
          type: 'string',
          description: 'Ollama model to use (default: qwen2.5:32b)',
        },
      },
      required: ['prompt'],
    },
  },

  // Extension Debug Bridge
  {
    name: 'check_debug_bridge',
    description: 'Check if a Tethernet debug bridge is present on the page. Extensions with debug bridges expose window.__TETHERNET_DEBUG_BRIDGE with metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
        frameId: {
          type: 'number',
          description: 'Frame ID for iframes (default: 0 = top frame)',
        },
      },
    },
  },
  {
    name: 'query_extension_debug',
    description: 'Query an extension\'s debug bridge. Sends a request via CustomEvent and waits for response. Standard request types: ping, getState, getErrors, getStorage, getManifest.',
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'object',
          description: 'Request payload. Default: { type: "getState" }. Standard types: ping, getState, getErrors, getStorage, getManifest',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default 5000)',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (default: primary tab)',
        },
        frameId: {
          type: 'number',
          description: 'Frame ID for iframes (default: 0 = top frame)',
        },
      },
    },
  },
];
