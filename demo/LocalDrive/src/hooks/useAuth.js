import { useCallback, useMemo, useRef } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { ROUTES, ERROR_MESSAGES } from '../utils/constants';

/**
 * API呼び出しキャッシュクラス（最適化版）
 */
class APICache {
  constructor(ttl = 60000) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  clear() {
    this.cache.clear();
  }

  delete(key) {
    this.cache.delete(key);
  }

  // 書き込み操作後の関連キャッシュクリア（修正版）
  clearRelated(action, params = {}) {
    // 書き込み操作の場合は全キャッシュをクリア（最も確実）
    const writeActions = [
      'create_file', 'create_folder', 'delete', 'move', 'copy',
      'add_to_favorites', 'remove_from_favorites', 
      'restore_from_trash', 'empty_trash', 'permanently_delete'
    ];
    
    if (writeActions.includes(action)) {
      this.clear();
      return;
    }
    
    // 読み取り専用操作の場合は部分的なクリア
    const pathParam = params.path || '';
    const parentPath = pathParam.split('/').slice(0, -1).join('/');
    
    for (const [key] of this.cache) {
      if (key.includes('list_') && (key.includes(pathParam) || key.includes(parentPath))) {
        this.cache.delete(key);
      }
    }
  }
}

// グローバルキャッシュインスタンス（シングルトン）
const apiCache = new APICache();

/**
 * リクエスト重複防止クラス（最適化版）
 */
class RequestDeduplicator {
  constructor() {
    this.pendingRequests = new Map();
  }

  async execute(key, requestFn) {
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key);
    }

    const promise = requestFn().finally(() => {
      this.pendingRequests.delete(key);
    });

    this.pendingRequests.set(key, promise);
    return promise;
  }
}

// グローバル重複防止インスタンス（シングルトン）
const requestDeduplicator = new RequestDeduplicator();

/**
 * 認証状態を管理するフック（最適化版・再レンダリング防止）
 */
