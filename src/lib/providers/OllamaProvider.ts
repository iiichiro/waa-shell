import { type ChatRequest, type Message, Ollama } from 'ollama/browser';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { Provider } from '../db';
import { withAiProviderRetry } from '../utils/retry';
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
        role: m.role as 'user' | 'assistant' | 'system' | 'tool',
        content: '',
      };

      if (m.role === 'tool') {
        // tool_call_id は Ollama では直接的な同等物がない場合があるが
        // メッセージとして送信するために content を設定
        ollamaMessage.content = typeof m.content === 'string' ? m.content : '';
        return ollamaMessage;
      }

      if (m.role === 'assistant' && m.tool_calls) {
        // assistant の tool_calls をマッピング
        // 型エラー回避のため型チェックとキャストを行う
        ollamaMessage.tool_calls = m.tool_calls
          .filter((tc) => tc.type === 'function')
          .map((tc) => ({
            function: {
              name: tc.function.name,
              arguments: JSON.parse(tc.function.arguments),
            },
          }));
      }

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
      const response = await withAiProviderRetry(
        () =>
          this.client.chat({
            ...options.extraParams,
            model: options.model,
            messages,
            stream: true,
            options: {
              ...options.extraParams,
              num_predict: options.max_tokens,
            },
            tools: options.tools?.filter((t) => t.type === 'function'),
            signal: options.signal, // AbortSignal対応
          } as unknown as ChatRequest & { stream: true }),
        options.signal,
      );

      // 信号の中断をハンドル
      // 信号の中断をハンドル (Ollama SDKの AsyncGenerator に abort があれば呼ぶが、通常は signal 経由で止まる)
      const abortHandler = () => {
        if (
          response &&
          'abort' in response &&
          typeof (response as { abort?: unknown }).abort === 'function'
        ) {
          (response as { abort: () => void }).abort();
        }
      };
      if (options.signal) {
        options.signal.addEventListener('abort', abortHandler, { once: true });
      }

      return (async function* () {
        try {
          for await (const chunk of response) {
            if (options.signal?.aborted) break;
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
                    tool_calls: chunk.message.tool_calls?.map((tc, i) => ({
                      index: i,
                      id: `call_${Math.random().toString(36).slice(2, 11)}`,
                      type: 'function',
                      function: {
                        name: tc.function.name,
                        arguments: JSON.stringify(tc.function.arguments),
                      },
                    })),
                  } as unknown as ChatCompletionChunk.Choice.Delta,
                  finish_reason: chunk.done
                    ? chunk.message.tool_calls
                      ? 'tool_calls'
                      : 'stop'
                    : null,
                },
              ],
            } as ChatCompletionChunk;
          }
        } catch (error) {
          if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
            return;
          }
          throw error;
        } finally {
          if (options.signal) {
            options.signal.removeEventListener('abort', abortHandler);
          }
        }
      })();
    } else {
      const response = await withAiProviderRetry(
        () =>
          this.client.chat({
            ...options.extraParams,
            model: options.model,
            messages,
            stream: false,
            options: {
              ...options.extraParams,
              num_predict: options.max_tokens,
            },
            tools: options.tools?.filter((t) => t.type === 'function'),
            signal: options.signal, // AbortSignal対応
          } as unknown as ChatRequest & { stream?: false | undefined }),
        options.signal,
      );

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
              tool_calls: response.message.tool_calls?.map((tc) => ({
                id: `call_${Math.random().toString(36).slice(2, 11)}`,
                type: 'function',
                function: {
                  name: tc.function.name,
                  arguments: JSON.stringify(tc.function.arguments),
                },
              })),
            } as unknown as ChatCompletion.Choice,
            finish_reason: response.message.tool_calls ? 'tool_calls' : 'stop',
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
