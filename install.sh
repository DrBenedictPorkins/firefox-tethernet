#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIST="$SCRIPT_DIR/server/dist/index.js"
AGENT_SRC="$SCRIPT_DIR/agents/tethernet-agent.md"
AGENT_DST="$HOME/.claude/agents/tethernet-agent.md"
CLAUDE_MD="$HOME/.claude/CLAUDE.md"
CLAUDE_AGENTS_DIR="$HOME/.claude/agents"

step()  { echo "==> $1"; }
ok()    { echo "    [ok] $1"; }
warn()  { echo "    [!!] $1"; }

ask_update() {
  printf "    [??] %s already installed. Update? [y/N] " "$1"
  read -r -n 1 answer
  echo
  [[ "$answer" =~ ^[Yy]$ ]]
}

# ── Preflight ──────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "[err] node not found. Install Node.js first." && exit 1
fi
if ! command -v claude &>/dev/null; then
  echo "[err] claude CLI not found. Install Claude Code first." && exit 1
fi

# ── Step 1: Build server ───────────────────────────────────────────────────
step "Building server..."
if [ -f "$SERVER_DIST" ]; then
  if ask_update "Server build"; then
    (cd "$SCRIPT_DIR/server" && npm run build)
    ok "Server rebuilt"
  else
    ok "Skipped"
  fi
else
  (cd "$SCRIPT_DIR/server" && npm install && npm run build)
  ok "Server built → $SERVER_DIST"
fi

# ── Step 2: Register MCP server (global) ──────────────────────────────────
step "Registering MCP server with Claude Code (global)..."
if claude mcp list 2>/dev/null | grep -q "tethernet"; then
  if ask_update "MCP server 'tethernet'"; then
    claude mcp remove tethernet 2>/dev/null || true
    claude mcp add tethernet --scope user -- node "$SERVER_DIST"
    ok "MCP server updated"
  else
    ok "Skipped"
  fi
else
  claude mcp add tethernet --scope user -- node "$SERVER_DIST"
  ok "MCP server registered globally"
fi

# ── Step 3: Install tethernet agent ───────────────────────────────────────
step "Installing tethernet agent..."
mkdir -p "$CLAUDE_AGENTS_DIR"
if [ -f "$AGENT_DST" ]; then
  if ask_update "~/.claude/agents/tethernet-agent.md"; then
    cp "$AGENT_SRC" "$AGENT_DST"
    ok "Agent updated"
  else
    ok "Skipped"
  fi
else
  cp "$AGENT_SRC" "$AGENT_DST"
  ok "Agent installed → $AGENT_DST"
fi

# ── Step 4: Inject block into ~/.claude/CLAUDE.md ─────────────────────────
step "Configuring ~/.claude/CLAUDE.md..."
touch "$CLAUDE_MD"

BLOCK_FILE=$(mktemp)
cat > "$BLOCK_FILE" << 'BLOCK'
<!-- tethernet-start -->
## Tethernet Browser Automation

**CRITICAL: NEVER call `mcp__tethernet__*` tools directly from the main agent. ALWAYS delegate to the `tethernet` subagent.**

The only tools the main agent may call directly:
- `get_connection_info` — get WebSocket port for the current session
- `get_connection_status` — check if extension is connected

All other tools (navigate, execute_script, click, DOM inspection, screenshots, etc.) must go through the `tethernet` subagent, which enforces mandatory SPA detection and co-pilot mode.

**Port is dynamic per session.** Always call `get_connection_info` for the current port — never use a cached value from conversation history.
<!-- tethernet-end -->
BLOCK

if grep -q '<!-- tethernet-start -->' "$CLAUDE_MD"; then
  if ask_update "Tethernet block in ~/.claude/CLAUDE.md"; then
    awk -v bf="$BLOCK_FILE" '
      /<!-- tethernet-start -->/ {
        while ((getline line < bf) > 0) print line
        close(bf)
        in_block=1; next
      }
      /<!-- tethernet-end -->/ { in_block=0; next }
      !in_block { print }
    ' "$CLAUDE_MD" > /tmp/tethernet_claude_md && mv /tmp/tethernet_claude_md "$CLAUDE_MD"
    ok "CLAUDE.md block updated"
  else
    ok "Skipped"
  fi
else
  echo >> "$CLAUDE_MD"
  cat "$BLOCK_FILE" >> "$CLAUDE_MD"
  ok "Tethernet block added to ~/.claude/CLAUDE.md"
fi

rm "$BLOCK_FILE"

# ── Step 5: Claude Desktop (optional) ─────────────────────────────────────
DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

if [ -f "$DESKTOP_CONFIG" ]; then
  step "Configuring Claude Desktop..."
  if python3 -c "import json; d=json.load(open('$DESKTOP_CONFIG')); exit(0 if 'tethernet' in d.get('mcpServers',{}) else 1)" 2>/dev/null; then
    if ask_update "Tethernet in Claude Desktop"; then
      python3 << PYEOF
import json
path = "$DESKTOP_CONFIG"
with open(path) as f: d = json.load(f)
d.setdefault('mcpServers', {})['tethernet'] = {"command": "node", "args": ["$SERVER_DIST"]}
with open(path, 'w') as f: json.dump(d, f, indent=2)
PYEOF
      ok "Claude Desktop updated — restart Claude Desktop"
    else
      ok "Skipped"
    fi
  else
    python3 << PYEOF
import json
path = "$DESKTOP_CONFIG"
with open(path) as f: d = json.load(f)
d.setdefault('mcpServers', {})['tethernet'] = {"command": "node", "args": ["$SERVER_DIST"]}
with open(path, 'w') as f: json.dump(d, f, indent=2)
PYEOF
    ok "Tethernet added to Claude Desktop — restart Claude Desktop"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────
echo
echo "Tethernet installed."
echo
echo "Next steps:"
echo "  1. Load the extension in Firefox:  npm run ext:run"
echo "  2. In Claude Code, call get_connection_info to get the port"
echo "  3. In the extension popup, enter localhost:PORT and click Connect"
