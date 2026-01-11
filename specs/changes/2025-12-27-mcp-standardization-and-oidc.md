# 変更記録: MCP 連携の標準化と OIDC 認証の導入

## 1. 変更の理由 (Reason)

1.  **プロトコルの現代化**: 
    従来の手動実装（SSE + fetch）は MCP の最新仕様（Streamable HTTP）に完全に対応しておらず、将来的な拡張性や堅牢性に欠けていた。
2.  **公式 SDK の採用**: 
    `@modelcontextprotocol/sdk` を使用することで、JSON-RPC 2.0 の正しいシーケンス、セッション管理、および接続ライフサイクルをプロトコル準拠で実現するため。
3.  **セキュリティの強化**: 
    リモート MCP サーバとの連携において、エンタープライズレベルで要求される OIDC (OpenID Connect) 認証をサポートし、API キーと同様にトークンを安全に管理するため。

## 2. 変更内容 (Changes)

### 2.1 技術選定の変更
- **MCP Client**: `Native fetch` から `@modelcontextprotocol/sdk` へ変更。
- **Transport**: `SSEClientTransport` に加え、最新の `StreamableHTTPClientTransport` をサポート。
- **Authentication**: OIDC (Bearer Token) 認証、PKCE (Authorization Code Flow) の導入。
- **LLM Client**: 型安全性の向上のため、公式 `OpenAI SDK` を採用。

### 3.2 アーキテクチャの変更
- **AuthHandler**: Deep Link (`aichat://auth/callback`) を介した OAuth リダイレクト処理の追加。
- **Service Layer**: クライアントインスタンスを持続的に管理する `McpService` および `AuthService` の設計刷新。
- **UI/UX**: MCP 設定画面における認証設定項目の追加と、外部ウィンドウを用いたログインフローの実装。

### 3.3 データモデルの変更
- `mcp_servers`: 認証タイプ (`authType`)、OIDC 設定 (`oidcConfig`)、接続ステータス等のフィールドを追加。
- `messages`: ツール呼び出しを追跡するための `tool_calls`, `tool_call_id` フィールドを正式に追加。
