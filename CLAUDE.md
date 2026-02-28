# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL: Git Operations

**NEVER commit or push without explicit user request.**

## CRITICAL: Tethernet Port

**ALWAYS call `get_connection_info` tool when asked for the Tethernet port. NEVER use a port from conversation history — the port changes every session.**

## Project Overview

Tethernet Debug Bridge connects Firefox to Claude Code via the Model Context Protocol (MCP). It consists of:
- **Firefox Extension** (Manifest V2) - Captures browser data and executes commands
- **MCP Server** (Node.js/TypeScript) - Bridges extension to Claude via **stdio transport** (spawned by Claude Code)
- **WebSocket** - Connects extension to server on a **dynamic port** (OS-assigned on startup)

## Commands

```bash
# Server (from server/ directory)
npm run dev              # Run server with hot reload (tsx watch)
npm run build            # Compile TypeScript
npm start                # Run server directly (stdio mode)
npm test                 # Run tests (vitest)

# Extension
npm run ext:run          # Run extension in Firefox with auto-reload
npm run ext:lint         # Lint extension with web-ext
npm run ext:build        # Build extension for distribution

# Single test file
cd server && npx vitest run src/mcp/handlers.test.ts
```

## Claude Code Configuration

Tethernet uses **stdio transport**. Claude Code spawns the server as a child process — no daemon needed.

### Setup

1. Build the server:
   ```bash
   cd server && npm run build
   ```

2. Register with Claude Code:
   ```bash
   claude mcp add tethernet -- node /path/to/tethernet-debug-bridge/server/dist/index.js
   ```

   Or configure manually in `~/.claude.json` or project `.mcp.json`:
   ```json
   {
     "mcpServers": {
       "tethernet": {
         "type": "stdio",
         "command": "node",
         "args": ["/path/to/tethernet-debug-bridge/server/dist/index.js"]
       }
     }
   }
   ```

3. Install and load the Firefox extension (see Extension section below).

4. Connect the extension to your session:
   - In Claude Code: call `get_connection_info` tool → get `localhost:PORT`
   - In Firefox popup: enter `localhost:PORT` → click Connect

### How the Dynamic Port Works

On startup the server binds WebSocket on port 0 (OS picks an available port) and writes it to `~/.tethernet/port`. Each Claude Code session gets its own port, giving explicit 1:1 binding between session and Firefox window.

### Troubleshooting

- **Extension not connected**: Call `get_connection_info`, enter the shown port in the extension popup
- **Port file**: `cat ~/.tethernet/port` to see the current session's port
- **Server logs**: All logs go to stderr (stdout is reserved for MCP protocol)

## Architecture

```
Firefox Extension                    MCP Server                    Claude Code
┌─────────────────┐                 ┌─────────────────┐           ┌───────────┐
│ background.js   │◄── WebSocket ──►│ extension.ts    │           │           │
│ content.js      │   :DYNAMIC      │ handlers.ts     │◄─ stdio ──►│  Claude   │
│ popup/devtools  │                 │                 │           │           │
└─────────────────┘                 └─────────────────┘           └───────────┘
```

**Data Flow:**
1. Content script intercepts console/errors/WebSocket in page context
2. Background script captures network via webRequest API, manages tabs
3. Extension buffers all data locally (extension is source of truth)
4. MCP tools query extension on-demand via WebSocket commands
5. Server proxies results to Claude via stdio transport

**Command Flow:**
1. Claude calls MCP tool (e.g., `execute_script`)
2. Server sends to extension: `{ action, params, requestId }`
3. Background routes to content script or handles directly
4. Response returns: `{ requestId, result, error }`

## Key Files

### Extension (`extension/`)
- `manifest.json` - MV2 manifest with `<all_urls>` permissions
- `background.js` - WebSocket connection, command routing, webRequest handlers
- `content.js` - Console/error interception, DOM manipulation, runs in page context

