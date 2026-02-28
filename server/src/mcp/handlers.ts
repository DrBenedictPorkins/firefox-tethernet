import { writeFile } from 'fs/promises';
import { join } from 'path';
import type { ConnectionManager } from '../connection/manager.js';
import type { MCPToolResult } from './types.js';
import { ollamaConfig } from '../utils/config.js';
import { checkOllamaConnection, ollamaGenerate } from '../ollama/client.js';

export class ToolHandlers {
  private primaryTabId: number | null = null;

  constructor(
    private sendToExtension: (action: string, params: any) => Promise<any>,
    private connectionManager: ConnectionManager,
    private wsPort: number
  ) {
    // Clear primaryTabId when extension disconnects
    this.connectionManager.onChange((state) => {
      if (!state.extensionConnected) {
        this.primaryTabId = null;
      }
    });
  }

  private getTargetTabId(requestedTabId?: number | string): number | null {
    if (requestedTabId !== undefined && requestedTabId !== null) {
      return Number(requestedTabId);
    }
    return this.primaryTabId;
  }

  private ensureTabId(requestedTabId?: number): number {
    const tabId = this.getTargetTabId(requestedTabId);
    if (tabId === null) {
      throw new Error('No tab specified and no primary tab set. Use set_primary_tab first.');
    }
    return tabId;
  }

  private success(data: any): MCPToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private error(message: string): MCPToolResult {
    return {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      isError: true,
    };
  }

  async handle(toolName: string, args: any): Promise<MCPToolResult> {
    try {
      switch (toolName) {
        // Tab Management
        case 'list_tabs': {
          const tabs = await this.sendToExtension('list_tabs', {});
          return this.success(tabs);
        }

        case 'get_active_tab': {
          const tabs = await this.sendToExtension('list_tabs', {});
          const activeTab = Array.isArray(tabs) ? tabs.find((t: any) => t.active) : null;
          return this.success(activeTab || null);
        }

        case 'switch_tab':
          await this.sendToExtension('focus_tab', { tabId: args.tabId });
          return this.success({ switched: true, tabId: args.tabId });

        case 'set_primary_tab':
          this.primaryTabId = args.tabId !== undefined ? Number(args.tabId) : null;
          return this.success({ primaryTabId: this.primaryTabId });

        case 'get_primary_tab':
          if (this.primaryTabId === null) {
            return this.success(null);
          }
          // Get tab info from extension
          const tabs = await this.sendToExtension('list_tabs', {});
          const tabInfo = Array.isArray(tabs) ? tabs.find((t: any) => t.id === this.primaryTabId) : null;
          return this.success({
            primaryTabId: this.primaryTabId,
            tabInfo,
          });

        case 'create_tab': {
          const result = await this.sendToExtension('create_tab', {
            url: args.url,
            active: args.active,
          });
          return this.success(result);
        }

        case 'close_tab':
          await this.sendToExtension('close_tab', { tabId: args.tabId });
          if (this.primaryTabId === args.tabId) {
            this.primaryTabId = null;
          }
          return this.success({ closed: true, tabId: args.tabId });

        // Navigation & Interaction
        case 'navigate': {
          const tabId = this.ensureTabId(args.tabId);
          await this.sendToExtension('navigate', { tabId, url: args.url });
          return this.success({ navigated: true, url: args.url });
        }

        case 'reload_page': {
          const tabId = this.ensureTabId(args.tabId);
          await this.sendToExtension('reload_tab', {
            tabId,
            bypassCache: args.bypassCache,
          });
          return this.success({ reloaded: true });
        }

        case 'go_back': {
          const tabId = this.ensureTabId(args.tabId);
          await this.sendToExtension('go_back', { tabId });
          return this.success({ navigated: 'back' });
        }

        case 'go_forward': {
          const tabId = this.ensureTabId(args.tabId);
          await this.sendToExtension('go_forward', { tabId });
          return this.success({ navigated: 'forward' });
        }

        // Buffer Query (consolidated) - Forward to extension
        case 'query_buffer': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('query_buffer', {
            tabId,
            type: args.type,
            transform: args.transform,
          });
          return this.success(result);
        }

        // Network Detail (single item lookup) - Forward to extension
        case 'get_network_request_detail': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('get_network_request_detail', {
            tabId,
            requestId: args.requestId,
          });
          return this.success(result);
        }

        // DOM & Content
        case 'list_frames': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('list_frames', { tabId });
          return this.success(result);
        }

