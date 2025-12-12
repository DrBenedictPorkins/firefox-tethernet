// Terminal UI is not used in stdio mode - this is a no-op stub for compatibility

export interface ConnectionState {
  extensionConnected: boolean;
  claudeCodeConnected: boolean;
}

export class TerminalUI {
  constructor() {}

  start(): void {}
  stop(): void {}

  updateConnectionState(_state: ConnectionState): void {}

  addToolCall(
    _tool: string,
    _tabId: number | undefined,
    _status: 'success' | 'error',
    _duration: number
  ): void {}
}
