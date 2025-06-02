import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

/**
 * ログインボタンコンポーネント
 */
const LoginButton = ({ 
  className = '', 
  size = 'large',
  variant = 'primary',
  children,
  disabled = false
}) => {
  const { login, isLoading } = useAuth();
  const [isClicked, setIsClicked] = useState(false);

  const handleLogin = async () => {
    if (isLoading || disabled || isClicked) return;
    
    setIsClicked(true);
    try {
      await login();
    } catch (error) {
      console.error('Login failed:', error);
      setIsClicked(false);
    }
  };

  // サイズスタイル
  const sizeStyles = {
    small: 'px-3 py-2 text-sm',
    medium: 'px-4 py-2 text-base',
    large: 'px-6 py-3 text-lg'
  };

  // バリアントスタイル
  const variantStyles = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white border-transparent',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white border-transparent',
    outline: 'bg-transparent hover:bg-blue-50 text-blue-600 border-blue-600'
  };

  const isDisabled = isLoading || disabled || isClicked;

  return (
    <button
      onClick={handleLogin}
      disabled={isDisabled}
      className={`
        w-full flex justify-center items-center
        ${sizeStyles[size]}
        ${variantStyles[variant]}
        border rounded-lg font-medium
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        ${isDisabled 
          ? 'opacity-50 cursor-not-allowed' 
          : 'hover:shadow-lg active:transform active:scale-[0.98]'
        }
        ${className}
      `}
    >
      {/* ローディングスピナー */}
      {(isLoading || isClicked) && (
        <svg 
          className="animate-spin -ml-1 mr-3 h-5 w-5 text-current" 
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
      )}

      {/* アイコン */}
      {!isLoading && !isClicked && (
        <svg 
          className="w-5 h-5 mr-2" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" 
          />
        </svg>
      )}

      {/* ボタンテキスト */}
      <span>
        {children || (
          isLoading || isClicked 
            ? '認証中...' 
            : 'OneAgentでログイン'
        )}
      </span>
    </button>
  );
};

/**
 * ソーシャルログインボタンコンポーネント
 */
export const SocialLoginButton = ({ 
  provider, 
  icon, 
  children, 
  className = '',
  ...props 
}) => {
  return (
    <LoginButton
      variant="outline"
      className={`
        border-gray-300 text-gray-700 hover:bg-gray-50
        ${className}
      `}
      {...props}
    >
      {icon && <span className="mr-2">{icon}</span>}
      {children || `${provider}でログイン`}
    </LoginButton>
  );
};

/**
 * カスタムOAuthログインボタン
 */
export const OAuthLoginButton = ({ className = '', ...props }) => {
  return (
    <LoginButton
      className={`
        bg-gradient-to-r from-blue-600 to-purple-600 
        hover:from-blue-700 hover:to-purple-700
        ${className}
      `}
      {...props}
    >
      <svg 
        className="w-5 h-5 mr-2" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M12 15v2m-6 0h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" 
        />
      </svg>
      安全にログイン
    </LoginButton>
  );
};

export default LoginButton;