### Server (`server/src/`)
- `server.ts` - Main setup: stdio MCP server, WebSocket handler, tool registration
- `mcp/tools.ts` - 40+ tool definitions with JSON schemas
- `mcp/handlers.ts` - Tool implementation, routes commands to extension
- `connection/extension.ts` - WebSocket server (dynamic port), request/response correlation
- `ollama/client.ts` - Ollama API client for local LLM analysis
- `utils/config.ts` - Buffer limits, WebSocket config, Ollama config

## Extension ↔ Server Protocol

**Events (extension → server):**
```javascript
{ type: 'console_log', tabId: 123, data: { level, args, timestamp, url } }
{ type: 'network_request', tabId: 123, data: { requestId, url, method, ... } }
{ type: 'js_error', tabId: 123, data: { message, source, lineno, ... } }
```

**Commands (server → extension):**
```javascript
{ action: 'execute_script', params: { tabId, script }, requestId: 'uuid' }
{ action: 'navigate', params: { tabId, url }, requestId: 'uuid' }
```

Content script commands are listed in `background.js` switch statement under "Commands forwarded to content script".

## Buffer Configuration

Located in `server/src/utils/config.ts`:
- Console logs: 1000 max per tab
- Network requests: 500 max
- WebSocket messages: 500 max
- JS errors: 200 max
- DOM snapshots: 10 max
- Screenshots: 5 max

## DOM Inspection Tools

### `dom_stats` - Check page size FIRST

**Always call this before fetching page content to avoid context flooding.**

```typescript
dom_stats({ tabId?, frameId?, includeTags?: boolean })
```

Returns: `{ totalElements, maxDepth, htmlSize, iframeCount, formCount, linkCount, imageCount }`

**Example:**
```javascript
dom_stats({ includeTags: true })
// → { totalElements: 2847, htmlSize: 907345, maxDepth: 18, ... }
// 907KB! Do NOT call get_page_content - use get_dom_structure instead
```

### `get_dom_structure` - Progressive DOM disclosure (PREFERRED)

**Use this instead of `get_page_content` for large pages.** Explores DOM hierarchy at controlled depth, showing child counts beyond the limit.

```typescript
get_dom_structure({
  selector?: string,  // CSS selector to start from (default: 'body')
  depth?: number,     // How many levels to expand (default: 2)
  tabId?: number,
  frameId?: number
})
```

**Workflow - Explore page structure progressively:**
```javascript
// Step 1: Get top-level structure
get_dom_structure({ depth: 1 })
// → <body>
//     <header id="nav"><!-- 11 children --></header>
//     <main id="content"><!-- 5 children --></main>
//     <footer><!-- 2 children --></footer>
//   </body>

// Step 2: Drill into interesting section
get_dom_structure({ selector: 'main#content', depth: 2 })
// → <main id="content">
//     <div class="hero"><!-- 3 children --></div>
//     <div class="products"><!-- 48 children --></div>
//   </main>

// Step 3: Drill deeper into specific area
get_dom_structure({ selector: '.products', depth: 3 })
// → Shows product cards structure
```

**Output format:**
- Elements show tag, id, class, role, data-testid, href, src attributes
- Beyond depth limit: `<!-- N children -->` summary
- Leaf text nodes: inline text preview (truncated at 60 chars)
- Void elements: self-closing `<img src="..."/>`

**Raw content detection:** If the page is raw JSON/XML/text (single `<pre>` in body), returns:
```
Raw JSON content detected (45231 bytes)
Preview: {"data": [...
Hint: Use get_page_content for full payload, or query_buffer for network responses
```

**Real-world example - 99% payload reduction:**
```
Paramount+ homepage: 907KB full HTML
├── dom_stats()                    → 200 bytes (check size)
├── get_dom_structure({ depth: 1 }) → 3KB (top-level)
├── get_dom_structure({ selector: 'main', depth: 2 }) → 4KB (35 carousels)
└── get_dom_structure({ selector: '#products', depth: 3 }) → 2KB (detail)
Total: ~10KB vs 907KB
```

### `get_page_content` - Full HTML (USE WITH CAUTION)

**Only use after checking `dom_stats` shows reasonable size (<50KB).**

```typescript
get_page_content({ tabId?, frameId? })
```

Returns full `document.documentElement.outerHTML`. Can be 100KB-1MB+ for complex pages.

