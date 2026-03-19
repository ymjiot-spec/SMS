# 要件定義書: テンプレートフォルダ管理

## はじめに

テンプレート管理画面（/templates）の大幅改善。フォルダによるテンプレート整理、ドラッグ&ドロップによる並び替え、お気に入り固定表示、インライン編集、および複製ボタンの修正を行う。複数ユーザーが利用する環境で、テンプレートを効率的に分類・管理できるようにする。

**重要な制約**: SMS送信機能（/api/sms/send, /api/sms/test-send, page.tsx のSMS送信画面）は変更対象外とする。

## 用語集

- **Template_Manager**: テンプレート管理画面（/templates）のフロントエンドページ
- **Template_List**: テンプレート一覧を表示するコンポーネント（TemplateList.tsx）
- **Template_Actions**: テンプレートに対するアクション（編集・複製・削除・お気に入り）を提供するコンポーネント
- **Folder**: テンプレートを分類するためのグループ単位。名前を持ち、テンプレートを格納する
- **Backend_Server**: packages/backend/server.ts のスタンドアロンデモサーバー（インメモリデータ）
- **API_Client**: packages/web/src/lib/api-client.ts のHTTPクライアント
- **Drag_Handle**: ドラッグ&ドロップ操作を開始するためのUI要素
- **Inline_Editor**: テンプレート本文をクリックして直接編集するモード
- **Favorite_Section**: お気に入りテンプレートを一覧上部に固定表示するセクション

## 要件

### 要件 1: テンプレート複製機能の修正

**ユーザーストーリー:** オペレーターとして、テンプレートを複製して新しいテンプレートを素早く作成したい。既存の複製ボタンが正常に動作しないため修正が必要である。

#### 受け入れ基準

1. WHEN ユーザーが複製ボタンをクリックした場合、THE Template_Actions SHALL 元テンプレートの名前に「(コピー)」を付与した新しいテンプレートを作成する
2. WHEN 複製が成功した場合、THE Template_List SHALL 複製されたテンプレートを一覧に即座に表示する
3. WHEN 複製対象のテンプレートが存在しない場合、THE Template_Manager SHALL エラーメッセージを表示する
4. THE Backend_Server SHALL POST /api/templates/:id/duplicate エンドポイントで元テンプレートの全フィールド（name, body, companyId, brand, purpose, department, visibility）を複製した新しいテンプレートを返す

### 要件 2: フォルダ機能

**ユーザーストーリー:** オペレーターとして、テンプレートをフォルダで分類したい。複数のユーザーが利用する環境で、目的別・企業別にテンプレートを整理できるようにする。

#### 受け入れ基準

1. THE Backend_Server SHALL フォルダのCRUD操作（作成・取得・更新・削除）用のAPIエンドポイントを提供する
2. WHEN ユーザーがフォルダ作成ボタンをクリックした場合、THE Template_Manager SHALL フォルダ名を入力するUIを表示する
3. WHEN ユーザーがフォルダ名を入力して確定した場合、THE Backend_Server SHALL 新しいフォルダをインメモリデータに保存する
4. THE Template_List SHALL フォルダをツリー構造またはグループとして一覧に表示する
5. WHEN ユーザーがフォルダをクリックした場合、THE Template_List SHALL そのフォルダに属するテンプレートのみを表示する
6. WHEN ユーザーがテンプレートをフォルダに移動した場合、THE Backend_Server SHALL テンプレートのfolderId属性を更新する
7. WHEN フォルダが削除された場合、THE Backend_Server SHALL そのフォルダに属するテンプレートのfolderIdをnullに設定する（テンプレート自体は削除しない）
8. THE Template_Manager SHALL フォルダに属さないテンプレートを「未分類」として表示する
9. WHEN ユーザーがフォルダ名を編集した場合、THE Backend_Server SHALL フォルダ名を更新する

### 要件 3: ドラッグ&ドロップによる並び替え

