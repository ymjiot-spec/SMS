# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - 環境変数設定時に MockProvider が使用されるバグ
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete failing case: `createApp()` を `deps.smsProvider` なしで呼び出し、`MEDIASMS_USERNAME` と `MEDIASMS_PASSWORD` が設定されている状態
  - Create test file `packages/backend/src/__tests__/sms-provider-selection.test.ts`
  - Set `process.env.MEDIASMS_USERNAME` and `process.env.MEDIASMS_PASSWORD` to non-empty values before calling `createApp()` without `deps.smsProvider`
  - Property: for any non-empty username/password combination, the provider used by the app should be `Media4uProvider` (not `MockProvider`)
  - Use `fast-check` to generate arbitrary non-empty string pairs for username/password
  - Assert that the SMS provider instance is `Media4uProvider` (from Bug Condition in design: `isBugCondition(input)` where `deps?.smsProvider IS undefined AND env.MEDIASMS_USERNAME IS defined AND env.MEDIASMS_PASSWORD IS defined AND providerUsed IS MockProvider`)
  - Expected behavior from design: `Media4uProvider` がインスタンス化されSMSプロバイダーとして使用される
  - To verify provider type: intercept or inspect the provider passed to `SmsService` (e.g., mock `SmsService` constructor or check provider constructor name)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists because `MockProvider` is always used regardless of env vars)
  - Document counterexamples found (e.g., "with MEDIASMS_USERNAME='test_user', MEDIASMS_PASSWORD='test_pass', provider is MockProvider instead of Media4uProvider")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 2.1_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - 既存プロバイダー選択動作の保全
  - **IMPORTANT**: Follow observation-first methodology
  - Create preservation tests in `packages/backend/src/__tests__/sms-provider-selection.test.ts` (same file as task 1)
  - Observe on UNFIXED code: `createApp({ smsProvider: customMockProvider })` → `customMockProvider` がそのまま使用される
  - Observe on UNFIXED code: `createApp()` with no env vars → `MockProvider` が使用される
  - Observe on UNFIXED code: `createApp()` with only `MEDIASMS_USERNAME` set (no password) → `MockProvider` が使用される
  - Observe on UNFIXED code: `createApp()` with only `MEDIASMS_PASSWORD` set (no username) → `MockProvider` が使用される
  - Observe on UNFIXED code: `createApp()` with empty string env vars → `MockProvider` が使用される
  - Write property-based test with `fast-check`: for all cases where `deps.smsProvider` is provided, the provided provider is used (from Preservation Requirements: 3.1)
  - Write property-based test: for all cases where env vars are missing/empty (isBugCondition returns false), `MockProvider` is used as fallback (from Preservation Requirements: 3.2)
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2_

- [x] 3. Fix for SMS プロバイダー切り替えロジック欠落

  - [x] 3.1 Implement the fix in `packages/backend/src/app.ts`
    - Add import: `import { Media4uProvider } from './providers/media4u-provider.js';`
    - Add import: `import type { SmsProvider } from './providers/sms-provider.js';`
    - Change `deps.smsProvider` type from `InstanceType<typeof MockProvider>` to `SmsProvider` in `createApp()` parameter
    - Replace provider initialization logic:
      - Current: `const smsProvider = deps?.smsProvider ?? new MockProvider();`
      - New: Check `process.env.MEDIASMS_USERNAME` and `process.env.MEDIASMS_PASSWORD`; if both are non-empty, instantiate `Media4uProvider({ username, password })`; otherwise fallback to `new MockProvider()`
    - Add provider name log output: `console.log(\`SMS Provider: ${smsProvider.constructor.name}\`);`
    - _Bug_Condition: isBugCondition(input) where deps?.smsProvider IS undefined AND env.MEDIASMS_USERNAME IS defined AND non-empty AND env.MEDIASMS_PASSWORD IS defined AND non-empty AND providerUsed IS MockProvider_
    - _Expected_Behavior: Media4uProvider がインスタンス化されSMSプロバイダーとして使用される_
    - _Preservation: deps.smsProvider が渡された場合はそのまま使用、環境変数未設定時は MockProvider をフォールバック_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - 環境変数設定時に Media4uProvider が使用される
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed - `Media4uProvider` is now used when env vars are set)
    - _Requirements: 2.1, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - 既存プロバイダー選択動作の保全
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix (deps.smsProvider 渡し時、環境変数未設定時の動作が変わらないこと)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to ensure no regressions
  - Verify both Property 1 (bug condition) and Property 2 (preservation) tests pass
  - Ensure existing tests in `packages/backend/src/__tests__/` still pass
  - Ask the user if questions arise
