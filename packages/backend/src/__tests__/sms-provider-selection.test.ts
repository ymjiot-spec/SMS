/**
 * SMS Provider Selection — プロバイダー選択プロパティテスト
 *
 * Bug Condition: createApp() が deps.smsProvider なしで呼び出され、
 * MEDIASMS_USERNAME / MEDIASMS_PASSWORD が設定されている場合、
 * Media4uProvider が使用されるべきだが、現在は常に MockProvider が使用される。
 *
 * Validates: Requirements 1.1, 2.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// We spy on the provider constructors to detect which one is instantiated
const media4uConstructorSpy = vi.fn();
const mockConstructorSpy = vi.fn();

// Mock Media4uProvider before importing app
vi.mock('../providers/media4u-provider.js', () => {
  return {
    Media4uProvider: class Media4uProvider {
      constructor(...args: unknown[]) {
        media4uConstructorSpy(...args);
      }
      async sendMessage() {
        return { success: true, externalMessageId: 'mock-ext-1', status: 'sent' };
      }
      async getDeliveryStatus() {
        return { externalMessageId: '', status: 'unknown', updatedAt: new Date() };
      }
      async validateConfig() {
        return { valid: true, errors: [] };
      }
    },
  };
});

vi.mock('../providers/mock-provider.js', () => {
  return {
    MockProvider: class MockProvider {
      constructor(...args: unknown[]) {
        mockConstructorSpy(...args);
      }
      async sendMessage() {
        return { success: true, externalMessageId: 'mock-1', status: 'queued' };
      }
      async getDeliveryStatus() {
        return { externalMessageId: '', status: 'unknown', updatedAt: new Date() };
      }
      async validateConfig() {
        return { valid: true, errors: [] };
      }
    },
  };
});

// Mock prisma to avoid DB connection
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    smsLog: { create: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    template: { findMany: vi.fn() },
    company: { findMany: vi.fn() },
  },
}));

describe('Property 1: Bug Condition — 環境変数設定時に Media4uProvider が使用されるべき', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original env values
    savedEnv.MEDIASMS_USERNAME = process.env.MEDIASMS_USERNAME;
    savedEnv.MEDIASMS_PASSWORD = process.env.MEDIASMS_PASSWORD;
    // Clear spies
    media4uConstructorSpy.mockClear();
    mockConstructorSpy.mockClear();
  });

  afterEach(() => {
    // Restore original env values
    if (savedEnv.MEDIASMS_USERNAME === undefined) {
      delete process.env.MEDIASMS_USERNAME;
    } else {
      process.env.MEDIASMS_USERNAME = savedEnv.MEDIASMS_USERNAME;
    }
    if (savedEnv.MEDIASMS_PASSWORD === undefined) {
      delete process.env.MEDIASMS_PASSWORD;
    } else {
      process.env.MEDIASMS_PASSWORD = savedEnv.MEDIASMS_PASSWORD;
    }
    // Reset module registry so createApp re-reads env vars
    vi.resetModules();
  });

  it('for any non-empty username/password, createApp() without deps.smsProvider should use Media4uProvider', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        async (username, password) => {
          // Reset spies for each iteration
          media4uConstructorSpy.mockClear();
          mockConstructorSpy.mockClear();

          // Set env vars
          process.env.MEDIASMS_USERNAME = username;
          process.env.MEDIASMS_PASSWORD = password;

          // Re-import createApp with fresh module state
          vi.resetModules();
          const { createApp } = await import('../app.js');

          // Call createApp without deps.smsProvider
          createApp();

          // Property: Media4uProvider should have been constructed
          expect(media4uConstructorSpy).toHaveBeenCalled();
          // Property: MockProvider should NOT have been constructed
          expect(mockConstructorSpy).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 10 },
    );
  });
});


/**
 * Property 2: Preservation — 既存プロバイダー選択動作の保全
 *
 * These tests verify that existing provider selection behavior is preserved:
 * - deps.smsProvider が渡された場合はそのまま使用
 * - 環境変数未設定時は MockProvider をフォールバック
 * - 片方の環境変数のみ設定時は MockProvider をフォールバック
 * - 空文字の環境変数は MockProvider をフォールバック
 *
 * Validates: Requirements 3.1, 3.2
 */
