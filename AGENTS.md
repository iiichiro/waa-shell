# AGENTS.md

このファイルは、本プロジェクト「Waa-Shell」に携わる AI エージェントおよび開発者のためのガイドラインです。
開発を行う際は、必ず以下のルールとドキュメント構成を遵守してください。

## 1. ドキュメント構成 (`specs/`)

本プロジェクトの仕様書は `specs/` ディレクトリ配下に集約されています。
タスクを開始する前に、関連するドキュメントを読み込み、コンテキストを把握してください。

- **`specs/requirements.md`**: プロジェクトの全体要件・目的。
- **`specs/designs/architecture.md`**: アーキテクチャ設計（Tauri, React, Dexie.js）。
- **`specs/designs/tech_stack.md`**: 採用技術スタック。
- **`specs/designs/data_model.md`**: データベース設計（IndexedDB Schema）。
- **`specs/designs/ui_ux.md`**: UI/UX デザインガイドライン。
- **`specs/designs/detailed/*.md`**: 詳細設計（Logic, Services, Components, State）。

> [!IMPORTANT]
> `specs/designs/` 配下のドキュメントが現在の開発における唯一の設計ソース（Source of Truth）です。`specs/legacy/` にある古いファイルは参照しないでください。

## 2. 開発ルール (Strict Rules)

以下のルールを厳守してください。

### 2.1 変更管理フロー

- **変更の記録**:
  仕様や設計を変更する場合、あるいは大きな機能追加を行う場合は、必ず `specs/changes/` ディレクトリに記録を残してください。
  - ファイル名規則: `specs/changes/YYYY-MM-DD-{summary}.md` (例: `2025-12-27-add-image-compression.md`)
  - 記載内容: 「なぜ変更するのか（Reason）」と「何を変更するのか（Changes）」
- **ドキュメントの同期**:
  コードを変更する前に、対応する `specs/` 配下の設計書（`data_model.md` や `detailed/services.md` 等）を必ず更新してください。

### 2.2 コーディング規約

- **言語とコメント**:
  - コード内のコメントは、そのメソッド・関数・クラスが「何をしているのか」が明確に分かるように **日本語** で記述してください。
  - 変数名や関数名は英語（CamelCase / PascalCase）を使用します。
- **型安全性 (TypeScript)**:
  - `any` 型の使用は **厳禁** です。
  - `as` による型アサーション（キャスト）は原則禁止です。必要な場合は Type Guard (型ガード) や `zod` バリデーションを用いて安全に型を絞り込んでください。
- **後方互換性とクリーンコード**:
  - ユーザーからの明示的な指示がない限り、後方互換性のための古いコード（Dead Code / Deprecated）を残さないでください。常に最新の仕様に合わせてクリーンな状態を保ちます。

### 2.3 コード品質とワークフロー

- **ツールチェーン**:
  - Formatter & Linter には **Biome** (`@biomejs/biome`) を使用します。
- **完了条件**:
  実装タスクを完了とする前に、必ず以下のプロセスを実行・パスすることを確認してください。
  1. **Format & Lint**:
     ```bash
     npx biome check --write .
     ```
  2. **Type Check**:
     ```bash
     npm run type-check  # または tsc --noEmit
     ```
  3. **Build Verification**:
     ```bash
     npm run build
     ```
     これらがエラーなく通る状態でのみ、実装完了とみなします。

### 2.4 テスト方針 (Testing Strategy)

品質を担保するため、以下のテスト方針に従ってください。

- **ユニット/統合テスト (Vitest)**:
  - ロジック、ユーティリティ、コンポーネントの振る舞いを検証します。
  - コマンド: `npm test`
  - 新機能追加時は、可能な限りテストコードを追加してください。
  - `src/App.test.tsx` は主要な画面遷移や状態管理の統合テストとして機能します。

- **E2Eテスト (Playwright)**:
  - 実際のブラウザ環境でのユーザー操作フローを検証します。
  - コマンド: `npm run test:e2e`
  - 主なナビゲーション、重要なユーザーフロー（チャット送信、設定変更など）をカバーします。
  - `tests/` ディレクトリに配置します。

- **実行タイミング**:
  - コミット前、またはプルリクエスト作成前に必ずテストを実行し、Passすることを確認してください。

### 2.5 デザインシステムとスタイリング

一貫したUI/UXを維持するため、以下のスタイリングルールを厳守してください。

- **セマンティックカラーの徹底**:
  - `red-500`, `white`, `black` といった固定値カラーの使用は原則禁止です。常に `index.css` で定義されたテーマ変数を使用してください。
  - **基本変数**: `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `popover`
  - **記法例**: `bg-primary`, `text-muted-foreground`, `border-border`, `focus:ring-primary/50`
- **破壊的アクション**:
  - 削除、エラー、警告などの「破壊的」な要素には `destructive` カラーを使用します。
  - `bg-destructive`, `text-destructive`, `border-destructive` 等。
- **背景とコントラスト**:
  - 背景に色（`primary`, `destructive` 等）を敷く場合のテキストには、必ず `-foreground` 系の変数（`text-primary-foreground` 等）を使用し、視認性を確保してください。
  - わずかな背景の差（Subtle background）を表現する場合は、`bg-muted/30` または `bg-foreground/5` を使用してください。`bg-white/5` などの固定値指定はダークモードで不適切になるため禁止です。
- **アニメーション**:
  - `index.css` に定義された標準アニメーションクラスを使用してください。
  - `animate-in`, `fade-in`, `zoom-in-95`, `slide-in-from-right`, `slide-in-from-bottom-2` 等。
- **フォーム要素**:
  - 入力フィールドやボタンは以下のスタイルを基本とします：
    - 背景: `bg-muted/30` または `bg-background`
    - 枠線: `border-border`
    - フォーカス時: `focus:ring-1 focus:ring-primary/50`

---

**Note**: `specs/changes/` ディレクトリが存在しない場合は作成してください。
