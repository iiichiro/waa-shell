import { useEffect, useRef, useState } from 'react';
import type { McpAppUiData } from '../../lib/db';
import { fetchMcpAppResource } from '../../lib/services/McpAppResourceService';

interface McpAppHostProps {
  mcpAppUi: McpAppUiData;
  onError?: (error: string) => void;
}

/**
 * MCP Appをsandboxed iframe内でレンダリングするホストコンポーネント
 *
 * このコンポーネントは以下の責務を持つ：
 * 1. UIリソースの取得（ui://スキームからHTMLをフェッチ）
 * 2. sandboxed iframeの作成とレンダリング
 * 3. App BridgeプロトコルによるpostMessage通信
 * 4. ツール呼び出しの転送と結果の返却
 */
export function McpAppHost({ mcpAppUi, onError }: McpAppHostProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeHeight, setIframeHeight] = useState(300);

  // UIリソースを取得
  useEffect(() => {
    let isMounted = true;

    async function loadResource() {
      try {
        setIsLoading(true);
        setError(null);

        const html = await fetchMcpAppResource(mcpAppUi);

        if (!isMounted) return;

        if (html === null) {
          const errorMsg = 'MCP Appリソースの取得に失敗しました';
          setError(errorMsg);
          onError?.(errorMsg);
        } else {
          setHtmlContent(html);
        }
      } catch (err) {
        if (!isMounted) return;
        const errorMsg = err instanceof Error ? err.message : '不明なエラー';
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadResource();

    return () => {
      isMounted = false;
    };
  }, [mcpAppUi, onError]);

  // iframe高さの動的調整
  // biome-ignore lint/correctness/useExhaustiveDependencies: htmlContent is required to re-setup observer when content changes
  useEffect(() => {
    if (!iframeRef.current || !containerRef.current) return;

    const iframe = iframeRef.current;
    let resizeObserver: ResizeObserver | null = null;

    // iframeのcontentDocumentのサイズ変更を監視
    const setupResizeObserver = () => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc?.body) return;

        resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const newHeight = entry.contentRect.height;
            // 最小高さ300px、最大高さ800pxで制限
            setIframeHeight(Math.min(Math.max(newHeight, 300), 800));
          }
        });

        resizeObserver.observe(iframeDoc.body);
      } catch (err) {
        // クロスオリジン制約などでアクセスできない場合は無視
        console.warn('Could not setup ResizeObserver for iframe:', err);
      }
    };

    // iframeロード完了後にResizeObserverをセットアップ
    const handleLoad = () => {
      setupResizeObserver();
    };

    iframe.addEventListener('load', handleLoad);

    // 既にロード済みの場合は直接セットアップ
    if (iframe.contentDocument?.readyState === 'complete') {
      setupResizeObserver();
    }

    return () => {
      iframe.removeEventListener('load', handleLoad);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [htmlContent]);

  // App Bridgeの初期化と通信管理
  useEffect(() => {
    if (!htmlContent || !iframeRef.current) return;

    const iframe = iframeRef.current;

    // postMessageハンドラ
    const handleMessage = (event: MessageEvent) => {
      // セキュリティ: iframeからのメッセージのみ処理
      if (event.source !== iframe.contentWindow) return;

      // MCP App Bridgeプロトコルのメッセージを処理
      try {
        const data = event.data;
        if (typeof data !== 'object' || data === null) return;

        // JSON-RPC形式のメッセージを確認
        if (data.jsonrpc !== '2.0') return;

        handleAppBridgeMessage(data, iframe);
      } catch (err) {
        console.error('Error handling App Bridge message:', err);
      }
    };

    window.addEventListener('message', handleMessage);

    // iframeロード完了後に初期化メッセージを送信
    const handleLoad = () => {
      // ui/initializeメッセージを送信
      sendInitializeMessage(iframe);
    };

    iframe.addEventListener('load', handleLoad);

    return () => {
      window.removeEventListener('message', handleMessage);
      iframe.removeEventListener('load', handleLoad);
    };
  }, [htmlContent]);

  if (isLoading) {
    return (
      <div className="w-full h-48 flex items-center justify-center bg-muted/30 rounded-lg border border-border">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-sm">MCP Appを読み込み中...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
        <p className="text-sm text-destructive">
          <span className="font-medium">エラー:</span> {error}
        </p>
      </div>
    );
  }

  if (!htmlContent) {
    return (
      <div className="w-full p-4 bg-muted/30 border border-border rounded-lg">
        <p className="text-sm text-muted-foreground">MCP Appのコンテンツを取得できませんでした</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full border border-border rounded-lg overflow-hidden bg-background"
    >
      <iframe
        ref={iframeRef}
        srcDoc={htmlContent}
        sandbox="allow-scripts allow-same-origin"
        className="w-full border-0"
        style={{ height: `${iframeHeight}px` }}
        title="MCP App"
        onError={(e) => {
          console.error('Iframe load error:', e);
          const errorMsg = 'MCP Appの読み込みに失敗しました';
          setError(errorMsg);
          onError?.(errorMsg);
        }}
      />
    </div>
  );
}

