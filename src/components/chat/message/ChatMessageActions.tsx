import { Copy, Edit2, Plus, RefreshCw } from 'lucide-react';
import type { Message } from '../../../lib/db';

interface ChatMessageActionsProps {
  message: Message;
  isModelEnabled: boolean;
  onCopy: (content: string) => void;
  onRegenerate?: (messageId: number, type: 'regenerate' | 'branch') => void;
  onEdit?: () => void;
}

export function ChatMessageActions({
  message,
  isModelEnabled,
  onCopy,
  onRegenerate,
  onEdit,
}: ChatMessageActionsProps) {
  const isError = message.model === 'system';

  const actionButtonClass = (enabled: boolean) =>
    `p-1.5 rounded-md transition-colors ${
      enabled
        ? 'hover:bg-muted text-muted-foreground hover:text-foreground'
        : 'text-muted-foreground/30 cursor-not-allowed'
    }`;

  return (
    <div className="flex items-center gap-1 mt-1">
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
            className={actionButtonClass(isModelEnabled)}
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
            className={actionButtonClass(isModelEnabled)}
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
          onClick={onEdit}
          disabled={!isModelEnabled}
          className={actionButtonClass(isModelEnabled)}
          title={isModelEnabled ? '編集' : '選択中のモデルが無効なため編集できません'}
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
