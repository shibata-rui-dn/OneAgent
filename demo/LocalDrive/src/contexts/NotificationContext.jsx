import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';

// 通知タイプ
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// アクションタイプ
const NOTIFICATION_ACTIONS = {
  ADD_NOTIFICATION: 'ADD_NOTIFICATION',
  REMOVE_NOTIFICATION: 'REMOVE_NOTIFICATION',
  CLEAR_ALL_NOTIFICATIONS: 'CLEAR_ALL_NOTIFICATIONS',
  UPDATE_NOTIFICATION: 'UPDATE_NOTIFICATION'
};

// 初期状態
const initialState = {
  notifications: []
};

// 通知のReducer
const notificationReducer = (state, action) => {
  switch (action.type) {
    case NOTIFICATION_ACTIONS.ADD_NOTIFICATION:
      // 最大3つまでの通知に制限
      const newNotifications = [action.payload, ...state.notifications];
      return {
        ...state,
        notifications: newNotifications.slice(0, 3)
      };

    case NOTIFICATION_ACTIONS.REMOVE_NOTIFICATION:
      return {
        ...state,
        notifications: state.notifications.filter(
          notification => notification.id !== action.payload.id
        )
      };

    case NOTIFICATION_ACTIONS.CLEAR_ALL_NOTIFICATIONS:
      return {
        ...state,
        notifications: []
      };

    case NOTIFICATION_ACTIONS.UPDATE_NOTIFICATION:
      return {
        ...state,
        notifications: state.notifications.map(notification =>
          notification.id === action.payload.id
            ? { ...notification, ...action.payload.updates }
            : notification
        )
      };

    default:
      return state;
  }
};

// 通知コンテキストの作成
const NotificationContext = createContext(null);

/**
 * 通知プロバイダーコンポーネント（最適化版）
 */
export const NotificationProvider = ({ children, maxNotifications = 3 }) => {
  const [state, dispatch] = useReducer(notificationReducer, initialState);

  /**
   * 通知を追加（最適化版）
   */
  const addNotification = useCallback((notification) => {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const newNotification = {
      id,
      type: NOTIFICATION_TYPES.INFO,
      autoHide: true,
      duration: 1500, // 1.5秒に変更
      showIcon: true,
      dismissible: true,
      ...notification,
      timestamp: new Date()
    };

    dispatch({
      type: NOTIFICATION_ACTIONS.ADD_NOTIFICATION,
      payload: newNotification
    });

    // 自動削除
    if (newNotification.autoHide) {
      setTimeout(() => {
        removeNotification(id);
      }, newNotification.duration);
    }

    return id;
  }, []);

  /**
   * 通知を削除
   */
  const removeNotification = useCallback((id) => {
    dispatch({
      type: NOTIFICATION_ACTIONS.REMOVE_NOTIFICATION,
      payload: { id }
    });
  }, []);

  /**
   * すべての通知をクリア
   */
  const clearAllNotifications = useCallback(() => {
    dispatch({
      type: NOTIFICATION_ACTIONS.CLEAR_ALL_NOTIFICATIONS
    });
  }, []);

  /**
   * 通知を更新
   */
  const updateNotification = useCallback((id, updates) => {
    dispatch({
      type: NOTIFICATION_ACTIONS.UPDATE_NOTIFICATION,
      payload: { id, updates }
    });
  }, []);

  /**
   * 成功通知を表示
   */
  const showSuccess = useCallback((message, options = {}) => {
    return addNotification({
      type: NOTIFICATION_TYPES.SUCCESS,
      title: '成功',
      message,
      ...options
    });
  }, [addNotification]);

  /**
   * エラー通知を表示
   */
  const showError = useCallback((message, options = {}) => {
    return addNotification({
      type: NOTIFICATION_TYPES.ERROR,
      title: 'エラー',
      message,
      autoHide: false, // エラーは手動で閉じるまで表示
      ...options
    });
  }, [addNotification]);

  /**
   * 警告通知を表示
   */
  const showWarning = useCallback((message, options = {}) => {
    return addNotification({
      type: NOTIFICATION_TYPES.WARNING,
      title: '警告',
      message,
      duration: 2000, // 警告は2秒表示
      ...options
    });
  }, [addNotification]);

  /**
   * 情報通知を表示
   */
  const showInfo = useCallback((message, options = {}) => {
    return addNotification({
      type: NOTIFICATION_TYPES.INFO,
      title: '情報',
      message,
      ...options
    });
  }, [addNotification]);

  /**
   * ローディング通知を表示
   */
  const showLoading = useCallback((message, options = {}) => {
    return addNotification({
      type: NOTIFICATION_TYPES.INFO,
      title: '処理中',
      message,
      autoHide: false,
      dismissible: false,
      showIcon: false,
      isLoading: true,
      ...options
    });
  }, [addNotification]);

  // コンテキスト値をuseMemoでメモ化して参照の安定性を保つ
  const contextValue = useMemo(() => ({
    // 状態
    notifications: state.notifications,
    
    // メソッド
    addNotification,
    removeNotification,
    clearAllNotifications,
    updateNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showLoading
  }), [
    state.notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
    updateNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showLoading
  ]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  );
};

