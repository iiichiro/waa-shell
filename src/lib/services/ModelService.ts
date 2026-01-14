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

  // プロバイダー解決用変数を追加
  let resolvedProvider = options.provider;

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

    // プロバイダーの解決 (ManualModelに紐付くプロバイダーを優先)
    if (!resolvedProvider && manualModel.providerId) {
      resolvedProvider = await db.providers.get(Number(manualModel.providerId));
    }

    // note: systemPrompt はここではなく、メッセージ履歴構築側で注入済みであることを想定
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

  const client = await getOpenAIClient(resolvedProvider || options.provider);
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

export interface ResponseInputItem {
  role: string;
  content?: string | unknown[];
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface ResponseOutputItem {
  type: 'message' | 'tool_call' | 'reasoning' | string;
  id?: string;
  content?: { type: 'output_text'; text: string }[];
  function?: { name: string; arguments: string };
  summary?: { type: 'summary_text'; text: string }[];
}

export interface ResponseOutput {
  output: ResponseOutputItem[];
}

/**
 * Response API (POST /v1/responses) を呼び出す
 */
export async function createResponseApi(options: {
  model: string; // ManualModel UUID or API Model ID
  input: ResponseInputItem[]; // ResponseInput
  tools?: OpenAI.Chat.ChatCompletionTool[]; // Added tools support
  max_tokens?: number;
  extraParams?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<ResponseOutput> {
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
      // TODO: resolve provider for custom model
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
    tools: options.tools, // Pass tools
    ...systemParams,
    ...mergedExtraParams,
  };

  // @ts-expect-error: client.responses might be missing in some typescript views if not fully updated, but valid at runtime
  const response = await client.responses.create(body, { signal: options.signal });
  return response as unknown as ResponseOutput;
}

/**
 * 特定のプロバイダーのモデルリストを取得する内部関数
 */
async function fetchModelsForProvider(provider: Provider): Promise<ModelInfo[]> {
  const providerIdStr = provider.id?.toString() || '';
  let apiModels: { id: string; object: string }[] = [];

  // 1. APIからモデル一覧取得
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
  const manualModelIds = new Set(manualModels.map((m) => m.uuid));

  // 4. リスト構築
  const startOrder = 1000;
  const models: ModelInfo[] = [];

  // APIモデルの追加
  apiModels.forEach((m, index) => {
    if (manualModelIds.has(m.id)) return; // オーバーライドされているためスキップ

    const config = configMap.get(m.id);
    models.push({
      id: m.id,
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

  // 手動モデルの追加
  manualModels.forEach((m) => {
    const config = configMap.get(m.uuid);
    const isOverride = apiModels.some((am) => am.id === m.uuid);

    models.push({
      id: m.uuid,
      targetModelId: m.modelId,
      name: m.name,
      provider: provider.name,
      providerId: providerIdStr,
      description: m.description,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      inputCostPer1k: m.inputCostPer1k,
      outputCostPer1k: m.outputCostPer1k,
      canStream: true,
      enableStream: config?.enableStream ?? m.enableStream ?? true,
      isEnabled: config?.isEnabled ?? m.isEnabled ?? true,
      order: config?.order ?? startOrder + apiModels.length + 500,
      isCustom: false,
      isManual: true,
      isApiOverride: isOverride,
      supportsTools: config?.supportsTools ?? m.supportsTools ?? false,
      supportsImages: config?.supportsImages ?? m.supportsImages ?? true,
      protocol: config?.protocol || m.protocol || 'chat_completion',
    });
  });

  return models;
}

/**
 * 利用可能なモデル一覧を取得する
 * プロバイダー設定、DBの手動登録、設定マージを行う
 * targetProvider指定時はそのプロバイダーのみ、未指定時は全有効プロバイダーを取得
 */
export async function listModels(targetProvider?: Provider): Promise<ModelInfo[]> {
  let providers: Provider[] = [];

  if (targetProvider) {
    if (targetProvider.isActive) {
      providers = [targetProvider];
    }
  } else {
    // 全有効プロバイダーを取得
    providers = await db.providers.filter((p) => !!p.isActive).toArray();
  }

  if (providers.length === 0) return [];

  // 並列で各プロバイダーのモデルを取得
  const results = await Promise.allSettled(providers.map((p) => fetchModelsForProvider(p)));

  let allModels: ModelInfo[] = [];

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      allModels = [...allModels, ...result.value];
    } else {
      console.error('Provider model fetch failed:', result.reason);
    }
  });

  // ソートして返す
  return allModels.sort((a, b) => {
    // まずOrder順
    if (a.order !== b.order) return a.order - b.order;
    // 同じOrderならプロバイダー順
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    // 最後は名前順
    return a.name.localeCompare(b.name);
  });
}
