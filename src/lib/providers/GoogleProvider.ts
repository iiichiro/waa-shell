import { GoogleGenAI, type Tool } from '@google/genai';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { Provider } from '../db';
import { AbstractProvider } from './AbstractProvider';
import type { ChatOptions } from './BaseProvider';

type ExtendedTool = Tool | { googleSearchRetrieval: Record<string, unknown> };

export class GoogleProvider extends AbstractProvider {
  private client: GoogleGenAI;

  constructor(provider: Provider) {
    super(provider);
    this.client = new GoogleGenAI({ apiKey: provider.apiKey || '' });
  }

  protected async fetchApiModels(): Promise<{ id: string; object: string }[]> {
    if (!this.provider.apiKey) return [];

    const response = await this.client.models.list();
    const apiModelsRaw = response.page || [];
    return apiModelsRaw
      .filter((m) => typeof m.name === 'string')
      .map((m) => ({
        id: (m.name as string).replace('models/', ''),
        object: 'model',
      }));
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

    const tools: ExtendedTool[] = [];
    if (options.tools) {
      for (const t of options.tools) {
        if (t.type === 'function' && t.function.name === 'web_search') {
          tools.push({ googleSearchRetrieval: {} });
        } else if (t.type === 'function') {
          let fdTool = tools.find(
            (existing): existing is Extract<Tool, { functionDeclarations?: unknown[] }> =>
              'functionDeclarations' in existing,
          );
          if (!fdTool) {
            fdTool = { functionDeclarations: [] };
            tools.push(fdTool as Tool);
          }
          fdTool.functionDeclarations?.push({
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          });
        }
      }
    }
    const generationConfig = {
      maxOutputTokens: options.max_tokens,
      temperature: options.temperature,
      topP: options.top_p,
      // systemInstruction は config 内に配置
      systemInstruction:
        typeof systemInstructionContent === 'string' ? systemInstructionContent : undefined,
      tools: tools.length > 0 ? (tools as Tool[]) : undefined,
    };

    if (options.stream) {
      const responseStream = await this.client.models.generateContentStream({
        model: options.model,
        contents,
        config: generationConfig,
      });

      return (async function* () {
        let currentToolIndex = -1;
        for await (const chunk of responseStream) {
          const candidate = chunk.candidates?.[0];
          if (!candidate?.content?.parts) continue;

          for (const part of candidate.content.parts) {
            if (part.text) {
              yield {
                id: 'gemini-stream',
                created: Date.now(),
                model: options.model,
                choices: [
                  {
                    index: 0,
                    delta: { content: part.text },
                    finish_reason: null,
                  },
                ],
                object: 'chat.completion.chunk',
              } as ChatCompletionChunk;
            }

            if (part.functionCall) {
              currentToolIndex++;
              yield {
                id: 'gemini-stream',
                created: Date.now(),
                model: options.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: currentToolIndex,
                          id: `call_${Math.random().toString(36).substring(2, 9)}`,
                          type: 'function',
                          function: {
                            name: part.functionCall.name,
                            arguments: JSON.stringify(part.functionCall.args),
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
                object: 'chat.completion.chunk',
              } as ChatCompletionChunk;
            }
          }

          if (candidate.finishReason) {
            yield {
              id: 'gemini-stream',
              created: Date.now(),
              model: options.model,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason:
                    candidate.finishReason === 'STOP'
                      ? 'stop'
                      : candidate.finishReason === 'MAX_TOKENS'
                        ? 'length'
                        : 'stop',
                },
              ],
              object: 'chat.completion.chunk',
            } as ChatCompletionChunk;
          }
        }
      })();
    } else {
      const response = await this.client.models.generateContent({
        model: options.model,
        contents,
        config: generationConfig,
      });

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const text = parts
        .filter((p) => p.text)
        .map((p) => p.text)
        .join('');

      const toolCalls = parts
        .filter((p) => p.functionCall)
        .map((p) => ({
          id: `call_${Math.random().toString(36).substring(2, 9)}`,
          type: 'function' as const,
          function: {
            name: p.functionCall?.name || '',
            arguments: JSON.stringify(p.functionCall?.args || {}),
          },
        }));

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
              content: text || null,
              tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            },
            finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
          },
        ],
        usage: {
          prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
          completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
          total_tokens: response.usageMetadata?.totalTokenCount || 0,
        },
      } as ChatCompletion;
    }
  }
}
