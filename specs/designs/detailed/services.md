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
