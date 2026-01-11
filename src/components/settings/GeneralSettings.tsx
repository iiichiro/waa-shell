import { Keyboard, MousePointer2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function GeneralSettings() {
  const { sendShortcut, setSendShortcut, theme, setTheme } = useAppStore();

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Keyboard className="w-5 h-5 text-primary" />
          <span>入力と送信</span>
        </h3>

        <div className="bg-muted/30 border border-border rounded-lg p-6 space-y-6">
          <div className="flex items-center justify-between">
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

          <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-md border border-border leading-relaxed">
            {sendShortcut === 'enter' ? (
              <p>
                •{' '}
                <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-text-primary border border-white/10">
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
        <div className="bg-muted/30 border border-border rounded-lg p-6 space-y-6">
          <div className="flex items-center justify-between">
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
    </div>
  );
}
