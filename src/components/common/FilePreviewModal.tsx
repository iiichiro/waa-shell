import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LocalFile } from '../../lib/db';
import { blobToDataURL } from '../../lib/utils/image';

interface FilePreviewModalProps {
  file: LocalFile;
  onClose: () => void;
}

/**
 * ファイルプレビューモーダル
 * - 画像なら拡大表示
 * - 画像以外ならダウンロードボタンとファイル情報を表示
 */
export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const isImage = file.mimeType.startsWith('image/');

  useEffect(() => {
    let isMounted = true;
    blobToDataURL(file.blob).then((url) => {
      if (isMounted) setDataUrl(url);
    });
    return () => {
      isMounted = false;
    };
  }, [file]);

  // Escキーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = file.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-8 animate-in fade-in duration-200">
      {/* 背景クリックで閉じるためのオーバーレイ */}
      <button
        type="button"
        className="absolute inset-0 w-full h-full cursor-default"
        onClick={onClose}
        aria-label="Close preview"
      />

      <div className="relative z-10 max-w-5xl w-full max-h-full flex flex-col items-center justify-center pointer-events-none">
        {/* コントロールバー */}
        <div className="absolute top-0 right-0 p-2 flex gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={handleDownload}
            className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors backdrop-blur-md border border-white/10"
            title="ダウンロード"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors backdrop-blur-md border border-white/10"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* プレビュー本体 */}
        <div className="pointer-events-auto flex flex-col items-center gap-4 max-h-full overflow-hidden">
          {isImage ? (
            dataUrl ? (
              <img
                src={dataUrl}
                alt={file.fileName}
                className="max-w-full max-h-[85vh] object-contain rounded-md shadow-2xl"
              />
            ) : (
              <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            )
          ) : (
            <div className="bg-background text-foreground p-8 rounded-xl shadow-2xl border max-w-md w-full text-center space-y-6">
              <div className="w-20 h-20 bg-muted rounded-full mx-auto flex items-center justify-center">
                <Download className="w-10 h-10 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-lg break-all">{file.fileName}</h3>
                <p className="text-sm text-muted-foreground">
                  {file.mimeType} • {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownload}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                ダウンロードして保存
              </button>
            </div>
          )}

          {/* 画像の場合もキャプションを表示 */}
          {isImage && (
            <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full text-white text-sm font-medium border border-white/10 shadow-lg">
              {file.fileName} ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
