# Implementation Plan: Zendesk SMS Tool

## Overview

Zendesk連携型SMS送信・管理ツールの実装タスク一覧。段階的リリースプラン（Phase 1 → Phase 2 → Phase 3）に沿って構成し、各フェーズで機能を段階的に追加する。技術スタックは TypeScript / Node.js / Express / Next.js / Prisma / PostgreSQL / Vitest / fast-check。

## Tasks

### Phase 1: 基本SMS送信・テンプレ利用・Zendesk連携・基本ログ

- [ ] 1. プロジェクト構造とモノレポセットアップ
  - [x] 1.1 モノレポ初期化と共有パッケージ作成
    - `packages/shared`, `packages/backend`, `packages/web`, `packages/zendesk` のディレクトリ構成を作成
    - ルートの `package.json`（workspaces）と `turbo.json` を設定
    - TypeScript, ESLint, Prettier の共通設定を作成
    - _Requirements: 13.4_

  - [x] 1.2 共有型定義の作成
    - `packages/shared/src/types/` に `sms.ts`, `template.ts`, `delivery.ts`, `user.ts`, `audit.ts` を作成
    - `DeliveryStatus`, `SendType`, `UserRole`, `SmsProvider` インターフェース等を定義
    - `packages/shared/src/constants.ts` に定数定義
    - _Requirements: 12.1, 6.1, 11.1_

  - [x] 1.3 共有バリデーション関数の作成
    - `packages/shared/src/validators/phone.ts` に日本の携帯電話番号バリデーション（070/080/090、11桁）を実装
    - `packages/shared/src/validators/template.ts` にテンプレート変数パース・レンダリング・バリデーション関数を実装
    - _Requirements: 1.4, 2.7, 3.4, 3.5_

  - [ ]* 1.4 電話番号バリデーションのプロパティテスト
    - **Property 1: Japanese mobile phone number validation**
    - **Validates: Requirements 1.4, 10.1**

  - [ ]* 1.5 テンプレート変数バリデーションのプロパティテスト
    - **Property 7: Template variable format validation**
    - **Validates: Requirements 2.7**

  - [ ]* 1.6 テンプレート変数パースのプロパティテスト
    - **Property 8: Template variable parsing extracts all variables**
    - **Validates: Requirements 3.4**

  - [ ]* 1.7 テンプレートparse-render-parseラウンドトリップのプロパティテスト
    - **Property 9: Template parse-render-parse round-trip**
    - **Validates: Requirements 3.5**

  - [ ]* 1.8 テンプレートレンダリング（未解決変数検出）のプロパティテスト
    - **Property 10: Unresolved variable detection**
    - **Validates: Requirements 3.3**

  - [ ]* 1.9 テンプレートレンダリング（完全展開）のプロパティテスト
    - **Property 11: Template rendering replaces all provided variables**
    - **Validates: Requirements 3.2**

- [ ] 2. Checkpoint - Phase 1 基盤確認
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. データベースとPrismaセットアップ
  - [x] 3.1 Prisma スキーマ定義とマイグレーション
    - `packages/backend/src/prisma/schema.prisma` にデザインドキュメントのスキーマを実装
    - `User`, `Company`, `Template`, `TemplateFavorite`, `SmsLog`, `DeliveryEvent`, `AuditLog` モデルを定義
    - 初期マイグレーションを生成
    - _Requirements: 9.4, 14.4_

  - [x] 3.2 Prisma クライアント設定とシードデータ
    - Prisma クライアントのシングルトンインスタンスを作成
    - 開発用シードデータ（テストユーザー、企業、テンプレート）を作成
    - _Requirements: 11.1_

