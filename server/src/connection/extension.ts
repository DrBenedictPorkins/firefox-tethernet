import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import type { Server as HTTPServer } from 'http';
import type { ConnectionManager } from './manager.js';
import type { ExtensionRequest, ExtensionResponse } from '../mcp/types.js';
import { CONFIG } from '../utils/config.js';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class ExtensionConnectionHandler {
  private wss: WebSocketServer;
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();

  constructor(
    httpServer: HTTPServer,
    private connectionManager: ConnectionManager
  ) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: CONFIG.websocket.path,
    });

    this.wss.on('connection', this.handleConnection.bind(this));
  }

  private handleConnection(socket: WebSocket): void {
    console.log('Extension connected');

    // Disconnect previous connection if any
    if (this.ws) {
      this.ws.close();
    }

    this.ws = socket;
    this.connectionManager.setExtensionConnected(socket);

    // Send session info to extension
    const sessionInfo = {
      type: 'session_info',
      data: {
        pid: process.pid,
        cwd: process.cwd(),
        projectName: path.basename(process.cwd()),
        connectedAt: Date.now(),
        port: CONFIG.port
      }
    };
    socket.send(JSON.stringify(sessionInfo));

    socket.on('message', (data: Buffer) => {
      this.handleMessage(data);
    });

    socket.on('close', () => {
      console.log('Extension disconnected');
      this.ws = null;
      this.connectionManager.setExtensionConnected(null);

      // Reject all pending requests
      for (const [requestId, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Extension disconnected'));
      }
      this.pendingRequests.clear();
    });

    socket.on('error', (err) => {
      console.error('WebSocket error:', err);
    });

    // Setup ping interval
    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, CONFIG.websocket.pingInterval);

    socket.on('close', () => {
      clearInterval(pingInterval);
    });
  }

  private handleMessage(data: Buffer): void {
    this.connectionManager.updateExtensionActivity();

    try {
      const message = JSON.parse(data.toString());

      // Check if this is a response to a pending request
      if (message.requestId && this.pendingRequests.has(message.requestId)) {
        const pending = this.pendingRequests.get(message.requestId)!;
        this.pendingRequests.delete(message.requestId);
        clearTimeout(pending.timeout);

        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.result);
        }
        return;
      }

      // Otherwise, this is an event from the extension
      this.handleExtensionEvent(message);
    } catch (err) {
      console.error('Error parsing extension message:', err);
    }
  }

  private handleExtensionEvent(message: any): void {
    const { type, data, tabId } = message;

    // Extension now owns all buffered data - server is stateless
    // Events from extension are no longer stored here
    // This method is kept for potential future event logging/monitoring

    // Log unknown message types for debugging
    console.warn('Received extension event (server is stateless):', type);
  }

  sendToExtension(action: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Extension not connected'));
        return;
      }

      const requestId = uuidv4();
      const request: ExtensionRequest = {
        action,
        params,
        requestId,
      };

      // Setup timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${action}`));
      }, 30000); // 30 second timeout

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
      });

      this.ws.send(JSON.stringify(request));
    });
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
