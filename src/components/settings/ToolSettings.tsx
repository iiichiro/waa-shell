import { Globe, type LucideIcon, Wrench, Zap } from 'lucide-react';
import { getLocalTools } from '../../lib/services/ToolService';
import { useAppStore } from '../../store/useAppStore';
import { EmptyState } from '../common/EmptyState';
import { Switch } from '../common/Switch';

interface ToolCardProps {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  isEnabled: boolean;
  onToggle: (checked: boolean) => void;
}

function ToolCard({ id, name, description, icon: Icon, isEnabled, onToggle }: ToolCardProps) {
  return (
    <div className="flex items-start justify-between p-4 rounded-lg border bg-muted/30 text-foreground transition-all hover:border-primary border-primary/20">
      <div className="flex items-start gap-4">
        <div className="mt-1 p-2 rounded-md bg-primary/10 text-primary">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-foreground mb-1.5">{name}</h4>
          <p className="text-sm text-muted-foreground mb-2">{description}</p>
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground block w-fit">
            {id}
          </code>
        </div>
      </div>
      <div className="flex items-center">
        <Switch checked={isEnabled} onChange={onToggle} />
      </div>
    </div>
  );
}

export function ToolSettings() {
  const { enabledTools, setToolEnabled, enabledBuiltInTools, setBuiltInToolEnabled } =
    useAppStore();
  const localTools = getLocalTools();

  const builtInTools = [
    {
      id: 'web_search',
      name: 'Web 検索',
      description:
        'プロバイダー（LiteLLM, OpenAI, Anthropic, Google）が提供する Web 検索機能を有効にします。',
      icon: Globe,
    },
  ];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right">
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            組み込みツール設定
          </h3>
          <p className="text-xs text-muted-foreground">
            プロバイダー側で提供されるネイティブ機能を有効にします。
          </p>
        </div>

        <div className="grid gap-4">
          {builtInTools.map((tool) => (
            <ToolCard
              key={tool.id}
              id={tool.id}
              name={tool.name}
              description={tool.description}
              icon={tool.icon}
              isEnabled={enabledBuiltInTools[tool.id] === true}
              onToggle={(checked) => setBuiltInToolEnabled(tool.id, checked)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary" />
            ローカルツール設定
          </h3>
          <p className="text-xs text-muted-foreground">
            AIが使用できるローカル機能の有効化・無効化を切り替えます。
          </p>
        </div>

        <div className="grid gap-4">
          {localTools.map((tool) => (
            <ToolCard
              key={tool.id}
              id={tool.id}
              name={tool.name}
              description={tool.description}
              icon={Wrench}
              isEnabled={enabledTools[tool.id] !== false}
              onToggle={(checked) => setToolEnabled(tool.id, checked)}
            />
          ))}

          {localTools.length === 0 && (
            <EmptyState
              icon={Wrench}
              title="利用可能なローカルツールはありません"
              description="現在、登録されているローカルツールが存在しません。"
            />
          )}
        </div>
      </div>
    </div>
  );
}
