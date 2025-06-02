import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Check, 
  Clock, 
  AlertCircle, 
  Info, 
  Wifi, 
  WifiOff, 
  Loader2,
  FileText,
  HardDrive,
  Upload,
  Download,
  Trash2,
  Copy,
  Move,
  CheckCircle,
  XCircle,
  Star,
  Heart,
  RotateCcw,
  Archive,
  FolderPlus,
  FilePlus
} from 'lucide-react';
import { formatFileSize, formatNumber } from '../../utils/formatUtils.js';
import { OPERATION_TYPES, SPECIAL_PATHS } from '../../utils/constants.js';
import { 
  useFileState, 
  useSystemState 
} from '../../contexts/DashboardContext';

/**
 * 最適化されたステータスバーコンポーネント（v3.0.0対応）
 * 新機能：特別なパス対応、新しい操作タイプ表示
 */
const StatusBar = React.memo(({ 
  isOnline = true,
  lastSync,
  className = '' 
}) => {
  // Context から必要な状態のみ取得
  const { selectedFiles, files, currentPath } = useFileState();
  const { quotaInfo, operations, recentFiles, favorites, trashItems } = useSystemState();
  
  // ローカル状態（StatusBar固有の状態のみ）
  const [showDetails, setShowDetails] = useState(false);
  const [notifications, setNotifications] = useState([]);
  
  // 計算値をメモ化（v3.0.0対応・nullチェック強化）
  const computedValues = useMemo(() => {
    const safeSelectedFiles = Array.isArray(selectedFiles) ? selectedFiles : [];
    const safeFiles = Array.isArray(files) ? files : [];
    const safeOperations = Array.isArray(operations) ? operations : [];
    
    // 現在のパスに応じたファイル一覧を取得
    let displayFiles = safeFiles;
    switch (currentPath) {
      case SPECIAL_PATHS.RECENT:
        displayFiles = Array.isArray(recentFiles) ? recentFiles : [];
        break;
      case SPECIAL_PATHS.FAVORITES:
        displayFiles = Array.isArray(favorites) ? favorites.filter(fav => fav.exists !== false) : [];
        break;
      case SPECIAL_PATHS.TRASH:
        displayFiles = Array.isArray(trashItems) ? trashItems : [];
        break;
      default:
        displayFiles = safeFiles;
    }
    
    const selectedCount = safeSelectedFiles.length;
    const selectedSize = safeSelectedFiles.reduce((sum, file) => sum + (file?.size || 0), 0);
    const totalSize = displayFiles.reduce((sum, file) => sum + (file?.size || 0), 0);
    const activeOperations = safeOperations.filter(op => op?.status === 'pending' || op?.status === 'running');
    
    return {
      selectedCount,
      selectedSize,
      totalSize,
      totalFiles: displayFiles.length,
      activeOperations,
      displayFiles
    };
  }, [selectedFiles, files, currentPath, recentFiles, favorites, trashItems, operations]);

  // 現在のパス情報を取得
  const currentPathInfo = useMemo(() => {
    switch (currentPath) {
      case SPECIAL_PATHS.RECENT:
        return {
          label: '最近の更新',
          icon: Clock,
          description: '最近更新されたファイル'
        };
      case SPECIAL_PATHS.FAVORITES:
        return {
          label: 'お気に入り',
          icon: Star,
          description: 'お気に入りに登録されたファイル'
        };
      case SPECIAL_PATHS.TRASH:
        return {
          label: 'ゴミ箱',
          icon: Trash2,
          description: '削除されたファイル'
        };
      case SPECIAL_PATHS.SETTINGS:
        return {
          label: '設定',
          icon: Info,
          description: 'アプリケーション設定'
        };
      default:
        if (currentPath.startsWith(SPECIAL_PATHS.DOCUMENTS)) {
          const pathParts = currentPath.substring(10).split('/').filter(Boolean);
          return {
            label: pathParts.length > 0 ? pathParts[pathParts.length - 1] : 'ドキュメント',
            icon: FileText,
            description: 'ドキュメントフォルダ'
          };
        }
        return {
          label: 'ドキュメント',
          icon: FileText,
          description: 'メインドキュメントフォルダ'
        };
    }
  }, [currentPath]);

  // 操作完了時の通知（v3.0.0対応・nullチェック強化）
  useEffect(() => {
    if (!Array.isArray(operations) || operations.length === 0) return;
    
    const newNotifications = [];
    
    operations.forEach(operation => {
      if (!operation) return; // nullチェック
      
      if (operation.status === 'completed' || operation.status === 'error') {
        const existingNotification = notifications.find(n => n.id === operation.id);
        if (!existingNotification) {
          const notification = {
            id: operation.id,
            type: operation.status === 'completed' ? 'success' : 'error',
            message: getOperationMessage(operation),
            timestamp: Date.now()
          };
          newNotifications.push(notification);
        }
      }
    });
    
    if (newNotifications.length > 0) {
      setNotifications(prev => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const updated = [...safePrev, ...newNotifications].slice(-5); // 最大5件まで保持
        return updated;
      });
      
      // 5秒後に通知を削除
      newNotifications.forEach(notification => {
        setTimeout(() => {
          setNotifications(prev => {
            const safePrev = Array.isArray(prev) ? prev : [];
            return safePrev.filter(n => n.id !== notification.id);
          });
        }, 5000);
      });
    }
  }, [operations, notifications]);

  // 詳細表示の切り替え
  const handleToggleDetails = useCallback(() => {
    setShowDetails(prev => !prev);
  }, []);

  // 通知を削除
  const handleDismissNotification = useCallback((notificationId) => {
    setNotifications(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      return safePrev.filter(n => n.id !== notificationId);
    });
  }, []);

  return (
    <div className={`bg-white border-t border-gray-200 ${className}`}>
      {/* 通知バー */}
      {notifications.length > 0 && (
        <NotificationBar 
          notifications={notifications}
          onDismiss={handleDismissNotification}
        />
      )}
      
      {/* メインステータスバー */}
      <div className="flex items-center justify-between h-8 px-4 text-sm">
        {/* 左側：ファイル情報 */}
        <div className="flex items-center space-x-4">
          {/* 現在のパス情報 */}
          <PathInfo pathInfo={currentPathInfo} />
          
          {/* 選択されたファイル */}
          {computedValues.selectedCount > 0 ? (
            <SelectedFilesInfo 
              selectedCount={computedValues.selectedCount}
              selectedSize={computedValues.selectedSize}
            />
          ) : (
            <TotalFilesInfo 
              totalFiles={computedValues.totalFiles}
              totalSize={computedValues.totalSize}
              currentPath={currentPath}
            />
          )}
          
          {/* 進行中の操作 */}
          {computedValues.activeOperations.length > 0 && (
            <ActiveOperations operations={computedValues.activeOperations} />
          )}
        </div>
        
        {/* 右側：システム情報 */}
        <div className="flex items-center space-x-4">
          {/* ストレージ使用量 */}
          {quotaInfo && (
            <StorageIndicator 
              quotaInfo={quotaInfo}
              onClick={handleToggleDetails}
            />
          )}
          
          {/* 同期状況 */}
          <SyncStatus isOnline={isOnline} lastSync={lastSync} />
          
          {/* 詳細表示切り替え */}
          <button
            onClick={handleToggleDetails}
            className="text-gray-500 hover:text-gray-700 px-1"
            title="詳細を表示"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* 詳細情報パネル */}
      {showDetails && (
        <DetailPanel
          selectedFiles={selectedFiles}
          quotaInfo={quotaInfo}
          operations={operations}
          currentPath={currentPath}
          pathInfo={currentPathInfo}
          recentFiles={recentFiles}
          favorites={favorites}
          trashItems={trashItems}
          onClose={() => setShowDetails(false)}
        />
      )}
    </div>
  );
});

