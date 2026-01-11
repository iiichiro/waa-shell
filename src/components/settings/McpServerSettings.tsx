import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Network, Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { db, type McpServer } from '../../lib/db';
import { disconnectServer } from '../../lib/services/McpService';

export function McpServerSettings() {
  const queryClient = useQueryClient();
  const [editingServer, setEditingServer] = useState<
    (Omit<McpServer, 'createdAt' | 'updatedAt'> & { id?: number }) | null
  >(null);

  // サーバー一覧取得
  const { data: servers = [] } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: () => db.mcpServers.toArray(),
  });

  // 保存（作成/更新）
  const saveMutation = useMutation({
    mutationFn: async (server: Omit<McpServer, 'createdAt' | 'updatedAt'>) => {
      // 更新の場合は既存の接続を切断
      if (server.id) {
        await disconnectServer(server.id);
      }

      if (server.id) {
        await db.mcpServers.update(server.id, {
          ...server,
          updatedAt: new Date(),
        });
      } else {
        await db.mcpServers.add({
          ...server,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as McpServer);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      setEditingServer(null);
    },
  });

  // 削除
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await disconnectServer(id);
      await db.mcpServers.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
    },
  });

  const handleCreateNew = () => {
    setEditingServer({
      name: '',
      type: 'sse', // 現在はSSE (HTTP) を推奨
      url: 'http://localhost:8000/sse',
      authType: 'none',
      isActive: true,
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* サーバー一覧 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            MCP サーバー一覧
          </h3>
          <button
            type="button"
            onClick={handleCreateNew}
            className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent rounded-md text-xs font-semibold transition-all border border-border"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新規追加</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {servers.map((s) => (
            <div
              key={s.id}
              className={`p-4 rounded-md border transition-all flex items-center justify-between group ${
                s.isActive
                  ? 'bg-primary/5 border-primary/30'
                  : 'bg-muted/30 hover:border-primary/20'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-md flex items-center justify-center ${
                    s.isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Network className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-foreground flex items-center gap-2">
                    {s.name}
                    {s.isActive && (
                      <span className="px-1.5 py-0.5 rounded-full bg-primary text-[10px] text-primary-foreground font-bold uppercase tracking-tighter">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate max-w-md">
                    {s.type === 'sse' ? s.url : `stdio: ${s.command} ${s.args?.join(' ')}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => setEditingServer(s)}
                  className="px-3 py-1.5 rounded-md hover:bg-accent text-xs text-muted-foreground transition-colors"
                >
                  編集
                </button>
                {!s.isActive && (
                  <button
                    type="button"
                    onClick={() => s.id && deleteMutation.mutate(s.id)}
                    className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {servers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm bg-muted/20 rounded-md border border-dashed">
              設定されている MCP サーバーはありません
            </div>
          )}
        </div>
      </section>

      {/* 編集フォーム */}
      {editingServer && (
        <div className="p-6 bg-background rounded-lg border border-primary/20 space-y-4 animate-in fade-in slide-in-from-bottom-4 shadow-lg">
          <h4 className="font-bold text-foreground flex items-center gap-2 mb-4">
            {editingServer.id ? 'サーバーを編集' : '新しいサーバーを追加'}
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="s-name" className="text-xs font-semibold text-muted-foreground">
                表示名
              </label>
              <input
                id="s-name"
                className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="My Server"
                value={editingServer.name}
                onChange={(e) => setEditingServer({ ...editingServer, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="s-active" className="text-xs font-semibold text-muted-foreground">
                状態
              </label>
              <div className="flex items-center h-[38px]">
                <button
                  type="button"
                  onClick={() =>
                    setEditingServer({
                      ...editingServer,
                      isActive: !editingServer.isActive,
                    })
                  }
                  className={`px-4 py-1 rounded-full text-[10px] font-bold uppercase transition-all ${
                    editingServer.isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {editingServer.isActive ? 'アクティブ' : '非アクティブ'}
                </button>
              </div>
            </div>
          </div>

          {/* Type Selection (Currently only SSE supported effectively for browser/tauri hybrid securely via nice UI, but schema supports stdio) */}
          <div className="space-y-1.5">
            <label htmlFor="s-type" className="text-xs font-semibold text-muted-foreground">
              接続タイプ
            </label>
            <select
              id="s-type"
              className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={editingServer.type}
              onChange={(e) =>
                setEditingServer({ ...editingServer, type: e.target.value as 'sse' | 'stdio' })
              }
            >
              <option value="sse">SSE (Server-Sent Events) over HTTP</option>
              {/* <option value="stdio">Stdio (Local Process) - Not fully supported in UI yet</option> */}
            </select>
          </div>

          {editingServer.type === 'sse' && (
            <div className="space-y-1.5">
              <label htmlFor="s-url" className="text-xs font-semibold text-muted-foreground">
                SSE エンドポイント URL
              </label>
              <input
                id="s-url"
                className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="http://localhost:8000/sse"
                value={editingServer.url || ''}
                onChange={(e) => setEditingServer({ ...editingServer, url: e.target.value })}
              />
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-border">
            <button
              type="button"
              onClick={() => setEditingServer(null)}
              className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => editingServer && saveMutation.mutate(editingServer)}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-md disabled:opacity-50"
            >
              {saveMutation.isPending ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/20 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>設定を保存</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
