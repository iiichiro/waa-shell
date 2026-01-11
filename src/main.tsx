import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

import { seedProviders } from './lib/services/ProviderService';
import { seedSlashCommands } from './lib/services/TemplateService';

// グローバルエラーハンドラ
window.onerror = (message, source, lineno, colno, error) => {
  console.error('Global error:', message, source, lineno, colno, error);
  document.body.innerHTML = `<div style="padding:20px;color:red;background:#1a1a1a;height:100vh;">
    <h1>アプリケーションエラー (Global)</h1>
    <pre>${message}\n${source}:${lineno}:${colno}\n${error?.stack || ''}</pre>
  </div>`;
};

window.onunhandledrejection = (event) => {
  console.error('Unhandled rejection:', event.reason);
  document.body.innerHTML = `<div style="padding:20px;color:red;background:#1a1a1a;height:100vh;">
    <h1>アプリケーションエラー (Promise)</h1>
    <pre>${event.reason}</pre>
  </div>`;
};

const queryClient = new QueryClient();

// 初期シードデータの投入
try {
  seedSlashCommands();
  seedProviders();
} catch (error) {
  console.error('Seed error:', error);
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
);
