import type { Provider } from '../db';
import { AnthropicProvider } from './AnthropicProvider';
import type { BaseProvider } from './BaseProvider';
import { GoogleProvider } from './GoogleProvider';
import { OllamaProvider } from './OllamaProvider';
import { OpenAIProvider } from './OpenAIProvider';

/**
 * プロバイダー種別に応じて適切なプロバイダーインスタンスを返すファクトリ関数
 */
export function getProvider(provider: Provider): BaseProvider {
  switch (provider.type) {
    case 'google':
      return new GoogleProvider(provider);
    case 'ollama':
      return new OllamaProvider(provider);
    case 'anthropic':
      return new AnthropicProvider(provider);
    case 'openai-compatible':
    case 'openrouter':
    case 'litellm':
    case 'azure':
      return new OpenAIProvider(provider);
    default:
      // デフォルトは OpenAI 互換として扱う
      return new OpenAIProvider(provider);
  }
}
