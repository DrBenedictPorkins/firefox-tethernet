# FoxHole MCP Server

Browser automation for Claude Code via Firefox.

## Quick Start

### Prerequisites
- Node.js 18+
- Firefox browser
- Claude Code CLI

### 1. Build & Register Server

```bash
# From this directory (server/)
npm install
npm run build

# Register with Claude Code (use YOUR absolute path)
claude mcp add foxhole -- node /path/to/foxhole-debug-bridge/server/dist/index.js
```

### 2. Install Firefox Extension

```bash
# From repo root
cd ../extension
npm run ext:run    # Loads extension in Firefox with auto-reload
```

Or load manually: Firefox → `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `extension/manifest.json`

### 3. Verify Connection

In Claude Code:
```
> get_connection_status
```

Should show `extensionConnected: true` when Firefox extension is running.

### Optional: Ollama Integration

For local LLM analysis of page content (keeps large HTML out of Claude's context):

```bash
# Add to your MCP config env vars:
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=qwen2.5:7b
```

## Architecture

### Components

1. **MCP Server** (stdio transport)
   - Runs as a child process of Claude Code
   - Exposes 40+ tools for browser automation
   - Handles tool calls and returns results

2. **WebSocket Server** (`ws://localhost:19888`)
   - Accepts connections from the Firefox extension
   - Receives browser events (console logs, network requests, etc.)
   - Sends commands to the browser

3. **Buffer Store**
   - Per-tab data buffers with FIFO eviction
   - Stores console logs, network requests, errors, DOM snapshots, etc.

## Development

```bash
npm run dev     # Server with hot reload
npm run build   # Compile TypeScript
npm test        # Run tests
```

## Configuration

See `src/utils/config.ts`:

- Port: 19888
- Buffer limits (console logs: 1000, network requests: 500, etc.)
- WebSocket ping interval: 30s
- Logging settings

## MCP Tools (40+)

### Tab Management
- `list_tabs` - List all open tabs
- `get_active_tab` - Get active tab info
- `switch_tab` - Switch to a tab
- `set_primary_tab` - Set default tab for operations
- `get_primary_tab` - Get current primary tab
- `create_tab` - Create new tab
- `close_tab` - Close a tab

### Navigation & Interaction
- `navigate` - Navigate to URL
- `reload_page` - Reload page
- `go_back` - Browser back
- `go_forward` - Browser forward

### Console & Errors
- `get_console_logs` - Retrieve console logs (filterable by level)
- `get_js_errors` - Retrieve JavaScript errors

### Network Monitoring
- `get_network_requests` - Retrieve network requests (filterable)
- `get_websocket_messages` - Retrieve WebSocket messages

### DOM & Content
- `get_page_content` - Get page HTML
- `get_dom_snapshot` - Get stored DOM snapshots
- `query_selector` - Query DOM elements
- `get_element_properties` - Get element properties

### Element Interaction
- `click_element` - Click on element
- `type_text` - Type into input
- `fill_form` - Fill multiple form fields
- `scroll_to` - Scroll to position/element

### Screenshots
- `take_screenshot` - Capture screenshot (saves to /tmp by default, returns file path; use `returnBase64: true` for base64 data)
- `get_screenshots` - Retrieve stored screenshots

### Storage & Cookies
- `get_local_storage` - Get localStorage
- `get_session_storage` - Get sessionStorage
- `set_local_storage` - Set localStorage item
- `get_cookies` - Get cookies
- `set_cookie` - Set cookie

### Script Execution
- `execute_script` - Execute JavaScript
- `evaluate_expression` - Evaluate expression and return result

### Performance
- `get_performance_metrics` - Get stored metrics
- `measure_performance` - Capture current metrics

### Buffer Management
- `clear_buffer` - Clear tab buffers
- `get_buffer_stats` - Get buffer statistics

### Connection
- `get_connection_status` - Get connection status

### Wait & Timing
- `wait_for_element` - Wait for element to appear
- `wait_for_navigation` - Wait for navigation

### Advanced
- `set_request_headers` - Set custom headers
- `block_urls` - Block URL patterns

### Ollama Integration
- `ollama_analyze_page` - Send page HTML to local Ollama server for analysis (see Quick Start for setup)

## Extension Protocol

### Messages from Extension (Events)

```typescript
{
  type: 'console_log' | 'network_request' | 'network_response' | 'websocket_message' | 'js_error' | 'dom_snapshot' | 'screenshot' | 'storage_data' | 'cookies' | 'performance_metrics' | 'tab_updated' | 'tab_removed' | 'tabs_list',
  tabId: number,
  data: any
}
```

### Commands to Extension (Requests)

```typescript
{
  action: string,
  params: Record<string, any>,
  requestId: string
}
```

### Responses from Extension

```typescript
{
  requestId: string,
  result?: any,
  error?: string
}
```

## Primary Tab Concept

The server supports a "primary tab" concept - a default tab used when `tabId` is not specified in tool calls. This simplifies workflows:

1. Set primary tab: `set_primary_tab({ tabId: 123 })`
2. Use tools without specifying tabId: `navigate({ url: "https://example.com" })`

## Buffer Management

Each tab maintains separate buffers:

- Console logs: Max 1000 entries
- Network requests: Max 500 entries
- WebSocket messages: Max 500 entries
- JS errors: Max 200 entries
- DOM snapshots: Max 10 entries
- Screenshots: Max 5 entries
- Performance metrics: Max 100 entries

When limits are reached, oldest entries are evicted (FIFO).

## Error Handling

- Extension not connected: Returns error
- Tab not found: Returns error
- Request timeout: 30 seconds
- Missing primary tab: Error if tabId not specified and no primary tab set

## Logging

Session logs are written to `logs/session-<timestamp>.jsonl` in JSON Lines format:

```json
{"timestamp":1234567890,"type":"tool_call","data":{...}}
{"timestamp":1234567891,"type":"extension_event","data":{...}}
{"timestamp":1234567892,"type":"connection","data":{...}}
{"timestamp":1234567893,"type":"error","data":{...}}
```

## Connection Status

Use the `get_connection_status` MCP tool to check connection status:
- Extension connected status
- Primary tab ID
- Tab count

## File Structure

```
server/
├── src/
│   ├── buffer/
│   │   ├── types.ts       # Data type definitions
│   │   └── store.ts       # Buffer management
│   ├── connection/
│   │   ├── manager.ts     # Connection state
│   │   └── extension.ts   # WebSocket handling
│   ├── mcp/
│   │   ├── types.ts       # MCP types
│   │   ├── tools.ts       # Tool definitions
│   │   └── handlers.ts    # Tool implementations
│   ├── ollama/
│   │   └── client.ts      # Ollama API client
│   ├── ui/
│   │   └── terminal.ts    # Terminal UI
│   ├── logger/
│   │   └── session.ts     # Session logging
│   ├── utils/
│   │   └── config.ts      # Configuration
│   ├── server.ts          # Main server setup
│   └── index.ts           # Entry point
├── package.json
├── tsconfig.json
└── README.md
```
