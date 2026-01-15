import { GoogleGenAI } from '@google/genai';
import Dexie from 'dexie';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { Provider } from '../db';
import { db } from '../db';
import type { ModelInfo } from '../services/ModelService';
import type { BaseProvider, ChatOptions } from './BaseProvider';

export class GoogleProvider implements BaseProvider {
  private client: GoogleGenAI;
  private provider: Provider;

  constructor(provider: Provider) {
    this.provider = provider;
    this.client = new GoogleGenAI({
      apiKey: provider.apiKey || '',
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    const providerIdStr = this.provider.id?.toString() || '';
    let apiModels: { id: string; object: string }[] = [];

    try {
      if (this.provider.apiKey) {
        const response = await this.client.models.list();
        // Pager<Model> は AsyncIterable であり、.page プロパティで現在のページの Model[] を取得できる
        const apiModelsRaw = response.page || [];
        apiModels = apiModelsRaw
          .filter((m) => typeof m.name === 'string')
          .map((m) => ({
            id: (m.name as string).replace('models/', ''),
            object: 'model',
          }));
      }
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
    // OpenAI messages -> Gemini contents
    const contents = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        let parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];
        if (typeof m.content === 'string') {
          parts = [{ text: m.content }];
        } else if (Array.isArray(m.content)) {
          parts = m.content.map((p) => {
            if (p.type === 'text') return { text: p.text };
            if (p.type === 'image_url') {
              const matches = p.image_url.url.match(/^data:(image\/[a-z]+);base64,(.+)$/);
              if (matches) {
                return { inlineData: { mimeType: matches[1], data: matches[2] } };
              }
            }
            return { text: '' };
          });
        }
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts,
        };
      });

    const systemInstructionContent = options.messages.find((m) => m.role === 'system')?.content;

    const generationConfig = {
      maxOutputTokens: options.max_tokens,
      temperature: options.temperature,
      topP: options.top_p,
      // systemInstruction は config 内に配置
      systemInstruction:
        typeof systemInstructionContent === 'string' ? systemInstructionContent : undefined,
    };

    if (options.stream) {
      const responseStream = await this.client.models.generateContentStream({
        model: options.model,
        contents,
        config: generationConfig,
      });

      return (async function* () {
        // generateContentStream は AsyncGenerator を直接返す
        for await (const chunk of responseStream) {
          const text = chunk.text; // .text はゲッター
          if (!text) continue;
          yield {
            id: 'gemini-stream',
            created: Date.now(),
            model: options.model,
            choices: [
              {
                index: 0,
                delta: { content: text },
                finish_reason: null,
              },
            ],
            object: 'chat.completion.chunk',
          } as ChatCompletionChunk;
        }
      })();
    } else {
      const response = await this.client.models.generateContent({
        model: options.model,
        contents,
        config: generationConfig,
      });

      const text = response.text || ''; // .text はゲッター

      return {
        id: 'gemini-completion',
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
          prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
          completion_tokens: response.usageMetadata?.candidatesTokenCount || 0, // responseTokenCount -> candidatesTokenCount
          total_tokens: response.usageMetadata?.totalTokenCount || 0,
        },
      } as ChatCompletion;
    }
  }
}
