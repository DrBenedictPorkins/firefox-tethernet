# Tethernet - Firefox Extension

Firefox extension that connects to the Tethernet MCP server, giving Claude Code live access to your browser session.

## Features

- **WebSocket Connection**: Connects to the Tethernet MCP server on a user-configured port with auto-reconnect
- **Console Capture**: Intercepts all console methods (log, warn, error, info, debug)
- **Network Monitoring**: Captures HTTP requests and responses via webRequest API
- **JavaScript Errors**: Captures window errors and unhandled promise rejections
- **WebSocket Interception**: Monitors WebSocket send/receive messages
- **Remote Control**: Execute commands from server (navigation, DOM manipulation, screenshots, etc.)
- **Cookie Management**: Get, set, and delete cookies
- **Storage Access**: Read/write localStorage and sessionStorage

## Installation

### Development Mode

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `manifest.json` from the `extension/` directory

### Using web-ext (from repo root)

```bash
npm run ext:run    # Firefox with auto-reload
npm run ext:lint   # Lint
npm run ext:build  # Package for distribution
```

## Connecting to a Session

The extension does **not** auto-connect. Each Claude Code session gets a dynamic port — you connect explicitly:

1. Start a Claude Code session (Tethernet MCP server spawns automatically)
2. Call `get_connection_info` in Claude Code → get `localhost:PORT`
3. Click the Tethernet toolbar icon → enter `localhost:PORT` → click **Connect**
4. Icon turns green when connected

The server URL is saved in `browser.storage.local` and restored on browser restart.

## File Structure

```
extension/
├── manifest.json           # Extension manifest (Manifest V2)
├── background.js           # Background script: WebSocket, command routing, network capture
├── content.js              # Content script: console/error interception, DOM commands
├── popup/
│   ├── popup.html          # Browser action popup
│   ├── popup.css           # Popup styles
│   └── popup.js            # Popup logic (connect UI, status display)
├── devtools/
│   ├── devtools.html
│   ├── devtools.js
│   ├── panel.html
│   ├── panel.css
│   └── panel.js
└── icons/
    ├── icon.svg             # Source icon (disconnected)
    ├── icon-connected.svg   # Source icon (connected)
    ├── generate-icons.sh    # Icon generation script
    └── icon-*.png           # Generated PNG icons
```

## Architecture

### Background Script (`background.js`)

- Manages WebSocket connection to Tethernet MCP server
- Reads saved server URL from `browser.storage.local` on startup
- Handles `reconnect` messages from popup to switch server URL
- Routes server commands to content scripts or handles directly
- Captures network requests via webRequest API
- Tracks tab lifecycle events

### Content Script (`content.js`)

- Injected into all pages at `document_start`
- Guards against double-injection with `window.__tethernet_injected`
- Intercepts console methods without breaking page functionality
- Captures JavaScript errors and unhandled rejections
- Intercepts WebSocket constructor to monitor messages
- Handles DOM manipulation commands from background script

### Popup (`popup/`)

- Displays connection status and session info
- `host:port` input + Connect button to configure server URL
- Buffer stats (console, network, errors, WebSocket counts)
- Reload button for pages where content script needs injecting

## Server Commands

The extension handles these commands from the Tethernet MCP server:

### Tab Management
- `list_tabs`, `create_tab`, `close_tab`, `focus_tab`
- `navigate`, `reload_tab`, `go_back`, `go_forward`

### Inspection
- `take_screenshot`, `query_selector`, `get_computed_styles`
- `get_page_text`, `get_element_bounds`, `get_element_properties`

### Interaction
- `click_element`, `type_text`, `press_key`
- `scroll`, `scroll_to_element`, `hover_element`
- `focus_element`, `select_option`, `set_checkbox`

### Execution
- `execute_script` — run JavaScript in page context
- `execute_background_script` — run JavaScript in extension background context

### Storage
- `get_cookies`, `set_cookie`, `delete_cookie`
- `get_storage`, `set_storage`, `clear_storage`

### DOM
- `get_dom`, `get_dom_structure`, `dom_stats`, `get_page_content`

### Buffer Queries
- `query_buffer`, `get_network_request_detail`, `get_tab_buffer_summary`, `clear_buffer`

## Message Protocol

### Commands from server → extension

```javascript
{ action: 'navigate', params: { tabId: 123, url: 'https://...' }, requestId: 'uuid' }
```

### Responses extension → server

```javascript
{ requestId: 'uuid', result: any, error: string | null }
```

## Permissions

- `tabs` — access tab information
- `activeTab` — access active tab
- `webRequest` / `webRequestBlocking` — monitor and modify network requests
- `<all_urls>` — access all websites
- `storage` — persist server URL and settings
- `cookies` — access and modify cookies
- `webNavigation` — track navigation events
- `history`, `downloads`, `sessions`, `bookmarks` — background script access
- `notifications`, `clipboardRead`, `clipboardWrite` — utility access

## Debugging

**Background Script:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Find "Tethernet" → click **Inspect**

**Content Script:**
1. Open DevTools on target page (F12)
2. Look for `[Tethernet]` prefix in Console

### Common Issues

- **Extension not loading**: Check `manifest.json` syntax with `npm run ext:lint`
- **Content script not injecting**: Reload the page after loading the extension
- **Not connecting**: Ensure Claude Code session is active; call `get_connection_info` for the correct port
- **Icon stays gray after connecting**: Check background script console for WebSocket errors
