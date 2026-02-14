import Dexie from 'dexie';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { Response, ResponseStreamEvent } from 'openai/resources/responses/responses';
import {
  DEFAULT_DISABLED_SUPPORTS_TOOLS_PROVIDERS,
  DEFAULT_ENABLE_STREAM,
  DEFAULT_PROTOCOL,
  DEFAULT_SUPPORTS_IMAGES,
  DEFAULT_SUPPORTS_TOOLS,
} from '../constants/ConfigConstants';
import { db, type Provider } from '../db';
import type { ModelInfo } from '../services/ModelService';
import type { BaseProvider, ChatOptions, ResponseOptions } from './BaseProvider';

export abstract class AbstractProvider implements BaseProvider {
  constructor(protected provider: Provider) {}

  /**
   * 個別のプロバイダー実装で定義する必要があるメソッド
   */
  abstract chatCompletion(
    options: ChatOptions,
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>>;

  /**
   * Response API リクエストを送信する (OpenAI SDK互換プロバイダーのみ実装可能)
   */
  async createResponse(
    _options: ResponseOptions,
  ): Promise<Response | AsyncIterable<ResponseStreamEvent>> {
    throw new Error(
      `このプロバイダー (${this.provider.name}) は Response API をサポートしていません。`,
    );
  }

  /**
   * APIからモデル一覧を取得するための抽象メソッド
   * 各プロバイダーの実装で、API固有のレスポンスを共通形式に変換して返す
   */
  protected abstract fetchApiModels(): Promise<{ id: string; [key: string]: unknown }[]>;

  /**
   * 共通のモデルリスト取得ロジック
   * API取得結果と、DB上の設定(manualModels, modelConfigs)をマージする
   */
  async listModels(): Promise<ModelInfo[]> {
    const providerIdStr = this.provider.id?.toString() || '';
    let apiModels: { id: string; [key: string]: unknown }[] = [];

    try {
      apiModels = await this.fetchApiModels();
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
      // マニュアル登録されたモデルとIDが重複する場合はスキップ(マニュアル優先)
      if (manualModelIds.has(m.id)) return;

      const config = configMap.get(m.id);
      models.push({
        id: m.id,
        targetModelId: m.id,
        name: m.id,
        provider: this.provider.name,
        providerId: providerIdStr,
        canStream: true,
        enableStream: config ? config.enableStream : DEFAULT_ENABLE_STREAM,
        isEnabled: config ? config.isEnabled : true,
        order: config?.order ?? startOrder + index,
        isCustom: false,
        isManual: false,
        supportsTools:
          config?.supportsTools ??
          (!DEFAULT_DISABLED_SUPPORTS_TOOLS_PROVIDERS.includes(this.provider.type) &&
            DEFAULT_SUPPORTS_TOOLS),
        supportsImages: config?.supportsImages ?? DEFAULT_SUPPORTS_IMAGES,
        protocol: config?.protocol || this.provider.defaultProtocol || DEFAULT_PROTOCOL,
        providerType: this.provider.type,
        supportsWebSearch: m.supports_web_search as boolean | undefined,
        supportedOpenAiParams: m.supported_openai_params as string[] | undefined,
      });
    });

    manualModels.forEach((m) => {
      const config = configMap.get(m.uuid);
      const apiModelIndex = apiModels.findIndex((am) => am.id === m.uuid);
      const isOverride = apiModelIndex !== -1;

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
        enableStream: config?.enableStream ?? m.enableStream ?? DEFAULT_ENABLE_STREAM,
        isEnabled: config?.isEnabled ?? m.isEnabled ?? true,
        order:
          config?.order ??
          (isOverride ? startOrder + apiModelIndex : startOrder + apiModels.length + 500),
        isCustom: false,
        isManual: true,
        isApiOverride: isOverride,
        supportsTools:
          config?.supportsTools ??
          m.supportsTools ??
          (!DEFAULT_DISABLED_SUPPORTS_TOOLS_PROVIDERS.includes(this.provider.type) &&
            DEFAULT_SUPPORTS_TOOLS),
        supportsImages: config?.supportsImages ?? m.supportsImages ?? DEFAULT_SUPPORTS_IMAGES,
        protocol:
          config?.protocol || m.protocol || this.provider.defaultProtocol || DEFAULT_PROTOCOL,
        providerType: this.provider.type,
      });
    });

    return models;
  }
}
