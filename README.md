# Tethernet

Claude as your browser co-pilot — guides you through complex web workflows step by step, in your real Firefox session.

App Store Connect. AWS Console. Stripe. DNS records. Government forms. Tethernet lets Claude see your screen, read the current page state, and tell you exactly what to click next — while you stay in control of your logged-in browser.

## The Problem

Complex web workflows are painful:

- You're juggling 10 documentation tabs while filling out a form
- One wrong step means starting over
- The UI changes, the docs are outdated, you're guessing
- Automation fails because the site needs your real session, 2FA, or human judgment

**Tethernet makes Claude your navigator.** You drive, Claude knows the route.

## How It Works

1. Claude takes a screenshot — sees exactly what you see
2. Claude reads the page state (DOM, network responses, error messages)
3. Claude tells you: *"Click the blue '+' button in the top-right corner"*
4. You click it in your real, logged-in browser
5. Claude confirms it worked and gives you the next step

No scripted automation that breaks on page changes. No re-authenticating. No handing credentials to a bot. You stay in control; Claude handles the complexity.

## Real Use Cases

**Apple Developer / App Store Connect**
Register a new iOS app, set up provisioning profiles, configure entitlements, navigate TestFlight — flows that normally require reading 5 Apple docs simultaneously.

**AWS Console**
Create IAM roles with the right permissions, set up VPC security groups, configure S3 bucket policies — without getting lost in the endless settings panels.

**Stripe**
Set up webhook endpoints, create products and pricing, configure customer portal settings — step by step, with Claude verifying each response.

**DNS Management**
Add CNAME, TXT, MX records across any registrar (Cloudflare, Route53, Namecheap) — Claude reads your current records and tells you exactly what to add.

**Enterprise SaaS Onboarding**
Any multi-step setup flow with conditional branches, verification steps, and obscure configuration options.

**Government / Compliance Forms**
Complex forms where one wrong answer affects subsequent questions — Claude reads ahead and guides each field.

## Why Not Playwright or Puppeteer?

Playwright and Puppeteer spawn new, isolated browser instances. Tethernet connects to **your existing Firefox session**.

| | Tethernet | Playwright/Puppeteer |
|---|---------|---------------------|
| **Your logged-in sessions** | ✅ Already authenticated | ❌ Must handle auth flows |
| **2FA / CAPTCHA flows** | ✅ You handle it, Claude guides | ❌ Automation breaks here |
| **Your extensions** | ✅ Ad blockers, password managers | ❌ Clean browser |
| **Sensitive actions** | ✅ Human confirms each step | ❌ Bot executes blindly |
| **Dynamic / SPA sites** | ✅ Screenshot-based, always works | ❌ Selector fragility |
| **MCP native** | ✅ Built for Claude Code | ❌ Requires wrapper |

**Use Playwright** for: CI/CD pipelines, headless scraping, automated regression tests, parallel execution.

**Use Tethernet** for: Authenticated workflows, complex setup flows, anything that needs your real session and human judgment at key steps.

## Installation

**Step 1 — Install the Firefox extension**

