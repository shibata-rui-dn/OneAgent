import React from 'react';
import { APP_CONFIG } from '../../utils/constants';

/**
 * エラーバウンダリーコンポーネント
 * React アプリケーション内の JavaScript エラーをキャッチし、
 * エラーをログに記録し、フォールバック UI を表示する
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    };
  }

  static getDerivedStateFromError(error) {
    // 次のレンダリングでフォールバック UI が表示されるように state を更新
    return { 
      hasError: true,
      errorId: Date.now().toString(36) + Math.random().toString(36).substr(2)
    };
  }

  componentDidCatch(error, errorInfo) {
    // エラーの詳細をキャプチャ
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // エラーログ
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // 開発環境以外でエラー報告サービスに送信（実装時に追加）
    if (!import.meta.env.DEV) {
      this.reportError(error, errorInfo);
    }
  }

  /**
   * エラー報告（将来的にSentryなどのサービスに送信）
   */
  reportError = (error, errorInfo) => {
    try {
      // TODO: エラー報告サービスへの送信実装
      const errorReport = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        errorId: this.state.errorId
      };
      
      console.log('Error report:', errorReport);
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  };

  /**
   * エラー状態をリセット
   */
  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    });
  };

  /**
   * ページリロード
   */
  handleReload = () => {
    window.location.reload();
  };

  /**
   * エラー詳細の表示切り替え
   */
  toggleErrorDetails = () => {
    this.setState(prevState => ({
      showDetails: !prevState.showDetails
    }));
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, errorId } = this.state;
      const { showDetails } = this.state;

      return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <div className="bg-white py-8 px-6 shadow-xl rounded-xl sm:px-10">
              
              {/* エラーアイコン */}
              <div className="text-center">
                <div className="mx-auto h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
                  <svg 
                    className="h-8 w-8 text-red-600" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                    />
                  </svg>
                </div>

                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  申し訳ございません
                </h1>
                
                <p className="text-gray-600 mb-6">
                  予期しないエラーが発生しました。<br />
                  しばらく時間をおいて再度お試しください。
                </p>

                {/* アクションボタン */}
                <div className="space-y-3 mb-6">
                  <button
                    onClick={this.handleReset}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                  >
                    再試行
                  </button>
                  
                  <button
                    onClick={this.handleReload}
                    className="w-full bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
                  >
                    ページを更新
                  </button>
                </div>

                {/* エラー詳細の表示切り替え */}
                {import.meta.env.DEV && (
                  <button
                    onClick={this.toggleErrorDetails}
                    className="text-sm text-gray-500 hover:text-gray-700 underline"
                  >
                    {showDetails ? 'エラー詳細を隠す' : 'エラー詳細を表示'}
                  </button>
                )}
              </div>

              {/* エラー詳細（開発環境のみ） */}
              {import.meta.env.DEV && showDetails && (
                <div className="mt-6 border-t border-gray-200 pt-6">
                  <div className="space-y-4">
                    
                    {/* エラーID */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 mb-1">
                        エラーID
                      </h3>
                      <code className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        {errorId}
                      </code>
                    </div>

                    {/* エラーメッセージ */}
                    {error && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-1">
                          エラーメッセージ
                        </h3>
                        <div className="bg-red-50 border border-red-200 rounded p-3">
                          <code className="text-xs text-red-800 break-all">
                            {error.toString()}
                          </code>
                        </div>
                      </div>
                    )}

                    {/* スタックトレース */}
                    {error && error.stack && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-1">
                          スタックトレース
                        </h3>
                        <div className="bg-gray-50 border border-gray-200 rounded p-3 max-h-40 overflow-y-auto">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                            {error.stack}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* コンポーネントスタック */}
                    {errorInfo && errorInfo.componentStack && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 mb-1">
                          コンポーネントスタック
                        </h3>
                        <div className="bg-gray-50 border border-gray-200 rounded p-3 max-h-40 overflow-y-auto">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                            {errorInfo.componentStack}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* フッター情報 */}
              <div className="mt-6 border-t border-gray-200 pt-4 text-center">
                <p className="text-xs text-gray-500">
                  {APP_CONFIG.name} v{APP_CONFIG.version}
                </p>
                {errorId && (
                  <p className="text-xs text-gray-400 mt-1">
                    問題が解決しない場合は、エラーID「{errorId}」をお知らせください
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // エラーがない場合は子コンポーネントをそのまま表示
    return this.props.children;
  }
}

/**
 * 関数コンポーネント用のエラーバウンダリーフック
 * （React Hooks ではエラーバウンダリーを実装できないため、
 * クラスコンポーネントをラップする形で提供）
 */
export const withErrorBoundary = (WrappedComponent, errorFallback) => {
  const WithErrorBoundaryComponent = (props) => (
    <ErrorBoundary fallback={errorFallback}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundaryComponent.displayName = 
    `withErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name})`;

  return WithErrorBoundaryComponent;
};

/**
 * カスタムエラーフォールバックコンポーネント
 */
export const ErrorFallback = ({ 
  error, 
  resetError, 
  title = "エラーが発生しました",
  message = "予期しないエラーが発生しました。"
}) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-6 m-4">
    <div className="flex">
      <div className="flex-shrink-0">
        <svg 
          className="h-5 w-5 text-red-400" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
          />
        </svg>
      </div>
      <div className="ml-3">
        <h3 className="text-sm font-medium text-red-800">
          {title}
        </h3>
        <div className="mt-2 text-sm text-red-700">
          <p>{message}</p>
          {import.meta.env.DEV && error && (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium">
                エラー詳細
              </summary>
              <pre className="mt-2 text-xs whitespace-pre-wrap">
                {error.toString()}
              </pre>
            </details>
          )}
        </div>
        {resetError && (
          <div className="mt-4">
            <button
              onClick={resetError}
              className="bg-red-100 hover:bg-red-200 text-red-800 font-medium py-1 px-3 rounded text-sm transition-colors"
            >
              再試行
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
);

export default ErrorBoundary;