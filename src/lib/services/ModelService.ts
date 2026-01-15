import OpenAI from 'openai';
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

  const provider = resolvedProvider || (await getActiveProvider());
  if (!provider) {
    throw new Error('有効なAIプロバイダーが設定されていません。');
  }

  const providerInstance = getProvider(provider);

  return providerInstance.chatCompletion({
    model: modelId,
    messages: options.messages,
    stream: options.stream,
    temperature: options.temperature,
    max_tokens: options.max_tokens || (systemParams.max_tokens as number),
    top_p: options.top_p,
    tools: options.tools,
    extraParams: mergedExtraParams,
    signal: options.signal,
  });
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
 * 注: 現状 GoogleProvider は Response API 未対応のため OpenAIProvider 経由のみ想定
 */
export async function createResponseApi(options: {
  model: string;
  input: ResponseInputItem[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  max_tokens?: number;
  extraParams?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<ResponseOutput> {
  let modelId = options.model;
  let mergedExtraParams = options.extraParams || {};
  const systemParams: Record<string, unknown> = {};
  let provider: Provider | undefined;

  const manualModel = await db.manualModels.where('uuid').equals(modelId).first();
  if (manualModel) {
    modelId = manualModel.modelId;
    if (manualModel.extraParams)
      mergedExtraParams = { ...manualModel.extraParams, ...mergedExtraParams };
    if (manualModel.maxTokens) systemParams.max_tokens = manualModel.maxTokens;
    provider = await db.providers.get(parseInt(manualModel.providerId, 10));
  } else {
    const customModel = await db.customModels.where({ modelId }).first();
    if (customModel) {
      modelId = customModel.baseModelId;
    }
  }

  const targetProvider = provider || (await getActiveProvider());
  if (!targetProvider) {
    throw new Error('有効なAIプロバイダーが設定されていません。');
  }

  // Response API は現状 OpenAI SDK 依存の特殊エンドポイント
  // もし将来的に Google 等が対応した場合は Provider インターフェースに追加が必要
  const client = new OpenAI({
    baseURL: targetProvider.baseUrl,
    apiKey: targetProvider.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const body = {
    model: modelId,
    input: options.input,
    tools: options.tools,
    ...systemParams,
    ...mergedExtraParams,
  };

  // @ts-expect-error: OpenAI SDK type
  const response = await client.responses.create(body, { signal: options.signal });
  return response as unknown as ResponseOutput;
}

/**
 * 利用可能なモデル一覧を取得する
 */
export async function listModels(targetProvider?: Provider): Promise<ModelInfo[]> {
  let providers: Provider[] = [];

  if (targetProvider) {
    if (targetProvider.isActive) {
      providers = [targetProvider];
    }
  } else {
    providers = await db.providers.filter((p) => !!p.isActive).toArray();
  }

  if (providers.length === 0) return [];

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
    if (a.order !== b.order) return a.order - b.order;
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    return a.name.localeCompare(b.name);
  });
}
