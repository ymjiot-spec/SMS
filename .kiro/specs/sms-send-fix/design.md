# SMS送信プロバイダー切り替え不具合 Bugfix Design

## Overview

`app.ts` の `createApp()` 関数が環境変数 `MEDIASMS_USERNAME` / `MEDIASMS_PASSWORD` を無視し、常に `MockProvider` をインスタンス化している。これにより、本番環境でもSMSが実際に送信されず、成功レスポンスだけが返される。修正は `createApp()` 内のプロバイダー初期化ロジックに環境変数チェックを追加し、`server.ts` に既に存在する正しいパターンを適用する。変更範囲は `app.ts` の1箇所のみで、既存のテスト・サービス層には影響しない。

## Glossary

- **Bug_Condition (C)**: `createApp()` が `deps.smsProvider` なしで呼び出され、かつ環境変数 `MEDIASMS_USERNAME` および `MEDIASMS_PASSWORD` が設定されている状態
- **Property (P)**: Bug Condition が成立する場合、`Media4uProvider` がインスタンス化されSMSプロバイダーとして使用されること
- **Preservation**: `deps.smsProvider` が渡された場合はそのまま使用、環境変数未設定時は `MockProvider` をフォールバック、既存のSMS送信・ログ記録・エラーハンドリング動作が変更されないこと
- **createApp()**: `packages/backend/src/app.ts` のファクトリ関数。Expressアプリケーションを構築し、サービス・ミドルウェア・ルートを初期化する
- **Media4uProvider**: `packages/backend/src/providers/media4u-provider.ts` のMediaSMS-CONSOLE API実装。実際のSMS送信を行う
- **MockProvider**: `packages/backend/src/providers/mock-provider.ts` の開発・テスト用プロバイダー。メモリ内にメッセージを保存するだけで外部通信しない

## Bug Details

### Bug Condition

`createApp()` が外部から `deps.smsProvider` を渡されずに呼び出された場合、環境変数の有無に関わらず常に `MockProvider` が使用される。`server.ts` には環境変数ベースの切り替えロジックが存在するが、`app.ts` にはこのロジックが欠落している。

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { deps?: { smsProvider?: SmsProvider }, env: ProcessEnv }
  OUTPUT: boolean

  RETURN input.deps?.smsProvider IS undefined
         AND input.env.MEDIASMS_USERNAME IS defined AND non-empty
         AND input.env.MEDIASMS_PASSWORD IS defined AND non-empty
         AND providerUsed(input) IS MockProvider  // 本来 Media4uProvider であるべき
