# Tethernet Debug Bridge

Firefox browser automation for Claude Code and Claude Desktop via MCP (Model Context Protocol).

Tethernet lets Claude see into and control your Firefox browser — console logs, network requests, DOM content, screenshots, and more through MCP tools.

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

### Option A: Install script (recommended)

```bash
./install.sh
```

The script does the following — run it once, re-run to update:

1. Builds the MCP server (`server/npm run build`)
2. Registers the server globally with Claude Code (`claude mcp add tethernet --scope user`)
3. Copies `agents/tethernet-agent.md` → `~/.claude/agents/tethernet-agent.md`
4. Appends a minimal Tethernet block to `~/.claude/CLAUDE.md` (controls how Claude routes browser automation tasks)
5. If Claude Desktop is installed, adds Tethernet to its MCP config automatically

If any component is already installed, the script asks whether to update it.

### Option B: Manual steps

**1. Build and register the MCP server**

```bash
cd server && npm install && npm run build

# Register globally with Claude Code (use your actual path)
claude mcp add tethernet --scope user -- node /path/to/firefox-tethernet/server/dist/index.js
```

**2. Install the tethernet agent**

```bash
mkdir -p ~/.claude/agents
cp agents/tethernet-agent.md ~/.claude/agents/tethernet-agent.md
```

The agent gives Claude instructions for browser automation: mandatory SPA detection, co-pilot mode fallback, and progressive DOM inspection patterns.

**3. Add routing rules to `~/.claude/CLAUDE.md`**

Append the following to `~/.claude/CLAUDE.md` (create the file if it doesn't exist):

```markdown
## Tethernet Browser Automation

**CRITICAL: NEVER call `mcp__tethernet__*` tools directly from the main agent. ALWAYS delegate to the `tethernet` subagent.**

The only tools the main agent may call directly:
- `get_connection_info` — get WebSocket port for the current session
- `get_connection_status` — check if extension is connected

All other tools (navigate, execute_script, click, DOM inspection, screenshots, etc.) must go through the `tethernet` subagent, which enforces mandatory SPA detection and co-pilot mode.

**Port is dynamic per session.** Always call `get_connection_info` for the current port — never use a cached value from conversation history.
```

**4. Claude Desktop (optional)**

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tethernet": {
      "command": "node",
      "args": ["/path/to/firefox-tethernet/server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop after saving.

**5. Load the extension in Firefox**

```
about:debugging → This Firefox → Load Temporary Add-on → extension/manifest.json
```

Or with auto-reload: `npm run ext:run`

### Connecting each session

Each Claude Code session gets a dynamic port. After opening a session:

```
> get_connection_info
```

Returns e.g. `ws://localhost:54321/extension` — enter `localhost:54321` in the Tethernet extension popup and click **Connect**. The icon turns green when connected.

Verify with:

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

The server is spawned by Claude Code as a child process (stdio transport). Each session gets its own server process and an OS-assigned WebSocket port — explicit 1:1 binding between Claude session and Firefox window. The assigned port is exposed via the `get_connection_info` tool.

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
