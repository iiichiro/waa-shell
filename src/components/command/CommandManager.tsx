import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import type { SlashCommand } from '../../lib/db';
import {
  deleteSlashCommand,
  extractVariables,
  listSlashCommands,
  upsertSlashCommand,
} from '../../lib/services/TemplateService';
import { useAppStore } from '../../store/useAppStore';
import { CommonHeader } from '../layout/CommonHeader';

/**
 * スラッシュコマンド（プロンプトテンプレート）の管理画面
 */
export function CommandManager() {
  const queryClient = useQueryClient();
  const [editingCommand, setEditingCommand] = useState<Partial<SlashCommand> | null>(null);

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

      <div className={`flex-1 overflow-y-auto ${isLauncher ? 'p-3' : 'p-6'}`}>
        <div
          className={`max-w-4xl mx-auto grid gap-6 ${isLauncher ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}
        >
          {/* コマンド一覧 */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              登録済みコマンド
            </h3>
            {commands.length === 0 && (
              <div className="p-8 border border-dashed rounded-lg text-center text-muted-foreground text-sm bg-muted/20">
                コマンドが登録されていません
              </div>
            )}
            <div className="space-y-2">
              {commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="p-4 bg-muted/30 rounded-md border hover:border-primary/20 transition-all group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-primary font-mono text-sm font-bold">/{cmd.key}</span>
                      <h4 className="text-sm font-semibold text-foreground mt-1">{cmd.label}</h4>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => setEditingCommand(cmd)}
                        className="p-1.5 hover:bg-accent rounded-md text-muted-foreground transition-colors"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => cmd.id && deleteMutation.mutate(cmd.id)}
                        className="p-1.5 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{cmd.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 編集フォーム */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              {editingCommand?.id ? 'コマンドを編集' : '新規コマンド作成'}
            </h3>

            {editingCommand ? (
              <div
                className={`bg-background rounded-lg border border-primary/20 space-y-4 animate-in fade-in slide-in-from-right-4 shadow-lg sticky ${isLauncher ? 'p-4 top-0' : 'p-6 top-20'}`}
              >
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
                    rows={5}
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

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingCommand(null)}
                    className="flex-1 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!editingCommand.key || !editingCommand.content}
                    className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>保存する</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-64 border border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground text-sm space-y-2 bg-muted/10">
                <p>コマンドを選択して編集するか</p>
                <p>新しいコマンドを作成してください</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
