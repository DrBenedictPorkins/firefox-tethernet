export interface TabInfo {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  active: boolean;
  windowId: number;
  index: number;
}

export interface ConsoleLogEntry {
  timestamp: number;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: any[];
  stackTrace?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface NetworkRequest {
  requestId: string;
  timestamp: number;
  url: string;
  method: string;
  requestHeaders?: Record<string, string>;
  requestBody?: any;

  // Response data (filled in later)
  responseTimestamp?: number;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: any;
  responseSize?: number;
  duration?: number;
  error?: string;
}

export interface WebSocketMessage {
  timestamp: number;
  url: string;
  direction: 'send' | 'receive';
  data: any;
  size: number;
}

export interface DOMSnapshot {
  timestamp: number;
  html: string;
  url: string;
  viewport: {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
  };
}

export interface Screenshot {
  timestamp: number;
  dataUrl: string;
  width: number;
  height: number;
  format: 'png' | 'jpeg';
}

export interface StorageData {
  timestamp: number;
  type: 'local' | 'session';
  data: Record<string, any>;
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
}

export interface PerformanceMetrics {
  timestamp: number;
  url: string;
  metrics: {
    navigationStart?: number;
    domContentLoaded?: number;
    loadComplete?: number;
    firstPaint?: number;
    firstContentfulPaint?: number;
    timeToInteractive?: number;
    totalPageSize?: number;
    resourceCount?: number;
    jsHeapSize?: number;
    domNodes?: number;
  };
}

export interface JSError {
  timestamp: number;
  message: string;
  stack?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  type: string;
}

export interface TabBuffer {
  tabInfo: TabInfo;
  consoleLogs: ConsoleLogEntry[];
  networkRequests: NetworkRequest[];
  webSocketMessages: WebSocketMessage[];
  jsErrors: JSError[];
  domSnapshots: DOMSnapshot[];
  screenshots: Screenshot[];
  storageData: {
    local?: StorageData;
    session?: StorageData;
  };
  cookies: Cookie[];
  performanceMetrics: PerformanceMetrics[];
  lastActivity: number;
}

export interface BufferStore {
  tabs: Map<number, TabBuffer>;
}
