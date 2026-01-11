# 変更記録: プロジェクト名の確定と反映 (2026-01-11)

## 1. 変更の理由 (Reason)

プロジェクトの正式名称が「Waa-Shell」に決定したため。これに伴い、ドキュメント、プロジェクト設定、および関連する URL スキームを一貫性のある名称に変更する必要がある。

## 2. 変更内容 (Changes)

### 2.1 プロジェクト名の反映
- `README.md` および各種仕様書における「AI Chat Launcher」等の仮称を「Waa-Shell」に変更。
- `specs/requirements.md` 等の概要説明に正式名称を記載。

### 2.2 URL スキームの変更
- Deep Link 用のカスタム URL スキームを `aichat://` から `waa-shell://` に変更。
- これに伴い、認証コールバック URL は `waa-shell://auth/callback` となる。

### 2.3 影響範囲
- **ドキュメント**: 全般 (`README.md`, `specs/**/*.md`)
- **Deep Link 設定**: `tauri.conf.json` (※実装側の変更が必要)
- **認証プロバイダー設定**: 外部 OAuth プロバイダー（GitLab, Google 等）に登録しているリダイレクト URI の変更が必要。
