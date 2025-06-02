import React from 'react';
import { APP_CONFIG } from '../../utils/constants';

/**
 * 全画面ローディングスクリーンコンポーネント
 * ページ全体の読み込み時に表示される
 * @param {object} props - プロパティ
 * @param {string} props.message - ローディングメッセージ
 * @param {string} props.submessage - サブメッセージ
 * @param {boolean} props.showProgress - プログレスバーを表示するかどうか
 * @param {number} props.progress - プログレス値（0-100）
 * @param {string} props.variant - バリアント ('default' | 'minimal' | 'branded')
 * @param {string} props.className - 追加のCSSクラス
 * @returns {JSX.Element} LoadingScreenコンポーネント
 */
const LoadingScreen = ({
  message = 'ロード中...',
  submessage = '',
  showProgress = false,
  progress = 0,
  variant = 'default',
  className = ''
}) => {
  // バリアント別のレンダリング
  const renderContent = () => {
    switch (variant) {
      case 'minimal':
        return <MinimalLoadingContent message={message} />;
      case 'branded':
        return <BrandedLoadingContent message={message} submessage={submessage} />;
      default:
        return (
          <DefaultLoadingContent 
            message={message} 
            submessage={submessage}
            showProgress={showProgress}
            progress={progress}
          />
        );
    }
  };

  return (
    <div className={`fixed inset-0 bg-white z-50 flex items-center justify-center ${className}`}>
      {renderContent()}
    </div>
  );
};

/**
 * デフォルトローディングコンテンツ
 */
const DefaultLoadingContent = ({ message, submessage, showProgress, progress }) => (
  <div className="text-center max-w-md mx-auto px-4">
    {/* メインローディングスピナー */}
    <div className="mb-8">
      <div className="relative">
        {/* 外側のリング */}
        <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-spin border-t-blue-600 mx-auto"></div>
        
        {/* 内側のドット */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>
        </div>
      </div>
    </div>

    {/* メッセージ */}
    <div className="space-y-3">
      <h2 className="text-xl font-semibold text-gray-900">
        {message}
      </h2>
      
      {submessage && (
        <p className="text-gray-600 text-sm">
          {submessage}
        </p>
      )}
    </div>

    {/* プログレスバー */}
    {showProgress && (
      <div className="mt-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>進行状況</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>
    )}

    {/* 読み込み中のドットアニメーション */}
    <div className="mt-6 flex justify-center space-x-1">
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
    </div>
  </div>
);

/**
 * ミニマルローディングコンテンツ
 */
const MinimalLoadingContent = ({ message }) => (
  <div className="text-center">
    <div className="w-8 h-8 border-2 border-gray-300 rounded-full animate-spin border-t-gray-900 mx-auto mb-4"></div>
    <p className="text-gray-600 text-sm">{message}</p>
  </div>
);

/**
 * ブランド付きローディングコンテンツ
 */
const BrandedLoadingContent = ({ message, submessage }) => (
  <div className="text-center max-w-sm mx-auto px-4">
    {/* アプリロゴ */}
    <div className="mb-8">
      <div className="mx-auto h-20 w-20 bg-blue-600 rounded-xl flex items-center justify-center mb-4 shadow-lg">
        <svg 
          className="h-10 w-10 text-white" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
          />
        </svg>
      </div>
      
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {APP_CONFIG.name}
      </h1>
      
      <div className="text-sm text-gray-500">
        Version {APP_CONFIG.version}
      </div>
    </div>

    {/* ローディングアニメーション */}
    <div className="mb-6">
      <div className="w-12 h-12 border-3 border-blue-200 rounded-full animate-spin border-t-blue-600 mx-auto"></div>
    </div>

    {/* メッセージ */}
    <div className="space-y-2">
      <h2 className="text-lg font-medium text-gray-900">
        {message}
      </h2>
      
      {submessage && (
        <p className="text-gray-600 text-sm">
          {submessage}
        </p>
      )}
    </div>

    {/* フッター */}
    <div className="mt-8 text-xs text-gray-400">
      Powered by OneAgent
    </div>
  </div>
);

/**
 * エラー付きローディングスクリーン
 */
export const ErrorLoadingScreen = ({ 
  title = "読み込みエラー",
  message = "データの読み込みに失敗しました",
  onRetry,
  onGoHome 
}) => (
  <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
    <div className="text-center max-w-md mx-auto px-4">
      {/* エラーアイコン */}
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

      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        {title}
      </h2>
      
      <p className="text-gray-600 mb-6">
        {message}
      </p>

      <div className="space-y-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            再試行
          </button>
        )}
        
        {onGoHome && (
          <button
            onClick={onGoHome}
            className="w-full bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
          >
            ホームに戻る
          </button>
        )}
      </div>
    </div>
  </div>
);

/**
 * 段階的ローディングスクリーン
 */
export const SteppedLoadingScreen = ({ 
  steps = [], 
  currentStep = 0,
  message = 'セットアップ中...' 
}) => (
  <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
    <div className="text-center max-w-lg mx-auto px-4">
      {/* メインローディング */}
      <div className="mb-8">
        <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-spin border-t-blue-600 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-900">{message}</h2>
      </div>

      {/* ステップ表示 */}
      {steps.length > 0 && (
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div 
              key={index} 
              className={`flex items-center p-3 rounded-lg ${
                index < currentStep 
                  ? 'bg-green-50 text-green-800' 
                  : index === currentStep 
                    ? 'bg-blue-50 text-blue-800' 
                    : 'bg-gray-50 text-gray-500'
              }`}
            >
              <div className="flex-shrink-0 mr-3">
                {index < currentStep ? (
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : index === currentStep ? (
                  <div className="w-4 h-4 border-2 border-blue-600 rounded-full animate-spin border-t-transparent"></div>
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300"></div>
                )}
              </div>
              <span className="text-sm font-medium">{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

/**
 * データローディング用のコンテキスト付きローディングスクリーン
 */
export const DataLoadingScreen = ({ 
  entity = 'データ',
  count,
  showTips = true 
}) => {
  const tips = [
    'ファイルは安全に暗号化されて保存されます',
    'Ctrl+F でファイル検索ができます',
    'ドラッグ&ドロップでファイルをアップロードできます',
    'フォルダを作成してファイルを整理しましょう',
    'ファイルの履歴は自動的に保存されます'
  ];

  const randomTip = tips[Math.floor(Math.random() * tips.length)];

  return (
    <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        {/* ローディングアニメーション */}
        <div className="mb-6">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-spin border-t-blue-600 mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* メッセージ */}
        <div className="space-y-2 mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            {entity}を読み込み中
          </h2>
          {count !== undefined && (
            <p className="text-gray-600">
              {count}件のアイテムを処理しています...
            </p>
          )}
        </div>

        {/* ヒント */}
        {showTips && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-800 mb-1">ヒント</p>
                <p className="text-sm text-blue-700">{randomTip}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingScreen;