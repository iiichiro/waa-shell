# データモデル設計書 (Dexie.js / IndexedDB)

## 1. データベース概要

(No changes)

## 2. スキーマ定義

```typescript
// Dexie Schema Definition
db.version(2).stores({
  threads: '++id, title, createdAt, updatedAt',
  messages: '++id, threadId, parentId, role, createdAt, content',
  assistants: '++id, name, isDefault, createdAt',
  providers: '++id, name, type, isActive',
  modelConfigs: '[providerId+modelId], providerId, modelId',
  manualModels: 'uuid, providerId, modelId, name',
  slashCommands: '++id, &key, label, createdAt',
  mcp_servers: '++id, &name, type, authType, isActive, createdAt',
  settings: 'key',
  files: '++id, threadId, messageId, fileName, mimeType, createdAt',
});
```

## 3. 詳細定義

### 3.4 Threads & Messages (Expanded)

#### Messages Table

コスト管理と検索対応のためのフィールドを追加。

| Field     | Type                                          | Description                                                                  |
| :-------- | :-------------------------------------------- | :--------------------------------------------------------------------------- |
| `id`      | `number` (AutoInc)                            | メッセージ ID                                                                |
| `role`    | `'user' \| 'assistant' \| 'system' \| 'tool'` | ロール                                                                       |
| `content` | `string`                                      | テキスト本文 (Index for Search)                                              |
| `tool_calls` | `Json`                                     | AI からのツール実行要求                                                      |
| `tool_call_id` | `string`                                   | 実行結果 (`role: 'tool'`) が紐づく ID                                       |
| `usage`   | `Json`                                        | `{ prompt_tokens: number, completion_tokens: number, total_tokens: number }` |
| `cost`    | `Json`                                        | `{ total: number, currency: string }`                                        |
| ...       | ...                                           | (Existing fields)                                                            |

### 3.6 LocalFiles (Previously defined)

(No changes)
