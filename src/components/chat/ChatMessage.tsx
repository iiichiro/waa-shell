import {
  AlertCircle,
  Bot,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit2,
  Plus,
  RefreshCw,
  User,
} from 'lucide-react';
import { useState } from 'react';
import type { Message } from '../../lib/db';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  isThinking?: boolean;
  onCopy: (content: string) => void;
  onEdit?: (messageId: number, content: string, type: 'save' | 'regenerate' | 'branch') => void;
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

  const isError = message.model === 'system';

  const handleEditSave = (type: 'save' | 'regenerate' | 'branch') => {
    if (message.id && editContent.trim()) {
      onEdit?.(message.id, editContent, type);
      setIsEditing(false);
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
            ? 'bg-sidebar border'
            : isError
              ? 'bg-red-500/20 border border-red-500/30 text-red-600 dark:text-red-400'
              : 'bg-primary/20 text-primary'
        }`}
      >
        {message.role === 'user' ? (
          <User className="w-4 h-4 text-sidebar-foreground" />
        ) : isError ? (
          <AlertCircle className="w-4 h-4" />
        ) : (
          <Bot className="w-4 h-4" />
        )}
      </div>

      {/* コンテンツエリア */}
      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`font-bold text-xs px-1 uppercase tracking-tight ${isError ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}
          >
            {message.role === 'user'
              ? 'あなた'
              : isError
                ? 'システムエラー'
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
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/5 rounded-lg transition-colors"
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
          ) : (
            <div
              className={`text-foreground inline-block text-left max-w-full w-full transition-all space-y-2 ${
                message.role === 'assistant'
                  ? isError
                    ? 'bg-red-500/10 p-3 rounded-xl rounded-tl-none border border-red-500/20 shadow-sm w-full text-red-600 dark:text-red-200'
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
                  {message.reasoningSummary && (
                    <details className="mb-2 group/reasoning border-l-2 border-primary/30 pl-3">
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground list-none flex items-center gap-1 select-none">
                        <span className="opacity-70 group-open/reasoning:rotate-90 transition-transform text-[10px]">
                          ▶
                        </span>
                        <span>思考プロセス（要約）</span>
                      </summary>
                      <div className="mt-2 text-sm text-foreground/80 leading-relaxed bg-black/5 dark:bg-white/5 p-3 rounded-md">
                        <MarkdownRenderer content={message.reasoningSummary} />
                      </div>
                    </details>
                  )}
                  <MarkdownRenderer
                    content={typeof message.content === 'string' ? message.content : ''}
                  />
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
    </div>
  );
}
