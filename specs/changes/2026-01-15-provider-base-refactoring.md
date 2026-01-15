# 2026-01-15: Google SDK 移行およびマルチプロバイダー基盤の刷新

## 変更の理由 (Reason)

1.  **Google SDK の刷新**: 非推奨となった `@google/generative-ai` から、最新の `@google/genai` SDK へ移行し、Gemini 2.0 系統などの最新機能（システムプロンプトの正式対応、パフォーマンス向上等）を享受するため。
2.  **プロバイダーの独立化**: 初期設計では OpenAI SDK への相乗りが中心だったが、Google, Anthropic, Ollama それぞれの特性（異なる API 構造、ストリーミング方式）に最適化された専用プロバイダーを実装し、保守性を高めるため。
3.  **高度な機能への対応**: OpenAI の `POST /v1/responses` (Response API) を利用した推論（Reasoning）プロセス表示などの最新機能に対応するため。

## 主な変更内容 (Changes)

### 1. プロバイダー基盤の修正
- `BaseProvider` インターフェースの定義と、各プロバイダー（`GoogleProvider`, `AnthropicProvider`, `OllamaProvider`, `OpenAIProvider`）の実装。
- `ProviderFactory` による、プロバイダータイプ（`google`, `anthropic`, `ollama` 等）に応じた動的なインスタンス生成。

### 2. Google SDK 移行 (@google/genai)
- `GoogleProvider.ts` を刷新し、最新 SDK の `Pager` (モデルリスト), `generateContentStream` (生成) に対応。
- システムメッセージ（`systemInstruction`）の `config` 内への配置や、レスポンスからのテキスト抽出・トークン数取得方法の更新。

### 3. Response API 対応と表示制御
- `Provider` テーブルに `supportsResponseApi` フラグを追加。
- プロバイダー設定画面において、OpenAI 互換プロバイダー（OpenAI, Azure, OpenRouter, LiteLLM）に対してのみ Response API 設定を表示するように制限。

### 4. ドキュメントの同期
- `specs/designs/tech_stack.md` に最新の SDK 構成を反映。
- `specs/designs/data_model.md` のスキーマ定義を現状の実装（`supportsResponseApi` 等）に合わせて更新。
- `README.md` の技術スタックセクションを最新化。
