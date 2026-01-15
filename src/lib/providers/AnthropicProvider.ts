import Anthropic from '@anthropic-ai/sdk';
import Dexie from 'dexie';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { Provider } from '../db';
import { db } from '../db';
import type { ModelInfo } from '../services/ModelService';
import type { BaseProvider, ChatOptions } from './BaseProvider';

export class AnthropicProvider implements BaseProvider {
  private client: Anthropic;
  private provider: Provider;

  constructor(provider: Provider) {
    this.provider = provider;
    this.client = new Anthropic({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl || undefined,
      dangerouslyAllowBrowser: true,
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    const providerIdStr = this.provider.id?.toString() || '';
    let apiModels: { id: string; object: string }[] = [];

    try {
      const response = await this.client.models.list();
      // Anthropic SDKのレスポンスを共通の形式に変換
      apiModels = response.data.map((m) => ({
        id: m.id,
        object: 'model',
      }));
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
    const systemPrompt = options.messages.find((m) => m.role === 'system')?.content;
    const messages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        let content: Anthropic.MessageParam['content'];
        if (typeof m.content === 'string') {
          content = m.content;
        } else if (Array.isArray(m.content)) {
          content = m.content.map((p) => {
            if (p.type === 'text') return { type: 'text', text: p.text };
            if (p.type === 'image_url') {
              const matches = p.image_url.url.match(/^data:(image\/[a-z]+);base64,(.+)$/);
              if (matches) {
                return {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: matches[1] as
                      | 'image/jpeg'
                      | 'image/png'
                      | 'image/gif'
                      | 'image/webp',
                    data: matches[2],
                  },
                };
              }
            }
            return { type: 'text', text: '' };
          });
        } else {
          content = '';
        }
        return {
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content,
        };
      }) as Anthropic.MessageParam[];

    if (options.stream) {
      const stream = await this.client.messages.create({
        model: options.model,
        max_tokens: options.max_tokens || 4096,
        system: typeof systemPrompt === 'string' ? systemPrompt : undefined,
        messages,
        stream: true,
        temperature: options.temperature,
        top_p: options.top_p,
      });

      return (async function* () {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            yield {
              id: 'anthropic-stream',
              object: 'chat.completion.chunk',
              created: Date.now(),
              model: options.model,
              choices: [
                {
                  index: 0,
                  delta: { content: chunk.delta.text },
                  finish_reason: null,
                },
              ],
            } as ChatCompletionChunk;
          }
        }
      })();
    } else {
      const response = await this.client.messages.create({
        model: options.model,
        max_tokens: options.max_tokens || 4096,
        system: typeof systemPrompt === 'string' ? systemPrompt : undefined,
        messages,
        stream: false,
        temperature: options.temperature,
        top_p: options.top_p,
      });

      const text = response.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('');

      return {
        id: response.id,
        object: 'chat.completion',
        created: Date.now(),
        model: options.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: text,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      } as ChatCompletion;
    }
  }
}
