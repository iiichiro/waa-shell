# アーキテクチャ・構造設計書

## 1. システム全体構造

本システムは、モダンなSPA (Single Page Application) と BFF (Backend for Frontend) を組み合わせたフルスタックWebアプリケーションとして構成される。
フロントエンドとバックエンドは密結合せず、明確なインターフェースを介してデータ操作を行うアーキテクチャを採用する。

### 1.1 技術スタック概要（役割ベース）

- **Frontend**: ComponentベースUIライブラリ, クライアントサイド状態管理, 非同期データフェッチ/キャッシング層
- **Backend UI/API**: SSR (Server Side Rendering) 対応Webフレームワーク, RESTful API / RPCスタイルAPI
- **Database**: RDBMS (Relational Database Management System)
- **Authentication**: セッションベース認証 / OAuth 2.0 クライアント
- **AI Integration**: AI API Gateway / Adapter Pattern による抽象化レイヤー

## 2. 論理アーキテクチャ構造

アプリケーションは以下の論理レイヤーに分割して設計する。

```
src/
├── presentation/         # プレゼンテーション層 (UIコンポーネント, ページルーティング)
├── application/          # アプリケーション層 (ユースケース制御, 状態管理)
├── domain/               # ドメイン層 (ビジネスロジック, エンティティ定義)
├── infrastructure/       # インフラストラクチャ層 (DBアクセス, 外部API連携)
│   ├── api/              # 外部AIサービスへのAPIクライアント
│   └── database/         # リポジトリ実装, ORM設定
└── interface/            # インターフェース層 (APIエンドポイント, コントローラー)
```

## 3. コンポーネント設計 (Frontend)

- **状態管理**:
  - グローバルな設定やUI状態はクライアントサイドストアで管理。
  - サーバーデータのキャッシュ・同期は専用のフェッチライブラリで管理。
- **UIコンポーネント**:
  - 機能ドメイン（Assistant, Thread, Settingsなど）ごとにコンポーネントを配置する。
  - 共通UI部品（ボタン、入力フォーム等）は再利用可能な形で集約する。

## 4. バックエンド設計 (Backend)

### 4.1 RPCスタイルAPI / Server Functions

DB操作を伴う処理（メッセージ保存、設定変更など）は、型安全性を重視したRPCスタイルの関数呼び出し、またはREST APIとして実装する。これによりフロントエンドとの整合性を保ち、ボイラープレートを削減する。

### 4.2 ストリーミング & Webフック

AI対話のストリーミングレスポンスや、外部システムからのコールバックなど、HTTP等のプロトコルレベルでの制御が必要な機能は、専用のエンドポイントとして実装する。

### 4.3 AI実行エンジン (Processor & Runner)

AIモデルごとの差異（API仕様、パラメータ、レスポンス形式）を吸収するため、`Runner` インターフェースを定義し、各プロバイダー（OpenAI互換, Gemini, その他）ごとの具象クラスを実装するAdapterパターンを採用する。これにより、新しいAIモデルの追加を容易にする。

## 5. データ永続化層

- **ORM/DAO**: RDBMSとの対話を抽象化するORMまたはDAOパターンを採用する。
- **Migration**: スキーマ変更をバージョン管理できるマイグレーションツールを使用する。
- **Vector Search**: (拡張機能として) 文書のベクトル検索に対応可能なデータストアまたは拡張機能を選定する。

## 6. 認証・認可

- **Authentication Protocol**: 標準的な主要プロトコル（OAuth 2.0 / OIDC）およびID/Password認証をサポートする。
- **Access Control**: すべてのリソース（スレッド、ファイル等）は所有ユーザー（Owner）に紐付き、作成者のみがアクセス可能なRBAC/ACLモデルとする。
- **API Key Management**: システム全体の共有キー設定と、ユーザー個別のキー設定（Override）の両方をサポートする。
