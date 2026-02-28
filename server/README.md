# Tethernet MCP Server

Browser automation for Claude Code and Claude Desktop via Firefox.

## Quick Start

See the [root README](../README.md) for installation instructions.

## Development

```bash
npm run dev     # Hot reload (tsx watch)
npm run build   # Compile TypeScript
npm test        # Run tests (vitest)
```

## MCP Tools

### Connection
- `get_started` — Returns behavioral instructions (call first in Claude Desktop sessions)
- `get_connection_info` — WebSocket URL/port to enter in extension popup
- `get_connection_status` — Extension connected status, tab count, port

### Tab Management
- `list_tabs` — List all open tabs
- `get_active_tab` — Get current active tab
- `get_primary_tab` — Get default tab for operations
- `set_primary_tab` — Set default tab (avoids specifying tabId on every call)
- `switch_tab` — Switch to a tab
- `create_tab` — Open new tab
- `close_tab` — Close a tab
- `list_frames` — List iframes in a page

### Navigation
- `navigate` — Navigate to URL
- `reload_page` — Reload page
- `go_back` / `go_forward` — Browser history navigation
- `wait_for_navigation` — Wait for navigation to complete
- `wait_for_element` — Wait for element to appear in DOM

### DOM Inspection
- `dom_stats` — Page size, element count, depth — **check this first before fetching HTML**
- `get_dom_structure` — Progressive DOM exploration at controlled depth (preferred over full HTML)
- `get_page_content` — Full page HTML (only for pages < 50KB)
- `query_selector` — Find elements by CSS selector
- `get_element_properties` — Get properties of a specific element
- `get_dom_snapshot` — Retrieve stored DOM snapshots

### Script Execution
- `execute_script` — Run JavaScript in page context (full DOM access)
- `execute_background_script` — Run JavaScript in extension context (`browser.*` API access)

### Interaction
- `click_element` — Click a DOM element
- `type_text` — Type into an input
- `fill_form` — Fill multiple form fields at once
- `scroll_to` — Scroll to position or element

### Buffered Data
- `query_buffer` — Query console/network/errors/websocket data with JS transforms
- `get_network_request_detail` — Full headers and body for a specific request
- `clear_buffer` — Clear buffered data for a tab
- `get_buffer_stats` — Buffer usage statistics

### Screenshots
- `take_screenshot` — Capture page (saves to `/tmp`, returns path — use `Read` to view in CC; or `returnBase64: true` for inline JPEG in Claude Desktop)
- `get_screenshots` — Retrieve buffered screenshots

### Storage & Cookies
- `get_local_storage` / `set_local_storage` — localStorage
- `get_session_storage` — sessionStorage
- `get_cookies` / `set_cookie` — Cookies

### Request Control
- `set_request_headers` — Set custom headers for a tab
- `block_urls` — Block URL patterns from loading

### Ollama Integration
- `ollama_analyze_page` — Send page HTML to local Ollama for analysis

### Extension Debugging
- `check_debug_bridge` — Check if a Firefox extension implements the Tethernet debug bridge
- `query_extension_debug` — Query extension state via debug bridge (ping, getState, getErrors, getStorage, getManifest)

## Buffer Schemas

```typescript
// query_buffer types and their fields:
console:   { level, args, timestamp, url }
errors:    { message, source, lineno, colno, stack, timestamp }
network:   { requestId, url, method, statusCode, duration, timestamp,
             requestHeaders, responseHeaders, requestBody, responseBody }
websocket: { url, data, direction, timestamp }
```

Buffer limits (per tab): 1000 console, 500 network, 500 websocket, 200 errors, 10 snapshots, 5 screenshots.

## Architecture

```
Claude Code/Desktop  ──stdio──►  MCP Server (Node.js)  ──WebSocket──►  Firefox Extension
                                 (dynamic port, OS-assigned)
```

Each session spawns its own server process with its own WebSocket port — explicit 1:1 binding.

### Extension Protocol

**Events** (extension → server):
```typescript
{ type: 'console_log' | 'network_request' | 'js_error' | ..., tabId: number, data: any }
```

**Commands** (server → extension):
```typescript
{ action: string, params: Record<string, any>, requestId: string }
```

**Responses** (extension → server):
```typescript
{ requestId: string, result?: any, error?: string }
```

## Configuration

`src/utils/config.ts` — buffer limits, WebSocket settings, logging.

Session logs: `server/logs/session-<timestamp>.jsonl`

## Ollama Setup

Set environment variables in your MCP config:

```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=qwen2.5:7b
```