        case 'dom_stats': {
          const tabId = this.ensureTabId(args.tabId);
          const includeTags = args.includeTags || false;
          const result = await this.sendToExtension('execute_script', {
            tabId,
            frameId: args.frameId,
            script: `(function() {
              const all = document.querySelectorAll('*');
              let maxDepth = 0;
              ${includeTags ? 'const byTag = {};' : ''}

              all.forEach(el => {
                ${includeTags ? "byTag[el.tagName] = (byTag[el.tagName] || 0) + 1;" : ''}
                let depth = 0, node = el;
                while (node.parentElement) { depth++; node = node.parentElement; }
                if (depth > maxDepth) maxDepth = depth;
              });

              ${includeTags ? "const sorted = Object.entries(byTag).sort((a,b) => b[1] - a[1]).slice(0, 15);" : ''}

              return {
                totalElements: all.length,
                maxDepth: maxDepth,
                htmlSize: document.documentElement.outerHTML.length,
                iframeCount: document.querySelectorAll('iframe').length,
                formCount: document.querySelectorAll('form').length,
                linkCount: document.querySelectorAll('a').length,
                imageCount: document.querySelectorAll('img').length${includeTags ? ",\n                topTags: Object.fromEntries(sorted)" : ''}
              };
            })()`,
          });
          return this.success(result?.result || result);
        }

