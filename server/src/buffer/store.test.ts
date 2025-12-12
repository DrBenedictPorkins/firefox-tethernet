import { describe, it, expect, vi } from 'vitest';
import { BufferStore } from './store.js';

/**
 * BufferStore has been deprecated - the extension now owns all buffered data.
 * The MCP server is stateless.
 *
 * These tests are kept minimal to verify the deprecation warning works.
 * All functional tests are now in handlers.test.ts which tests the stateless architecture.
 */

describe('BufferStore (Deprecated)', () => {
  it('should warn when instantiated', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    new BufferStore();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'BufferStore is deprecated - server is now stateless. Extension owns all data.'
    );

    consoleWarnSpy.mockRestore();
  });
});
