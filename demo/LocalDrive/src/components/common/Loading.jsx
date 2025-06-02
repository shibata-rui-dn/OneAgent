import React from 'react';

/**
 * ローディングコンポーネント
 */
const Loading = ({ 
  size = 'medium',
  variant = 'spinner',
  message = 'ロード中...',
  fullscreen = false,
  overlay = false,
  className = ''
}) => {
  // サイズスタイル
  const sizeStyles = {
    small: {
      spinner: 'h-4 w-4',
      container: 'p-2',
      text: 'text-xs'
    },
    medium: {
      spinner: 'h-8 w-8',
      container: 'p-4',
      text: 'text-sm'
    },
    large: {
      spinner: 'h-12 w-12',
      container: 'p-6',
      text: 'text-base'
    }
  };

  const currentSize = sizeStyles[size];

  // スピナーコンポーネント
  const Spinner = ({ className: spinnerClass = '' }) => (
    <svg 
      className={`animate-spin ${currentSize.spinner} ${spinnerClass}`}
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24"
    >
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4"
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  // ドットローディング
  const DotsLoading = () => (
    <div className="flex space-x-1">
      <div className={`bg-current rounded-full animate-bounce ${
        size === 'small' ? 'h-1 w-1' : 
        size === 'medium' ? 'h-2 w-2' : 'h-3 w-3'
      }`}></div>
      <div className={`bg-current rounded-full animate-bounce ${
        size === 'small' ? 'h-1 w-1' : 
        size === 'medium' ? 'h-2 w-2' : 'h-3 w-3'
      }`} style={{ animationDelay: '0.1s' }}></div>
      <div className={`bg-current rounded-full animate-bounce ${
        size === 'small' ? 'h-1 w-1' : 
        size === 'medium' ? 'h-2 w-2' : 'h-3 w-3'
      }`} style={{ animationDelay: '0.2s' }}></div>
    </div>
  );

  // パルスローディング
  const PulseLoading = () => (
    <div className="flex space-x-1">
      <div className={`bg-current rounded-full animate-pulse ${
        size === 'small' ? 'h-2 w-2' : 
        size === 'medium' ? 'h-3 w-3' : 'h-4 w-4'
      }`}></div>
      <div className={`bg-current rounded-full animate-pulse ${
        size === 'small' ? 'h-2 w-2' : 
        size === 'medium' ? 'h-3 w-3' : 'h-4 w-4'
      }`} style={{ animationDelay: '0.2s' }}></div>
      <div className={`bg-current rounded-full animate-pulse ${
        size === 'small' ? 'h-2 w-2' : 
        size === 'medium' ? 'h-3 w-3' : 'h-4 w-4'
      }`} style={{ animationDelay: '0.4s' }}></div>
    </div>
  );

  // ローディングコンテンツ
  const LoadingContent = () => (
    <div className={`
      flex flex-col items-center justify-center text-gray-500
      ${currentSize.container}
      ${className}
    `}>
      {/* ローディングアニメーション */}
      <div className="mb-3">
        {variant === 'spinner' && <Spinner />}
        {variant === 'dots' && <DotsLoading />}
        {variant === 'pulse' && <PulseLoading />}
      </div>
      
      {/* メッセージ */}
      {message && (
        <p className={`text-center font-medium ${currentSize.text}`}>
          {message}
        </p>
      )}
    </div>
  );

  // フルスクリーンモード
  if (fullscreen) {
    return (
      <div className={`
        fixed inset-0 flex items-center justify-center
        ${overlay ? 'bg-white bg-opacity-90 backdrop-blur-sm' : 'bg-white'}
        z-50
      `}>
        <LoadingContent />
      </div>
    );
  }

  // オーバーレイモード
  if (overlay) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 backdrop-blur-sm z-40">
        <LoadingContent />
      </div>
    );
  }

  // 通常モード
  return <LoadingContent />;
};

/**
 * インラインスピナー（テキストと並べて使用）
 */
export const InlineSpinner = ({ 
  size = 'small', 
  className = 'text-gray-400' 
}) => {
  const sizeMap = {
    small: 'h-4 w-4',
    medium: 'h-5 w-5',
    large: 'h-6 w-6'
  };

  return (
    <svg 
      className={`animate-spin ${sizeMap[size]} ${className}`}
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24"
    >
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4"
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
};

/**
 * スケルトンローディング
 */
export const SkeletonLoader = ({ 
  lines = 3, 
  height = 'h-4', 
  className = '' 
}) => {
  return (
    <div className={`animate-pulse space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div 
          key={index}
          className={`bg-gray-300 rounded ${height} ${
            index === lines - 1 ? 'w-3/4' : 'w-full'
          }`}
        />
      ))}
    </div>
  );
};

/**
 * カードスケルトン
 */
export const CardSkeleton = ({ className = '' }) => {
  return (
    <div className={`animate-pulse ${className}`}>
      <div className="bg-gray-300 rounded-lg h-48 mb-4"></div>
      <div className="space-y-2">
        <div className="bg-gray-300 rounded h-4 w-3/4"></div>
        <div className="bg-gray-300 rounded h-4 w-1/2"></div>
      </div>
    </div>
  );
};

/**
 * テーブルスケルトン
 */
export const TableSkeleton = ({ 
  rows = 5, 
  columns = 4, 
  className = '' 
}) => {
  return (
    <div className={`animate-pulse space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex space-x-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div 
              key={colIndex}
              className="bg-gray-300 rounded h-4 flex-1"
            />
          ))}
        </div>
      ))}
    </div>
  );
};

/**
 * プログレスバー付きローディング
 */
export const ProgressLoading = ({ 
  progress = 0, 
  message = 'ロード中...', 
  className = '' 
}) => {
  return (
    <div className={`flex flex-col items-center space-y-4 ${className}`}>
      <InlineSpinner size="large" />
      
      <div className="w-full max-w-xs">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>{message}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default Loading;