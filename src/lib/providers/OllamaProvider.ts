import { type Message, Ollama } from 'ollama/browser';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { Provider } from '../db';
import { AbstractProvider } from './AbstractProvider';
import type { ChatOptions } from './BaseProvider';

export class OllamaProvider extends AbstractProvider {
  private client: Ollama;

  constructor(provider: Provider) {
    super(provider);
    this.client = new Ollama({
      host: provider.baseUrl || 'http://localhost:11434',
    });
  }

  protected async fetchApiModels(): Promise<{ id: string; object: string }[]> {
    const response = await this.client.list();
    return response.models.map((m) => ({
      id: m.name,
      object: 'model',
    }));
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
