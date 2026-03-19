# フォルダ作成 ERR_CONNECTION_REFUSED バグフィックス設計

## Overview

フロントエンドのAPIクライアント（`packages/web/src/lib/api-client.ts`）が `NEXT_PUBLIC_API_URL` 環境変数未設定時に `http://localhost:3001` をフォールバックとして使用しているため、ブラウザから直接バックエンドへのリクエストが発生し、`ERR_CONNECTION_REFUSED` エラーとなる。修正として、(1) Next.jsの `rewrites` 設定でAPIプロキシを追加し、(2) フロントエンドの `BASE_URL` を空文字列（相対パス）にフォールバックさせることで、全APIリクエストがNext.jsサーバー経由で転送されるようにする。

## Glossary

- **Bug_Condition (C)**: `NEXT_PUBLIC_API_URL` 環境変数が未設定の状態でAPIリクエストが発生する条件。`BASE_URL` が `http://localhost:3001` にフォールバックし、ブラウザから直接バックエンドへリクエストが送信される
- **Property (P)**: `NEXT_PUBLIC_API_URL` 未設定時に `BASE_URL` が空文字列となり、相対パス（`/api/...`）でリクエストが送信され、Next.jsの `rewrites` によりバックエンドに転送される
- **Preservation**: `NEXT_PUBLIC_API_URL` が明示的に設定されている場合、設定されたURLがそのまま使用される既存動作が維持される
- **BASE_URL**: `packages/web/src/lib/api-client.ts` 内の定数。全APIリクエストのベースURLを決定する
- **rewrites**: Next.jsの設定機能。クライアントからのリクエストパスを別のURLに透過的に転送する

## Bug Details

### Bug Condition

`NEXT_PUBLIC_API_URL` 環境変数が未設定の状態でフロントエンドからAPIリクエスト（フォルダ作成、テンプレート取得等）を実行すると、`BASE_URL` が `http://localhost:3001` にフォールバックし、ブラウザから直接 `http://localhost:3001/api/...` へリクエストが送信される。バックエンドがブラウザのlocalhostで動作していない場合（Zendesk iframe内、本番環境等）、`ERR_CONNECTION_REFUSED` エラーが発生する。

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { env: EnvironmentVariables, apiPath: string }
  OUTPUT: boolean

  RETURN input.env.NEXT_PUBLIC_API_URL IS undefined OR empty
         AND input.apiPath STARTS WITH '/api/'
         AND backendNotReachableFromBrowser()
END FUNCTION
```

### Examples

- フォルダ作成: `NEXT_PUBLIC_API_URL` 未設定 → `POST http://localhost:3001/api/folders` → `ERR_CONNECTION_REFUSED`（期待: `POST /api/folders` が相対パスでNext.jsサーバーに送信される）
- テンプレート一覧取得: `NEXT_PUBLIC_API_URL` 未設定 → `GET http://localhost:3001/api/templates` → `ERR_CONNECTION_REFUSED`（期待: `GET /api/templates` が相対パスで送信される）
- Zendesk iframe内: ユーザーのブラウザから `localhost:3001` へ接続 → 接続不可（期待: Next.jsサーバー経由でバックエンドに転送）
- `NEXT_PUBLIC_API_URL=https://api.example.com` 設定済み → `POST https://api.example.com/api/folders` → 正常動作（この場合はバグ条件に該当しない）

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `NEXT_PUBLIC_API_URL` 環境変数が明示的に設定されている場合、設定されたURLをベースURLとして使用する動作は変更しない
- フォルダのCRUD操作（作成、取得、更新、削除）のリクエストボディ・レスポンス形式は変更しない
- テンプレートの作成・更新・削除・検索などのAPI操作は影響を受けない
- SMS送信、送信履歴取得、配信ステータス取得などのSMS関連API操作は影響を受けない
- `X-User-Id` ヘッダーの付与、エラーハンドリング（`ApiError`）の動作は変更しない

**Scope:**
`NEXT_PUBLIC_API_URL` が明示的に設定されている環境では、この修正による動作変更は一切発生しない。影響を受けるのは環境変数未設定時のフォールバック値のみ。

## Hypothesized Root Cause

Based on the bug description, the most likely issues are:

1. **不適切なフォールバック値**: `api-client.ts` の `BASE_URL` が `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'` と定義されており、環境変数未設定時に絶対URL `http://localhost:3001` にフォールバックする。これによりブラウザが直接バックエンドに接続を試みる
   - 行110-111: `const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';`
   - 相対パス（空文字列）にフォールバックすべきところ、絶対URLを使用している

2. **APIプロキシ未設定**: `packages/web/next.config.mjs` に `rewrites` 設定がないため、相対パスでリクエストを送信してもNext.jsサーバーがバックエンドに転送できない
   - 現在の設定には `headers()` のみ存在し、`rewrites()` が未定義

3. **開発環境前提の設計**: `http://localhost:3001` はローカル開発環境でバックエンドが同一マシンで動作している前提のフォールバック値であり、Zendesk iframe内やデプロイ環境では機能しない

## Correctness Properties

Property 1: Bug Condition - NEXT_PUBLIC_API_URL未設定時のBASE_URLフォールバック

_For any_ API呼び出しにおいて `NEXT_PUBLIC_API_URL` 環境変数が未設定（undefined）の場合、修正後の `BASE_URL` は空文字列となり、`request` 関数が生成するURLは相対パス（例: `/api/folders`）となるSHALL。これにより、ブラウザはNext.jsサーバーにリクエストを送信し、`rewrites` 設定によりバックエンドに転送される。

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - NEXT_PUBLIC_API_URL設定時の既存動作維持

