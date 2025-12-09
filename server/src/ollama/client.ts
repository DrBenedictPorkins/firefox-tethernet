/**
 * Simple fetch-based Ollama API client
 * No SDK dependency - just native fetch
 */

import { ollamaConfig } from '../utils/config.js';

export interface OllamaGenerateResponse {
  response: string;
  model: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

/**
 * Check if Ollama server is reachable
 */
export async function checkOllamaConnection(): Promise<boolean> {
  if (!ollamaConfig.enabled || !ollamaConfig.baseUrl) {
    return false;
  }

  try {
    const response = await fetch(`${ollamaConfig.baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout for health check
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Generate a response from Ollama
 * @param prompt - The full prompt including any context (e.g., HTML + instructions)
 * @param model - Model to use (defaults to config default)
 * @param numCtx - Context window size (default: 32768 for large HTML pages)
 * @returns The model's response text
 * @throws Error if Ollama is unavailable or returns an error
 */
export async function ollamaGenerate(
  prompt: string,
  model?: string,
  numCtx: number = 32768
): Promise<string> {
  if (!ollamaConfig.enabled || !ollamaConfig.baseUrl) {
    throw new Error('Ollama is not configured. Set OLLAMA_BASE_URL environment variable.');
  }

  const selectedModel = model || ollamaConfig.defaultModel;

  try {
    const response = await fetch(`${ollamaConfig.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        prompt,
        stream: false,
        options: {
          num_ctx: numCtx,
          temperature: 0,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as OllamaGenerateResponse;
    return data.response;
  } catch (error) {
    if (error instanceof Error) {
      // Check for connection errors
      if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
        throw new Error(`Could not connect to Ollama at ${ollamaConfig.baseUrl}`);
      }
      throw error;
    }
    throw new Error('Unknown error during Ollama generation');
  }
}
