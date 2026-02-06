import OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type {
  Response,
  ResponseCreateParams,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import type { Stream } from 'openai/streaming';
import type { Provider } from '../db';
import { AbstractProvider } from './AbstractProvider';
import type { ChatOptions, ResponseOptions } from './BaseProvider';

export class OpenAIProvider extends AbstractProvider {
  private client: OpenAI;

  constructor(provider: Provider) {
    super(provider);
    this.client = new OpenAI({
      baseURL: provider.baseUrl,
      apiKey: provider.apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  protected async fetchApiModels(): Promise<{ id: string; object: string }[]> {
    const response = await this.client.models.list();
    return response.data;
  }

  private processTools(
    tools: OpenAI.Chat.ChatCompletionTool[] | undefined,
  ): (OpenAI.Chat.ChatCompletionTool | { type: string })[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    let processedTools: (OpenAI.Chat.ChatCompletionTool | { type: string })[] = [...tools];

    const hasWebSearch = processedTools.some(
      (t) =>
        t.type === 'function' &&
        'function' in t &&
        (t as OpenAI.Chat.ChatCompletionFunctionTool).function.name === 'web_search',
    );

    if (hasWebSearch) {
      // web_search を除外
      processedTools = processedTools.filter(
        (t) =>
          !(
            t.type === 'function' &&
            'function' in t &&
            (t as OpenAI.Chat.ChatCompletionFunctionTool).function.name === 'web_search'
          ),
      );

      // プロバイダーごとにネイティブの検索ツールを追加
      if (this.provider.type === 'openai-compatible' || this.provider.type === 'azure') {
        // OpenAI Native Web Search
        processedTools.push({
          type: 'web_search',
        });
      } else if (this.provider.type === 'litellm' || this.provider.type === 'openrouter') {
        // LiteLLM / OpenRouter Native Web Search
        processedTools.push({
          type: 'web_search_preview',
        });
      }
    }

    return processedTools.length > 0 ? processedTools : undefined;
  }

  async chatCompletion(
    options: ChatOptions,
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
    const { extraParams, model, signal, messages, ...params } = options;

    const processedTools = this.processTools(params.tools);

    // Build the initial request body
    // metadataなどの余計なプロパティが混入しないよう、必要なものだけを構築する
    const requestBody: Record<string, unknown> = {
      ...params,
      ...extraParams, // extraParams (reasoning_effort etc) take precedence
      tools: processedTools,
      messages,
      model: model,
    };

    // reasoning_effort (Top-level) handling
    // If reasoning_effort is present (o1 models, etc), max_tokens should be max_completion_tokens
    if (extraParams && 'reasoning_effort' in extraParams) {
      if (requestBody.max_tokens !== undefined) {
        requestBody.max_completion_tokens = requestBody.max_tokens;
        delete requestBody.max_tokens;
      }
    }

    // Clean up undefined values (Important for strict API validation)
    Object.keys(requestBody).forEach((key) => {
      if (requestBody[key] === undefined) {
        delete requestBody[key];
      }
    });

    if (options.stream) {
      return this.client.chat.completions.create(
        { ...requestBody, stream: true } as OpenAI.Chat.ChatCompletionCreateParams,
        { signal },
      ) as Promise<Stream<ChatCompletionChunk>>;
    }

    return this.client.chat.completions.create(
      { ...requestBody, stream: false } as OpenAI.Chat.ChatCompletionCreateParams,
      { signal },
    ) as Promise<ChatCompletion>;
  }

  async createResponse(
    options: ResponseOptions,
  ): Promise<Response | AsyncIterable<ResponseStreamEvent>> {
    const { extraParams, model, signal, input, ...params } = options;

    const processedTools = this.processTools(params.tools);

    const requestBody: Record<string, unknown> = {
      ...params,
      ...extraParams,
      tools: processedTools,
      input,
      model: model,
    };

    // reasoning_effort handling for Response API
    if (extraParams && 'reasoning_effort' in extraParams) {
      if (requestBody.max_tokens !== undefined) {
        requestBody.max_completion_tokens = requestBody.max_tokens;
        delete requestBody.max_tokens;
      }
    }

    // Clean up undefined values
    Object.keys(requestBody).forEach((key) => {
      if (requestBody[key] === undefined) {
        delete requestBody[key];
      }
    });

    if (options.stream) {
      return this.client.responses.create(
        { ...requestBody, stream: true } as ResponseCreateParams,
        { signal },
      ) as Promise<Stream<ResponseStreamEvent>>;
    }

    return this.client.responses.create({ ...requestBody, stream: false } as ResponseCreateParams, {
      signal,
    }) as Promise<Response>;
  }
}