- [ ] 4. SMSプロバイダ実装
  - [x] 4.1 SmsProvider インターフェースと MockProvider 実装
    - `packages/backend/src/providers/` に `sms-provider.ts`（インターフェース）と `mock-provider.ts` を作成
    - MockProvider はメモリ内にメッセージを保存し、成功/失敗シミュレーション可能にする
    - _Requirements: 12.1, 12.3_

  - [x] 4.2 Media4uProvider 実装
    - `packages/backend/src/providers/media4u-provider.ts` を作成
    - `sendMessage()`, `getDeliveryStatus()`, `validateConfig()` を実装
    - リトライ戦略（指数バックオフ、最大3回）を実装
    - _Requirements: 12.2, 12.4_

  - [ ]* 4.3 プロバイダ send-then-status 一貫性のプロパティテスト
    - **Property 24: Provider send-then-status consistency**
    - **Validates: Requirements 12.5**

  - [ ]* 4.4 プロバイダ設定検証のプロパティテスト
    - **Property 28: Provider configuration validation**
    - **Validates: Requirements 12.4**

- [ ] 5. コアサービス実装（SMS送信）
  - [x] 5.1 AuditService 実装
    - `packages/backend/src/services/audit-service.ts` を作成
    - `log()` と `search()` メソッドを実装
    - SMS送信、テンプレート変更、権限拒否の各アクションタイプに対応
    - _Requirements: 14.1, 14.2, 14.3, 14.5_

  - [ ]* 5.2 監査ログフィールド完全性のプロパティテスト
    - **Property 26: Audit log entries contain required fields**
    - **Validates: Requirements 14.1, 14.2, 14.3**

  - [ ]* 5.3 監査ログシリアライゼーションラウンドトリップのプロパティテスト
    - **Property 27: Audit log serialization round-trip**
    - **Validates: Requirements 14.6**

  - [x] 5.4 SmsService 基本送信機能の実装
    - `packages/backend/src/services/sms-service.ts` を作成
    - `send()` メソッド: 電話番号バリデーション → SMS_Provider.sendMessage() → sms_logs記録 → audit_logs記録
    - 送信結果（成功時: externalMessageId、失敗時: エラー理由）を返す
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 5.5 SMS送信結果構造のプロパティテスト
    - **Property 2: SMS send result structure**
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [ ]* 5.6 空白メッセージ拒否のプロパティテスト
    - **Property 3: Empty or whitespace message rejection**
    - **Validates: Requirements 1.5**

  - [ ]* 5.7 SMSログ完全性のプロパティテスト
    - **Property 19: SMS log completeness**
    - **Validates: Requirements 9.4, 9.5**

  - [ ]* 5.8 SMS log sendType一致のプロパティテスト
    - **Property 12: SMS log sendType matches operation type**
    - **Validates: Requirements 4.2, 4.3, 5.2**

- [ ] 6. テンプレートサービス実装
  - [x] 6.1 TemplateService CRUD 実装
    - `packages/backend/src/services/template-service.ts` を作成
    - `create()`, `update()`, `delete()`, `findById()`, `search()`, `duplicate()`, `toggleFavorite()` を実装
    - テンプレート変数展開: `parseVariables()`, `renderTemplate()`, `validateVariableFormat()` を実装
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3_

  - [ ]* 6.2 テンプレートCRUDラウンドトリップのプロパティテスト
    - **Property 4: Template CRUD round-trip**
    - **Validates: Requirements 2.1**

  - [ ]* 6.3 テンプレート分類保存のプロパティテスト
    - **Property 5: Template classification preservation**
    - **Validates: Requirements 2.2**

  - [ ]* 6.4 テンプレート検索一致のプロパティテスト
    - **Property 6: Template search returns matching results**
    - **Validates: Requirements 2.3**

- [ ] 7. Zendesk連携サービス実装
  - [x] 7.1 ZendeskService 実装
    - `packages/backend/src/services/zendesk-service.ts` を作成
    - `getTicketContext()`: チケットID からチケット情報・顧客電話番号を取得
    - `createInternalNote()`: チケットに社内メモを作成
    - `formatInternalNote()`: 社内メモのフォーマット（送信先、送信種別、テンプレート名、本文、送信者、日時、結果、配信ステータス、外部メッセージID）
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4_

  - [ ]* 7.2 社内メモフォーマット完全性のプロパティテスト
    - **Property 25: Internal note formatting completeness**
    - **Validates: Requirements 8.1, 8.2, 8.4**

