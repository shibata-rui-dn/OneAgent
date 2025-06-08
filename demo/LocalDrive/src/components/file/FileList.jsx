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
import { downloadSingleFile, downloadMultipleFilesAsZip } from '../../utils/downloadUtils.js';

const FileList = React.memo(() => {
  const actions = useDashboardActions();
  const { viewMode } = useUIState();
  const { files, currentPath, selectedFiles, searchQuery, isLoadingFiles } = useFileState();
  const { recentFiles, favorites, trashItems } = useSystemState();
  
  const { executeFileOperation } = useAuth();
  const { success: notifySuccess, error: notifyError } = useNotification();
  
  const fileOperations = useMemo(() =>
    createFileOperations(actions, executeFileOperation, notifySuccess, notifyError),
    [actions, executeFileOperation, notifySuccess, notifyError]
  );
  
  const [contextMenu, setContextMenu] = useState(null);
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [selectAll, setSelectAll] = useState(false);
  const [isRenaming, setIsRenaming] = useState(null);
  const [draggedFile, setDraggedFile] = useState(null);
  
  const [previewFile, setPreviewFile] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  const sortedFilesCache = useRef({ files: [], sortBy: '', sortDirection: '', result: [] });
  
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
  
  // お気に入り状態を判定するためのSet（最適化版）
  const favoritesSet = useMemo(() => {
    if (!Array.isArray(favorites)) return new Set();
    return new Set(favorites.map(fav => fav.path || fav.name));
  }, [favorites]);

  // ファイルリストにお気に入り状態を注入（最適化版）
  const filesWithFavoriteStatus = useMemo(() => {
    return displayFiles.map(file => ({
      ...file,
      inFavorites: favoritesSet.has(file.path || file.name)
    }));
  }, [displayFiles, favoritesSet]);
  
  const sortedFiles = useMemo(() => {
    const cache = sortedFilesCache.current;
    if (cache.files === filesWithFavoriteStatus && cache.sortBy === sortBy && cache.sortDirection === sortDirection) {
      return cache.result;
    }
    
    const sorted = [...filesWithFavoriteStatus].sort((a, b) => {
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
    
    sortedFilesCache.current = { files: filesWithFavoriteStatus, sortBy, sortDirection, result: sorted };
    return sorted;
  }, [filesWithFavoriteStatus, sortBy, sortDirection, currentPath]);

  const selectedFilesSet = useMemo(() => {
    return new Set(selectedFiles.map(f => f.name || f));
  }, [selectedFiles]);

  const refreshDirectory = useCallback(async () => {
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
  }, [currentPath]);

  const handleContextMenu = useCallback((event, file) => {
    event.preventDefault();
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    const menuWidth = 200;
    const menuHeight = 300;
    
    let x = event.clientX;
    let y = event.clientY;
    
    if (x + menuWidth > viewportWidth) {
      x = viewportWidth - menuWidth - 10;
    }
    
    if (y + menuHeight > viewportHeight) {
      y = viewportHeight - menuHeight - 10;
    }
    
    if (x < 10) {
      x = 10;
    }
    
    if (y < 10) {
      y = 10;
    }
    
    setContextMenu({
      x,
      y,
      file
    });
  }, []);
  
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleFileClick = useCallback((file) => {
    if (file.isDirectory && currentPath !== 'trash') {
      let newPath;
      if (currentPath === 'recent' || currentPath === 'favorites') {
        newPath = `documents/${file.path}`;
      } else if (currentPath.startsWith('documents')) {
        const basePath = currentPath === 'documents' ? '' : currentPath.substring(10);
        newPath = `documents/${basePath ? `${basePath}/` : ''}${file.name}`;
      } else {
        newPath = `documents/${file.name}`;
      }
      actions.setCurrentPath(newPath);
    } else {
      handlePreviewFile(file);
    }
  }, [currentPath, actions]);

  const handleFileSelection = useCallback((fileName, isSelected) => {
    const file = displayFiles.find(f => f.name === fileName);
    if (file) {
      const newSelectedFiles = isSelected
        ? [...selectedFiles, file]
        : selectedFiles.filter(f => (f.name || f) !== fileName);
      actions.setSelectedFiles(newSelectedFiles);
    }
  }, [displayFiles, selectedFiles, actions]);

  const handleSelectAll = useCallback(() => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);
    
    const newSelectedFiles = newSelectAll ? [...displayFiles] : [];
    actions.setSelectedFiles(newSelectedFiles);
  }, [selectAll, displayFiles, actions]);

  const handleSortChange = useCallback((field) => {
    if (sortBy === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  }, [sortBy]);

  const getSortIcon = useCallback((field) => {
    if (sortBy !== field) return null;
    return sortDirection === 'asc' ? 
      <SortAsc className="w-4 h-4 ml-1" /> : 
      <SortDesc className="w-4 h-4 ml-1" />;
  }, [sortBy, sortDirection]);

  const handleDeleteFile = useCallback(async (filepath) => {
    const action = currentPath === 'trash' ? '完全に削除' : 'ゴミ箱に移動';
    if (!confirm(`「${filepath}」を${action}しますか？`)) return;
    
    try {
      const success = await fileOperations.deleteFile(filepath, currentPath);
      if (success) {
        actions.setSelectedFiles([]);
      }
    } catch (error) {
      notifyError(`削除に失敗しました: ${error.message}`);
    }
  }, [fileOperations, currentPath, actions, notifyError]);

  // 最適化されたお気に入りトグル処理（通知削除）
  const handleToggleFavorite = useCallback(async (file, event) => {
    // イベントの伝播を停止
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    const filepath = file.path || file.name;
    const isFavorite = file.inFavorites || favoritesSet.has(filepath);
    
    try {
      if (isFavorite) {
        await fileOperations.removeFromFavorites(filepath);
        // 通知は削除
      } else {
        await fileOperations.addToFavorites(filepath);
        // 通知は削除
      }
    } catch (error) {
      // エラー時はfileOperations内でローカル状態が復元される
      notifyError(`お気に入り操作に失敗しました: ${error.message}`);
    }
  }, [fileOperations, favoritesSet, notifyError]);

  const handleRestoreFromTrash = useCallback(async (filepath) => {
    try {
      const success = await fileOperations.restoreFromTrash(filepath);
      if (success) {
        actions.setSelectedFiles([]);
      }
    } catch (error) {
      notifyError(`復元に失敗しました: ${error.message}`);
    }
  }, [fileOperations, actions, notifyError]);

  const handleRenameFile = useCallback(async (file, newName) => {
    if (!newName || newName === file.name) {
      setIsRenaming(null);
      return;
    }

    try {
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
        notifySuccess('名前を変更しました');
        setIsRenaming(null);
        
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
        
      } else {
        throw new Error(result?.error?.message || '名前変更に失敗しました');
      }
    } catch (error) {
      notifyError(`名前変更に失敗しました: ${error.message}`);
      setIsRenaming(null);
    }
  }, [currentPath, executeFileOperation, notifySuccess, notifyError]);

  const handleMoveFile = useCallback(async (file, destinationPath) => {
    try {
      const success = await fileOperations.moveFile(file.path || file.name, destinationPath);
      if (success) {
        actions.setSelectedFiles([]);
      }
    } catch (error) {
      notifyError(`移動に失敗しました: ${error.message}`);
    }
  }, [fileOperations, actions, notifyError]);

  const handleCopyFile = useCallback(async (file, destinationPath) => {
    try {
      const success = await fileOperations.copyFile(file.path || file.name, destinationPath);
    } catch (error) {
      notifyError(`コピーに失敗しました: ${error.message}`);
    }
  }, [fileOperations, notifyError]);

  const handlePreviewFile = useCallback(async (file) => {
    if (file.isDirectory) return;
    
    setPreviewFile(file);
    setIsPreviewOpen(true);
    setIsLoadingPreview(true);
    
    try {
      const result = await executeFileOperation('read_file', {
        path: file.path || file.name
      });
      
      if (!result?.success) {
        throw new Error(result?.error?.message || 'ファイルの読み取りに失敗しました');
      }

      let content = '';
      
      if (result.data && result.data.file && result.data.file.content !== undefined) {
        content = result.data.file.content;
      } else if (result.result) {
        const extractJSONResponse = (resultData) => {
          try {
            if (typeof resultData === 'object' && resultData !== null) {
              if (resultData.success !== undefined) {
                return resultData;
              }
              if (resultData.data && resultData.data.file) {
                return resultData;
              }
            }

            let jsonStr = '';
            if (Array.isArray(resultData.content)) {
              jsonStr = resultData.content
                .filter(item => item.type === 'text')
                .map(item => item.text)
                .join('\n');
            } else if (typeof resultData === 'string') {
              jsonStr = resultData;
            } else if (resultData.text) {
              jsonStr = resultData.text;
            }

            if (jsonStr.trim()) {
              const parsed = JSON.parse(jsonStr);
              if (parsed.success !== undefined && parsed.data) {
                return parsed;
              }
              return parsed;
            }
            
            return null;
          } catch (error) {
            return null;
          }
        };
        
        const extractedResponse = extractJSONResponse(result.result);
        
        if (extractedResponse && extractedResponse.success && extractedResponse.data && extractedResponse.data.file) {
          content = extractedResponse.data.file.content || '';
        } else if (Array.isArray(result.result.content)) {
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
      }
      
      if (content === undefined || content === null) {
        throw new Error('ファイル内容を取得できませんでした');
      }
      
      setPreviewFile({
        ...file,
        content: content
      });
      
    } catch (error) {
      console.error('ファイルプレビューエラー:', error);
      notifyError(`ファイルの読み取りに失敗しました: ${error.message}`);
      setIsPreviewOpen(false);
      setPreviewFile(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [executeFileOperation, notifyError]);

  const handleSaveFile = useCallback(async (content) => {
    if (!previewFile) return;
    
    try {
      const result = await executeFileOperation('update_file', {
        path: previewFile.path || previewFile.name,
        content: content
      });
      
      let success = false;
      
      if (result?.success) {
        success = true;
      } else if (result?.data && result.data.success) {
        success = true;
      } else {
        const extractJSONResponse = (resultData) => {
          try {
            if (typeof resultData === 'object' && resultData !== null) {
              if (resultData.success !== undefined) {
                return resultData;
              }
            }

            let jsonStr = '';
            if (Array.isArray(resultData.content)) {
              jsonStr = resultData.content
                .filter(item => item.type === 'text')
                .map(item => item.text)
                .join('\n');
            } else if (typeof resultData === 'string') {
              jsonStr = resultData;
            } else if (resultData.text) {
              jsonStr = resultData.text;
            }

            if (jsonStr.trim()) {
              return JSON.parse(jsonStr);
            }
            
            return null;
          } catch (error) {
            return null;
          }
        };

        const extractedResponse = extractJSONResponse(result?.result || result);
        success = extractedResponse?.success || false;
      }
      
      if (success) {
        notifySuccess('ファイルを保存しました');
        
        const event = new CustomEvent('fileOperationCompleted', {
          detail: { 
            operationType: 'save_file', 
            data: { 
              fileName: previewFile.name,
              timestamp: Date.now() 
            }
          }
        });
        window.dispatchEvent(event);
        
        setPreviewFile({
          ...previewFile,
          content: content,
          modifiedDate: new Date().toISOString()
        });
      } else {
        const errorMessage = result?.error?.message || 
                            result?.data?.error?.message || 
                            'ファイルの保存に失敗しました';
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('ファイル保存エラー:', error);
      notifyError(`ファイルの保存に失敗しました: ${error.message}`);
      throw error;
    }
  }, [previewFile, executeFileOperation, notifySuccess, notifyError]);

  const handleDownloadFile = useCallback(async (file, content = null) => {
  try {
    await downloadSingleFile(file, content, executeFileOperation);
    notifySuccess(`「${file.name}」をダウンロードしました`);
  } catch (error) {
    console.error('ダウンロードエラー:', error);
    notifyError(`ダウンロードに失敗しました: ${error.message}`);
  }
}, [executeFileOperation, notifySuccess, notifyError]);

  const handleClosePreview = useCallback(() => {
    setIsPreviewOpen(false);
    setPreviewFile(null);
    setIsLoadingPreview(false);
  }, []);

  const handleEmptyTrash = useCallback(async () => {
    if (!confirm('ゴミ箱を空にしますか？この操作は取り消せません。')) return;
    
    try {
      const success = await fileOperations.emptyTrash();
      if (success) {
        actions.setSelectedFiles([]);
      }
    } catch (error) {
      notifyError(`ゴミ箱を空にできませんでした: ${error.message}`);
    }
  }, [fileOperations, actions, notifyError]);

  // 一括削除処理
  const handleBulkDelete = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    
    const action = currentPath === 'trash' ? '完全に削除' : 'ゴミ箱に移動';
    const fileNames = selectedFiles.map(f => f.name || f).join('、');
    
    if (!confirm(`選択した${selectedFiles.length}個のアイテムを${action}しますか？\n\n${fileNames}`)) return;
    
    try {
      let successCount = 0;
      for (const file of selectedFiles) {
        const filepath = file.path || file.name || file;
        const success = await fileOperations.deleteFile(filepath, currentPath);
        if (success) successCount++;
      }
      
      if (successCount > 0) {
        notifySuccess(`${successCount}個のアイテムを${action}しました`);
        actions.setSelectedFiles([]);
        
        // 画面更新のためのイベント発火
        const event = new CustomEvent('fileOperationCompleted', {
          detail: { 
            operationType: 'bulk_delete', 
            data: { 
              count: successCount,
              timestamp: Date.now() 
            }
          }
        });
        window.dispatchEvent(event);
      }
      
      if (successCount < selectedFiles.length) {
        notifyError(`${selectedFiles.length - successCount}個のアイテムの${action}に失敗しました`);
      }
    } catch (error) {
      notifyError(`一括${action}に失敗しました: ${error.message}`);
    }
  }, [selectedFiles, currentPath, fileOperations, actions, notifySuccess, notifyError]);

  const handleBulkDownload = useCallback(async () => {
  if (selectedFiles.length === 0) return;
  
  try {
    const filename = await downloadMultipleFilesAsZip(selectedFiles, executeFileOperation);
    notifySuccess(`${selectedFiles.length}個のアイテムをZIPでダウンロードしました（${filename}）`);
    actions.setSelectedFiles([]);
  } catch (error) {
    console.error('一括ダウンロードエラー:', error);
    notifyError(`一括ダウンロードに失敗しました: ${error.message}`);
  }
}, [selectedFiles, executeFileOperation, actions, notifySuccess, notifyError]);

  // 一括復元処理（ゴミ箱用）
  const handleBulkRestore = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    
    const fileNames = selectedFiles.map(f => f.name || f).join('、');
    
    if (!confirm(`選択した${selectedFiles.length}個のアイテムを復元しますか？\n\n${fileNames}`)) return;
    
    try {
      let successCount = 0;
      for (const file of selectedFiles) {
        const filepath = file.path || file.name || file;
        const success = await fileOperations.restoreFromTrash(filepath);
        if (success) successCount++;
      }
      
      if (successCount > 0) {
        notifySuccess(`${successCount}個のアイテムを復元しました`);
        actions.setSelectedFiles([]);
        
        // 画面更新のためのイベント発火
        const event = new CustomEvent('fileOperationCompleted', {
          detail: { 
            operationType: 'bulk_restore', 
            data: { 
              count: successCount,
              timestamp: Date.now() 
            }
          }
        });
        window.dispatchEvent(event);
      }
      
      if (successCount < selectedFiles.length) {
        notifyError(`${selectedFiles.length - successCount}個のアイテムの復元に失敗しました`);
      }
    } catch (error) {
      notifyError(`一括復元に失敗しました: ${error.message}`);
    }
  }, [selectedFiles, fileOperations, actions, notifySuccess, notifyError]);

  const handleDragStart = useCallback((file) => {
    setDraggedFile(file);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedFile(null);
  }, []);

  const handleDrop = useCallback(async (targetFile, draggedFile) => {
    if (!draggedFile || !targetFile.isDirectory || currentPath === 'trash') return;
    
    if (draggedFile.name === targetFile.name) return;
    
    try {
      const destinationPath = targetFile.path || targetFile.name;
      await handleMoveFile(draggedFile, destinationPath);
    } catch (error) {
      notifyError(`移動に失敗しました: ${error.message}`);
    }
  }, [currentPath, handleMoveFile, notifyError]);

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

  const toolbar = useMemo(() => (
    <div className="border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-600">
            {displayFiles.length} アイテム
            {selectedFiles.length > 0 && (
              <span className="ml-2 text-blue-600">
                ({selectedFiles.length} 選択中)
              </span>
            )}
          </span>
          
          {searchQuery && (
            <span className="text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded">
              「{searchQuery}」で検索中
            </span>
          )}
          
          {/* 一括操作ボタン */}
          {selectedFiles.length > 0 && (
            <div className="flex items-center space-x-2 border-l border-gray-200 pl-4">
              {currentPath !== 'trash' && (
                <button
                  onClick={handleBulkDownload}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-200"
                  title="選択したアイテムをダウンロード"
                >
                  <Download className="w-4 h-4 mr-1" />
                  ダウンロード
                </button>
              )}
              <button
                onClick={handleBulkDelete}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200"
                title={currentPath === 'trash' ? '選択したアイテムを完全に削除' : '選択したアイテムをゴミ箱に移動'}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {currentPath === 'trash' ? '完全削除' : '削除'}
              </button>
              {currentPath === 'trash' && (
                <button
                  onClick={handleBulkRestore}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                  title="選択したアイテムを復元"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  復元
                </button>
              )}
            </div>
          )}
          
          {specialActions}
        </div>
        
        <div className="flex items-center space-x-2">
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
  ), [displayFiles.length, selectedFiles.length, searchQuery, specialActions, isLoadingFiles, refreshDirectory, currentPath, handleBulkDownload, handleBulkDelete, handleBulkRestore]);
  
  return (
    <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {pathNavigation}

      {toolbar}
      
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
            favoritesSet={favoritesSet}
            onFileClick={handleFileClick}
            onFileSelect={handleFileSelection}
            onSelectAll={handleSelectAll}
            onSortChange={handleSortChange}
            onContextMenu={handleContextMenu}
            onRename={handleRenameFile}
            onToggleFavorite={handleToggleFavorite}
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
            favoritesSet={favoritesSet}
            onFileClick={handleFileClick}
            onFileSelect={handleFileSelection}
            onContextMenu={handleContextMenu}
            onRename={handleRenameFile}
            onToggleFavorite={handleToggleFavorite}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
          />
        )}
      </div>
      
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          currentPath={currentPath}
          isFavorite={contextMenu.file.inFavorites || favoritesSet.has(contextMenu.file.path || contextMenu.file.name)}
          onClose={closeContextMenu}
          onDelete={handleDeleteFile}
          onToggleFavorite={(file) => handleToggleFavorite(file)}
          onRestore={handleRestoreFromTrash}
          onRename={(file) => setIsRenaming(file.name)}
          onPreview={handlePreviewFile}
          onDownload={handleDownloadFile}
          onMove={handleMoveFile}
          onCopy={handleCopyFile}
        />
      )}

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

