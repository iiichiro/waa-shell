import type { StateCreator } from 'zustand';

export interface UISlice {
  activeThreadId: number | null;
  setActiveThreadId: (id: number | null) => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  isLauncher: boolean;
  setIsLauncher: (isLauncher: boolean) => void;
  isSettingsOpen: boolean;
  setSettingsOpen: (isOpen: boolean) => void;
  isCommandManagerOpen: boolean;
  setCommandManagerOpen: (isOpen: boolean) => void;
  isFileExplorerOpen: boolean;
  fileExplorerThreadId: number | null;
  setFileExplorerOpen: (isOpen: boolean, threadId?: number | null) => void;
  isThreadSettingsOpen: boolean;
  setThreadSettingsOpen: (isOpen: boolean) => void;
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
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
  setSettingsOpen: (isOpen) =>
    set((state) => ({
      isSettingsOpen: isOpen,
      isCommandManagerOpen: isOpen ? false : state.isCommandManagerOpen,
      isFileExplorerOpen: isOpen ? false : state.isFileExplorerOpen,
    })),
  isCommandManagerOpen: false,
  setCommandManagerOpen: (isOpen) =>
    set((state) => ({
      isCommandManagerOpen: isOpen,
      isSettingsOpen: isOpen ? false : state.isSettingsOpen,
      isFileExplorerOpen: isOpen ? false : state.isFileExplorerOpen,
    })),
  isFileExplorerOpen: false,
  fileExplorerThreadId: null,
  setFileExplorerOpen: (isOpen, threadId = null) =>
    set((state) => ({
      isFileExplorerOpen: isOpen,
      fileExplorerThreadId: threadId,
      isSettingsOpen: isOpen ? false : state.isSettingsOpen,
      isCommandManagerOpen: isOpen ? false : state.isCommandManagerOpen,
    })),
  isThreadSettingsOpen: false,
  setThreadSettingsOpen: (isOpen) => set({ isThreadSettingsOpen: isOpen }),
});
