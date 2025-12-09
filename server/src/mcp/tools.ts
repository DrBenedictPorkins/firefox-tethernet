import type { MCPToolDefinition } from './types.js';

export const TOOLS: MCPToolDefinition[] = [
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
    description: 'Set the primary tab for monitoring (default for operations when tabId not specified)',
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
          description: 'Optional tab ID (uses primary tab if not specified)',
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
          description: 'Optional tab ID (uses primary tab if not specified)',
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
          description: 'Optional tab ID (uses primary tab if not specified)',
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
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
      },
    },
  },

  // Console & Errors
  {
    name: 'get_console_logs',
    description: 'Get console logs from the specified or primary tab buffer. USE AGENT: Can return large payload.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        level: {
          type: 'string',
          enum: ['log', 'info', 'warn', 'error', 'debug'],
          description: 'Filter by log level',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of logs to return',
        },
      },
    },
  },
  {
    name: 'get_js_errors',
    description: 'Get JavaScript errors from the specified or primary tab buffer. USE AGENT: Can return large payload with stack traces.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of errors to return',
        },
      },
    },
  },

  // Network Monitoring
  {
    name: 'get_network_requests',
    description: 'Get network requests from the specified or primary tab buffer. USE AGENT: Can return large payload with headers/bodies.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        method: {
          type: 'string',
          description: 'Filter by HTTP method (GET, POST, etc.)',
        },
        urlPattern: {
          type: 'string',
          description: 'Filter by URL pattern (regex)',
        },
        statusCode: {
          type: 'number',
          description: 'Filter by status code',
        },
      },
    },
  },
  {
    name: 'get_websocket_messages',
    description: 'Get WebSocket messages from the specified or primary tab buffer. USE AGENT: Can return large payload.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        url: {
          type: 'string',
          description: 'Filter by WebSocket URL',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return',
        },
      },
    },
  },

  // DOM & Content
  {
    name: 'list_frames',
    description: 'List all frames (including iframes) in a tab with their URLs, titles, and frameIds. Useful for debugging frame targeting issues.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
      },
    },
  },
  {
    name: 'dom_stats',
    description: 'Get DOM statistics (element count, depth, size) without loading full content. Useful for assessing page complexity before querying.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        frameId: {
          type: 'number',
          description: 'Optional frame ID (0 = top frame, default). Use to target specific iframes.',
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
    description: 'Get the current page HTML content. USE AGENT: Returns full HTML, can be very large (MB+). Use dom_stats first to check size.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        frameId: {
          type: 'number',
          description: 'Optional frame ID (0 = top frame, default). Use to target specific iframes.',
        },
      },
    },
  },
  {
    name: 'get_dom_snapshot',
    description: 'Get stored DOM snapshots from buffer. USE AGENT: Can return multiple large HTML snapshots.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
      },
    },
  },
  {
    name: 'query_selector',
    description: 'Query DOM elements using CSS selector. USE AGENT: Can return many elements depending on selector.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector',
        },
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        frameId: {
          type: 'number',
          description: 'Optional frame ID (0 = top frame, default). Use to target specific iframes.',
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
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        frameId: {
          type: 'number',
          description: 'Optional frame ID (0 = top frame, default). Use to target specific iframes.',
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
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        frameId: {
          type: 'number',
          description: 'Optional frame ID (0 = top frame, default). Use to target specific iframes.',
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
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        frameId: {
          type: 'number',
          description: 'Optional frame ID (0 = top frame, default). Use to target specific iframes.',
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
          description: 'Optional tab ID (uses primary tab if not specified)',
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
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
      },
    },
  },

  // Screenshots
  {
    name: 'take_screenshot',
    description: 'Take a screenshot of the current page. By default saves to /tmp and returns file path. Set returnBase64=true to return base64 data instead.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        fullPage: {
          type: 'boolean',
          description: 'Capture full page or just viewport',
        },
        format: {
          type: 'string',
          enum: ['png', 'jpeg'],
          description: 'Image format',
        },
        saveTo: {
          type: 'string',
          description: 'File path to save screenshot. Defaults to /tmp/foxhole-screenshot-{timestamp}.{format}',
        },
        returnBase64: {
          type: 'boolean',
          description: 'If true, returns base64 data instead of saving to file. Default: false',
        },
      },
    },
  },
  {
    name: 'get_screenshots',
    description: 'Get stored screenshots from buffer. USE AGENT: Returns multiple base64 images, very large payload.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
      },
    },
  },

  // Storage & Cookies
  {
    name: 'get_local_storage',
    description: 'Get localStorage data from buffer. USE AGENT: Payload size varies by site.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
      },
    },
  },
  {
    name: 'get_session_storage',
    description: 'Get sessionStorage data from buffer. USE AGENT: Payload size varies by site.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
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
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'get_cookies',
    description: 'Get cookies from buffer. USE AGENT: Payload size varies by site.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
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
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
      },
      required: ['name', 'value'],
    },
  },

  // Script Execution
  {
    name: 'execute_script',
    description: 'Execute JavaScript code in the page context. Payloads >50KB are blocked by default - rewrite JS to filter/limit, use preview:true for sample, or force:true to override.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute',
        },
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        frameId: {
          type: 'number',
          description: 'Optional frame ID (0 = top frame, default). Use to target specific iframes.',
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
  {
    name: 'evaluate_expression',
    description: 'Evaluate a JavaScript expression and return the result. Payloads >50KB are blocked by default - rewrite expression to filter/limit, use preview:true for sample, or force:true to override.',
    inputSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'JavaScript expression to evaluate',
        },
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        frameId: {
          type: 'number',
          description: 'Optional frame ID (0 = top frame, default). Use to target specific iframes.',
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
      required: ['expression'],
    },
  },

  // Performance
  {
    name: 'get_performance_metrics',
    description: 'Get performance metrics from buffer',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
      },
    },
  },
  {
    name: 'measure_performance',
    description: 'Capture current performance metrics',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
      },
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
          enum: ['console', 'network', 'websocket', 'errors', 'dom', 'screenshots', 'storage', 'cookies', 'performance'],
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
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        frameId: {
          type: 'number',
          description: 'Optional frame ID (0 = top frame, default). Use to target specific iframes.',
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
          description: 'Optional tab ID (uses primary tab if not specified)',
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
          description: 'Optional tab ID (uses primary tab if not specified)',
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
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
      },
      required: ['patterns'],
    },
  },

  // Ollama Integration (Local LLM)
  {
    name: 'ollama_analyze_page',
    description: 'Fetch page HTML and send to local Ollama server for analysis. Use for extracting structured data from complex pages without consuming CC context tokens. Returns error if Ollama unavailable.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Analysis instructions for the model (e.g., "Extract all product names and prices as JSON")',
        },
        tabId: {
          type: 'number',
          description: 'Optional tab ID (uses primary tab if not specified)',
        },
        model: {
          type: 'string',
          description: 'Ollama model to use (default: qwen2.5:32b)',
        },
      },
      required: ['prompt'],
    },
  },
];
