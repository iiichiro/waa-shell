import { FileUp, Shell, Wrench } from 'lucide-react';
import type { ModelInfo } from '../../lib/services/ModelService';

interface ModelCapabilityIndicatorsProps {
  model: ModelInfo | undefined;
}

export function ModelCapabilityIndicators({ model }: ModelCapabilityIndicatorsProps) {
  if (!model) return null;

  const capabilities = [
    {
      key: 'files',
      icon: FileUp,
      active: model.supportsImages, // Assuming 'supportsImages' covers generic file input for now
      label: 'ファイル入力',
    },
    {
      key: 'tools',
      icon: Wrench,
      active: model.supportsTools,
      label: 'ツール利用',
    },
    {
      key: 'stream',
      icon: Shell,
      active: model.enableStream,
      label: 'ストリーム生成',
    },
  ];

  return (
    <div className="flex items-center gap-1.5 px-2">
      {capabilities.map((cap) => {
        const Icon = cap.icon;
        return (
          <div
            key={cap.key}
            className={`flex items-center justify-center p-1 rounded-full transition-colors ${
              cap.active
                ? 'text-primary bg-primary/10 hover:bg-primary/20'
                : 'text-muted-foreground/30'
            }`}
            title={`${cap.label}: ${cap.active ? '有効' : '無効または未対応'}`}
          >
            <Icon className="w-3.5 h-3.5" />
          </div>
        );
      })}
    </div>
  );
}
