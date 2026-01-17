import type { StateCreator } from 'zustand';

export interface ToolsSlice {
  enabledTools: Record<string, boolean>;
  setToolEnabled: (toolId: string, enabled: boolean) => void;
  removeToolsByServerName: (serverName: string) => void;
  // 組み込みツールの状態管理を追加
  enabledBuiltInTools: Record<string, boolean>;
  setBuiltInToolEnabled: (toolId: string, enabled: boolean) => void;
}

export const createToolsSlice: StateCreator<ToolsSlice, [], [], ToolsSlice> = (set) => ({
  enabledTools: {},
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
  enabledBuiltInTools: {},
  setBuiltInToolEnabled: (toolId, enabled) =>
    set((state) => ({
      enabledBuiltInTools: { ...state.enabledBuiltInTools, [toolId]: enabled },
    })),
});