/**
 * App Bridgeメッセージを処理する
 */
// biome-ignore lint/suspicious/noExplicitAny: App Bridge message structure varies
function handleAppBridgeMessage(data: any, iframe: HTMLIFrameElement) {
  const { method, id, params } = data;

  switch (method) {
    case 'ui/initialize':
      // 初期化リクエストに応答
      sendResponse(iframe, id, {
        protocolVersion: '2025-11-25',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'waa-shell-mcp-host',
          version: '1.0.0',
        },
      });
      break;

    case 'tools/call':
      // ツール呼び出しリクエストを処理
      handleToolCall(iframe, id, params);
      break;

    case 'ui/updateContext':
      // コンテキスト更新を処理
      console.log('Context update from MCP App:', params);
      break;

    case 'ui/sendMessage':
      // メッセージ送信を処理
      console.log('Message from MCP App:', params);
      break;

    default:
      console.warn('Unknown App Bridge method:', method);
  }
}

/**
 * ツール呼び出しを処理する
 */
// biome-ignore lint/suspicious/noExplicitAny: Tool call params structure varies
async function handleToolCall(iframe: HTMLIFrameElement, id: string | number, params: any) {
  try {
    // ToolServiceを使用してツールを実行
    const { executeTool } = await import('../../lib/services/ToolService');
    const { name, arguments: args } = params;

    const result = await executeTool(name, args);

    // 結果を返却
    sendResponse(iframe, id, {
      content: [{ type: 'text', text: result }],
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'ツール実行エラー';
    sendErrorResponse(iframe, id, errorMsg);
  }
}

/**
 * 初期化メッセージを送信する
 */
function sendInitializeMessage(iframe: HTMLIFrameElement) {
  sendNotification(iframe, 'ui/initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: {
      name: 'waa-shell',
      version: '1.0.0',
    },
  });
}

/**
 * 成功レスポンスを送信する
 */
// biome-ignore lint/suspicious/noExplicitAny: Response data structure varies
function sendResponse(iframe: HTMLIFrameElement, id: string | number, result: any) {
  if (!iframe.contentWindow) return;

  iframe.contentWindow.postMessage(
    {
      jsonrpc: '2.0',
      id,
      result,
    },
    '*',
  );
}

/**
 * エラーレスポンスを送信する
 */
function sendErrorResponse(iframe: HTMLIFrameElement, id: string | number, error: string) {
  if (!iframe.contentWindow) return;

  iframe.contentWindow.postMessage(
    {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: error,
      },
    },
    '*',
  );
}

/**
 * 通知メッセージを送信する
 */
// biome-ignore lint/suspicious/noExplicitAny: Notification params structure varies
function sendNotification(iframe: HTMLIFrameElement, method: string, params: any) {
  if (!iframe.contentWindow) return;

  iframe.contentWindow.postMessage(
    {
      jsonrpc: '2.0',
      method,
      params,
    },
    '*',
  );
}
