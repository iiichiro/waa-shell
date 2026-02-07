import Dexie, { type Table } from 'dexie';
import type OpenAI from 'openai';

/**
 * スレッド情報（会話のまとまり）
 */
export interface Thread {
  id?: number;
  title: string; // タイトル（自動生成または手動入力）
  assistantId?: number; // 使用しているアシスタントのID
  activeLeafId?: number | null; // 現在表示中の最新メッセージ（ブランチ）のID。nullはルート状態を指す
  createdAt: Date; // 作成日時
  updatedAt: Date; // 更新日時
}

/**
 * MCP Apps UIのメタデータ
 */
export interface McpAppUiData {
  resourceUri: string; // ui://スキームのリソースURI
  permissions?: string[]; // 追加権限（カメラ、マイク等）
  csp?: {
    allowedOrigins?: string[]; // 許可された外部オリジン
  };
}

/**
 * メッセージ情報（個別の一問一答）
 */
export interface Message {
  id?: number;
  threadId: number; // 所属するスレッドのID
  role: 'user' | 'assistant' | 'system' | 'tool'; // 送信者の役割
  content: string; // テキスト本文
  tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[]; // AIからのツール呼び出し要求
  tool_call_id?: string; // ツール実行結果メッセージの場合の呼び出しID
  mcpAppUi?: McpAppUiData; // MCP Apps UIのメタデータ（MCP App対応ツールの場合）
  usage?: {
    // トークン使用量
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost?: number; // 概算コスト
  parentId?: number | null | undefined; // 親メッセージのID（ブランチ/ツリー構造用）
  model?: string; // 使用されたAIモデルの名前
  reasoning?: string; // 思考プロセス（フルテキスト）
  reasoningSummary?: string; // 推論プロセスの要約
  createdAt: Date; // 送信日時
}

/**
 * ローカルに保存されるファイルアセット（画像、PDFなど）
 */
export interface LocalFile {
  id?: number;
  threadId?: number; // 関連するスレッドID
  messageId?: number; // 関連するメッセージID
  fileName: string; // ファイル名
  mimeType: string; // MIMEタイプ
  size: number; // ファイルサイズ（バイト）
  originalSize?: number; // 圧縮前のサイズ
  isGenerated?: boolean; // AIによって生成されたアセットかどうか
  blob: Blob; // バイナリデータ本体
  createdAt: Date; // アップロード/生成日時
}

/**
 * スラッシュコマンド（動的テンプレート）
 */
export interface SlashCommand {
  id?: number;
  key: string; // 呼び出しキー (例: 'summary')
  label: string; // 表示名
  description: string; // コマンドの説明
  content: string; // テンプレート本体 (例: '{{text}}を要約して')
  variables: {
    // 変数のメタデータ
    name: string; // 変数名
    label: string; // UI上のラベル
    description?: string; // 入力ガイド
    defaultValue?: string; // 初期値
  }[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AIプロバイダー設定
 */
export type ProviderType =
  | 'azure'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'openrouter'
  | 'litellm'
  | 'openai-compatible';

export interface Provider {
  id?: number;
  name: string; // 表示名 (例: 'OpenAI', 'Local LLM')
  type: ProviderType; // プロバイダー種別
  baseUrl: string; // APIベースURL (例: 'https://api.openai.com/v1')
  apiKey: string; // APIキー
  requiresApiKey?: boolean; // APIキーを必須とするか
  supportsResponseApi?: boolean; // Response API (POST /v1/responses) に対応しているか
  isActive: boolean; // 現在有効かどうか
  defaultProtocol?: 'chat_completion' | 'response_api'; // デフォルトのプロトコル
  order?: number; // 表示順序
  createdAt: Date;
  updatedAt: Date;
}

/**
 * MCPサーバ設定
 */
export interface McpServer {
  id?: number;
  name: string; // サーバ識別名
  type?: 'streamableHttp' | 'sse'; // 接続タイプ
  url: string; // リモートMCPサーバのエンドポイントURL
  authType: 'none' | 'oidc'; // 認証タイプ
  oidcConfig?: {
    issuer: string; // OIDCプロバイダーのURL
    clientId: string; // クライアントID
    scopes?: string[]; // 要求するスコープ
    token?: string; // 現在のアクセストークン（永続化するかは要検討）
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * アプリケーション設定
 */
export interface AppSetting {
  key: string; // 設定項目名
  value: unknown; // 設定値
}

/**
 * モデルごとの設定（ユーザー設定）
 */
export interface ModelConfig {
  providerId: string; // プロバイダーID (複合キーの一部)
  modelId: string; // モデルID (e.g. 'gpt-4o')
  enableStream: boolean; // ストリーミングを有効にするかどうか
  isEnabled: boolean; // モデルの有効/無効
  order?: number; // 表示順序
  supportsTools?: boolean; // ツール利用可能かどうか
  supportsImages?: boolean; // 画像（ファイル）入力可能かどうか
  protocol?: 'chat_completion' | 'response_api'; // 利用するプロトコル
}

/**
 * スレッドごとの個別設定
 */
export interface ThreadSettings {
  id?: number;
  threadId: number; // スレッドID
  providerId?: string; // 使用するプロバイダーID (Optional)
  modelId: string; // 使用するモデルID
  systemPrompt?: string; // システムプロンプト
  contextWindow?: number; // コンテキストとして含めるメッセージ数制御など
  maxTokens?: number; // 最大生成トークン数
  extraParams?: Record<string, unknown>; // その他のパラメータ
}

/**
 * カスタムモデル定義（既存モデルの複製・パラメータ調整版）
 */
export interface CustomModel {
  id?: number;
  modelId: string; // 一意なID (e.g. 'gpt-4o-custom-123')
  name: string; // 表示名
  baseModelId: string; // ベースとなるモデルID
  enableStream: boolean;
  contextWindow?: number;
  maxTokens?: number;
  extraParams?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * 手動登録モデル定義
 */
export interface ManualModel {
  id?: number;
  uuid: string; // アプリケーション上の一意なID (UUID)
  providerId: string; // 紐づくプロバイダーのID (FK)
  modelId: string; // APIで使用するモデルID
  name: string; // 表示名
  contextWindow?: number;
  maxTokens?: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  description?: string;
  isEnabled: boolean;

  // 機能フラグ
  enableStream?: boolean; // ストリーミング有効 (Default: true)
  supportsTools?: boolean; // ツール利用可能かどうか (Default: true)
  supportsImages?: boolean; // 画像（ファイル）入力可能かどうか (Default: true)

  // 追加設定
  defaultSystemPrompt?: string; // デフォルトシステムプロンプト
  extraParams?: Record<string, unknown>; // 追加パラメータ (JSON)
  protocol?: 'chat_completion' | 'response_api'; // 利用するプロトコル

  createdAt: Date;
}

/**
 * IndexedDB (Dexie.js) データベース構成
 */
export class AppDatabase extends Dexie {
  threads!: Table<Thread>;
  messages!: Table<Message>;
  files!: Table<LocalFile>;
  slashCommands!: Table<SlashCommand>;
  providers!: Table<Provider>;
  mcpServers!: Table<McpServer>;
  settings!: Table<AppSetting>;
  modelConfigs!: Table<ModelConfig>;
  threadSettings!: Table<ThreadSettings>;
  customModels!: Table<CustomModel>;
  manualModels!: Table<ManualModel>;

  constructor() {
    super('WaaShellDatabase');
    // IDBスキーマの定義
    this.version(6).stores({
      threads: '++id, title, createdAt, updatedAt',
      messages: '++id, threadId, role, createdAt',
      files: '++id, threadId, messageId, fileName, mimeType, createdAt',
      slashCommands: '++id, &key, label, createdAt',
      providers: '++id, &name, isActive',
      mcpServers: '++id, &name, isActive',
      settings: '&key',
      modelConfigs: '&modelId',
      threadSettings: '++id, threadId',
      customModels: '++id, &modelId',
    });
    // Schema update for v7
    this.version(7).stores({
      providers: '++id, &name, type, isActive',
      modelConfigs: '[providerId+modelId], isEnabled, order', // 複合キーに変更
      manualModels: '++id, providerId, modelId',
    });
    // Schema update for v8: Add capability flags
    this.version(8).stores({
      // No index changes required for capabilities, just ensuring schema version bump
      manualModels: '++id, providerId, modelId',
      modelConfigs: '[providerId+modelId], isEnabled, order',
    });
    // Schema update for v9: Add UUID management for ManualModel
    this.version(9)
      .stores({
        manualModels: '++id, &uuid, providerId, modelId', // uuidにユニークインデックスを追加
      })
      .upgrade((tx) => {
        // 既存のデータにUUIDを付与するマイグレーション
        return tx
          .table('manualModels')
          .toCollection()
          .modify((manual) => {
            if (!manual.uuid) {
              manual.uuid = crypto.randomUUID();
            }
          });
      });
    // Schema update for v10: Add supportsResponseApi, protocol, reasoningSummary
    this.version(10).stores({
      // Schema changes only in non-indexed fields, so no store updates strictly needed unless indexes change.
    });
    // Schema update for v11: Add providerId to ThreadSettings
    this.version(11).stores({
      // providerId added to ThreadSettings (non-indexed for now, or indexed if needed for query)
      // keeping existing schema string if no index change
    });
    // Schema update for v12: Add reasoning per message
    this.version(12).stores({
      // No index changes
    });
    // Schema update for v13: Add order to providers
    this.version(13).stores({
      providers: '++id, &name, type, isActive, order',
    });
    // Schema update for v14: Add defaultProtocol to providers
    this.version(14).stores({
      // No index changes, just version bump for new non-indexed field
    });
  }
}

// グローバルなDBインスタンスの提供
export const db = new AppDatabase();