        case 'get_page_content': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('get_dom', { tabId, frameId: args.frameId });
          return this.success(result);
        }

        case 'get_dom_structure': {
          const tabId = this.ensureTabId(args.tabId);
          const selector = args.selector || 'body';
          const maxDepth = args.depth ?? 2;

          const result = await this.sendToExtension('execute_script', {
            tabId,
            frameId: args.frameId,
            script: `(function() {
              const selector = ${JSON.stringify(selector)};
              const maxDepth = ${maxDepth};

              // Detect raw content (JSON/text/XML viewed directly in browser)
              const body = document.body;
              if (selector === 'body' && body.children.length === 1 && body.children[0].tagName === 'PRE') {
                const content = body.textContent || '';
                const size = content.length;
                let contentType = 'text';

                // Detect JSON
                const trimmed = content.trim();
                if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                    (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                  try {
                    JSON.parse(trimmed);
                    contentType = 'json';
                  } catch {}
                }
                // Detect XML
                else if (trimmed.startsWith('<?xml') || (trimmed.startsWith('<') && trimmed.includes('</'))) {
                  contentType = 'xml';
                }

                return {
                  raw_content: true,
                  contentType: contentType,
                  size: size,
                  preview: content.slice(0, 500) + (size > 500 ? '...' : ''),
                  hint: 'Use get_page_content for full payload, or query_buffer for network responses'
                };
              }

              // Attributes to include in output
              const showAttrs = ['id', 'class', 'role', 'data-testid', 'type', 'name', 'href', 'src'];

              function getAttrsString(el) {
                let attrs = '';
                for (const attr of showAttrs) {
                  let val = el.getAttribute(attr);
                  if (val) {
                    // Truncate long class lists
                    if (attr === 'class' && val.length > 60) {
                      val = val.slice(0, 57) + '...';
                    }
                    // Truncate long hrefs/srcs
                    if ((attr === 'href' || attr === 'src') && val.length > 80) {
                      val = val.slice(0, 77) + '...';
                    }
                    attrs += ' ' + attr + '="' + val.replace(/"/g, '&quot;') + '"';
                  }
                }
                return attrs;
              }

              function summarize(node, depth, indent) {
                // Skip non-element nodes at top level of output
                if (node.nodeType !== 1) return null;

                const el = node;
                const tag = el.tagName.toLowerCase();
                const attrs = getAttrsString(el);
                const spaces = '  '.repeat(indent);

                // Count direct element children
                const elementChildren = Array.from(el.children);
                const childCount = elementChildren.length;

                // Get direct text content (not from descendants)
                let directText = '';
                for (const child of el.childNodes) {
                  if (child.nodeType === 3) { // TEXT_NODE
                    directText += child.textContent;
                  }
                }
                directText = directText.trim();

                // Void elements (self-closing)
                const voidTags = ['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'];
                if (voidTags.includes(tag)) {
                  return spaces + '<' + tag + attrs + '/>';
                }

                // At max depth - summarize children
                if (depth >= maxDepth) {
                  if (childCount > 0) {
                    return spaces + '<' + tag + attrs + '><!-- ' + childCount + ' children --></' + tag + '>';
                  } else if (directText.length > 0) {
                    const preview = directText.length > 60 ? directText.slice(0, 57) + '...' : directText;
                    return spaces + '<' + tag + attrs + '>' + preview + '</' + tag + '>';
                  } else {
                    return spaces + '<' + tag + attrs + '></' + tag + '>';
                  }
                }

                // Recurse into children
                const childResults = [];
                for (const child of elementChildren) {
                  const result = summarize(child, depth + 1, indent + 1);
                  if (result) childResults.push(result);
                }

                // Build output
                if (childResults.length === 0) {
                  // No element children - show text if any
                  if (directText.length > 0) {
                    const preview = directText.length > 60 ? directText.slice(0, 57) + '...' : directText;
                    return spaces + '<' + tag + attrs + '>' + preview + '</' + tag + '>';
                  }
                  return spaces + '<' + tag + attrs + '></' + tag + '>';
                }

                return spaces + '<' + tag + attrs + '>\\n' + childResults.join('\\n') + '\\n' + spaces + '</' + tag + '>';
              }

              const root = document.querySelector(selector);
              if (!root) {
                return { error: 'Selector not found', selector: selector };
              }

              return {
                structure: summarize(root, 0, 0),
                selector: selector,
                depth: maxDepth
              };
            })()`,
          });

          // Return the structure as plain text for readability
          const data = result?.result || result;

          // Handle raw content detection
          if (data?.raw_content) {
            return {
              content: [{
                type: 'text',
                text: `Raw ${data.contentType.toUpperCase()} content detected (${data.size} bytes)\n\nPreview:\n${data.preview}\n\nHint: ${data.hint}`,
              }],
            };
          }

          if (data?.structure) {
            return {
              content: [{
                type: 'text',
                text: `DOM Structure (selector: ${data.selector}, depth: ${data.depth}):\n\n${data.structure}`,
              }],
            };
          }
          return this.success(data);
        }

        case 'get_dom_snapshot': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('get_dom_snapshot', { tabId });
          return this.success(result);
        }

        case 'query_selector': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('query_selector', {
            tabId,
            selector: args.selector,
            frameId: args.frameId,
          });
          return this.success(result);
        }

        case 'get_element_properties': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('get_element_properties', {
            tabId,
            selector: args.selector,
            properties: args.properties,
            frameId: args.frameId,
          });
          return this.success(result);
        }

        // Element Interaction
        case 'click_element': {
          const tabId = this.ensureTabId(args.tabId);
          await this.sendToExtension('click_element', {
            tabId,
            selector: args.selector,
            frameId: args.frameId,
          });
          return this.success({ clicked: true, selector: args.selector });
        }

        case 'type_text': {
          const tabId = this.ensureTabId(args.tabId);
          await this.sendToExtension('type_text', {
            tabId,
            selector: args.selector,
            text: args.text,
            frameId: args.frameId,
          });
          return this.success({ typed: true, selector: args.selector });
        }

        case 'fill_form': {
          const tabId = this.ensureTabId(args.tabId);
          // Extension doesn't have fill_form, so we iterate and type_text for each field
          const fields = args.fields as Record<string, string>;
          for (const [selector, value] of Object.entries(fields)) {
            await this.sendToExtension('type_text', {
              tabId,
              selector,
              text: value,
            });
          }
          return this.success({ filled: true, fieldCount: Object.keys(fields).length });
        }

        case 'scroll_to': {
          const tabId = this.ensureTabId(args.tabId);
          if (args.selector) {
            await this.sendToExtension('scroll_to_element', {
              tabId,
              selector: args.selector,
            });
          } else {
            await this.sendToExtension('scroll', {
              tabId,
              x: args.x,
              y: args.y,
            });
          }
          return this.success({ scrolled: true });
        }

        // Screenshots
        case 'take_screenshot': {
          const tabId = this.ensureTabId(args.tabId);

          // For base64 return, force JPEG to keep payload manageable
          const format = args.returnBase64 ? 'jpeg' : ((args.format as string) || 'png');
          const quality = args.returnBase64 ? 70 : (args.quality as number | undefined);

          const result = await this.sendToExtension('take_screenshot', {
            tabId,
            fullPage: args.fullPage,
            format,
            quality,
            cropTo: args.cropTo,
            selector: args.selector,
          });

          // result.dataUrl is a data URI: "data:image/jpeg;base64,..."
          const dataUrl = result.dataUrl as string;
          const base64Data = dataUrl.split(',')[1];

          // If returnBase64, return as MCP image content (rendered inline by Claude Desktop)
          if (args.returnBase64) {
            return {
              content: [{ type: 'image' as const, data: base64Data, mimeType: 'image/jpeg' }],
              isError: false,
            } as any;
          }

          // Default: save to file and return path (Claude Code uses Read tool to view)
          const timestamp = Date.now();
          const filename = `tethernet-screenshot-${timestamp}.${format}`;
          const filePath = (args.saveTo as string) || join('/tmp', filename);
          const buffer = Buffer.from(base64Data, 'base64');
          await writeFile(filePath, buffer);

          return this.success({ filePath, format, size: buffer.length });
        }

        case 'get_screenshots': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('get_screenshots', { tabId });
          return this.success(result);
        }

        // Storage & Cookies
        case 'get_local_storage': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('get_storage', {
            tabId,
            type: 'local',
          });
          return this.success(result?.data || {});
        }

        case 'get_session_storage': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('get_storage', {
            tabId,
            type: 'session',
          });
          return this.success(result?.data || {});
        }

        case 'set_local_storage': {
          const tabId = this.ensureTabId(args.tabId);
          await this.sendToExtension('set_storage', {
            tabId,
            type: 'local',
            key: args.key,
            value: args.value,
          });
          return this.success({ set: true, key: args.key });
        }

        case 'get_cookies': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('get_cookies', { tabId });
          return this.success(result);
        }

        case 'set_cookie': {
          const tabId = this.ensureTabId(args.tabId);
          // Get the tab URL to derive cookie URL if domain not provided
          const tabs = await this.sendToExtension('list_tabs', {});
          const tab = Array.isArray(tabs) ? tabs.find((t: any) => t.id === tabId) : null;
          const url = tab?.url || `https://${args.domain || 'localhost'}`;

          await this.sendToExtension('set_cookie', {
            tabId,
            cookie: {
              url,
              name: args.name,
              value: args.value,
              domain: args.domain,
              path: args.path || '/',
            },
          });
          return this.success({ set: true, name: args.name });
        }

        // Script Execution
        case 'execute_background_script': {
          const result = await this.sendToExtension('execute_background_script', {
            code: args.code,
          });
          return this.success(result);
        }

        case 'execute_script': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('execute_script', {
            tabId,
            script: args.code, // Extension expects 'script', not 'code'
            frameId: args.frameId,
            preview: args.preview,
            force: args.force,
          });
          return this.success(result);
        }


        // Buffer Management - Forward to extension
        case 'clear_buffer': {
          const tabId = this.ensureTabId(args.tabId);
          await this.sendToExtension('clear_buffer', {
            tabId,
            dataType: args.dataType,
          });
          return this.success({ cleared: true, tabId: args.tabId });
        }

        case 'get_buffer_stats': {
          const result = await this.sendToExtension('get_tab_buffer_summary', {});
          return this.success(result);
        }

        case 'get_started':
          return this.success({
            instructions: `Tethernet connects you to the user's existing Firefox session.

BEFORE any interactive task:
1. Run SPA detection to decide whether to automate or guide:

   execute_script({ code: \`({
     react: !!(window.React || document.querySelector('[data-reactroot]') || Object.keys(window).some(k => k.startsWith('__react'))),
     vue: !!(window.Vue || window.__vue_app__),
     angular: !!(window.angular || window.ng),
     next: !!window.__NEXT_DATA__,
     obfuscated: Array.from(document.querySelectorAll('[class]')).slice(0, 20)
       .flatMap(el => [...el.classList]).filter(c => /^[a-z0-9]{4,8}$/.test(c)).length > 8
   })\` })

   If any value is true → guide mode (screenshots only).
   If all false → automation may work, but fall back to guide mode after 2 failed attempts.

GUIDE MODE (screenshots + instructions):
- take_screenshot → tell user exactly what to click → wait for confirmation → take cropped screenshot to verify → repeat
- User does all clicking and typing. You observe and instruct.

AUTOMATION MODE (DOM allowed, non-SPA only):
- click_element, execute_script, fill_form are available
- After 2 failed attempts with no visible change → switch to guide mode immediately

DATA CAPTURE (only when explicitly requested):
- dom_stats() first, then get_dom_structure(), then get_page_content() only if htmlSize < 50KB
- query_buffer for console/network/errors/websocket
- get_local_storage, get_session_storage, get_cookies

CLARIFY before starting if the request is ambiguous.`,
          });

        // Connection Info
        case 'get_connection_info':
          return this.success({
            wsUrl: `ws://localhost:${this.wsPort}/extension`,
            port: this.wsPort,
            hint: 'Enter localhost:PORT in the Tethernet extension popup to connect.',
          });

        // Connection Status
        case 'get_connection_status': {
          const ollamaAvailable = ollamaConfig.enabled ? await checkOllamaConnection() : false;
          // Get tab count from extension
          let tabCount = 0;
          try {
            const tabs = await this.sendToExtension('list_tabs', {});
            tabCount = Array.isArray(tabs) ? tabs.length : 0;
          } catch (e) {
            // Extension not connected, tabCount remains 0
          }
          return this.success({
            extensionConnected: this.connectionManager.getState().extensionConnected,
            primaryTabId: this.primaryTabId,
            tabCount,
            wsPort: this.wsPort,
            ollamaEnabled: ollamaConfig.enabled,
            ollamaAvailable,
            ollamaBaseUrl: ollamaConfig.enabled ? ollamaConfig.baseUrl : null,
          });
        }

        // Wait & Timing
        case 'wait_for_element': {
          const tabId = this.ensureTabId(args.tabId);
          const selector = args.selector;
          const timeout = args.timeout || 5000;
          // Use execute_script with polling to wait for element
          const result = await this.sendToExtension('execute_script', {
            tabId,
            frameId: args.frameId,
            script: `new Promise((resolve, reject) => {
              const selector = ${JSON.stringify(selector)};
              const timeout = ${timeout};
              const startTime = Date.now();
              const check = () => {
                const el = document.querySelector(selector);
                if (el) {
                  resolve({ found: true, selector, tagName: el.tagName });
                } else if (Date.now() - startTime > timeout) {
                  reject(new Error('Timeout waiting for element: ' + selector));
                } else {
                  setTimeout(check, 100);
                }
              };
              check();
            })`,
          });
          return this.success(result);
        }

        case 'wait_for_navigation': {
          const tabId = this.ensureTabId(args.tabId);
          const timeout = args.timeout || 30000;
          // Poll for tab status to change to 'complete'
          const startTime = Date.now();
          while (Date.now() - startTime < timeout) {
            try {
              const tabs = await this.sendToExtension('list_tabs', {});
              const tab = Array.isArray(tabs) ? tabs.find((t: any) => t.id === tabId) : null;
              if (tab && tab.status === 'complete') {
                return this.success({ navigated: true, url: tab.url, title: tab.title });
              }
            } catch (e) {
              // Ignore errors during polling
            }
            // Wait 100ms before next poll
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          return this.error(`Navigation timeout after ${timeout}ms`);
        }

        // Advanced
        case 'set_request_headers': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('set_request_headers', {
            tabId,
            headers: args.headers,
          });
          return this.success(result);
        }

        case 'block_urls': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('block_urls', {
            tabId,
            patterns: args.patterns,
          });
          return this.success(result);
        }

        // Ollama Integration
        case 'ollama_analyze_page': {
          // Check if Ollama is configured
          if (!ollamaConfig.enabled) {
            return this.success({
              error: 'ollama_not_configured',
              message: 'Ollama is not configured. Set OLLAMA_BASE_URL environment variable.',
            });
          }

          // Check if Ollama is reachable
          const isAvailable = await checkOllamaConnection();
          if (!isAvailable) {
            return this.success({
              error: 'ollama_unavailable',
              message: `Could not connect to Ollama at ${ollamaConfig.baseUrl}`,
            });
          }

          // Get page HTML from extension
          const tabId = this.ensureTabId(args.tabId);
          const domResult = await this.sendToExtension('get_dom', { tabId });
          const html = domResult?.html;

          if (!html) {
            return this.error('Failed to get page HTML from extension');
          }

          // Build prompt with HTML context
          const fullPrompt = `You are analyzing an HTML page. Here is the page content:

<html_content>
${html}
</html_content>

User request: ${args.prompt}

Provide your analysis based on the HTML content above.`;

          try {
            const result = await ollamaGenerate(fullPrompt, args.model);
            return this.success({ result });
          } catch (err: any) {
            return this.success({
              error: 'ollama_error',
              message: err.message || String(err),
            });
          }
        }

        // Extension Debug Bridge
        case 'check_debug_bridge': {
          const tabId = this.ensureTabId(args.tabId);
          const result = await this.sendToExtension('execute_script', {
            tabId,
            frameId: args.frameId,
            script: `(function() {
              if (window.__TETHERNET_DEBUG_BRIDGE) {
                return {
                  present: true,
                  version: window.__TETHERNET_DEBUG_BRIDGE.version,
                  extensionId: window.__TETHERNET_DEBUG_BRIDGE.extensionId,
                  extensionName: window.__TETHERNET_DEBUG_BRIDGE.extensionName,
                  injectedAt: window.__TETHERNET_DEBUG_BRIDGE.injectedAt
                };
              }
              return { present: false };
            })()`,
          });
          return this.success(result?.result || result);
        }

        case 'query_extension_debug': {
          const tabId = this.ensureTabId(args.tabId);
          const timeout = args.timeout || 5000;
          const request = args.request || { type: 'getState' };

          const result = await this.sendToExtension('execute_script', {
            tabId,
            frameId: args.frameId,
            script: `(async () => {
              const timeout = ${timeout};
              const request = ${JSON.stringify(request)};

              // Check bridge exists
              if (!window.__TETHERNET_DEBUG_BRIDGE) {
                return { error: 'Debug bridge not found on this page' };
              }

              // Wait for response with timeout
              const responsePromise = new Promise((resolve) => {
                const handler = () => {
                  window.removeEventListener('__tethernet_debug_response', handler);
                  const response = window.__tethernet_debug_response;
                  delete window.__tethernet_debug_response;
                  resolve(response);
                };
                window.addEventListener('__tethernet_debug_response', handler, { once: true });
              });

              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Debug bridge timeout')), timeout)
              );

              // Fire request
              window.dispatchEvent(new CustomEvent('__tethernet_debug_request', { detail: request }));

              try {
                return await Promise.race([responsePromise, timeoutPromise]);
              } catch (e) {
                return { error: e.message };
              }
            })()`,
          });
          return this.success(result?.result || result);
        }

        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err: any) {
      return this.error(err.message || String(err));
    }
  }
}
