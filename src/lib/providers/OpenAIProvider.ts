import Dexie from 'dexie';
import OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { Provider } from '../db';
import { db } from '../db';
import type { ModelInfo } from '../services/ModelService';
import type { BaseProvider, ChatOptions } from './BaseProvider';

export class OpenAIProvider implements BaseProvider {
  private client: OpenAI;
  private provider: Provider;

  constructor(provider: Provider) {
    this.provider = provider;
    this.client = new OpenAI({
      baseURL: provider.baseUrl,
      apiKey: provider.apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    const providerIdStr = this.provider.id?.toString() || '';
    let apiModels: { id: string; object: string }[] = [];

    try {
      const response = await this.client.models.list();
      apiModels = response.data;
    } catch (error) {
      console.warn(`モデル一覧の取得に失敗しました (Provider: ${this.provider.name})`, error);
    }

    const manualModels = await db.manualModels.where({ providerId: providerIdStr }).toArray();
    const configs = await db.modelConfigs
      .where('[providerId+modelId]')
      .between([providerIdStr, Dexie.minKey], [providerIdStr, Dexie.maxKey])
      .toArray();

    const configMap = new Map(configs.map((c) => [c.modelId, c]));
    const manualModelIds = new Set(manualModels.map((m) => m.uuid));

    const startOrder = 1000;
    const models: ModelInfo[] = [];

    apiModels.forEach((m, index) => {
      if (manualModelIds.has(m.id)) return;
      const config = configMap.get(m.id);
      models.push({
        id: m.id,
        targetModelId: m.id,
        name: m.id,
        provider: this.provider.name,
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

    manualModels.forEach((m) => {
      const config = configMap.get(m.uuid);
      const isOverride = apiModels.some((am) => am.id === m.uuid);

      models.push({
        id: m.uuid,
        targetModelId: m.modelId,
        name: m.name,
        provider: this.provider.name,
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

  async chatCompletion(
    options: ChatOptions,
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
    const { extraParams, model, signal, messages, ...params } = options;

    const requestBody = {
      ...params,
      messages,
      model: model,
      ...extraParams,
    } as OpenAI.Chat.ChatCompletionCreateParams;

    if (options.stream) {
      return this.client.chat.completions.create(
        { ...requestBody, stream: true },
        { signal },
      ) as Promise<AsyncIterable<ChatCompletionChunk>>;
    }

    return this.client.chat.completions.create(
      { ...requestBody, stream: false },
      { signal },
    ) as Promise<ChatCompletion>;
  }
}
