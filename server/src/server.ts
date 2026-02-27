import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ConnectionManager } from './connection/manager.js';
import { ExtensionConnectionHandler } from './connection/extension.js';
import { ToolHandlers } from './mcp/handlers.js';
import { TOOLS } from './mcp/tools.js';
import { SessionLogger } from './logger/session.js';

// Server instructions for MCP
// NOTE: Detailed usage instructions are in the tethernet agent (~/.claude/agents/tethernet-agent.md)
// Keep this minimal to reduce token usage on every tool call
const serverInstructions = `Tethernet - Firefox Browser Automation & Inspection

IMPORTANT: Use the 'tethernet' agent for all browser automation tasks. The agent has detailed instructions for efficient tool usage.

Quick reference:
- get_connection_info - Get WebSocket URL/port to enter in extension popup
- get_connection_status, list_tabs, set_primary_tab - Connection & tab management
- navigate, reload_page, go_back/forward - Navigation
- execute_script - PRIMARY tool for DOM/data extraction and manipulation
- dom_stats, get_dom_structure, get_page_content - DOM inspection (see workflow below)
- query_selector, get_element_properties - Element lookup
- click_element, type_text, fill_form - Interaction
- query_buffer - Query console, errors, network, websocket with JS transforms
- take_screenshot - Capture page

All tools default to primary tab if tabId not specified.
Use frameId parameter for iframe targeting (0 = top frame).

## DOM Inspection Workflow (IMPORTANT)

Large pages can flood context. Always follow this pattern:

1. **dom_stats()** - Check htmlSize first. If >50KB, do NOT use get_page_content
2. **get_dom_structure({ depth: 1 })** - Get top-level structure (~2-3KB)
3. **get_dom_structure({ selector: '#main', depth: 2 })** - Drill into sections
4. **execute_script** - For targeted data extraction once you know the structure

Example: Paramount+ homepage is 907KB. Using get_dom_structure progressively: ~10KB total.

Raw content detection: If page is JSON/XML/text (single <pre> in body), get_dom_structure returns size + preview instead of structure.

## Ollama Integration (Local LLM)

ollama_analyze_page - Sends page HTML to local Ollama server for analysis.
Use when: Large pages where you need to extract specific data without consuming context tokens.

**When to use:**
- Extracting structured data from complex HTML (products, prices, links, etc.)
- Needle-in-haystack searches on large pages
- Summarizing page content

**When NOT to use:**
- Simple queries that execute_script can handle
- Small pages (< 10KB HTML)
- When you need precise DOM manipulation (use execute_script)

**Error handling:**
- ollama_not_configured: OLLAMA_BASE_URL env var not set. Feature disabled.
- ollama_unavailable: Ollama server not reachable. Fallback to get_page_content + process in context, or ask user if server is online.
- ollama_error: Model error (context too long, etc). Try different approach.

**Check availability:** get_connection_status returns ollamaEnabled and ollamaAvailable booleans.

## Rendering HTML Reports in Browser

To display HTML reports, formatted data, or generated content in the browser:

1. Write HTML to a temp file (e.g., /tmp/report.html)
2. Use navigate tool: navigate({ url: 'file:///tmp/report.html' })

**Avoid:** Data URIs (blocked by Firefox), about:blank (no content script), injecting into other sites.`;

/**
 * Creates the MCP server instance (called once, not per-request)
 */
function createMCPServer(
  toolHandlers: ToolHandlers,
  sessionLogger: SessionLogger
): Server {
  const mcpServer = new Server(
    {
      name: 'tethernet',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: serverInstructions,
    }
  );

  // Register tools
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOLS,
    };
  });

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;

    sessionLogger.log('tool_call', {
      name,
      args,
    });

    const startTime = Date.now();

    try {
      const result = await toolHandlers.handle(name, args || {});
      const duration = Date.now() - startTime;

      sessionLogger.log('tool_result', {
        name,
        duration,
        success: !result.isError,
      });

      return result;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      sessionLogger.log('error', {
        tool: name,
        error: errorMessage,
        duration,
      });

      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  return mcpServer;
}

export async function startServer(): Promise<void> {
  // Initialize core components
  const connectionManager = new ConnectionManager();
  const sessionLogger = new SessionLogger();

  // Setup extension WebSocket handler (binds on dynamic port)
  const extensionHandler = new ExtensionConnectionHandler(connectionManager);
  const wsPort = await extensionHandler.start();

  // Setup tool handlers
  const toolHandlers = new ToolHandlers(
    extensionHandler.sendToExtension.bind(extensionHandler),
    connectionManager,
    wsPort
  );

  // Create MCP server (single instance)
  const mcpServer = createMCPServer(toolHandlers, sessionLogger);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  console.error(`[Tethernet] Started — extension WebSocket: ws://localhost:${wsPort}/extension`);

  // Graceful shutdown
  const shutdown = async () => {
    console.error('[Tethernet] Shutting down...');

    sessionLogger.close();
    await extensionHandler.close();
    transport.close();

    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
