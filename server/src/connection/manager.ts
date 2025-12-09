import type { WebSocket } from 'ws';

export interface ConnectionState {
  extensionConnected: boolean;
  extensionSocket: WebSocket | null;
  claudeCodeConnected: boolean;
  lastExtensionActivity: number;
  lastClaudeCodeActivity: number;
}

export class ConnectionManager {
  private state: ConnectionState = {
    extensionConnected: false,
    extensionSocket: null,
    claudeCodeConnected: false,
    lastExtensionActivity: 0,
    lastClaudeCodeActivity: 0,
  };

  private listeners: Array<(state: ConnectionState) => void> = [];

  getState(): ConnectionState {
    return { ...this.state };
  }

  setExtensionConnected(socket: WebSocket | null): void {
    this.state.extensionConnected = socket !== null;
    this.state.extensionSocket = socket;
    if (socket) {
      this.state.lastExtensionActivity = Date.now();
    }
    this.notifyListeners();
  }

  setClaudeCodeConnected(connected: boolean): void {
    this.state.claudeCodeConnected = connected;
    if (connected) {
      this.state.lastClaudeCodeActivity = Date.now();
    }
    this.notifyListeners();
  }

  updateExtensionActivity(): void {
    this.state.lastExtensionActivity = Date.now();
  }

  updateClaudeCodeActivity(): void {
    this.state.lastClaudeCodeActivity = Date.now();
  }

  onChange(listener: (state: ConnectionState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
