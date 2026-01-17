import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createSettingsSlice, type SettingsSlice } from './slices/SettingsSlice';
import { createToolsSlice, type ToolsSlice } from './slices/ToolsSlice';
import { createUISlice, type UISlice } from './slices/UISlice';

/**
 * アプリケーション全体のUI状態を管理するストア
 * Slice Patternを使用して分割管理しています
 */
export type AppState = UISlice & SettingsSlice & ToolsSlice;

export const useAppStore = create<AppState>()(
  persist(
    (...a) => ({
      ...createUISlice(...a),
      ...createSettingsSlice(...a),
      ...createToolsSlice(...a),
    }),
    {
      name: 'aichat-app-storage',
      partialize: (state) => ({
        // SettingsSlice
        sendShortcut: state.sendShortcut,
        theme: state.theme,
        autoGenerateTitle: state.autoGenerateTitle,
        titleGenerationProvider: state.titleGenerationProvider,
        titleGenerationModel: state.titleGenerationModel,

        // UISlice
        isSidebarOpen: state.isSidebarOpen,

        // ToolsSlice
        enabledTools: state.enabledTools,
      }),
    },
  ),
);
