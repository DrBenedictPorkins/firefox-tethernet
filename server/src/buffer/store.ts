/**
 * BufferStore has been removed - the extension now owns all buffered data.
 * This file is kept only for type exports and backwards compatibility.
 *
 * The MCP server is now STATELESS and forwards all buffer queries to the extension.
 */

// Re-export all types from types.ts
export type {
  TabInfo,
  TabBuffer,
  ConsoleLogEntry,
  NetworkRequest,
  WebSocketMessage,
  JSError,
  DOMSnapshot,
  Screenshot,
  StorageData,
  Cookie,
  PerformanceMetrics,
} from './types.js';

// Export empty class for backwards compatibility with tests
// This should not be used in production code
export class BufferStore {
  constructor() {
    console.warn('BufferStore is deprecated - server is now stateless. Extension owns all data.');
  }
}
