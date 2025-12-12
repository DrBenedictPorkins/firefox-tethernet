# FoxHole Debug Bridge

Firefox debugging bridge for Claude Code via MCP (Model Context Protocol).

FoxHole allows Claude Code to see into and control your Firefox browser - console logs, network requests, DOM content, screenshots, and more through MCP tools.

## Why FoxHole? (vs Playwright/Puppeteer)

Playwright and Puppeteer spawn **new, isolated browser instances**. FoxHole connects to **your existing Firefox session**.

| | FoxHole | Playwright/Puppeteer |
|---|---------|---------------------|
| **Your logged-in sessions** | ✅ Already authenticated | ❌ Must handle auth flows |
| **Your extensions** | ✅ Ad blockers, password managers | ❌ Clean browser |
| **Your cookies/history** | ✅ Full profile access | ❌ Temporary profile |
| **Inspect any tab** | ✅ Tabs you opened manually | ❌ Only spawned tabs |
| **MCP native** | ✅ Built for Claude Code | ❌ Requires wrapper |

**Use Playwright** for: CI/CD, headless scraping, cross-browser testing, parallel execution.

**Use FoxHole** for: Personal automation, authenticated workflows, debugging your session, Claude Code integration.

*Example: Bulk-removing 400 YouTube "Watch Later" videos is trivial with FoxHole (you're already logged in) but requires complex auth handling with Playwright.*

## Architecture

```
Firefox Extension  ◄─── WebSocket ───►  FoxHole Server  ◄─── stdio ───►  Claude Code
  (background.js)       :19888              (Node.js)                      (MCP)
  (content.js)
```

The server runs as a child process of Claude Code using stdio transport. The Firefox extension connects via WebSocket on localhost:19888.

## Quick Start

```bash
# 1. Generate extension icons (requires rsvg-convert: brew install librsvg)
cd extension/icons && chmod +x generate-icons.sh && ./generate-icons.sh && cd ../..

# 2. Install and build
npm install && npm run build

# 3. Load extension in Firefox
#    Open about:debugging#/runtime/this-firefox → Load Temporary Add-on → extension/manifest.json
#    Or: npm run ext:run (auto-reload development mode)

# 4. Register with Claude Code (use absolute path)
claude mcp add foxhole -- node /path/to/foxhole-debug-bridge/server/dist/index.js
```

## Available MCP Tools

### Tab Management
| Tool | Description |
|------|-------------|
| `list_tabs` | List all open browser tabs |
| `get_active_tab` | Get currently focused tab |
| `set_primary_tab` | Set default tab for operations |
| `get_primary_tab` | Get current primary tab |
| `create_tab` | Open new tab with URL |
| `close_tab` | Close a tab |
| `switch_tab` | Focus a tab |

### Navigation
| Tool | Description |
|------|-------------|
| `navigate` | Go to URL |
| `reload_page` | Reload (optional cache bypass) |
| `go_back` / `go_forward` | Browser history |
| `wait_for_navigation` | Wait for page load |

### Console & Errors
| Tool | Description |
|------|-------------|
| `get_console_logs` | Get captured console output (filter by level, limit) |
| `get_js_errors` | Get JavaScript errors |

### Network
| Tool | Description |
|------|-------------|
| `get_network_requests` | Get request summaries (filter, limit, transform for custom projections) |
| `get_network_request_detail` | Get full request/response with headers and bodies |
| `get_websocket_messages` | Get WebSocket traffic |

### DOM & Content
| Tool | Description |
|------|-------------|
| `get_page_content` | Get full page HTML |
| `get_dom_snapshot` | Get DOM snapshots from buffer |
| `query_selector` | Find elements by CSS selector |
| `get_element_properties` | Get element properties (tagName, textContent, etc.) |
| `wait_for_element` | Wait for element to appear |

### Interaction
| Tool | Description |
|------|-------------|
| `click_element` | Click element by selector |
| `type_text` | Type into input field |
| `fill_form` | Fill multiple form fields |
| `scroll_to` | Scroll to position or element |

### Script Execution
| Tool | Description |
|------|-------------|
| `execute_script` | Run JavaScript in page context |
| `evaluate_expression` | Evaluate JS expression and return result |

### Storage & Cookies
| Tool | Description |
|------|-------------|
| `get_local_storage` / `set_local_storage` | localStorage access |
| `get_session_storage` | sessionStorage access |
| `get_cookies` / `set_cookie` | Cookie management |

### Screenshots
| Tool | Description |
|------|-------------|
| `take_screenshot` | Capture visible viewport |
| `get_screenshots` | Get screenshots from buffer |

### Advanced
| Tool | Description |
|------|-------------|
| `set_request_headers` | Add custom headers to requests |
| `block_urls` | Block URLs matching patterns |
| `get_buffer_stats` | View buffer usage per tab |
| `clear_buffer` | Clear captured data |
| `get_connection_status` | Check extension connection |

## Verification

After setup, verify:

1. **Extension**: Click toolbar icon → should show "Connected" (green)
2. **Background**: `about:debugging` → Inspect extension → Console shows `[FoxHole] Connected to server`
3. **Content Script**: Open any page → DevTools Console shows `[FoxHole] Content script initialized`

## Development

```bash
# Server
npm run dev          # Hot reload development
npm run build        # Compile TypeScript
npm test             # Run tests (from server/ directory)

# Extension
npm run ext:run      # Firefox with auto-reload
npm run ext:lint     # Validate extension
npm run ext:build    # Package for distribution
```

## Configuration

**Server Port:** 19888 (WebSocket endpoint: `ws://localhost:19888/extension`)

**Buffer Limits (per tab):**
| Type | Limit |
|------|-------|
| Console logs | 1000 |
| Network requests | 500 |
| WebSocket messages | 500 |
| JS errors | 200 |
| DOM snapshots | 10 |
| Screenshots | 5 |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Extension won't load | Generate icons: `cd extension/icons && ./generate-icons.sh` |
| Not connecting | Check port 19888 available; check `about:debugging` console |
| Content script missing | Reload page after extension load; check protected pages (about:*, addons.mozilla.org) |
| Console logs not captured | Ensure `tabId` at message root level; reload extension |

## Requirements

- **Firefox:** 91.0+
- **Node.js:** 18+
- **rsvg-convert:** For icons (`brew install librsvg`)

## Claude Code Agent

A specialized `foxhole` agent is provided for efficient browser automation. The agent includes:
- Detailed tool usage instructions
- JavaScript patterns for common tasks (data extraction, automation loops, waiting for elements)
- Best practices for token efficiency (payload guards, bounded results)
- Long-running operation patterns

**Location:** `agents/foxhole.md`

**Installation:** Copy to `~/.claude/agents/foxhole.md` to make available globally:
```bash
cp agents/foxhole.md ~/.claude/agents/
```

The agent uses the `haiku` model by default for cost efficiency.

## Security

FoxHole provides full browser control. Use only on local development machines.

- Localhost only (no external connections)
- Isolated content script context
- No telemetry
- Open source

## License

MIT
