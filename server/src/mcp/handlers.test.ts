import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolHandlers } from './handlers.js';
import { BufferStore } from '../buffer/store.js';
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
  let bufferStore: BufferStore;
  let connectionManager: ConnectionManager;
  let mockSendToExtension: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    bufferStore = new BufferStore();
    connectionManager = new ConnectionManager();
    mockSendToExtension = vi.fn().mockResolvedValue({ success: true });
    handlers = new ToolHandlers(bufferStore, mockSendToExtension, connectionManager);

    // Setup some test data
    bufferStore.updateTab(createTab(1, 'https://example.com', 'Test', true));
    bufferStore.updateTab(createTab(2, 'https://other.com', 'Other', false));
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

    it('close_tab should remove tab from buffer', async () => {
      await handlers.handle('close_tab', { tabId: 1 });

      expect(mockSendToExtension).toHaveBeenCalledWith('close_tab', { tabId: 1 });
      expect(bufferStore.getTab(1)).toBeUndefined();
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
      const result = await handlers.handle('get_console_logs', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No tab specified');
    });

    it('should use explicit tabId even without primary', async () => {
      bufferStore.addConsoleLog(1, createLog('log', Date.now()));

      const result = await handlers.handle('get_console_logs', { tabId: 1 });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
    });

    it('should use primary tab when tabId not provided', async () => {
      await handlers.handle('set_primary_tab', { tabId: 1 });
      bufferStore.addConsoleLog(1, createLog('log', Date.now()));

      const result = await handlers.handle('get_console_logs', {});

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
    });
  });

  describe('Console Logs', () => {
    beforeEach(async () => {
      await handlers.handle('set_primary_tab', { tabId: 1 });
      bufferStore.addConsoleLog(1, createLog('log', 1));
      bufferStore.addConsoleLog(1, createLog('error', 2));
      bufferStore.addConsoleLog(1, createLog('warn', 3));
    });

    it('get_console_logs should return all logs', async () => {
      const result = await handlers.handle('get_console_logs', {});

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(3);
    });

    it('get_console_logs should filter by level', async () => {
      const result = await handlers.handle('get_console_logs', { level: 'error' });

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].level).toBe('error');
    });

    it('get_console_logs should respect limit', async () => {
      const result = await handlers.handle('get_console_logs', { limit: 2 });

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(2);
    });
  });

  describe('Network Requests', () => {
    beforeEach(async () => {
      await handlers.handle('set_primary_tab', { tabId: 1 });
      bufferStore.addNetworkRequest(1, createRequest('r1', 'https://api.com/users', 'GET', 1));
      bufferStore.addNetworkRequest(1, createRequest('r2', 'https://api.com/posts', 'POST', 2));
      bufferStore.updateNetworkResponse(1, 'r1', { statusCode: 200 });
      bufferStore.updateNetworkResponse(1, 'r2', { statusCode: 201 });
    });

    it('get_network_requests should return all requests', async () => {
      const result = await handlers.handle('get_network_requests', {});

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(2);
    });

    it('get_network_requests should filter by method', async () => {
      const result = await handlers.handle('get_network_requests', { method: 'POST' });

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].method).toBe('POST');
    });

    it('get_network_requests should filter by URL pattern', async () => {
      const result = await handlers.handle('get_network_requests', { urlPattern: 'users' });

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
      bufferStore.addConsoleLog(1, createLog('log', 1));
      bufferStore.addNetworkRequest(1, createRequest('r1', '/api', 'GET', 1));
    });

    it('clear_buffer should clear specified buffer', async () => {
      await handlers.handle('clear_buffer', { tabId: 1, dataType: 'console' });

      expect(bufferStore.getConsoleLogs(1)).toHaveLength(0);
      expect(bufferStore.getNetworkRequests(1)).toHaveLength(1);
    });

    it('get_buffer_stats should return statistics', async () => {
      const result = await handlers.handle('get_buffer_stats', {});

      const data = JSON.parse(result.content[0].text);
      expect(data.totalTabs).toBe(2);
      expect(data.bufferSizes[1].consoleLogs).toBe(1);
    });

    it('get_connection_status should return status info', async () => {
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