### `query_selector` - Find elements by CSS selector

```typescript
query_selector({ selector: string, tabId?, frameId? })
```

Returns array of matching elements with tag, id, class, attributes.

## Buffer Query API

Single tool for querying all buffered data with JS transforms:

### `query_buffer`

```typescript
query_buffer({
  type: 'console' | 'errors' | 'network' | 'websocket',
  transform: string,  // Required - JS expression applied to data array
  tabId?: number
})
```

**Examples:**
```javascript
// Console: last 20 error logs
query_buffer({ type: 'console', transform: ".filter(l => l.level === 'error').slice(-20)" })

// Errors: extract message and stack
query_buffer({ type: 'errors', transform: ".map(e => ({ message: e.message, stack: e.stack }))" })

// Network: top 5 slowest requests
query_buffer({ type: 'network', transform: ".sort((a,b) => b.duration - a.duration).slice(0,5).map(r => ({ url: r.url, duration: r.duration }))" })

// Network: count by domain
query_buffer({ type: 'network', transform: ".reduce((acc, r) => { const d = new URL(r.url).hostname; acc[d] = (acc[d]||0)+1; return acc }, {})" })

// Network: POST requests with bodies
query_buffer({ type: 'network', transform: ".filter(r => r.method === 'POST').map(r => ({ url: r.url, body: r.requestBody }))" })

// WebSocket: messages containing 'error'
query_buffer({ type: 'websocket', transform: ".filter(m => m.data && m.data.includes('error'))" })
```

**Buffer schemas:**
- `console`: `{ level, args, timestamp, url }`
- `errors`: `{ message, source, lineno, colno, stack, timestamp }`
- `network`: `{ requestId, url, method, statusCode, duration, timestamp, requestHeaders, responseHeaders, requestBody, responseBody }`
- `websocket`: `{ url, data, direction, timestamp }`

### `get_network_request_detail`

**Purpose:** Full details for a single request (headers + bodies).

**Workflow:**
1. `query_buffer({ type: 'network', transform: ".filter(r => r.url.includes('api')).slice(-10).map(r => ({id: r.requestId, url: r.url}))" })` → Find interesting requests
2. `get_network_request_detail({ requestId: "xxx" })` → Get full payload

## Ollama Integration

Optional local LLM integration for offloading HTML analysis:

**Configuration:**
```bash
# Set in MCP server config (env vars)
OLLAMA_BASE_URL=http://192.168.210.31:11434  # Your Ollama server
OLLAMA_DEFAULT_MODEL=qwen2.5:7b               # Recommended model
```

**Tool:** `ollama_analyze_page(prompt, model?, tabId?)` - Sends page HTML to Ollama for analysis.

**Use cases:**
- Selector discovery for automation
- Large page content extraction without consuming Claude context
- Needle-in-haystack searches in complex DOMs

**Note:** Uses `temperature: 0` for deterministic outputs.

## Script Execution

Two script execution tools with different contexts:

### `execute_script` - Page Context
Run JavaScript with full DOM access. Use for data extraction, element manipulation, page state reading.

### `execute_background_script` - Extension Context
Run JavaScript in the extension's background with full `browser.*` API access. Use for:

```javascript
// Window management
browser.windows.update(windowId, { focused: true, drawAttention: true })

// System notifications
browser.notifications.create({ type: "basic", title: "Done", message: "Task complete" })

// Search history
browser.history.search({ text: "github", maxResults: 10 })

// Persistent storage (survives restarts)
await browser.storage.local.set({ key: value })
await browser.storage.local.get("key")

// Tab control
browser.tabs.update(tabId, { muted: true, pinned: true })
```

**NOT FOR:** DOM manipulation, page scraping (use `execute_script` instead).

## Extension Debug Bridge

Tools for debugging other Firefox extensions that implement the Tethernet debug bridge protocol.

### `check_debug_bridge` - Check if bridge is present

```typescript
check_debug_bridge({ tabId?, frameId? })
```

Returns:
- `{ present: true, version: 1, extensionId: '...', extensionName: '...', injectedAt: 1234567890 }` if bridge found
- `{ present: false }` if no bridge

