/**
 * Bug Condition Exploration Test
 *
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
 *
 * Property 1: Bug Condition - NEXT_PUBLIC_API_URL未設定時にBASE_URLが空文字列にフォールバックし、
 * request関数が相対パス（/api/...）を生成すること。
 *
 * このテストは修正前のコードでは FAIL することが期待される。
 * FAIL = バグの存在が証明された（正しい結果）
 *
 * Bug Condition: isBugCondition(input) where input.env.NEXT_PUBLIC_API_URL is undefined
 *   AND input.apiPath starts with /api/
 * Expected Behavior: BASE_URL === '' かつ URL が localhost:3001 を含まない
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * APIパス用のarbitrary generator
 * /api/ で始まるランダムなパスを生成する
 */
const apiPathArb = fc
  .stringMatching(/^[a-z][a-z\-_]{0,19}$/)
  .map((segment) => `/api/${segment}`);

describe('Bug Condition Exploration: NEXT_PUBLIC_API_URL未設定時のBASE_URLフォールバック', () => {
  const originalEnv = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    // NEXT_PUBLIC_API_URL を未設定にする
    delete process.env.NEXT_PUBLIC_API_URL;
    // モジュールキャッシュをクリアして再読み込みさせる
    vi.resetModules();
  });

  afterEach(() => {
    // 元の環境変数を復元
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_API_URL = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_API_URL;
    }
    vi.resetModules();
  });

  it('Property 1: NEXT_PUBLIC_API_URL未設定時、BASE_URLは空文字列であるべき（localhost:3001にフォールバックしない）', async () => {
    await fc.assert(
      fc.asyncProperty(apiPathArb, async (apiPath) => {
        // モジュールを動的にインポートしてBASE_URLの再評価を強制
        vi.resetModules();
        delete process.env.NEXT_PUBLIC_API_URL;

        // fetchをモックして実際のリクエストを防ぎ、URLをキャプチャする
        let capturedUrl = '';
        const mockFetch = vi.fn().mockImplementation(async (url: string) => {
          capturedUrl = url;
          return {
            ok: true,
            json: async () => ({}),
          };
        });
        vi.stubGlobal('fetch', mockFetch);

        try {
          const apiClient = await import('../api-client');

          // request関数を間接的に呼び出す（getFoldersなどのパブリックAPI経由）
          // ここではcreateFolder を使ってPOST /api/foldersのURLを確認する
          // ただし、直接request関数のURL構築を検証するため、
          // apiPathに対応する関数を呼ぶ代わりに、getFoldersを呼んでURLパターンを確認する
          await apiClient.getFolders().catch(() => {});

          // キャプチャされたURLを検証
          // 期待: 相対パス（/api/folders）であること
          // バグ: http://localhost:3001/api/folders になる
          expect(capturedUrl).not.toContain('localhost:3001');
          expect(capturedUrl).not.toMatch(/^https?:\/\//);
        } finally {
          vi.unstubAllGlobals();
        }
      }),
      { numRuns: 10 },
    );
  });
});
