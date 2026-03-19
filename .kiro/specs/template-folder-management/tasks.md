# 実装計画: テンプレートフォルダ管理

## 概要

テンプレート管理画面（/templates）にフォルダ管理、ドラッグ&ドロップ並び替え、お気に入り固定表示、インライン編集、複製修正を段階的に実装する。バックエンドAPI拡張 → 共有型定義拡張 → APIクライアント拡張 → フロントエンドコンポーネント実装の順で進める。

**重要な制約**: SMS送信機能（/api/sms/send, /api/sms/test-send, page.tsx のSMS送信画面）は一切変更しない。

## タスク

- [x] 1. 共有型定義の拡張（packages/shared/src/types/template.ts）
  - [x] 1.1 Folder インターフェースと関連型を追加する
    - `Folder` インターフェース（id, name, createdBy, createdAt, updatedAt）を定義
    - `CreateFolderInput`、`UpdateFolderInput` インターフェースを定義
    - _要件: 2.1_
  - [x] 1.2 Template インターフェースに folderId と sortOrder フィールドを追加する
    - `folderId?: string | null`（所属フォルダID、nullは未分類）
    - `sortOrder?: number`（表示順、0始まり）
    - 既存の Template 利用箇所に影響がないことを確認（オプショナルフィールドのため）
    - _要件: 2.6, 3.3_
  - [x] 1.3 UpdateTemplateInput に folderId と sortOrder を追加する
    - `folderId?: string | null`
    - `sortOrder?: number`
    - _要件: 2.6, 3.5_

- [x] 2. バックエンド API の拡張（packages/backend/server.ts）
  - [x] 2.1 フォルダ CRUD エンドポイントを実装する
    - `GET /api/folders` — フォルダ一覧取得
    - `POST /api/folders` — フォルダ作成（名前バリデーション: 空文字不可）
    - `PUT /api/folders/:id` — フォルダ名更新
    - `DELETE /api/folders/:id` — フォルダ削除（所属テンプレートの folderId を null に設定、テンプレート自体は削除しない）
    - インメモリ配列 `folders` を追加してデータを管理
    - _要件: 2.1, 2.3, 2.7, 2.9_
  - [ ]* 2.2 フォルダ CRUD のプロパティベーステストを作成する
    - **Property 2: フォルダ作成の往復一貫性**
    - **Property 3: フォルダ名更新の往復一貫性**
    - **Property 5: フォルダ削除時のテンプレート保全**
    - **検証対象: 要件 2.3, 2.7, 2.9**
  - [x] 2.3 テンプレート複製エンドポイントを修正する
    - `POST /api/templates/:id/duplicate` で元テンプレートの全フィールド（body, companyId, brand, purpose, department, visibility）を複製
    - 名前は元の名前 + "（コピー）" をデフォルトとする（リクエストボディの name がない場合）
    - ID と タイムスタンプ（createdAt, updatedAt）は新規生成
    - folderId は元テンプレートから引き継ぐ
    - _要件: 1.1, 1.4_
  - [ ]* 2.4 テンプレート複製のプロパティベーステストを作成する
    - **Property 1: テンプレート複製はフィールドを保持し名前に「(コピー)」を付与する**
    - **検証対象: 要件 1.1, 1.4**
  - [x] 2.5 テンプレート並び替えエンドポイントを実装する
    - `PUT /api/templates/reorder` — テンプレートの sortOrder と folderId を一括更新
    - リクエストボディ: `{ items: Array<{ id: string; sortOrder: number; folderId?: string | null }> }`
    - バリデーション: items が空配列の場合は 400 エラー
    - _要件: 3.2, 3.3, 3.5_
  - [ ]* 2.6 並び替えのプロパティベーステストを作成する
    - **Property 6: テンプレート移動とソート順の同時更新**
    - **検証対象: 要件 2.6, 3.2, 3.3, 3.5**
  - [x] 2.7 テンプレート取得 API に folderId フィルタリングを追加する
    - `GET /api/templates` に `folderId` クエリパラメータを追加
    - `folderId=null` で未分類テンプレートをフィルタ
    - テンプレートを sortOrder 順でソートして返す
    - _要件: 2.5, 2.8_
  - [ ]* 2.8 フォルダフィルタリングのプロパティベーステストを作成する
    - **Property 4: フォルダフィルタリングの正確性**
    - **検証対象: 要件 2.5**
  - [x] 2.9 お気に入り API をユーザー単位に改修する
    - `favoriteSet` を `favoritesByUser: Map<string, Set<string>>` に変更
    - `POST /api/templates/:id/favorite` を X-User-Id ヘッダーのユーザーIDで管理
    - `GET /api/favorites` エンドポイントを追加（ユーザーのお気に入りID一覧を返す）
    - _要件: 4.1, 4.4, 4.5_
  - [ ]* 2.10 お気に入りのプロパティベーステストを作成する
    - **Property 7: お気に入りトグルの往復一貫性**
    - **Property 8: お気に入りのユーザースコープ独立性**
    - **検証対象: 要件 4.1, 4.4, 4.5**
  - [x] 2.11 既存テンプレートデータに folderId と sortOrder の初期値を設定する
    - 全既存テンプレートに `folderId: null`、`sortOrder: インデックス値` を追加
    - _要件: 2.8, 3.3_