/**
 * パス情報コンポーネント（v3.0.0新規）
 */
const PathInfo = React.memo(({ pathInfo }) => (
  <div className="flex items-center text-gray-600" title={pathInfo.description}>
    <pathInfo.icon className="w-4 h-4 mr-1" />
    <span className="text-xs">{pathInfo.label}</span>
  </div>
));

/**
 * 通知バーコンポーネント（メモ化）
 */
const NotificationBar = React.memo(({ notifications, onDismiss }) => (
  <div className="border-b border-gray-200">
    {notifications.map(notification => (
      <NotificationItem
        key={notification.id}
        notification={notification}
        onDismiss={() => onDismiss(notification.id)}
      />
    ))}
  </div>
));

/**
 * 選択されたファイル情報（メモ化）
 */
const SelectedFilesInfo = React.memo(({ selectedCount, selectedSize }) => (
  <div className="flex items-center text-blue-600">
    <CheckCircle className="w-4 h-4 mr-1" />
    <span>
      {selectedCount}個選択中
      {selectedSize > 0 && (
        <span className="text-gray-500 ml-1">
          ({formatFileSize(selectedSize)})
        </span>
      )}
    </span>
  </div>
));

/**
 * 全ファイル情報（v3.0.0対応）
 */
const TotalFilesInfo = React.memo(({ totalFiles, totalSize, currentPath }) => {
  const getItemLabel = () => {
    switch (currentPath) {
      case SPECIAL_PATHS.RECENT:
        return '更新';
      case SPECIAL_PATHS.FAVORITES:
        return 'お気に入り';
      case SPECIAL_PATHS.TRASH:
        return '削除済み';
      default:
        return 'アイテム';
    }
  };

  return (
    <div className="flex items-center text-gray-600">
      <span>
        {formatNumber(totalFiles)} {getItemLabel()}
        {totalSize > 0 && (
          <span className="text-gray-500 ml-1">
            ({formatFileSize(totalSize)})
          </span>
        )}
      </span>
    </div>
  );
});

