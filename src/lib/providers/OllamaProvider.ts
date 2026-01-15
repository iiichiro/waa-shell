import Dexie from 'dexie';
import { type Message, Ollama } from 'ollama/browser';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { Provider } from '../db';
import { db } from '../db';
import type { ModelInfo } from '../services/ModelService';
import type { BaseProvider, ChatOptions } from './BaseProvider';

export class OllamaProvider implements BaseProvider {
  private client: Ollama;
  private provider: Provider;

  constructor(provider: Provider) {
    this.provider = provider;
    this.client = new Ollama({
      host: provider.baseUrl || 'http://localhost:11434',
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    const providerIdStr = this.provider.id?.toString() || '';
    let apiModels: { id: string; object: string }[] = [];

    try {
      const response = await this.client.list();
      apiModels = response.models.map((m) => ({
        id: m.name,
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
    // OpenAI messages -> Ollama messages
    const messages = options.messages.map((m) => {
      const ollamaMessage: Message = {
        role: m.role as 'user' | 'assistant' | 'system',
        content: '',
      };

      if (typeof m.content === 'string') {
        ollamaMessage.content = m.content;
      } else if (Array.isArray(m.content)) {
        const textParts = m.content
          .filter((p) => p.type === 'text')
          .map((p) => (p.type === 'text' ? p.text : ''));
        const imageParts = m.content
          .filter((p) => p.type === 'image_url')
          .map((p) => {
            if (p.type === 'image_url') {
              const matches = p.image_url.url.match(/^data:image\/[a-z]+;base64,(.+)$/);
              return matches ? matches[1] : null;
            }
            return null;
          })
          .filter((img): img is string => img !== null);

        ollamaMessage.content = textParts.join('\n');
        if (imageParts.length > 0) {
          ollamaMessage.images = imageParts;
        }
      }

      return ollamaMessage;
    });

    if (options.stream) {
      const response = await this.client.chat({
        model: options.model,
        messages,
        stream: true,
        options: {
          temperature: options.temperature,
          num_predict: options.max_tokens,
          top_p: options.top_p,
        },
      });

      return (async function* () {
        for await (const chunk of response) {
          yield {
            id: 'ollama-stream',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: options.model,
            choices: [
              {
                index: 0,
                delta: { content: chunk.message.content },
                finish_reason: chunk.done ? 'stop' : null,
              },
            ],
          } as ChatCompletionChunk;
        }
      })();
    } else {
      const response = await this.client.chat({
        model: options.model,
        messages,
        stream: false,
        options: {
          temperature: options.temperature,
          num_predict: options.max_tokens,
          top_p: options.top_p,
        },
      });

      return {
        id: 'ollama-completion',
        object: 'chat.completion',
        created: Date.now(),
        model: options.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: response.message.content,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: response.prompt_eval_count || 0,
          completion_tokens: response.eval_count || 0,
          total_tokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
        },
      } as ChatCompletion;
    }
  }
}
