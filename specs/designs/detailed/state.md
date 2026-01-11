# 詳細設計: 状態管理 (State Management - Rev 2)

## 1. Expanded Global Stores

### `useAppStore` (UI State)

- `isSettingsOpen`: boolean
- `activeSidebarItem`: string

### `useModelsStore` (Model Data)

- **State**:
  - `providers`: Record<string, Provider>
  - `models`: Record<string, AIModel>
  - `isLoading`: boolean
- **Actions**:
  - `upsertProvider(provider)`
  - `toggleModel(modelId, enabled)`
  - `fetchRemoteModels(providerId)`: Thunk action using `ModelRegistry`.

### `useAssistantsStore`

- **State**:
  - `assistants`: Assistant[]
- **Selectors**:
  - `defaultAssistant`: Returns the marked default assistant.

## 2. TanStack Query Keys (Refined)

- `['settings']`: グローバル設定 (Dexie から取得する場合)
- `['providers']`: プロバイダー設定一覧
- `['models', { providerId }]`: プロバイダーごとのモデル
- `['prompts']`: 保存されたプロンプト一覧

## 3. Context & derived state

スレッド表示時のモデル名表示などは、`thread.modelId` と `useModelsStore` を組み合わせて解決する。
「Unknown Model」とならないよう、削除されたモデル ID を参照している場合のフォールバック表示も考慮する。
