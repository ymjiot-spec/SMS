# Bugfix Requirements Document

## Introduction

Zendesk上のSMS送信ツールのテンプレート管理画面で「新しいフォルダ」を作成しようとすると、`localhost:3001/api/folders` への接続が `ERR_CONNECTION_REFUSED` で失敗する。フロントエンドのAPIクライアント（`packages/web/src/lib/api-client.ts`）が `NEXT_PUBLIC_API_URL` 環境変数未設定時に `http://localhost:3001` をフォールバックとして使用しているが、Next.jsにAPIプロキシ（rewrites）が設定されていないため、ブラウザから直接バックエンドへのリクエストが発生し、バックエンドが到達不能な場合に接続拒否エラーとなる。

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `NEXT_PUBLIC_API_URL` 環境変数が未設定の状態でフォルダ作成（POST /api/folders）を実行する THEN the system はブラウザから `http://localhost:3001/api/folders` へ直接リクエストを送信し、`ERR_CONNECTION_REFUSED` エラーが発生してフォルダ作成に失敗する

1.2 WHEN `NEXT_PUBLIC_API_URL` 環境変数が未設定の状態で任意のAPI呼び出し（GET /api/folders, GET /api/templates 等）を実行する THEN the system はブラウザから `http://localhost:3001` へ直接リクエストを送信し、バックエンドが到達不能な場合に `ERR_CONNECTION_REFUSED` エラーが発生する

1.3 WHEN Zendesk iframeからアプリを使用する THEN the system はZendeskのiframe内のブラウザから `localhost:3001` へリクエストを送信するが、バックエンドサーバーがユーザーのlocalhostで動作していないため接続に失敗する

### Expected Behavior (Correct)

2.1 WHEN `NEXT_PUBLIC_API_URL` 環境変数が未設定の状態でフォルダ作成（POST /api/folders）を実行する THEN the system SHALL Next.jsのAPIプロキシ（rewrites）を経由してバックエンドにリクエストを転送し、フォルダが正常に作成される

2.2 WHEN `NEXT_PUBLIC_API_URL` 環境変数が未設定の状態で任意のAPI呼び出しを実行する THEN the system SHALL 相対パス（例: `/api/folders`）を使用してNext.jsサーバー経由でバックエンドにリクエストを転送し、`ERR_CONNECTION_REFUSED` エラーが発生しない

2.3 WHEN Zendesk iframeからアプリを使用する THEN the system SHALL Next.jsサーバーのプロキシを経由してバックエンドにリクエストを転送し、ブラウザからlocalhostへの直接接続を回避する

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `NEXT_PUBLIC_API_URL` 環境変数が明示的に設定されている THEN the system SHALL CONTINUE TO 設定されたURLをベースURLとして使用してAPIリクエストを送信する

3.2 WHEN フォルダ作成APIが正常に到達可能な場合 THEN the system SHALL CONTINUE TO フォルダ名のバリデーション、作成、一覧表示などのCRUD操作が正常に動作する

3.3 WHEN テンプレートの作成・更新・削除・検索などフォルダ以外のAPI操作を実行する THEN the system SHALL CONTINUE TO 既存のAPI操作が正常に動作する

3.4 WHEN SMS送信、送信履歴取得、配信ステータス取得などのSMS関連API操作を実行する THEN the system SHALL CONTINUE TO 既存のSMS関連機能が正常に動作する
