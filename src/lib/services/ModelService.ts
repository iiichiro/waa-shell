import Dexie from 'dexie';
import OpenAI from 'openai';
import { db, type Provider } from '../db';
import { getActiveProvider } from './ProviderService';

/**
 * チャット完了リクエストのオプション設定
 * OpenAI SDKの引数に基づきつつ、汎用的な拡張を許可
 */
export interface ChatCompletionOptions {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  tool_choice?: OpenAI.Chat.ChatCompletionToolChoiceOption;
  /**
   * 追加のボディパラメータ（OpenAI SDKが直接対応していない拡張用）
   */
  extraParams?: Record<string, unknown>;
  /**
   * 使用するプロバイダー（指定しない場合はアクティブプロバイダーを使用）
   */
  provider?: Provider;
  /**
   * 中断シグナル
   */
  signal?: AbortSignal;
}

// モデル情報の型定義
export interface ModelInfo {
  id: string; // アプリケーション上で扱う一意なID（UUID or API Model ID）
  name: string;
  provider: string; // プロバイダー名
  providerId: string; // プロバイダーID (DB ID or unique identifier)
  targetModelId?: string; // 実際にAPIに送信するモデルID
  description?: string;
  contextWindow?: number;
  maxTokens?: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  canStream: boolean; // システム的にストリーミング可能か
  enableStream: boolean; // ユーザー設定によりストリーミング有効か
  isEnabled: boolean; // 有効/無効
  isCustom: boolean; // カスタムモデルかどうか
  isManual: boolean; // 手動登録モデルかどうか
  order: number; // 表示順序
  supportsTools?: boolean; // ツール利用可能かどうか
  supportsImages?: boolean; // 画像（ファイル）入力可能かどうか
  protocol?: 'chat_completion' | 'response_api';
  isApiOverride?: boolean; // APIモデルのオーバーライドかどうか
}

/**
 * OpenAI クライアントのインスタンスを取得
 * @param specificProvider オプション: 特定のプロバイダーを使用する場合に指定
 */
async function getOpenAIClient(specificProvider?: Provider) {
  const provider = specificProvider || (await getActiveProvider());
  if (!provider) {
    throw new Error('有効なAIプロバイダーが設定されていません。');
  }

  return new OpenAI({
    baseURL: provider.baseUrl,
    apiKey: provider.apiKey,
    dangerouslyAllowBrowser: true, // Tauri環境（フロントエンド）での実行を許可
  });
}

/**
 * チャット完了リクエストを送信する
 */
export async function chatCompletion(options: ChatCompletionOptions) {
  // モデルIDの解決（UUID -> 実モデルID）
  let modelId = options.model;
  let mergedExtraParams = options.extraParams || {};
  const systemParams: Record<string, unknown> = {};

  // まず ManualModel (UUID) として検索
  const manualModel = await db.manualModels.where('uuid').equals(modelId).first();

  if (manualModel) {
    // 実モデルIDに置換
    modelId = manualModel.modelId;

    // ExtraParamsのマージ
    if (manualModel.extraParams) {
      mergedExtraParams = { ...manualModel.extraParams, ...mergedExtraParams };
    }

    // MaxTokens等の設定
    if (manualModel.maxTokens) systemParams.max_tokens = manualModel.maxTokens;

    // note: systemPrompt はここではなく、メッセージ履歴構築側で注入済みであることを想定するが
    // もし APIパラメータとして送れるならここで送る？ 通常は messages array に入れるもの。
    // 今回のスコープでは、呼び出し元(ChatService)が ManualModel の defaultSystemPrompt を
    // メッセージリストに含めているか、あるいはここで messages を改変する必要がある。
    // ChatService 側で messages を構築しているので、ここでの改変は最小限にしたいが、
    // ManualModel の情報はここで引いている。
    // -> ひとまずここでは ID解決とパラメータマージに集中する。
  } else {
    // UUIDでなければ、従来のCustomModelを検索（後方互換）
    const customModel = await db.customModels.where({ modelId }).first();
    if (customModel) {
      modelId = customModel.baseModelId;
      if (customModel.extraParams) {
        mergedExtraParams = { ...customModel.extraParams, ...mergedExtraParams };
      }
      if (customModel.maxTokens) systemParams.max_tokens = customModel.maxTokens;
    }
  }

  const client = await getOpenAIClient(options.provider);
  const { extraParams, model, signal, ...params } = options;

  // extraParams を統合したリクエストボディの作成
  // OpenAI SDK の型定義にないパラメータは type cast で渡す
  const requestBody = {
    ...params,
    model: modelId,
    ...systemParams,
    ...mergedExtraParams,
  } as OpenAI.Chat.ChatCompletionCreateParams;

  if (options.stream) {
    return client.chat.completions.create(
      {
        ...requestBody,
        stream: true,
      },
      { signal },
    );
  }

  return client.chat.completions.create(
    {
      ...requestBody,
      stream: false,
    },
    { signal },
  );
}

