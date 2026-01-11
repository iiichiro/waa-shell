# 詳細設計: アプリケーションロジック (Logic Specifications - Rev 2)

## 1. Thread Management & Branching

(No changes)

## 2. Context Management

(No changes)

## 3. Request Lifecycle

(No changes)

## 4. MCP Authentication Flow (Deep Link Strategy)

外部サービス (e.g. Google Drive, Gitlab MCP) への OAuth 認証フロー。

### 4.1 Protocol

- **Scheme**: `waa-shell://`
- **Callback Path**: `/auth/callback`

### 4.2 Sequence

1. **Initiate**: ユーザーが MCP 設定で「Connect」をクリック。
2. **Open Browser**: ブラウザ (System Default) で認証 URL を開く。
   - `redirect_uri` は `waa-shell://auth/callback` を指定。
3. **User Approve**: ブラウザ上で許可。
4. **Redirect**: ブラウザが `waa-shell://...` にリダイレクトしようとする。
5. **OS Handle**: OS が `Waa-Shell` アプリを起動/フォーカスし、URL を渡す。
6. **Tauri Plugin**: Rust 側の `tauri-plugin-deep-link` が URL をキャッチし、Frontend にイベント `oauth://callback` を emit。
7. **Frontend Handle**: `MCPClient` がコードを受け取り、Access Token と交換して IndexedDB (暗号化領域) に保存。

## 5. Tool Execution (MCP) Logic

(No changes)

## 6. Window Toggle Logic (Launcher Mode)

Tauri の Global Shortcut と連携したウィンドウ表示制御。

1. **Shortcut Event**: OS レベルで登録されたキーイベントが発生。
2. **Current State Check**: `window.isVisible()` および `window.isFocused()` を確認。
3. **Action Execution**:
   - 非表示または非フォーカスの場合: `window.show()`, `window.unminimize()`, `window.set_focus()`。
   - 表示かつフォーカス済みの場合: `window.hide()` または `window.minimize()`。
4. **Initial Focus**: フロントエンド側で `isLauncherVisible` イベントを検知し、`<Input />` にフォーカスを当てる。
