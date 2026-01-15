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
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { db, type ManualModel, type Provider, type ProviderType } from '../../lib/db';
import { listModels, type ModelInfo } from '../../lib/services/ModelService';
import { listProviders } from '../../lib/services/ProviderService';

const RESPONSE_API_SUPPORTED_TYPES: ProviderType[] = [
  'openai-compatible',
  'azure',
  'openrouter',
  'litellm',
];

export function ModelSettings() {
  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // State
  // Initialize with empty string, will be set to active provider in useEffect
  const [targetProviderId, setTargetProviderId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('enabled');
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [isManualModalOpen, setManualModalOpen] = useState(false);

  // 編集用 (ManualModel)
  // 新規作成時は null, 編集時は ManualModel オブジェクト
  const [editingManualModel, setEditingManualModel] = useState<Partial<ManualModel> | null>(null);

  // データ取得
  const { data: providers = [] } = useQuery<Provider[]>({
    queryKey: ['providers'],
    queryFn: listProviders,
  });

  // 初期表示時に最初のプロバイダーを選択
  useEffect(() => {
    if (!targetProviderId && providers.length > 0) {
      setTargetProviderId(providers[0].id?.toString() || 'unknown');
    }
  }, [providers, targetProviderId]);

  const {
    data: models = [],
    isLoading,
    isRefetching,
  } = useQuery({
    queryKey: ['models', targetProviderId],
    queryFn: async () => {
      if (!targetProviderId) return [];

      const provider = providers.find((p) => p.id?.toString() === targetProviderId);
      return listModels(provider);
    },
    enabled: !!targetProviderId && providers.length > 0,
  });

  // Mutations

  // 1. 有効/無効切り替え
  const toggleEnabledMutation = useMutation({
    mutationFn: async ({ model, isEnabled }: { model: ModelInfo; isEnabled: boolean }) => {
      // ManualModelの場合、自身のisEnabledを更新
      if (model.isManual) {
        // IDがUUIDになっているのでそのまま検索
        const manual = await db.manualModels.where('uuid').equals(model.id).first();
        if (manual?.id) {
          await db.manualModels.update(manual.id, { isEnabled });
        }
      }

      // ModelConfigも更新 (標準モデルやCustom含め、統一的に管理)
      const config = await db.modelConfigs
        .where('[providerId+modelId]')
        .equals([model.providerId, model.id]) // model.id は UUID または API Model ID
        .first();

      if (config) {
        await db.modelConfigs.put({ ...config, isEnabled });
      } else {
        // 新規作成
        await db.modelConfigs.put({
          providerId: model.providerId,
          modelId: model.id,
          enableStream: model.enableStream,
          isEnabled,
          order: model.order,
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models'] }),
  });

  // 2. 並び替え (Bulk)

  const bulkReorderMutation = useMutation({
    mutationFn: async (updatedModels: ModelInfo[]) => {
      await db.transaction('rw', db.modelConfigs, async () => {
        for (let i = 0; i < updatedModels.length; i++) {
          const m = updatedModels[i];
          const config = await db.modelConfigs
            .where('[providerId+modelId]')
            .equals([m.providerId, m.id])
            .first();

          const baseConfig = config || {
            providerId: m.providerId,
            modelId: m.id,
            enableStream: m.enableStream,
            isEnabled: m.isEnabled,
          };

          await db.modelConfigs.put({ ...baseConfig, order: i });
        }
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models'] }),
  });

  // 3. 一括操作 (有効化/無効化)
  const bulkToggleMutation = useMutation({
    mutationFn: async ({ ids, isEnabled }: { ids: string[]; isEnabled: boolean }) => {
      await db.transaction('rw', db.modelConfigs, db.manualModels, async () => {
        for (const id of ids) {
          const model = models.find((m) => m.id === id);
          if (!model) continue;

          if (model.isManual) {
            const manual = await db.manualModels.where('uuid').equals(model.id).first();
            if (manual?.id) await db.manualModels.update(manual.id, { isEnabled });
          }

          const config = await db.modelConfigs
            .where('[providerId+modelId]')
            .equals([model.providerId, model.id])
            .first();

          if (config) {
            await db.modelConfigs.put({ ...config, isEnabled });
          } else {
            await db.modelConfigs.put({
              providerId: model.providerId,
              modelId: model.id,
              enableStream: model.enableStream,
              isEnabled,
              order: model.order,
            });
          }
        }
      });
    },
    onSuccess: () => {
      setSelectedModelIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });

  // 4. Manual Model 保存 (Upsert)
  const saveManualModelMutation = useMutation({
    mutationFn: async (data: Partial<ManualModel>) => {
      // 必須項目のチェック
      if (!data.providerId || !data.modelId || !data.name)
        throw new Error('必須項目が不足しています');

      const manualData = {
        uuid: data.uuid || crypto.randomUUID(), // UUID生成または維持
        providerId: data.providerId,
        modelId: data.modelId,
        name: data.name,
        description: data.description,
        contextWindow: data.contextWindow,
        maxTokens: data.maxTokens,
        inputCostPer1k: data.inputCostPer1k,
        outputCostPer1k: data.outputCostPer1k,
        isEnabled: data.isEnabled ?? true,
        enableStream: data.enableStream ?? true,
        supportsTools: data.supportsTools ?? true,
        supportsImages: data.supportsImages ?? true,
        protocol: data.protocol ?? 'chat_completion',
        defaultSystemPrompt: data.defaultSystemPrompt,
        extraParams: data.extraParams,
        createdAt: new Date(),
      } as ManualModel;

      if (data.id) {
        // 更新 (ID指定)
        const { id, ...update } = manualData;
        await db.manualModels.update(data.id, update);
      } else {
        // 新規作成
        await db.manualModels.add(manualData);
      }
    },
    onSuccess: () => {
      setManualModalOpen(false);
      setEditingManualModel(null);
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });

  // 5. Manual Model 削除 (またはリセット)
  const deleteManualModelMutation = useMutation({
    mutationFn: async (model: ModelInfo) => {
      // UUIDで検索して削除
      const manual = await db.manualModels.where('uuid').equals(model.id).first();
      // Manualモデルが見つからない場合でも、Configの削除は試みるべきか？
      // -> APIモデルのConfigのみ削除するケースもありうるが、ここではManualModelの削除アクション。

      if (manual?.id) {
        await db.manualModels.delete(manual.id);

        // 関連するModelConfigも削除
        try {
          // ModelInfoから必要なIDが取れない場合を考慮し、manualModelの情報を優先
          const providerId = model.providerId || manual.providerId;
          const modelId = model.id; // ManualModelの場合、idはUUID

          // 複合キーでの削除: db.modelConfigs.delete([providerId, modelId])
          // configキーは [providerId, modelId] (modelId=UUID)
          if (providerId && modelId) {
            await db.modelConfigs.delete([providerId, modelId]);
          }
        } catch (e) {
          console.error('ModelConfig deletion failed (ignored):', e);
        }
      }
    },
    onSuccess: () => {
      // 削除後、選択状態をクリア
      setSelectedModelIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });

  // ハンドラ
  const handleSwapOrder = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === filteredModels.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newModels = [...filteredModels];
    const [moved] = newModels.splice(index, 1);
    newModels.splice(targetIndex, 0, moved);

    bulkReorderMutation.mutate(newModels);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredModels.findIndex((m) => m.id === active.id);
    const newIndex = filteredModels.findIndex((m) => m.id === over.id);

    const newModels = arrayMove(filteredModels, oldIndex, newIndex);
    bulkReorderMutation.mutate(newModels);
  };

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchSearch =
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchFilter =
        statusFilter === 'all'
          ? true
          : statusFilter === 'enabled'
            ? m.isEnabled
            : statusFilter === 'disabled'
              ? !m.isEnabled
              : true;

      return matchSearch && matchFilter;
    });
  }, [models, searchQuery, statusFilter]);

  // Bulk Actions
  const handleBulkToggle = (isEnabled: boolean) => {
    if (selectedModelIds.size === 0) return;
    bulkToggleMutation.mutate({ ids: Array.from(selectedModelIds), isEnabled });
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedModelIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedModelIds(newSet);
  };

  const selectAll = () => {
    if (selectedModelIds.size === filteredModels.length && filteredModels.length > 0) {
      setSelectedModelIds(new Set());
    } else {
      setSelectedModelIds(new Set(filteredModels.map((m) => m.id)));
    }
  };

  const handleSave = () => {
    if (
      !editingManualModel?.providerId ||
      !editingManualModel?.modelId ||
      !editingManualModel?.name
    ) {
      alert('必須項目（Provider ID, Model ID, Name）を入力してください');
      return;
    }
    // JSON Validation
    if (editingManualModel?.extraParams && typeof editingManualModel.extraParams === 'string') {
      try {
        JSON.parse(editingManualModel.extraParams as unknown as string);
      } catch (_e) {
        alert('Extra Params の JSON 形式が不正です');
        return;
      }
    }
    saveManualModelMutation.mutate(editingManualModel as ManualModel);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['models'] });
  };

  const handleCopy = (model: ModelInfo) => {
    setEditingManualModel({
      providerId: model.providerId,
      modelId: model.targetModelId || model.id,
      name: `${model.name} (Copy)`,
      description: model.description,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      isEnabled: true,
      enableStream: model.enableStream,
      supportsTools: model.supportsTools,
      supportsImages: model.supportsImages,
      // extraParams は DBから引けない（ModelInfoに含まれない部分）ので初期状態、
      // 厳密には fetch してコピーすべきだが、簡易実装として初期値とする
      extraParams: {},
    });
    setManualModalOpen(true);
  };

  const handleEdit = async (model: ModelInfo) => {
    if (model.isManual) {
      // Manualモデルの場合はDBから詳細を取得して編集
      const manual = await db.manualModels.where('uuid').equals(model.id).first();
      if (manual) {
        setEditingManualModel(manual);
        setManualModalOpen(true);
      }
    } else {
      // APIモデルの編集 (Override作成)
      // UUIDをAPI Model IDと同じにすることで、Overrideとして扱う
      setEditingManualModel({
        uuid: model.id, // Override Key
        providerId: model.providerId,
        modelId: model.id, // Target Model ID (Same as API ID)
        name: model.name,
        description: model.description || '',
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        // 初期値
        isEnabled: model.isEnabled,
        enableStream: model.enableStream,
        supportsTools: model.supportsTools,
        supportsImages: model.supportsImages,
        protocol: model.protocol || 'chat_completion',
      });
      setManualModalOpen(true);
    }
  };

  if (isLoading)
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse animate-in fade-in slide-in-from-right">
        読み込み中...
      </div>
    );

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in slide-in-from-right">
      {/* ツールバー */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* プロバイダー選択 */}
          <select
            value={targetProviderId}
            onChange={(e) => setTargetProviderId(e.target.value)}
            className={`border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring ${providers.length === 0 ? 'border-destructive text-destructive' : 'bg-background text-foreground'}`}
          >
            {providers.length === 0 && <option value="">プロバイダーなし</option>}
            {providers.map((p) => (
              <option key={p.id} value={p.id?.toString()}>
                {p.name}
              </option>
            ))}
          </select>

          {/* ステータスフィルター */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'enabled' | 'disabled')}
            className="bg-background border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">すべて</option>
            <option value="enabled">有効のみ</option>
            <option value="disabled">無効のみ</option>
          </select>

          {/* 更新ボタン */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefetching}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            title="リストを更新"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          {/* 検索 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="モデルを検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 bg-background border rounded-md text-sm text-foreground outline-none focus:ring-2 focus:ring-ring w-64"
            />
          </div>

          <div className="flex justify-end gap-2">
            {selectedModelIds.size > 0 && (
              <div className="flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-lg border border-primary/20">
                <span className="text-xs font-bold text-primary mr-2">
                  {selectedModelIds.size}件選択
                </span>
                <button
                  type="button"
                  onClick={() => handleBulkToggle(true)}
                  className="p-1 hover:bg-primary/20 rounded text-primary"
                  title="一括有効化"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkToggle(false)}
                  className="p-1 hover:bg-primary/20 rounded text-primary"
                  title="一括無効化"
                >
                  <EyeOff className="w-4 h-4" />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                // 新規作成
                setEditingManualModel({
                  providerId: targetProviderId,
                  isEnabled: true,
                  enableStream: true,
                  supportsTools: true,
                  supportsImages: true,
                  protocol: 'chat_completion',
                });
                setManualModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 text-sm font-medium transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>手動追加</span>
            </button>
          </div>
        </div>
      </div>

      {/* モデルリスト */}
      <div className="flex-1 overflow-y-auto border rounded-md bg-muted/20 custom-scrollbar">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="w-full text-left border-collapse">
            <thead className="bg-foreground/5 sticky top-0 z-10 backdrop-blur-md">
              <tr>
                <th className="p-3 w-10 text-center">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {selectedModelIds.size === filteredModels.length &&
                    filteredModels.length > 0 ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="p-3 text-xs font-bold text-muted-foreground uppercase">
                  モデル名 / ID
                </th>
                <th className="p-3 text-xs font-bold text-muted-foreground uppercase">タイプ</th>
                <th className="p-3 text-xs font-bold text-muted-foreground uppercase w-24 text-center">
                  状態
                </th>
                <th className="p-3 text-xs font-bold text-muted-foreground uppercase w-32 text-center">
                  並び順
                </th>
                <th className="p-3 text-xs font-bold text-muted-foreground uppercase w-28 text-center">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <SortableContext
                items={filteredModels.map((m) => m.id)}
                strategy={verticalListSortingStrategy}
              >
                {filteredModels.map((model, index) => (
                  <SortableRow
                    key={model.id}
                    model={model}
                    index={index}
                    isSelected={selectedModelIds.has(model.id)}
                    isLast={index === filteredModels.length - 1}
                    onToggleEnabled={(isEnabled) =>
                      toggleEnabledMutation.mutate({ model, isEnabled })
                    }
                    onToggleSelection={() => toggleSelection(model.id)}
                    onSwapOrder={(dir) => handleSwapOrder(index, dir)}
                    onCopy={() => handleCopy(model)}
                    onEdit={() => handleEdit(model)}
                    onDelete={() => {
                      const message = model.isApiOverride
                        ? 'カスタマイズ設定を削除し、デフォルトに戻しますか？'
                        : 'このモデルを削除しますか？';
                      if (confirm(message)) deleteManualModelMutation.mutate(model);
                    }}
                  />
                ))}
              </SortableContext>
              {filteredModels.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    モデルが見つかりません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </DndContext>
      </div>

      {/* マニュアルモデル登録モーダル */}
      {isManualModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="w-full max-w-lg bg-background border rounded-lg shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
              <header className="flex items-center justify-between p-4 border-b bg-muted/20">
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" />
                  {editingManualModel?.uuid &&
                  editingManualModel?.uuid === editingManualModel?.modelId
                    ? 'モデル設定をカスタマイズ'
                    : editingManualModel?.uuid
                      ? 'モデル設定を編集'
                      : '新しいモデルを手動登録'}
                </h3>
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </header>
              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                {/* 基本設定セクション */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-foreground border-b pb-1 mb-2">基本設定</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="manual-provider-id"
                        className="block text-xs font-bold text-muted-foreground mb-1.5"
                      >
                        プロバイダー
                      </label>
                      <select
                        value={
                          editingManualModel?.providerId ||
                          (targetProviderId === 'all'
                            ? providers.find((p) => p.isActive)?.id?.toString()
                            : targetProviderId) ||
                          ''
                        }
                        onChange={(e) =>
                          setEditingManualModel((prev) => ({ ...prev, providerId: e.target.value }))
                        }
                        disabled={!!editingManualModel?.uuid} // 編集時は変更不可推奨
                        id="manual-provider-id"
                        className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">選択してください</option>
                        {providers.map((p) => (
                          <option key={p.id} value={p.id?.toString()}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="manual-name"
                        className="block text-xs font-bold text-muted-foreground mb-1.5"
                      >
                        表示名 (Alias)
                      </label>
                      <input
                        id="manual-name"
                        type="text"
                        value={editingManualModel?.name || ''}
                        onChange={(e) =>
                          setEditingManualModel((prev) => ({ ...prev, name: e.target.value }))
                        }
                        className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        placeholder="e.g. My Custom GPT"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="manual-model-id"
                      className="block text-xs font-bold text-muted-foreground mb-1.5"
                    >
                      モデルID (API識別子)
                    </label>
                    <input
                      id="manual-model-id"
                      type="text"
                      value={editingManualModel?.modelId || ''}
                      onChange={(e) =>
                        setEditingManualModel((prev) => ({ ...prev, modelId: e.target.value }))
                      }
                      // Override時は固定
                      disabled={
                        editingManualModel?.uuid !== undefined &&
                        editingManualModel.uuid === editingManualModel?.modelId
                      }
                      className={`w-full bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring font-mono ${
                        editingManualModel?.uuid !== undefined &&
                        editingManualModel.uuid === editingManualModel?.modelId
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                      }`}
                      placeholder="e.g. gpt-4o, llama3:8b"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {editingManualModel?.uuid !== undefined &&
                      editingManualModel.uuid === editingManualModel?.modelId
                        ? '※API取得モデルのため変更できません'
                        : '実際にAPIリクエストで使用されるモデルIDです。'}
                    </p>
                  </div>
                </div>

                {/* 機能設定セクション */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-foreground border-b pb-1 mb-2">機能設定</h4>

                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 cursor-pointer p-2 border rounded-md bg-muted/10 hover:bg-muted/30 transition-colors">
                      <input
                        type="checkbox"
                        checked={editingManualModel?.enableStream ?? true}
                        onChange={(e) =>
                          setEditingManualModel((prev) => ({
                            ...prev,
                            enableStream: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-xs font-medium">ストリーミング有効</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer p-2 border rounded-md bg-muted/10 hover:bg-muted/30 transition-colors">
                      <input
                        type="checkbox"
                        checked={editingManualModel?.supportsTools ?? true}
                        onChange={(e) =>
                          setEditingManualModel((prev) => ({
                            ...prev,
                            supportsTools: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-xs font-medium">ツール利用 (Function Calling)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer p-2 border rounded-md bg-muted/10 hover:bg-muted/30 transition-colors">
                      <input
                        type="checkbox"
                        checked={editingManualModel?.supportsImages ?? true}
                        onChange={(e) =>
                          setEditingManualModel((prev) => ({
                            ...prev,
                            supportsImages: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-xs font-medium">画像/ファイル入力</span>
                    </label>
                  </div>

                  {/* Protocol Selection (Only if provider supports Response API or general edit) */}
                  {/* Note: We need to know if selected provider supports response API. 
                      Since manual model editing allows changing providerId, we filter 'providers' by selected ID. */}
                  {(() => {
                    const currentProviderId = editingManualModel?.providerId || targetProviderId;
                    const provider = providers.find((p) => p.id?.toString() === currentProviderId);

                    if (
                      provider?.supportsResponseApi &&
                      RESPONSE_API_SUPPORTED_TYPES.includes(provider.type)
                    ) {
                      return (
                        <div className="mt-4 p-3 border rounded-md bg-muted/10">
                          <p className="block text-xs font-bold text-foreground mb-2">
                            利用プロトコル
                          </p>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="protocol"
                                value="chat_completion"
                                checked={editingManualModel?.protocol !== 'response_api'}
                                onChange={() =>
                                  setEditingManualModel((prev) => ({
                                    ...prev,
                                    protocol: 'chat_completion',
                                  }))
                                }
                                className="text-primary focus:ring-primary"
                              />
                              <span className="text-sm">Chat Completion (Standard)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="protocol"
                                value="response_api"
                                checked={editingManualModel?.protocol === 'response_api'}
                                onChange={() =>
                                  setEditingManualModel((prev) => ({
                                    ...prev,
                                    protocol: 'response_api',
                                  }))
                                }
                                className="text-primary focus:ring-primary"
                              />
                              <span className="text-sm">Response API (v1/responses)</span>
                            </label>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-2">
                            Response APIを選択すると、Reasoning
                            Summaryなどの新機能が利用可能になりますが、ステートレスな通信となります。
                          </p>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* 詳細パラメータセクション */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-foreground border-b pb-1 mb-2">
                    詳細パラメータ
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="manual-context-window"
                        className="block text-xs font-bold text-muted-foreground mb-1.5"
                      >
                        Context Window
                      </label>
                      <input
                        id="manual-context-window"
                        type="number"
                        value={editingManualModel?.contextWindow || ''}
                        onChange={(e) =>
                          setEditingManualModel((prev) => ({
                            ...prev,
                            contextWindow: Number(e.target.value),
                          }))
                        }
                        className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        placeholder="自動 (0)"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="manual-max-tokens"
                        className="block text-xs font-bold text-muted-foreground mb-1.5"
                      >
                        Max Output Tokens
                      </label>
                      <input
                        id="manual-max-tokens"
                        type="number"
                        value={editingManualModel?.maxTokens || ''}
                        onChange={(e) =>
                          setEditingManualModel((prev) => ({
                            ...prev,
                            maxTokens: Number(e.target.value),
                          }))
                        }
                        className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        placeholder="自動 (0)"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="manual-system-prompt"
                      className="block text-xs font-bold text-muted-foreground mb-1.5"
                    >
                      Default System Prompt
                    </label>
                    <textarea
                      id="manual-system-prompt"
                      value={editingManualModel?.defaultSystemPrompt || ''}
                      onChange={(e) =>
                        setEditingManualModel((prev) => ({
                          ...prev,
                          defaultSystemPrompt: e.target.value,
                        }))
                      }
                      className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring min-h-[80px]"
                      placeholder="このモデルのデフォルトシステムプロンプトを設定します..."
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="manual-extra-params"
                      className="block text-xs font-bold text-muted-foreground mb-1.5"
                    >
                      Extra Params (JSON)
                    </label>
                    <textarea
                      id="manual-extra-params"
                      value={
                        typeof editingManualModel?.extraParams === 'object'
                          ? JSON.stringify(editingManualModel?.extraParams, null, 2)
                          : (editingManualModel?.extraParams as unknown as string) || ''
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingManualModel((prev) => ({
                          ...prev,
                          extraParams: val as unknown as Record<string, unknown>,
                        }));
                      }}
                      className="w-full bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring font-mono min-h-[100px] text-xs"
                      placeholder={'{\n  "top_p": 0.9,\n  "presence_penalty": 0.5\n}'}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      APIリクエストに追加するパラメータをJSON形式で記述します。
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t flex justify-end gap-3 bg-muted/30 shrink-0">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="px-4 py-2 rounded-md hover:bg-accent text-sm font-medium text-muted-foreground transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 text-sm font-medium transition-all shadow-sm"
                >
                  保存する
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

interface SortableRowProps {
  model: ModelInfo;
  index: number;
  isSelected: boolean;
  isLast: boolean;
  onToggleEnabled: (isEnabled: boolean) => void;
  onToggleSelection: () => void;
  onSwapOrder: (dir: 'up' | 'down') => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableRow({
  model,
  index,
  isSelected,
  isLast,
  onToggleEnabled,
  onToggleSelection,
  onSwapOrder,
  onCopy,
  onEdit,
  onDelete,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: model.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: (isDragging ? 'relative' : 'static') as 'relative' | 'static',
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`hover:bg-muted/50 transition-colors ${!model.isEnabled ? 'opacity-60 grayscale-[0.5]' : ''} ${isDragging ? 'bg-accent/50 shadow-lg' : ''}`}
    >
      <td className="p-3 text-center">
        <div className="flex items-center gap-2">
          {/* Handle */}
          <div
            {...attributes}
            {...listeners}
            className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
            title="ドラッグして移動"
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <button
            type="button"
            onClick={onToggleSelection}
            className={`transition-colors ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          </button>
        </div>
      </td>
      <td className="p-3">
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{model.name}</span>
          <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
            {model.isManual ? (
              <>
                <span className="text-primary/70">{model.targetModelId}</span>
                <span className="opacity-50 text-[10px]">(Alias)</span>
              </>
            ) : (
              model.id
            )}
          </span>
          {model.protocol === 'response_api' && (
            <span className="w-fit ml-0 mt-1 px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 text-[10px] border border-orange-500/20">
              Response API
            </span>
          )}
        </div>
      </td>
      <td className="p-3">
        {model.isManual ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
            Manual
          </span>
        ) : model.isCustom ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Custom
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            API
          </span>
        )}
      </td>
      <td className="p-3 text-center">
        <button
          type="button"
          onClick={() => onToggleEnabled(!model.isEnabled)}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
            model.isEnabled
              ? 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'
              : 'bg-muted text-muted-foreground border hover:bg-accent'
          }`}
        >
          {model.isEnabled ? '有効' : '無効'}
        </button>
      </td>
      <td className="p-3">
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => onSwapOrder('up')}
            disabled={index === 0}
            className="p-1 hover:bg-accent rounded text-muted-foreground transition-colors disabled:opacity-30"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSwapOrder('down')}
            disabled={isLast}
            className="p-1 hover:bg-accent rounded text-muted-foreground transition-colors disabled:opacity-30"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>
      </td>
      <td className="p-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={onCopy}
            className="p-1.5 hover:bg-accent rounded-md text-muted-foreground transition-colors"
            title="複製して新規作成"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 hover:bg-accent rounded-md text-muted-foreground transition-colors"
            title={model.isManual ? '編集' : '設定をカスタマイズ'}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          {model.isManual && (
            <button
              type="button"
              onClick={onDelete}
              className={`p-1.5 rounded-lg transition-colors ${
                model.isApiOverride
                  ? 'hover:bg-orange-500/10 text-orange-400'
                  : 'hover:bg-destructive/10 text-destructive'
              }`}
              title={model.isApiOverride ? 'デフォルトに戻す' : '削除'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
