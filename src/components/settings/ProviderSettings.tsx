import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Plus, Puzzle, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Provider, ProviderType } from '../../lib/db';
import {
  deleteProvider,
  listProviders,
  toggleProviderActive,
  updateProvidersOrder,
  upsertProvider,
} from '../../lib/services/ProviderService';
import { EmptyState } from '../common/EmptyState';
import { Modal } from '../common/Modal';
import { Switch } from '../common/Switch';

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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // プロバイダー一覧を取得
  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: listProviders,
  });

  // 有効/無効切り替えミューテーション
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      toggleProviderActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });

  // 並び替えミューテーション
  const reorderMutation = useMutation({
    mutationFn: (ordered: Provider[]) => updateProvidersOrder(ordered),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });

  // 保存ミューテーション
  const saveMutation = useMutation({
    mutationFn: (p: Omit<Provider, 'createdAt' | 'updatedAt'>) => upsertProvider(p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      queryClient.invalidateQueries({ queryKey: ['models'] });
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = providers.findIndex((p) => p.id === active.id);
    const newIndex = providers.findIndex((p) => p.id === over.id);

    const newProviders = arrayMove(providers, oldIndex, newIndex);
    reorderMutation.mutate(newProviders);
  };

  const handleCreateNew = () => {
    setEditingProvider({
      name: '',
      baseUrl: '',
      apiKey: '',
      type: PROVIDER_TYPES[0],
      requiresApiKey: true,
      isActive: true,
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right">
      {/* 導入説明 */}
      <section className="p-4 bg-muted/20 border rounded-lg">
        <p className="text-sm text-muted-foreground">
          ドラッグ＆ドロップで優先順位を並び替えることができます。有効なプロバイダーのモデルはすべてチャット画面で選択可能になります。
        </p>
      </section>

      {/* プロバイダー一覧 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            プロバイダー設定
          </h3>
          <button
            type="button"
            onClick={handleCreateNew}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-bold transition-all hover:opacity-90 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新規追加</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={providers.map((p) => p.id as number)}
              strategy={verticalListSortingStrategy}
            >
              {providers.map((p) => (
                <SortableProviderItem
                  key={p.id}
                  provider={p}
                  onEdit={() => setEditingProvider(p)}
                  onDelete={() => p.id && deleteMutation.mutate(p.id)}
                  onToggleActive={(isActive) =>
                    p.id && toggleActiveMutation.mutate({ id: p.id, isActive })
                  }
                />
              ))}
            </SortableContext>
          </DndContext>
          {providers.length === 0 && (
            <EmptyState
              icon={Puzzle}
              title="プロバイダーが設定されていません"
              description="[新規追加] から、AIモデルを利用するためのプロバイダーを登録してください。"
            />
          )}
        </div>
      </section>

      {/* 編集フォーム (Modal) */}
      <Modal
        isOpen={!!editingProvider}
        onClose={() => setEditingProvider(null)}
        maxWidth="max-w-xl"
        title={editingProvider?.id ? 'プロバイダーを編集' : '新しいプロバイダーを追加'}
        footer={
          <>
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
                !editingProvider?.name.trim() ||
                (editingProvider?.type !== 'google' &&
                  editingProvider?.type !== 'anthropic' &&
                  !editingProvider?.baseUrl.trim()) ||
                (editingProvider?.requiresApiKey && !editingProvider?.apiKey.trim())
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
          </>
        }
      >
        {editingProvider && (
          <div className="space-y-4">
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
                className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
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
          </div>
        )}
      </Modal>
    </div>
  );
}

interface SortableProviderItemProps {
  provider: Provider;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (isActive: boolean) => void;
}

function SortableProviderItem({
  provider,
  onEdit,
  onDelete,
  onToggleActive,
}: SortableProviderItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: provider.id as number,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 md:p-4 rounded-md border transition-all flex items-center gap-4 group bg-muted/30 hover:border-primary ${
        isDragging ? 'shadow-xl border-primary scale-[1.02] bg-background' : 'border-primary/20'
      } ${!provider.isActive ? 'grayscale-[0.8] opacity-60' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground touch-none"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
        <div
          className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
            provider.isActive
              ? 'bg-primary text-primary-foreground font-bold shadow-sm'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {provider.type.substring(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-foreground flex items-center gap-2 truncate text-sm">
            <span className="truncate">{provider.name}</span>
            <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-muted text-[10px] text-muted-foreground font-bold uppercase border">
              {provider.type}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate opacity-70 font-mono">
            {provider.baseUrl || '(Native SDK)'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Toggle Switch */}
        <Switch
          checked={provider.isActive}
          onChange={(isActive) => onToggleActive(isActive)}
          title={provider.isActive ? '無効にする' : '有効にする'}
        />

        <div className="flex items-center gap-1 opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onEdit}
            className="px-2 py-1 rounded-md hover:bg-accent text-xs text-muted-foreground transition-colors"
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`${provider.name} を削除してもよろしいですか？`)) {
                onDelete();
              }
            }}
            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
