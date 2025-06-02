import React, { useState, useCallback, useMemo, useRef } from 'react';
import { 
  SortAsc, 
  SortDesc, 
  MoreVertical,
  Download,
  Edit,
  Copy,
  Move,
  Trash2,
  Folder,
  File,
  Search,
  RefreshCw,
  Eye,
  ChevronLeft,
  Home,
  Star,
  Clock,
  Archive,
  RotateCcw,
  Heart,
  HeartOff
} from 'lucide-react';
import { formatDate, formatFileSize, truncateText } from '../../utils/formatUtils.js';
import FileItem from './FileItem.jsx';
import FilePreviewModal from './FilePreviewModal.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useNotification } from '../../contexts/NotificationContext';
import { 
  useDashboardActions, 
  useUIState, 
  useFileState,
  useSystemState,
  createFileOperations
} from '../../contexts/DashboardContext';
import { isTextFile } from '../../utils/fileUtils.js';

/**
 * 最適化されたファイル一覧コンポーネント（v3.0.0対応・操作機能完全実装）
 * 修正：表示モード切り替え削除、コンテキストメニュー位置調整、カスタムイベント対応
 */
const FileList = React.memo(() => {
  // Context から必要な状態のみ取得
  const actions = useDashboardActions();
  const { viewMode } = useUIState();
  const { files, currentPath, selectedFiles, searchQuery, isLoadingFiles } = useFileState();
  const { recentFiles, favorites, trashItems } = useSystemState();
  
  // Auth と通知フック
  const { executeFileOperation } = useAuth();
  const { success: notifySuccess, error: notifyError } = useNotification();
  
  // ファイル操作を作成
  const fileOperations = useMemo(() => 
    createFileOperations(actions, executeFileOperation, notifySuccess, notifyError),
    [actions, executeFileOperation, notifySuccess, notifyError]
  );
  
  // ローカル状態（FileList固有の状態のみ）
  const [contextMenu, setContextMenu] = useState(null);
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [selectAll, setSelectAll] = useState(false);
  const [isRenaming, setIsRenaming] = useState(null); // 名前変更中のファイル
  const [draggedFile, setDraggedFile] = useState(null);
  
  // ファイルプレビュー・編集関連の状態
  const [previewFile, setPreviewFile] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  // 前回計算結果をキャッシュ
  const sortedFilesCache = useRef({ files: [], sortBy: '', sortDirection: '', result: [] });
  
  // 表示するファイルリストを決定（特別なパス対応）
  const displayFiles = useMemo(() => {
    switch (currentPath) {
      case 'recent':
        return Array.isArray(recentFiles) ? recentFiles : [];
      case 'favorites':
        return Array.isArray(favorites) ? favorites.filter(fav => fav.exists !== false) : [];
      case 'trash':
        return Array.isArray(trashItems) ? trashItems : [];
      default:
        return Array.isArray(files) ? files : [];
    }
  }, [currentPath, files, recentFiles, favorites, trashItems]);
  
  // ソートされたファイル一覧を取得（最適化版）
  const sortedFiles = useMemo(() => {
    // キャッシュチェック
    const cache = sortedFilesCache.current;
    if (cache.files === displayFiles && cache.sortBy === sortBy && cache.sortDirection === sortDirection) {
      return cache.result;
    }
    
    const sorted = [...displayFiles].sort((a, b) => {
      // ディレクトリを優先（ゴミ箱以外）
      if (currentPath !== 'trash') {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
      }
      
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'ja');
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case 'date':
          const dateField = currentPath === 'trash' ? 'deletedDate' : 'modifiedDate';
          comparison = new Date(a[dateField] || 0) - new Date(b[dateField] || 0);
          break;
        default:
          comparison = a.name.localeCompare(b.name, 'ja');
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    // キャッシュ更新
    sortedFilesCache.current = { files: displayFiles, sortBy, sortDirection, result: sorted };
    return sorted;
  }, [displayFiles, sortBy, sortDirection, currentPath]);

  // 選択されたファイルのSet（最適化版）
  const selectedFilesSet = useMemo(() => {
    return new Set(selectedFiles.map(f => f.name || f));
  }, [selectedFiles]);

  /**
   * ディレクトリを再読み込み（修正：カスタムイベント使用）
   */
  const refreshDirectory = useCallback(async () => {
    // カスタムイベントを発火して即座更新
    const event = new CustomEvent('fileOperationCompleted', {
      detail: { 
        operationType: 'refresh', 
        data: { 
          path: currentPath,
          timestamp: Date.now() 
        }
      }
    });
    window.dispatchEvent(event);
    
    console.log('🔄 Manual refresh event dispatched for path:', currentPath);
  }, [currentPath]);

  /**
   * コンテキストメニューを表示（位置調整機能追加）
   */
  const handleContextMenu = useCallback((event, file) => {
    event.preventDefault();
    
    // 画面のサイズを取得
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // コンテキストメニューの推定サイズ
    const menuWidth = 200; // 推定幅
    const menuHeight = 300; // 推定高さ
    
    let x = event.clientX;
    let y = event.clientY;
    
    // 右端を超える場合は左側に表示
    if (x + menuWidth > viewportWidth) {
      x = viewportWidth - menuWidth - 10; // 10pxのマージン
    }
    
    // 下端を超える場合は上側に表示
    if (y + menuHeight > viewportHeight) {
      y = viewportHeight - menuHeight - 10; // 10pxのマージン
    }
    
    // 左端より左に行かないように調整
    if (x < 10) {
      x = 10;
    }
    
    // 上端より上に行かないように調整
    if (y < 10) {
      y = 10;
    }
    
    setContextMenu({
      x,
      y,
      file
    });
  }, []);
  
  /**
   * コンテキストメニューを閉じる
   */
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  /**
   * ファイルクリックハンドラー（v3.0.0対応・プレビュー機能追加）
   */
  const handleFileClick = useCallback((file) => {
    if (file.isDirectory && currentPath !== 'trash') {
      // ディレクトリの場合はナビゲート（ゴミ箱以外）
      let newPath;
      if (currentPath === 'recent' || currentPath === 'favorites') {
        // 特別なパスからのナビゲーション
        newPath = `documents/${file.path}`;
      } else if (currentPath.startsWith('documents')) {
        const basePath = currentPath === 'documents' ? '' : currentPath.substring(10);
        newPath = `documents/${basePath ? `${basePath}/` : ''}${file.name}`;
      } else {
        newPath = `documents/${file.name}`;
      }
      actions.setCurrentPath(newPath);
    } else {
      // ファイルの場合はプレビューを開く
      handlePreviewFile(file);
    }
  }, [currentPath, actions]);

  /**
   * ファイル選択ハンドラー（最適化版）
   */
  const handleFileSelection = useCallback((fileName, isSelected) => {
    const file = displayFiles.find(f => f.name === fileName);
    if (file) {
      const newSelectedFiles = isSelected
        ? [...selectedFiles, file]
        : selectedFiles.filter(f => (f.name || f) !== fileName);
      actions.setSelectedFiles(newSelectedFiles);
    }
  }, [displayFiles, selectedFiles, actions]);

  /**
   * 全選択の切り替え（最適化版）
   */
  const handleSelectAll = useCallback(() => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);
    
    const newSelectedFiles = newSelectAll ? [...displayFiles] : [];
    actions.setSelectedFiles(newSelectedFiles);
  }, [selectAll, displayFiles, actions]);

  /**
   * ソート変更ハンドラー
   */
  const handleSortChange = useCallback((field) => {
    if (sortBy === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  }, [sortBy]);

  /**
   * ソート方向のアイコンを取得（メモ化）
   */
  const getSortIcon = useCallback((field) => {
    if (sortBy !== field) return null;
    return sortDirection === 'asc' ? 
      <SortAsc className="w-4 h-4 ml-1" /> : 
      <SortDesc className="w-4 h-4 ml-1" />;
  }, [sortBy, sortDirection]);

  /**
   * ファイル削除ハンドラー（v3.0.0対応）
   */
  const handleDeleteFile = useCallback(async (filepath) => {
    const action = currentPath === 'trash' ? '完全に削除' : 'ゴミ箱に移動';
    if (!confirm(`「${filepath}」を${action}しますか？`)) return;
    
    try {
      const success = await fileOperations.deleteFile(filepath, currentPath);
      if (success) {
        // 選択解除
        actions.setSelectedFiles([]);
        // ディレクトリ更新は自動で行われる（カスタムイベント）
      }
    } catch (error) {
      notifyError(`削除に失敗しました: ${error.message}`);
    }
  }, [fileOperations, currentPath, actions, notifyError]);

  /**
   * お気に入り追加/削除ハンドラー
   */
  const handleToggleFavorite = useCallback(async (filepath, isFavorite) => {
    try {
      let success;
      if (isFavorite) {
        success = await fileOperations.removeFromFavorites(filepath);
      } else {
        success = await fileOperations.addToFavorites(filepath);
      }
      
      if (success) {
        // 更新は自動で行われる（カスタムイベント）
      }
    } catch (error) {
      notifyError(`お気に入り操作に失敗しました: ${error.message}`);
    }
  }, [fileOperations, notifyError]);

  /**
   * ゴミ箱から復元ハンドラー
   */
  const handleRestoreFromTrash = useCallback(async (filepath) => {
    try {
      const success = await fileOperations.restoreFromTrash(filepath);
      if (success) {
        actions.setSelectedFiles([]);
        // 更新は自動で行われる（カスタムイベント）
      }
    } catch (error) {
      notifyError(`復元に失敗しました: ${error.message}`);
    }
  }, [fileOperations, actions, notifyError]);

  /**
   * ファイル名変更ハンドラー
   */
  const handleRenameFile = useCallback(async (file, newName) => {
    if (!newName || newName === file.name) {
      setIsRenaming(null);
      return;
    }

    try {
      // 実際のAPI呼び出し（moveを使用して名前変更）
      const basePath = currentPath.startsWith('documents/') 
        ? currentPath.substring(10) 
        : currentPath === 'documents' ? '' : currentPath;
      
      const oldPath = basePath ? `${basePath}/${file.name}` : file.name;
      const newPath = basePath ? `${basePath}/${newName}` : newName;
      
      const result = await executeFileOperation('move', {
        path: oldPath,
        destination: newPath
      });

      if (result?.success) {
        notifySuccess(`「${file.name}」を「${newName}」に名前変更しました`);
        setIsRenaming(null);
        
        // 名前変更成功後にカスタムイベントを発火
        const event = new CustomEvent('fileOperationCompleted', {
          detail: { 
            operationType: 'rename_file', 
            data: { 
              oldName: file.name,
              newName: newName,
              timestamp: Date.now() 
            }
          }
        });
        window.dispatchEvent(event);
        console.log('🔄 File rename event dispatched:', file.name, '->', newName);
        
      } else {
        throw new Error(result?.error?.message || '名前変更に失敗しました');
      }
    } catch (error) {
      notifyError(`名前変更に失敗しました: ${error.message}`);
      setIsRenaming(null);
    }
  }, [currentPath, executeFileOperation, notifySuccess, notifyError]);

  /**
   * ファイル移動ハンドラー
   */
  const handleMoveFile = useCallback(async (file, destinationPath) => {
    try {
      const success = await fileOperations.moveFile(file.path || file.name, destinationPath);
      if (success) {
        actions.setSelectedFiles([]);
        // 更新は自動で行われる（カスタムイベント）
      }
    } catch (error) {
      notifyError(`移動に失敗しました: ${error.message}`);
    }
  }, [fileOperations, actions, notifyError]);

  /**
   * ファイルコピーハンドラー
   */
  const handleCopyFile = useCallback(async (file, destinationPath) => {
    try {
      const success = await fileOperations.copyFile(file.path || file.name, destinationPath);
      if (success) {
        // 更新は自動で行われる（カスタムイベント）
      }
    } catch (error) {
      notifyError(`コピーに失敗しました: ${error.message}`);
    }
  }, [fileOperations, notifyError]);

  /**
   * ファイルプレビューハンドラー（実装版・修正版）
   */
  const handlePreviewFile = useCallback(async (file) => {
    if (file.isDirectory) return;
    
    setPreviewFile(file);
    setIsPreviewOpen(true);
    setIsLoadingPreview(true);
    
    try {
      // ファイル内容を読み取り
      const result = await executeFileOperation('read_file', {
        path: file.path || file.name
      });
      
      if (result?.success && result.result) {
        // レスポンスからコンテンツを抽出
        let content = '';
        if (Array.isArray(result.result.content)) {
          content = result.result.content
            .filter(item => item.type === 'text')
            .map(item => item.text)
            .join('\n');
        } else if (typeof result.result === 'string') {
          content = result.result;
        } else if (result.result.text) {
          content = result.result.text;
        } else if (result.result.content) {
          content = result.result.content;
        }
        
        console.log('File content loaded:', content.substring(0, 100) + '...'); // デバッグ用
        
        // プレビューファイルの状態を更新（contentを含む）
        setPreviewFile({
          ...file,
          content: content
        });
      } else {
        throw new Error(result?.error?.message || 'ファイルの読み取りに失敗しました');
      }
    } catch (error) {
      console.error('ファイルプレビューエラー:', error);
      notifyError(`ファイルの読み取りに失敗しました: ${error.message}`);
      setIsPreviewOpen(false);
      setPreviewFile(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [executeFileOperation, notifyError]);

  /**
   * ファイル保存ハンドラー（新規実装）
   */
  const handleSaveFile = useCallback(async (content) => {
    if (!previewFile) return;
    
    try {
      const result = await executeFileOperation('update_file', {
        path: previewFile.path || previewFile.name,
        content: content
      });
      
      if (result?.success) {
        notifySuccess(`「${previewFile.name}」を保存しました`);
        
        // ファイル一覧を更新
        await refreshDirectory();
        
        // プレビューファイルの内容も更新
        setPreviewFile({
          ...previewFile,
          content: content,
          modifiedDate: new Date().toISOString()
        });
      } else {
        throw new Error(result?.error?.message || 'ファイルの保存に失敗しました');
      }
    } catch (error) {
      console.error('ファイル保存エラー:', error);
      notifyError(`ファイルの保存に失敗しました: ${error.message}`);
      throw error; // モーダル側でエラーハンドリング
    }
  }, [previewFile, executeFileOperation, notifySuccess, notifyError, refreshDirectory]);

  /**
   * ファイルダウンロードハンドラー（実装版）
   */
  const handleDownloadFile = useCallback(async (file, content = null) => {
    if (file.isDirectory) return;
    
    try {
      let downloadContent = content;
      
      // コンテンツが提供されていない場合は読み取り
      if (!downloadContent) {
        const result = await executeFileOperation('read_file', {
          path: file.path || file.name
        });
        
        if (result?.success && result.result) {
          if (Array.isArray(result.result.content)) {
            downloadContent = result.result.content
              .filter(item => item.type === 'text')
              .map(item => item.text)
              .join('\n');
          } else if (typeof result.result === 'string') {
            downloadContent = result.result;
          } else if (result.result.text) {
            downloadContent = result.result.text;
          } else if (result.result.content) {
            downloadContent = result.result.content;
          }
        } else {
          throw new Error('ファイルの読み取りに失敗しました');
        }
      }
      
      // ダウンロード処理
      const blob = new Blob([downloadContent], { 
        type: isTextFile(file.name) ? 'text/plain' : 'application/octet-stream' 
      });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      notifySuccess(`「${file.name}」をダウンロードしました`);
    } catch (error) {
      console.error('ダウンロードエラー:', error);
      notifyError(`ダウンロードに失敗しました: ${error.message}`);
    }
  }, [executeFileOperation, notifySuccess, notifyError]);

  /**
   * プレビューモーダルを閉じる
   */
  const handleClosePreview = useCallback(() => {
    setIsPreviewOpen(false);
    setPreviewFile(null);
    setIsLoadingPreview(false);
  }, []);

  /**
   * ゴミ箱を空にするハンドラー
   */
  const handleEmptyTrash = useCallback(async () => {
    if (!confirm('ゴミ箱を空にしますか？この操作は取り消せません。')) return;
    
    try {
      const success = await fileOperations.emptyTrash();
      if (success) {
        actions.setSelectedFiles([]);
        // 更新は自動で行われる（カスタムイベント）
      }
    } catch (error) {
      notifyError(`ゴミ箱を空にできませんでした: ${error.message}`);
    }
  }, [fileOperations, actions, notifyError]);

  /**
   * ドラッグ&ドロップハンドラー
   */
  const handleDragStart = useCallback((file) => {
    setDraggedFile(file);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedFile(null);
  }, []);

  const handleDrop = useCallback(async (targetFile, draggedFile) => {
    if (!draggedFile || !targetFile.isDirectory || currentPath === 'trash') return;
    
    if (draggedFile.name === targetFile.name) return; // 自分自身にはドロップできない
    
    try {
      const destinationPath = targetFile.path || targetFile.name;
      await handleMoveFile(draggedFile, destinationPath);
    } catch (error) {
      notifyError(`移動に失敗しました: ${error.message}`);
    }
  }, [currentPath, handleMoveFile, notifyError]);

  /**
   * パスナビゲーション（v3.0.0対応）
   */
  const pathNavigation = useMemo(() => {
    const getPathInfo = () => {
      switch (currentPath) {
        case 'documents':
          return { icon: Home, label: 'ドキュメント', breadcrumbs: [] };
        case 'recent':
          return { icon: Clock, label: '最近の更新', breadcrumbs: [] };
        case 'favorites':
          return { icon: Star, label: 'お気に入り', breadcrumbs: [] };
        case 'trash':
          return { icon: Trash2, label: 'ゴミ箱', breadcrumbs: [] };
        default:
          if (currentPath.startsWith('documents/')) {
            const pathParts = currentPath.substring(10).split('/').filter(Boolean);
            return {
              icon: Home,
              label: 'ドキュメント',
              breadcrumbs: pathParts
            };
          }
          return { icon: Home, label: 'ホーム', breadcrumbs: [] };
      }
    };

    const { icon: Icon, label, breadcrumbs } = getPathInfo();
    
    return (
      <div className="flex items-center text-sm text-gray-600 bg-gray-50 px-4 py-2 border-b">
        <button
          onClick={() => actions.setCurrentPath('documents')}
          className="flex items-center hover:text-gray-900 mr-2 transition-colors duration-200"
        >
          <Icon className="w-4 h-4 mr-1" />
          {label}
        </button>
        
        {breadcrumbs.map((segment, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const segmentPath = `documents/${breadcrumbs.slice(0, index + 1).join('/')}`;
          
          return (
            <React.Fragment key={index}>
              <ChevronLeft className="w-4 h-4 mx-1 rotate-180 text-gray-400" />
              {isLast ? (
                <span className="font-medium text-gray-900">{segment}</span>
              ) : (
                <button
                  onClick={() => actions.setCurrentPath(segmentPath)}
                  className="hover:text-gray-900 transition-colors duration-200"
                >
                  {segment}
                </button>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  }, [currentPath, actions]);

  /**
   * 特別なパス用のアクションボタン
   */
  const specialActions = useMemo(() => {
    if (currentPath === 'trash' && displayFiles.length > 0) {
      return (
        <button
          onClick={handleEmptyTrash}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200"
          title="ゴミ箱を空にする"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          ゴミ箱を空にする
        </button>
      );
    }
    return null;
  }, [currentPath, displayFiles, handleEmptyTrash]);

  // ツールバーコンポーネント（v3.0.0対応・表示モード切り替え削除）
  const toolbar = useMemo(() => (
    <div className="border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* ファイル数表示 */}
          <span className="text-sm text-gray-600">
            {displayFiles.length} アイテム
            {selectedFiles.length > 0 && (
              <span className="ml-2 text-blue-600">
                ({selectedFiles.length} 選択中)
              </span>
            )}
          </span>
          
          {/* 検索状態表示 */}
          {searchQuery && (
            <span className="text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded">
              「{searchQuery}」で検索中
            </span>
          )}
          
          {/* 特別なパス用アクション */}
          {specialActions}
        </div>
        
        <div className="flex items-center space-x-2">
          {/* 更新ボタン */}
          <button
            onClick={refreshDirectory}
            disabled={isLoadingFiles}
            className="inline-flex items-center px-2 py-1 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors duration-200"
            title="更新"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingFiles ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  ), [displayFiles.length, selectedFiles.length, searchQuery, specialActions, isLoadingFiles, refreshDirectory]);
  
  return (
    <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* パスナビゲーション */}
      {pathNavigation}

      {/* ツールバー */}
      {toolbar}
      
      {/* ファイル一覧 */}
      <div className="flex-1 overflow-auto">
        {isLoadingFiles ? (
          <LoadingState />
        ) : displayFiles.length === 0 ? (
          <EmptyState 
            currentPath={currentPath}
            searchQuery={searchQuery}
          />
        ) : viewMode === 'list' ? (
          <ListView
            files={sortedFiles}
            sortBy={sortBy}
            sortDirection={sortDirection}
            selectedFiles={selectedFilesSet}
            selectAll={selectAll}
            currentPath={currentPath}
            isRenaming={isRenaming}
            onFileClick={handleFileClick}
            onFileSelect={handleFileSelection}
            onSelectAll={handleSelectAll}
            onSortChange={handleSortChange}
            onContextMenu={handleContextMenu}
            onRename={handleRenameFile}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            getSortIcon={getSortIcon}
          />
        ) : (
          <GridView
            files={sortedFiles}
            selectedFiles={selectedFilesSet}
            currentPath={currentPath}
            isRenaming={isRenaming}
            draggedFile={draggedFile}
            onFileClick={handleFileClick}
            onFileSelect={handleFileSelection}
            onContextMenu={handleContextMenu}
            onRename={handleRenameFile}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
          />
        )}
      </div>
      
      {/* コンテキストメニュー（位置調整対応） */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          currentPath={currentPath}
          onClose={closeContextMenu}
          onDelete={handleDeleteFile}
          onToggleFavorite={handleToggleFavorite}
          onRestore={handleRestoreFromTrash}
          onRename={(file) => setIsRenaming(file.name)}
          onPreview={handlePreviewFile}
          onDownload={handleDownloadFile}
          onMove={handleMoveFile}
          onCopy={handleCopyFile}
        />
      )}

      {/* ファイルプレビュー・編集モーダル */}
      <FilePreviewModal
        file={previewFile}
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
        onSave={handleSaveFile}
        onDownload={handleDownloadFile}
        isLoading={isLoadingPreview}
        readOnly={currentPath === 'trash'}
        currentPath={currentPath}
      />
    </div>
  );
});

/**
 * リスト表示コンポーネント（v3.0.0対応・名前変更機能追加）
 */
const ListView = React.memo(({
  files,
  sortBy,
  sortDirection,
  selectedFiles,
  selectAll,
  currentPath,
  isRenaming,
  onFileClick,
  onFileSelect,
  onSelectAll,
  onSortChange,
  onContextMenu,
  onRename,
  onDragStart,
  onDragEnd,
  onDrop,
  getSortIcon
}) => {
  const getDateColumnLabel = () => {
    switch (currentPath) {
      case 'trash':
        return '削除日時';
      case 'recent':
        return '更新日時';
      default:
        return '更新日時';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="w-8 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <input
                type="checkbox"
                checked={selectAll}
                onChange={onSelectAll}
                className="rounded border-gray-300"
              />
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              onClick={() => onSortChange('name')}
            >
              <div className="flex items-center">
                名前
                {getSortIcon('name')}
              </div>
            </th>
            {currentPath !== 'recent' && (
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onSortChange('size')}
              >
                <div className="flex items-center">
                  サイズ
                  {getSortIcon('size')}
                </div>
              </th>
            )}
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              onClick={() => onSortChange('date')}
            >
              <div className="flex items-center">
                {getDateColumnLabel()}
                {getSortIcon('date')}
              </div>
            </th>
            {currentPath === 'recent' && (
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">アクション</th>
            )}
            {currentPath === 'trash' && (
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">元の場所</th>
            )}
            <th className="w-12 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {files.map((file) => (
            <FileTableRow
              key={file.path || file.name}
              file={file}
              currentPath={currentPath}
              isSelected={selectedFiles.has(file.name)}
              isRenaming={isRenaming === file.name}
              onClick={() => onFileClick(file)}
              onSelect={(selected) => onFileSelect(file.name, selected)}
              onContextMenu={(e) => onContextMenu(e, file)}
              onRename={(newName) => onRename(file, newName)}
              onDragStart={() => onDragStart(file)}
              onDragEnd={onDragEnd}
              onDrop={(draggedFile) => onDrop(file, draggedFile)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

/**
 * ファイルテーブル行コンポーネント（v3.0.0対応・名前変更機能追加）
 */
const FileTableRow = React.memo(({
  file,
  currentPath,
  isSelected,
  isRenaming,
  onClick,
  onSelect,
  onContextMenu,
  onRename,
  onDragStart,
  onDragEnd,
  onDrop
}) => {
  const [editName, setEditName] = useState(file.name);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);

  // 名前変更モードになった時にフォーカス
  React.useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const IconComponent = file.isDirectory ? Folder : File;
  
  const getDateDisplay = () => {
    switch (currentPath) {
      case 'trash':
        return formatDate(file.deletedDate || file.modifiedDate, 'MM/dd HH:mm');
      case 'recent':
        return formatDate(file.modifiedDate, 'MM/dd HH:mm');
      default:
        return formatDate(file.modifiedDate, 'MM/dd HH:mm');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onRename(editName);
    } else if (e.key === 'Escape') {
      setEditName(file.name);
      onRename(file.name); // 元の名前で確定（実質キャンセル）
    }
  };

  const handleDragOver = (e) => {
    if (file.isDirectory && currentPath !== 'trash') {
      e.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDropOnRow = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (file.isDirectory && currentPath !== 'trash') {
      const draggedFileName = e.dataTransfer.getData('text/plain');
      if (draggedFileName && draggedFileName !== file.name) {
        // ドロップされたファイルを探す
        // この部分は親コンポーネントから渡される必要がある
        onDrop({ name: draggedFileName });
      }
    }
  };
  
  return (
    <tr
      className={`hover:bg-gray-50 cursor-pointer transition-colors duration-200 ${
        isSelected ? 'bg-blue-50' : ''
      } ${isDragOver ? 'bg-blue-50 border-blue-300' : ''}`}
      onClick={isRenaming ? undefined : onClick}
      onContextMenu={onContextMenu}
      draggable={!isRenaming && currentPath !== 'trash'}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', file.name);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropOnRow}
    >
      <td className="px-6 py-4 whitespace-nowrap">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(e.target.checked);
          }}
          className="rounded border-gray-300"
        />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <IconComponent 
            className={`w-5 h-5 mr-3 ${file.isDirectory ? 'text-blue-500' : 'text-gray-500'}`} 
          />
          {isRenaming ? (
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => onRename(editName)}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <span className="font-medium text-gray-900">
              {truncateText(file.name, 40)}
            </span>
          )}
          {file.inFavorites && (
            <Star className="w-4 h-4 ml-2 text-yellow-500" title="お気に入り" />
          )}
          {file.isExecutable && (
            <span className="ml-2 text-xs text-orange-600" title="実行可能ファイル">⚠️</span>
          )}
        </div>
      </td>
      {currentPath !== 'recent' && (
        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
          {file.isDirectory ? '-' : formatFileSize(file.size)}
        </td>
      )}
      <td className="px-6 py-4 whitespace-nowrap text-gray-600">
        {getDateDisplay()}
      </td>
      {currentPath === 'recent' && (
        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {file.action || 'update'}
          </span>
        </td>
      )}
      {currentPath === 'trash' && (
        <td className="px-6 py-4 whitespace-nowrap text-gray-600 text-sm">
          {truncateText(file.originalPath || file.path, 30)}
        </td>
      )}
      <td className="px-6 py-4 whitespace-nowrap">
        <button
          className="inline-flex items-center px-2 py-1 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors duration-200"
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(e, file);
          }}
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
});

/**
 * グリッド表示コンポーネント（最適化版・名前変更機能追加）
 */
const GridView = React.memo(({
  files,
  selectedFiles,
  currentPath,
  isRenaming,
  draggedFile,
  onFileClick,
  onFileSelect,
  onContextMenu,
  onRename,
  onDragStart,
  onDragEnd,
  onDrop
}) => (
  <div className="p-4">
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {files.map((file) => (
        <FileItem
          key={file.path || file.name}
          file={file}
          currentPath={currentPath}
          isSelected={selectedFiles.has(file.name)}
          isRenaming={isRenaming === file.name}
          isDragging={draggedFile?.name === file.name}
          onClick={() => onFileClick(file)}
          onSelect={(selected) => onFileSelect(file.name, selected)}
          onContextMenu={(e) => onContextMenu(e, file)}
          onRename={(newName) => onRename(file, newName)}
          onDragStart={() => onDragStart(file)}
          onDragEnd={onDragEnd}
          onDrop={(draggedFile) => onDrop(file, draggedFile)}
          viewMode="grid"
        />
      ))}
    </div>
  </div>
));

/**
 * コンテキストメニューコンポーネント（v3.0.0対応・完全実装・位置調整対応）
 */
const ContextMenu = React.memo(({ 
  x, 
  y, 
  file, 
  currentPath, 
  onClose, 
  onDelete, 
  onToggleFavorite, 
  onRestore,
  onRename,
  onPreview,
  onDownload,
  onMove,
  onCopy
}) => {
  const menuItems = useMemo(() => {
    const items = [];

    // 基本操作
    if (currentPath !== 'trash') {
      items.push({
        icon: Eye,
        label: 'プレビュー',
        action: () => {
          onPreview(file);
          onClose();
        },
        disabled: file.isDirectory
      });

      items.push({
        icon: Download,
        label: 'ダウンロード',
        action: () => {
          onDownload(file);
          onClose();
        },
        disabled: file.isDirectory
      });

      items.push({
        icon: Edit,
        label: '名前を変更',
        action: () => {
          onRename(file);
          onClose();
        }
      });

      items.push({ divider: true });

      // お気に入り操作
      if (file.inFavorites) {
        items.push({
          icon: HeartOff,
          label: 'お気に入りから削除',
          action: () => {
            onToggleFavorite(file.path || file.name, true);
            onClose();
          }
        });
      } else {
        items.push({
          icon: Heart,
          label: 'お気に入りに追加',
          action: () => {
            onToggleFavorite(file.path || file.name, false);
            onClose();
          }
        });
      }

      items.push({ divider: true });

      items.push({
        icon: Copy,
        label: 'コピー',
        action: () => {
          // コピー先の選択ダイアログを実装する必要がある
          const destination = prompt('コピー先のパスを入力してください:');
          if (destination) {
            onCopy(file, destination);
          }
          onClose();
        }
      });

      items.push({
        icon: Move,
        label: '移動',
        action: () => {
          // 移動先の選択ダイアログを実装する必要がある
          const destination = prompt('移動先のパスを入力してください:');
          if (destination) {
            onMove(file, destination);
          }
          onClose();
        }
      });

      items.push({ divider: true });
    }

    // ゴミ箱操作
    if (currentPath === 'trash') {
      items.push({
        icon: RotateCcw,
        label: '復元',
        action: () => {
          onRestore(file.path || file.name);
          onClose();
        }
      });
      items.push({ divider: true });
    }

    // 削除操作
    items.push({
      icon: Trash2,
      label: currentPath === 'trash' ? '完全に削除' : 'ゴミ箱に移動',
      action: () => {
        onDelete(file.path || file.name);
        onClose();
      },
      danger: true
    });

    return items;
  }, [file, currentPath, onClose, onDelete, onToggleFavorite, onRestore, onRename, onPreview, onDownload, onMove, onCopy]);
  
  return (
    <>
      {/* オーバーレイ */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      
      {/* メニュー（位置調整対応） */}
      <div 
        className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-48 z-50"
        style={{ 
          left: Math.max(10, Math.min(x, window.innerWidth - 200)), 
          top: Math.max(10, Math.min(y, window.innerHeight - 300)) 
        }}
      >
        {menuItems.map((item, index) => {
          if (item.divider) {
            return <div key={index} className="border-t border-gray-200 my-1" />;
          }
          
          const Icon = item.icon;
          
          return (
            <button
              key={index}
              onClick={item.action}
              disabled={item.disabled}
              className={`w-full flex items-center px-4 py-2 text-sm text-left hover:bg-gray-100 transition-colors duration-200 ${
                item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700'
              } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Icon className="w-4 h-4 mr-3" />
              {item.label}
            </button>
          );
        })}
      </div>
    </>
  );
});

/**
 * ローディング状態コンポーネント（最適化版）
 */
const LoadingState = React.memo(() => (
  <div className="flex items-center justify-center h-64">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p className="text-gray-600">ファイルを読み込み中...</p>
    </div>
  </div>
));

/**
 * 空の状態コンポーネント（v3.0.0対応）
 */
const EmptyState = React.memo(({ currentPath, searchQuery }) => {
  const getEmptyStateContent = () => {
    if (searchQuery) {
      return {
        icon: Search,
        title: '検索結果が見つかりませんでした',
        message: `「${searchQuery}」に一致するファイルがありません`,
        actions: null
      };
    }

    switch (currentPath) {
      case 'recent':
        return {
          icon: Clock,
          title: '最近の更新はありません',
          message: 'ファイルを編集すると、ここに表示されます',
          actions: null
        };
      case 'favorites':
        return {
          icon: Star,
          title: 'お気に入りがありません',
          message: 'ファイルをお気に入りに追加すると、ここに表示されます',
          actions: null
        };
      case 'trash':
        return {
          icon: Trash2,
          title: 'ゴミ箱は空です',
          message: '削除したファイルがここに表示されます',
          actions: null
        };
      default:
        return {
          icon: Folder,
          title: 'ファイルがありません',
          message: '新しいファイルやフォルダを作成してください',
          actions: null
        };
    }
  };

  const { icon: Icon, title, message, actions } = getEmptyStateContent();

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <Icon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {title}
        </h3>
        <p className="text-gray-600 mb-4">
          {message}
        </p>
        {actions}
      </div>
    </div>
  );
});

FileList.displayName = 'FileList';

export default FileList;