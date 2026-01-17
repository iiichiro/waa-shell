import { useEffect, useState } from 'react';
import type { LocalFile } from '../../../lib/db';
import { blobToDataURL } from '../../../lib/utils/image';

/**
 * 画像添付ファイルをDataURLに変換して表示するコンポーネント
 */
export function ImageAttachment({ file, onClick }: { file: LocalFile; onClick: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    blobToDataURL(file.blob).then((url) => {
      if (isMounted) setDataUrl(url);
    });
    return () => {
      isMounted = false;
    };
  }, [file.blob]);

  // 画像でないファイル
  if (!file.mimeType.startsWith('image/')) {
    return (
      <div className="flex items-center gap-2 bg-muted border rounded-lg p-2 text-xs">
        <span className="truncate max-w-[150px]">{file.fileName}</span>
        <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)}KB)</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="relative group max-w-[300px] max-h-[300px] cursor-zoom-in block outline-none focus:ring-2 focus:ring-primary rounded-lg"
      onClick={onClick}
      aria-label={`${file.fileName} を拡大表示`}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={file.fileName}
          className="rounded-lg border shadow-sm max-w-full max-h-[300px] object-contain brightness-95 hover:brightness-100 transition-all"
        />
      ) : (
        <div className="w-[100px] h-[100px] bg-muted animate-pulse rounded-lg" />
      )}
    </button>
  );
}
