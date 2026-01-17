import { X } from 'lucide-react';
import type { ElementType, ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore';

interface CommonHeaderProps {
  title: string;
  icon?: ElementType;
  onClose?: () => void;
  children?: ReactNode;
  className?: string;
}

export function CommonHeader({
  title,
  icon: Icon,
  onClose,
  children,
  className = '',
}: CommonHeaderProps) {
  const { isLauncher } = useAppStore();

  return (
    <header
      className={`border-b flex items-center justify-between bg-background/80 backdrop-blur-xl shrink-0 sticky top-0 z-20 ${
        isLauncher ? 'h-11 px-3 cursor-move select-none' : 'h-14 px-6'
      } ${className}`}
      data-tauri-drag-region={isLauncher ? 'true' : undefined}
    >
      <div
        className={`flex items-center overflow-x-auto no-scrollbar ${
          isLauncher ? 'gap-2' : 'gap-4'
        } cursor-default`}
        data-tauri-drag-region={isLauncher ? 'true' : undefined}
      >
        <h2 className="font-bold text-foreground flex items-center gap-2 mr-1 shrink-0">
          {Icon && <Icon className={`${isLauncher ? 'w-4 h-4' : 'w-5 h-5'} text-primary`} />}
          <span className={isLauncher ? 'text-xs' : ''}>{title}</span>
        </h2>

        {children}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className={`hover:bg-accent rounded-md text-muted-foreground transition-colors ${
            isLauncher ? 'p-1.5 ml-1' : 'p-2 ml-4'
          }`}
          title="閉じる"
          data-testid="close-button"
        >
          <X className={isLauncher ? 'w-4 h-4' : 'w-5 h-5'} />
        </button>
      )}
    </header>
  );
}
