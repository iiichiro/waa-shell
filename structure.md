# プロジェクト構成ベストプラクティス

このドキュメントは、Tauri + React + TypeScript プロジェクトにおける理想的なディレクトリ構成とその役割を定義します。

---

## ルートディレクトリ構成

```
waa-shell/
├── .github/                  # GitHub 関連設定
├── .vscode/                  # VSCode 設定
├── public/                   # 静的アセット（ビルド時コピー）
├── specs/                    # 仕様書・設計ドキュメント
├── src/                      # フロントエンド（React）ソースコード
├── src-tauri/                # バックエンド（Rust/Tauri）ソースコード
├── tests/                    # E2Eテスト（Playwright）
├── .gitignore
├── biome.json                # Linter/Formatter 設定
├── index.html                # SPA エントリーポイント
├── package.json
├── playwright.config.ts      # Playwright 設定
├── tsconfig.json             # TypeScript 設定
├── vite.config.ts            # Vite ビルド設定
└── vitest.config.ts          # Vitest テスト設定
```

---

## 各ディレクトリの役割

### `.github/`

GitHub Actions ワークフローや Issue/PR テンプレートを配置。

```
.github/
└── workflows/
    ├── ci.yml                # CI（テスト・ビルド）
    ├── release.yml           # リリース自動化
    └── playwright.yml        # E2Eテスト実行
```

**配置すべきもの:**
- GitHub Actions ワークフローファイル（`.yml`）
- Issue テンプレート（`ISSUE_TEMPLATE/`）
- PR テンプレート（`pull_request_template.md`）
- Dependabot 設定（`dependabot.yml`）

---

### `public/`

Vite がビルド時にそのままコピーする静的アセットを配置。

```
public/
├── favicon.ico
└── robots.txt
```

**配置すべきもの:**
- ファビコン、OGP 画像
- `robots.txt`, `manifest.json`
- フォントファイル（外部 CDN を使わない場合）

**配置すべきでないもの:**
- JSX/TSX で import するアセット（`src/assets/` に配置）

---

### `specs/`

仕様書・設計ドキュメントを体系的に管理。

```
specs/
├── requirements.md           # 要件定義
├── navigation.md             # ナビゲーション仕様
├── ui_requirements.md        # UI 要件
├── designs/                  # 詳細設計書
│   ├── architecture.md       # アーキテクチャ設計
│   ├── data-model.md         # データモデル設計
│   └── api-spec.md           # API 仕様
├── changes/                  # 変更履歴・リファクタリング計画
│   └── migration-xxx.md
└── legacy/                   # アーカイブ（廃止予定の仕様）
```

**配置すべきもの:**
- 機能要件・非機能要件ドキュメント
- アーキテクチャ設計書
- API 仕様書
- データモデル定義
- 変更計画・マイグレーション手順

---

### `src/` - フロントエンドソースコード

React アプリケーションのソースコードを機能・責務別に整理。

```
src/
├── main.tsx                  # アプリケーションエントリーポイント
├── App.tsx                   # ルートコンポーネント
├── index.css                 # グローバルスタイル
├── vite-env.d.ts             # Vite 型定義
│
├── assets/                   # import するアセット
│   ├── images/
│   └── icons/
│
├── components/               # UI コンポーネント
│   ├── common/               # 汎用コンポーネント
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.css
│   │   │   └── index.ts
│   │   ├── Modal/
│   │   └── ErrorBoundary.tsx
│   │
│   ├── layout/               # レイアウトコンポーネント
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── CommonHeader.tsx
│   │
│   ├── chat/                 # チャット機能コンポーネント
│   │   ├── ChatMessage.tsx
│   │   ├── ChatInputArea.tsx
│   │   └── MarkdownRenderer.tsx
│   │
│   ├── settings/             # 設定画面コンポーネント
│   │   ├── SettingsView.tsx
│   │   ├── GeneralSettings.tsx
│   │   ├── ModelSettings.tsx
│   │   ├── ProviderSettings.tsx
│   │   └── McpServerSettings.tsx
│   │
│   └── command/              # コマンド関連コンポーネント
│       ├── CommandManager.tsx
│       ├── SlashCommandForm.tsx
│       └── SlashCommandSuggest.tsx
│
├── hooks/                    # カスタムフック
│   ├── useChat.ts
│   ├── useSettings.ts
│   ├── useKeyboardNavigation.ts
│   └── index.ts
│
├── lib/                      # ライブラリ・サービス層
│   ├── constants/            # 定数定義
│   │   └── index.ts
│   │
│   ├── db/                   # データベース関連
│   │   ├── schema.ts         # テーブル定義
│   │   └── migrations/       # マイグレーション
│   │
│   ├── services/             # ビジネスロジック
│   │   ├── ChatService.ts
│   │   ├── ModelService.ts
│   │   ├── ProviderService.ts
│   │   ├── AuthService.ts
│   │   ├── FileService.ts
│   │   ├── McpService.ts
│   │   ├── TemplateService.ts
│   │   └── ToolService.ts
│   │
│   ├── utils/                # ユーティリティ関数
│   │   ├── format.ts
│   │   ├── validation.ts
│   │   └── index.ts
│   │
│   └── db.ts                 # DB 初期化・接続
│
├── store/                    # 状態管理（Zustand など）
│   ├── useAppStore.ts
│   └── index.ts
│
├── types/                    # 型定義
│   ├── chat.ts
│   ├── provider.ts
│   ├── model.ts
│   └── index.ts
│
├── styles/                   # 共通スタイル
│   ├── variables.css         # CSS 変数
│   ├── reset.css             # リセット CSS
│   └── components/           # コンポーネント別スタイル
│
└── test/                     # ユニットテスト設定
    └── setup.tsx             # テストセットアップ
```

