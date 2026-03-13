export const CONFIG = {
  websocket: {
    path: '/extension',
    pingInterval: 30000,
    host: process.env.TETHERNET_HOST || '127.0.0.1',
  },
  buffer: {
    maxConsoleLogs: 1000,
    maxNetworkRequests: 500,
    maxWebSocketMessages: 500,
    maxJSErrors: 200,
    maxDOMSnapshots: 10,
    maxScreenshots: 5,
    maxPerformanceMetrics: 100,
  },
  logging: {
    enabled: true,
    directory: 'logs',
  },
} as const;

// Ollama configuration from environment variables
export const ollamaConfig = {
  baseUrl: process.env.OLLAMA_BASE_URL || null,
  defaultModel: process.env.OLLAMA_DEFAULT_MODEL || 'qwen2.5:32b',
  enabled: !!process.env.OLLAMA_BASE_URL,
} as const;
