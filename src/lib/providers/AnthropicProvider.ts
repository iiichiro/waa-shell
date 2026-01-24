import Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { Provider } from '../db';
import { AbstractProvider } from './AbstractProvider';
import type { ChatOptions } from './BaseProvider';

export class AnthropicProvider extends AbstractProvider {
  private client: Anthropic;

  constructor(provider: Provider) {
    super(provider);
    this.client = new Anthropic({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl || undefined,
      dangerouslyAllowBrowser: true,
    });
  }

  protected async fetchApiModels(): Promise<{ id: string; object: string }[]> {
    const response = await this.client.models.list();
    // Anthropic SDKのレスポンスを共通の形式に変換
    return response.data.map((m) => ({
      id: m.id,
      object: 'model',
    }));
  }

  async chatCompletion(
    options: ChatOptions,
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
    const systemPrompt = options.messages.find((m) => m.role === 'system')?.content;
    const messages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
          const content: Anthropic.MessageParam['content'] = [];
          if (m.content) {
            content.push({ type: 'text', text: m.content as string });
          }
          for (const tc of m.tool_calls) {
            if (tc.type === 'function') {
              content.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: JSON.parse(tc.function.arguments),
              });
            }
          }
          return { role: 'assistant', content };
        }

        if (m.role === 'tool') {
          return {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: (m as OpenAI.Chat.ChatCompletionToolMessageParam).tool_call_id,
                content: m.content as string,
              },
            ],
          };
        }

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

    const anthropicTools = options.tools
      ?.map((t) => {
        if (t.type === 'function' && t.function.name === 'web_search') {
          // Anthropic native search tool definition based on docs
          return {
            type: 'web_search_20250305',
            name: 'web_search',
          } as Anthropic.WebSearchTool20250305 & Anthropic.Tool;
        }
        if (t.type === 'function') {
          return {
            name: t.function.name,
            description: t.function.description || '',
            input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
          };
        }
        return null;
      })
      .filter((t) => t !== null);

    if (options.stream) {
      const stream = await this.client.messages.create({
        ...options.extraParams,
        model: options.model,
        max_tokens: options.max_tokens || 4096 * 1000,
        system: typeof systemPrompt === 'string' ? systemPrompt : undefined,
        messages,
        tools: anthropicTools && anthropicTools.length > 0 ? anthropicTools : undefined,
        stream: true,
      });

      return (async function* () {
        let currentToolIndex = -1;
        for await (const chunk of stream) {
          if (chunk.type === 'message_start') continue;
          if (chunk.type === 'message_delta') {
            if (chunk.delta.stop_reason) {
              yield {
                id: 'anthropic-stream',
                object: 'chat.completion.chunk',
                created: Date.now(),
                model: options.model,
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: chunk.delta.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
                  },
                ],
              } as ChatCompletionChunk;
            }
            continue;
          }

          if (chunk.type === 'content_block_start') {
            if (chunk.content_block.type === 'tool_use') {
              currentToolIndex++;
              yield {
                id: 'anthropic-stream',
                object: 'chat.completion.chunk',
                created: Date.now(),
                model: options.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: currentToolIndex,
                          id: chunk.content_block.id,
                          type: 'function',
                          function: {
                            name: chunk.content_block.name,
                            arguments: '',
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              } as ChatCompletionChunk;
            }
          } else if (chunk.type === 'content_block_delta') {
            if (chunk.delta.type === 'text_delta') {
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
            } else if (chunk.delta.type === 'input_json_delta') {
              yield {
                id: 'anthropic-stream',
                object: 'chat.completion.chunk',
                created: Date.now(),
                model: options.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: currentToolIndex,
                          function: {
                            arguments: chunk.delta.partial_json,
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              } as ChatCompletionChunk;
            }
          }
        }
      })();
    } else {
      const response = await this.client.messages.create({
        ...options.extraParams,
        model: options.model,
        max_tokens: options.max_tokens || 4096 * 1000,
        system: typeof systemPrompt === 'string' ? systemPrompt : undefined,
        messages,
        tools: anthropicTools && anthropicTools.length > 0 ? anthropicTools : undefined,
        stream: false,
      });

      const text = response.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('');

      const toolCalls = response.content
        .filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
        .map((c) => ({
          id: c.id,
          type: 'function' as const,
          function: {
            name: c.name,
            arguments: JSON.stringify(c.input),
          },
        }));

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
              content: text || null,
              tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            },
            finish_reason: response.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
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
