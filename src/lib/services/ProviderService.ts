import { db, type Provider } from '../db';

/**
 * AIプロバイダー（LiteLLM互換）設定を管理するサービス
 */

/**
 * プロバイダーの登録または更新
 */
export async function upsertProvider(provider: Omit<Provider, 'createdAt' | 'updatedAt'>) {
  const existing = await db.providers.where('name').equals(provider.name).first();
  const now = new Date();

  // アクティブにする場合、他を全て非アクティブにする
  if (provider.isActive) {
    await db.providers.filter((p) => !!p.isActive).modify({ isActive: false });
  }

  if (existing && existing.id !== undefined) {
    return db.providers.update(existing.id, {
      ...provider,
      updatedAt: now,
    });
  }

  return db.providers.add({
    ...provider,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * プロバイダー一覧を取得
 */
export async function listProviders() {
  return db.providers.toArray();
}

/**
 * 現在有効なプロバイダーを取得
 */
export async function getActiveProvider() {
  // インデックスの互換性問題を避けるため filter を使用 (レコード数が少ないため性能影響なし)
  return db.providers.filter((p) => !!p.isActive).first();
}

/**
 * プロバイダーの削除
 */
export async function deleteProvider(id: number) {
  return db.providers.delete(id);
}

/**
 * 初期シードデータとしてのデプロイ設定を登録
 */
export async function seedProviders() {
  const count = await db.providers.count();
  if (count > 0) return;

  // デフォルトが必要な場合
  // await upsertProvider({
  //   name: 'OpenAI (Dummy)',
  //   baseUrl: 'https://api.openai.com/v1',
  //   apiKey: '',
  //   type: 'openai-compatible',
  //   isActive: true,
  // });
}

/**
 * 特定のプロバイダーをアクティブにする
 */
export async function setActiveProvider(id: number) {
  return db.transaction('rw', db.providers, async () => {
    await db.providers.toCollection().modify({ isActive: false });
    await db.providers.update(id, { isActive: true });
  });
}
