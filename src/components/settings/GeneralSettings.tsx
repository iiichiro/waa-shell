import { useQuery } from '@tanstack/react-query';
import { Database, Download, Keyboard, MousePointer2, Trash2, Upload, Wand2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { db } from '../../lib/db';
import { listModels, type ModelInfo } from '../../lib/services/ModelService';
import {
  type ClearOptions,
  clearPartialData,
  type ExportOptions,
  exportData,
  importData,
} from '../../lib/utils/backup';
import { useAppStore } from '../../store/useAppStore';
import { Switch } from '../common/Switch';

export function GeneralSettings() {
  const {
    sendShortcut,
    setSendShortcut,
    theme,
    setTheme,
    autoGenerateTitle,
    setAutoGenerateTitle,
    titleGenerationProvider,
    setTitleGenerationProvider,
    titleGenerationModel,
    setTitleGenerationModel,
  } = useAppStore();

  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    history: true,
    providers: true,
    models: true, // プロバイダーと分離されたため、デフォルトで両方ONにする
    tools: true,
    mcp: true,
    slashCommands: true,
    general: true,
  });

  const [clearOptions, setClearOptions] = useState<ClearOptions>({
    history: true,
    files: true,
    providers: true,
    models: true,
    tools: true,
    mcp: true,
    slashCommands: true,
    general: true,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: () => db.providers.toArray(),
  });

  const { data: models = [] } = useQuery<ModelInfo[]>({
    queryKey: ['models'],
    queryFn: () => listModels(),
  });

  const activeProviders = providers.filter((p) => p.isActive);
  const availableModels = models.filter((m) => {
    // もしプロバイダーが選択されていれば、そのプロバイダーのモデルのみ表示
    if (titleGenerationProvider) {
      if (m.isManual || m.isCustom) {
        // manual/custom models usually have providerId
        // check if this model belongs to the selected provider (need to check implementation of ModelInfo)
        // ModelInfo doesn't explicitly have providerId top-level always, but let's assume filtering by source or similar
        // actually ModelService listModels returns mixture.
        // Let's filter by checking if the model's provider matches.
        // But ModelService listModels structure is flat.
        // For simplicity, let's just show all enabled models or try to filter if possible.
        // Since `listModels` aggregates, we might need a way to link model to provider.
        // The `ModelInfo` interface has `providerId` (string).
        return m.providerId === titleGenerationProvider;
      }
      return m.providerId === titleGenerationProvider;
    }
    return true;
  });

  const handleExport = async () => {
    try {
      const data = await exportData(exportOptions);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `waashell_settings_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
      alert('エクスポートに失敗しました。');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('設定をインポートしますか？選択された項目の既存データは上書きされます。')) {
      e.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      await importData(text);
      alert('インポートが完了しました。アプリを再読み込みします。');
      window.location.reload();
    } catch (e) {
      console.error('Import failed:', e);
      alert('インポートに失敗しました。ファイル形式が正しくない可能性があります。');
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right">
      <section>
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Keyboard className="w-5 h-5 text-primary" />
          <span>入力と送信</span>
        </h3>

        <div className="bg-muted/30 border rounded-lg p-6 space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
            <div className="space-y-1">
              <h4 className="font-medium text-foreground">送信ショートカット</h4>
              <p className="text-sm text-muted-foreground">
                メッセージを送信するためのキー操作を選択します。
              </p>
            </div>
            <div className="flex bg-muted p-1 rounded-md border border-border">
              <button
                type="button"
                onClick={() => setSendShortcut('enter')}
                className={`px-4 py-2 rounded-sm text-sm font-medium transition-all ${
                  sendShortcut === 'enter'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                Enter
              </button>
              <button
                type="button"
                onClick={() => setSendShortcut('ctrl-enter')}
                className={`px-4 py-2 rounded-sm text-sm font-medium transition-all ${
                  sendShortcut === 'ctrl-enter'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                Ctrl + Enter
              </button>
            </div>
          </div>

          <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-md border leading-relaxed">
            {sendShortcut === 'enter' ? (
              <p>
                •{' '}
                <kbd className="bg-foreground/10 px-1.5 py-0.5 rounded text-primary border border-border">
                  Enter
                </kbd>{' '}
                で送信
              </p>
            ) : (
              <p>
                •{' '}
                <kbd className="bg-accent px-1.5 py-0.5 rounded text-foreground border border-border">
                  Ctrl
                </kbd>{' '}
                +{' '}
                <kbd className="bg-accent px-1.5 py-0.5 rounded text-foreground border border-border">
                  Enter
                </kbd>{' '}
                で送信
              </p>
            )}
            <p>
              •{' '}
              <kbd className="bg-accent px-1.5 py-0.5 rounded text-foreground border border-border">
                Shift
              </kbd>{' '}
              +{' '}
              <kbd className="bg-accent px-1.5 py-0.5 rounded text-foreground border border-border">
                Enter
              </kbd>{' '}
              は常に改行になります。
            </p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <MousePointer2 className="w-5 h-5 text-primary" />
          <span>表示設定</span>
        </h3>
        <div className="bg-muted/30 border rounded-lg p-6 space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
            <div className="space-y-1">
              <h4 className="font-medium text-foreground">テーマ</h4>
              <p className="text-sm text-muted-foreground">
                アプリケーションの配色テーマを切り替えます。
              </p>
            </div>
            <div className="flex bg-muted p-1 rounded-md border border-border">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`px-4 py-2 rounded-sm text-sm font-medium transition-all capitalize ${
                    theme === t
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  {t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-primary" />
          <span>チャットタイトルの自動生成</span>
        </h3>
        <div className="bg-muted/30 border rounded-lg p-6 space-y-6">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              <h4 className="font-medium text-foreground">自動生成を有効にする</h4>
              <p className="text-sm text-muted-foreground">
                チャット開始時に内容に基づいてタイトルを自動生成します（LLMを使用）。
              </p>
            </div>
            <div className="flex items-center">
              <Switch checked={autoGenerateTitle} onChange={setAutoGenerateTitle} />
            </div>
          </div>

          {autoGenerateTitle && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in">
              <div className="space-y-2">
                <label
                  htmlFor="auto-title-provider-select"
                  className="text-sm font-medium text-foreground"
                >
                  使用するプロバイダー
                </label>
                <select
                  id="auto-title-provider-select"
                  value={titleGenerationProvider}
                  onChange={(e) => {
                    setTitleGenerationProvider(e.target.value);
                    setTitleGenerationModel(''); // Reset model when provider changes
                  }}
                  className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="">プロバイダーを選択</option>
                  {activeProviders.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="auto-title-model-select"
                  className="text-sm font-medium text-foreground"
                >
                  使用するモデル
                </label>
                <select
                  id="auto-title-model-select"
                  value={titleGenerationModel}
                  onChange={(e) => setTitleGenerationModel(e.target.value)}
                  className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  disabled={!titleGenerationProvider}
                >
                  <option value="">モデルを選択</option>
                  {availableModels
                    .filter((m) => m.isEnabled)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  ※軽量なモデル（例: gpt-3.5-turbo, haikuなど）の使用を推奨します
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          <span>設定のバックアップと復元</span>
        </h3>
        <div className="bg-muted/30 border rounded-lg p-6 space-y-6">
          <div className="space-y-4">
            <h4 className="font-medium text-foreground">対象の項目を選択</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { key: 'history', label: 'チャット履歴＋ファイル履歴' },
                { key: 'providers', label: 'プロバイダー設定' },
                { key: 'models', label: 'モデル設定' },
                { key: 'tools', label: 'ツール設定' },
                { key: 'mcp', label: 'MCP設定' },
                { key: 'slashCommands', label: 'スラッシュコマンド設定' },
                { key: 'general', label: '一般設定' },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-3 p-3 bg-muted/50 border border-border rounded-md cursor-pointer hover:bg-muted transition-colors select-none"
                >
                  <input
                    type="checkbox"
                    checked={exportOptions[item.key as keyof ExportOptions]}
                    onChange={(e) =>
                      setExportOptions({ ...exportOptions, [item.key]: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                  />
                  <span className="text-sm font-medium">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-2 border-t">
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              エクスポート実行
            </button>

            <div className="relative">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImport}
                accept=".json"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-background text-foreground hover:bg-muted border border-border rounded-md text-sm font-medium transition-colors"
              >
                <Upload className="w-4 h-4" />
                インポート実行
              </button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground bg-primary/5 p-4 rounded-md border border-primary/10 leading-relaxed shadow-sm">
            <p className="font-semibold text-primary mb-1">💡 ヒント</p>
            <p>
              • エクスポートしたファイルにはAPIキーが含まれます。取り扱いには十分ご注意ください。
            </p>
            <p>• インポートを実行すると、選択された項目の現在のデータは完全に上書きされます。</p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          <span>データ管理</span>
        </h3>
        <div className="bg-muted/30 border rounded-lg p-6 space-y-6">
          <div className="space-y-4">
            <h4 className="font-medium text-destructive">削除する項目を選択</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { key: 'history', label: 'チャット履歴' },
                { key: 'files', label: 'ファイル履歴' },
                { key: 'providers', label: 'プロバイダー設定' },
                { key: 'models', label: 'モデル設定' },
                { key: 'tools', label: 'ツール設定' },
                { key: 'mcp', label: 'MCP設定' },
                { key: 'slashCommands', label: 'スラッシュコマンド設定' },
                { key: 'general', label: '一般設定' },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-3 p-3 bg-muted/50 border border-border rounded-md cursor-pointer hover:bg-muted transition-colors select-none"
                >
                  <input
                    type="checkbox"
                    checked={clearOptions[item.key as keyof ClearOptions]}
                    onChange={(e) =>
                      setClearOptions({ ...clearOptions, [item.key]: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-gray-300 text-destructive focus:ring-destructive cursor-pointer accent-destructive"
                  />
                  <span className="text-sm font-medium">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-start justify-between gap-2 pt-4 border-t border-border">
            <div className="space-y-1 mb-2">
              <p className="text-sm text-muted-foreground">
                選択したデータを削除し、アプリケーションを初期状態に戻します。この操作は取り消せません。
              </p>
            </div>
            <button
              type="button"
              disabled={!Object.values(clearOptions).some((v) => v)}
              onClick={async () => {
                const selectedCount = Object.values(clearOptions).filter(Boolean).length;
                if (selectedCount === 0) return;

                if (!confirm('選択したデータを削除しますか？\nこの操作は取り消せません。')) {
                  return;
                }

                try {
                  await clearPartialData(clearOptions);
                  alert('データの削除が完了しました。アプリを再読み込みします。');
                  window.location.reload();
                } catch (e) {
                  console.error('Failed to clear data:', e);
                  alert('データの削除に失敗しました。');
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Trash2 className="w-4 h-4" />
              選択したデータを削除
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