/**
 * アクティブな操作表示（メモ化）
 */
const ActiveOperations = React.memo(({ operations }) => (
  <div className="flex items-center space-x-2">
    {operations.map(operation => (
      <OperationStatus key={operation.id} operation={operation} />
    ))}
  </div>
));

/**
 * 操作ステータスコンポーネント（v3.0.0対応）
 */
const OperationStatus = React.memo(({ operation }) => {
  const { Icon, iconClass, label } = useMemo(() => {
    if (!operation) {
      return {
        Icon: FileText,
        iconClass: 'text-gray-600',
        label: '不明な操作'
      };
    }

    const getOperationIcon = (type) => {
      const iconMap = {
        [OPERATION_TYPES.CREATE]: { Icon: FilePlus, class: 'text-blue-600' },
        [OPERATION_TYPES.UPDATE]: { Icon: FileText, class: 'text-green-600' },
        [OPERATION_TYPES.DELETE]: { Icon: Trash2, class: 'text-red-600' },
        [OPERATION_TYPES.MOVE]: { Icon: Move, class: 'text-purple-600' },
        [OPERATION_TYPES.COPY]: { Icon: Copy, class: 'text-yellow-600' },
        [OPERATION_TYPES.FAVORITE]: { Icon: Heart, class: 'text-pink-600' },
        [OPERATION_TYPES.UNFAVORITE]: { Icon: Heart, class: 'text-gray-600' },
        [OPERATION_TYPES.RESTORE]: { Icon: RotateCcw, class: 'text-green-600' },
        [OPERATION_TYPES.EMPTY_TRASH]: { Icon: Archive, class: 'text-red-600' },
        [OPERATION_TYPES.PERMANENTLY_DELETE]: { Icon: XCircle, class: 'text-red-700' },
        upload: { Icon: Upload, class: 'text-blue-600' },
        download: { Icon: Download, class: 'text-green-600' }
      };
      return iconMap[type] || { Icon: FileText, class: 'text-gray-600' };
    };
    
    const iconInfo = getOperationIcon(operation.type);
    const label = operation.progress !== undefined 
      ? `${operation.type} ${operation.progress}%`
      : operation.type;
    
    return {
      Icon: iconInfo.Icon,
      iconClass: iconInfo.class,
      label
    };
  }, [operation]);
  
  if (!operation) return null;
  
  return (
    <div className={`flex items-center ${iconClass}`}>
      {operation.status === 'running' ? (
        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
      ) : (
        <Icon className="w-4 h-4 mr-1" />
      )}
      <span className="text-xs">
        {label}
      </span>
    </div>
  );
});

