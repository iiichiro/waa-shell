import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LocalFile } from '../../lib/db';
import { blobToDataURL } from '../../lib/utils/image';
import { Modal } from './Modal';

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

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = file.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={file.fileName}
      maxWidth="max-w-5xl"
      className="!bg-transparent !border-none !shadow-none overflow-visible"
      showCloseButton={true}
    >
      <div className="flex flex-col items-center justify-center gap-4 max-h-full">
        {/* プレビュー本体 */}
        <div className="flex flex-col items-center gap-4 max-h-full">
          {isImage ? (
            dataUrl ? (
              <img
                src={dataUrl}
                alt={file.fileName}
                className="max-w-full max-h-[70vh] object-contain rounded-md shadow-2xl"
              />
            ) : (
              <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
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

          {/* 画像の場合もキャプションを表示（Modal内の下部） */}
          {isImage && (
            <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full text-white text-sm font-medium border border-white/10 shadow-lg flex items-center gap-3">
              <span className="truncate max-w-[200px]">{file.fileName}</span>
              <span className="opacity-60">({(file.size / 1024).toFixed(1)} KB)</span>
              <button
                type="button"
                onClick={handleDownload}
                className="ml-2 p-1 hover:bg-white/20 rounded-full transition-colors"
                title="ダウンロード"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
