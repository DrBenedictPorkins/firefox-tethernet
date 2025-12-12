import { createServer } from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ConnectionManager } from './connection/manager.js';
import { ExtensionConnectionHandler } from './connection/extension.js';
import { ToolHandlers } from './mcp/handlers.js';
import { TOOLS } from './mcp/tools.js';
import { SessionLogger } from './logger/session.js';
import { CONFIG } from './utils/config.js';

export async function startServer(): Promise<void> {
  // Initialize core components
  const connectionManager = new ConnectionManager();
  const sessionLogger = new SessionLogger();

  // Create a minimal HTTP server for the WebSocket connection
  // (Express not needed since we're using stdio for MCP)
  const httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        extensionConnected: extensionHandler.isConnected(),
      }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  // Setup extension WebSocket handler
  const extensionHandler = new ExtensionConnectionHandler(
    httpServer,
    connectionManager
  );

  // Setup tool handlers
  const toolHandlers = new ToolHandlers(
    extensionHandler.sendToExtension.bind(extensionHandler),
    connectionManager
  );

  // Create MCP server with description for Claude Code
  // NOTE: Detailed usage instructions are in the foxhole agent (~/.claude/agents/foxhole.md)
  // Keep this minimal to reduce token usage on every tool call
  const serverInstructions = `FoxHole Debug Bridge - Firefox Browser Automation & Inspection

IMPORTANT: Use the 'foxhole' agent for all browser automation tasks. The agent has detailed instructions for efficient tool usage.

Quick reference:
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

  const mcpServer = new Server(
    {
      name: 'foxhole',
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

  // Start WebSocket server for extension on configured port
  // Handle port already in use - kill existing process
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[FoxHole] Port ${CONFIG.port} in use, attempting to take over...`);
      // Try to kill existing process using the port
      import('child_process').then(({ execSync }) => {
        try {
          // Find and kill the process using this port
          const result = execSync(`lsof -ti :${CONFIG.port}`).toString().trim();
          const pids = result.split('\n');
          for (const pid of pids) {
            if (pid && pid !== String(process.pid)) {
              console.error(`[FoxHole] Killing existing process ${pid}`);
              execSync(`kill ${pid}`);
            }
          }
          // Retry after a short delay
          setTimeout(() => {
            httpServer.listen(CONFIG.port, () => {
              console.error(`[FoxHole] WebSocket server listening on port ${CONFIG.port}`);
              console.error(`[FoxHole] Extension endpoint: ws://localhost:${CONFIG.port}${CONFIG.websocket.path}`);
            });
          }, 500);
        } catch (killErr) {
          console.error(`[FoxHole] Failed to kill existing process: ${killErr}`);
          process.exit(1);
        }
      });
    } else {
      console.error(`[FoxHole] Server error: ${err.message}`);
      process.exit(1);
    }
  });

  httpServer.listen(CONFIG.port, () => {
    // Log to stderr so it doesn't interfere with stdio MCP transport
    console.error(`[FoxHole] WebSocket server listening on port ${CONFIG.port}`);
    console.error(`[FoxHole] Extension endpoint: ws://localhost:${CONFIG.port}${CONFIG.websocket.path}`);
  });

  // Mark Claude Code as connected since we're using stdio
  connectionManager.setClaudeCodeConnected(true);

  // Connect MCP server via stdio transport
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  // Graceful shutdown
  const shutdown = async () => {
    console.error('[FoxHole] Shutting down...');

    sessionLogger.close();

    await mcpServer.close();
    httpServer.close(() => {
      console.error('[FoxHole] Server closed');
      process.exit(0);
    });

    // Force exit after 5 seconds
    setTimeout(() => {
      process.exit(1);
    }, 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
