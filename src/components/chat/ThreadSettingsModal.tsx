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
  const [modelId, setModelId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [contextWindow, setContextWindow] = useState<number | undefined>(undefined);
  const [maxTokens, setMaxTokens] = useState<number | undefined>(undefined);
  const [extraParams, setExtraParams] = useState('');

  const queryClient = useQueryClient();

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
      setModelId(settings.modelId || '');
      setSystemPrompt(settings.systemPrompt || '');
      setContextWindow(settings.contextWindow);
      setMaxTokens(settings.maxTokens);
      setExtraParams(settings.extraParams ? JSON.stringify(settings.extraParams, null, 2) : '');
    } else if (models.length > 0 && !modelId) {
      // 設定がない場合はデフォルトモデル（有効なものから最初）を選択状態に
      const firstEnabled = models.find((m) => m.isEnabled) || models[0];
      setModelId(firstEnabled.id);
    }
  }, [dbSettings, initialSettings, models, modelId]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-sidebar border rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="font-semibold text-primary">
            {threadId ? 'スレッド設定' : '新規チャット設定'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg text-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {saveMutation.error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">
              {String(saveMutation.error)}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="model-select" className="text-sm font-medium text-secondary">
              使用モデル
            </label>
            <select
              id="model-select"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-primary outline-none focus:border-brand-primary"
            >
              {models.length === 0 && <option value="">利用可能なモデルがありません</option>}
              {models
                .filter((m) => m.isEnabled || m.id === modelId)
                .map((m) => (
                  <option key={m.id} value={m.id} className="bg-sidebar">
                    {m.name} ({m.provider}) {!m.isEnabled && '(無効)'}
                  </option>
                ))}
            </select>
            {models.length === 0 && (
              <p className="text-xs text-red-400">プロバイダー設定を確認してください。</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="system-prompt" className="text-sm font-medium text-secondary">
              システムプロンプト
            </label>
            <textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="AIの振る舞いや役割を定義します（例: あなたは優秀なプログラマーです）"
              className="w-full h-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-primary outline-none focus:border-brand-primary resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="max-tokens" className="text-sm font-medium text-secondary">
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
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-primary outline-none focus:border-brand-primary"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="context-window" className="text-sm font-medium text-secondary">
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
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-primary outline-none focus:border-brand-primary"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="extra-params" className="text-sm font-medium text-secondary">
              Extra Params (JSON) <span className="text-xs opacity-50">(Advanced)</span>
            </label>
            <textarea
              id="extra-params"
              value={extraParams}
              onChange={(e) => setExtraParams(e.target.value)}
              placeholder='{"temperature": 0.7, "top_p": 1.0}'
              className="w-full h-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-primary font-mono text-xs outline-none focus:border-brand-primary resize-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-black/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-secondary hover:bg-white/10 transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
