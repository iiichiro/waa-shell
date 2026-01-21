import {
  ChevronDown,
  FolderOpen,
  Menu,
  Plus,
  RefreshCw,
  Settings,
  Settings2,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import type { Provider } from '../../lib/db';
import type { ModelInfo } from '../../lib/services/ModelService';
import { ModelCapabilityIndicators } from './ModelCapabilityIndicators';

interface ChatHeaderProps {
  isLauncher: boolean;
  activeThreadId: number | null;
  activeThreadTitle?: string;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenThreadSettings: () => void;
  onOpenFileExplorer: (threadId: number) => void;
  onCloseLauncher: () => void;

  // Model states
  models: ModelInfo[];
  providers: Provider[];
  selectedModelId: string;
  selectedProviderId: string;
  handleModelChange: (modelId: string, providerId: string) => void;

  // Title editing
  editingTitle: boolean;
  titleInput: string;
  setTitleInput: (val: string) => void;
  setEditingTitle: (val: boolean) => void;
  handleTitleUpdate: () => void;

  // Tools
  enabledTools: Record<string, boolean>;
  setToolEnabled: (toolId: string, enabled: boolean) => void;

  // Thread settings draft
  hasDraftSettings: boolean;

  // Loading state
  isModelsLoading: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  isLauncher,
  activeThreadId,
  activeThreadTitle,
  isSidebarOpen,
  toggleSidebar,
  onNewChat,
  onOpenSettings,
  onOpenThreadSettings,
  onOpenFileExplorer,
  onCloseLauncher,
  models,
  providers,
  selectedModelId,
  selectedProviderId,
  handleModelChange,
  editingTitle,
  titleInput,
  setTitleInput,
  setEditingTitle,
  handleTitleUpdate,
  isModelsLoading,
}) => {
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [editingTitle]);

  // 有効なモデルのみを表示対象とする
  const enabledModels = models.filter((m) => m.isEnabled);

  // Group models by category
  const manualModels = enabledModels.filter((m) => m.isManual || m.isCustom);
  const apiModels = enabledModels.filter((m) => !m.isManual && !m.isCustom);

  // 複合ID生成ヘルパー
  const getCompositeId = (m: ModelInfo) => `${m.providerId}::${m.id}`;
  const currentCompositeId = `${selectedProviderId}::${selectedModelId}`;

  return (
    <header
      className={`${isLauncher ? 'h-11 px-3' : 'h-14 px-4 md:px-6'} border-b flex items-center justify-between bg-background/80 backdrop-blur-xl z-40 sticky top-0 ${isLauncher ? 'cursor-move select-none' : ''}`}
      data-tauri-drag-region={isLauncher ? 'true' : undefined}
    >
      {/* 1. Context Area (Left) */}
      <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0" data-tauri-drag-region>
        {!isLauncher && (
          <button
            type="button"
            className="p-2 -ml-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            onClick={toggleSidebar}
            title={isSidebarOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'}
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-1 min-w-0 max-w-[200px] md:max-w-[400px]">
          {activeThreadId ? (
            editingTitle ? (
              <input
                ref={titleInputRef}
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={handleTitleUpdate}
                onKeyDown={(e) => e.key === 'Enter' && handleTitleUpdate()}
                className="flex-1 bg-muted border rounded-lg px-3 py-1 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring min-w-0"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className={`font-bold text-foreground text-left cursor-text hover:bg-muted px-2 py-0.5 rounded-md truncate min-w-0 transition-colors ${isLauncher ? 'text-xs' : 'text-sm'}`}
                title="クリックしてタイトルを編集"
              >
                {activeThreadTitle || 'チャット中'}
              </button>
            )
          ) : (
            <span
              className={`font-bold text-muted-foreground truncate ${isLauncher ? 'text-xs' : 'text-sm'}`}
            >
              新規チャット
            </span>
          )}

          {activeThreadId && !isLauncher && (
            <button
              type="button"
              onClick={() => onOpenFileExplorer(activeThreadId)}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
              title="このスレッドのファイル"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Model Selection Area */}
      <div className="flex items-center justify-end gap-2 px-2 flex-1 max-w-md">
        <div className="hidden md:flex items-center shrink-0">
          <ModelCapabilityIndicators
            model={models.find(
              (m) => m.id === selectedModelId && m.providerId === selectedProviderId,
            )}
          />
        </div>

        <div className="relative group w-full max-w-[200px] md:max-w-[240px]">
          {/* Visual Layer for Ellipsis & Style */}
          <div className="w-full flex items-center bg-muted/50 hover:bg-muted border border-transparent hover:border-border rounded pl-4 pr-8 md:pr-10 py-1.5 transition-all text-left">
            <span className="text-xs font-bold text-foreground truncate select-none">
              {(() => {
                if (!selectedModelId) {
                  return '未選択';
                }

                const model = models.find(
                  (m) => m.id === selectedModelId && m.providerId === selectedProviderId,
                );
                const provider = providers.find((p) => p.id?.toString() === model?.providerId);

                if (model) {
                  return `${model.name} [${provider?.name || model.provider || model.providerId}]`;
                }

                if (isModelsLoading) {
                  return '読み込み中...';
                }

                return selectedModelId || '未選択';
              })()}
            </span>
            {isModelsLoading && (
              <RefreshCw className="w-3 h-3 ml-2 animate-spin text-primary shrink-0" />
            )}
          </div>

          {/* Hidden Trigger Select */}
          <select
            value={currentCompositeId}
            onChange={(e) => {
              const [pId, ...mIds] = e.target.value.split('::');
              handleModelChange(mIds.join('::'), pId);
            }}
            disabled={isModelsLoading}
            className={`absolute inset-0 w-full h-full appearance-none bg-transparent text-transparent z-20 ${isModelsLoading ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            title={(() => {
              const selectedModel = models.find(
                (m) => m.id === selectedModelId && m.providerId === selectedProviderId,
              );
              if (!selectedModel) return `モデル: ${selectedModelId}`;
              const provider = providers.find((p) => p.id?.toString() === selectedModel.providerId);
              return `${selectedModel.name || selectedModel.id} [${provider?.name || selectedModel.provider || '不明'}]`;
            })()}
          >
            {enabledModels.length === 0 ? (
              <option className="text-foreground bg-popover">モデルなし</option>
            ) : (
              <>
                {manualModels.length > 0 && (
                  <optgroup
                    label="ユーザー定義"
                    className="text-xs text-foreground bg-popover font-semibold"
                  >
                    {manualModels.map((m) => {
                      const provider = providers.find((p) => p.id?.toString() === m.providerId);
                      return (
                        <option
                          key={getCompositeId(m)}
                          value={getCompositeId(m)}
                          className="text-foreground bg-popover"
                        >
                          {m.name} [{provider?.name || m.provider || m.providerId}]
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                {apiModels.length > 0 && (
                  <optgroup
                    label="APIモデル"
                    className="text-xs text-foreground bg-popover font-semibold"
                  >
                    {apiModels.map((m) => {
                      const provider = providers.find((p) => p.id?.toString() === m.providerId);
                      return (
                        <option
                          key={getCompositeId(m)}
                          value={getCompositeId(m)}
                          className="text-foreground bg-popover"
                        >
                          {m.name} [{provider?.name || m.provider || m.providerId}]
                        </option>
                      );
                    })}
                  </optgroup>
                )}
              </>
            )}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
            <ChevronDown className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* 3. Action Area (Right) */}
      <div className="flex items-center shrink-0 justify-end" data-tauri-drag-region>
        <button
          type="button"
          onClick={onNewChat}
          className="p-2 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all shrink-0"
          title="新規チャット"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            onOpenThreadSettings();
          }}
          className="p-2 rounded-lg hover:bg-accent transition-colors"
        >
          <Settings2 className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => {
            onOpenSettings();
          }}
          className="p-2 rounded-lg hover:bg-accent transition-colors"
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
        </button>
        {isLauncher && (
          <button
            type="button"
            onClick={() => {
              onCloseLauncher();
            }}
            className="p-2 rounded-lg text-primary hover:bg-destructive transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
