import { CONFIG } from '../utils/config.js';
import type {
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

export class BufferStore {
  private tabs = new Map<number, TabBuffer>();

  private createBuffer(tabInfo: TabInfo): TabBuffer {
    return {
      tabInfo,
      consoleLogs: [],
      networkRequests: [],
      webSocketMessages: [],
      jsErrors: [],
      domSnapshots: [],
      screenshots: [],
      storageData: {},
      cookies: [],
      performanceMetrics: [],
      lastActivity: Date.now(),
    };
  }

  private getOrCreateBuffer(tabId: number, url: string = '', title: string = ''): TabBuffer {
    let buffer = this.tabs.get(tabId);
    if (!buffer) {
      buffer = this.createBuffer({
        id: tabId,
        url,
        title,
        active: false,
        windowId: 0,
        index: 0,
      });
      this.tabs.set(tabId, buffer);
    }
    buffer.lastActivity = Date.now();
    return buffer;
  }

  addConsoleLog(tabId: number, entry: ConsoleLogEntry): void {
    const buffer = this.getOrCreateBuffer(tabId);
    buffer.consoleLogs.push(entry);

    // FIFO eviction
    if (buffer.consoleLogs.length > CONFIG.buffer.maxConsoleLogs) {
      buffer.consoleLogs.shift();
    }
  }

  addNetworkRequest(tabId: number, request: NetworkRequest): void {
    const buffer = this.getOrCreateBuffer(tabId);
    buffer.networkRequests.push(request);

    // FIFO eviction
    if (buffer.networkRequests.length > CONFIG.buffer.maxNetworkRequests) {
      buffer.networkRequests.shift();
    }
  }

  updateNetworkResponse(
    tabId: number,
    requestId: string,
    response: Partial<NetworkRequest>
  ): void {
    const buffer = this.tabs.get(tabId);
    if (!buffer) return;

    const request = buffer.networkRequests.find(r => r.requestId === requestId);
    if (request) {
      Object.assign(request, response);
      if (request.responseTimestamp && request.timestamp) {
        request.duration = request.responseTimestamp - request.timestamp;
      }
    }
  }

  addWebSocketMessage(tabId: number, message: WebSocketMessage): void {
    const buffer = this.getOrCreateBuffer(tabId);
    buffer.webSocketMessages.push(message);

    // FIFO eviction
    if (buffer.webSocketMessages.length > CONFIG.buffer.maxWebSocketMessages) {
      buffer.webSocketMessages.shift();
    }
  }

  addJSError(tabId: number, error: JSError): void {
    const buffer = this.getOrCreateBuffer(tabId);
    buffer.jsErrors.push(error);

    // FIFO eviction
    if (buffer.jsErrors.length > CONFIG.buffer.maxJSErrors) {
      buffer.jsErrors.shift();
    }
  }

  addDOMSnapshot(tabId: number, snapshot: DOMSnapshot): void {
    const buffer = this.getOrCreateBuffer(tabId);
    buffer.domSnapshots.push(snapshot);

    // FIFO eviction
    if (buffer.domSnapshots.length > CONFIG.buffer.maxDOMSnapshots) {
      buffer.domSnapshots.shift();
    }
  }

  addScreenshot(tabId: number, screenshot: Screenshot): void {
    const buffer = this.getOrCreateBuffer(tabId);
    buffer.screenshots.push(screenshot);

    // FIFO eviction
    if (buffer.screenshots.length > CONFIG.buffer.maxScreenshots) {
      buffer.screenshots.shift();
    }
  }

  setStorageData(tabId: number, storage: StorageData): void {
    const buffer = this.getOrCreateBuffer(tabId);
    buffer.storageData[storage.type] = storage;
  }

  setCookies(tabId: number, cookies: Cookie[]): void {
    const buffer = this.getOrCreateBuffer(tabId);
    buffer.cookies = cookies;
  }

  addPerformanceMetrics(tabId: number, metrics: PerformanceMetrics): void {
    const buffer = this.getOrCreateBuffer(tabId);
    buffer.performanceMetrics.push(metrics);

    // FIFO eviction
    if (buffer.performanceMetrics.length > CONFIG.buffer.maxPerformanceMetrics) {
      buffer.performanceMetrics.shift();
    }
  }

  updateTab(tabInfo: TabInfo): void {
    const buffer = this.getOrCreateBuffer(tabInfo.id);
    buffer.tabInfo = tabInfo;
  }

  removeTab(tabId: number): void {
    this.tabs.delete(tabId);
  }

  setTabs(tabs: TabInfo[]): void {
    // Update existing tabs and add new ones
    const currentTabIds = new Set(tabs.map(t => t.id));

    // Remove tabs that no longer exist
    for (const tabId of this.tabs.keys()) {
      if (!currentTabIds.has(tabId)) {
        this.tabs.delete(tabId);
      }
    }

    // Update or create buffers for current tabs
    for (const tab of tabs) {
      this.updateTab(tab);
    }
  }

  getTabCount(): number {
    return this.tabs.size;
  }

  getStats(): Record<string, any> {
    const stats: Record<string, any> = {
      totalTabs: this.tabs.size,
      bufferSizes: {} as Record<number, any>,
    };

    for (const [tabId, buffer] of this.tabs) {
      stats.bufferSizes[tabId] = {
        consoleLogs: buffer.consoleLogs.length,
        networkRequests: buffer.networkRequests.length,
        webSocketMessages: buffer.webSocketMessages.length,
        jsErrors: buffer.jsErrors.length,
        domSnapshots: buffer.domSnapshots.length,
        screenshots: buffer.screenshots.length,
        performanceMetrics: buffer.performanceMetrics.length,
      };
    }

    return stats;
  }

  getTab(tabId: number): TabInfo | undefined {
    return this.tabs.get(tabId)?.tabInfo;
  }

  getAllTabs(): TabInfo[] {
    return Array.from(this.tabs.values()).map(b => b.tabInfo);
  }

  getConsoleLogs(tabId: number, level?: string, limit?: number): ConsoleLogEntry[] {
    const buffer = this.tabs.get(tabId);
    if (!buffer) return [];

    let logs = buffer.consoleLogs;
    if (level) {
      logs = logs.filter(log => log.level === level);
    }

    if (limit && limit > 0) {
      logs = logs.slice(-limit);
    }

    return logs;
  }

  getNetworkRequests(
    tabId: number,
    filters?: { method?: string; urlPattern?: string; statusCode?: number }
  ): NetworkRequest[] {
    const buffer = this.tabs.get(tabId);
    if (!buffer) return [];

    let requests = buffer.networkRequests;

    if (filters) {
      if (filters.method) {
        requests = requests.filter(r => r.method === filters.method);
      }
      if (filters.urlPattern) {
        const pattern = new RegExp(filters.urlPattern);
        requests = requests.filter(r => pattern.test(r.url));
      }
      if (filters.statusCode) {
        requests = requests.filter(r => r.statusCode === filters.statusCode);
      }
    }

    return requests;
  }

  getWebSocketMessages(tabId: number, url?: string, limit?: number): WebSocketMessage[] {
    const buffer = this.tabs.get(tabId);
    if (!buffer) return [];

    let messages = buffer.webSocketMessages;
    if (url) {
      messages = messages.filter(m => m.url === url);
    }

    if (limit && limit > 0) {
      messages = messages.slice(-limit);
    }

    return messages;
  }

  getJSErrors(tabId: number, limit?: number): JSError[] {
    const buffer = this.tabs.get(tabId);
    if (!buffer) return [];

    let errors = buffer.jsErrors;
    if (limit && limit > 0) {
      errors = errors.slice(-limit);
    }

    return errors;
  }

  getDOMSnapshots(tabId: number): DOMSnapshot[] {
    const buffer = this.tabs.get(tabId);
    return buffer?.domSnapshots || [];
  }

  getScreenshots(tabId: number): Screenshot[] {
    const buffer = this.tabs.get(tabId);
    return buffer?.screenshots || [];
  }

  getStorageData(tabId: number, type: 'local' | 'session'): StorageData | undefined {
    const buffer = this.tabs.get(tabId);
    return buffer?.storageData[type];
  }

  getCookies(tabId: number): Cookie[] {
    const buffer = this.tabs.get(tabId);
    return buffer?.cookies || [];
  }

  getPerformanceMetrics(tabId: number): PerformanceMetrics[] {
    const buffer = this.tabs.get(tabId);
    return buffer?.performanceMetrics || [];
  }

  clearBuffer(tabId: number, dataType?: string): void {
    const buffer = this.tabs.get(tabId);
    if (!buffer) return;

    if (!dataType) {
      // Clear all buffers
      buffer.consoleLogs = [];
      buffer.networkRequests = [];
      buffer.webSocketMessages = [];
      buffer.jsErrors = [];
      buffer.domSnapshots = [];
      buffer.screenshots = [];
      buffer.storageData = {};
      buffer.cookies = [];
      buffer.performanceMetrics = [];
    } else {
      // Clear specific buffer
      switch (dataType) {
        case 'console':
          buffer.consoleLogs = [];
          break;
        case 'network':
          buffer.networkRequests = [];
          break;
        case 'websocket':
          buffer.webSocketMessages = [];
          break;
        case 'errors':
          buffer.jsErrors = [];
          break;
        case 'dom':
          buffer.domSnapshots = [];
          break;
        case 'screenshots':
          buffer.screenshots = [];
          break;
        case 'storage':
          buffer.storageData = {};
          break;
        case 'cookies':
          buffer.cookies = [];
          break;
        case 'performance':
          buffer.performanceMetrics = [];
          break;
      }
    }
  }

  clearAllBuffers(): void {
    this.tabs.clear();
  }
}
