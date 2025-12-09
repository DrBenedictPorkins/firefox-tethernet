import { describe, it, expect, beforeEach } from 'vitest';
import { BufferStore } from './store.js';
import type { TabInfo, ConsoleLogEntry, NetworkRequest, WebSocketMessage, JSError } from './types.js';

// Helper to create a TabInfo object
function createTab(id: number, url: string, title: string, active: boolean = false): TabInfo {
  return { id, url, title, active, windowId: 1, index: 0 };
}

// Test helpers - create minimal objects for testing
function createLog(level: string, timestamp: number): ConsoleLogEntry {
  return { level, args: [`test-${timestamp}`], timestamp } as unknown as ConsoleLogEntry;
}

function createRequest(requestId: string, url: string, method: string, timestamp: number): NetworkRequest {
  return { requestId, url, method, timestamp } as NetworkRequest;
}

function createWSMessage(url: string, direction: 'send' | 'receive', data: string, timestamp: number): WebSocketMessage {
  return { url, direction, data, timestamp, size: data.length } as WebSocketMessage;
}

function createError(message: string, timestamp: number, lineNumber?: number): JSError {
  return { message, timestamp, type: 'error', lineNumber } as unknown as JSError;
}

describe('BufferStore', () => {
  let store: BufferStore;

  beforeEach(() => {
    store = new BufferStore();
  });

  describe('Tab Management', () => {
    it('should add and retrieve tabs', () => {
      store.updateTab(createTab(1, 'https://example.com', 'Example', true));

      const tabs = store.getAllTabs();
      expect(tabs).toHaveLength(1);
      expect(tabs[0].id).toBe(1);
      expect(tabs[0].url).toBe('https://example.com');
    });

    it('should update existing tab', () => {
      store.updateTab(createTab(1, 'https://example.com', 'Example', true));
      store.updateTab(createTab(1, 'https://example.com/page', 'Example Page', true));

      const tabs = store.getAllTabs();
      expect(tabs).toHaveLength(1);
      expect(tabs[0].url).toBe('https://example.com/page');
      expect(tabs[0].title).toBe('Example Page');
    });

    it('should remove tab and its buffer', () => {
      store.updateTab(createTab(1, 'https://example.com', 'Test', true));
      store.addConsoleLog(1, createLog('log', Date.now()));

      store.removeTab(1);

      expect(store.getAllTabs()).toHaveLength(0);
      expect(store.getConsoleLogs(1)).toHaveLength(0);
    });

    it('should return correct tab count', () => {
      expect(store.getTabCount()).toBe(0);

      store.updateTab(createTab(1, 'https://a.com', 'A', true));
      expect(store.getTabCount()).toBe(1);

      store.updateTab(createTab(2, 'https://b.com', 'B', false));
      expect(store.getTabCount()).toBe(2);
    });

    it('should get individual tab', () => {
      store.updateTab(createTab(1, 'https://example.com', 'Test', true));

      const tab = store.getTab(1);
      expect(tab).toBeDefined();
      expect(tab?.url).toBe('https://example.com');
    });
  });

  describe('Console Log Buffer', () => {
    beforeEach(() => {
      store.updateTab(createTab(1, 'https://example.com', 'Test', true));
    });

    it('should add and retrieve console logs', () => {
      store.addConsoleLog(1, createLog('log', Date.now()));

      const logs = store.getConsoleLogs(1);
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('log');
    });

    it('should filter console logs by level', () => {
      store.addConsoleLog(1, createLog('log', 1));
      store.addConsoleLog(1, createLog('error', 2));
      store.addConsoleLog(1, createLog('warn', 3));

      const errors = store.getConsoleLogs(1, 'error');
      expect(errors).toHaveLength(1);
      expect(errors[0].level).toBe('error');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        store.addConsoleLog(1, createLog('log', Date.now() + i));
      }

      const logs = store.getConsoleLogs(1, undefined, 5);
      expect(logs).toHaveLength(5);
    });

    it('should evict old logs when buffer is full', () => {
      // Add more logs than the buffer limit (default is 1000)
      for (let i = 0; i < 1100; i++) {
        store.addConsoleLog(1, createLog('log', i));
      }

      const logs = store.getConsoleLogs(1);
      expect(logs.length).toBeLessThanOrEqual(1000);
      // First logs should have been evicted - check timestamp
      expect(logs[0].timestamp).toBeGreaterThan(0);
    });
  });

  describe('Network Request Buffer', () => {
    beforeEach(() => {
      store.updateTab(createTab(1, 'https://example.com', 'Test', true));
    });

    it('should add and retrieve network requests', () => {
      store.addNetworkRequest(1, createRequest('req1', 'https://api.example.com/data', 'GET', Date.now()));

      const requests = store.getNetworkRequests(1);
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe('https://api.example.com/data');
    });

    it('should update network request with response', () => {
      store.addNetworkRequest(1, createRequest('req1', 'https://api.example.com/data', 'GET', Date.now()));

      store.updateNetworkResponse(1, 'req1', { statusCode: 200 });

      const requests = store.getNetworkRequests(1);
      expect(requests[0].statusCode).toBe(200);
    });

    it('should filter network requests by method', () => {
      store.addNetworkRequest(1, createRequest('r1', '/api/get', 'GET', 1));
      store.addNetworkRequest(1, createRequest('r2', '/api/post', 'POST', 2));

      const posts = store.getNetworkRequests(1, { method: 'POST' });
      expect(posts).toHaveLength(1);
      expect(posts[0].method).toBe('POST');
    });

    it('should filter network requests by URL pattern', () => {
      store.addNetworkRequest(1, createRequest('r1', 'https://api.example.com/users', 'GET', 1));
      store.addNetworkRequest(1, createRequest('r2', 'https://api.example.com/posts', 'GET', 2));
      store.addNetworkRequest(1, createRequest('r3', 'https://cdn.example.com/image.png', 'GET', 3));

      const apiRequests = store.getNetworkRequests(1, { urlPattern: 'api.example.com' });
      expect(apiRequests).toHaveLength(2);
    });

    it('should filter network requests by status code', () => {
      store.addNetworkRequest(1, createRequest('r1', '/a', 'GET', 1));
      store.addNetworkRequest(1, createRequest('r2', '/b', 'GET', 2));

      store.updateNetworkResponse(1, 'r1', { statusCode: 200 });
      store.updateNetworkResponse(1, 'r2', { statusCode: 404 });

      const notFound = store.getNetworkRequests(1, { statusCode: 404 });
      expect(notFound).toHaveLength(1);
      expect(notFound[0].url).toBe('/b');
    });
  });

  describe('JS Error Buffer', () => {
    beforeEach(() => {
      store.updateTab(createTab(1, 'https://example.com', 'Test', true));
    });

    it('should add and retrieve JS errors', () => {
      store.addJSError(1, createError('Uncaught TypeError: undefined is not a function', Date.now(), 42));

      const errors = store.getJSErrors(1);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('TypeError');
    });
  });

  describe('WebSocket Message Buffer', () => {
    beforeEach(() => {
      store.updateTab(createTab(1, 'https://example.com', 'Test', true));
    });

    it('should add and retrieve WebSocket messages', () => {
      store.addWebSocketMessage(1, createWSMessage('wss://socket.example.com', 'send', '{"type":"ping"}', Date.now()));

      const messages = store.getWebSocketMessages(1);
      expect(messages).toHaveLength(1);
      expect(messages[0].direction).toBe('send');
    });

    it('should filter WebSocket messages by URL', () => {
      store.addWebSocketMessage(1, createWSMessage('wss://a.com', 'send', '1', 1));
      store.addWebSocketMessage(1, createWSMessage('wss://b.com', 'receive', '2', 2));

      const aMessages = store.getWebSocketMessages(1, 'wss://a.com');
      expect(aMessages).toHaveLength(1);
    });
  });

  describe('Buffer Stats', () => {
    it('should return correct buffer statistics', () => {
      store.updateTab(createTab(1, 'https://a.com', 'A', true));
      store.updateTab(createTab(2, 'https://b.com', 'B', false));

      store.addConsoleLog(1, createLog('log', 1));
      store.addConsoleLog(1, createLog('error', 2));
      store.addNetworkRequest(1, createRequest('r1', '/api', 'GET', 1));

      const stats = store.getStats();
      expect(stats.totalTabs).toBe(2);
      expect(stats.bufferSizes[1].consoleLogs).toBe(2);
      expect(stats.bufferSizes[1].networkRequests).toBe(1);
    });
  });

  describe('Clear Buffer', () => {
    beforeEach(() => {
      store.updateTab(createTab(1, 'https://example.com', 'Test', true));
      store.addConsoleLog(1, createLog('log', 1));
      store.addNetworkRequest(1, createRequest('r1', '/api', 'GET', 1));
      store.addJSError(1, createError('Error', 1));
    });

    it('should clear specific data type', () => {
      store.clearBuffer(1, 'console');

      expect(store.getConsoleLogs(1)).toHaveLength(0);
      expect(store.getNetworkRequests(1)).toHaveLength(1);
      expect(store.getJSErrors(1)).toHaveLength(1);
    });

    it('should clear all data types when no type specified', () => {
      store.clearBuffer(1);

      expect(store.getConsoleLogs(1)).toHaveLength(0);
      expect(store.getNetworkRequests(1)).toHaveLength(0);
      expect(store.getJSErrors(1)).toHaveLength(0);
    });
  });
});