[Get Tethernet on Firefox Add-ons (AMO)](https://addons.mozilla.org/en-US/firefox/addon/tethernet/)

**Step 2 — Register the MCP server**

*Claude Code:*
```bash
claude mcp add tethernet --scope user -- npx -y @drbenedictporkins/tethernet-mcp
```

*Claude Desktop* — add to your config file and restart:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

> For contributors and developers: see [DEVELOPMENT.md](DEVELOPMENT.md) for clone/build instructions, local extension loading, and how to add new tools.

### Connecting each session

Each Claude Code session gets a dynamic port. After opening a session:

```
> get_connection_info
```

Returns e.g. `ws://127.0.0.1:54321/extension` — enter `127.0.0.1:54321` in the Tethernet extension popup and click **Connect**. The icon turns green when connected.

### Network interface (advanced)

By default the server binds to `127.0.0.1` (loopback only). To expose it on all interfaces — e.g. when Firefox runs on a different machine or VM — set the `TETHERNET_HOST` environment variable:

*Claude Code:*
```bash
claude mcp add tethernet --scope user -e TETHERNET_HOST=0.0.0.0 -- npx -y @drbenedictporkins/tethernet-mcp
```

*Claude Desktop config:*
```json
{
  "mcpServers": {
    "tethernet": {
      "command": "npx",
      "args": ["-y", "@drbenedictporkins/tethernet-mcp"],
      "env": {
        "TETHERNET_HOST": "0.0.0.0"
      }
    }
  }
}
```

Any valid bind address works (`0.0.0.0`, a specific LAN IP, etc.). The `get_connection_info` tool always returns the actual host and port to enter in the extension popup.

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

## MCP Tools

40+ tools across: tab management, navigation, DOM inspection, script execution, network monitoring, screenshots, storage/cookies, and more.

Key tools:
- `get_connection_info` — get the port to enter in the extension popup
- `execute_script` — run JavaScript in page context
- `get_dom_structure` — progressive DOM exploration (preferred over full HTML)
- `query_buffer` — query console/network/error/websocket data with JS transforms
- `take_screenshot` — capture page to file

See `server/README.md` for the full tool reference.

## Extension Debug Bridge

Tethernet can inspect the internal state of **other Firefox extensions** you're developing — live variable dumps, error logs, storage snapshots — without adding `console.log` everywhere.

### How it works

Your extension injects `window.__TETHERNET_DEBUG_BRIDGE` into the page context. Tethernet communicates with it via CustomEvents. Claude can then call `check_debug_bridge` and `query_extension_debug` to inspect your extension's state from Claude Code.

### Adding the bridge to your extension

In your extension's content script:

```javascript
// Inject bridge into page context (content scripts can't set window directly)
const script = document.createElement('script');
script.textContent = `(function() {
  // Identity — read by check_debug_bridge
  window.__TETHERNET_DEBUG_BRIDGE = {
    version: 1,
    extensionId: 'your-extension@yourdomain.com',
    extensionName: 'Your Extension Name',
    injectedAt: Date.now()
  };

  // Handle queries from Tethernet
  window.addEventListener('__tethernet_debug_request', (event) => {
    const { type } = event.detail;
    let response;

    switch (type) {
      case 'ping':
        response = { ok: true, timestamp: Date.now() };
        break;
      case 'getState':
        // Return whatever internal state is useful for debugging
        response = {
          status: window.__myExt?.status,
          queueLength: window.__myExt?.queue?.length,
          lastError: window.__myExt?.lastError,
        };
        break;
      case 'getErrors':
        response = { errors: window.__myExt?.errors || [] };
        break;
      case 'getManifest':
        response = { name: 'Your Extension', version: '1.0.0' };
        break;
      default:
        response = { error: 'Unknown request type: ' + type };
    }

    // Return response to Tethernet
    window.__tethernet_debug_response = response;
    window.dispatchEvent(new Event('__tethernet_debug_response'));
  });
})();`;
document.documentElement.appendChild(script);
script.remove();
```

### Using the bridge from Claude Code

```
> check_debug_bridge
{ present: true, version: 1, extensionName: "Your Extension", extensionId: "..." }

> query_extension_debug { "request": { "type": "ping" } }
{ ok: true, timestamp: 1234567890 }

> query_extension_debug { "request": { "type": "getState" } }
{ status: "idle", queueLength: 3, lastError: null }

> query_extension_debug { "request": { "type": "getErrors" } }
{ errors: [{ type: "error", msg: "Failed to fetch", stack: "..." }] }
```

### Note on `browser.storage`

Page-context scripts can't access `browser.storage` directly. To expose storage via the bridge, have your content script read from storage and cache the values into a page-context variable that your `getStorage` handler can return.
