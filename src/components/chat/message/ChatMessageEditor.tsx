import { Image as ImageIcon, X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useRef } from 'react';
import type { LocalFile } from '../../../lib/db';
import { ImageAttachment } from './ImageAttachment';

interface ChatMessageEditorProps {
  content: string;
  setContent: (content: string) => void;
  attachments?: LocalFile[];
  removedFileIds: number[];
  setRemovedFileIds: React.Dispatch<React.SetStateAction<number[]>>;
  newFiles: { file: File; preview: string }[];
  setNewFiles: React.Dispatch<React.SetStateAction<{ file: File; preview: string }[]>>;
  onSave: (type: 'save' | 'regenerate' | 'branch') => void;
  onCancel: () => void;
  onPreviewFile: (file: LocalFile) => void;
  blobToDataURL: (blob: Blob) => Promise<string>;
}

export function ChatMessageEditor({
  content,
  setContent,
  attachments,
  removedFileIds,
  setRemovedFileIds,
  newFiles,
  setNewFiles,
  onSave,
  onCancel,
  onPreviewFile,
  blobToDataURL,
}: ChatMessageEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const added: { file: File; preview: string }[] = [];
      for (const file of Array.from(e.target.files)) {
        const preview = await blobToDataURL(file);
        added.push({ file, preview });
      }
      setNewFiles((prev) => [...prev, ...added]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2 w-full mt-2">
      <textarea
        className="w-full bg-muted border border-primary/30 rounded-xl p-3 text-sm text-foreground outline-none focus:border-primary min-h-[100px] resize-y"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        // biome-ignore lint/a11y/noAutofocus: Autofocus is preferred when entering edit mode
        autoFocus
      />

      {/* 編集時の添付ファイル管理 */}
      <div className="space-y-3">
        {/* 既存のファイル */}
        {attachments &&
          attachments.filter((f) => f.id !== undefined && !removedFileIds.includes(f.id)).length >
            0 && (
            <div className="flex flex-wrap gap-2">
              {attachments
                .filter((f) => f.id !== undefined && !removedFileIds.includes(f.id))
                .map((file) => (
                  <div key={file.id} className="relative group/editfile">
                    <ImageAttachment file={file} onClick={() => onPreviewFile(file)} />
                    <button
                      type="button"
                      onClick={() => {
                        if (file.id !== undefined) {
                          setRemovedFileIds((prev) => [...prev, file.id as number]);
                        }
                      }}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-lg opacity-0 group-hover/editfile:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
            </div>
          )}

        {/* 新規追加予定のファイル */}
        {newFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {newFiles.map((nf, idx) => (
              <div key={`${nf.file.name}-${idx}`} className="relative group/newfile">
                <img
                  src={nf.preview}
                  alt="New preview"
                  className="w-20 h-20 object-cover rounded-lg border shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setNewFiles((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-lg opacity-0 group-hover/newfile:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-foreground/5 rounded-lg transition-colors border border-dashed border-muted-foreground/30"
          >
            <ImageIcon className="w-4 h-4" />
            画像を追記
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
            accept="image/*"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => onSave('save')}
              className="px-3 py-1.5 text-xs border text-foreground rounded-lg hover:bg-muted transition-all font-medium"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => onSave('regenerate')}
              className="px-3 py-1.5 text-xs border border-primary/30 text-foreground rounded-lg hover:bg-primary/10 transition-all font-medium"
            >
              保存して再生成（ブランチ無し）
            </button>
            <button
              type="button"
              onClick={() => onSave('branch')}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-medium"
            >
              保存して再生成（新規ブランチ）
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