- [ ] 8. 履歴管理サービス実装
  - [x] 8.1 HistoryService 実装
    - `packages/backend/src/services/history-service.ts` を作成
    - `search()`: ticketId, phone, operatorId, templateId, dateRange, deliveryStatus でフィルタリング
    - `exportCsv()`: フィルタ結果をCSV出力
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 8.2 履歴フィルタ一致のプロパティテスト
    - **Property 17: History filter returns only matching results**
    - **Validates: Requirements 9.1**

  - [ ]* 8.3 CSVエクスポートラウンドトリップのプロパティテスト
    - **Property 18: CSV export round-trip**
    - **Validates: Requirements 9.3**

- [ ] 9. ミドルウェアとAPIエンドポイント（Phase 1）
  - [x] 9.1 認証・認可ミドルウェア実装
    - `packages/backend/src/middleware/auth.ts` に `authMiddleware` と `requireRole()` を実装
    - ロール階層: Operator ⊂ Supervisor ⊂ System_Admin
    - 権限拒否時に監査ログ記録
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 9.2 ロールベース権限のプロパティテスト
    - **Property 23: Role-based permission enforcement**
    - **Validates: Requirements 11.2, 11.3, 11.4, 11.5**

  - [x] 9.3 誤送信防止ミドルウェア実装
    - `packages/backend/src/middleware/rate-limit.ts` にレート制限（10件/分/オペレーター）を実装
    - 重複送信警告（同一番号5分以内）を実装
    - 危険キーワード検出を実装
    - `packages/backend/src/services/keyword-detector.ts` を作成
    - _Requirements: 10.1, 10.2, 10.4, 10.5_

  - [ ]* 9.4 レート制限のプロパティテスト
    - **Property 21: Rate limit enforcement**
    - **Validates: Requirements 10.4**

  - [ ]* 9.5 重複送信警告のプロパティテスト
    - **Property 22: Duplicate send warning**
    - **Validates: Requirements 10.5**

  - [ ]* 9.6 危険キーワード検出のプロパティテスト
    - **Property 20: Dangerous keyword detection**
    - **Validates: Requirements 10.2**

  - [x] 9.7 Phase 1 APIエンドポイント実装
    - `packages/backend/src/controllers/` にコントローラーを作成
    - SMS送信: `POST /api/sms/send`
    - テンプレート: `GET/POST /api/templates`, `GET /api/templates/search`
    - 履歴: `GET /api/sms/logs`, `GET /api/sms/logs/:id`
    - Zendesk: `POST /api/zendesk/internal-note`, `GET /api/zendesk/ticket/:id/context`
    - ユーザー: `GET /api/users/me`
    - 企業: `GET /api/companies`
    - Express アプリ (`app.ts`) にルーティングとミドルウェアを接続
    - _Requirements: 1.1, 1.6, 7.1, 7.4, 8.1, 9.1_

  - [x] 9.8 バリデーションミドルウェア実装
    - `packages/backend/src/middleware/validation.ts` に Zod スキーマベースのバリデーションを実装
    - SMS送信リクエスト、テンプレート作成/更新リクエストのスキーマを定義
    - _Requirements: 1.4, 1.5, 2.7_

