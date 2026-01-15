import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Provider, ProviderType } from '../../lib/db';
import {
  deleteProvider,
  listProviders,
  setActiveProvider,
  upsertProvider,
} from '../../lib/services/ProviderService';

const PROVIDER_TYPES: ProviderType[] = [
  'openai-compatible',
  'openrouter',
  'litellm',
  'ollama',
  'google',
  'anthropic',
  // TODO: 処理切り替え未対応のためコメントアウト
  // 'azure',
];

const RESPONSE_API_SUPPORTED_TYPES: ProviderType[] = [
  'openai-compatible',
  'azure',
  'openrouter',
  'litellm',
];

export function ProviderSettings() {
  const queryClient = useQueryClient();
  const [editingProvider, setEditingProvider] = useState<
    (Omit<Provider, 'createdAt' | 'updatedAt'> & { id?: number }) | null
  >(null);

  // プロバイダー一覧を取得
  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: listProviders,
  });

  const activeProviderId = providers.find((p) => p.isActive)?.id;

  // Active切り替えミューテーション
  const setActiveMutation = useMutation({
    mutationFn: (id: number) => setActiveProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      // モデル一覧も再取得が必要（ActiveProviderに依存するため）
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });

  // 保存ミューテーション
  const saveMutation = useMutation({
    mutationFn: (p: Omit<Provider, 'createdAt' | 'updatedAt'>) => upsertProvider(p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      setEditingProvider(null);
    },
  });

  // 削除ミューテーション
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });

  const handleCreateNew = () => {
    setEditingProvider({
      name: '',
      baseUrl: '',
      apiKey: '',
      type: 'openai-compatible',
      requiresApiKey: true,
      isActive: providers.length === 0,
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right">
      {/* Active Provider Selector */}
      <section className="space-y-3 p-5 bg-gradient-to-br from-primary/5 to-transparent border border-primary/20 rounded-xl shadow-sm">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            Active Provider
          </h3>
          <p className="text-xs text-muted-foreground">
            チャットで使用するメインのAIプロバイダーを選択してください。
          </p>
        </div>

        <div className="relative max-w-md">
          <select
            value={activeProviderId || ''}
            onChange={(e) => {
              const id = Number(e.target.value);
              if (id) setActiveMutation.mutate(id);
            }}
            className="w-full appearance-none bg-background border border-border rounded-lg px-4 py-3 pr-10 text-sm font-medium shadow-sm transition-all hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
          >
            {providers.length === 0 && <option value="">プロバイダーがありません</option>}
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.type})
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </section>

      {/* プロバイダー一覧 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            設定済みプロバイダー
          </h3>
          <button
            type="button"
            onClick={handleCreateNew}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-md text-xs font-bold transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新規追加</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {providers.map((p) => (
            <div
              key={p.id}
              className={`p-3 md:p-4 rounded-md border transition-all flex items-center justify-between gap-4 group ${
                p.isActive
                  ? 'bg-primary/5 border-primary/30'
                  : 'bg-muted/30 hover:border-primary/20'
              }`}
            >
              <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
                <div
                  className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
                    p.isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Globe className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-foreground flex items-center gap-2 truncate">
                    <span className="truncate">{p.name}</span>
                    {p.isActive && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-primary text-[10px] text-primary-foreground font-bold uppercase tracking-tighter">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate opacity-70">
                    {p.baseUrl}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 md:gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingProvider(p)}
                  className="px-3 py-1.5 rounded-md hover:bg-accent text-xs text-muted-foreground transition-colors"
                >
                  編集
                </button>
                {!p.isActive && (
                  <button
                    type="button"
                    onClick={() => p.id && deleteMutation.mutate(p.id)}
                    className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 編集フォーム */}
      {editingProvider && (
        <div className="p-6 bg-background rounded-lg border border-primary/20 space-y-4 animate-in fade-in slide-in-from-bottom-2 shadow-lg">
          <h4 className="font-bold text-foreground flex items-center gap-2 mb-4">
            {editingProvider.id ? 'プロバイダーを編集' : '新しいプロバイダーを追加'}
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="p-name" className="text-xs font-semibold text-muted-foreground">
                表示名
              </label>
              <input
                id="p-name"
                className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="OpenAI, Local LLM など"
                value={editingProvider.name}
                onChange={(e) => setEditingProvider({ ...editingProvider, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="p-type" className="text-xs font-semibold text-muted-foreground">
                プロバイダータイプ
              </label>
              <select
                id="p-type"
                className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={editingProvider.type}
                onChange={(e) => {
                  const newType = e.target.value as ProviderType;
                  setEditingProvider({
                    ...editingProvider,
                    type: newType,
                    supportsResponseApi: RESPONSE_API_SUPPORTED_TYPES.includes(newType)
                      ? editingProvider.supportsResponseApi
                      : false,
                  });
                }}
              >
                {PROVIDER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {editingProvider.type !== 'google' && (
            <div className="space-y-1.5">
              <label htmlFor="p-url" className="text-xs font-semibold text-muted-foreground">
                API ベースURL{' '}
                {editingProvider.type !== 'anthropic' && (
                  <span className="text-destructive">*</span>
                )}
              </label>
              <input
                id="p-url"
                className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={
                  editingProvider.type === 'anthropic'
                    ? 'https://api.anthropic.com (省略可)'
                    : 'https://api.openai.com/v1'
                }
                value={editingProvider.baseUrl}
                onChange={(e) =>
                  setEditingProvider({ ...editingProvider, baseUrl: e.target.value })
                }
                required={editingProvider.type !== 'anthropic'}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="p-key" className="text-xs font-semibold text-muted-foreground">
                API キー{' '}
                {editingProvider.requiresApiKey && <span className="text-destructive">*</span>}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingProvider.requiresApiKey}
                  onChange={(e) =>
                    setEditingProvider({
                      ...editingProvider,
                      requiresApiKey: e.target.checked,
                    })
                  }
                  className="w-3 h-3 rounded bg-background text-primary focus:ring-ring"
                />
                <span className="text-[10px] text-muted-foreground">必須とする</span>
              </label>
            </div>
            <input
              id="p-key"
              type="password"
              className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={editingProvider.requiresApiKey ? '必須です' : 'sk- ... (空欄可)'}
              value={editingProvider.apiKey}
              onChange={(e) => setEditingProvider({ ...editingProvider, apiKey: e.target.value })}
              required={editingProvider.requiresApiKey}
            />
          </div>

          {RESPONSE_API_SUPPORTED_TYPES.includes(editingProvider.type) && (
            <div className="flex items-center gap-2 pt-2">
              <input
                id="p-response-api"
                type="checkbox"
                className="w-4 h-4 rounded bg-background text-primary focus:ring-ring"
                checked={editingProvider.supportsResponseApi ?? false}
                onChange={(e) =>
                  setEditingProvider({
                    ...editingProvider,
                    supportsResponseApi: e.target.checked,
                  })
                }
              />
              <div className="flex flex-col">
                <label
                  htmlFor="p-response-api"
                  className="text-sm font-medium text-foreground cursor-pointer"
                >
                  Response API (v1/responses) を使用可能
                </label>
                <span className="text-xs text-muted-foreground">
                  POST /v1/responses エンドポイントへのリクエストが可能になります。
                </span>
              </div>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-border">
            <button
              type="button"
              onClick={() => setEditingProvider(null)}
              className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={
                saveMutation.isPending ||
                !editingProvider.name.trim() ||
                (editingProvider.type !== 'google' &&
                  editingProvider.type !== 'anthropic' &&
                  !editingProvider.baseUrl.trim()) ||
                (editingProvider.requiresApiKey && !editingProvider.apiKey.trim())
              }
              onClick={() => editingProvider && saveMutation.mutate(editingProvider)}
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
