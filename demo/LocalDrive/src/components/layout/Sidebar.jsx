import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Home,
  Star,
  Clock,
  Trash2,
  Plus,
  HardDrive
} from 'lucide-react';
import { formatFileSize, formatPercentage } from '../../utils/formatUtils.js';
import { isTextFile } from '../../utils/fileUtils.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useNotification } from '../../contexts/NotificationContext';
import {
  useDashboardActions,
  useFileState,
  useSystemState,
  createFileOperations
} from '../../contexts/DashboardContext';
import CreateFileModal from '../file/CreateFileModal.jsx';

/**
 * 簡略化されたサイドバーコンポーネント（v3.0.0対応・OneDrive風モーダル対応・自動更新対応）
 */
const Sidebar = React.memo(() => {
  // Context から必要な状態のみ取得
  const actions = useDashboardActions();
  const { currentPath, files: displayFiles } = useFileState();
  const { quotaInfo, recentFiles, favorites, trashItems } = useSystemState();

  // Auth と通知フック
  const { executeFileOperation } = useAuth();
  const { success: notifySuccess, error: notifyError } = useNotification();

  // ファイル操作を作成
  const fileOperations = useMemo(() =>
    createFileOperations(actions, executeFileOperation, notifySuccess, notifyError),
    [actions, executeFileOperation, notifySuccess, notifyError]
  );

  // ローカル状態（OneDrive風モーダル使用）
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // ナビゲーションハンドラー
  const handleNavigate = useCallback((path) => {
    actions.setCurrentPath(path);
  }, [actions]);

  // ファイル作成ハンドラー（モーダル対応）
  const handleCreateFile = useCallback(async (filename, content = '') => {
    setIsCreating(true);
    try {
      const success = await fileOperations.createFile(filename, currentPath, content);
      if (success) {
        // コンパクトな通知（DashboardContextで処理済み）
        // 成功時は自動的に更新される（カスタムイベント）
      }
      return success;
    } catch (error) {
      console.error('ファイル作成エラー:', error);
      notifyError('ファイルの作成に失敗しました');
      return false;
    } finally {
      setIsCreating(false);
    }
  }, [fileOperations, currentPath, notifyError]);

  // フォルダ作成ハンドラー（モーダル対応）
  const handleCreateFolder = useCallback(async (folderName) => {
    // 無効な文字チェック
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (invalidChars.test(folderName)) {
      throw new Error('無効な文字が含まれています');
    }

    // 長さチェック
    if (folderName.length > 255) {
      throw new Error('フォルダ名が長すぎます（255文字以内）');
    }

    setIsCreating(true);
    try {
      const success = await fileOperations.createFolder(folderName, currentPath);
      if (success) {
        // コンパクトな通知（DashboardContextで処理済み）
        // 成功時は自動的に更新される（カスタムイベント）
      }
      return success;
    } catch (error) {
      console.error('フォルダ作成エラー:', error);
      notifyError(`フォルダの作成に失敗しました: ${error.message}`);
      throw error;
    } finally {
      setIsCreating(false);
    }
  }, [fileOperations, currentPath, notifyError]);

  // ファイル内容を読み取る関数
  const readFileContent = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const result = e.target.result;
        
        // テキストファイルかバイナリファイルかを判定
        if (isTextFile(file.name)) {
          // テキストファイルの場合はそのまま
          resolve(result);
        } else {
          // バイナリファイルの場合はBase64エンコード
          const base64 = result.split(',')[1]; // data:mime-type;base64, の部分を除去
          resolve(`base64:${base64}`);
        }
      };
      
      reader.onerror = () => {
        reject(new Error(`Failed to read file: ${file.name}`));
      };
      
      // テキストファイルの場合はテキストとして読み取り、
      // バイナリファイルの場合はData URLとして読み取り
      if (isTextFile(file.name)) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });
  }, []);

  // ファイル名の重複を解決する関数
  const resolveFileNameConflict = useCallback((filename, existingFiles) => {
    if (!Array.isArray(existingFiles)) return filename;
    
    const existingNames = existingFiles.map(f => f.name.toLowerCase());
    
    if (!existingNames.includes(filename.toLowerCase())) {
      return filename;
    }
    
    const extension = filename.includes('.') 
      ? filename.substring(filename.lastIndexOf('.'))
      : '';
    const baseName = extension 
      ? filename.substring(0, filename.length - extension.length)
      : filename;
    
    let counter = 1;
    let newName;
    
    do {
      newName = extension 
        ? `${baseName} (${counter})${extension}`
        : `${baseName} (${counter})`;
      counter++;
    } while (existingNames.includes(newName.toLowerCase()) && counter < 1000);
    
    return newName;
  }, []);

  // ファイルアップロードハンドラー（修正版・配列対応）
  const handleFileUpload = useCallback(async (files) => {
    const fileArray = Array.isArray(files) ? files : Array.from(files);
    console.log('Upload files:', fileArray.map(f => f.name));
    
    let successCount = 0;
    let errorCount = 0;
    
    setIsCreating(true);
    
    try {
      // 各ファイルを処理
      for (const file of fileArray) {
        try {
          // ファイル名の重複チェック・解決
          const finalFileName = resolveFileNameConflict(file.name, displayFiles);
          
          // ファイル内容を読み取り
          const content = await readFileContent(file);
          
          // サーバーにファイルを作成
          const success = await fileOperations.createFile(finalFileName, currentPath, content);
          
          if (success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          errorCount++;
        }
      }
      
      // 結果通知（コンパクト）
      if (successCount > 0) {
        notifySuccess(`${successCount}個のファイルをアップロードしました`);
        // 成功時は自動的に更新される（カスタムイベント）
      }
      if (errorCount > 0) {
        notifyError(`${errorCount}個のファイルのアップロードに失敗しました`);
      }
      
      return successCount > 0;
    } catch (error) {
      console.error('Upload error:', error);
      notifyError('ファイルアップロードに失敗しました');
      return false;
    } finally {
      setIsCreating(false);
    }
  }, [notifySuccess, notifyError, fileOperations, currentPath, displayFiles, readFileContent, resolveFileNameConflict]);

  // メインナビゲーションアイテム
  const mainNavItems = useMemo(() => [
    {
      icon: Home,
      label: "ドキュメント",
      path: "documents",
      onClick: () => handleNavigate('documents')
    },
    {
      icon: Clock,
      label: "最近の更新",
      path: "recent",
      onClick: () => handleNavigate('recent')
    },
    {
      icon: Star,
      label: "お気に入り",
      path: "favorites",
      onClick: () => handleNavigate('favorites')
    },
    {
      icon: Trash2,
      label: "ゴミ箱",
      path: "trash",
      onClick: () => handleNavigate('trash')
    }
  ], [handleNavigate]);

  // 最近使用したファイル（表示用に制限）
  const displayRecentFiles = useMemo(() => {
    if (!Array.isArray(recentFiles)) return [];
    return recentFiles.slice(0, 5);
  }, [recentFiles]);

  // お気に入りファイル（表示用に制限）
  const displayFavorites = useMemo(() => {
    if (!Array.isArray(favorites)) return [];
    return favorites.filter(fav => fav.exists !== false).slice(0, 5);
  }, [favorites]);

  return (
    <aside className="bg-white border-r border-gray-200 shadow-sm w-64 flex flex-col h-full">
      {/* 作成・アップロードボタン */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={() => setShowCreateModal(true)}
          disabled={isCreating}
          className="w-full flex items-center justify-center px-4 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4 mr-2" />
          {isCreating ? '作成中...' : '新規作成'}
        </button>
      </div>

      {/* ナビゲーション */}
      <div className="flex-1 overflow-y-auto">
        <nav className="p-2">
          {/* メインナビゲーション */}
          <MainNavigation
            items={mainNavItems}
            currentPath={currentPath}
          />

          {/* 最近の更新（プレビュー） */}
          {displayRecentFiles.length > 0 && (
            <RecentUpdatesSection
              recentFiles={displayRecentFiles}
              allRecentFiles={recentFiles}
              onNavigate={handleNavigate}
            />
          )}

          {/* お気に入り（プレビュー） */}
          {displayFavorites.length > 0 && (
            <FavoritesSection
              favorites={displayFavorites}
              allFavorites={favorites}
              onNavigate={handleNavigate}
            />
          )}
        </nav>
      </div>

      {/* ストレージ使用量 */}
      {quotaInfo && (
        <StorageUsageSection quotaInfo={quotaInfo} />
      )}

      {/* OneDrive風作成モーダル */}
      <CreateFileModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateFile={handleCreateFile}
        onCreateFolder={handleCreateFolder}
        onFileUpload={handleFileUpload}
        currentPath={currentPath}
        isCreating={isCreating}
      />
    </aside>
  );
});