- [ ] 10. Checkpoint - Phase 1 バックエンド完了確認
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. フロントエンド基盤（Phase 1）
  - [x] 11.1 Next.js Web アプリ初期セットアップ
    - `packages/web/` に Next.js プロジェクトを作成
    - API クライアント (`packages/web/src/lib/api-client.ts`) を作成
    - 共通レイアウトとルーティングを設定
    - _Requirements: 13.1, 13.2_

  - [x] 11.2 SMS送信UIコンポーネント実装
    - `PhoneInput.tsx`: 電話番号入力（リアルタイムバリデーション付き）
    - `MessageEditor.tsx`: メッセージ編集エリア（文字数カウント付き）
    - `SendButton.tsx`: 送信ボタン
    - `ConfirmModal.tsx`: 送信確認モーダル（宛先番号・メッセージプレビュー表示）
    - `SendResult.tsx`: 送信結果表示
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 10.1, 10.3_

  - [x] 11.3 テンプレート選択UIコンポーネント実装
    - `TemplateList.tsx`: テンプレート一覧表示
    - `TemplateSearch.tsx`: キーワード検索
    - `TemplatePreview.tsx`: 変数展開プレビュー（未解決変数ハイライト付き）
    - _Requirements: 2.3, 3.2, 3.3_

  - [x] 11.4 送信履歴UIコンポーネント実装
    - `HistoryTable.tsx`: 履歴テーブル（ページネーション付き）
    - `HistoryFilter.tsx`: フィルタUI（チケットID、電話番号、日付範囲等）
    - `HistoryExport.tsx`: CSVエクスポートボタン
    - _Requirements: 9.1, 9.3_

  - [x] 11.5 メイン画面レイアウト統合
    - チケット情報（上部）、テンプレート選択・メッセージ編集（中央）、送信ボタン・結果（下部）のレイアウト
    - サブタブ（テンプレート管理、履歴閲覧）を統合
    - 最近の送信履歴表示（チケットコンテキスト時）
    - _Requirements: 13.1, 13.2, 13.3, 10.6_

- [ ] 12. Zendesk サイドバーアプリ（Phase 1）
  - [x] 12.1 Zendesk サイドバーアプリセットアップ
    - `packages/zendesk/` に ZAF SDK ベースの React アプリを作成
    - ZAF SDK 初期化とチケットID自動取得を実装
    - チケット情報表示 (`TicketHeader.tsx`) を実装
    - Web アプリのコアコンポーネントを再利用
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 13.4_

- [ ] 13. Checkpoint - Phase 1 完了確認
  - Ensure all tests pass, ask the user if questions arise.


### Phase 2: テンプレ管理強化・到達確認・自分にも送信・テスト送信

- [ ] 14. テンプレート管理強化
  - [x] 14.1 テンプレート CRUD APIエンドポイント拡充
    - `PUT /api/templates/:id`（更新）、`DELETE /api/templates/:id`（削除）を実装
    - `POST /api/templates/:id/duplicate`（複製）を実装
    - `POST /api/templates/:id/favorite`（お気に入りトグル）を実装
    - テンプレート変更時の監査ログ記録（before/after値）を実装
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 14.2_

  - [x] 14.2 テンプレート管理UIコンポーネント実装
    - テンプレート作成・編集フォーム（変数フォーマットバリデーション付き）
    - テンプレート削除確認ダイアログ
    - お気に入りトグルボタン
    - 最終使用日時表示
    - テンプレート複製ボタン
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.7_

- [ ] 15. 到達確認機能実装
  - [x] 15.1 DeliveryService 実装
    - `packages/backend/src/services/delivery-service.ts` を作成
    - `recordInitialStatus()`: 初期ステータス記録
    - `updateStatus()`: ステータス更新 + delivery_events 記録
    - `processWebhook()`: Webhook ペイロード処理
    - `schedulePolling()`: BullMQ ポーリングジョブスケジュール
    - `getStatusHistory()`: ステータス変更履歴取得
    - _Requirements: 6.2, 6.3, 6.4, 6.6_

  - [x] 15.2 BullMQ ポーリングワーカー実装
    - `packages/backend/src/jobs/delivery-polling-worker.ts` を作成
    - 設定可能な間隔でプロバイダの `getDeliveryStatus()` を呼び出し
    - ステータス変更時に delivery_events に記録
    - リトライ戦略（指数バックオフ、最大5回）を設定
    - _Requirements: 6.3_

  - [x] 15.3 Webhook エンドポイント実装
    - `POST /api/sms/webhook/delivery` エンドポイントを作成
    - Webhook ペイロードの検証と処理
    - _Requirements: 6.4_

  - [x] 15.4 SmsService に DeliveryService を統合
    - SMS送信後に `recordInitialStatus()` と `schedulePolling()` を呼び出すよう `send()` を更新
    - _Requirements: 6.2_

  - [ ]* 15.5 配信ステータスイベント記録のプロパティテスト
    - **Property 15: Delivery status events logged with timestamps**
    - **Validates: Requirements 6.2, 6.6**

  - [ ]* 15.6 Webhook配信ステータス更新のプロパティテスト
    - **Property 16: Webhook delivery status update**
    - **Validates: Requirements 6.4**

  - [x] 15.7 配信ステータス表示UI
    - 送信履歴テーブルに配信ステータスカラムを追加
    - ステータスバッジ（色分け）を実装
    - `GET /api/sms/delivery-status/:id` エンドポイントを作成
    - _Requirements: 6.5_

