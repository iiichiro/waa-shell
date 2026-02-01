# MCP Apps対応の実装

**日付**: 2026-02-01

## 変更の理由

Waa-ShellをMCP App Hostとして動作させ、連携済みMCPサーバーから返されるMCP Apps UIをチャット上に表示できるようにするため。これにより、インタラクティブなデータ可視化、フォーム、ダッシュボード等がチャット内で直接使用可能になる。

## 実装内容

### 1. パッケージ追加

- `@modelcontextprotocol/ext-apps@^1.25.1` を依存関係に追加

### 2. データモデル拡張

- `McpAppUiData` インターフェースを追加（`db.ts`）
  - `resourceUri`: ui://スキームのリソースURI
  - `permissions`: 追加権限（カメラ、マイク等）
  - `csp`: Content Security Policy設定
- `Message` インターフェースに `mcpAppUi?: McpAppUiData` フィールドを追加

### 3. MCP Service 拡張

- `McpToolExecutionResult` インターフェースを追加
- `extractMcpAppUiMetadata()` 関数を実装
  - ツール実行結果から `_meta.ui` メタデータを抽出
  - `ui://` スキームの検証
- `executeMcpToolWithMetadata()` 関数を追加
  - UIメタデータ付きのツール実行結果を返す
- `executeMcpTool()` は後方互換性のため残存（文字列のみ返す）

### 4. MCP App Resource Service の新規作成

- `fetchMcpAppResource()`: ui://スキームからHTMLリソースを取得
- `getServerIdByName()`: サーバー名からIDを解決
- OIDC認証ヘッダーの自動付与

### 5. Tool Service 拡張

- `ToolExecutionResult` インターフェースを追加
- `executeToolWithMetadata()` 関数を実装
  - MCPツールの場合は `mcpAppUi` を含む結果を返す
  - ローカルツールの場合は従来通り

### 6. Chat Service 統合

- 全4箇所のツール実行箇所を `executeToolWithMetadata()` に変更
- ツール結果保存時に `mcpAppUi` フィールドも保存

### 7. UI実装

- `McpAppHost` コンポーネントを新規作成
  - sandboxed iframeによるレンダリング
  - App Bridgeプロトコル（postMessage）実装
  - ツール呼び出し転送機能
  - ローディング/エラー状態の表示
- `ChatMessageContent` コンポーネントを修正
  - 「MCP Apps UIを表示」ボタンを追加
  - UI表示時に `McpAppHost` をレンダリング
  - JSON結果は「生データ」として折りたたみ表示

### 8. 仕様書更新

- `specs/designs/detailed/services.md` に以下を追加
  - MCP App Resource Service の設計
  - MCP Service の拡張内容

## 技術的詳細

### リソース取得フロー

1. ツール実行時に `_meta.ui.resourceUri` を検出
2. `Message.mcpAppUi` としてDBに保存
3. ユーザーが「MCP Apps UIを表示」ボタンをクリック
4. `fetchMcpAppResource()` が ui:// リソースを取得
5. `McpAppHost` が iframe内にHTMLをレンダリング
6. App Bridge初期化（postMessage）

### セキュリティ対策

- iframeは `sandbox="allow-scripts allow-same-origin"` で制限
- 全通信はpostMessage経由
- リソース取得はユーザー操作後（明示的な同意）
- 外部オリジンへのアクセスはCSPで制御

## 制限事項

- MCP Apps対応はツール実行結果（`role: 'tool'` のメッセージ）のみ対応
- リソース取得はHTTP GETのみ（WebSocket等は未対応）
- App Bridgeの実装は基本機能のみ（高度な機能は今後拡張予定）

## 今後の拡張可能性

- 自動リソースプリロード設定
- 信頼済みサーバーによる自動UI表示
- App Bridge機能の拡張（コンテキスト更新、メッセージ送信等）
- iframeサイズの動的調整
