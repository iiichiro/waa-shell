import React from 'react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// モック: window.matchMedia (JSDOMには実装されていないため)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// モック: scrollIntoView (JSDOMには実装されていないため)
Element.prototype.scrollIntoView = vi.fn();

// モック: tauri api
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-window', () => ({
  getCurrentWindow: () => ({
    label: 'main',
    hide: vi.fn(),
    show: vi.fn(),
    listen: vi.fn(),
  }),
}));

// モック: lucide-react (svg レンダリングのノイズを避けるため)
vi.mock('lucide-react', () => ({
  Plus: () => React.createElement('span', null, 'Plus'),
  Settings: () => React.createElement('span', null, 'Settings'),
  FileCode: () => React.createElement('span', null, 'FileCode'),
  X: () => React.createElement('span', null, 'X'),
  Trash2: () => React.createElement('span', null, 'Trash2'),
  Save: () => React.createElement('span', null, 'Save'),
  Search: () => React.createElement('span', null, 'Search'),
  Download: () => React.createElement('span', null, 'Download'),
  LayoutGrid: () => React.createElement('span', null, 'LayoutGrid'),
  List: () => React.createElement('span', null, 'List'),
  MessageSquare: () => React.createElement('span', null, 'MessageSquare'),
  Menu: () => React.createElement('span', null, 'Menu'),
  Bot: () => React.createElement('span', null, 'Bot'),
  Globe: () => React.createElement('span', null, 'Globe'),
  Network: () => React.createElement('span', null, 'Network'),
  Sliders: () => React.createElement('span', null, 'Sliders'),
  CheckSquare: () => React.createElement('span', null, 'CheckSquare'),
  Square: () => React.createElement('span', null, 'Square'),
}));

// モック: framer-motion (JSDOM でラグやエラーが出るのを防ぐ)
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
      ({ children, ...props }, ref) => React.createElement('div', { ...props, ref }, children),
    ),
    span: React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
      ({ children, ...props }, ref) => React.createElement('span', { ...props, ref }, children),
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

// モック: IndexedDB (Dexie)
// 簡易的に DB 接続エラーを防ぐための空のモック
vi.mock('../lib/db', () => ({
  db: {
    threads: { toArray: () => Promise.resolve([]) },
    messages: { where: () => ({ toArray: () => Promise.resolve([]) }) },
    slashCommands: { toArray: () => Promise.resolve([]) },
    localFiles: { toArray: () => Promise.resolve([]) },
    modelConfigs: { toArray: () => Promise.resolve([]) },
    on: vi.fn(),
  },
}));