/**
 * ストレージインジケーターコンポーネント（最適化版）
 */
const StorageIndicator = React.memo(({ quotaInfo, onClick }) => {
  const { percentage, colorClass, tooltipText } = useMemo(() => {
    if (!quotaInfo) {
      return {
        percentage: 0,
        colorClass: 'text-gray-600',
        tooltipText: 'ストレージ情報を取得中...'
      };
    }

    const pct = quotaInfo.percentage || 0;
    let color = 'text-green-600';
    if (pct > 90) color = 'text-red-600';
    else if (pct > 70) color = 'text-yellow-600';
    
    return {
      percentage: pct,
      colorClass: color,
      tooltipText: `ストレージ使用量: ${quotaInfo.used || '0 B'} / ${quotaInfo.total || '1 GB'}`
    };
  }, [quotaInfo]);
  
  return (
    <button
      onClick={onClick}
      className="flex items-center text-gray-600 hover:text-gray-800 transition-colors duration-200"
      title={tooltipText}
    >
      <HardDrive className="w-4 h-4 mr-1" />
      <span className={`text-xs ${colorClass}`}>
        {percentage.toFixed(0)}%
      </span>
    </button>
  );
});

/**
 * 同期ステータスコンポーネント（最適化版）
 */
const SyncStatus = React.memo(({ isOnline, lastSync }) => {
  const syncStatus = useMemo(() => {
    if (!isOnline) {
      return {
        icon: WifiOff,
        text: 'オフライン',
        color: 'text-red-600'
      };
    }
    
    if (lastSync) {
      const syncTime = new Date(lastSync);
      const now = new Date();
      const diffMinutes = Math.floor((now - syncTime) / (1000 * 60));
      
      if (diffMinutes < 1) {
        return {
          icon: Check,
          text: '同期済み',
          color: 'text-green-600'
        };
      } else if (diffMinutes < 60) {
        return {
          icon: Clock,
          text: `${diffMinutes}分前`,
          color: 'text-gray-600'
        };
      } else {
        return {
          icon: AlertCircle,
          text: '要同期',
          color: 'text-yellow-600'
        };
      }
    }
    
    return {
      icon: Wifi,
      text: 'オンライン',
      color: 'text-green-600'
    };
  }, [isOnline, lastSync]);
  
  const Icon = syncStatus.icon;
  
  return (
    <div className={`flex items-center ${syncStatus.color}`} title={`接続状況: ${syncStatus.text}`}>
      <Icon className="w-4 h-4 mr-1" />
      <span className="text-xs hidden sm:block">{syncStatus.text}</span>
    </div>
  );
});

/**
 * 通知アイテムコンポーネント（最適化版）
 */
