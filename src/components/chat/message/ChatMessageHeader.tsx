import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Message } from '../../../lib/db';

interface ChatMessageHeaderProps {
  message: Message;
  branchInfo?: {
    current: number;
    total: number;
    onSwitch: (index: number) => void;
  };
}

export function ChatMessageHeader({ message, branchInfo }: ChatMessageHeaderProps) {
  const isError = message.model === 'system';

  return (
    <div className="flex items-center gap-2">
      <span
        className={`font-bold text-xs px-1 uppercase tracking-tight ${
          isError ? 'text-destructive' : 'text-muted-foreground'
        }`}
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
  );
}
