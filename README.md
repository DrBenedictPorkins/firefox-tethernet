# Tethernet Debug Bridge

Firefox debugging bridge for Claude Code via MCP (Model Context Protocol).

Tethernet allows Claude Code to see into and control your Firefox browser — console logs, network requests, DOM content, screenshots, and more through MCP tools.

## Why Tethernet? (vs Playwright/Puppeteer)

Playwright and Puppeteer spawn **new, isolated browser instances**. Tethernet connects to **your existing Firefox session**.

| | Tethernet | Playwright/Puppeteer |
|---|---------|---------------------|
| **Your logged-in sessions** | ✅ Already authenticated | ❌ Must handle auth flows |
| **Your extensions** | ✅ Ad blockers, password managers | ❌ Clean browser |
| **Your cookies/history** | ✅ Full profile access | ❌ Temporary profile |
| **Inspect any tab** | ✅ Tabs you opened manually | ❌ Only spawned tabs |
| **MCP native** | ✅ Built for Claude Code | ❌ Requires wrapper |

**Use Playwright** for: CI/CD, headless scraping, cross-browser testing, parallel execution.

**Use Tethernet** for: Personal automation, authenticated workflows, debugging your session, Claude Code integration.

*Example: Bulk-removing 400 YouTube "Watch Later" videos is trivial with Tethernet (you're already logged in) but requires complex auth handling with Playwright.*

## Quick Start

### 1. Load extension in Firefox

```
about:debugging → This Firefox → Load Temporary Add-on → extension/manifest.json
```

Or run with auto-reload: `npm run ext:run`

### 2. Build & register server

```bash
cd server && npm install && npm run build

# Register with Claude Code (use your actual path)
claude mcp add tethernet -- node /path/to/tethernet-debug-bridge/server/dist/index.js
```

### 3. Connect extension to your session

Each Claude Code session gets a dynamic port. After opening a session:

```
> get_connection_info
```

Returns e.g. `ws://localhost:54321/extension` — enter `localhost:54321` in the Tethernet extension popup and click **Connect**. The icon turns green when connected.

### 4. Verify

```
> list_tabs
```

---

## Architecture

```
Firefox Extension  ◄── WebSocket (dynamic port) ──►  MCP Server  ◄── stdio ──►  Claude Code
  (background.js)                                      (Node.js)
  (content.js)
```

The server is spawned by Claude Code as a child process (stdio transport). Each session gets its own server process and an OS-assigned WebSocket port — explicit 1:1 binding between Claude session and Firefox window. The assigned port is written to `~/.tethernet/port` and exposed via the `get_connection_info` tool.

## Repository Structure

```
tethernet-debug-bridge/
├── extension/          # Firefox extension (Manifest V2)
│   ├── background.js   # WebSocket client, command routing, network capture
│   ├── content.js      # Console/error interception, DOM manipulation
│   ├── popup/          # Extension popup with host:port connect UI
│   └── manifest.json
├── server/             # MCP server (Node.js/TypeScript)
│   ├── src/
│   │   ├── server.ts           # stdio transport, startup, shutdown
│   │   ├── connection/
│   │   │   └── extension.ts   # WebSocket server (dynamic port)
│   │   ├── mcp/
│   │   │   ├── tools.ts       # Tool definitions
│   │   │   └── handlers.ts    # Tool implementations
│   │   └── utils/config.ts    # Buffer limits, WebSocket config
│   └── README.md
├── agents/
│   └── tethernet-agent.md  # Claude Code agent for browser automation
└── CLAUDE.md             # Development guide
```

## Development

```bash
# Server
cd server
npm run dev     # Hot reload
npm run build   # Compile
npm test        # Run tests

# Extension
npm run ext:run    # Firefox with auto-reload
npm run ext:lint   # Lint
npm run ext:build  # Package for distribution
```

## MCP Tools

40+ tools across: tab management, navigation, DOM inspection, script execution, network monitoring, screenshots, storage/cookies, and more.

Key tools:
- `get_connection_info` — get the port to enter in the extension popup
- `execute_script` — run JavaScript in page context
- `get_dom_structure` — progressive DOM exploration (preferred over full HTML)
- `query_buffer` — query console/network/error/websocket data with JS transforms
- `take_screenshot` — capture page to file

See `server/README.md` for the full tool reference.