#### `src/components/` の責務

| サブディレクトリ | 役割 |
|---|---|
| `common/` | 再利用可能な汎用 UI コンポーネント（Button, Modal, Input など） |
| `layout/` | ページレイアウト構成（Header, Sidebar, Footer） |
| `chat/` | チャット機能に特化したコンポーネント |
| `settings/` | 設定画面のコンポーネント |
| `command/` | コマンド・スラッシュコマンド関連 |

> [!TIP]
> 各コンポーネントは `ComponentName/` ディレクトリにまとめ、`ComponentName.tsx`, `ComponentName.css`, `index.ts` を含めると管理しやすい。

#### `src/lib/services/` の責務

| ファイル | 役割 |
|---|---|
| `ChatService.ts` | チャットメッセージの送受信、ストリーミング処理 |
| `ModelService.ts` | AI モデルの取得、管理、設定 |
| `ProviderService.ts` | AI プロバイダー（OpenAI, Gemini など）の管理 |
| `AuthService.ts` | 認証・API キー管理 |
| `FileService.ts` | ファイルアップロード・管理 |
| `McpService.ts` | MCP サーバ連携 |
| `TemplateService.ts` | プロンプトテンプレート管理 |
| `ToolService.ts` | ツール機能（Function Calling）管理 |

---

### `src-tauri/` - バックエンド（Rust）

Tauri アプリケーションのネイティブ部分。

```
src-tauri/
├── src/
│   ├── main.rs               # エントリーポイント
│   └── lib.rs                # コマンド・プラグイン定義
│
├── capabilities/             # 権限定義
│   └── default.json
│
├── icons/                    # アプリアイコン
│   ├── icon.ico
│   └── icon.png
│
├── Cargo.toml                # Rust 依存関係
├── Cargo.lock
├── build.rs                  # ビルドスクリプト
└── tauri.conf.json           # Tauri 設定
```

**配置すべきもの:**
- Rust ソースコード（`src/`）
- Tauri コマンド定義
- ネイティブプラグイン実装
- アプリアイコン
- 権限・セキュリティ設定

---

### `tests/` - E2E テスト

Playwright を使用した E2E テストを配置。

```
tests/
├── e2e/                      # E2E テストスイート
│   ├── navigation.spec.ts
│   ├── chat.spec.ts
│   └── settings.spec.ts
│
├── fixtures/                 # テストフィクスチャ
│   └── test-data.json
│
└── utils/                    # テストユーティリティ
    └── helpers.ts
```

**配置すべきもの:**
- Playwright テストファイル（`.spec.ts`）
- テスト用フィクスチャ・モックデータ
- テストヘルパー関数

---

## ベストプラクティスまとめ

### 1. 関心の分離

| レイヤー | 配置場所 | 責務 |
|---|---|---|
| プレゼンテーション | `src/components/` | UI 表示ロジック |
| ビジネスロジック | `src/lib/services/` | データ処理・API 通信 |
| 状態管理 | `src/store/` | グローバル状態 |
| データアクセス | `src/lib/db/` | データベース操作 |

### 2. コンポーネント設計

```
# 推奨: 機能別にグループ化
components/
├── chat/           # チャット機能
├── settings/       # 設定機能
└── common/         # 共通コンポーネント

# 非推奨: フラット構造
components/
├── ChatMessage.tsx
├── ChatInput.tsx
├── SettingsView.tsx
├── Button.tsx
└── ...（大量のファイル）
```

### 3. インポートパスの簡潔化

`tsconfig.json` でパスエイリアスを設定:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"],
      "@lib/*": ["./src/lib/*"],
      "@hooks/*": ["./src/hooks/*"]
    }
  }
}
```

### 4. 命名規則

| 種類 | 規則 | 例 |
|---|---|---|
| コンポーネント | PascalCase | `ChatMessage.tsx` |
| フック | camelCase (`use` prefix) | `useChat.ts` |
| サービス | PascalCase (`Service` suffix) | `ChatService.ts` |
| ユーティリティ | camelCase | `formatDate.ts` |
| 定数 | UPPER_SNAKE_CASE | `MAX_TOKEN_COUNT` |
| CSS モジュール | `*.module.css` | `Button.module.css` |

### 5. テストファイルの配置

| テスト種別 | 配置場所 |
|---|---|
| ユニットテスト | コロケーション（`*.test.tsx`）または `src/__tests__/` |
| E2E テスト | `tests/` |
| テストセットアップ | `src/test/setup.tsx` |

---

## 将来的な拡張

アプリケーション規模拡大時に追加を検討するディレクトリ:

```
src/
├── features/                 # Feature-Sliced Design
│   ├── chat/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── store/
│   └── settings/
│
├── api/                      # API クライアント定義
│   ├── openai.ts
│   └── gemini.ts
│
├── i18n/                     # 国際化
│   ├── en.json
│   └── ja.json
│
└── config/                   # 環境設定
    ├── development.ts
    └── production.ts
```

---

> [!IMPORTANT]
> このドキュメントは理想的な構成を示すものであり、段階的な移行を推奨します。既存コードを一度に変更するのではなく、新規開発時にこの構成に従うことで徐々に移行してください。