/**
 * Response API (POST /v1/responses) を呼び出す
 */
export async function createResponseApi(options: {
  model: string; // ManualModel UUID or API Model ID
  input: unknown[]; // ResponseInput
  max_tokens?: number;
  extraParams?: Record<string, unknown>;
  signal?: AbortSignal;
}) {
  let modelId = options.model;
  let mergedExtraParams = options.extraParams || {};
  const systemParams: Record<string, unknown> = {};
  let provider: Provider | undefined;

  // ManualModel, CustomModel, etc. Resolution (Copied logic from chatCompletion mostly)
  const manualModel = await db.manualModels.where('uuid').equals(modelId).first();
  if (manualModel) {
    modelId = manualModel.modelId;
    if (manualModel.extraParams)
      mergedExtraParams = { ...manualModel.extraParams, ...mergedExtraParams };
    if (manualModel.maxTokens) systemParams.max_tokens = manualModel.maxTokens;

    // Resolve Provider
    provider = await db.providers.get(parseInt(manualModel.providerId, 10));
  } else {
    const customModel = await db.customModels.where({ modelId }).first();
    if (customModel) {
      modelId = customModel.baseModelId;
      // TODO: resolve provider for custom model (needs logic, but custom model usually based on active provider or saved??
      // Current DB schema for customModels doesn't link provider directly but implies active?
      // Actually ModelConfig has providerId.
      // For now, fall back to active provider if not manual.
    }
  }

  const client = await getOpenAIClient(provider);

  // Construct body
  // Note: 'client.responses' might not be fully typed in the installed version if it's very new or using 'any'.
  // We inspected d.ts and it seems 'responses' exists.
  const body = {
    model: modelId,
    input: options.input,
    ...systemParams,
    ...mergedExtraParams,
  };

  // @ts-expect-error: client.responses might be missing in some typescript views if not fully updated, but valid at runtime
  return await client.responses.create(body, { signal: options.signal });
}

/**
 * 利用可能なモデル一覧を取得する
 * プロバイダー設定、DBの手動登録、設定マージを行う
 * @param targetProvider オプション: 特定のプロバイダーのモデルを取得する場合に指定
 */