describe('Property 2: Preservation — 既存プロバイダー選択動作の保全', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.MEDIASMS_USERNAME = process.env.MEDIASMS_USERNAME;
    savedEnv.MEDIASMS_PASSWORD = process.env.MEDIASMS_PASSWORD;
    media4uConstructorSpy.mockClear();
    mockConstructorSpy.mockClear();
  });

  afterEach(() => {
    if (savedEnv.MEDIASMS_USERNAME === undefined) {
      delete process.env.MEDIASMS_USERNAME;
    } else {
      process.env.MEDIASMS_USERNAME = savedEnv.MEDIASMS_USERNAME;
    }
    if (savedEnv.MEDIASMS_PASSWORD === undefined) {
      delete process.env.MEDIASMS_PASSWORD;
    } else {
      process.env.MEDIASMS_PASSWORD = savedEnv.MEDIASMS_PASSWORD;
    }
    vi.resetModules();
  });

  /**
   * deps.smsProvider 渡し時の保全
   * When createApp({ smsProvider: customProvider }) is called,
   * the custom provider is used — neither Media4uProvider nor MockProvider constructors are called.
   *
   * **Validates: Requirements 3.1**
   */
  it('for any custom smsProvider passed via deps, neither Media4uProvider nor MockProvider constructors are called for the explicit call', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (_label) => {
          // Ensure env vars are cleared so they don't interfere
          delete process.env.MEDIASMS_USERNAME;
          delete process.env.MEDIASMS_PASSWORD;

          vi.resetModules();
          const { createApp } = await import('../app.js');

          // Clear spies AFTER import — the module-level createApp() at the bottom of app.ts
          // triggers MockProvider constructor, so we must clear after that runs.
          media4uConstructorSpy.mockClear();
          mockConstructorSpy.mockClear();

          // Create a custom provider that satisfies the SmsProvider interface
          const customProvider = {
            sendMessage: async () => ({ success: true, externalMessageId: 'custom-1', status: 'sent' as const }),
            getDeliveryStatus: async () => ({ externalMessageId: '', status: 'unknown' as const, updatedAt: new Date() }),
            validateConfig: async () => ({ valid: true, errors: [] }),
          };

          createApp({ smsProvider: customProvider as any });

          // Neither provider constructor should have been called for our explicit createApp call
          expect(media4uConstructorSpy).not.toHaveBeenCalled();
          expect(mockConstructorSpy).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 5 },
    );
  });

  /**
   * 環境変数未設定時の保全
   * When env vars are NOT set and no deps.smsProvider, MockProvider is used as fallback.
   *
   * **Validates: Requirements 3.2**
   */
  it('when env vars are not set and no deps.smsProvider, MockProvider is used as fallback', async () => {
    delete process.env.MEDIASMS_USERNAME;
    delete process.env.MEDIASMS_PASSWORD;

    media4uConstructorSpy.mockClear();
    mockConstructorSpy.mockClear();

    vi.resetModules();
    const { createApp } = await import('../app.js');

    createApp();

    expect(mockConstructorSpy).toHaveBeenCalled();
    expect(media4uConstructorSpy).not.toHaveBeenCalled();
  });

  /**
   * MEDIASMS_USERNAME のみ設定時
   * When only MEDIASMS_USERNAME is set (no password), MockProvider should be used.
   *
   * **Validates: Requirements 3.2**
   */
  it('when only MEDIASMS_USERNAME is set (no password), MockProvider is used', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        async (username) => {
          media4uConstructorSpy.mockClear();
          mockConstructorSpy.mockClear();

          process.env.MEDIASMS_USERNAME = username;
          delete process.env.MEDIASMS_PASSWORD;

          vi.resetModules();
          const { createApp } = await import('../app.js');

          createApp();

          expect(mockConstructorSpy).toHaveBeenCalled();
          expect(media4uConstructorSpy).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 5 },
    );
  });

  /**
   * MEDIASMS_PASSWORD のみ設定時
   * When only MEDIASMS_PASSWORD is set (no username), MockProvider should be used.
   *
   * **Validates: Requirements 3.2**
   */
  it('when only MEDIASMS_PASSWORD is set (no username), MockProvider is used', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        async (password) => {
          media4uConstructorSpy.mockClear();
          mockConstructorSpy.mockClear();

          delete process.env.MEDIASMS_USERNAME;
          process.env.MEDIASMS_PASSWORD = password;

          vi.resetModules();
          const { createApp } = await import('../app.js');

          createApp();

          expect(mockConstructorSpy).toHaveBeenCalled();
          expect(media4uConstructorSpy).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 5 },
    );
  });

  /**
   * 空文字の環境変数
   * When env vars are empty strings, MockProvider should be used.
   *
   * **Validates: Requirements 3.2**
   */
  it('when env vars are empty strings, MockProvider is used', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('', ' ', '  '),
        fc.constantFrom('', ' ', '  '),
        async (username, password) => {
          media4uConstructorSpy.mockClear();
          mockConstructorSpy.mockClear();

          process.env.MEDIASMS_USERNAME = username;
          process.env.MEDIASMS_PASSWORD = password;

          vi.resetModules();
          const { createApp } = await import('../app.js');

          createApp();

          expect(mockConstructorSpy).toHaveBeenCalled();
          expect(media4uConstructorSpy).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 5 },
    );
  });
});
