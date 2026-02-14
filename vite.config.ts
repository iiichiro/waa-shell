import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules\\react-dom')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules\\react\\')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'ui-vendor';
          }
          if (
            id.includes('node_modules/react-markdown') ||
            id.includes('node_modules/rehype-katex') ||
            id.includes('node_modules/remark-gfm') ||
            id.includes('node_modules/remark-math') ||
            id.includes('node_modules/katex')
          ) {
            return 'markdown-vendor';
          }
          if (id.includes('node_modules/react-syntax-highlighter')) {
            return 'syntax-highlighter';
          }
          if (
            id.includes('node_modules/@tanstack/react-query') ||
            id.includes('node_modules/@tanstack/react-virtual')
          ) {
            return 'tanstack-vendor';
          }
          if (
            id.includes('node_modules/@anthropic-ai') ||
            id.includes('node_modules/openai') ||
            id.includes('node_modules/@google/genai') ||
            id.includes('node_modules/ollama')
          ) {
            return 'ai-providers';
          }
          if (id.includes('node_modules/@modelcontextprotocol')) {
            return 'mcp';
          }
        },
      },
    },
  },
}));
