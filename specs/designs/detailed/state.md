# 詳細設計: 状態管理 (State Management - Rev 3)

## 1. Expanded Global Stores (Slice Pattern)

Zustand ストアは機能ごとに Slice に分割して管理する。

### `useAppStore`

以下の Slice を統合したストア。

#### `UISlice` (UI State)
- `activeThreadId`: number | null
- `isSidebarOpen`: boolean
- `isSettingsOpen`: boolean
- `isCommandManagerOpen`: boolean
- `isFileExplorerOpen`: boolean
- `isThreadSettingsOpen`: boolean
- `isLauncher`: boolean

#### `SettingsSlice` (User Preferences)
- `theme`: 'light' | 'dark' | 'system'
- `sendShortcut`: 'enter' | 'ctrl-enter'
- `autoGenerateTitle`: boolean
- `titleGenerationProvider`: string
- `titleGenerationModel`: string

#### `ToolsSlice` (Tool Configurations)
- `enabledTools`: Record<string, boolean>

---

### `useModelsStore` (Model Data) - *Future Plan*

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
