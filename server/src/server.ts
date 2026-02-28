import { execSync } from 'child_process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ConnectionManager } from './connection/manager.js';
import { ExtensionConnectionHandler } from './connection/extension.js';
import { ToolHandlers } from './mcp/handlers.js';
import { TOOLS } from './mcp/tools.js';
import { SessionLogger } from './logger/session.js';

// Server instructions for MCP — injected into system prompt for all clients (Claude Code, Claude Desktop, etc.)
const serverInstructions = `Tethernet - Firefox Browser Automation

## How to guide users through browser tasks

Before any interactive task, run this SPA detection check first:

\`\`\`javascript
execute_script({ code: \`({
  react: !!(window.React || document.querySelector('[data-reactroot]') || Object.keys(window).some(k => k.startsWith('__react'))),
  vue: !!(window.Vue || window.__vue_app__),
  angular: !!(window.angular || window.ng),
  next: !!window.__NEXT_DATA__,
  obfuscated: Array.from(document.querySelectorAll('[class]')).slice(0, 20)
    .flatMap(el => [...el.classList]).filter(c => /^[a-z0-9]{4,8}$/.test(c)).length > 8
})\` })
\`\`\`

**If any value is true → the site uses a JavaScript framework. Do not attempt DOM automation. Use the screenshot-and-guide approach only** (unless the user explicitly asks for script execution or DOM inspection).

**If all values are false → you may attempt DOM automation**, but fall back to screenshot-and-guide after two failed attempts.

### Screenshot-and-guide approach

1. Navigate to the correct URL if needed
2. Call take_screenshot to see the current page state
3. Tell the user exactly what to click or type: "Click the blue '+' button in the top-right corner"
4. Wait for them to confirm they did it
5. Call take_screenshot again (cropped to the relevant area) to confirm it worked
6. Continue to the next step

The user performs all clicks and form input. You observe via screenshots and give precise instructions.

Before starting, ask for clarification if the request is ambiguous (e.g. "new user" — new to the organization, or new to a specific group?).

## Data capture tools (use only when explicitly requested)

- DOM inspection: dom_stats() first, then get_dom_structure(), then get_page_content() only if htmlSize < 50KB
- Script execution: execute_script (slice results to stay under 50KB)
- Captured data: query_buffer({ type: 'console'|'network'|'errors'|'websocket', transform: '...' })
- Storage: get_local_storage, get_session_storage, get_cookies

## Connecting to Firefox

Call get_connection_info to get the current port — it changes every session. The user enters localhost:PORT in the Tethernet Firefox extension popup to connect.

## Claude Code users

Use the 'tethernet' subagent for all browser tasks.`;

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
  process.stdin.on('close', shutdown);

  // Exit when parent process dies.
  // Claude Desktop spawns: CD → disclaimer wrapper → node server
  // Claude Code spawns:    CC → node server (direct)
  // When CD exits, disclaimer gets reparented to init (ppid=1) but stays alive.
  // So for the CD case we must watch disclaimer's ppid, not disclaimer itself.
  const parentPid = process.ppid;
  let watchViaGrandparent = false;
  try {
    const parentComm = execSync(`ps -o comm= -p ${parentPid} 2>/dev/null`, { encoding: 'utf8' }).trim();
    watchViaGrandparent = parentComm.includes('disclaimer');
  } catch { /* ignore */ }

  setInterval(() => {
    try {
      if (watchViaGrandparent) {
        // CD case: if disclaimer's ppid is 1, CD has already exited
        const grandparentPid = parseInt(
          execSync(`ps -o ppid= -p ${parentPid} 2>/dev/null`, { encoding: 'utf8' }).trim()
        );
        if (isNaN(grandparentPid) || grandparentPid <= 1) {
          shutdown();
        }
      } else {
        // CC case: check direct parent is alive
        process.kill(parentPid, 0);
      }
    } catch {
      shutdown();
    }
  }, 5000);
}
