import React, { createContext, useContext, useReducer, useEffect } from 'react';
import authService from '../services/authService.js';
import { ERROR_MESSAGES } from '../utils/constants.js';

// 認証状態の初期値
const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,
  error: null
};

// アクションタイプ
const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_AUTHENTICATED: 'SET_AUTHENTICATED',
  SET_ERROR: 'SET_ERROR',
  CLEAR_AUTH: 'CLEAR_AUTH',
  SET_INITIALIZED: 'SET_INITIALIZED'
};

// 認証状態のReducer（簡素化版）
const authReducer = (state, action) => {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
        error: null
      };

    case AUTH_ACTIONS.SET_AUTHENTICATED:
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
        error: null
      };

    case AUTH_ACTIONS.SET_ERROR:
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        error: action.payload.error
      };

    case AUTH_ACTIONS.CLEAR_AUTH:
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        error: null
      };

    case AUTH_ACTIONS.SET_INITIALIZED:
      return {
        ...state,
        isInitialized: true,
        isLoading: false
      };

    default:
      return state;
  }
};

// 認証コンテキストの作成
const AuthContext = createContext(null);

/**
 * 認証プロバイダーコンポーネント（簡素化版）
 */
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // 初期化処理（簡素化版）
  useEffect(() => {
    const initializeAuth = async () => {
      console.log('🔄 Initializing auth...');
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });

      try {
        // ローカルストレージから認証状態を復元
        const isLoggedIn = authService.isLoggedIn();
        const currentUser = authService.getCurrentUser();

        if (isLoggedIn && currentUser) {
          console.log('✅ Found existing auth state:', currentUser.username);
          dispatch({ 
            type: AUTH_ACTIONS.SET_AUTHENTICATED, 
            payload: { user: currentUser } 
          });
        } else {
          console.log('ℹ️ No existing auth state');
          dispatch({ type: AUTH_ACTIONS.SET_INITIALIZED });
        }
      } catch (error) {
        console.error('❌ Auth initialization failed:', error);
        dispatch({ 
          type: AUTH_ACTIONS.SET_ERROR, 
          payload: { error: error.message || ERROR_MESSAGES.UNKNOWN_ERROR } 
        });
      }
    };

    initializeAuth();

    // 認証状態の変更を監視
    const unsubscribe = authService.onAuthChange((authState) => {
      console.log('🔄 Auth state changed:', authState);
      
      if (authState.isAuthenticated && authState.user) {
        dispatch({ 
          type: AUTH_ACTIONS.SET_AUTHENTICATED, 
          payload: { user: authState.user } 
        });
      } else {
        dispatch({ type: AUTH_ACTIONS.CLEAR_AUTH });
      }
    });

    return unsubscribe;
  }, []);

  /**
   * ログイン処理
   */
  const login = async () => {
    try {
      console.log('🔄 Starting login...');
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      await authService.login();
    } catch (error) {
      console.error('❌ Login failed:', error);
      dispatch({ 
        type: AUTH_ACTIONS.SET_ERROR, 
        payload: { error: error.message || ERROR_MESSAGES.AUTH_INVALID } 
      });
      throw error;
    }
  };

  /**
   * OAuth認証コールバック処理
   */
  const handleAuthCallback = async (code, state) => {
  const callId = Date.now().toString(36);
  console.log(`🔄 [${callId}] handleAuthCallback called`, { code: !!code, state: !!state });
  
  try {
    const result = await authService.handleAuthCallback(code, state);
    console.log(`✅ [${callId}] handleAuthCallback completed`);
    return result;
  } catch (error) {
    console.error(`❌ [${callId}] handleAuthCallback failed:`, error);
    throw error;
  }
};

  /**
   * ログアウト処理
   */
  const logout = async () => {
    try {
      console.log('🔄 Starting logout...');
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      await authService.logout();
      dispatch({ type: AUTH_ACTIONS.CLEAR_AUTH });
      console.log('✅ Logout successful');
    } catch (error) {
      console.error('❌ Logout failed:', error);
      // ログアウトは失敗してもローカル状態をクリア
      dispatch({ type: AUTH_ACTIONS.CLEAR_AUTH });
    }
  };

  /**
   * トークンリフレッシュ
   */
  const refreshToken = async () => {
    try {
      await authService.refreshToken();
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        dispatch({ 
          type: AUTH_ACTIONS.SET_AUTHENTICATED, 
          payload: { user: currentUser } 
        });
      }
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      dispatch({ 
        type: AUTH_ACTIONS.SET_ERROR, 
        payload: { error: error.message || ERROR_MESSAGES.AUTH_EXPIRED } 
      });
      await logout();
      throw error;
    }
  };

  /**
   * ユーザー情報の更新
   */
  const updateUser = (updates) => {
    if (state.user) {
      const updatedUser = { ...state.user, ...updates };
      dispatch({ 
        type: AUTH_ACTIONS.SET_AUTHENTICATED, 
        payload: { user: updatedUser } 
      });
    }
  };

  /**
   * エラーをクリア
   */
  const clearError = () => {
    dispatch({ type: AUTH_ACTIONS.SET_INITIALIZED });
  };

  /**
   * 権限チェック
   */
  const hasPermission = (scope) => {
    return state.isAuthenticated && authService.hasScope(scope);
  };

  /**
   * アバターURLを取得
   */
  const getAvatarUrl = () => {
    return authService.getAvatarUrl();
  };

  /**
   * 直接ツール実行
   */
  const executeToolDirect = async (toolName, toolArgs, options = {}) => {
    return await authService.executeToolDirect(toolName, toolArgs, options);
  };

  /**
   * ファイル操作実行
   */
  const executeFileOperation = async (action, params = {}) => {
    return await authService.executeFileOperation(action, params);
  };

  // コンテキスト値
  const contextValue = {
    // 状態
    ...state,
    
    // メソッド
    login,
    logout,
    handleAuthCallback,
    refreshToken,
    updateUser,
    clearError,
    hasPermission,
    getAvatarUrl,
    executeToolDirect,
    executeFileOperation
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * 認証コンテキストを使用するためのフック
 */
export const useAuthContext = () => {
  const context = useContext(AuthContext);
  
  if (context === null) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  
  return context;
};

/**
 * 認証済みユーザーのみアクセス可能なコンポーネント用HOC（簡素化版）
 */
export const withAuth = (WrappedComponent) => {
  const WithAuthComponent = (props) => {
    const { isAuthenticated, isLoading } = useAuthContext();

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">認証確認中...</p>
          </div>
        </div>
      );
    }

    if (!isAuthenticated) {
      return null; // App.jsxでリダイレクト処理
    }

    return <WrappedComponent {...props} />;
  };

  WithAuthComponent.displayName = 
    `withAuth(${WrappedComponent.displayName || WrappedComponent.name})`;

  return WithAuthComponent;
};

export default AuthContext;