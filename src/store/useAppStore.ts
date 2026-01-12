import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * アプリケーション全体のUI状態を管理するストア
 */
interface AppState {
  activeThreadId: number | null; // 現在表示中のスレッドID
  setActiveThreadId: (id: number | null) => void;

  isSidebarOpen: boolean; // サイドバーの開閉状態
  toggleSidebar: () => void;

  isLauncher: boolean;
  setIsLauncher: (isLauncher: boolean) => void;

  isSettingsOpen: boolean; // 設定画面の表示状態
  setSettingsOpen: (isOpen: boolean) => void;

  isCommandManagerOpen: boolean;
  setCommandManagerOpen: (isOpen: boolean) => void;

  isFileExplorerOpen: boolean;
  setFileExplorerOpen: (isOpen: boolean) => void;

  isThreadSettingsOpen: boolean;
  setThreadSettingsOpen: (isOpen: boolean) => void;

  // 設定系
  sendShortcut: 'enter' | 'ctrl-enter';
  setSendShortcut: (shortcut: 'enter' | 'ctrl-enter') => void;

  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Title Generation Settings
  autoGenerateTitle: boolean;
  setAutoGenerateTitle: (autoGenerate: boolean) => void;

  titleGenerationProvider: string;
  setTitleGenerationProvider: (providerId: string) => void;

  titleGenerationModel: string;
  setTitleGenerationModel: (modelId: string) => void;

  // Tool Settings
  enabledTools: Record<string, boolean>; // toolId -> boolean
  setToolEnabled: (toolId: string, enabled: boolean) => void;
  removeToolsByServerName: (serverName: string) => void;
}

// Zustandを使用したストアの実装本体
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeThreadId: null,
      setActiveThreadId: (id) =>
        set({
          activeThreadId: id,
          isSettingsOpen: false,
          isCommandManagerOpen: false,
          isFileExplorerOpen: false,
        }),

      isSidebarOpen: true,
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      isLauncher: false,
      setIsLauncher: (isLauncher) => set({ isLauncher }),

      isSettingsOpen: false,
      isCommandManagerOpen: false,
      isFileExplorerOpen: false,

      setSettingsOpen: (isOpen) =>
        set((state) => ({
          isSettingsOpen: isOpen,
          isCommandManagerOpen: isOpen ? false : state.isCommandManagerOpen,
          isFileExplorerOpen: isOpen ? false : state.isFileExplorerOpen,
        })),

      setCommandManagerOpen: (isOpen) =>
        set((state) => ({
          isCommandManagerOpen: isOpen,
          isSettingsOpen: isOpen ? false : state.isSettingsOpen,
          isFileExplorerOpen: isOpen ? false : state.isFileExplorerOpen,
        })),

      setFileExplorerOpen: (isOpen) =>
        set((state) => ({
          isFileExplorerOpen: isOpen,
          isSettingsOpen: isOpen ? false : state.isSettingsOpen,
          isCommandManagerOpen: isOpen ? false : state.isCommandManagerOpen,
        })),

      sendShortcut: 'ctrl-enter',
      setSendShortcut: (shortcut) => set({ sendShortcut: shortcut }),

      theme: 'system',
      setTheme: (theme) => set({ theme }),

      isThreadSettingsOpen: false,
      setThreadSettingsOpen: (isOpen) => set({ isThreadSettingsOpen: isOpen }),

      // Title Generation Settings
      autoGenerateTitle: false,
      setAutoGenerateTitle: (autoGenerate) => set({ autoGenerateTitle: autoGenerate }),

      titleGenerationProvider: '',
      setTitleGenerationProvider: (providerId) => set({ titleGenerationProvider: providerId }),

      titleGenerationModel: '',
      setTitleGenerationModel: (modelId) => set({ titleGenerationModel: modelId }),

      // Tool Settings
      enabledTools: {}, // Default empty means all enabled (or logic handles undefined as enabled)
      setToolEnabled: (toolId, enabled) =>
        set((state) => ({
          enabledTools: { ...state.enabledTools, [toolId]: enabled },
        })),
      removeToolsByServerName: (serverName) =>
        set((state) => {
          const prefix = `${serverName}__`;
          const newEnabledTools = { ...state.enabledTools };
          let changed = false;
          for (const key in newEnabledTools) {
            if (key.startsWith(prefix)) {
              delete newEnabledTools[key];
              changed = true;
            }
          }
          return changed ? { enabledTools: newEnabledTools } : state;
        }),
    }),
    {
      name: 'aichat-app-storage',
      partialize: (state) => ({
        sendShortcut: state.sendShortcut,
        isSidebarOpen: state.isSidebarOpen,
        theme: state.theme,
        autoGenerateTitle: state.autoGenerateTitle,
        titleGenerationProvider: state.titleGenerationProvider,
        titleGenerationModel: state.titleGenerationModel,
        enabledTools: state.enabledTools,
      }),
    },
  ),
);
