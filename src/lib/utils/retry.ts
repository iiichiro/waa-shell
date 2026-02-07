export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  shouldRetry: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * 指数バックオフによる待機 (AbortSignal対応)
 */
const delay = (ms: number, signal?: AbortSignal) => {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Aborted', 'AbortError'));
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abortHandler);
      resolve();
    }, ms);

    const abortHandler = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', abortHandler, { once: true });
  });
};

/**
 * 係数
 * 秒数の増加係数
 */
const COEFF = 2;

/**
 * 汎用リトライラッパー
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  signal?: AbortSignal,
): Promise<T> {
  let attempt = 0;
  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      return await fn();
    } catch (error: unknown) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new DOMException('Aborted', 'AbortError');
      }

      attempt++;
      if (attempt > options.maxRetries || !options.shouldRetry(error)) {
        throw error;
      }

      const delayMs = options.initialDelayMs * COEFF ** (attempt - 1);
      if (options.onRetry) {
        options.onRetry(error, attempt, delayMs);
      }
      await delay(delayMs, signal);
    }
  }
}

/**
 * 500エラー用のリトライ設定 (2回リトライ、5秒固定待機に近い挙動)
 */
export const SERVER_ERROR_RETRY_OPTIONS: Omit<RetryOptions, 'shouldRetry'> = {
  maxRetries: 2,
  initialDelayMs: 5000,
};

/**
 * 429エラー用のリトライ設定 (4回リトライ、指数バックオフ)
 */
export const RATE_LIMIT_RETRY_OPTIONS: Omit<RetryOptions, 'shouldRetry'> = {
  maxRetries: 4,
  initialDelayMs: 8000,
};

/**
 * エラーからステータスコードを抽出するユーティリティ
 */
export function getStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;

  // OpenAI / Anthropic / Common SDKs
  if ('status' in error && typeof error.status === 'number') return error.status;
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;

  // error.response.status
  if (
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'status' in error.response &&
    typeof error.response.status === 'number'
  ) {
    return error.response.status;
  }

  // Google GenAI SDK (エラーメッセージに含まれる場合がある: "[429 Too Many Requests] ...")
  if ('message' in error && typeof error.message === 'string') {
    const match = error.message.match(/\[(\d{3}) .*/);
    if (match) return parseInt(match[1], 10);
  }

  return undefined;
}

/**
 * AIプロバイダー向けの統合リトライ処理
 */
export async function withAiProviderRetry<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  // 1. まずは通常の試行。失敗した場合はエラー内容で判断
  try {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return await fn();
  } catch (error: unknown) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const status = getStatusCode(error);

    if (status === 429) {
      // 429エラーのリトライ
      return withRetry(
        fn,
        {
          ...RATE_LIMIT_RETRY_OPTIONS,
          shouldRetry: (err) => getStatusCode(err) === 429,
          onRetry: (_, attempt, delayMs) => {
            console.warn(
              `[Retry] 429 Rate Limit - Attempt ${attempt}/${RATE_LIMIT_RETRY_OPTIONS.maxRetries}, waiting ${delayMs}ms`,
            );
          },
        },
        signal,
      );
    }

    if (status && status >= 500 && status < 600) {
      // 500系エラーのリトライ
      return withRetry(
        fn,
        {
          ...SERVER_ERROR_RETRY_OPTIONS,
          shouldRetry: (err) => {
            const s = getStatusCode(err);
            return !!(s && s >= 500 && s < 600);
          },
          onRetry: (_, attempt, delayMs) => {
            console.warn(
              `[Retry] ${status} Server Error - Attempt ${attempt}/${SERVER_ERROR_RETRY_OPTIONS.maxRetries}, waiting ${delayMs}ms`,
            );
          },
        },
        signal,
      );
    }

    // それ以外のエラーはそのまま投げる
    throw error;
  }
}