export async function listModels(targetProvider?: Provider): Promise<ModelInfo[]> {
  const provider = targetProvider || (await getActiveProvider());
  if (!provider) return [];

  const providerIdStr = provider.id?.toString() || '';

  // 1. APIからモデル一覧取得
  let apiModels: { id: string; object: string }[] = [];

  try {
    if (provider.type === 'google') {
      // Google GenAI API (HTTP request)
      if (provider.apiKey) {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${provider.apiKey}`,
        );
        if (response.ok) {
          const data = await response.json();
          // biome-ignore lint/suspicious/noExplicitAny: Google API response
          apiModels = (data.models || []).map((m: any) => ({
            id: m.name.replace('models/', ''),
            object: 'model',
          }));
        }
      }
    } else if (['anthropic'].includes(provider.type)) {
      apiModels = [];
    } else {
      // OpenAI Compatible
      const client = await getOpenAIClient(provider);
      const response = await client.models.list();
      apiModels = response.data;
    }
  } catch (error) {
    console.warn(`モデル一覧の取得に失敗しました (Provider: ${provider.name})`, error);
  }

  // 2. DBから手動登録モデル (ManualModel) を取得
  const manualModels = await db.manualModels.where({ providerId: providerIdStr }).toArray();

  // 3. DBから設定 (ModelConfig) を取得
  const configs = await db.modelConfigs
    .where('[providerId+modelId]')
    .between([providerIdStr, Dexie.minKey], [providerIdStr, Dexie.maxKey])
    .toArray();

  const configMap = new Map(configs.map((c) => [c.modelId, c]));

  // 手動モデルのIDセットを作成（APIモデルの除外に使用）
  // ManualModelのUUIDがAPIモデルIDと同じ場合、そのManualModelはAPIモデルの「オーバーライド」として機能する
  const manualModelIds = new Set(manualModels.map((m) => m.uuid));

  // 4. リスト構築
  const startOrder = 1000;
  const models: ModelInfo[] = [];

  // APIモデルの追加 (ManualModelでオーバーライドされているものは除外)
  apiModels.forEach((m, index) => {
    if (manualModelIds.has(m.id)) return; // オーバーライドされているためスキップ

    const config = configMap.get(m.id);
    models.push({
      id: m.id, // APIモデルはそのままのID
      targetModelId: m.id,
      name: m.id,
      provider: provider.name,
      providerId: providerIdStr,
      canStream: true,
      enableStream: config ? config.enableStream : true,
      isEnabled: config ? config.isEnabled : true,
      order: config?.order ?? startOrder + index,
      isCustom: false,
      isManual: false,
      supportsTools: config?.supportsTools ?? false,
      supportsImages: config?.supportsImages ?? true,
      protocol: config?.protocol || 'chat_completion',
    });
  });

  // 手動モデルの追加 (オーバーライド含む)
  manualModels.forEach((m) => {
    // ModelConfigがある場合はそちらの設定(OrderやIsEnabled)を優先できるが、
    // ManualModel自体が設定を持つようになったため、基本はManualModelの値を使う。
    // ただし、Orderは一括管理されているModelConfigを見るほうが自然か？
    // -> ManualModel自体にはOrderを持たせていないので、ConfigMapから引く必要がある。
    // しかし ConfigMap のキーは `modelId` だが、ManualModelの場合は `uuid` で管理すべき？
    // 現状のカラム `modelId` は targetModelId。
    // ここで問題：Listの並び替え(Order)保存時、ManualModelは何をキーに保存するか？
    // -> `uuid` をキーにすべき。
    // NOTE: DBのModelConfigは `providerId + modelId` がキー。
    // ManualModelの場合、この `modelId` カラムに `uuid` を入れて保存することにする。

    const config = configMap.get(m.uuid); // Configはuuidで引く

    // APIモデルリストに存在するか確認（オーバーライド判定）
    const isOverride = apiModels.some((am) => am.id === m.uuid);

    models.push({
      id: m.uuid, // UUIDを使用
      targetModelId: m.modelId, // 実API ID
      name: m.name,
      provider: provider.name,
      providerId: providerIdStr,
      description: m.description,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      inputCostPer1k: m.inputCostPer1k,
      outputCostPer1k: m.outputCostPer1k,
      canStream: true,
      // 設定値優先順位: Config > ManualModel > Default
      enableStream: config?.enableStream ?? m.enableStream ?? true,
      isEnabled: config?.isEnabled ?? m.isEnabled ?? true,
      order: config?.order ?? startOrder + apiModels.length + 500,
      isCustom: false,
      isManual: true, // オーバーライドでも編集可能なManual扱いとする
      isApiOverride: isOverride,
      supportsTools: config?.supportsTools ?? m.supportsTools ?? false,
      supportsImages: config?.supportsImages ?? m.supportsImages ?? true,
      protocol: config?.protocol || m.protocol || 'chat_completion',
    });
  });

  // ソートして返す
  return models.sort((a, b) => a.order - b.order);
}
