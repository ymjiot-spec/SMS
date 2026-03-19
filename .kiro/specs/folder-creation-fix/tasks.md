# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - NEXT_PUBLIC_API_URL未設定時にBASE_URLが絶対URL（localhost:3001）にフォールバックする
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: `NEXT_PUBLIC_API_URL` が未設定（undefined）の場合に `BASE_URL` が空文字列であること、および `request` 関数が相対パス（`/api/...`）を生成することをテストする
  - テストファイル: `packages/web/src/lib/__tests__/api-client-bugfix.test.ts`
  - vitest + fast-check を使用してプロパティベーステストを作成する
  - `NEXT_PUBLIC_API_URL` を未設定にした状態で、ランダムなAPIパス（`/api/folders`, `/api/templates` 等）に対して `BASE_URL` が空文字列であり、生成されるURLが相対パスであることをアサートする
  - Bug Condition: `isBugCondition(input)` where `input.env.NEXT_PUBLIC_API_URL` is undefined AND `input.apiPath` starts with `/api/`
  - Expected Behavior: `BASE_URL === ''` かつ URL が `localhost:3001` を含まない
  - 修正前コードでは `BASE_URL` が `http://localhost:3001` にフォールバックするため、テストは FAIL する（これがバグの存在を証明する）
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found: `BASE_URL` が `http://localhost:3001` であり、`request` が `http://localhost:3001/api/folders` のような絶対URLを生成する
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - NEXT_PUBLIC_API_URL設定時の既存動作維持
  - **IMPORTANT**: Follow observation-first methodology
  - テストファイル: `packages/web/src/lib/__tests__/api-client-preservation.test.ts`
  - vitest + fast-check を使用してプロパティベーステストを作成する
  - Observe: `NEXT_PUBLIC_API_URL=https://api.example.com` 設定時に `BASE_URL` が `https://api.example.com` となることを修正前コードで確認
  - Observe: `request` 関数が `https://api.example.com/api/folders` のようなURLを生成することを修正前コードで確認
  - Observe: `X-User-Id` ヘッダー、`Content-Type: application/json` ヘッダーが付与されることを確認
  - Write property-based test: ランダムなURL文字列を `NEXT_PUBLIC_API_URL` に設定した場合、`BASE_URL` がその値をそのまま使用し、`request` 関数が `${設定値}${path}` パターンでURLを構築することを検証
  - Write property-based test: ランダムなAPIパスに対して、ヘッダー（`Content-Type`, `X-User-Id`）が修正前後で同一であることを検証
  - Verify test passes on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix for NEXT_PUBLIC_API_URL未設定時のERR_CONNECTION_REFUSED

  - [x] 3.1 Implement the fix - BASE_URLフォールバック値の変更
    - `packages/web/src/lib/api-client.ts` の `BASE_URL` フォールバック値を `'http://localhost:3001'` から `''`（空文字列）に変更する
    - Before: `const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';`
    - After: `const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';`
    - _Bug_Condition: isBugCondition(input) where input.env.NEXT_PUBLIC_API_URL is undefined_
    - _Expected_Behavior: BASE_URL === '' かつ request関数が相対パス（/api/...）を生成する_
    - _Preservation: NEXT_PUBLIC_API_URL設定時はその値をそのまま使用する_
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1_

  - [x] 3.2 Implement the fix - Next.js rewrites設定の追加
    - `packages/web/next.config.mjs` に `rewrites` 非同期関数を追加する
    - `/api/:path*` パターンのリクエストを `${process.env.API_URL ?? 'http://localhost:3001'}/api/:path*` に転送する
    - サーバーサイド環境変数 `API_URL` を使用（`NEXT_PUBLIC_` プレフィックスなし）
    - _Bug_Condition: rewrites未設定のため相対パスリクエストがバックエンドに転送されない_
    - _Expected_Behavior: /api/:path* がバックエンドに転送される_
    - _Preservation: 既存のheaders設定は変更しない_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - NEXT_PUBLIC_API_URL未設定時にBASE_URLが空文字列にフォールバックする
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - NEXT_PUBLIC_API_URL設定時の既存動作維持
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - 全てのテスト（bug condition exploration test, preservation tests）が通ることを確認する
  - `cd packages/web && npx vitest --run` を実行して全テストがパスすることを検証する
  - 問題が発生した場合はユーザーに確認する
