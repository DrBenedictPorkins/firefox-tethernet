# Tethernet — Development Guide

For end-user installation, see the [main README](README.md).

## Prerequisites

- Node.js 18+
- Firefox
- Claude Code CLI (`claude`)

## Clone and Build

```bash
git clone https://github.com/DrBenedictPorkins/tethernet-debug-bridge.git
cd tethernet-debug-bridge
```

### Quick setup (recommended)

```bash
./install.sh
```

The script:
1. Registers the MCP server with Claude Code via npx (`claude mcp add tethernet --scope user`)
2. Copies `agents/tethernet-agent.md` → `~/.claude/agents/`
3. Appends the Tethernet routing block to `~/.claude/CLAUDE.md`
4. Configures Claude Desktop if installed (macOS/Windows)

Re-run at any time to update — prompts before overwriting existing installs.

### Manual setup

**MCP server — Claude Code:**
```bash
claude mcp add tethernet --scope user -- npx -y @drbenedictporkins/tethernet-mcp
```

**MCP server — Claude Desktop:**

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "tethernet": {
      "command": "npx",
      "args": ["-y", "@drbenedictporkins/tethernet-mcp"]
    }
  }
}
```

**Tethernet agent:**
```bash
mkdir -p ~/.claude/agents
cp agents/tethernet-agent.md ~/.claude/agents/tethernet-agent.md
```

**CLAUDE.md routing block** — append to `~/.claude/CLAUDE.md`:
```markdown
## Tethernet Browser Automation

**CRITICAL: NEVER call `mcp__tethernet__*` tools directly from the main agent. ALWAYS delegate to the `tethernet` subagent.**

The only tools the main agent may call directly:
- `get_connection_info` — get WebSocket port for the current session
- `get_connection_status` — check if extension is connected

All other tools (navigate, execute_script, click, DOM inspection, screenshots, etc.) must go through the `tethernet` subagent, which enforces mandatory SPA detection and co-pilot mode.

**Port is dynamic per session.** Always call `get_connection_info` for the current port — never use a cached value from conversation history.
```

## Loading the Extension Locally

For development (auto-reload on file changes):
```bash
npm run ext:run
```

Or load manually:
```
about:debugging → This Firefox → Load Temporary Add-on → extension/manifest.json
```

## Server Development

```bash
cd server
npm install
npm run dev     # Hot reload with tsx watch
npm run build   # Compile TypeScript → dist/
npm test        # Run tests (vitest)
```

Build output goes to `server/dist/`. To point Claude Code at your local build instead of npx:

```bash
claude mcp remove tethernet
claude mcp add tethernet --scope user -- node /path/to/tethernet-debug-bridge/server/dist/index.js
```

## Extension Development

```bash
npm run ext:run    # Firefox with auto-reload (web-ext)
npm run ext:lint   # Lint with web-ext
npm run ext:build  # Package zip for AMO submission
```

## Repository Structure

```
tethernet-debug-bridge/
├── extension/              # Firefox extension (Manifest V2)
│   ├── background.js       # WebSocket client, command routing, network capture
│   ├── content.js          # Console/error interception, DOM manipulation
│   ├── popup/              # Extension popup UI
│   └── manifest.json
├── server/                 # MCP server (Node.js/TypeScript)
│   ├── src/
│   │   ├── server.ts               # stdio transport, startup, shutdown
│   │   ├── connection/extension.ts # WebSocket server (dynamic port)
│   │   ├── mcp/tools.ts            # Tool definitions
│   │   ├── mcp/handlers.ts         # Tool implementations
│   │   └── utils/config.ts         # Buffer limits, WebSocket config
│   └── README.md                   # npm package README (tool reference)
├── agents/
│   └── tethernet-agent.md  # Claude Code subagent for browser automation
├── install.sh              # One-shot setup script
└── CLAUDE.md               # Project guide for Claude Code
```

## Adding New MCP Tools

1. Add tool definition in `server/src/mcp/tools.ts`
2. Add handler case in `server/src/mcp/handlers.ts`
3. If it needs the content script: add case in `extension/content.js` `handleCommand()`
4. If it needs the content script: add to the forward list in `extension/background.js`
5. Update `agents/tethernet-agent.md` with tool description and examples
6. Copy updated agent: `cp agents/tethernet-agent.md ~/.claude/agents/tethernet-agent.md`

## Publishing

**npm (MCP server):**
```bash
cd server
npm version patch
npm run build
npm publish --access public
```

**AMO (Firefox extension):**
```bash
npm run ext:build   # generates web-ext-artifacts/tethernet-*.zip
# Upload zip at addons.mozilla.org/developers
```
