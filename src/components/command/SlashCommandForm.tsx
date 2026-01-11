import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SlashCommand } from '../../lib/db';
import { fillTemplate } from '../../lib/services/TemplateService';

/**
 * コマンド選択後の変数入力フォーム
 */
interface Props {
  command: SlashCommand;
  onConfirm: (filledPrompt: string) => void;
  onCancel: () => void;
}

export function SlashCommandForm({ command, onConfirm, onCancel }: Props) {
  const firstInputRef = useRef<HTMLTextAreaElement>(null);

  // 変数ごとの値を管理
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initialValues: Record<string, string> = {};
    for (const v of command.variables) {
      initialValues[v.name] = v.defaultValue || '';
    }
    return initialValues;
  });

  // 初回表示時に最初の入力欄にフォーカス
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalPrompt = fillTemplate(command.content, values);
    onConfirm(finalPrompt);
  };

  return (
    <div className="absolute bottom-full left-0 mb-4 w-96 glass rounded-2xl shadow-2xl overflow-hidden z-[110] animate-in fade-in zoom-in-95">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-white/5">
        <div>
          <h3 className="text-sm font-bold text-primary">
            /{command.key} ({command.label})
          </h3>
          <p className="text-[10px] text-secondary">{command.description}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 hover:bg-white/10 rounded-lg text-secondary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {command.variables.map((v, index) => (
          <div key={v.name} className="space-y-1.5 text-left">
            <div className="flex items-center justify-between">
              <label htmlFor={`var-${v.name}`} className="text-xs font-semibold text-primary">
                {v.label}
              </label>
              {v.description && <span className="text-[10px] text-secondary">{v.description}</span>}
            </div>
            <textarea
              id={`var-${v.name}`}
              ref={index === 0 ? firstInputRef : null}
              rows={3}
              className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all resize-none"
              placeholder={v.defaultValue || `${v.label}を入力...`}
              value={values[v.name]}
              onChange={(e) => setValues({ ...values, [v.name]: e.target.value })}
            />
          </div>
        ))}

        <div className="pt-2 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-white/5 transition-colors"
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-primary/20"
          >
            <Check className="w-4 h-4" />
            <span>挿入する</span>
          </button>
        </div>
      </form>
    </div>
  );
}
