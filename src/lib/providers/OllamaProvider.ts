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
      const response = await (
        this.client.chat as (args: unknown) => Promise<{
          abort: () => void;
          [Symbol.asyncIterator]: () => AsyncIterator<{
            message: { content: string; thinking?: string };
            done: boolean;
          }>;
        }>
      )({
        model: options.model,
        messages,
        stream: true,
        think: true,
        options: {
          ...options.extraParams,
          num_predict: options.max_tokens,
        },
        signal: options.signal,
      });

      // 信号の中断をハンドル
      const abortHandler = () => response.abort();
      if (options.signal) {
        options.signal.addEventListener('abort', abortHandler);
      }

      return (async function* () {
        try {
          for await (const chunk of response) {
            yield {
              id: 'ollama-stream',
              object: 'chat.completion.chunk',
              created: Date.now(),
              model: options.model,
              choices: [
                {
                  index: 0,
                  delta: {
                    content: chunk.message.content,
                    reasoning_content: chunk.message.thinking, // reasoning_content として渡す
                  } as unknown as ChatCompletionChunk.Choice.Delta,
                  finish_reason: chunk.done ? 'stop' : null,
                },
              ],
            } as ChatCompletionChunk;
          }
        } finally {
          if (options.signal) {
            options.signal.removeEventListener('abort', abortHandler);
          }
        }
      })();
    } else {
      const response = await (
        this.client.chat as (args: unknown) => Promise<{
          message: { content: string; thinking?: string };
          prompt_eval_count?: number;
          eval_count?: number;
        }>
      )({
        model: options.model,
        messages,
        stream: false,
        think: true,
        options: {
          ...options.extraParams,
          num_predict: options.max_tokens,
        },
        signal: options.signal,
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
              reasoning_content: response.message.thinking, // reasoning_content として渡す
            } as unknown as ChatCompletion.Choice,
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: response.prompt_eval_count || 0,
          completion_tokens: response.eval_count || 0,
          total_tokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
        },
      } as unknown as ChatCompletion;
    }
  }
}
