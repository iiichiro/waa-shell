import type OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type {
  Response,
  ResponseCreateParams,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import type { ModelInfo } from '../services/ModelService';

export interface ChatOptions {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  stream?: boolean;
  max_tokens?: number;
  stop?: string | string[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  tool_choice?: OpenAI.Chat.ChatCompletionToolChoiceOption;
  extraParams?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ResponseOptions {
  model: string;
  input: ResponseCreateParams['input'];
  stream?: boolean;
  tools?: OpenAI.Chat.ChatCompletionTool[];
  max_tokens?: number;
  extraParams?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface BaseProvider {
  /**
   * 利用可能なモデル一覧を取得する
   */
  listModels(): Promise<ModelInfo[]>;

  /**
   * チャット完了リクエストを送信する
   */
  chatCompletion(
    options: ChatOptions,
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>>;

  /**
   * Response API リクエストを送信する
   */
  createResponse(options: ResponseOptions): Promise<Response | AsyncIterable<ResponseStreamEvent>>;
}
