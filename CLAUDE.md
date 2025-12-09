# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FoxHole Debug Bridge connects Firefox to Claude Code via the Model Context Protocol (MCP). It consists of:
- **Firefox Extension** (Manifest V2) - Captures browser data and executes commands
- **MCP Server** (Node.js/TypeScript) - Bridges extension to Claude via stdio
- **WebSocket** - Connects extension to server on `ws://localhost:19888/extension`

## Commands

```bash
# Development
npm run dev              # Run server with hot reload (tsx watch)
npm run build            # Compile TypeScript
npm start                # Start production server
npm test                 # Run tests (vitest) - run from server/ directory

# Extension
npm run ext:run          # Run extension in Firefox with auto-reload
npm run ext:lint         # Lint extension with web-ext
npm run ext:build        # Build extension for distribution

# Single test file
cd server && npx vitest run src/mcp/handlers.test.ts
```

## Architecture

```
Firefox Extension                    MCP Server                    Claude Code
┌─────────────────┐                 ┌─────────────────┐           ┌───────────┐
│ background.js   │◄── WebSocket ──►│ extension.ts    │           │           │
│ content.js      │    :19888       │ handlers.ts     │◄── stdio ─►│  Claude   │
│ popup/devtools  │                 │ buffer/store.ts │           │           │
└─────────────────┘                 └─────────────────┘           └───────────┘
```

**Data Flow:**
1. Content script intercepts console/errors/WebSocket in page context
2. Background script captures network via webRequest API, manages tabs
3. Messages sent to server: `{ type, tabId, data }`
4. Server stores in per-tab buffers (BufferStore)
5. MCP tools expose data to Claude via stdio transport

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
- `server.ts` - Main setup: MCP server, WebSocket handler, tool registration
- `mcp/tools.ts` - 40+ tool definitions with JSON schemas
- `mcp/handlers.ts` - Tool implementation, routes commands to extension
- `connection/extension.ts` - WebSocket server, request/response correlation
- `buffer/store.ts` - Per-tab data storage with FIFO eviction
- `ollama/client.ts` - Ollama API client for local LLM analysis
- `utils/config.ts` - Port (19888), buffer limits, Ollama config

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

## Development Notes

- Server logs go to stderr (preserves stdio for MCP)
- Extension uses `[FoxHole]` prefix for console messages
- Content script uses IIFE with `window.__foxhole_injected` guard
- WebSocket auto-reconnects every 2 seconds
- Extension icon changes color based on connection state
- `tabId` must be at message root level (not nested in `data`)

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

## FoxHole Agent

A specialized Claude Code agent is provided for browser automation: `agents/foxhole.md`

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
5. **Update `agents/foxhole.md`** with tool description and usage examples
6. Copy updated agent to `~/.claude/agents/foxhole.md`
