import { useQuery } from '@tanstack/react-query';
import { Keyboard, MousePointer2, Wand2 } from 'lucide-react';
import { db } from '../../lib/db';
import { listModels, type ModelInfo } from '../../lib/services/ModelService';
import { useAppStore } from '../../store/useAppStore';

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

  return (
    <div className="space-y-8">
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
                <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-primary border border-white/10">
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
              <button
                type="button"
                role="switch"
                aria-checked={autoGenerateTitle}
                onClick={() => setAutoGenerateTitle(!autoGenerateTitle)}
                className={`w-11 h-6 rounded-full border transition-colors relative ${
                  autoGenerateTitle ? 'bg-primary' : 'bg-input'
                }`}
              >
                <span
                  className={`block w-4 h-4 rounded-full shadow-sm transition-transform absolute top-1 ${
                    autoGenerateTitle ? 'left-6 bg-background' : 'left-1 bg-primary'
                  }`}
                />
              </button>
            </div>
          </div>

          {autoGenerateTitle && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
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
    </div>
  );
}
