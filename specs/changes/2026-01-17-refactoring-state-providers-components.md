# 変更記録: コードベース全体のリファクタリング (2026-01-17)

## 1. 変更の理由 (Reason)

プロジェクトの規模拡大に伴い、以下の課題が顕在化したため、大規模なリファクタリングを実施した。

1.  **状態管理の肥大化**: `useAppStore` が単一ファイルに巨大なオブジェクトとして定義されており、可読性と保守性が低下していた。
2.  **コードの重複**: AI プロバイダー（OpenAI, Anthropic, Google, Ollama）の実装において、モデル一覧取得 (`listModels`) などのロジックが重複しており、修正時の漏れや手間の原因となっていた。
3.  **コンポーネントの複雑化**: `ChatMessage.tsx` が表示、編集、ツール実行結果、ファイルプレビューなどの責務を抱え込み、1ファイルあたりの行数が増大していた。
4.  **ロジックの混在**: UI コンポーネント (`ChatInputArea.tsx`) 内にファイル処理やイベントハンドリングのロジックが混在し、可読性を損なっていた。

## 2. 変更内容 (Changes)

### 2.1 状態管理 (State Management)
- **Slice Pattern の導入**: `src/store/useAppStore.ts` を機能単位の Slice に分割。
    - `UISlice`: サイドバー、設定画面などのUI状態。
    - `SettingsSlice`: テーマ、ショートカットキーなどのアプリ設定。
    - `ToolsSlice`: ツールの有効/無効状態。
- これらを `src/store/slices/` ディレクトリに配置し、`useAppStore` で統合する形に変更。

### 2.2 プロバイダー基盤 (Provider Architecture)
- **`AbstractProvider` の導入**: 共通ロジックを持つ基底クラス (`src/lib/providers/AbstractProvider.ts`) を作成。
    - `listModels`: API からの取得と DB 設定のマージロジックを共通化。
    - `fetchApiModels`: 各プロバイダーが実装すべき抽象メソッドとして定義。
- 各プロバイダー実装 (`AnthropicProvider`, `OpenAIProvider`, `GoogleProvider`, `OllamaProvider`) を `AbstractProvider` 継承に変更し、重複コードを削除。

### 2.3 コンポーネント分割 (Component Decomposition)
- **`ChatMessage` の再構築**: `src/components/chat/message/` ディレクトリを作成し、責務ごとにサブコンポーネント化。
    - `ChatMessageHeader`: 送信者名、ブランチ操作。
    - `ChatMessageAvatar`: アバターアイコン。
    - `ChatMessageContent`: メッセージ本文、Markdown レンダリング、ツール出力。
    - `ChatMessageEditor`: メッセージ編集フォーム。
    - `ChatMessageActions`: コピー、再生成、編集ボタン。
    - `ImageAttachment`: 画像プレビュー。

### 2.4 ロジック抽出 (Logic Extraction)
- **Custom Hook の導入**: `ChatInputArea` の入力管理、ファイル添付、イベントハンドリングロジックを `src/hooks/useChatInput.ts` に抽出。
- `App.tsx` からも入力状態管理の一部を削除し、責務を明確化。

## 3. 影響範囲
- **Store**: `useAppStore` のインターフェース自体は維持されているが、内部実装が変更された。
- **UI**: チャット画面のレンダリング構造が変更された（見た目上の変化はなし）。
- **Provider**: 新しいプロバイダーを追加する際は `AbstractProvider` を継承することが推奨される。
