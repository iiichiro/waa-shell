import { db, type LocalFile } from '../db';
import { compressImage } from '../utils/image';

/**
 * ファイルを IndexedDB に保存（自動圧縮対応）
 */
export async function saveFile(
  file: Blob,
  fileName: string,
  extra?: { threadId?: number; messageId?: number; isGenerated?: boolean },
): Promise<number> {
  let blobToSave = file;
  const originalSize = file.size;

  // 画像の場合は圧縮を試みる（生成画像以外の場合に推奨）
  if (file.type.startsWith('image/') && !extra?.isGenerated) {
    try {
      blobToSave = await compressImage(file);
    } catch (e) {
      console.warn('Compression failed, saving original:', e);
    }
  }

  const newFile: LocalFile = {
    threadId: extra?.threadId,
    messageId: extra?.messageId,
    fileName,
    mimeType: blobToSave.type,
    size: blobToSave.size,
    originalSize,
    isGenerated: extra?.isGenerated,
    blob: blobToSave,
    createdAt: new Date(),
  };

  return db.files.add(newFile);
}

/**
 * ファイルを Base64 文字列に変換（マルチモーダル送信時用）
 */
export async function fileToBase64(id: number): Promise<{ base64: string; mimeType: string }> {
  const file = await db.files.get(id);
  if (!file) throw new Error(`File not found: ${id}`);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType: file.mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file.blob);
  });
}

/**
 * フィルター条件に基づいたファイル一覧の取得
 */
export async function listFiles(filter?: {
  mimeType?: string;
  threadId?: number;
  limit?: number;
  offset?: number;
}) {
  let collection = db.files.toCollection();

  if (filter?.mimeType) {
    collection = db.files.where('mimeType').equals(filter.mimeType);
  }

  if (filter?.threadId) {
    collection = collection.filter((f) => f.threadId === filter.threadId);
  }

  return collection
    .offset(filter?.offset || 0)
    .limit(filter?.limit || 50)
    .reverse()
    .toArray();
}

/**
 * 特定のファイルを削除
 */
export async function deleteFile(id: number) {
  return db.files.delete(id);
}

/**
 * ストレージ全体の使用統計を取得
 */
export async function getStorageUsage() {
  const files = await db.files.toArray();
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const originalBytes = files.reduce((sum, f) => sum + (f.originalSize || f.size), 0);

  return {
    totalBytes,
    originalBytes,
    savings: originalBytes - totalBytes,
    fileCount: files.length,
  };
}