### `query_extension_debug` - Query extension via debug bridge

```typescript
query_extension_debug({
  request?: { type: string, ... },  // Default: { type: 'getState' }
  timeout?: number,                  // Default: 5000ms
  tabId?: number,
  frameId?: number
})
```

**Standard request types:**
| Type | Description |
|------|-------------|
| `ping` | Health check, returns `{ ok: true, timestamp }` |
| `getState` | Extension-defined full state dump |
| `getErrors` | Array of recent errors/warnings |
| `getStorage` | `browser.storage.local` snapshot |
| `getManifest` | `{ name, version, permissions }` |

**Example workflow:**
```javascript
// Check if extension has debug bridge
check_debug_bridge()
// { present: true, version: 1, extensionId: 'myext@example.com', extensionName: 'My Extension' }

// Health check
query_extension_debug({ request: { type: 'ping' } })
// { ok: true, timestamp: 1234567890 }

// Get extension state
query_extension_debug({ request: { type: 'getState' } })
// { queue: [...], config: {...}, ... }

// Get errors with custom timeout
query_extension_debug({ request: { type: 'getErrors' }, timeout: 10000 })
// { errors: [{ type: 'error', msg: '...', stack: '...' }, ...] }
```

**Protocol:** Target extension must implement the debug bridge (see `firefox-extension-dev` agent, Section 11). The bridge uses CustomEvents on the page context to communicate.

## Development Notes

- Server logs go to stderr (stdout is reserved for MCP stdio protocol — never use `console.log` in server code)
- Port written to `~/.tethernet/port` on startup, deleted on shutdown
- Extension uses `[Tethernet]` prefix for console messages
- Content script uses IIFE with `window.__tethernet_injected` guard
- Extension WebSocket auto-reconnects every 2 seconds (only when a server URL is saved)
- Extension icon changes color based on connection state
- `tabId` must be at message root level (not nested in `data`)
- Each Claude Code session owns its own server process and port (1:1 binding)

## Testing the Extension

1. Load temporary extension: `about:debugging#/runtime/this-firefox`
2. Or use: `npm run ext:run`
3. Check Browser Console (Ctrl+Shift+J) for extension errors
4. Content script errors appear in page console

## Adding New MCP Tools

1. Add tool definition in `server/src/mcp/tools.ts`
2. Add handler case in `server/src/mcp/handlers.ts`
3. If needs content script: add case in `extension/content.js` handleCommand()
4. If needs content script: add to forward list in `extension/background.js`

## Tethernet Agent

A specialized Claude Code agent is provided for browser automation: `agents/tethernet-agent.md`

The agent contains:
- Detailed tool usage instructions and examples
- JavaScript patterns for data extraction, automation, waiting
- Payload guard handling (>50KB results)
- Long-running operation patterns with progress polling

**Installation:** Copy to `~/.claude/agents/` for global availability.

**MCP Server Instructions:** The `serverInstructions` in `server/src/server.ts` are kept minimal (just tool reference). Detailed guidance lives in the agent definition to reduce token overhead on every tool call.

## Adding New MCP Tools (Updated)

1. Add tool definition in `server/src/mcp/tools.ts`
2. Add handler case in `server/src/mcp/handlers.ts`
3. If needs content script: add case in `extension/content.js` handleCommand()
4. If needs content script: add to forward list in `extension/background.js`
5. **Update `agents/tethernet-agent.md`** with tool description and usage examples
6. Copy updated agent to `~/.claude/agents/tethernet-agent.md`

## Rendering HTML Reports in Browser

When user asks to create a report, render HTML, or display formatted data in the browser:

1. Write HTML content to a temp file: `/tmp/tethernet-report.html`
2. Navigate to it using `file:///tmp/tethernet-report.html`

```javascript
// Example workflow:
// 1. Use Bash/Write tool to create the HTML file
// 2. Use navigate tool to open it
navigate({ url: 'file:///tmp/tethernet-report.html' })
```

**Avoid:**
- Data URIs (Firefox blocks for top-level navigation)
- Injecting HTML into unrelated sites (like example.com)
- about:blank pages (no content script access)