const NotificationItem = React.memo(({ notification, onDismiss }) => {
  const { bgClass, textClass, borderClass, Icon } = useMemo(() => {
    if (!notification) {
      return {
        bgClass: 'bg-gray-50',
        textClass: 'text-gray-800',
        borderClass: 'border-gray-200',
        Icon: Info
      };
    }

    const styles = {
      success: {
        bg: 'bg-green-50',
        text: 'text-green-800',
        border: 'border-green-200',
        icon: CheckCircle
      },
      error: {
        bg: 'bg-red-50',
        text: 'text-red-800',
        border: 'border-red-200',
        icon: XCircle
      },
      warning: {
        bg: 'bg-yellow-50',
        text: 'text-yellow-800',
        border: 'border-yellow-200',
        icon: AlertCircle
      },
      info: {
        bg: 'bg-blue-50',
        text: 'text-blue-800',
        border: 'border-blue-200',
        icon: Info
      }
    };
    
    const style = styles[notification.type] || styles.info;
    return {
      bgClass: style.bg,
      textClass: style.text,
      borderClass: style.border,
      Icon: style.icon
    };
  }, [notification]);
  
  if (!notification) return null;
  
  return (
    <div className={`flex items-center justify-between px-4 py-2 border-b border-gray-100 ${bgClass} ${borderClass}`}>
      <div className="flex items-center">
        <Icon className="w-4 h-4 mr-2" />
        <span className={`text-sm ${textClass}`}>{notification.message || '通知メッセージ'}</span>
      </div>
      <button
        onClick={onDismiss}
        className="text-gray-500 hover:text-gray-700 ml-4"
      >
        ×
      </button>
    </div>
  );
});

/**
 * 詳細情報パネルコンポーネント（v3.0.0対応・nullチェック強化）
 */
const DetailPanel = React.memo(({ 
  selectedFiles, 
  quotaInfo, 
  operations, 
  currentPath,
  pathInfo,
  recentFiles,
  favorites,
  trashItems,
  onClose 
}) => {
  const { recentOperations, displayFiles, pathStats } = useMemo(() => {
    const safeOperations = Array.isArray(operations) ? operations : [];
    const safeSelectedFiles = Array.isArray(selectedFiles) ? selectedFiles : [];
    
    // パス固有の統計情報
    const stats = {
      recent: Array.isArray(recentFiles) ? recentFiles.length : 0,
      favorites: Array.isArray(favorites) ? favorites.length : 0,
      trash: Array.isArray(trashItems) ? trashItems.length : 0
    };
    
    return {
      recentOperations: safeOperations.slice(-5),
      displayFiles: safeSelectedFiles.slice(0, 5),
      pathStats: stats
    };
  }, [operations, selectedFiles, recentFiles, favorites, trashItems]);
  
  return (
    <div className="border-t border-gray-200 bg-gray-50 p-4">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-medium text-gray-900">詳細情報</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          ×
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
        {/* 現在のパス情報 */}
        <CurrentPathDetail 
          pathInfo={pathInfo} 
          currentPath={currentPath} 
          pathStats={pathStats} 
        />
        
        {/* 選択されたファイル */}
        <SelectedFilesDetail displayFiles={displayFiles} selectedFiles={selectedFiles} />
        
        {/* ストレージ情報 */}
        <StorageDetail quotaInfo={quotaInfo} />
        
        {/* 操作履歴 */}
        <OperationHistory recentOperations={recentOperations} />
      </div>
    </div>
  );
});

/**
 * 現在のパス詳細（v3.0.0新規）
 */
const CurrentPathDetail = React.memo(({ pathInfo, currentPath, pathStats }) => (
  <div>
    <h4 className="font-medium text-gray-700 mb-2">現在の場所</h4>
    <div className="space-y-1">
      <div className="flex items-center">
        <pathInfo.icon className="w-4 h-4 mr-2 text-gray-400" />
        <span className="font-medium">{pathInfo.label}</span>
      </div>
      <div className="text-xs text-gray-500">{pathInfo.description}</div>
      {currentPath === SPECIAL_PATHS.RECENT && (
        <div className="text-xs text-blue-600">
          {pathStats.recent}件の更新
        </div>
      )}
      {currentPath === SPECIAL_PATHS.FAVORITES && (
        <div className="text-xs text-yellow-600">
          {pathStats.favorites}件のお気に入り
        </div>
      )}
      {currentPath === SPECIAL_PATHS.TRASH && (
        <div className="text-xs text-red-600">
          {pathStats.trash}件の削除済みファイル
        </div>
      )}
    </div>
  </div>
));

