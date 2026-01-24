import { db, type Provider } from '../db';

/**
 * AIプロバイダー（LiteLLM互換）設定を管理するサービス
 */

/**
 * プロバイダーの登録または更新
 */
export async function upsertProvider(
  provider: Omit<Provider, 'createdAt' | 'updatedAt'> & { id?: number },
) {
  const now = new Date();

  // 1. IDがある場合はIDで検索、ない場合は名前で検索
  let existing: Provider | undefined;
  if (provider.id !== undefined) {
    existing = await db.providers.get(provider.id);
  } else {
    existing = await db.providers.where('name').equals(provider.name).first();
  }

  if (existing && existing.id !== undefined) {
    // 既存の値をベースに、変更内容をマージして更新 (order等を引き継ぐ)
    return db.providers.update(existing.id, {
      ...existing,
      ...provider,
      updatedAt: now,
    });
  }

  // 新規追加
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
  // 並び順 (order) -> 名前 (name) 順で取得
  const all = await db.providers.toArray();
  return all.sort((a, b) => {
    if ((a.order ?? 999) !== (b.order ?? 999)) return (a.order ?? 999) - (b.order ?? 999);
    return a.name.localeCompare(b.name);
  });
}

/**
 * プロバイダーの表示順序を一括更新
 */
export async function updateProvidersOrder(orderedProviders: Provider[]) {
  return db.transaction('rw', db.providers, async () => {
    for (let i = 0; i < orderedProviders.length; i++) {
      const p = orderedProviders[i];
      if (p.id !== undefined) {
        await db.providers.update(p.id, { order: i });
      }
    }
  });
}

/**
 * 現在有効なプロバイダーを取得 (フォールバック用)
 */
export async function getActiveProvider() {
  // 並び順 (order) が最小の有効なプロバイダーを返す
  const allProviders = await db.providers.toArray();
  const enabledOnes = allProviders
    .filter((p) => !!p.isActive)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  return enabledOnes[0];
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
}

/**
 * プロバイダーの有効/非有効を切り替える
 */
export async function toggleProviderActive(id: number, isActive: boolean) {
  return db.providers.update(id, { isActive });
}

/**
 * 特定のプロバイダーをアクティブにする (互換性のため維持、または廃止検討)
 * 現状は単一選択UIが一部残る可能性があるため維持
 */
export async function setActiveProvider(id: number) {
  return db.transaction('rw', db.providers, async () => {
    await db.providers.toCollection().modify({ isActive: false });
    await db.providers.update(id, { isActive: true });
  });
}
