# 詳細設計: コンポーネント設計 (Components - Rev 2)

## 1. コンポーネントディレクトリ構造 (Update)

```
src/components/
├── features/
│   ├── settings/    # (NEW) 設定モーダル・管理画面
│   ├── assistants/  # (NEW) アシスタントエディタ
│   ├── prompts/     # (NEW) プロンプト管理
```

## 2. 機能別コンポーネント詳細

### 2.4 Settings Feature (`features/settings/`)

#### `<SettingsDialog />`

- **責務**: 設定モーダルの Root。Tab 管理。
- **Tabs**: General, Chat, Models, Assistants, Prompts, MCP.

#### `<ModelManager />`

- **責務**: プロバイダー設定とモデルリスト管理。
- **Children**:
  - `<ProviderCard />`: プロバイダーごとの設定（API Key, Base URL）。ステータス（接続確認済みか）を表示。
  - `<ModelList />`: 取得したモデル一覧の On/Off スイッチ。

#### `<KeyBindingSelector />`

- **責務**: 送信キー（Enter / Ctrl+Enter）の選択。

### 2.5 Assistants Feature (`features/assistants/`)

#### `<AssistantSelector />`

- **責務**: サイドバーや新規チャット時のアシスタント選択ドロップダウン。

#### `<AssistantEditor />`

- **責務**: アシスタントの作成・編集フォーム。
- **Fields**: Name, Description, System Prompt, Default Model (Select).

### 2.6 Chat Interface Enhancements

#### `<ChatHeader />`

- **Children**:
  - `<TitleEditor />`
  - `<ModelQuickSwitcher />`: 現在のスレッドのモデルを一時的に変更するドロップダウン。
    - **Logic**: 変更時 `updateThread({ modelConfigOverride: ... })` をコール。
  - `<ThreadSettingsMenu />`: エクスポート、削除、デフォルト設定リセットなど。

#### `<ChatMessage />` (Refactored)

巨大なコンポーネントを分割し、責務を分離。

- **Children**:
  - `<ChatMessageAvatar />`: ユーザー/AI/システムのアバター表示。
  - `<ChatMessageHeader />`: 名前、ブランチ切り替えナビゲーション。
  - `<ChatMessageContent />`: Markdown レンダリング、Thinking Process、ツール実行結果表示。
  - `<ChatMessageEditor />`: メッセージ編集モード時のテキストエリア。
  - `<ChatMessageActions />`: コピー、再生成、編集開始ボタン。

#### `<ChatInputArea />`

- **Logic**: 入力状態管理、ファイル選択、ハンドリングロジックは `useChatInput` フックに委譲。

#### `<PromptCommandMenu />`

- **責務**: `/` 入力時にトリガーされるコマンドパレット (`cmdk`等を使用)。
- **Data**: `usePrompts()` からデータを取得。

### 2.8 File Management Feature (`features/files/`)

#### `<FileManager />`

- **責務**: ストレージ内ファイルのギャラリー表示および管理（削除）。
- **Layout**: Grid view with sorting/filtering (Date, Size, Type).

#### `<FileCard />`

- **責務**: 個別ファイルのプレビューとアクション。
- **Actions**: View (Lightbox), Download, Delete, Jump to Thread (if associated).

### 2.9 UI Elements (Tailwind v4 class mapping)

- **ToggleSwitch**: `data-[state=checked]:bg-primary`
- **Select**: Radix Select styled with backdrop blur.
