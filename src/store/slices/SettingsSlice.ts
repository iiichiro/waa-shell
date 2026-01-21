import type { StateCreator } from 'zustand';
import {
  DEFAULT_AUTO_GENERATE_TITLE,
  DEFAULT_SEND_SHORTCUT,
  DEFAULT_THEME,
} from '../../lib/constants/ConfigConstants';

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
  sendShortcut: DEFAULT_SEND_SHORTCUT,
  setSendShortcut: (shortcut) => set({ sendShortcut: shortcut }),
  theme: DEFAULT_THEME,
  setTheme: (theme) => set({ theme }),
  autoGenerateTitle: DEFAULT_AUTO_GENERATE_TITLE,
  setAutoGenerateTitle: (autoGenerate) => set({ autoGenerateTitle: autoGenerate }),
  titleGenerationProvider: '',
  setTitleGenerationProvider: (providerId) => set({ titleGenerationProvider: providerId }),
  titleGenerationModel: '',
  setTitleGenerationModel: (modelId) => set({ titleGenerationModel: modelId }),
});