/**
 * メインナビゲーション（メモ化）
 */
const MainNavigation = React.memo(({ items, currentPath }) => (
  <div className="space-y-1 mb-6">
    {items.map((item) => (
      <NavItem
        key={item.path}
        icon={item.icon}
        label={item.label}
        path={item.path}
        currentPath={currentPath}
        onClick={item.onClick}
      />
    ))}
  </div>
));

/**
 * ナビゲーションアイテム（メモ化）
 */
const NavItem = React.memo(({
  icon: Icon,
  label,
  path,
  currentPath,
  onClick,
  className = ''
}) => {
  const isActive = currentPath === path ||
    (path === 'documents' && currentPath.startsWith('documents'));

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200
        ${isActive
          ? 'bg-blue-100 text-blue-900'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
        }
        ${className}
      `}
      title={label}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="ml-3 truncate">{label}</span>
    </button>
  );
});

/**
 * 最近の更新セクション（メモ化）
 */
const RecentUpdatesSection = React.memo(({ recentFiles, allRecentFiles, onNavigate }) => (
  <div className="mt-6">
    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">
      最近の更新
    </h3>
    <div className="space-y-1">
      {recentFiles.map((file, index) => (
        <RecentFileItem
          key={`${file.path}-${index}`}
          file={file}
          onClick={() => onNavigate('recent')}
          showAction={true}
        />
      ))}
      {allRecentFiles.length > 5 && (
        <button
          onClick={() => onNavigate('recent')}
          className="w-full text-left px-2 py-1 text-xs text-blue-500 hover:text-blue-700 rounded transition-colors duration-200"
        >
          すべて表示...
        </button>
      )}
    </div>
  </div>
));

/**
 * お気に入りセクション（メモ化）
 */
const FavoritesSection = React.memo(({ favorites, allFavorites, onNavigate }) => (
  <div className="mt-6">
    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">
      お気に入り
    </h3>
    <div className="space-y-1">
      {favorites.map((file, index) => (
        <FavoriteFileItem
          key={`${file.path}-${index}`}
          file={file}
          onClick={() => onNavigate('favorites')}
        />
      ))}
      {allFavorites.length > 5 && (
        <button
          onClick={() => onNavigate('favorites')}
          className="w-full text-left px-2 py-1 text-xs text-blue-500 hover:text-blue-700 rounded transition-colors duration-200"
        >
          すべて表示...
        </button>
      )}
    </div>
  </div>
));

/**
 * 最近使用したファイルアイテム（メモ化）
 */
const RecentFileItem = React.memo(({ file, onClick, showAction = false }) => {
  const timeAgo = useMemo(() => {
    const now = Date.now();
    const fileTime = new Date(file.modifiedDate).getTime();
    const diff = now - fileTime;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return '今';
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    return `${days}日前`;
  }, [file.modifiedDate]);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center px-2 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors duration-200"
      title={`${file.name} (${timeAgo}${showAction ? ` - ${file.action}` : ''})`}
    >
      <Clock className="w-3 h-3 mr-2 text-gray-400 flex-shrink-0" />
      <div className="flex-1 min-w-0 text-left">
        <div className="truncate font-medium text-xs">{file.name}</div>
        <div className="text-xs text-gray-500">{timeAgo}</div>
      </div>
    </button>
  );
});

/**
 * お気に入りファイルアイテム（メモ化）
 */
const FavoriteFileItem = React.memo(({ file, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center px-2 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors duration-200"
    title={file.name}
  >
    <Star className="w-3 h-3 mr-2 text-yellow-500 flex-shrink-0" />
    <div className="flex-1 min-w-0 text-left">
      <div className="truncate font-medium text-xs">{file.name}</div>
      {file.exists === false && (
        <div className="text-xs text-red-500">削除済み</div>
      )}
    </div>
  </button>
));

/**
 * ストレージ使用量セクション（メモ化）
 */
const StorageUsageSection = React.memo(({ quotaInfo }) => (
  <div className="p-4 border-t border-gray-200">
    <StorageUsage quotaInfo={quotaInfo} />
  </div>
));

/**
 * ストレージ使用量詳細（メモ化）
 */
const StorageUsage = React.memo(({ quotaInfo }) => {
  const { progressColor, warningMessage } = useMemo(() => {
    if (!quotaInfo) return { progressColor: 'bg-gray-400', warningMessage: null };

    const pct = quotaInfo.percentage || 0;
    let color = 'bg-green-500';
    if (pct > 90) color = 'bg-red-500';
    else if (pct > 70) color = 'bg-yellow-500';

    const warning = pct > 80 ? 'ストレージ容量が不足しています' : null;

    return { progressColor: color, warningMessage: warning };
  }, [quotaInfo]);

  if (!quotaInfo) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center text-sm text-gray-600">
        <HardDrive className="w-4 h-4 mr-2" />
        <span>ストレージ</span>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-600">
          <span>{quotaInfo.used}</span>
          <span>{quotaInfo.total}</span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${progressColor}`}
            style={{ width: `${Math.min(quotaInfo.percentage, 100)}%` }}
          />
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-gray-500">
            {formatPercentage(quotaInfo.percentage / 100)} 使用中
          </span>
          <span className="text-gray-500">
            {quotaInfo.fileCount} ファイル
          </span>
        </div>
      </div>

      {warningMessage && (
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
          {warningMessage}
          {quotaInfo.remaining && (
            <div className="mt-1">残り容量: {quotaInfo.remaining}</div>
          )}
        </div>
      )}
    </div>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;