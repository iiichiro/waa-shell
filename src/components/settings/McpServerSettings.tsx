import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Network,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCw,
  Save,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { db, type McpServer } from '../../lib/db';
import {
  disconnectServer,
  getAllServerStatuses,
  getMcpToolsByServerId,
  getServerStatus,
  testMcpConfig,
} from '../../lib/services/McpService';
import { useAppStore } from '../../store/useAppStore';
import { EmptyState } from '../common/EmptyState';
import { Modal } from '../common/Modal';
import { Switch } from '../common/Switch';

export function McpServerSettings() {
  const queryClient = useQueryClient();

  // 編集・新規作成用ステート
  const [editingServer, setEditingServer] = useState<
    (Omit<McpServer, 'createdAt' | 'updatedAt'> & { id?: number }) | null
  >(null);

  // ツール管理用ステート
  const [managingToolsServerId, setManagingToolsServerId] = useState<number | null>(null);

  // 接続ステータス管理 (McpService のキャッシュを反映するためのローカルコピー)
  const [connectionStatuses, setConnectionStatuses] = useState<
    Record<number, 'success' | 'error' | 'none'>
  >(getAllServerStatuses());

  // サーバ一覧取得
  const { data: servers = [] } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: () => db.mcpServers.toArray(),
  });

  // 自動ステータス更新
  useEffect(() => {
    let isMounted = true;
    const checkStatuses = async () => {
      const activeServers = servers.filter((s) => s.isActive && s.id);
      for (const server of activeServers) {
        if (!isMounted) break;
        if (server.id) {
          const status = await getServerStatus(server.id);
          if (isMounted) {
            setConnectionStatuses((prev) => {
              if (prev[server.id as number] === status) return prev;
              return { ...prev, [server.id as number]: status };
            });
          }
        }
      }
    };

    checkStatuses();
    const interval = setInterval(checkStatuses, 30000); // 30秒ごとにチェック
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [servers]);

  // 保存（作成/更新）
  const saveMutation = useMutation({
    mutationFn: async (server: Omit<McpServer, 'createdAt' | 'updatedAt'>) => {
      // バリデーション
      if (!server.name.trim() || !server.url.trim()) {
        throw new Error('サーバ名とURLは必須です');
      }

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
    onError: (error) => {
      alert(error instanceof Error ? error.message : '保存に失敗しました');
    },
  });

  // 削除
  const { removeToolsByServerName } = useAppStore();
  const deleteMutation = useMutation({
    mutationFn: async (server: McpServer) => {
      if (server.id) {
        await disconnectServer(server.id);
        await db.mcpServers.delete(server.id);
        removeToolsByServerName(server.name);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
    },
  });

  // アクティブ切り替え
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      if (!isActive) {
        await disconnectServer(id);
      }
      await db.mcpServers.update(id, { isActive, updatedAt: new Date() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
    },
  });

  // 接続テスト
  const [pingingId, setPingingId] = useState<number | string | null>(null);
  const handlePing = async (
    server: Omit<McpServer, 'createdAt' | 'updatedAt'> & { id?: number },
  ) => {
    // IDがない（新規作成中）の場合は名前を一時的なキーにする
    const pingKey = server.id || server.name || 'new-server';
    setPingingId(pingKey);
    try {
      await testMcpConfig(server);
      alert('接続に成功しました！');
    } catch (e) {
      alert(`接続に失敗しました: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      if (server.id) {
        setConnectionStatuses(getAllServerStatuses());
      }
      setPingingId(null);
    }
  };

  const handleCreateNew = () => {
    setEditingServer({
      name: '',
      type: 'streamableHttp',
      url: '',
      authType: 'none',
      isActive: true,
    });
  };

  const selectedServerForTools = servers.find((s) => s.id === managingToolsServerId);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right">
      {/* サーバ一覧 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              MCPサーバ一覧
            </h3>
            <p className="text-[10px] text-muted-foreground">
              外部ツールを定義する Model Context Protocol サーバを管理します
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateNew}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 rounded-md text-xs font-semibold transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新規追加</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {servers.map((s) => (
            <div
              key={s.id}
              className={`p-4 rounded-lg border transition-all flex items-center justify-between group ${
                s.isActive
                  ? 'bg-primary/5 border-primary/20 shadow-sm'
                  : 'bg-muted/30 border-transparent hover:border-border'
              }`}
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-colors ${
                    s.isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Network className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-foreground flex items-center gap-2 mb-0.5">
                    <span className="truncate">{s.name}</span>
                    {s.id && connectionStatuses[s.id] === 'success' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-success animate-in zoom-in duration-300" />
                    )}
                    {s.id && connectionStatuses[s.id] === 'error' && (
                      <XCircle className="w-3.5 h-3.5 text-destructive animate-in zoom-in duration-300" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate font-mono opacity-70">
                    {s.url}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4">
                <button
                  type="button"
                  onClick={() =>
                    s.id && toggleActiveMutation.mutate({ id: s.id, isActive: !s.isActive })
                  }
                  className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all border ${
                    s.isActive
                      ? 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
                      : 'bg-muted text-muted-foreground border-transparent hover:border-border hover:bg-muted/50'
                  }`}
                >
                  {s.isActive ? '有効' : '無効'}
                </button>

                <button
                  type="button"
                  onClick={() => handlePing(s)}
                  disabled={pingingId === s.id}
                  className="p-2 rounded-md hover:bg-accent text-muted-foreground transition-colors disabled:opacity-50"
                  title="接続テスト"
                >
                  <RefreshCcw className={`w-4 h-4 ${pingingId === s.id ? 'animate-spin' : ''}`} />
                </button>

                <div className="h-4 w-[1px] bg-border mx-1" />

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => s.id && setManagingToolsServerId(s.id)}
                    className="p-2 rounded-md hover:bg-accent text-muted-foreground transition-colors"
                    title="ツール管理"
                  >
                    <Wrench className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingServer(s)}
                    className="p-2 rounded-md hover:bg-accent text-muted-foreground transition-colors"
                    title="編集"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`サーバ "${s.name}" を削除しますか？`)) {
                        deleteMutation.mutate(s);
                      }
                    }}
                    className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="削除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {servers.length === 0 && (
            <EmptyState
              icon={Network}
              title="設定されている MCP サーバはありません"
              description="[新規追加] から、ツールを提供するサーバを登録してください。"
            />
          )}
        </div>
      </section>

      {/* 編集・追加ダイアログ */}
      <Modal
        isOpen={!!editingServer}
        onClose={() => setEditingServer(null)}
        maxWidth="max-w-md"
        title={
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" />
            <span>{editingServer?.id ? 'サーバ設定を編集' : '新しいサーバを追加'}</span>
          </div>
        }
        footer={
          <>
            <button
              type="button"
              disabled={!!pingingId}
              onClick={() => editingServer && handlePing(editingServer)}
              className="px-4 py-2 border rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Activity
                className={`w-4 h-4 ${pingingId === (editingServer?.id || editingServer?.name || 'new-server') ? 'animate-pulse' : ''}`}
              />
              <span>接続確認</span>
            </button>
            <button
              type="button"
              onClick={() => setEditingServer(null)}
              className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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
          </>
        }
      >
        {editingServer && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="s-name"
                className="text-xs font-bold text-muted-foreground flex items-center gap-1"
              >
                表示名 <span className="text-destructive">*</span>
              </label>
              <input
                id="s-name"
                className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 border-border transition-all"
                placeholder="My Server"
                value={editingServer.name}
                onChange={(e) => setEditingServer({ ...editingServer, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="s-type" className="text-xs font-bold text-muted-foreground">
                接続タイプ
              </label>
              <select
                id="s-type"
                className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 border-border transition-all"
                value={editingServer.type}
                onChange={(e) =>
                  setEditingServer({
                    ...editingServer,
                    type: e.target.value as 'streamableHttp' | 'sse',
                  })
                }
              >
                <option value="streamableHttp">Streamable HTTP</option>
                <option value="sse">SSE (Server-Sent Events) over HTTP</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="s-url"
                className="text-xs font-bold text-muted-foreground flex items-center gap-1"
              >
                エンドポイントURL <span className="text-destructive">*</span>
              </label>
              <input
                id="s-url"
                className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 border-border transition-all font-mono"
                placeholder="http://localhost:8000/mcp"
                value={editingServer.url || ''}
                onChange={(e) => setEditingServer({ ...editingServer, url: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground">
                サーバが公開しているMCPサーバエンドポイントのフル URL
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-foreground">有効化</span>
                <span className="text-[10px] text-muted-foreground">
                  作成時に即座に有効化します
                </span>
              </div>
              <Switch
                checked={editingServer.isActive}
                onChange={(isActive) => setEditingServer({ ...editingServer, isActive })}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ツール管理ダイアログ */}
      {managingToolsServerId && selectedServerForTools && (
        <McpToolManagerModal
          server={selectedServerForTools}
          onClose={() => setManagingToolsServerId(null)}
        />
      )}
    </div>
  );
}

/**
 * サーバごとの個別ツール管理用コンポーネント
 */
function McpToolManagerModal({ server, onClose }: { server: McpServer; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { enabledTools, setToolEnabled } = useAppStore();

  // 指定したサーバのツールのみを取得
  const {
    data: tools = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['mcpTools', server.id],
    queryFn: () => {
      if (!server.id) throw new Error('Server ID is missing');
      return getMcpToolsByServerId(server.id);
    },
    enabled: !!server.id && server.isActive,
  });

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidth="max-w-lg"
      title={
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10 text-primary">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-foreground leading-tight">ツール管理</h3>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              {server.name}
            </p>
          </div>
        </div>
      }
      showCloseButton={false} // ヘッダーにカスタムボタン群があるため
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold hover:opacity-90 transition-all shadow-md"
        >
          完了
        </button>
      }
    >
      {/* ツール管理ヘッダーのカスタム操作バー */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['mcpTools', server.id] })}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent"
          title="最新に更新"
        >
          <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent"
          aria-label="閉じる"
        >
          <XCircle className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-3">
        {!server.isActive ? (
          <EmptyState
            icon={AlertCircle}
            title="サーバが非アクティブです"
            description="ツールの一覧を取得するには、サーバを有効にする必要があります。"
            className="border-destructive/20 bg-destructive/5"
          />
        ) : isLoading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-lg bg-muted/30 animate-pulse border border-border/50"
              />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3 animate-in shake-1">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">ツールの取得に失敗しました</p>
              <p className="text-xs opacity-80 mb-2">
                サーバとの通信に問題が発生しました。接続設定を確認してください。
              </p>
              <div className="p-2 bg-destructive/5 rounded border border-destructive/10 font-mono text-[10px] break-all">
                {error instanceof Error ? error.message : 'Unknown connection error'}
              </div>
            </div>
          </div>
        ) : tools.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="利用可能なツールはありません"
            description="このサーバが公開しているツールが取得できませんでした。"
          />
        ) : (
          tools.map((tool) => {
            const baseName = tool.name.split('__')[1] || tool.name;
            const isEnabled = enabledTools[tool.name] !== false;

            return (
              <div
                key={tool.name}
                className="flex items-start justify-between p-4 rounded-lg border bg-muted/30 text-foreground transition-all hover:border-primary border-primary/20 group"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-1 p-1.5 rounded bg-background border border-border group-hover:border-primary/30 transition-colors">
                    <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm mb-1 truncate">{baseName}</h4>
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2 leading-relaxed">
                      {tool.description}
                    </p>
                    <code className="text-[10px] bg-background border border-border px-1.5 py-0.5 rounded font-mono text-muted-foreground/80">
                      {tool.name}
                    </code>
                  </div>
                </div>

                <Switch
                  checked={isEnabled}
                  onChange={(checked) => setToolEnabled(tool.name, checked)}
                  className="mt-1"
                />
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
