import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Save, Search, Trash2, X, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SlashCommand } from '../../lib/db';
import {
  deleteSlashCommand,
  extractVariables,
  listSlashCommands,
  upsertSlashCommand,
} from '../../lib/services/TemplateService';
import { useAppStore } from '../../store/useAppStore';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { CommonHeader } from '../layout/CommonHeader';

/**
 * スラッシュコマンド（プロンプトテンプレート）の管理画面
 */
export function CommandManager() {
  const queryClient = useQueryClient();
  const [editingCommand, setEditingCommand] = useState<Partial<SlashCommand> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Confirm/Alert State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    showCancel?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showConfirm = (opts: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }) => {
    setConfirmState({
      isOpen: true,
      showCancel: true,
      ...opts,
    });
  };

  // コマンド一覧の取得
  const { data: commands = [] } = useQuery({
    queryKey: ['slashCommands'],
    queryFn: listSlashCommands,
  });

  // 保存ミューテーション
  const saveMutation = useMutation({
    mutationFn: (cmd: Omit<SlashCommand, 'id' | 'createdAt' | 'updatedAt'>) =>
      upsertSlashCommand(cmd),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slashCommands'] });
      setEditingCommand(null);
    },
  });

  // 削除ミューテーション
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSlashCommand(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slashCommands'] });
    },
  });

  // 新規作成開始
  const handleCreate = () => {
    setEditingCommand({
      key: '',
      label: '',
      description: '',
      content: '',
      variables: [],
    });
  };

  // 編集内容の更新
  const updateEditing = (updates: Partial<SlashCommand>) => {
    if (!editingCommand) return;
    const next = { ...editingCommand, ...updates };

    // コンテンツが変更された場合、変数を自動抽出してメタデータを同期する
    if (updates.content !== undefined) {
      const detected = extractVariables(updates.content);
      const currentVars = next.variables || [];

      // 新しく見つかった変数を追加、消えたものは（一旦保持するか消すか検討が必要だが）同期
      next.variables = detected.map((name) => {
        const existing = currentVars.find((v) => v.name === name);
        return existing || { name, label: name, description: '', defaultValue: '' };
      });
    }

    setEditingCommand(next);
  };

  const handleSave = () => {
    if (!editingCommand?.key || !editingCommand?.content) return;
    saveMutation.mutate(editingCommand as Omit<SlashCommand, 'id' | 'createdAt' | 'updatedAt'>);
  };

  const { isLauncher } = useAppStore();

  const filteredCommands = useMemo(() => {
    if (!searchQuery) return commands;
    const lower = searchQuery.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.key.toLowerCase().includes(lower) ||
        cmd.label.toLowerCase().includes(lower) ||
        cmd.description.toLowerCase().includes(lower),
    );
  }, [commands, searchQuery]);

  return (
    <div
      className="flex-1 flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-300"
      data-testid="header-command-manager"
    >
      <CommonHeader
        title="コマンド管理"
        icon={Zap}
        onClose={() => useAppStore.getState().setCommandManagerOpen(false)}
      >
        <button
          type="button"
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-all text-sm font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>新規作成</span>
        </button>
      </CommonHeader>

      <div className={`flex-1 flex flex-col overflow-hidden ${isLauncher ? 'p-3' : 'p-6'}`}>
        {/* 検索バー */}
        <div className="mb-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="コマンドを検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 w-full bg-background border rounded-md text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* コマンド一覧テーブル */}
        <div className="flex-1 overflow-y-auto border rounded-md bg-muted/20 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-foreground/5 sticky top-0 z-10 backdrop-blur-md">
              <tr>
                <th className="p-3 text-xs font-bold text-muted-foreground uppercase">コマンド</th>
                <th className="p-3 text-xs font-bold text-muted-foreground uppercase">表示名</th>
                <th className="p-3 text-xs font-bold text-muted-foreground uppercase">説明</th>
                <th className="p-3 text-xs font-bold text-muted-foreground uppercase w-28 text-center">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCommands.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    コマンドが見つかりません
                  </td>
                </tr>
              ) : (
                filteredCommands.map((cmd) => (
                  <tr key={cmd.id} className="hover:bg-muted/50 transition-colors group">
                    <td className="p-3">
                      <span className="font-mono text-primary font-bold">/{cmd.key}</span>
                    </td>
                    <td className="p-3">
                      <span className="font-medium text-foreground">{cmd.label}</span>
                    </td>
                    <td className="p-3">
                      <span className="text-sm text-muted-foreground line-clamp-1">
                        {cmd.description}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => setEditingCommand(cmd)}
                          className="p-1.5 hover:bg-accent rounded-md text-muted-foreground transition-colors"
                          title="編集"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            showConfirm({
                              title: 'コマンドの削除',
                              message: 'このコマンドを削除しますか？',
                              confirmText: '削除',
                              isDestructive: true,
                              onConfirm: () => {
                                if (cmd.id) deleteMutation.mutate(cmd.id);
                              },
                            });
                          }}
                          className="p-1.5 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 編集モーダル */}
      {editingCommand &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="w-full max-w-2xl bg-background border rounded-lg shadow-xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
              <header className="flex items-center justify-between p-4 border-b bg-muted/20">
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  {editingCommand.id ? 'コマンドを編集' : '新規コマンド作成'}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingCommand(null)}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </header>

              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="cmd-key"
                      className="text-xs font-semibold text-muted-foreground"
                    >
                      コマンドキー
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        /
                      </span>
                      <input
                        id="cmd-key"
                        className="w-full bg-background border rounded-md pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="summary"
                        value={editingCommand.key}
                        onChange={(e) => updateEditing({ key: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="cmd-label"
                      className="text-xs font-semibold text-muted-foreground"
                    >
                      表示名
                    </label>
                    <input
                      id="cmd-label"
                      className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="要約"
                      value={editingCommand.label}
                      onChange={(e) => updateEditing({ label: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="cmd-desc" className="text-xs font-semibold text-muted-foreground">
                    説明
                  </label>
                  <input
                    id="cmd-desc"
                    className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="プロンプトの用途を簡潔に"
                    value={editingCommand.description}
                    onChange={(e) => updateEditing({ description: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="cmd-content"
                    className="text-xs font-semibold text-muted-foreground truncate block"
                  >
                    テンプレート内容 (変数: {'{{name}}'})
                  </label>
                  <textarea
                    id="cmd-content"
                    rows={8}
                    className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
                    placeholder="以下の内容を要約して：\n\n{{text}}"
                    value={editingCommand.content}
                    onChange={(e) => updateEditing({ content: e.target.value })}
                  />
                </div>

                {editingCommand.variables && editingCommand.variables.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">
                      変数の設定
                    </span>
                    {editingCommand.variables.map((v, i) => (
                      <div key={v.name} className="p-3 bg-muted/50 rounded-md space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold text-primary opacity-80 decoration-primary underline">
                            {`{{${v.name}}}`}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="bg-background border rounded px-2 py-1 text-[10px] focus:ring-1 focus:ring-ring"
                            placeholder="表示ラベル (例: 対象文)"
                            value={v.label}
                            onChange={(e) => {
                              const nextVars = [...(editingCommand.variables || [])];
                              nextVars[i] = { ...v, label: e.target.value };
                              setEditingCommand({ ...editingCommand, variables: nextVars });
                            }}
                          />
                          <textarea
                            className="bg-background border rounded px-2 py-1 text-[10px] focus:ring-1 focus:ring-ring col-span-2 resize-none"
                            rows={2}
                            placeholder="初期値"
                            value={v.defaultValue}
                            onChange={(e) => {
                              const nextVars = [...(editingCommand.variables || [])];
                              nextVars[i] = { ...v, defaultValue: e.target.value };
                              setEditingCommand({ ...editingCommand, variables: nextVars });
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t flex justify-end gap-3 bg-muted/30 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingCommand(null)}
                  className="px-4 py-2 rounded-md hover:bg-accent text-sm font-medium text-muted-foreground transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!editingCommand.key || !editingCommand.content}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 text-sm font-medium transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>保存する</span>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        isDestructive={confirmState.isDestructive}
        showCancel={confirmState.showCancel}
      />
    </div>
  );
}