- [x] 3. チェックポイント - バックエンド API の動作確認
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。

- [x] 4. API クライアントの拡張（packages/web/src/lib/api-client.ts）
  - [x] 4.1 フォルダ関連の API 関数を追加する
    - `getFolders(): Promise<Folder[]>`
    - `createFolder(name: string): Promise<Folder>`
    - `updateFolder(id: string, name: string): Promise<Folder>`
    - `deleteFolder(id: string): Promise<{ success: boolean }>`
    - SMS送信関連の関数（sendSms, testSendSms, sendSmsWithSelfCopy）は変更しない
    - _要件: 2.1, 6.3_
  - [x] 4.2 テンプレート並び替え・お気に入り取得の API 関数を追加する
    - `reorderTemplates(items: Array<{ id: string; sortOrder: number; folderId?: string | null }>): Promise<{ success: boolean }>`
    - `getFavorites(): Promise<{ items: string[] }>`
    - `getTemplates` に folderId パラメータ対応を追加
    - _要件: 3.3, 4.4_

- [x] 5. FolderPanel コンポーネントの実装（packages/web/src/components/template/FolderPanel.tsx）
  - [x] 5.1 FolderPanel コンポーネントを新規作成する
    - サイドバー形式でフォルダ一覧を表示
    - 「すべて」「未分類」の特殊フィルタを上部に配置
    - フォルダ作成ボタンとインライン名前入力
    - フォルダ選択時に onSelectFolder コールバックを呼び出す
    - フォルダ名の編集（クリックで編集モード）・削除機能
    - _要件: 2.2, 2.4, 2.5, 2.8, 2.9_
  - [ ]* 5.2 FolderPanel のユニットテストを作成する
    - フォルダ一覧表示、作成、選択、編集、削除の動作確認
    - _要件: 2.2, 2.4, 2.5_

- [x] 6. InlineEditor コンポーネントの実装（packages/web/src/components/template/InlineEditor.tsx）
  - [x] 6.1 InlineEditor コンポーネントを新規作成する
    - テンプレート名のインライン編集（クリックで input に切替）
    - テンプレート本文のインライン編集（クリックで textarea に切替）
    - Enter（名前）/ Ctrl+Enter（本文）で保存コールバック呼び出し
    - Escape でキャンセル（変更を破棄して表示モードに戻る）
    - `{{variable_name}}` パターンのバリデーション
    - _要件: 5.1, 5.2, 5.3, 5.4, 5.8_
  - [ ]* 6.2 変数フォーマットバリデーションのプロパティベーステストを作成する
    - **Property 10: 変数フォーマットバリデーション**
    - **検証対象: 要件 5.8**
  - [ ]* 6.3 InlineEditor のユニットテストを作成する
    - Enter/Ctrl+Enter での保存、Escape でのキャンセル動作確認
    - バリデーションエラー表示の確認
    - _要件: 5.3, 5.4, 5.8_

- [x] 7. チェックポイント - 新規コンポーネントの動作確認
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。

