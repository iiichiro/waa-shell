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
        <div className="h-screen w-screen bg-red-950 text-red-200 p-8 overflow-auto">
          <h1 className="text-2xl font-bold mb-4">アプリケーションエラー</h1>
          <p className="mb-4">予期しないエラーが発生しました。</p>
          <details className="bg-red-900/50 p-4 rounded-lg">
            <summary className="cursor-pointer font-semibold">エラー詳細</summary>
            <pre className="mt-2 text-xs whitespace-pre-wrap">
              {this.state.error?.toString()}
              {'\n\n'}
              {this.state.errorInfo?.componentStack}
            </pre>
          </details>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg"
          >
            リロード
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
