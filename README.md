# Waa-Shell (Tauri + React + Tailwind v4)

Waa-Shell は、Tauri v2 を基盤とした、ローカルファーストかつアクセシビリティを重視した AI チャットアプリケーションです。
Raycast 風のランチャーモードを備え、作業中にグローバルショートカットから即座に AI と対話することができます。

## 🚀 技術スタック

- **Core**: [Tauri v2](https://tauri.app/)
- **Frontend**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Database**: [Dexie.js](https://dexie.org/) (IndexedDB)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/), [TanStack Query](https://tanstack.com/query/latest)
- **AI & MCP**: [@google/genai](https://www.npmjs.com/package/@google/genai), [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk), [OpenAI Node SDK](https://github.com/openai/openai-node), [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- **Rendering**: [React Markdown](https://github.com/remarkjs/react-markdown), [KaTeX](https://katex.org/) (Math), [Shiki](https://shiki.style/) (Syntax Highlighter)
- **Linting & Formatting**: [Biome](https://biomejs.dev/)
- **Icons**: [Lucide React](https://lucide.dev/)

## 📁 プロジェクト構成

```text
waa-shell/
├── src-tauri/            # Rust (Backend) 関連コード
│   ├── capabilities/    # Tauri 権限設定
│   ├── gen/             # 自動生成コード (Schemas)
│   ├── src/             # Rust ロジック (Window管理, ショートカット等)
│   └── tauri.conf.json  # Tauri 設定ファイル
├── src/                  # Frontend (React) 関連コード
│   ├── assets/          # 静的リソース
│   ├── components/      # UI コンポーネント
│   │   ├── chat/        # チャット機能関連
│   │   ├── command/     # スラッシュコマンド管理
│   │   ├── common/      # 共通コンポーネント
│   │   ├── layout/      # レイアウト
│   │   └── settings/    # 設定画面
│   ├── lib/             # ビジネスロジック・ライブラリ
│   │   ├── constants/   # 定数定義
│   │   ├── db/          # データベース定義 (Dexie.js)
│   │   ├── providers/   # AI プロバイダー実装 (OpenAI, Google, etc.)
│   │   ├── services/    # アプリケーションサービス
│   │   └── utils/       # ユーティリティ
│   ├── store/           # グローバル状態管理 (Zustand)
│   ├── test/            # テスト設定 (setup.tsx)
│   ├── index.css        # テーマ変数 & Tailwind v4
│   └── App.tsx          # メインエントリー
├── specs/                # 要件定義・設計ドキュメント
│   ├── changes/         # 変更履歴
│   └── designs/         # 設計書 (data_model, tech_stack 等)
├── tests/                # E2E テスト (Playwright)
├── AGENTS.md             # AI エージェント用ガイドライン
└── biome.json            # Biome 設定ファイル
```

## 🛠️ セットアップ

### 必要条件

- [Rust](https://www.rust-lang.org/) (Tauri 開発用)
- [Node.js](https://nodejs.org/) (v18+)

### インストール

```bash
npm install
```

### 開発実行

```bash
npm run tauri dev
```

### ビルド

```bash
npm run tauri build
```

## ✨ 主な機能

- **Raycast 風ランチャー**: `Ctrl+Alt+A` で即座にチャット入力を起動。
- **マルチウィンドウ**: フル機能のメインウィンドウと、コンパクトなランチャーウィンドウを切り替え。
- **ローカルファースト**: 会話履歴や設定はすべてローカルの IndexedDB に保存。
- **マルチモーダル**: 画像や PDF のアップロード・読み取りに対応。

## 📄 ライセンス (License)

このプロジェクトのソースコードは **MIT License** の下で公開されています。
詳細は [LICENSE](LICENSE) ファイルを参照してください。

### 🎨 アセットについての注記 (Note on Assets)

このリポジトリに含まれる AI 生成された画像およびアセットは、[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/deed.ja) (パブリックドメイン) として提供されています。
これらは著作権による制限なく、自由に利用、改変、配布することができます。

