import {
  AlertCircle,
  Bot,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit2,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Terminal,
  User,
  Wrench,
  X,
} from 'lucide-react';
import type OpenAI from 'openai';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import type { LocalFile, Message } from '../../lib/db';
import { blobToDataURL } from '../../lib/utils/image';
import { FilePreviewModal } from '../common/FilePreviewModal';
import { MarkdownRenderer } from './MarkdownRenderer';

const formatJson = (jsonStr: string) => {
  try {
    const parsed = JSON.parse(jsonStr);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return jsonStr;
  }
};

/**
 * 画像添付ファイルをDataURLに変換して表示するコンポーネント
 */
function ImageAttachment({ file, onClick }: { file: LocalFile; onClick: () => void }) {
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

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  isThinking?: boolean;
  attachments?: LocalFile[]; // メッセージに関連する添付ファイル
  onCopy: (content: string) => void;
  onEdit?: (
    messageId: number,
    content: string,
    type: 'save' | 'regenerate' | 'branch',
    removedFileIds?: number[],
    newFiles?: File[],
  ) => void;
  onRegenerate?: (messageId: number, type: 'regenerate' | 'branch') => void;
  branchInfo?: {
    current: number;
    total: number;
    onSwitch: (index: number) => void;
  };
  isModelEnabled?: boolean;
}

