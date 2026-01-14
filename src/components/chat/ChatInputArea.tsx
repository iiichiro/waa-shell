import { Plus, Send, X } from 'lucide-react';
import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from 'react';
import { useEffect, useRef } from 'react';

// ファイルとDataURLプレビューをセットで管理する型
export interface SelectedFile {
  file: File;
  preview: string; // DataURL (Base64)
}

interface ChatInputAreaProps {
  inputText: string;
  handleSend: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  handleRemoveFile: (index: number) => void;
  selectedFiles: SelectedFile[];
  isLauncher: boolean;
  placeholderText: string;
  sendMutation: { isPending: boolean };
  sendShortcut: 'enter' | 'ctrl-enter';
  handleInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  handlePaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  handleWindowClose?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  selectedModel?: { isEnabled: boolean };
}

export function ChatInputArea({
  inputText,
  handleSend,

  fileInputRef,
  handleFileSelect,
  handleRemoveFile,
  selectedFiles,
  isLauncher,
  placeholderText,
  sendMutation,
  sendShortcut,
  handleInputChange,
  handlePaste,
  handleWindowClose,
  textareaRef: externalRef,
  selectedModel,
}: ChatInputAreaProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  // 外部からのrefがあればそれを使い、なければ内部refを使う
  const textareaRef = externalRef || internalRef;

  // テキストエリアの高さ自動調整
  useEffect(() => {
    // inputTextの変更を検知して高さを再計算する (Linter対策として明示的に参照)
    if (textareaRef.current && inputText !== undefined) {
      textareaRef.current.style.height = 'auto'; // 一旦リセット
      const scrollHeight = textareaRef.current.scrollHeight;
      // ランチャーモードかつ履歴なし時はウィンドウサイズに合わせるため制限を緩くするが
      // ここでは見た目の高さ調整のみ行う (ウィンドウ最大300px - ヘッダー等80px = 220px)
      const maxHeight = isLauncher ? 220 : 240;
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [inputText, isLauncher, textareaRef]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      if (handleWindowClose) {
        handleWindowClose();
        return;
      }
    }
    if (e.key === 'Enter') {
      if (sendShortcut === 'enter') {
        if (!e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      } else {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleSend();
        }
      }
    }
  };

  return (
    <div
      className={`flex items-end gap-1.5 w-full bg-background/60 backdrop-blur-lg rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-primary/50 transition-all shadow-sm border ${selectedFiles.length > 0 ? 'rounded-t-none border-t-0' : ''}`}
    >
      <input
        type="file"
        multiple
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileSelect}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* ファイルプレビュー */}
        {selectedFiles.length > 0 && (
          <div className="flex gap-2 p-2 overflow-x-auto custom-scrollbar">
            {selectedFiles.map((sf, index) => (
              <div key={`${sf.file.name}-${index}`} className="relative group shrink-0">
                <div className="w-16 h-16 rounded-lg bg-muted border flex items-center justify-center overflow-hidden">
                  {sf.file.type.startsWith('image/') ? (
                    <img
                      src={sf.preview}
                      alt={sf.file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground p-1 text-center break-all">
                      {sf.file.name.split('.').pop()}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  className="absolute -top-1 -right-1 bg-destructive rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                >
                  <X className="w-3 h-3 text-destructive-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end w-full">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-muted-foreground transition-all hover:text-foreground shrink-0 cursor-pointer"
            title="ファイルを添付"
          >
            <Plus className="w-5 h-5" />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none py-2 px-2 placeholder:text-muted-foreground/50 text-sm min-w-0 resize-none [scrollbar-width:none] focus:ring-0 leading-normal text-foreground"
            placeholder={placeholderText}
            value={inputText}
            onChange={handleInputChange}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
          />

          <button
            type="button"
            onClick={() => handleSend()}
            disabled={
              (!inputText.trim() && selectedFiles.length === 0) ||
              sendMutation.isPending ||
              (selectedModel !== undefined && !selectedModel.isEnabled)
            }
            className={`m-1.5 p-1.5 transition-all rounded-md shrink-0 ${
              (!inputText.trim() && selectedFiles.length === 0) ||
              sendMutation.isPending ||
              (selectedModel !== undefined && !selectedModel.isEnabled)
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-primary/20 active:scale-95'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
