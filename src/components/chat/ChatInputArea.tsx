import { Plus, Send, X } from 'lucide-react';
import type { SelectedFile } from '../../hooks/useChatInput';

interface ChatInputAreaProps {
  inputText: string;
  handleSend: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRemoveFile: (index: number) => void;
  selectedFiles: SelectedFile[];
  placeholderText: string;
  isPending: boolean;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  isModelEnabled?: boolean;
}

export function ChatInputArea({
  inputText,
  handleSend,
  fileInputRef,
  handleFileSelect,
  handleRemoveFile,
  selectedFiles,
  placeholderText,
  isPending,
  handleInputChange,
  handlePaste,
  handleKeyDown,
  textareaRef,
  isModelEnabled = true,
}: ChatInputAreaProps) {
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
            // biome-ignore lint/a11y/noAutofocus: just focus on chat input
            autoFocus
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={
              (!inputText.trim() && selectedFiles.length === 0) || isPending || !isModelEnabled
            }
            className={`m-1.5 p-1.5 transition-all rounded-md shrink-0 ${
              (!inputText.trim() && selectedFiles.length === 0) || isPending || !isModelEnabled
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
