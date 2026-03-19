/**
 * Preservation Property Tests
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * Property 2: Preservation - NEXT_PUBLIC_API_URL設定時の既存動作維持
 *
 * NEXT_PUBLIC_API_URL が明示的に設定されている場合、修正前後で動作が変わらないことを検証する。
 * これらのテストは修正前のコードで PASS することが期待される（ベースライン動作の確認）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * 有効なベースURL用のarbitrary generator
 * https://xxx.example.com のようなURLを生成する
 */
const baseUrlArb = fc
  .stringMatching(/^[a-z][a-z0-9]{2,10}$/)
  .map((sub) => `https://${sub}.example.com`);

/**
 * APIパスセグメント用のarbitrary generator
 * /api/xxx のようなパスを生成する
 */
const apiPathSegmentArb = fc
  .stringMatching(/^[a-z][a-z\-_]{0,19}$/)
  .map((segment) => `/api/${segment}`);

describe('Preservation: NEXT_PUBLIC_API_URL設定時の既存動作維持', () => {
  const originalEnv = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_API_URL = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_API_URL;
    }
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('Property 2a: NEXT_PUBLIC_API_URL設定時、BASE_URLがその値をそのまま使用し、request関数が ${設定値}${path} パターンでURLを構築する', async () => {
    await fc.assert(
      fc.asyncProperty(baseUrlArb, async (baseUrl) => {
        vi.resetModules();
        process.env.NEXT_PUBLIC_API_URL = baseUrl;

        let capturedUrl = '';
        const mockFetch = vi.fn().mockImplementation(async (url: string) => {
          capturedUrl = url;
          return {
            ok: true,
            json: async () => ([]),
          };
        });
        vi.stubGlobal('fetch', mockFetch);

        try {
          const apiClient = await import('../api-client');
          await apiClient.getFolders();

          // URL は ${baseUrl}/api/folders のパターンであること
          expect(capturedUrl).toBe(`${baseUrl}/api/folders`);
        } finally {
          vi.unstubAllGlobals();
        }
      }),
      { numRuns: 20 },
    );
  });

  it('Property 2b: ランダムなAPIパスに対して、Content-Type と X-User-Id ヘッダーが正しく付与される', async () => {
    await fc.assert(
      fc.asyncProperty(
        baseUrlArb,
        fc.stringMatching(/^[a-z][a-z0-9]{3,12}$/),
        async (baseUrl, userId) => {
          vi.resetModules();
          process.env.NEXT_PUBLIC_API_URL = baseUrl;

          let capturedHeaders: Record<string, string> = {};
          const mockFetch = vi
            .fn()
            .mockImplementation(async (_url: string, init?: RequestInit) => {
              capturedHeaders = (init?.headers as Record<string, string>) ?? {};
              return {
                ok: true,
                json: async () => ([]),
              };
            });
          vi.stubGlobal('fetch', mockFetch);

          try {
            const apiClient = await import('../api-client');
            apiClient.setUserId(userId);
            await apiClient.getFolders();

            // Content-Type ヘッダーが application/json であること
            expect(capturedHeaders['Content-Type']).toBe('application/json');
            // X-User-Id ヘッダーが設定した userId であること
            expect(capturedHeaders['X-User-Id']).toBe(userId);
          } finally {
            vi.unstubAllGlobals();
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});
