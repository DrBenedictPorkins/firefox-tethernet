import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { Server as HTTPServer } from 'http';
import type { BufferStore } from '../buffer/store.js';
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
    private bufferStore: BufferStore,
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

    if (!tabId) {
      console.warn('Received message without tabId:', type);
      return;
    }

    switch (type) {
      case 'console_log':
        this.bufferStore.addConsoleLog(tabId, data);
        break;

      case 'network_request':
        this.bufferStore.addNetworkRequest(tabId, data);
        break;

      case 'network_response':
        this.bufferStore.updateNetworkResponse(tabId, data.requestId, data);
        break;

      case 'websocket_message':
        this.bufferStore.addWebSocketMessage(tabId, data);
        break;

      case 'js_error':
        this.bufferStore.addJSError(tabId, data);
        break;

      case 'dom_snapshot':
        this.bufferStore.addDOMSnapshot(tabId, data);
        break;

      case 'screenshot':
        this.bufferStore.addScreenshot(tabId, data);
        break;

      case 'storage_data':
        this.bufferStore.setStorageData(tabId, data);
        break;

      case 'cookies':
        this.bufferStore.setCookies(tabId, data);
        break;

      case 'performance_metrics':
        this.bufferStore.addPerformanceMetrics(tabId, data);
        break;

      case 'tab_updated':
        this.bufferStore.updateTab(data);
        break;

      case 'tab_removed':
        this.bufferStore.removeTab(tabId);
        break;

      case 'tabs_list':
        this.bufferStore.setTabs(data);
        break;

      default:
        console.warn('Unknown message type:', type);
    }
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