export function ChatMessage({
  message,
  isStreaming = false,
  isThinking = false,
  attachments,
  onCopy,
  onEdit,
  onRegenerate,
  branchInfo,
  isModelEnabled = true,
}: ChatMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(
    typeof message.content === 'string' ? message.content : '',
  );
  const [removedFileIds, setRemovedFileIds] = useState<number[]>([]);
  const [newFiles, setNewFiles] = useState<{ file: File; preview: string }[]>([]);
  const [previewFile, setPreviewFile] = useState<LocalFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setRemovedFileIds([]);
      setNewFiles([]);
    }
  }, [isEditing]);

  const isError = message.model === 'system';

  const handleEditSave = (type: 'save' | 'regenerate' | 'branch') => {
    if (message.id && (editContent.trim() || attachments?.length || newFiles.length)) {
      onEdit?.(
        message.id,
        editContent,
        type,
        removedFileIds,
        newFiles.map((f) => f.file),
      );
      setIsEditing(false);
    }
  };

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
    <div
      className={`flex gap-3 md:gap-4 mx-auto w-full group ${isStreaming ? 'animate-pulse' : ''}`}
    >
      {/* アバター */}
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-colors ${
          message.role === 'user'
            ? 'bg-muted border'
            : isError
              ? 'bg-destructive/20 border border-destructive/30 text-destructive'
              : message.role === 'tool'
                ? 'bg-success/20 border border-success/30 text-success'
                : 'bg-primary/20 text-primary'
        }`}
      >
        {message.role === 'user' ? (
          <User className="w-4 h-4 text-sidebar-foreground" />
        ) : isError ? (
          <AlertCircle className="w-4 h-4" />
        ) : message.role === 'tool' ? (
          <Terminal className="w-4 h-4" />
        ) : (
          <Bot className="w-4 h-4" />
        )}
      </div>

      {/* コンテンツエリア */}
      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`font-bold text-xs px-1 uppercase tracking-tight ${isError ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {message.role === 'user'
              ? 'あなた'
              : isError
                ? 'システムエラー'
                : message.role === 'tool'
                  ? 'ツール実行結果'
                  : message.model || 'AI'}
          </span>

          {/* ブランチセレクター */}
          {branchInfo && branchInfo.total > 1 && (
            <div className="flex items-center gap-1 bg-muted border rounded-md px-1 py-0.5 ml-1">
              <button
                type="button"
                onClick={() => branchInfo.onSwitch(branchInfo.current - 1)}
                disabled={branchInfo.current === 1}
                className="p-0.5 hover:bg-background rounded disabled:opacity-20 transition-colors text-foreground"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                {branchInfo.current} / {branchInfo.total}
              </span>
              <button
                type="button"
                onClick={() => branchInfo.onSwitch(branchInfo.current + 1)}
                disabled={branchInfo.current === branchInfo.total}
                className="p-0.5 hover:bg-background rounded disabled:opacity-20 transition-colors text-foreground"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          {isEditing ? (
            <div className="space-y-2 w-full mt-2">
              <textarea
                className="w-full bg-muted border border-primary/30 rounded-xl p-3 text-sm text-foreground outline-none focus:border-primary min-h-[100px] resize-y"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                // biome-ignore lint/a11y/noAutofocus: Autofocus is preferred when entering edit mode
                autoFocus
              />

              {/* 編集時の添付ファイル管理 */}
              <div className="space-y-3">
                {/* 既存のファイル */}
                {attachments &&
                  attachments.filter((f) => f.id !== undefined && !removedFileIds.includes(f.id))
                    .length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {attachments
                        .filter((f) => f.id !== undefined && !removedFileIds.includes(f.id))
                        .map((file) => (
                          <div key={file.id} className="relative group/editfile">
                            <ImageAttachment file={file} onClick={() => setPreviewFile(file)} />
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
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditSave('save')}
                      className="px-3 py-1.5 text-xs border text-foreground rounded-lg hover:bg-muted transition-all font-medium"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditSave('regenerate')}
                      className="px-3 py-1.5 text-xs border border-primary/30 text-foreground rounded-lg hover:bg-primary/10 transition-all font-medium"
                    >
                      保存して再生成（ブランチ無し）
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditSave('branch')}
                      className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-medium"
                    >
                      保存して再生成（新規ブランチ）
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={`text-foreground inline-block text-left max-w-full w-full transition-all space-y-2 ${
                message.role === 'assistant'
                  ? isError
                    ? 'bg-destructive/10 p-3 rounded-xl rounded-tl-none border border-destructive/20 shadow-sm w-full text-destructive'
                    : 'bg-muted p-3 rounded-xl rounded-tl-none border shadow-sm w-full'
                  : 'bg-primary/10 p-2 px-3 rounded-xl rounded-tl-none text-sm border border-primary/10 inline-block'
              } ${message.role === 'user' && typeof message.content === 'string' ? 'whitespace-pre-wrap' : ''}`}
            >
              {isThinking ? (
                <div className="flex space-x-1 h-6 items-center px-1">
                  <div className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce" />
                </div>
              ) : (
                <>
                  {/* 思考プロセス */}
                  {(message.reasoning || message.reasoningSummary) && (
                    <details className="mb-2 group/reasoning border-l-2 border-primary/30 pl-3">
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground list-none flex items-center gap-1 select-none">
                        <span className="opacity-70 group-open/reasoning:rotate-90 transition-transform text-[10px]">
                          ▶
                        </span>
                        <span>思考プロセス{message.reasoningSummary ? '（要約）' : ''}</span>
                      </summary>
                      <div className="mt-2 text-sm text-foreground/80 leading-relaxed bg-foreground/5 p-3 rounded-md overflow-x-auto whitespace-pre-wrap font-sans">
                        <MarkdownRenderer
                          content={message.reasoning || message.reasoningSummary || ''}
                        />
                      </div>
                    </details>
                  )}

                  {/* ツール呼び出し (INPUT) */}
                  {message.tool_calls && message.tool_calls.length > 0 && (
                    <div className="space-y-2 mb-2">
                      {message.tool_calls.map(
                        (tc: OpenAI.Chat.ChatCompletionMessageToolCall, idx: number) => {
                          const fn = 'function' in tc ? tc.function : undefined;
                          if (!fn) return null;
                          return (
                            <details
                              key={`${tc.id}-${idx}`}
                              className="group/tool bg-foreground/5 border border-border/50 rounded-lg overflow-hidden"
                            >
                              <summary className="cursor-pointer p-3 flex items-center justify-between hover:bg-foreground/5 transition-colors select-none list-none">
                                <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                                  <Wrench className="w-3 h-3" />
                                  <span>ツール呼び出し: {fn.name}</span>
                                </div>
                                <span className="text-[10px] opacity-50 group-open/tool:rotate-180 transition-transform">
                                  ▼
                                </span>
                              </summary>
                              <div className="px-3 pb-3">
                                <MarkdownRenderer
                                  content={`\`\`\`json\n${formatJson(fn.arguments)}\n\`\`\``}
                                />
                              </div>
                            </details>
                          );
                        },
                      )}
                    </div>
                  )}

                  {/* メインコンテンツ (OUTPUT for tools or regular message) */}
                  {message.role === 'tool' ? (
                    <details className="group/tool-output bg-success/5 border border-success/30 rounded-lg overflow-hidden mb-2">
                      <summary className="cursor-pointer p-3 flex items-center justify-between hover:bg-success/5 transition-colors select-none list-none text-success">
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <Terminal className="w-3 h-3" />
                          <span>ツール実行結果 (LLMへの入力)</span>
                        </div>
                        <span className="text-[10px] opacity-50 group-open/tool-output:rotate-180 transition-transform">
                          ▼
                        </span>
                      </summary>
                      <div className="px-3 pb-3">
                        <MarkdownRenderer
                          content={
                            typeof message.content === 'string'
                              ? message.content.trim().startsWith('{') ||
                                message.content.trim().startsWith('[')
                                ? `\`\`\`json\n${formatJson(message.content)}\n\`\`\``
                                : message.content
                              : ''
                          }
                        />
                      </div>
                    </details>
                  ) : (
                    <div className="space-y-2">
                      <MarkdownRenderer
                        content={typeof message.content === 'string' ? message.content : ''}
                      />
                      {/* 添付ファイル（画像）の表示 - テキストの下に配置 */}
                      {attachments && attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {attachments
                            .filter((f) => f.mimeType.startsWith('image/'))
                            .map((file) => (
                              <ImageAttachment
                                key={file.id}
                                file={file}
                                onClick={() => setPreviewFile(file)}
                              />
                            ))}
                        </div>
                      )}

                      {/* その他のファイル (画像以外) */}
                      {attachments?.some((f) => !f.mimeType.startsWith('image/')) && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {attachments
                            .filter((f) => !f.mimeType.startsWith('image/'))
                            .map((file) => (
                              <button
                                key={file.id}
                                type="button"
                                onClick={() => setPreviewFile(file)}
                                className="flex items-center gap-2 bg-muted border rounded-lg p-2 text-xs hover:bg-muted/80 transition-colors"
                              >
                                <span className="truncate max-w-[150px]">{file.fileName}</span>
                                <span className="text-muted-foreground">
                                  ({(file.size / 1024).toFixed(1)}KB)
                                </span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* アクションボタン (通常時表示、ホバー時に強調) */}
          {!isEditing && !isStreaming && (
            <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => onCopy(typeof message.content === 'string' ? message.content : '')}
                className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
                title="コピー"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              {!isError && onRegenerate && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => message.id && onRegenerate(message.id, 'regenerate')}
                    disabled={!isModelEnabled}
                    className={`p-1.5 rounded-md transition-colors ${
                      isModelEnabled
                        ? 'hover:bg-muted text-muted-foreground hover:text-foreground'
                        : 'text-muted-foreground/30 cursor-not-allowed'
                    }`}
                    title={
                      isModelEnabled
                        ? '再生成（ブランチ無し）'
                        : '選択中のモデルが無効なため再生成できません'
                    }
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => message.id && onRegenerate(message.id, 'branch')}
                    disabled={!isModelEnabled}
                    className={`p-1.5 rounded-md transition-colors ${
                      isModelEnabled
                        ? 'hover:bg-muted text-muted-foreground hover:text-foreground'
                        : 'text-muted-foreground/30 cursor-not-allowed'
                    }`}
                    title={
                      isModelEnabled
                        ? '再生成（新規ブランチ）'
                        : '選択中のモデルが無効なため再生成できません'
                    }
                  >
                    <div className="relative">
                      <RefreshCw className="w-3.5 h-3.5" />
                      <Plus className="w-2 h-2 absolute -top-1 -right-1 bg-background rounded-full" />
                    </div>
                  </button>
                </div>
              )}
              {message.role === 'user' && onEdit && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  disabled={!isModelEnabled}
                  className={`p-1.5 rounded-md transition-colors ${
                    isModelEnabled
                      ? 'hover:bg-muted text-muted-foreground hover:text-foreground'
                      : 'text-muted-foreground/30 cursor-not-allowed'
                  }`}
                  title={isModelEnabled ? '編集' : '選択中のモデルが無効なため編集できません'}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* プレビューモーダル */}
      {previewFile && <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  );
}
