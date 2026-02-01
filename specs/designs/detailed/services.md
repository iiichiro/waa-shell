# 詳細設計: サービス & インターフェース (Services - Rev 6)

## 1. Cost Service (`services/cost`)

### Class: `CostService`

トークン単価に基づくコストを計算する。

```typescript
interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

class CostService {
  // モデルごとの単価（Modelsテーブルのpricing列）を取得し、計算する
  async calculateCost(modelId: string, usage: TokenUsage): Promise<number>;

  // スレッド全体の累積コストを計算
  async getThreadCost(threadId: number): Promise<number>;
}
```

## 2. Search Service (`services/search`)

### Class: `SearchService`

Dexie または 軽量全文検索ライブラリ (FlexSearch) をラップする。

```typescript
interface SearchResult {
  threadId: number;
  messageId: number;
  contentSnippet: string;
  score: number;
  timestamp: Date;
}

class SearchService {
  // 全メッセージ対象の検索
  async search(query: string): Promise<SearchResult[]>;

  // インデックス再構築（必要な場合）
  async reindex(): Promise<void>;
}
```

## 3. Auth Service (MCP Deep Link Strategy)

### Class: `AuthHandler`

Tauri の Deep Link Plugin を使用して OAuth コールバックを処理する。

```typescript
// architecture.md / logic.md 参照の実装詳細
// Main Process (Rust) が waa-shell://auth/callback?code=... を受け取り、
// Frontend に Event を発火 -> AuthHandler が listen して処理。
```

## 4. File Service (Maintained)

(No changes)

## 5. MCP App Resource Service (`services/mcp-app`)

### 概要

MCP Apps対応サーバーからUIリソースを取得し、チャット上にインタラクティブUIを表示するためのサービス。

### インターフェース

```typescript
// MCP Apps UIのメタデータ（db.tsで定義）
interface McpAppUiData {
  resourceUri: string;  // ui://スキームのリソースURI
  permissions?: string[];
  csp?: { allowedOrigins?: string[] };
}

// リソース取得
async function fetchMcpAppResource(mcpAppUi: McpAppUiData): Promise<string | null>;

// サーバー名からIDを取得
async function getServerIdByName(serverName: string): Promise<number | null>;
```

### 機能

1. **ui://リソース解決**: resourceUriからサーバー名とパスを抽出
2. **HTTPリソース取得**: MCPサーバーの/resources/エンドポイントからHTMLを取得
3. **認証サポート**: OIDCトークンをヘッダーに追加

## 6. MCP Service 拡張

### ツール実行結果の拡張

```typescript
// ツール実行結果（メタデータ付き）
interface McpToolExecutionResult {
  content: string;
  mcpAppUi?: McpAppUiData;  // MCP Apps UIメタデータ
}

// _meta.uiメタデータを抽出
function extractMcpAppUiMetadata(result: unknown): McpAppUiData | undefined;

// メタデータ付きツール実行
async function executeMcpToolWithMetadata(
  serverName: string,
  toolName: string,
  args: unknown
): Promise<McpToolExecutionResult>;
```

### 処理フロー

1. ツール実行結果から`_meta.ui`メタデータを抽出
2. `resourceUri`が`ui://`スキームで始まるか確認
3. 有効なメタデータが存在する場合、`mcpAppUi`フィールドに保存
