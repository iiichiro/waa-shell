import type OpenAI from 'openai';
import type {
  Response,
  ResponseCreateParams,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import { db, type Provider } from '../db';
import { getProvider } from '../providers/ProviderFactory';
import { getActiveProvider } from './ProviderService';

/**
 * チャット完了リクエストのオプション設定
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
  extraParams?: Record<string, unknown>;
  provider?: Provider;
  signal?: AbortSignal;
}

/**
 * Response API リクエストのオプション設定
 */
export interface ResponseOptions {
  model: string;
  input: ResponseCreateParams['input'];
  stream?: boolean;
  tools?: OpenAI.Chat.ChatCompletionTool[];
  max_tokens?: number;
  extraParams?: Record<string, unknown>;
  provider?: Provider;
  signal?: AbortSignal;
}

// モデル情報の型定義
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  providerId: string;
  targetModelId?: string;
  description?: string;
  contextWindow?: number;
  maxTokens?: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  canStream: boolean;
  enableStream: boolean;
  isEnabled: boolean;
  isCustom: boolean;
  isManual: boolean;
  order: number;
  supportsTools?: boolean;
  supportsImages?: boolean;
  protocol?: 'chat_completion' | 'response_api';
  isApiOverride?: boolean;
}

/**
 * チャット完了リクエストを送信する
 */
export async function chatCompletion(options: ChatCompletionOptions) {
  let modelId = options.model;
  let mergedExtraParams = options.extraParams || {};
  const systemParams: Record<string, unknown> = {};
  let resolvedProvider = options.provider;

  const manualModel = await db.manualModels.where('uuid').equals(modelId).first();

  if (manualModel) {
    modelId = manualModel.modelId;
    if (manualModel.extraParams) {
      mergedExtraParams = { ...manualModel.extraParams, ...mergedExtraParams };
    }
    if (manualModel.maxTokens) systemParams.max_tokens = manualModel.maxTokens;
    if (!resolvedProvider && manualModel.providerId) {
      resolvedProvider = await db.providers.get(Number(manualModel.providerId));
    }
  } else {
    const customModel = await db.customModels.where({ modelId }).first();
    if (customModel) {
      modelId = customModel.baseModelId;
      if (customModel.extraParams) {
        mergedExtraParams = { ...customModel.extraParams, ...mergedExtraParams };
      }
      if (customModel.maxTokens) systemParams.max_tokens = customModel.maxTokens;
    }
  }

  // プロバイダーが未解決の場合、モデルIDからプロバイダーを探す
  if (!resolvedProvider) {
    const allModels = await listModels();
    const targetModel = allModels.find((m) => m.id === modelId || m.targetModelId === modelId);
    if (targetModel) {
      resolvedProvider = await db.providers.get(Number(targetModel.providerId));
    }
  }

  const provider = resolvedProvider || (await getActiveProvider());
  if (!provider) {
    throw new Error('有効なAIプロバイダーが設定されていません。');
  }

  const providerInstance = getProvider(provider);

  return providerInstance.chatCompletion({
    model: modelId,
    messages: options.messages,
    stream: options.stream,
    max_tokens: options.max_tokens || (systemParams.max_tokens as number),
    tools: options.tools,
    extraParams: mergedExtraParams,
    signal: options.signal,
  });
}

/**
 * Response API (POST /v1/responses) を呼び出す
 */
export async function createResponse(
  options: ResponseOptions,
): Promise<Response | AsyncIterable<ResponseStreamEvent>> {
  let modelId = options.model;
  let mergedExtraParams = options.extraParams || {};
  const systemParams: Record<string, unknown> = {};
  let resolvedProvider = options.provider;

  const manualModel = await db.manualModels.where('uuid').equals(modelId).first();
  if (manualModel) {
    modelId = manualModel.modelId;
    if (manualModel.extraParams) {
      mergedExtraParams = { ...manualModel.extraParams, ...mergedExtraParams };
    }
    if (manualModel.maxTokens) systemParams.max_tokens = manualModel.maxTokens;
    if (!resolvedProvider && manualModel.providerId) {
      resolvedProvider = await db.providers.get(Number(manualModel.providerId));
    }
  } else {
    const customModel = await db.customModels.where({ modelId }).first();
    if (customModel) {
      modelId = customModel.baseModelId;
      if (customModel.extraParams) {
        mergedExtraParams = { ...customModel.extraParams, ...mergedExtraParams };
      }
      if (customModel.maxTokens) systemParams.max_tokens = customModel.maxTokens;
    }
  }

  // プロバイダーが未解決の場合、モデルIDからプロバイダーを探す
  if (!resolvedProvider) {
    const allModels = await listModels();
    const targetModel = allModels.find((m) => m.id === modelId || m.targetModelId === modelId);
    if (targetModel) {
      resolvedProvider = await db.providers.get(Number(targetModel.providerId));
    }
  }

  const provider = resolvedProvider || (await getActiveProvider());
  if (!provider) {
    throw new Error('有効なAIプロバイダーが設定されていません。');
  }

  const providerInstance = getProvider(provider);

  return providerInstance.createResponse({
    model: modelId,
    input: options.input,
    stream: options.stream,
    tools: options.tools,
    max_tokens: options.max_tokens || (systemParams.max_tokens as number),
    extraParams: mergedExtraParams,
    signal: options.signal,
  });
}

/**
 * 利用可能なモデル一覧を取得する
 */
export async function listModels(targetProvider?: Provider): Promise<ModelInfo[]> {
  let providers: Provider[] = [];

  if (targetProvider) {
    // ターゲット指定がある場合は、非アクティブでもそのプロバイダーのモデルを取得できるようにする
    // (設定画面での利用などを想定)
    providers = [targetProvider];
  } else {
    // 全プロバイダーから有効なものを取得 (order順)
    const allProviders = await db.providers.toArray();
    providers = allProviders
      .filter((p) => !!p.isActive)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }

  if (providers.length === 0) return [];

  // プロバイダーごとの順序を保持するためのマップ
  const providerOrderMap = new Map(providers.map((p, i) => [p.id?.toString(), i]));

  const results = await Promise.allSettled(
    providers.map((p) => {
      const instance = getProvider(p);
      return instance.listModels();
    }),
  );

  let allModels: ModelInfo[] = [];

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      allModels = [...allModels, ...result.value];
    } else {
      console.error('Provider model fetch failed:', result.reason);
    }
  });

  return allModels.sort((a, b) => {
    // 1. プロバイダーの表示順序 (Provider.order)
    const orderA = providerOrderMap.get(a.providerId) ?? 999;
    const orderB = providerOrderMap.get(b.providerId) ?? 999;
    if (orderA !== orderB) return orderA - orderB;

    // 2. モデルの表示順序 (Model.order)
    if (a.order !== b.order) return a.order - b.order;

    // 3. プロバイダー名
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);

    // 4. モデル名
    return a.name.localeCompare(b.name);
  });
}
