import { Bot, Globe, Network, Settings as SettingsIcon, Sliders, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { CommandManager } from '../command/CommandManager';
import { FileExplorer } from '../common/FileExplorer';
import { CommonHeader } from '../layout/CommonHeader';
import { GeneralSettings } from './GeneralSettings';
import { McpServerSettings } from './McpServerSettings';
import { ModelSettings } from './ModelSettings';
import { ProviderSettings } from './ProviderSettings';
import { ToolSettings } from './ToolSettings';

type SettingsTab = 'general' | 'provider' | 'mcp' | 'model' | 'tool' | 'commands' | 'files';

/**
 * 設定画面：各種設定へのエントリーポイント
 */
export function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const { isLauncher } = useAppStore();

  return (
    <div
      className="flex flex-col bg-background h-full animate-in fade-in zoom-in-95"
      data-testid="header-settings"
    >
      <CommonHeader
        title="設定"
        icon={SettingsIcon}
        onClose={() => useAppStore.getState().setSettingsOpen(false)}
      >
        <nav className="flex items-center gap-0.5">
          {[
            { id: 'general', label: '一般', icon: Sliders },
            { id: 'provider', label: 'プロバイダー', icon: Globe },
            { id: 'model', label: 'モデル', icon: Bot },
            { id: 'tool', label: 'ツール', icon: Wrench },
            { id: 'mcp', label: 'MCP', icon: Network },
            ...(isLauncher
              ? [
                  { id: 'commands', label: 'コマンド', icon: SettingsIcon },
                  { id: 'files', label: 'ファイル', icon: Globe },
                ]
              : []),
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`flex items-center gap-1.5 rounded-md font-medium transition-all whitespace-nowrap ${
                  isLauncher ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
                } ${
                  active
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                <Icon className={isLauncher ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </CommonHeader>

      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <div
          className={`max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-2 ${isLauncher ? 'p-4' : 'p-6 md:p-8'}`}
        >
          {activeTab === 'general' && <GeneralSettings />}
          {activeTab === 'provider' && <ProviderSettings />}
          {activeTab === 'model' && <ModelSettings />}
          {activeTab === 'tool' && <ToolSettings />}
          {activeTab === 'mcp' && <McpServerSettings />}
          {isLauncher && activeTab === 'commands' && <CommandManager />}
          {isLauncher && activeTab === 'files' && <FileExplorer />}
        </div>
      </main>
    </div>
  );
}
