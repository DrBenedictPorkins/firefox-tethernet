import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolHandlers } from './handlers.js';
import { ConnectionManager } from '../connection/manager.js';
import type { TabInfo, ConsoleLogEntry, NetworkRequest } from '../buffer/types.js';

// Test helpers
function createTab(id: number, url: string, title: string, active: boolean = false): TabInfo {
  return { id, url, title, active, windowId: 1, index: 0 };
}

function createLog(level: string, timestamp: number): ConsoleLogEntry {
  return { level, args: [`test-${timestamp}`], timestamp } as unknown as ConsoleLogEntry;
}

function createRequest(requestId: string, url: string, method: string, timestamp: number): NetworkRequest {
  return { requestId, url, method, timestamp } as NetworkRequest;
}

describe('ToolHandlers', () => {
  let handlers: ToolHandlers;
  let connectionManager: ConnectionManager;
  let mockSendToExtension: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    connectionManager = new ConnectionManager();
    mockSendToExtension = vi.fn().mockResolvedValue({ success: true });
    handlers = new ToolHandlers(mockSendToExtension, connectionManager, 0);
  });

  describe('Tab Management', () => {
    it('list_tabs should return all tabs', async () => {
      const mockTabs = [
        { id: 1, url: 'https://example.com', title: 'Test', active: true },
        { id: 2, url: 'https://other.com', title: 'Other', active: false },
      ];
      mockSendToExtension.mockResolvedValueOnce(mockTabs);

      const result = await handlers.handle('list_tabs', {});

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(2);
    });

    it('set_primary_tab should set the primary tab', async () => {
      const result = await handlers.handle('set_primary_tab', { tabId: 1 });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.primaryTabId).toBe(1);
    });

    it('get_primary_tab should return null if not set', async () => {
      const result = await handlers.handle('get_primary_tab', {});

      const data = JSON.parse(result.content[0].text);
      expect(data).toBeNull();
    });

    it('get_primary_tab should return tab info after setting', async () => {
      const mockTabs = [
        { id: 1, url: 'https://example.com', title: 'Test', active: true },
      ];
      mockSendToExtension.mockResolvedValueOnce(mockTabs);

      await handlers.handle('set_primary_tab', { tabId: 1 });
      const result = await handlers.handle('get_primary_tab', {});

      const data = JSON.parse(result.content[0].text);
      expect(data.primaryTabId).toBe(1);
      expect(data.tabInfo.url).toBe('https://example.com');
    });

    it('create_tab should call extension', async () => {
      mockSendToExtension.mockResolvedValueOnce({ id: 3, url: 'https://new.com' });

      await handlers.handle('create_tab', { url: 'https://new.com' });

      expect(mockSendToExtension).toHaveBeenCalledWith('create_tab', {
        url: 'https://new.com',
        active: undefined,
      });
    });

    it('close_tab should call extension', async () => {
      await handlers.handle('close_tab', { tabId: 1 });

      expect(mockSendToExtension).toHaveBeenCalledWith('close_tab', { tabId: 1 });
    });

    it('close_tab should clear primary if closing primary tab', async () => {
      await handlers.handle('set_primary_tab', { tabId: 1 });
      await handlers.handle('close_tab', { tabId: 1 });

      const result = await handlers.handle('get_primary_tab', {});
      const data = JSON.parse(result.content[0].text);
      expect(data).toBeNull();
    });
  });

  describe('Primary Tab Requirement', () => {
    it('should error when no primary tab set and tabId not provided', async () => {
      const result = await handlers.handle('query_buffer', { type: 'console', transform: '' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No tab specified');
    });

    it('should use explicit tabId even without primary', async () => {
      const mockLogs = [createLog('log', Date.now())];
      mockSendToExtension.mockResolvedValueOnce(mockLogs);

      const result = await handlers.handle('query_buffer', { type: 'console', transform: '', tabId: 1 });

      expect(result.isError).toBeFalsy();
      expect(mockSendToExtension).toHaveBeenCalledWith('query_buffer', {
        tabId: 1,
        type: 'console',
        transform: '',
      });
    });

    it('should use primary tab when tabId not provided', async () => {
      await handlers.handle('set_primary_tab', { tabId: 1 });
      const mockLogs = [createLog('log', Date.now())];
      mockSendToExtension.mockResolvedValueOnce(mockLogs);

      const result = await handlers.handle('query_buffer', { type: 'console', transform: '' });

      expect(result.isError).toBeFalsy();
      expect(mockSendToExtension).toHaveBeenCalledWith('query_buffer', {
        tabId: 1,
        type: 'console',
        transform: '',
      });
    });
  });

  describe('Console Logs via query_buffer', () => {
    beforeEach(async () => {
      await handlers.handle('set_primary_tab', { tabId: 1 });
    });

    it('query_buffer console should forward to extension', async () => {
      const mockLogs = [createLog('log', 1), createLog('error', 2), createLog('warn', 3)];
      mockSendToExtension.mockResolvedValueOnce(mockLogs);

      const result = await handlers.handle('query_buffer', { type: 'console', transform: '' });

      expect(mockSendToExtension).toHaveBeenCalledWith('query_buffer', {
        tabId: 1,
        type: 'console',
        transform: '',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(3);
    });

    it('query_buffer console should forward transform to extension', async () => {
      const mockFilteredLogs = [createLog('error', 2)];
      mockSendToExtension.mockResolvedValueOnce(mockFilteredLogs);

      const result = await handlers.handle('query_buffer', {
        type: 'console',
        transform: ".filter(l => l.level === 'error')",
      });

      expect(mockSendToExtension).toHaveBeenCalledWith('query_buffer', {
        tabId: 1,
        type: 'console',
        transform: ".filter(l => l.level === 'error')",
      });
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].level).toBe('error');
    });

    it('query_buffer console should forward limit transform to extension', async () => {
      const mockLimitedLogs = [createLog('log', 1), createLog('error', 2)];
      mockSendToExtension.mockResolvedValueOnce(mockLimitedLogs);

      const result = await handlers.handle('query_buffer', {
        type: 'console',
        transform: '.slice(0, 2)',
      });

      expect(mockSendToExtension).toHaveBeenCalledWith('query_buffer', {
        tabId: 1,
        type: 'console',
        transform: '.slice(0, 2)',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(2);
    });
  });

  describe('Network Requests via query_buffer', () => {
    beforeEach(async () => {
      await handlers.handle('set_primary_tab', { tabId: 1 });
    });

    it('query_buffer network should forward to extension', async () => {
      const mockRequests = [
        { ...createRequest('r1', 'https://api.com/users', 'GET', 1), statusCode: 200 },
        { ...createRequest('r2', 'https://api.com/posts', 'POST', 2), statusCode: 201 },
      ];
      mockSendToExtension.mockResolvedValueOnce(mockRequests);

      const result = await handlers.handle('query_buffer', { type: 'network', transform: '' });

      expect(mockSendToExtension).toHaveBeenCalledWith('query_buffer', {
        tabId: 1,
        type: 'network',
        transform: '',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(2);
    });

    it('query_buffer network should forward method filter transform to extension', async () => {
      const mockFilteredRequests = [
        { ...createRequest('r2', 'https://api.com/posts', 'POST', 2), statusCode: 201 },
      ];
      mockSendToExtension.mockResolvedValueOnce(mockFilteredRequests);

      const result = await handlers.handle('query_buffer', {
        type: 'network',
        transform: ".filter(r => r.method === 'POST')",
      });

      expect(mockSendToExtension).toHaveBeenCalledWith('query_buffer', {
        tabId: 1,
        type: 'network',
        transform: ".filter(r => r.method === 'POST')",
      });
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].method).toBe('POST');
    });

    it('query_buffer network should forward URL filter transform to extension', async () => {
      const mockFilteredRequests = [
        { ...createRequest('r1', 'https://api.com/users', 'GET', 1), statusCode: 200 },
      ];
      mockSendToExtension.mockResolvedValueOnce(mockFilteredRequests);

      const result = await handlers.handle('query_buffer', {
        type: 'network',
        transform: ".filter(r => r.url.includes('users'))",
      });

      expect(mockSendToExtension).toHaveBeenCalledWith('query_buffer', {
        tabId: 1,
        type: 'network',
        transform: ".filter(r => r.url.includes('users'))",
      });
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].url).toContain('users');
    });
  });

  describe('Navigation & Interaction', () => {
    beforeEach(async () => {
      await handlers.handle('set_primary_tab', { tabId: 1 });
    });

    it('navigate should call extension with correct params', async () => {
      await handlers.handle('navigate', { url: 'https://new-url.com' });

      expect(mockSendToExtension).toHaveBeenCalledWith('navigate', {
        tabId: 1,
        url: 'https://new-url.com',
      });
    });

    it('click_element should call extension', async () => {
      await handlers.handle('click_element', { selector: '#button' });

      expect(mockSendToExtension).toHaveBeenCalledWith('click_element', {
        tabId: 1,
        selector: '#button',
      });
    });

    it('type_text should call extension', async () => {
      await handlers.handle('type_text', { selector: '#input', text: 'Hello' });

      expect(mockSendToExtension).toHaveBeenCalledWith('type_text', {
        tabId: 1,
        selector: '#input',
        text: 'Hello',
      });
    });

    it('execute_script should call extension and return result', async () => {
      mockSendToExtension.mockResolvedValueOnce({ result: 42 });

      const result = await handlers.handle('execute_script', { code: 'return 40 + 2' });

      // Handler maps 'code' to 'script' for the extension
      expect(mockSendToExtension).toHaveBeenCalledWith('execute_script', {
        tabId: 1,
        script: 'return 40 + 2',
        frameId: undefined,
        preview: undefined,
        force: undefined,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.result).toBe(42);
    });
  });

  describe('Buffer Management', () => {
    beforeEach(async () => {
      await handlers.handle('set_primary_tab', { tabId: 1 });
    });

    it('clear_buffer should forward to extension', async () => {
      mockSendToExtension.mockResolvedValueOnce({ success: true });

      await handlers.handle('clear_buffer', { tabId: 1, dataType: 'console' });

      expect(mockSendToExtension).toHaveBeenCalledWith('clear_buffer', {
        tabId: 1,
        dataType: 'console',
      });
    });

    it('get_buffer_stats should forward to extension', async () => {
      const mockStats = {
        totalTabs: 2,
        bufferSizes: {
          1: { consoleLogs: 1, networkRequests: 1, jsErrors: 0, websocket: 0 },
          2: { consoleLogs: 0, networkRequests: 0, jsErrors: 0, websocket: 0 },
        },
      };
      mockSendToExtension.mockResolvedValueOnce(mockStats);

      const result = await handlers.handle('get_buffer_stats', {});

      expect(mockSendToExtension).toHaveBeenCalledWith('get_tab_buffer_summary', {});
      const data = JSON.parse(result.content[0].text);
      expect(data.totalTabs).toBe(2);
      expect(data.bufferSizes[1].consoleLogs).toBe(1);
    });

    it('get_connection_status should return status info', async () => {
      mockSendToExtension.mockResolvedValueOnce([
        { id: 1, url: 'https://example.com', title: 'Test' },
        { id: 2, url: 'https://other.com', title: 'Other' },
      ]);

      const result = await handlers.handle('get_connection_status', {});

      const data = JSON.parse(result.content[0].text);
      // connectionManager defaults to disconnected
      expect(data.extensionConnected).toBe(false);
      expect(data.primaryTabId).toBe(1);
      expect(data.tabCount).toBe(2);
    });

    it('get_connection_status should reflect actual connection state', async () => {
      // Simulate extension connected (passing null disconnects, any truthy value connects)
      connectionManager.setExtensionConnected({} as any);
      mockSendToExtension.mockResolvedValueOnce([
        { id: 1, url: 'https://example.com', title: 'Test' },
      ]);

      const result = await handlers.handle('get_connection_status', {});

      const data = JSON.parse(result.content[0].text);
      expect(data.extensionConnected).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return error for unknown tool', async () => {
      const result = await handlers.handle('unknown_tool', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
    });

    it('should handle extension errors gracefully', async () => {
      mockSendToExtension.mockRejectedValueOnce(new Error('Extension timeout'));
      await handlers.handle('set_primary_tab', { tabId: 1 });

      const result = await handlers.handle('navigate', { url: 'https://test.com' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Extension timeout');
    });
  });
});
