# Bugfix Requirements Document

## Introduction

SMS送信機能がMedia4u APIを利用して実装されているが、通常のアプリケーション起動（`app.ts` 経由）では常に `MockProvider` が使用されるため、実際のSMSが送信されない不具合。`server.ts` には環境変数に基づくプロバイダー切り替えロジックが存在するが、`app.ts` の `createApp()` 関数にはこのロジックが欠落している。結果として、SMS送信リクエストは成功レスポンスを返すが、実際にはMedia4u APIへの通信が行われず、SMSが届かない。

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `createApp()` が `deps.smsProvider` なしで呼び出される THEN the system は環境変数（`MEDIASMS_USERNAME`, `MEDIASMS_PASSWORD`）の有無に関わらず常に `MockProvider` をインスタンス化する

1.2 WHEN `MockProvider` が使用されている状態でSMS送信APIが呼び出される THEN the system はMedia4u APIへのHTTPリクエストを行わず、メモリ内にメッセージを保存するだけで実際のSMSは送信されない

1.3 WHEN SMS送信が `MockProvider` 経由で処理される THEN the system は成功レスポンス（`success: true`）を返すため、送信者はSMSが実際に送信されたと誤認する

1.4 WHEN アプリケーションが起動する THEN the system はどのSMSプロバイダーが使用されているかをログ出力しないため、問題の診断が困難である

### Expected Behavior (Correct)

2.1 WHEN `createApp()` が `deps.smsProvider` なしで呼び出され、環境変数 `MEDIASMS_USERNAME` および `MEDIASMS_PASSWORD` が設定されている THEN the system SHALL `Media4uProvider` をインスタンス化してSMSプロバイダーとして使用する

2.2 WHEN `createApp()` が `deps.smsProvider` なしで呼び出され、環境変数 `MEDIASMS_USERNAME` または `MEDIASMS_PASSWORD` が未設定である THEN the system SHALL `MockProvider` をフォールバックとして使用する

2.3 WHEN `Media4uProvider` が使用されている状態でSMS送信APIが呼び出される THEN the system SHALL Media4u APIへHTTPリクエストを送信し、実際のSMSを配信する

2.4 WHEN アプリケーションが起動する THEN the system SHALL 使用中のSMSプロバイダー名（`Media4uProvider` または `MockProvider`）をコンソールログに出力する

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `createApp()` が `deps.smsProvider` 付きで呼び出される（テスト時など） THEN the system SHALL CONTINUE TO 渡されたプロバイダーをそのまま使用する

3.2 WHEN 環境変数が未設定の開発環境で `createApp()` が呼び出される THEN the system SHALL CONTINUE TO `MockProvider` を使用し、外部APIへの通信を行わない

3.3 WHEN SMS送信が成功する THEN the system SHALL CONTINUE TO `sms_logs` および `audit_logs` にログを記録する

3.4 WHEN SMS送信が失敗する THEN the system SHALL CONTINUE TO エラー情報を含む失敗レスポンスを返し、`sms_logs` に記録する

3.5 WHEN テスト送信（`testSend`）が実行される THEN the system SHALL CONTINUE TO `[TEST]` プレフィックスを付与して送信する

3.6 WHEN 自分にも送信（`sendWithSelfCopy`）が実行される THEN the system SHALL CONTINUE TO 顧客送信と自分送信の両方を処理する
