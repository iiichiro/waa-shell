import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * エラーバウンダリ：React コンポーネントのエラーをキャッチして表示
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-background text-foreground p-8 overflow-auto border-t-4 border-destructive">
          <h1 className="text-2xl font-bold mb-4 text-destructive">アプリケーションエラー</h1>
          <p className="mb-4 text-muted-foreground">予期しないエラーが発生しました。</p>
          <details className="bg-destructive/10 p-4 rounded-lg border border-destructive/20">
            <summary className="cursor-pointer font-semibold text-destructive">エラー詳細</summary>
            <pre className="mt-2 text-xs whitespace-pre-wrap font-mono">
              {this.state.error?.toString()}
              {'\n\n'}
              {this.state.errorInfo?.componentStack}
            </pre>
          </details>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg font-bold transition-all shadow-lg"
          >
            アプリを再起動
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