export const useAuth = () => {
  const authContext = useAuthContext();
  
  // 通知フックの参照を安定化
  const notificationContext = useNotification();
  const notificationRef = useRef(notificationContext);
  notificationRef.current = notificationContext;

  /**
   * 通知付きログイン（最適化版）
   */
  const login = useCallback(async () => {
    try {
      await authContext.login();
    } catch (error) {
      notificationRef.current.error(
        error.message || ERROR_MESSAGES.AUTH_INVALID,
        { title: 'ログインエラー' }
      );
      throw error;
    }
  }, [authContext.login]);

  /**
   * 通知付きログアウト（最適化版）
   */
  const logout = useCallback(async () => {
    try {
      await authContext.logout();
      apiCache.clear();
      notificationRef.current.success(
        'ログアウトしました',
        { title: 'ログアウト完了' }
      );
    } catch (error) {
      notificationRef.current.error(
        error.message || 'ログアウトに失敗しました',
        { title: 'ログアウトエラー' }
      );
    }
  }, [authContext.logout]);

  /**
   * 通知付きOAuth認証コールバック（最適化版）
   */
  const handleAuthCallback = useCallback(async (code, state) => {
    try {
      const result = await authContext.handleAuthCallback(code, state);
      notificationRef.current.success(
        'ログインが完了しました',
        { title: 'ログイン成功' }
      );
      return result;
    } catch (error) {
      notificationRef.current.error(
        error.message || ERROR_MESSAGES.AUTH_INVALID,
        { title: '認証エラー' }
      );
      throw error;
    }
  }, [authContext.handleAuthCallback]);

  /**
   * キャッシュ付きファイル操作実行（最適化版）
   */
  const executeFileOperation = useCallback(async (action, params = {}) => {
    const cacheKey = `${action}_${JSON.stringify(params)}`;
    
    try {
      // キャッシュ可能な操作のみキャッシュから取得を試行
      const cacheableActions = ['list', 'get_quota', 'get_recent_updates', 'get_favorites', 'list_trash'];
      if (cacheableActions.includes(action)) {
        const cached = apiCache.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // 重複リクエストの防止
      const result = await requestDeduplicator.execute(cacheKey, () => 
        authContext.executeFileOperation(action, params)
      );
      
      // 成功した場合のみキャッシュに保存（読み取り専用操作のみ）
      if (result?.success && cacheableActions.includes(action)) {
        apiCache.set(cacheKey, result);
      }
      
      // 書き込み操作の場合は関連キャッシュを削除（修正版）
      if (result?.success && !cacheableActions.includes(action)) {
        apiCache.clearRelated(action, params);
      }
      
      return result;
    } catch (error) {
      console.error('File operation failed:', error);
      throw error;
    }
  }, [authContext.executeFileOperation]);

  /**
   * トークンリフレッシュ（最適化版）
   */
  const refreshToken = useCallback(async () => {
    try {
      await authContext.refreshToken();
      apiCache.clear();
    } catch (error) {
      notificationRef.current.error(
        error.message || ERROR_MESSAGES.AUTH_EXPIRED,
        { title: 'トークン更新エラー' }
      );
      throw error;
    }
  }, [authContext.refreshToken]);

  /**
   * 直接ツール実行（最適化版）
   */
  const executeToolDirect = useCallback(async (toolName, toolArgs, options = {}) => {
    return await authContext.executeToolDirect(toolName, toolArgs, options);
  }, [authContext.executeToolDirect]);

  /**
   * ユーザー情報の更新（最適化版）
   */
  const updateUser = useCallback((updates) => {
    authContext.updateUser(updates);
  }, [authContext.updateUser]);

  /**
   * エラーをクリア（最適化版）
   */
  const clearError = useCallback(() => {
    authContext.clearError();
  }, [authContext.clearError]);

  /**
   * 権限チェック（最適化版）
   */
  const hasPermission = useCallback((scope) => {
    return authContext.hasPermission(scope);
  }, [authContext.hasPermission]);

  /**
   * アバターURLを取得（最適化版）
   */
  const getAvatarUrl = useCallback(() => {
    return authContext.getAvatarUrl();
  }, [authContext.getAvatarUrl]);

  // 安定したオブジェクト参照を返すためにuseMemoを使用（修正版）
  // 状態のみに依存し、メソッドは含めない
  return useMemo(() => ({
    // AuthContextからの状態
    user: authContext.user,
    isAuthenticated: authContext.isAuthenticated,
    isLoading: authContext.isLoading,
    isInitialized: authContext.isInitialized,
    error: authContext.error,

    // 最適化されたメソッド（安定した参照）
    login,
    logout,
    handleAuthCallback,
    executeFileOperation,
    refreshToken,
    executeToolDirect,
    updateUser,
    clearError,
    hasPermission,
    getAvatarUrl
  }), [
    // 状態のみが変更時に再生成される（メソッドは除外）
    authContext.user,
    authContext.isAuthenticated,
    authContext.isLoading,
    authContext.isInitialized,
    authContext.error,
    // メソッドはstableなので依存配列に含めても問題ない
    login,
    logout,
    handleAuthCallback,
    executeFileOperation,
    refreshToken,
    executeToolDirect,
    updateUser,
    clearError,
    hasPermission,
    getAvatarUrl
  ]);
};

/**
 * 認証が必要なページで使用するフック（最適化版）
 */
export const useAuthRequired = (redirectTo = ROUTES.LOGIN) => {
  const auth = useAuth();

  // 認証が必要な旨の通知（一度だけ）
  const showAuthRequiredNotification = useCallback(() => {
    if (!auth.isAuthenticated && auth.isInitialized && !auth.isLoading) {
      // 通知は既に useAuth 内で処理されているので、ここでは何もしない
    }
  }, [auth.isAuthenticated, auth.isInitialized, auth.isLoading]);

  return auth;
};

/**
 * ユーザー情報のみを取得するフック（最適化版）
 */
export const useUser = () => {
  const { user } = useAuth();
  return useMemo(() => user, [user]);
};

/**
 * 権限チェック用フック（最適化版）
 */
export const usePermissions = (requiredPermissions = []) => {
  const { hasPermission, isAuthenticated } = useAuth();

  return useMemo(() => {
    const permissions = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : [requiredPermissions];

    const hasAllPermissions = isAuthenticated &&
      permissions.every(permission => hasPermission(permission));

    const hasAnyPermission = isAuthenticated &&
      permissions.some(permission => hasPermission(permission));

    return {
      hasAllPermissions,
      hasAnyPermission,
      checkPermission: hasPermission,
      isAuthenticated
    };
  }, [requiredPermissions, hasPermission, isAuthenticated]);
};

/**
 * APIキャッシュ管理用フック（最適化版）
 */
export const useApiCache = () => {
  return useMemo(() => ({
    clear: () => apiCache.clear(),
    delete: (key) => apiCache.delete(key),
    get: (key) => apiCache.get(key),
    set: (key, data) => apiCache.set(key, data),
    clearRelated: (action, params) => apiCache.clearRelated(action, params)
  }), []);
};

export default useAuth;