const ListView = React.memo(({
  files,
  sortBy,
  sortDirection,
  selectedFiles,
  selectAll,
  currentPath,
  isRenaming,
  favoritesSet,
  onFileClick,
  onFileSelect,
  onSelectAll,
  onSortChange,
  onContextMenu,
  onRename,
  onToggleFavorite,
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
            {/* お気に入りカラムをゴミ箱以外で表示 */}
            {currentPath !== 'trash' && (
              <th className="w-12 px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                <Star className="w-4 h-4 mx-auto" />
              </th>
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
              isFavorite={file.inFavorites}
              onClick={() => onFileClick(file)}
              onSelect={(selected) => onFileSelect(file.name, selected)}
              onContextMenu={(e) => onContextMenu(e, file)}
              onRename={(newName) => onRename(file, newName)}
              onToggleFavorite={(e) => onToggleFavorite(file, e)}
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

const FileTableRow = React.memo(({
  file,
  currentPath,
  isSelected,
  isRenaming,
  isFavorite,
  onClick,
  onSelect,
  onContextMenu,
  onRename,
  onToggleFavorite,
  onDragStart,
  onDragEnd,
  onDrop
}) => {
  const [editName, setEditName] = useState(file.name);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);

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
      onRename(file.name);
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
      <td 
        className="px-6 py-4 whitespace-nowrap"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
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
      {/* お気に入りボタン（ゴミ箱以外） */}
      {currentPath !== 'trash' && (
        <td className="px-6 py-4 whitespace-nowrap text-center">
          <button
            onClick={onToggleFavorite}
            className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 ${
              isFavorite 
                ? 'text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50' 
                : 'text-gray-300 hover:text-yellow-500 hover:bg-yellow-50'
            }`}
            title={isFavorite ? 'お気に入りから削除' : 'お気に入りに追加'}
          >
            <Star 
              className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} 
            />
          </button>
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

const GridView = React.memo(({
  files,
  selectedFiles,
  currentPath,
  isRenaming,
  draggedFile,
  favoritesSet,
  onFileClick,
  onFileSelect,
  onContextMenu,
  onRename,
  onToggleFavorite,
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
          isFavorite={file.inFavorites}
          onClick={() => onFileClick(file)}
          onSelect={(selected) => onFileSelect(file.name, selected)}
          onContextMenu={(e) => onContextMenu(e, file)}
          onRename={(newName) => onRename(file, newName)}
          onToggleFavorite={(e) => onToggleFavorite(file, e)}
          onDragStart={() => onDragStart(file)}
          onDragEnd={onDragEnd}
          onDrop={(draggedFile) => onDrop(file, draggedFile)}
          viewMode="grid"
        />
      ))}
    </div>
  </div>
));

const ContextMenu = React.memo(({ 
  x, 
  y, 
  file, 
  currentPath,
  isFavorite,
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

      if (isFavorite) {
        items.push({
          icon: HeartOff,
          label: 'お気に入りから削除',
          action: () => {
            onToggleFavorite(file);
            onClose();
          }
        });
      } else {
        items.push({
          icon: Heart,
          label: 'お気に入りに追加',
          action: () => {
            onToggleFavorite(file);
            onClose();
          }
        });
      }

      items.push({ divider: true });

      items.push({
        icon: Copy,
        label: 'コピー',
        action: () => {
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
          const destination = prompt('移動先のパスを入力してください:');
          if (destination) {
            onMove(file, destination);
          }
          onClose();
        }
      });

      items.push({ divider: true });
    }

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
  }, [file, currentPath, isFavorite, onClose, onDelete, onToggleFavorite, onRestore, onRename, onPreview, onDownload, onMove, onCopy]);
  
  return (
    <>
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      
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

const LoadingState = React.memo(() => (
  <div className="flex items-center justify-center h-64">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p className="text-gray-600">ファイルを読み込み中...</p>
    </div>
  </div>
));

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