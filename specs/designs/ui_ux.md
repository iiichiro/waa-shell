# UI/UX デザインガイドライン (Revision 7 - Design Overhaul)

## 1. デザインコンセプト

(No changes)

## 2. 画面構成詳細

### 2.2 Chat Area (Stats & Search)

- **Header Stats**:
  - スレッドタイトルの横に、スレッド合計トークン数と概算コストを表示（ホバーで詳細）。
  - 例: `1.2k tokens ($0.004)`
- **Message Stats**:
  - アシスタントメッセージの下部メタデータエリアに、生成時間とトークン/コストを表示。
  - 例: `Generated in 2.5s (450 tokens)`

### 2.3 Sidebar & Navigation (Search)

- **Global Search**:
  - サイドバー上部に検索バーを配置 (`Cmd+K` / `Ctrl+K`)。
  - 入力するとインスタント検索（タイトル + メッセージ本文）。
  - 検索結果をクリックすると、該当スレッドの該当メッセージ位置へジャンプ。

### 2.9 Settings > OAuth (Validation)

- **Deep Link Setup**:
  - MCP サーバー（Gitlab 等）の認証コールバックを受け取るため、アプリ起動時に `waa-shell://` スキームの登録を確認・要求する UI。

### 2.11 File Gallery & Management

- **Viewer**: 全アップロード/生成ファイルを確認できる統合ビューア。
- **Deletion UX**: 複数選択による一括削除。削除前に確認モーダル（「このファイルを参照しているメッセージからもアクセスできなくなります」等）を表示。
- **Storage Stat**: 「画像」「PDF」「その他」のカテゴリ別使用量を棒グラフで表示。

### 2.13 Launcher UI

- **Quick Entry**: ウィンドウ表示と同時にテキストエリアがオートフォーカス。
- **Spotlight Mode**: 画面中央に浮かぶコンパクトな UI。背景のブラー効果 (Backdrop filter) を強くかけ、作業の邪魔にならないデザイン。
- **Command Palette**: 過去の履歴やアシスタントを `Cmd+P` のようなパレットで即座に切り替え。

### 2.14 Image Compression (Consolidated)

(Previous revision content maintained)

## 3. デザインシステム (Zinc / shadcn-like)

今後の保守性と一貫性を高めるため、`shadcn/ui` の Zinc テーマに基づいた HSL 変数によるデザインシステムを採用します。

### 3.1 カラーパレット (HSL)
- **Background**: `--background` (Main app background)
- **Foreground**: `--foreground` (Standard text)
- **Muted**: `--muted`, `--muted-foreground` (Secondary elements)
- **Accent**: `--accent`, `--accent-foreground` (Hover states)
- **Border**: `--border` (UI boundaries)
- **Primary**: `--primary`, `--primary-foreground` (Brand/Action color)

### 3.2 ダークモード対応
- OS の設定に連動し、HSL 変数の値を切り替えることでシームレスなダーク/ライトモード切り替えを実現します。
- ブラウザ標準の `<select>` / `<option>` 等の要素も、背景色と文字色がテーマに適合するようにスタイルを強制適用します。

## 4. レイアウト構造

### 4.1 全画面オーバーレイ形式
- 設定画面 (`SettingsView`)、コマンド管理 (`CommandManager`)、ファイル管理 (`FileExplorer`) などの主要なサブ機能は、**メインコンテンツエリアを覆う全画面オーバーレイ（絶対配置）**として表示します。
- これにより、サイドメニューとの領域競合（3カラム問題）を防ぎ、モバイルやランチャーモードなど様々な画面サイズでの視認性を最大化します。
- **実装**: `fixed inset-0 z-50` (または親要素が `relative` の場合は `absolute inset-0`) を使用します。