_For any_ API呼び出しにおいて `NEXT_PUBLIC_API_URL` 環境変数が明示的に設定されている場合、修正後の `BASE_URL` は設定された値をそのまま使用し、`request` 関数が生成するURLは修正前と同一であるSHALL。全てのAPI操作（フォルダ、テンプレート、SMS等）の動作は変更されない。

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File 1**: `packages/web/src/lib/api-client.ts`

**定数**: `BASE_URL`

**Specific Changes**:
1. **フォールバック値の変更**: `BASE_URL` のフォールバック値を `'http://localhost:3001'` から `''`（空文字列）に変更する
   - Before: `const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';`
   - After: `const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';`
   - 空文字列により、`request` 関数内の `` `${BASE_URL}${path}` `` が `/api/folders` のような相対パスを生成する

**File 2**: `packages/web/next.config.mjs`

**設定**: `rewrites` 関数の追加

**Specific Changes**:
2. **rewrites設定の追加**: Next.jsの `rewrites` 設定を追加し、`/api/:path*` パターンのリクエストをバックエンドサーバーに転送する
   - バックエンドURL: `process.env.API_URL ?? 'http://localhost:3001'`（サーバーサイド環境変数）
   - パターン: `/api/:path*` → `{backendUrl}/api/:path*`
   - これにより、相対パスで送信されたAPIリクエストがNext.jsサーバーからバックエンドに転送される

3. **環境変数の使い分け**:
   - `NEXT_PUBLIC_API_URL`: クライアントサイドで使用（明示的に設定された場合のみ）
   - `API_URL`: サーバーサイドの `rewrites` で使用（バックエンドの実際のURL）

## Testing Strategy

### Validation Approach

テスト戦略は2フェーズで構成する: (1) 修正前のコードでバグを再現するカウンターエグザンプルを確認し、(2) 修正後のコードで正しい動作と既存動作の保持を検証する。

### Exploratory Bug Condition Checking

**Goal**: 修正前のコードでバグを再現し、根本原因の分析を確認または反証する。反証された場合は再分析が必要。

**Test Plan**: `api-client.ts` の `BASE_URL` の値と `request` 関数が生成するURLを検証するテストを作成する。修正前のコードで実行し、`http://localhost:3001` が使用されることを確認する。

**Test Cases**:
1. **BASE_URL フォールバック値テスト**: `NEXT_PUBLIC_API_URL` 未設定時に `BASE_URL` が `http://localhost:3001` であることを確認（修正前コードで失敗を期待）
2. **リクエストURL構築テスト**: `request` 関数が `http://localhost:3001/api/folders` のような絶対URLを生成することを確認（修正前コードで失敗を期待）
3. **rewrites設定不在テスト**: `next.config.mjs` に `rewrites` 設定が存在しないことを確認（修正前コードで失敗を期待）

**Expected Counterexamples**:
- `BASE_URL` が `http://localhost:3001` にフォールバックし、ブラウザから直接バックエンドへリクエストが送信される
- `next.config.mjs` に `rewrites` が未定義のため、相対パスリクエストがバックエンドに転送されない

### Fix Checking

**Goal**: バグ条件が成立する全ての入力に対して、修正後の関数が期待される動作を生成することを検証する。

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := request_fixed(input.apiPath)
  ASSERT result.url STARTS WITH '/api/'
  ASSERT result.url DOES NOT CONTAIN 'localhost:3001'
END FOR
```

### Preservation Checking

**Goal**: バグ条件が成立しない全ての入力に対して、修正後の関数が修正前と同じ結果を生成することを検証する。

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT request_original(input) = request_fixed(input)
END FOR
```

**Testing Approach**: Property-based testingを推奨。理由:
- 入力ドメイン全体にわたって多数のテストケースを自動生成できる
- 手動ユニットテストでは見逃しがちなエッジケースを検出できる
- 非バグ入力に対する動作不変の強い保証を提供できる

**Test Plan**: 修正前のコードで `NEXT_PUBLIC_API_URL` 設定時の動作を観察し、修正後もその動作が維持されることをproperty-based testで検証する。

**Test Cases**:
1. **環境変数設定時のBASE_URL保持**: `NEXT_PUBLIC_API_URL` が設定されている場合、`BASE_URL` がその値を使用することを検証
2. **リクエストヘッダー保持**: `X-User-Id` ヘッダー、`Content-Type` ヘッダーが修正前後で同一であることを検証
3. **エラーハンドリング保持**: `ApiError` のスロー条件とプロパティが修正前後で同一であることを検証
4. **全APIエンドポイント保持**: フォルダ、テンプレート、SMS等の全エンドポイントのパス構築が影響を受けないことを検証

### Unit Tests

- `BASE_URL` のフォールバック値が空文字列であることのテスト
- `request` 関数が相対パスURLを生成することのテスト
- `NEXT_PUBLIC_API_URL` 設定時に設定値が使用されることのテスト
- `next.config.mjs` の `rewrites` 設定が正しいパターンとdestinationを持つことのテスト

### Property-Based Tests

- ランダムなAPIパス文字列に対して、`NEXT_PUBLIC_API_URL` 未設定時に `BASE_URL` が空文字列であることを検証
- ランダムなURL文字列を `NEXT_PUBLIC_API_URL` に設定し、`BASE_URL` がその値を使用することを検証
- ランダムなAPIパスに対して、`request` 関数のURL構築が `${BASE_URL}${path}` パターンに従うことを検証

### Integration Tests

- フォルダ作成フロー全体のテスト（Next.jsサーバー経由でバックエンドにリクエストが転送されることの確認）
- Zendesk iframe環境を模擬したテスト（相対パスリクエストがプロキシ経由で転送されることの確認）
- `NEXT_PUBLIC_API_URL` 設定時と未設定時の両方でAPI操作が正常に動作することの確認
