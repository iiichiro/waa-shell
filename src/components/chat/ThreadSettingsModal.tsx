import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ThreadSettings } from '../../lib/db';
import { db } from '../../lib/db';
import { listModels } from '../../lib/services/ModelService';

interface ThreadSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  threadId?: number;
  initialSettings?: Partial<ThreadSettings>;
  onSave?: (settings: Partial<ThreadSettings>) => void;
}

export function ThreadSettingsModal({
  isOpen,
  onClose,
  threadId,
  initialSettings,
  onSave,
}: ThreadSettingsModalProps) {
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [contextWindow, setContextWindow] = useState<number | undefined>(undefined);
  const [maxTokens, setMaxTokens] = useState<number | undefined>(undefined);
  const [extraParams, setExtraParams] = useState('');

  const queryClient = useQueryClient();

  // プロバイダー一覧の取得
  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: () => db.providers.toArray(),
  });

  // モデル一覧の取得
  const { data: models = [] } = useQuery({
    queryKey: ['models'],
    queryFn: () => listModels(),
    staleTime: 1000 * 60 * 5,
  });

  // 設定の取得 (DBから)
  const { data: dbSettings } = useQuery({
    queryKey: ['threadSettings', threadId],
    queryFn: () => (threadId ? db.threadSettings.where({ threadId }).first() : undefined),
    enabled: !!threadId && isOpen,
  });

  useEffect(() => {
    // DB設定優先、次に初期設定(ドラフト)、最後にデフォルト
    const settings = dbSettings || initialSettings;

    if (settings) {
      // プロバイダーIDがあればそれをセット、なければモデルから逆引き
      // (後方互換性のため、既に保存されている設定はmodelIdしか持たないかもしれない)
      let initialProviderId = settings.providerId || '';
      if (!initialProviderId && settings.modelId && models.length > 0) {
        const found = models.find((m) => m.id === settings.modelId);
        if (found) initialProviderId = found.providerId;
      }

      setProviderId(initialProviderId);
      setModelId(settings.modelId || '');
      setSystemPrompt(settings.systemPrompt || '');
      setContextWindow(settings.contextWindow);
      setMaxTokens(settings.maxTokens);
      setExtraParams(settings.extraParams ? JSON.stringify(settings.extraParams, null, 2) : '');
    } else if (models.length > 0 && !modelId) {
      // 設定がない場合はデフォルトモデル（有効なものから最初）を選択状態に
      const firstEnabled = models.find((m) => m.isEnabled) || models[0];
      setProviderId(firstEnabled.providerId);
      setModelId(firstEnabled.id);
    }
  }, [dbSettings, initialSettings, models, modelId]);

  // プロバイダー変更時の処理
  const handleProviderChange = (newProviderId: string) => {
    setProviderId(newProviderId);
    // モデルもそのプロバイダーのデフォルト（または先頭）に切り替える
    const availableModels = models.filter(
      (m) =>
        (m.isEnabled || m.id === modelId) && (!newProviderId || m.providerId === newProviderId),
    );
    if (availableModels.length > 0) {
      // 現在選択中のモデルが新しいプロバイダーにもあれば維持（ID重複は稀だが一応）
      // 基本は先頭に切り替え
      const first = availableModels.find((m) => m.isEnabled) || availableModels[0];
      setModelId(first.id);
    } else {
      setModelId('');
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let parsedExtraParams = {};
      try {
        if (extraParams.trim()) {
          parsedExtraParams = JSON.parse(extraParams);
        }
      } catch (_e) {
        throw new Error('Extra ParamsのJSON形式が正しくありません。');
      }

      const data: Partial<ThreadSettings> = {
        providerId: providerId || undefined, // 未選択(空文字)ならundefined
        modelId,
        systemPrompt: systemPrompt || undefined,
        contextWindow: contextWindow || undefined,
        maxTokens: maxTokens || undefined,
        extraParams: Object.keys(parsedExtraParams).length > 0 ? parsedExtraParams : undefined,
      };

      if (threadId) {
        const existing = await db.threadSettings.where({ threadId }).first();
        if (existing?.id) {
          await db.threadSettings.update(existing.id, { ...data, threadId });
        } else {
          await db.threadSettings.add({ ...data, threadId } as ThreadSettings);
        }
      } else {
        // ドラフト保存
        onSave?.(data);
      }
    },
    onSuccess: () => {
      if (threadId) {
        queryClient.invalidateQueries({ queryKey: ['threadSettings', threadId] });
      }
      onClose();
    },
  });

  if (!isOpen) return null;

  // フィルタリングされたモデルリスト
  const filteredModels = models.filter(
    (m) => (m.isEnabled || m.id === modelId) && (!providerId || m.providerId === providerId),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-background border rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-primary">
            {threadId ? 'スレッド設定' : '新規チャット設定'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-lg text-muted-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {saveMutation.error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">
              {String(saveMutation.error)}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label
                htmlFor="provider-select"
                className="text-sm font-medium text-muted-foreground"
              >
                プロバイダー
              </label>
              <select
                id="provider-select"
                value={providerId}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">自動 (モデル設定に従う)</option>
                {providers
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <option key={p.id} value={p.id?.toString()} className="bg-background">
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="model-select" className="text-sm font-medium text-muted-foreground">
                使用モデル
              </label>
              <select
                id="model-select"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:ring-1 focus:ring-primary/50"
              >
                {filteredModels.length === 0 && (
                  <option value="">利用可能なモデルがありません</option>
                )}
                {filteredModels.map((m) => (
                  <option key={m.id} value={m.id} className="bg-background">
                    {m.name} {!m.isEnabled && '(無効)'}
                  </option>
                ))}
              </select>
              {filteredModels.length === 0 && (
                <p className="text-xs text-destructive">プロバイダー設定を確認してください。</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="system-prompt" className="text-sm font-medium text-muted-foreground">
              システムプロンプト
            </label>
            <textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="AIの振る舞いや役割を定義します（例: あなたは優秀なプログラマーです）"
              className="w-full h-32 bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:ring-1 focus:ring-primary/50 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="max-tokens" className="text-sm font-medium text-muted-foreground">
                Max Tokens <span className="text-xs opacity-50">(Optional)</span>
              </label>
              <input
                id="max-tokens"
                type="number"
                min={1}
                value={maxTokens === undefined ? '' : maxTokens}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setMaxTokens(undefined);
                  } else {
                    const num = Number(val);
                    if (num >= 1) setMaxTokens(num);
                  }
                }}
                placeholder="無制限"
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="context-window" className="text-sm font-medium text-muted-foreground">
                Context Window (Msgs) <span className="text-xs opacity-50">(Optional)</span>
              </label>
              <input
                id="context-window"
                type="number"
                min={1}
                value={contextWindow === undefined ? '' : contextWindow}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setContextWindow(undefined);
                  } else {
                    const num = Number(val);
                    if (num >= 1) setContextWindow(num);
                  }
                }}
                placeholder="全履歴"
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="extra-params" className="text-sm font-medium text-muted-foreground">
              Extra Params (JSON) <span className="text-xs opacity-50">(Advanced)</span>
            </label>
            <textarea
              id="extra-params"
              value={extraParams}
              onChange={(e) => setExtraParams(e.target.value)}
              placeholder='{"temperature": 0.7, "top_p": 1.0}'
              className="w-full h-24 bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground font-mono text-xs outline-none focus:ring-1 focus:ring-primary/50 resize-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-3 bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all shadow-md disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