**ユーザーストーリー:** オペレーターとして、テンプレートの表示順をドラッグ&ドロップで自由に変更したい。よく使うテンプレートを上に配置して作業効率を上げる。

#### 受け入れ基準

1. WHEN ユーザーがテンプレートのDrag_Handleをドラッグした場合、THE Template_List SHALL ドラッグ中のテンプレートを視覚的にハイライトする
2. WHEN ユーザーがテンプレートを別の位置にドロップした場合、THE Template_List SHALL テンプレートの表示順を更新する
3. WHEN 並び替えが完了した場合、THE Backend_Server SHALL 新しい表示順をインメモリデータに保存する
4. THE Template_List SHALL 各テンプレート行にDrag_Handleを表示する
5. WHEN ユーザーがテンプレートをフォルダ間でドラッグ&ドロップした場合、THE Backend_Server SHALL テンプレートのfolderIdと表示順を同時に更新する

### 要件 4: お気に入り（星）機能の改善

**ユーザーストーリー:** オペレーターとして、よく使うテンプレートに星をつけて一覧の上部に固定表示したい。素早くアクセスできるようにする。

#### 受け入れ基準

1. WHEN ユーザーがテンプレートの星アイコンをクリックした場合、THE Template_Manager SHALL お気に入り状態をトグルする
2. WHILE お気に入りテンプレートが存在する場合、THE Template_List SHALL お気に入りテンプレートをFavorite_Sectionとして一覧の最上部に表示する
3. THE Favorite_Section SHALL 「お気に入り」ラベルと視覚的な区切り線で通常テンプレートと区別する
4. WHEN ページを再読み込みした場合、THE Template_Manager SHALL お気に入り状態をBackend_Serverから取得して復元する
5. THE Backend_Server SHALL お気に入り状態をユーザー単位でインメモリデータに保存する
6. THE Template_List SHALL 各テンプレート行に星アイコンを直接表示する（テンプレート選択後のアクションパネルではなく一覧内に表示する）

### 要件 5: インライン編集機能

**ユーザーストーリー:** オペレーターとして、テンプレートの内容をクリックして直接編集したい。別画面やフォームを開く手間を省き、素早く修正できるようにする。

#### 受け入れ基準

1. WHEN ユーザーがテンプレートの本文エリアをクリックした場合、THE Inline_Editor SHALL テキストエリアに切り替わり編集モードに入る
2. WHEN ユーザーがテンプレート名をクリックした場合、THE Inline_Editor SHALL テンプレート名を編集可能なテキスト入力に切り替える
3. WHEN ユーザーが編集中にEnterキー（名前の場合）またはCtrl+Enter（本文の場合）を押した場合、THE Inline_Editor SHALL 変更をBackend_Serverに保存する
4. WHEN ユーザーが編集中にEscapeキーを押した場合、THE Inline_Editor SHALL 変更を破棄して表示モードに戻る
5. WHEN 保存が成功した場合、THE Template_Manager SHALL 更新されたテンプレートを一覧に反映する
6. IF 保存に失敗した場合、THEN THE Template_Manager SHALL エラーメッセージを表示し、編集内容を保持する
7. THE Template_Actions SHALL 従来の「編集」ボタンを削除する（インライン編集に置き換えるため）
8. WHILE 編集モードの場合、THE Inline_Editor SHALL 変数フォーマット（{{variable_name}}）のバリデーションを実行する

### 要件 6: SMS送信機能の保護

**ユーザーストーリー:** 開発者として、テンプレート管理の改善がSMS送信機能に影響を与えないことを保証したい。

#### 受け入れ基準

1. THE Template_Manager SHALL SMS送信エンドポイント（/api/sms/send, /api/sms/test-send）のコードを変更しない
2. THE Template_Manager SHALL SMS送信画面（packages/web/src/app/page.tsx）のコードを変更しない
3. THE API_Client SHALL SMS送信関連の関数（sendSms, testSendSms, sendSmsWithSelfCopy）を変更しない
