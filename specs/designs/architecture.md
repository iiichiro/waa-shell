# アーキテクチャ設計書

## 1. アーキテクチャ概要

本アプリケーションは、**「Frontend Transcendent (フロントエンド超越)」** アーキテクチャを採用する。
Tauri はあくまでネイティブウィンドウのラッパーとして機能し、アプリケーションの全ロジックは WebView（ブラウザプロセス）内で完結する。これにより、将来的な Web ブラウザ版（PWA）としての公開もコード変更なしで可能にする。

### ハイレベル構成図

```mermaid
graph TD
    User[User] --> UI[React UI Layer]

    subgraph "Browser Process (WebView)"
        UI --> Logic[Business Logic / Hooks]
        Logic --> Services[Service Layer]

        Services --> DB[(Dexie.js / IndexedDB)]
        Services --> DB[(Dexie.js / IndexedDB)]
        Services --> LLM[LLM Client (OpenAI SDK)]
        Services --> MCP[MCP Client (Official SDK)]
        MCP --> Auth[AuthHandler (OIDC/Deep Link)]
    end

    subgraph "External World"
        LLM -- HTTPS --> Provider[AI Provider]
        MCP -- "Streamable HTTP" --> MCPServer[MCP Server]
        Auth -- PKCE --> IdP[Identity Provider]
    end
```

## 2. ディレクトリ構成 (Frontend Monolith)

`src/` 配下を機能単位（Features）で分割協調させる。

```
src/
├── app/                  # アプリケーションのエントリー・設定
│   ├── main.tsx
│   ├── App.tsx
│   └── router.tsx        # TanStack Router 定義
├── components/           # 共通UIコンポーネント (Button, Input, etc)
│   └── ui/               # Design System 実装
├── features/             # 機能ドメイン
│   ├── chat/             # チャット機能 (Message list, Input area)
│   │   └── components/   # ChatMessage, ChatInputArea etc.
│   ├── assistants/       # アシスタント管理
│   ├── prompts/          # プロンプト管理
│   ├── mcp/              # MCPサーバ設定・ツール管理
│   └── settings/         # アプリ全体設定
├── hooks/                # 共通Custom Hooks (useChatInput, etc)
├── lib/                  # 外部ライブラリのラッパー・設定 (dexie, axios, etc)
│   └── providers/        # AI Provider Implementations (AbstractProvider base)
├── services/             # 外部通信・ビジネスロジックのコア
│   ├── llm/              # LLM API Client Implementation
│   ├── mcp/              # MCP Client Implementation (Client Class)
│   ├── db/               # Dexie Database Class
│   ├── cost/             # Cost Calculation Service
│   └── search/           # Full-text Search Service
├── store/                # Global State Management (Zustand)
│   └── slices/           # State Slices (UI, Settings, Tools)
└── types/                # 型定義
```

## 3. 主要モジュール設計

### 3.1 MCP Client (Frontend Implementation)

MCP 仕様に基づき、ブラウザから直接接続可能なプロトコルのみをサポートする。

- **Transport Layer**:
  - `StreamableHTTPClientTransport`: 現代的な MCP トランスポート。セッション管理を SDK が代行。
  - (`SSEClientTransport`: 将来的なサポートまたはフォールバックとして想定)
- **Client Protocol**:
  - 公式 SDK による JSON-RPC 2.0 通信。Tool/Resource/Prompt の自動リストアップ。
- **Authentication**:
  - OIDC (Bearer Token) をサポートし、トランスポート確立時にヘッダ注入を行う。

### 3.2 Service Extensions (Cost, Search, Auth)

- **CostService**:
  - トークン使用量 (`usage`) とモデル単価情報に基づき、メッセージおよびスレッド単位のコストを計算・管理する。
- **SearchService**:
  - Dexie のインデックス (`startsWith`) または軽量全文検索ライブラリを用いて、メッセージ履歴の高速検索を提供する。
- **AuthHandler (Deep Link)**:
  - Tauri Plugin (`tauri-plugin-deep-link`) と連携し、`waa-shell://auth/callback` への OAuth リダイレクトを捕捉して認証トークンを取得する。

### 3.2 データ永続化 (Storage)

すべてのデータは IndexedDB に保存する。機密情報（API Key）については、ブラウザの `Crypto API` を用いて暗号化して保存するか、Tauri の `Secret Store` plugin（Tauri 依存を入れる場合）を検討するが、今回は「Web 公開可能性」を考慮し、Local Storage / Buffered IndexedDB への暗号化保存（パスフレーズはユーザー入力または LocalOnly）を推奨する。

### 3.3 非同期処理と状態同期

- **TanStack Query** を全面的に採用し、DB からのデータ取得、LLM API の状態、MCP サーバの接続状態を管理する。
- ストリーミングレスポンスは、Zustand ストアまたは React Context 内の Ref を通じて UI に逐次反映させる（再レンダリング最適化のため）。

## 4. ウィンドウ管理 (Window Management)

ランチャー（Raycast）としての振る舞いのため、以下の制御を実装する。

- **Multi-Window Strategy**:
  - `main`: 通常のチャット、設定、ファイル管理用。
  - `launcher`: 中央に配置されるクイックチャット専用ウィンドウ（枠なし、透明度あり）。
- **Focus & Visibility**:
  - グローバルショートカット押下時に `launcher` ウィンドウを `show()` かつ `focus()`。
  - `blur` イベントまたは同じショートカット押下時に `hide()`。