END FUNCTION
```

### Examples

- `createApp()` を `deps` なしで呼び出し、`MEDIASMS_USERNAME=jcn_u`, `MEDIASMS_PASSWORD=xxx` が設定されている → 期待: `Media4uProvider` が使用される / 実際: `MockProvider` が使用される
- `createApp()` を `deps` なしで呼び出し、環境変数が未設定 → 期待: `MockProvider` が使用される / 実際: `MockProvider` が使用される（正常動作）
- `createApp({ smsProvider: customProvider })` で呼び出し → 期待: `customProvider` が使用される / 実際: `customProvider` が使用される（正常動作）
- `createApp()` を `deps` なしで呼び出し、`MEDIASMS_USERNAME` のみ設定、`MEDIASMS_PASSWORD` 未設定 → 期待: `MockProvider` にフォールバック / 実際: `MockProvider` が使用される（正常動作だが偶然）

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `deps.smsProvider` が渡された場合（テスト時など）、渡されたプロバイダーをそのまま使用する
- 環境変数未設定の開発環境では `MockProvider` を使用し、外部APIへの通信を行わない
- SMS送信成功時の `sms_logs` および `audit_logs` への記録動作
- SMS送信失敗時のエラーレスポンスとログ記録動作
- テスト送信（`testSend`）の `[TEST]` プレフィックス付与動作
- 自分にも送信（`sendWithSelfCopy`）の顧客送信＋自分送信の両方処理

**Scope:**
`deps.smsProvider` が渡されるケース、および環境変数が未設定のケースは、この修正の影響を受けない。修正はプロバイダー初期化ロジックのみに限定され、`SmsService`、コントローラー、ルート、ミドルウェアには変更を加えない。

## Hypothesized Root Cause

Based on the bug description, the most likely issue is:

1. **プロバイダー初期化ロジックの欠落**: `app.ts` の62行目で `deps?.smsProvider ?? new MockProvider()` としており、環境変数チェックが存在しない。`server.ts` には `USE_REAL_SMS` フラグによる切り替えロジックがあるが、`app.ts` にはコピーされていない。

2. **Media4uProvider の import 欠落**: `app.ts` は `MockProvider` のみを import しており、`Media4uProvider` の import がない。環境変数チェックを追加しても、import がなければ `Media4uProvider` をインスタンス化できない。

3. **ログ出力の欠落**: どのプロバイダーが使用されているかのログ出力がないため、本番環境で `MockProvider` が使用されていることに気づけなかった。

## Correctness Properties

Property 1: Bug Condition - 環境変数設定時にMedia4uProviderが使用される

_For any_ input where `createApp()` が `deps.smsProvider` なしで呼び出され、かつ `MEDIASMS_USERNAME` と `MEDIASMS_PASSWORD` の両方が設定されている場合、修正後の `createApp()` は `Media4uProvider` をインスタンス化してSMSプロバイダーとして使用し、SMS送信時にMedia4u APIへHTTPリクエストを送信する SHALL。

**Validates: Requirements 2.1, 2.3**

Property 2: Preservation - 既存プロバイダー選択動作の保全

_For any_ input where `deps.smsProvider` が渡される、または環境変数が未設定の場合、修正後の `createApp()` は修正前と同一の動作を行い、渡されたプロバイダーをそのまま使用するか `MockProvider` にフォールバックする SHALL。

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `packages/backend/src/app.ts`

**Function**: `createApp()`

**Specific Changes**:
1. **Media4uProvider の import 追加**: ファイル先頭に `import { Media4uProvider } from './providers/media4u-provider.js';` を追加

2. **プロバイダー初期化ロジックの変更**: 現在の1行を環境変数チェック付きのロジックに置き換え
   - 現在: `const smsProvider = deps?.smsProvider ?? new MockProvider();`
   - 修正後:
     ```typescript
     const smsProvider = deps?.smsProvider ?? (() => {
       const username = process.env.MEDIASMS_USERNAME;
       const password = process.env.MEDIASMS_PASSWORD;
       if (username && password) {
         return new Media4uProvider({ username, password });
       }
       return new MockProvider();
     })();
     ```

3. **プロバイダー名のログ出力追加**: プロバイダー初期化直後に使用中のプロバイダー名をログ出力
   - `console.log(`SMS Provider: ${smsProvider.constructor.name}`);`

4. **deps.smsProvider の型を拡張**: `SmsProvider` インターフェースを受け入れるよう型定義を更新（`MockProvider` 固定から汎用型へ）

5. **SmsProvider 型の import**: 共有パッケージまたはローカルの `SmsProvider` インターフェースを import

## Testing Strategy

### Validation Approach

テスト戦略は2段階アプローチ: まず未修正コードでバグを再現するカウンターサンプルを確認し、次に修正後のコードで正しい動作と既存動作の保全を検証する。

### Exploratory Bug Condition Checking

**Goal**: 修正前のコードでバグを再現し、根本原因の分析を確認または反証する。

**Test Plan**: `createApp()` を環境変数設定済みの状態で呼び出し、使用されるプロバイダーが `MockProvider` であることを確認する。未修正コードではこのテストが「バグの存在」を示す。

**Test Cases**:
1. **環境変数設定時のプロバイダー確認**: `MEDIASMS_USERNAME` と `MEDIASMS_PASSWORD` を設定して `createApp()` を呼び出し、プロバイダーが `Media4uProvider` であることをアサート（未修正コードでは失敗する）
2. **SMS送信時のプロバイダー呼び出し確認**: 環境変数設定状態でSMS送信APIを呼び出し、Media4u APIへのリクエストが発生することを確認（未修正コードでは失敗する）

**Expected Counterexamples**:
- 環境変数が設定されているにも関わらず `MockProvider` が使用される
- 原因: `app.ts` の62行目で環境変数チェックなしに `new MockProvider()` がフォールバックとして使用されている

### Fix Checking

**Goal**: Bug Condition が成立するすべての入力に対して、修正後の関数が期待される動作を行うことを検証する。

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := createApp_fixed(input)
  ASSERT providerUsed(result) IS Media4uProvider
  ASSERT providerConfig(result).username = input.env.MEDIASMS_USERNAME
  ASSERT providerConfig(result).password = input.env.MEDIASMS_PASSWORD
END FOR
```

### Preservation Checking

**Goal**: Bug Condition が成立しないすべての入力に対して、修正後の関数が修正前と同一の結果を返すことを検証する。

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT createApp_original(input).providerType = createApp_fixed(input).providerType
END FOR
```

**Testing Approach**: プロパティベーステストを推奨。環境変数の有無と `deps.smsProvider` の有無の組み合わせを自動生成し、プロバイダー選択の正しさを網羅的に検証する。

**Test Plan**: 未修正コードで `deps.smsProvider` 渡し時とenv未設定時の動作を観察し、修正後もこれらの動作が変わらないことをプロパティベーステストで検証する。

**Test Cases**:
1. **deps.smsProvider 渡し時の保全**: カスタムプロバイダーを渡した場合、そのプロバイダーがそのまま使用されることを検証
2. **環境変数未設定時の保全**: 環境変数なしで `MockProvider` が使用されることを検証
3. **SMS送信動作の保全**: 修正後もSMS送信・ログ記録・エラーハンドリングが正常に動作することを検証
4. **テスト送信・自分送信の保全**: `testSend` と `sendWithSelfCopy` の動作が変わらないことを検証

### Unit Tests

- `createApp()` の環境変数チェックによるプロバイダー切り替えテスト
- `MEDIASMS_USERNAME` のみ設定、`MEDIASMS_PASSWORD` のみ設定のエッジケーステスト
- `deps.smsProvider` 渡し時の優先度テスト
- プロバイダー名ログ出力の検証テスト

### Property-Based Tests

- 環境変数の有無（設定/未設定/空文字）と `deps` の有無の組み合わせを生成し、プロバイダー選択の正しさを検証
- 非バグ条件の入力（deps渡し、env未設定）で修正前後の動作が同一であることを検証

### Integration Tests

- 環境変数設定状態でのSMS送信APIエンドポイントの動作確認
- 環境変数未設定状態でのSMS送信APIエンドポイントの動作確認（MockProvider使用）
- プロバイダー切り替え後のログ記録・エラーハンドリングの動作確認
