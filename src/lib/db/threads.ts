import { db, type Message } from '../db';

/**
 * スレッド内の全メッセージを取得
 */
export async function getThreadMessages(threadId: number) {
  return db.messages.where('threadId').equals(threadId).sortBy('createdAt');
}

/**
 * 現在のアクティブなパス上のメッセージ一覧を取得
 * leafIdからparentIdを遡って再構築する。
 * leafId が null の場合はルート（空配列）を返す。
 * 未指定 (undefined) の場合はスレッドの activeLeafId を使用する。
 */
export async function getActivePathMessages(
  threadId: number,
  leafId?: number | null,
): Promise<Message[]> {
  const thread = await db.threads.get(threadId);
  if (!thread) return [];

  const allMessages = await db.messages.where('threadId').equals(threadId).toArray();
  const messageMap = new Map(allMessages.map((m) => [m.id, m]));

  const path: Message[] = [];
  // leafId が null の場合は空配列（ルート）を返す
  if (leafId === null) return path;

  let currentId = leafId ?? thread.activeLeafId;

  // activeLeafId が明示的に null の場合はルート（空配列）
  if (currentId === null) return path;

  // activeLeafIdが未設定 (undefined) の場合は、一番新しいメッセージを起点とする（互換性）
  if (currentId === undefined && allMessages.length > 0) {
    const latest = allMessages.sort((a, b) => (b.id || 0) - (a.id || 0))[0];
    currentId = latest.id;
  }

  while (currentId != null) {
    const id = currentId as number;
    if (!messageMap.has(id)) break;
    const msg = messageMap.get(id);
    if (!msg) break;
    path.unshift(msg);
    currentId = msg.parentId;
    // 無限ループ防止（万が一のデータ破損用）
    if (path.length > 1000) break;
  }

  return path;
}

/**
 * 特定のメッセージの兄弟（ブランチ選択肢）と自身のインデックスを取得
 */
export async function getMessageBranchInfo(messageId: number) {
  const message = await db.messages.get(messageId);
  if (!message) return null;

  // 同じ親を持つメッセージ（＝兄弟）を取得
  // Dexie の where オブジェクトでは undefined の扱いに注意が必要なため、明示的にフィルタリングする、
  // あるいは parentId が無いときは別のクエリにする
  let siblings: Message[];
  if (message.parentId === undefined) {
    siblings = await db.messages
      .where('threadId')
      .equals(message.threadId)
      .filter((m) => m.parentId === undefined)
      .sortBy('createdAt');
  } else {
    siblings = await db.messages
      .where({ threadId: message.threadId, parentId: message.parentId })
      .sortBy('createdAt');
  }

  const currentIndex = siblings.findIndex((h) => h.id === messageId);
  return {
    current: currentIndex + 1,
    total: siblings.length,
    siblings,
  };
}

/**
 * スレッド一覧を取得（新しい順）
 */
export async function listThreads() {
  return db.threads.orderBy('updatedAt').reverse().toArray();
}

/**
 * スレッドを削除（メッセージも連鎖的に削除）
 */
export async function deleteThread(threadId: number) {
  return db.transaction('rw', db.threads, db.messages, async () => {
    await db.messages.where('threadId').equals(threadId).delete();
    await db.threads.delete(threadId);
  });
}
