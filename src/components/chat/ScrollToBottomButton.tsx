import { ArrowDown } from 'lucide-react';

interface ScrollToBottomButtonProps {
  show: boolean;
  onClick: () => void;
  hasNewMessage?: boolean;
}

export function ScrollToBottomButton({ show, onClick, hasNewMessage }: ScrollToBottomButtonProps) {
  if (!show) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute bottom-full mb-4 right-4 md:right-8 z-30 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg border backdrop-blur-sm transition-all animate-in fade-in !opacity-30 hover:!opacity-100 slide-in-from-bottom-2 ${
        hasNewMessage
          ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
          : 'bg-background/80 text-muted-foreground border-border hover:bg-muted'
      }`}
    >
      <ArrowDown className="w-4 h-4" />
      {hasNewMessage && <span className="text-xs font-bold">新しいメッセージ</span>}
    </button>
  );
}
