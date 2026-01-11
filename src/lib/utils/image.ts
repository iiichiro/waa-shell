/**
 * 画像のリサイズと圧縮を行うユーティリティ
 */

interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.0 to 1.0
  mimeType?: string;
}

/**
 * Blobを圧縮して新しいBlobを返す
 */
export async function compressImage(file: Blob, options: CompressionOptions = {}): Promise<Blob> {
  const { maxWidth = 1536, maxHeight = 1536, quality = 0.8, mimeType = 'image/jpeg' } = options;

  // 画像として読み込み
  const img = await blobToImage(file);

  // サイズの計算
  let width = img.width;
  let height = img.height;

  if (width > maxWidth) {
    height = (height * maxWidth) / width;
    width = maxWidth;
  }
  if (height > maxHeight) {
    width = (width * maxHeight) / height;
    height = maxHeight;
  }

  // Canvas に描画
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  ctx.drawImage(img, 0, 0, width, height);

  // 圧縮して Blob 化
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas toBlob failed'));
        }
      },
      mimeType,
      quality,
    );
  });
}

/**
 * 補助関数: Blob を HTMLImageElement に変換
 */
function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}
