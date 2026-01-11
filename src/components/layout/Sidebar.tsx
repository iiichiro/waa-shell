import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare,
  FileCode,
  MessageSquare,
  Plus,
  Settings,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { Thread } from '../../lib/db';
import { listThreads } from '../../lib/db/threads';
import { createThread, deleteMultipleThreads, deleteThread } from '../../lib/services/ChatService';
import { useAppStore } from '../../store/useAppStore';

interface SidebarProps {
  className?: string;
  onClose?: () => void;
}

export function Sidebar({ className = '', onClose }: SidebarProps) {
  const queryClient = useQueryClient();
  const {
    activeThreadId,
    setActiveThreadId,
    isCommandManagerOpen,
    setCommandManagerOpen,
    isSettingsOpen,
    setSettingsOpen,
    isFileExplorerOpen,
    setFileExplorerOpen,
  } = useAppStore();

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<number>>(new Set());

  const { data: threads = [] } = useQuery({
    queryKey: ['threads'],
    queryFn: listThreads,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteThread,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      // 削除されたスレッドがアクティブだった場合のみクリア
      queryClient.invalidateQueries({ queryKey: ['messages'] }); // メッセージもクリア
      if (activeThreadId) {
        setActiveThreadId(null);
      }
    },
  });

  const deleteMultipleMutation = useMutation({
    mutationFn: deleteMultipleThreads,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      setActiveThreadId(null);
      setIsSelectionMode(false);
      setSelectedThreadIds(new Set());
    },
  });

  const createMutation = useMutation({
    mutationFn: () => createThread('新しいチャット'),
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      setActiveThreadId(id);
      setIsSelectionMode(false);
      // モバイルの場合のみ閉じる
      if (window.innerWidth < 768) {
        onClose?.();
      }
    },
  });

  const toggleSelectionMode = () => {
    setIsSelectionMode((prev) => {
      if (prev) setSelectedThreadIds(new Set()); // モード終了時に選択解除
      return !prev;
    });
  };

  const toggleThreadSelection = (id: number) => {
    setSelectedThreadIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedThreadIds.size === threads.length) {
      setSelectedThreadIds(new Set());
    } else {
      const allIds = threads
        .map((t: Thread) => t.id)
        .filter((id): id is number => id !== undefined);
      setSelectedThreadIds(new Set(allIds));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedThreadIds.size === 0) return;
    if (
      confirm(`${selectedThreadIds.size}件のスレッドを削除しますか？\nこの操作は取り消せません。`)
    ) {
      deleteMultipleMutation.mutate(Array.from(selectedThreadIds));
    }
  };

  const handleThreadClick = (id: number) => {
    setActiveThreadId(id);
    // モバイルの場合のみ閉じる
    if (window.innerWidth < 768) {
      onClose?.();
    }
  };

  return (
    <aside
      className={`w-64 h-full bg-sidebar text-sidebar-foreground border-r border-border flex flex-col shrink-0 ${className}`}
    >
      <div className="p-4 space-y-2">
        <div className="p-4 space-y-2">
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            className="w-full py-2 px-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md flex items-center justify-center gap-2 transition-all shadow-sm text-sm font-medium"
            data-testid="new-chat-button"
          >
            <Plus className="w-4 h-4" />
            <span>新しいチャット</span>
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 space-y-1">
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            最近の会話
          </span>
          <button
            type="button"
            onClick={toggleSelectionMode}
            className={`p-1 rounded hover:bg-accent transition-colors ${
              isSelectionMode ? 'text-primary' : 'text-muted-foreground'
            }`}
            title={isSelectionMode ? '選択モード終了' : 'スレッドを選択'}
          >
            {isSelectionMode ? (
              <X className="w-3.5 h-3.5" />
            ) : (
              <CheckSquare className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {isSelectionMode && threads.length > 0 && (
          <div className="px-3 py-1 flex items-center justify-between text-xs text-muted-foreground mb-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="hover:text-text-primary flex items-center gap-1.5"
            >
              {selectedThreadIds.size === threads.length ? (
                <>
                  <CheckSquare className="w-3 h-3" /> 全選択解除
                </>
              ) : (
                <>
                  <Square className="w-3 h-3" /> 全て選択
                </>
              )}
            </button>
            <span>{selectedThreadIds.size} 件選択中</span>
          </div>
        )}

        {threads.map((thread: Thread) => (
          <div
            key={thread.id}
            className={`group flex items-center gap-1 rounded-lg transition-colors ${
              activeThreadId === thread.id && !isSelectionMode
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/50'
            }`}
          >
            {isSelectionMode ? (
              <button
                type="button"
                className="pl-3 py-3 cursor-pointer flex-1 flex items-center gap-3 w-full text-left"
                onClick={() => thread.id && toggleThreadSelection(thread.id)}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    thread.id && selectedThreadIds.has(thread.id)
                      ? 'bg-brand-primary border-brand-primary text-white'
                      : 'border-white/20 bg-transparent'
                  }`}
                >
                  {thread.id && selectedThreadIds.has(thread.id) && (
                    <span className="text-[10px] font-bold">✓</span>
                  )}
                </div>
                <span className="truncate text-sm text-text-secondary select-none">
                  {thread.title}
                </span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => thread.id && handleThreadClick(thread.id)}
                  className="flex-1 px-3 py-2 text-sm text-left flex items-center gap-3 overflow-hidden"
                >
                  <MessageSquare
                    className={`w-4 h-4 shrink-0 ${
                      activeThreadId === thread.id ? 'text-primary' : 'text-muted-foreground/60'
                    }`}
                  />
                  <span
                    className={`truncate ${
                      activeThreadId === thread.id
                        ? 'text-accent-foreground font-semibold'
                        : 'text-muted-foreground/80'
                    }`}
                  >
                    {thread.title}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      thread.id &&
                      confirm(
                        'このスレッドを削除しますか？\n関連するメッセージもすべて削除されます。',
                      )
                    ) {
                      deleteMutation.mutate(thread.id);
                    }
                  }}
                  className="p-1.5 mr-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded-md text-text-secondary hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        ))}
      </nav>

      {/* 選択モード時のアクションバー */}
      {isSelectionMode && (
        <div className="p-4 border-t border-border bg-destructive/10 fade-in-up">
          <button
            type="button"
            onClick={handleDeleteSelected}
            disabled={selectedThreadIds.size === 0}
            className="w-full py-2 px-4 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-md flex items-center justify-center gap-2 transition-all font-medium text-sm"
          >
            <Trash2 className="w-4 h-4" />
            <span>選択したスレッドを削除</span>
          </button>
        </div>
      )}

      {/* 通常時のフッターメニュー */}
      {!isSelectionMode && (
        <div className="p-4 mt-auto border-t border-border space-y-1">
          <button
            type="button"
            onClick={() => {
              setCommandManagerOpen(true);
              if (window.innerWidth < 768) {
                onClose?.();
              }
            }}
            className={`w-full px-3 py-2 text-sm text-left rounded-md transition-colors flex items-center gap-3 ${
              isCommandManagerOpen
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/50 text-muted-foreground'
            }`}
            aria-label="コマンド管理"
            data-testid="nav-command-manager"
          >
            <Plus className="w-4 h-4" />
            <span>コマンド管理</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFileExplorerOpen(true);
              if (window.innerWidth < 768) {
                onClose?.();
              }
            }}
            className={`w-full px-3 py-2 text-sm text-left rounded-md transition-colors flex items-center gap-3 ${
              isFileExplorerOpen
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/50 text-muted-foreground'
            }`}
            aria-label="ファイル管理"
            data-testid="nav-file-explorer"
          >
            <FileCode className="w-4 h-4" />
            <span>ファイル管理</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(true);
              if (window.innerWidth < 768) {
                onClose?.();
              }
            }}
            className={`w-full px-3 py-2 text-sm text-left rounded-md transition-colors flex items-center gap-3 ${
              isSettingsOpen
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/50 text-muted-foreground'
            }`}
            aria-label="設定"
            data-testid="nav-settings"
          >
            <Settings className="w-4 h-4" />
            <span>設定</span>
          </button>
        </div>
      )}
    </aside>
  );
}