- [x] 8. TemplateList コンポーネントの改修（packages/web/src/components/template/TemplateList.tsx）
  - [x] 8.1 ドラッグ&ドロップ機能を実装する
    - 各テンプレート行にドラッグハンドル（⠿アイコン）を追加
    - HTML5 Drag and Drop API（dragstart, dragover, drop, dragend）を実装
    - ドラッグ中のテンプレートを視覚的にハイライト
    - ドロップ時に onReorder コールバックを呼び出す
    - _要件: 3.1, 3.2, 3.4_
  - [x] 8.2 お気に入りセクションを実装する
    - 各テンプレート行に星アイコンを直接表示（アクションパネルではなく一覧内）
    - お気に入りテンプレートを「お気に入り」ラベル付きで一覧最上部に固定表示
    - 視覚的な区切り線で通常テンプレートと区別
    - 星アイコンクリックで onToggleFavorite コールバックを呼び出す
    - _要件: 4.1, 4.2, 4.3, 4.6_
  - [x] 8.3 InlineEditor を TemplateList に統合する
    - テンプレート名・本文クリックで InlineEditor に切替
    - 保存成功時に一覧を更新
    - 保存失敗時にエラーメッセージを表示し編集内容を保持
    - _要件: 5.1, 5.2, 5.5, 5.6_
  - [ ]* 8.4 TemplateList 改修のユニットテストを作成する
    - お気に入りセクションの表示/非表示確認
    - ドラッグハンドルの表示確認
    - _要件: 3.4, 4.2, 4.3_

- [x] 9. TemplateActions コンポーネントの改修（packages/web/src/components/template/TemplateActions.tsx）
  - [x] 9.1 「編集」ボタンを削除し、複製ボタンの動作を修正する
    - 「編集」ボタンを削除（インライン編集に置換するため）
    - `onEdit` プロップを削除
    - 複製ボタンのクリックハンドラが正しく動作することを確認
    - お気に入りボタンは TemplateList の行内に移動するため、TemplateActions からは削除を検討
    - _要件: 5.7, 1.1_
  - [ ]* 9.2 TemplateActions 改修のユニットテストを作成する
    - 「編集」ボタンが存在しないことの確認
    - 複製ボタンの動作確認
    - _要件: 5.7, 1.1_

- [x] 10. テンプレート管理ページの統合（packages/web/src/app/templates/page.tsx）
  - [x] 10.1 FolderPanel をサイドバーとして統合する
    - レイアウトを左サイドバー（FolderPanel）+ メインコンテンツに変更
    - フォルダ選択状態の管理（selectedFolderId state）
    - フォルダ選択時に folderId でテンプレートをフィルタリング
    - フォルダ CRUD 操作のハンドラを接続
    - _要件: 2.2, 2.4, 2.5_
  - [x] 10.2 お気に入り状態の初期ロードとドラッグ&ドロップの接続
    - ページ読み込み時に `getFavorites()` でお気に入り一覧を取得
    - お気に入りトグルのハンドラを TemplateList に接続
    - ドラッグ&ドロップ完了時に `reorderTemplates()` を呼び出す
    - フォルダ間ドラッグ&ドロップで folderId と sortOrder を同時更新
    - _要件: 3.2, 3.3, 3.5, 4.4_
  - [x] 10.3 インライン編集の接続と編集フォームの調整
    - InlineEditor の保存コールバックで `updateTemplate()` を呼び出す
    - 保存成功時にテンプレート一覧を再取得
    - 保存失敗時にエラーメッセージを表示し編集内容を保持
    - 従来の編集フォーム（TemplateForm）は新規作成時のみ使用するよう調整
    - _要件: 5.3, 5.5, 5.6_
  - [ ]* 10.4 インライン編集の保存往復一貫性のプロパティベーステストを作成する
    - **Property 9: インライン編集の保存往復一貫性**
    - **検証対象: 要件 5.3**

- [x] 11. 最終チェックポイント - 全機能の統合確認
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。

## 注意事項

- `*` マーク付きのタスクはオプションであり、MVP のためにスキップ可能
- 各タスクは具体的な要件を参照しトレーサビリティを確保
- チェックポイントで段階的に動作を検証
- プロパティベーステストは fast-check ライブラリを使用
- SMS送信機能（/api/sms/send, /api/sms/test-send, page.tsx）は一切変更しないこと
