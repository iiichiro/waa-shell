import type { StateCreator } from 'zustand';

export interface SettingsSlice {
  sendShortcut: 'enter' | 'ctrl-enter';
  setSendShortcut: (shortcut: 'enter' | 'ctrl-enter') => void;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  autoGenerateTitle: boolean;
  setAutoGenerateTitle: (autoGenerate: boolean) => void;
  titleGenerationProvider: string;
  setTitleGenerationProvider: (providerId: string) => void;
  titleGenerationModel: string;
  setTitleGenerationModel: (modelId: string) => void;
}

export const createSettingsSlice: StateCreator<SettingsSlice, [], [], SettingsSlice> = (set) => ({
  sendShortcut: 'ctrl-enter',
  setSendShortcut: (shortcut) => set({ sendShortcut: shortcut }),
  theme: 'system',
  setTheme: (theme) => set({ theme }),
  autoGenerateTitle: false,
  setAutoGenerateTitle: (autoGenerate) => set({ autoGenerateTitle: autoGenerate }),
  titleGenerationProvider: '',
  setTitleGenerationProvider: (providerId) => set({ titleGenerationProvider: providerId }),
  titleGenerationModel: '',
  setTitleGenerationModel: (modelId) => set({ titleGenerationModel: modelId }),
});
