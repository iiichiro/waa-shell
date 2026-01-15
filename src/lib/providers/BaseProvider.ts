import type OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { ModelInfo } from '../services/ModelService';

export interface ChatOptions {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  tools?: OpenAI.Chat.ChatCompletionTool[];
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
}