- [ ] 16. 自分にも送信機能実装
  - [x] 16.1 SmsService に sendWithSelfCopy 実装
    - `sendWithSelfCopy()` メソッドを実装
    - 顧客向け送信 → 自分向け送信（失敗しても顧客送信は成功扱い）
    - 各送信ログに適切な sendType（'customer' / 'self_copy'）を設定
    - `POST /api/sms/send-self-copy` エンドポイントを作成
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 16.2 自分送信同一メッセージのプロパティテスト
    - **Property 13: Self-copy sends identical message body**
    - **Validates: Requirements 4.1**

  - [x] 16.3 自分にも送信UI
    - 送信フォームに「自分にも送信」チェックボックスを追加
    - 部分成功時のメッセージ表示を実装
    - _Requirements: 4.1, 4.4_

- [ ] 17. テスト送信機能実装
  - [x] 17.1 SmsService に testSend 実装
    - `testSend()` メソッドを実装
    - メッセージ本文に "[TEST]" プレフィックスを追加
    - テスト用電話番号に送信、sendType: 'test' で記録
    - `POST /api/sms/test-send` エンドポイントを作成（Supervisor+ 権限）
    - _Requirements: 5.1, 5.2, 5.4_

  - [ ]* 17.2 テスト送信番号・プレフィックスのプロパティテスト
    - **Property 14: Test send uses configured test number and [TEST] prefix**
    - **Validates: Requirements 5.1, 5.4**

  - [x] 17.3 テスト送信UI
    - テスト送信ボタン（本番送信ボタンと異なる色・位置）を実装
    - テスト送信結果の視覚的区別を実装
    - _Requirements: 5.3_

- [ ] 18. Checkpoint - Phase 2 完了確認
  - Ensure all tests pass, ask the user if questions arise.

### Phase 3: 自動送信・承認フロー・分析ダッシュボード・一斉送信

- [ ] 19. 設定管理API
  - [x] 19.1 設定管理エンドポイント実装
    - `GET /api/settings` と `PUT /api/settings` を実装（System_Admin 権限）
    - APIキー、プロバイダ設定、Webhook設定、テスト電話番号等の管理
    - 設定変更時の監査ログ記録
    - _Requirements: 11.4, 14.1_

- [ ] 20. エラーハンドリングとSentry統合
  - [x] 20.1 グローバルエラーハンドリング実装
    - `ApiErrorResponse` 形式の統一エラーレスポンスを実装
    - エラー分類（バリデーション、プロバイダ、Zendesk連携、認証、レート制限、DB）に応じた処理
    - Sentry 統合（Critical/Warning/Info レベル分類）
    - _Requirements: 1.3, 8.3_

- [ ] 21. 最終統合とワイヤリング
  - [x] 21.1 フロントエンド・バックエンド統合テスト
    - API クライアントと全エンドポイントの接続確認
    - Zendesk サイドバーアプリと Web アプリの両モードでの動作確認用テストを作成
    - SMS送信 → ログ記録 → Zendesk社内メモ → 配信追跡の一連フローのテスト
    - _Requirements: 13.4, 7.1, 8.1_

  - [ ]* 21.2 統合プロパティテスト
    - 全サービス間の連携が正しく動作することを検証
    - _Requirements: 1.1, 8.1, 6.2_

- [ ] 22. Final Checkpoint - 全フェーズ完了確認
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at each phase boundary
- Property tests validate universal correctness properties from the design document (28 properties total)
- Unit tests validate specific examples and edge cases
- Implementation language: TypeScript throughout (shared types, backend, frontend)
- Test framework: Vitest + fast-check for property-based testing