/**
 * 通知表示コンテナ
 */
const NotificationContainer = React.memo(() => {
  const { notifications, removeNotification } = useNotificationContext();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRemove={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
});

/**
 * 個別通知コンポーネント
 */
const NotificationItem = React.memo(({ notification, onRemove }) => {
  const {
    type,
    title,
    message,
    showIcon,
    dismissible,
    isLoading,
    actions
  } = notification;

  // タイプ別のスタイル
  const typeStyles = {
    [NOTIFICATION_TYPES.SUCCESS]: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      icon: 'text-green-400',
      title: 'text-green-800',
      message: 'text-green-700'
    },
    [NOTIFICATION_TYPES.ERROR]: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      icon: 'text-red-400',
      title: 'text-red-800',
      message: 'text-red-700'
    },
    [NOTIFICATION_TYPES.WARNING]: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      icon: 'text-yellow-400',
      title: 'text-yellow-800',
      message: 'text-yellow-700'
    },
    [NOTIFICATION_TYPES.INFO]: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      icon: 'text-blue-400',
      title: 'text-blue-800',
      message: 'text-blue-700'
    }
  };

  const styles = typeStyles[type] || typeStyles[NOTIFICATION_TYPES.INFO];

  // タイプ別のアイコン
  const getIcon = () => {
    if (isLoading) {
      return (
        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
        </svg>
      );
    }

    switch (type) {
      case NOTIFICATION_TYPES.SUCCESS:
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case NOTIFICATION_TYPES.ERROR:
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case NOTIFICATION_TYPES.WARNING:
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case NOTIFICATION_TYPES.INFO:
      default:
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div className={`
      max-w-sm w-full shadow-lg rounded-lg pointer-events-auto
      ${styles.bg} ${styles.border} border
      transform transition-all duration-300 ease-in-out
      hover:shadow-xl
    `}>
      <div className="p-4">
        <div className="flex items-start">
          {showIcon && (
            <div className="flex-shrink-0">
              <div className={`${styles.icon}`}>
                {getIcon()}
              </div>
            </div>
          )}
          
          <div className={`${showIcon ? 'ml-3' : ''} w-0 flex-1 pt-0.5`}>
            {title && (
              <p className={`text-sm font-medium ${styles.title}`}>
                {title}
              </p>
            )}
            <p className={`text-sm ${styles.message} ${title ? 'mt-1' : ''}`}>
              {message}
            </p>
            
            {actions && actions.length > 0 && (
              <div className="mt-3 flex space-x-2">
                {actions.map((action, index) => (
                  <button
                    key={index}
                    onClick={action.onClick}
                    className={`text-sm font-medium ${styles.title} hover:opacity-75`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {dismissible && (
            <div className="ml-4 flex-shrink-0 flex">
              <button
                onClick={onRemove}
                className={`rounded-md inline-flex ${styles.icon} hover:opacity-75 focus:outline-none focus:ring-2 focus:ring-offset-2`}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * 通知コンテキストを使用するためのフック
 */
export const useNotificationContext = () => {
  const context = useContext(NotificationContext);
  
  if (context === null) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  
  return context;
};

/**
 * 通知機能を使用するためのフック（短縮版・最適化）
 */
export const useNotification = () => {
  const context = useNotificationContext();
  
  // 返すオブジェクトをuseMemoでメモ化して参照の安定性を保つ
  return useMemo(() => ({
    success: context.showSuccess,
    error: context.showError,
    warning: context.showWarning,
    info: context.showInfo,
    loading: context.showLoading,
    remove: context.removeNotification,
    clear: context.clearAllNotifications
  }), [
    context.showSuccess,
    context.showError,
    context.showWarning,
    context.showInfo,
    context.showLoading,
    context.removeNotification,
    context.clearAllNotifications
  ]);
};

export default NotificationContext;