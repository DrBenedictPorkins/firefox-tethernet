export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPToolResult {
  [key: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface ExtensionRequest {
  action: string;
  params: Record<string, any>;
  requestId: string;
}

export interface ExtensionResponse {
  requestId: string;
  result?: any;
  error?: string;
}