/**
 * 選択されたファイル詳細（メモ化）
 */
const SelectedFilesDetail = React.memo(({ displayFiles, selectedFiles }) => (
  <div>
    <h4 className="font-medium text-gray-700 mb-2">選択中のファイル</h4>
    {displayFiles.length > 0 ? (
      <div className="space-y-1">
        {displayFiles.map((file, index) => (
          <div key={index} className="flex items-center">
            <FileText className="w-3 h-3 mr-2 text-gray-400" />
            <span className="truncate">{file?.name || 'Unknown'}</span>
          </div>
        ))}
        {Array.isArray(selectedFiles) && selectedFiles.length > 5 && (
          <div className="text-gray-500">
            ...他 {selectedFiles.length - 5} ファイル
          </div>
        )}
      </div>
    ) : (
      <div className="text-gray-500">ファイルが選択されていません</div>
    )}
  </div>
));

/**
 * ストレージ詳細（メモ化）
 */
const StorageDetail = React.memo(({ quotaInfo }) => (
  <div>
    <h4 className="font-medium text-gray-700 mb-2">ストレージ使用量</h4>
    {quotaInfo ? (
      <div className="space-y-1">
        <div>使用量: {quotaInfo.used || '0 B'} / {quotaInfo.total || '1 GB'}</div>
        <div>使用率: {(quotaInfo.percentage || 0).toFixed(1)}%</div>
        <div>ファイル数: {formatNumber(quotaInfo.fileCount || 0)}</div>
        <div>残り容量: {quotaInfo.remaining || 'N/A'}</div>
      </div>
    ) : (
      <div className="text-gray-500">情報を取得中...</div>
    )}
  </div>
));

/**
 * 操作履歴（メモ化）
 */
const OperationHistory = React.memo(({ recentOperations }) => (
  <div>
    <h4 className="font-medium text-gray-700 mb-2">最近の操作</h4>
    {recentOperations.length > 0 ? (
      <div className="space-y-1">
        {recentOperations.map((operation, index) => (
          <div key={index} className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2 ${
              operation?.status === 'completed' ? 'bg-green-500' :
              operation?.status === 'error' ? 'bg-red-500' :
              'bg-yellow-500'
            }`} />
            <span className="truncate">{getOperationMessage(operation)}</span>
          </div>
        ))}
      </div>
    ) : (
      <div className="text-gray-500">操作履歴がありません</div>
    )}
  </div>
));

/**
 * 操作メッセージを取得（v3.0.0対応・nullチェック強化）
 * @param {object} operation - 操作情報
 * @returns {string} メッセージ
 */
const getOperationMessage = (operation) => {
  if (!operation) return '不明な操作';
  
  const messages = {
    [OPERATION_TYPES.CREATE]: 'ファイルを作成しました',
    [OPERATION_TYPES.UPDATE]: 'ファイルを更新しました',
    [OPERATION_TYPES.DELETE]: 'ファイルを削除しました',
    [OPERATION_TYPES.MOVE]: 'ファイルを移動しました',
    [OPERATION_TYPES.COPY]: 'ファイルをコピーしました',
    [OPERATION_TYPES.FAVORITE]: 'お気に入りに追加しました',
    [OPERATION_TYPES.UNFAVORITE]: 'お気に入りから削除しました',
    [OPERATION_TYPES.RESTORE]: 'ファイルを復元しました',
    [OPERATION_TYPES.EMPTY_TRASH]: 'ゴミ箱を空にしました',
    [OPERATION_TYPES.PERMANENTLY_DELETE]: 'ファイルを完全に削除しました',
    upload: 'ファイルをアップロードしました',
    download: 'ファイルをダウンロードしました'
  };
  
  const baseMessage = messages[operation.type] || '操作を実行しました';
  
  if (operation.target) {
    return `${operation.target}: ${baseMessage}`;
  }
  
  return baseMessage;
};

StatusBar.displayName = 'StatusBar';

export default StatusBar;