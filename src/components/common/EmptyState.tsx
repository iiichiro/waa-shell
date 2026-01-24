import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}

/**
 * 設定画面などでデータが空の場合に使用する共通コンポーネント
 */
export function EmptyState({ icon: Icon, title, description, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 text-center text-muted-foreground bg-muted/5 border border-dashed border-border rounded-lg animate-in fade-in duration-300 ${className}`}
    >
      {Icon && <Icon className="w-10 h-10 mb-4 opacity-20" />}
      <h4 className="text-sm font-semibold text-foreground/80">{title}</h4>
      {description && (
        <p className="text-xs mt-1.5 opacity-60 max-w-[240px] leading-relaxed">{description}</p>
      )}
    </div>
  );
}
