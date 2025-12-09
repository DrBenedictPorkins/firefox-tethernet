# FoxHole Debug Bridge - Firefox Extension

This Firefox extension connects to the FoxHole server for remote debugging, automation, and testing.

## Features

- **WebSocket Connection**: Connects to ws://localhost:19888/extension with auto-reconnect
- **Console Capture**: Intercepts all console methods (log, warn, error, info, debug)
- **Network Monitoring**: Captures HTTP requests and responses via webRequest API
- **JavaScript Errors**: Captures window errors and unhandled promise rejections
- **WebSocket Interception**: Monitors WebSocket send/receive messages
- **Remote Control**: Execute commands from server (navigation, DOM manipulation, screenshots, etc.)
- **Cookie Management**: Get, set, and delete cookies
- **Storage Access**: Read/write localStorage and sessionStorage

## Installation

### Development Mode

1. Generate icons first:
   ```bash
   cd extension/icons
   chmod +x generate-icons.sh
   ./generate-icons.sh
   ```

2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`

3. Click "Load Temporary Add-on"

4. Select the `manifest.json` file in the `extension/` directory

### Using web-ext

```bash
npm install -g web-ext
cd extension
web-ext run
```

## File Structure

```
extension/
├── manifest.json           # Extension manifest (Manifest V2)
├── background.js          # Background script (persistent)
├── content.js             # Content script (injected at document_start)
├── popup/
│   ├── popup.html        # Browser action popup
│   ├── popup.css         # Popup styles
│   └── popup.js          # Popup logic
├── devtools/
│   ├── devtools.html     # DevTools page
│   ├── devtools.js       # DevTools registration
│   ├── panel.html        # DevTools panel
│   ├── panel.css         # Panel styles
│   └── panel.js          # Panel logic
└── icons/
    ├── icon.svg          # Source icon (disconnected)
    ├── icon-connected.svg # Source icon (connected)
    ├── generate-icons.sh # Icon generation script
    └── icon-*.png        # Generated PNG icons
```

## Architecture

### Background Script (background.js)

- Manages WebSocket connection to server
- Handles server commands and routes them appropriately
- Captures network requests via webRequest API
- Tracks tab lifecycle events
- Coordinates communication between server and content scripts

### Content Script (content.js)

- Injected into all pages at document_start
- Intercepts console methods without breaking page functionality
- Captures JavaScript errors and unhandled rejections
- Intercepts WebSocket constructor to monitor messages
- Handles DOM manipulation commands from background script

### Popup (popup/)

- Displays connection status
- Shows server URL
- Provides quick access to extension info

### DevTools (devtools/)

- Placeholder for future DevTools panel
- Will display captured logs, network requests, errors

## Server Commands

The extension handles these commands from the server:

### Tab Management
- `list_tabs` - Get all open tabs
- `create_tab` - Create new tab
- `close_tab` - Close a tab
- `focus_tab` - Focus a tab
- `navigate` - Navigate to URL
- `reload_tab` - Reload a tab
- `go_back` - Go back in history
- `go_forward` - Go forward in history

### Inspection
- `take_screenshot` - Capture visible tab
- `get_dom` - Get full DOM HTML
- `query_selector` - Query DOM elements
- `get_computed_styles` - Get element styles
- `get_page_text` - Get page text content
- `get_element_bounds` - Get element position/size

### Interaction
- `click_element` - Click on element
- `type_text` - Type into input field
- `press_key` - Simulate key press
- `scroll` - Scroll page
- `scroll_to_element` - Scroll element into view
- `hover_element` - Hover over element
- `focus_element` - Focus element
- `select_option` - Select dropdown option
- `set_checkbox` - Set checkbox state

### Execution
- `execute_script` - Execute JavaScript in page context

### Storage
- `get_cookies` - Get cookies for URL
- `set_cookie` - Set a cookie
- `delete_cookie` - Delete a cookie
- `get_storage` - Get localStorage/sessionStorage
- `set_storage` - Set storage item
- `clear_storage` - Clear storage

## Message Format

### Messages to Server

```javascript
{
  type: 'console_log' | 'network_request' | 'js_error' | 'websocket_message' | 'tab_created' | 'tab_closed' | 'tab_updated',
  data: {
    // Type-specific data
    tabId: number,
    url: string,
    frameId: number,
    // ... additional fields
  }
}
```

### Commands from Server

```javascript
{
  action: 'navigate' | 'click_element' | ...,
  params: {
    tabId: number,
    // ... action-specific parameters
  },
  requestId: 'unique-id'
}
```

### Responses to Server

```javascript
{
  requestId: 'unique-id',
  result: any,        // Command result
  error: string | null // Error message if failed
}
```

## Permissions

The extension requires these permissions:

- `tabs` - Access tab information
- `activeTab` - Access active tab
- `webRequest` - Monitor network requests
- `webRequestBlocking` - Modify network requests
- `<all_urls>` - Access all websites
- `storage` - Store extension data
- `cookies` - Access and modify cookies
- `clipboardRead` - Read clipboard
- `clipboardWrite` - Write to clipboard
- `notifications` - Show notifications
- `webNavigation` - Track navigation events

## Security Notes

- All communication with server is over localhost WebSocket
- Content scripts run in isolated context (cannot access page JavaScript directly)
- Console/WebSocket interception uses IIFE to avoid polluting page scope
- Extension validates all messages and handles context invalidation
- No external dependencies or CDN resources

## Browser Compatibility

- Minimum Firefox version: 91.0
- Uses Manifest V2 (Firefox standard)
- Uses `browser.*` API namespace (Firefox WebExtension API)
- Persistent background page (standard in MV2)

## Development

### Debugging

**Background Script:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Find "FoxHole Debug Bridge"
3. Click "Inspect"

**Content Script:**
1. Open DevTools on target webpage (F12)
2. Content script logs appear in Console
3. Look for `[FoxHole]` prefix

**Network Monitoring:**
- Check Network tab to see captured requests
- Background page network is separate from content page

### Common Issues

- **Extension not loading**: Check manifest.json syntax with `web-ext lint`
- **Content script not injecting**: Verify permissions in manifest.json
- **Messages not sending**: Check if extension context is still valid
- **WebSocket not connecting**: Ensure server is running on port 19888

## License

Part of the FoxHole Debug Bridge project.
