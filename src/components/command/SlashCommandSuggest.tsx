import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { SlashCommand } from '../../lib/db';
import { listSlashCommands } from '../../lib/services/TemplateService';

/**
 * 入力補完用のスラッシュコマンドサジェスト表示（DB連携版）
 */
interface Props {
  query: string; // '/' 以降の検索文字列
  onSelect: (command: SlashCommand) => void; // 選択時のコールバック
  onClose: () => void; // 閉じる際のコールバック
}

export function SlashCommandSuggest({ query, onSelect, onClose }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // DBからコマンド一覧を取得
  const { data: commands = [] } = useQuery({
    queryKey: ['slashCommands'],
    queryFn: listSlashCommands,
  });

  // クエリに基づいてフィルタリング
  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.key.toLowerCase().includes(query.toLowerCase()) ||
      cmd.label.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredCommands.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(filteredCommands[selectedIndex]);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, selectedIndex, onSelect, onClose]);

  if (filteredCommands.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 bg-background/95 backdrop-blur-md border rounded-xl shadow-2xl overflow-hidden z-[100] animate-in fade-in slide-in-from-bottom-2">
      <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">
        コマンド
      </div>
      <div className="max-h-64 overflow-y-auto p-1 text-left">
        {filteredCommands.map((cmd, index) => (
          <button
            key={cmd.id || cmd.key}
            type="button"
            onClick={() => onSelect(cmd)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-colors ${
              index === selectedIndex
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium text-primary">
                /{cmd.key} ({cmd.label})
              </span>
              <span className="text-[10px] opacity-70 truncate">{cmd.description}</span>
            </div>
            {index === selectedIndex && (
              <span className="text-[10px] font-mono bg-primary/20 px-1 rounded shrink-0">
                Enter
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
