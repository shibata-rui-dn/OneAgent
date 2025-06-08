import React, { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';
import FileList from '../components/file/FileList';
import { useAuth } from '../hooks/useAuth';
import { useNotification } from '../contexts/NotificationContext';
import { withAuth } from '../contexts/AuthContext';
import { 
  useDashboardActions, 
  useUIState,
  useFileState,
  useSystemState
} from '../contexts/DashboardContext';
import { ROUTES } from '../utils/constants';

const DashboardPage = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, executeFileOperation } = useAuth();
  const { success: notifySuccess, error: notifyError } = useNotification();
  
  const actions = useDashboardActions();
  const { isLoading, isInitialized } = useUIState();
  const { currentPath } = useFileState();
  const { quotaInfo, folderTree } = useSystemState();
  
  const initializationRef = useRef(false);
  const lastPathRef = useRef('');

  // フォルダツリーキャッシュ（メモリ内保存）
  const folderTreeCacheRef = useRef({
    data: null,
    timestamp: 0,
    expiry: 5 * 60 * 1000 // 5分
  });

  const loadQuotaInfo = useCallback(async () => {
    try {
      const result = await executeFileOperation('get_quota');
      
      if (result?.success && result?.result) {
        const quotaData = parseQuotaInfo(result.result);
        
        if (quotaData.used === '0 B' || parseSizeToBytes(quotaData.used) === 0) {
          try {
            const filesResult = await executeFileOperation('list', { path: '' });
            if (filesResult?.success && filesResult?.result) {
              const filesList = parseDirectoryListing(filesResult.result);
              const totalSize = filesList.reduce((sum, file) => {
                return sum + (file.size || 0);
              }, 0);
              
              if (totalSize > 0) {
                const estimatedUsed = formatBytesToSize(totalSize);
                const totalBytes = parseSizeToBytes(quotaData.total);
                const percentage = totalBytes > 0 ? (totalSize / totalBytes) * 100 : 0;
                const remaining = formatBytesToSize(Math.max(0, totalBytes - totalSize));
                
                const updatedQuota = {
                  ...quotaData,
                  used: estimatedUsed,
                  percentage: percentage,
                  remaining: remaining,
                  fileCount: filesList.length,
                  isEstimated: true
                };
                
                actions.setQuotaInfo(updatedQuota);
                return;
              }
            }
          } catch (estimationError) {
            console.warn('⚠️ Estimation failed, using API data:', estimationError);
          }
        }
        
        actions.setQuotaInfo(quotaData);
      } else {
        try {
          const filesResult = await executeFileOperation('list', { path: '' });
          if (filesResult?.success && filesResult?.result) {
            const filesList = parseDirectoryListing(filesResult.result);
            const totalSize = filesList.reduce((sum, file) => {
              return sum + (file.size || 0);
            }, 0);
            
            if (totalSize > 0) {
              const estimatedUsed = formatBytesToSize(totalSize);
              const totalCapacity = 1024 * 1024 * 1024;
              const percentage = (totalSize / totalCapacity) * 100;
              const remaining = formatBytesToSize(Math.max(0, totalCapacity - totalSize));
              
              const estimatedQuota = {
                used: estimatedUsed,
                total: '1 GB',
                percentage: percentage,
                remaining: remaining,
                fileCount: filesList.length,
                isEstimated: true
              };
              
              actions.setQuotaInfo(estimatedQuota);
              return;
            }
          }
        } catch (estimationError) {
          console.error('❌ Estimation failed:', estimationError);
        }
        
        const fallbackQuota = {
          used: '0 B',
          total: '1 GB',
          percentage: 0,
          fileCount: 0,
          remaining: '1 GB'
        };
        actions.setQuotaInfo(fallbackQuota);
      }
    } catch (error) {
      console.error('❌ Failed to load quota info:', error);
      
      try {
        const filesResult = await executeFileOperation('list', { path: '' });
        if (filesResult?.success && filesResult?.result) {
          const filesList = parseDirectoryListing(filesResult.result);
          const totalSize = filesList.reduce((sum, file) => {
            return sum + (file.size || 0);
          }, 0);
          
          if (totalSize > 0) {
            const estimatedUsed = formatBytesToSize(totalSize);
            const totalCapacity = 1024 * 1024 * 1024;
            const percentage = (totalSize / totalCapacity) * 100;
            const remaining = formatBytesToSize(Math.max(0, totalCapacity - totalSize));
            
            const estimatedQuota = {
              used: estimatedUsed,
              total: '1 GB',
              percentage: percentage,
              remaining: remaining,
              fileCount: filesList.length,
              isEstimated: true
            };
            
            actions.setQuotaInfo(estimatedQuota);
            return;
          }
        }
      } catch (estimationError) {
        console.error('❌ Estimation also failed:', estimationError);
      }
      
      const fallbackQuota = {
        used: '0 B',
        total: '1 GB',
        percentage: 0,
        fileCount: 0,
        remaining: '1 GB'
      };
      actions.setQuotaInfo(fallbackQuota);
    }
  }, [executeFileOperation, actions.setQuotaInfo]);

  // キャッシュ付きフォルダツリー読み込み
  const loadFolderTree = useCallback(async (forceRefresh = false) => {
    const cache = folderTreeCacheRef.current;
    const now = Date.now();
    
    // キャッシュが有効で強制更新でない場合はキャッシュを使用
    if (!forceRefresh && cache.data && (now - cache.timestamp) < cache.expiry) {
      console.log('📁 Using cached folder tree');
      actions.setFolderTree(cache.data);
      return;
    }
    
    try {
      console.log('📁 Loading folder tree from API');
      const tree = await buildFolderTreeWithLimit('', 0, 3, 3, executeFileOperation);
      
      // キャッシュに保存
      folderTreeCacheRef.current = {
        data: tree,
        timestamp: now,
        expiry: cache.expiry
      };
      
      actions.setFolderTree(tree);
    } catch (error) {
      console.error('Failed to load folder tree:', error);
      actions.setFolderTree([]);
    }
  }, [executeFileOperation, actions.setFolderTree]);

  const loadRecentUpdates = useCallback(async () => {
    try {
      const result = await executeFileOperation('get_recent_updates', { limit: 20 });
      if (result?.result) {
        const recentUpdates = parseRecentUpdates(result.result);
        actions.setRecentFiles(recentUpdates);
      } else {
        actions.setRecentFiles([]);
      }
    } catch (error) {
      console.error('Failed to load recent updates:', error);
      actions.setRecentFiles([]);
    }
  }, [executeFileOperation, actions.setRecentFiles]);

  const loadFavorites = useCallback(async () => {
    try {
      const result = await executeFileOperation('get_favorites');
      if (result?.result) {
        const favoritesList = parseFavorites(result.result);
        actions.setFavorites(favoritesList);
      } else {
        actions.setFavorites([]);
      }
    } catch (error) {
      console.error('Failed to load favorites:', error);
      actions.setFavorites([]);
    }
  }, [executeFileOperation, actions.setFavorites]);

  const loadTrashItems = useCallback(async () => {
    try {
      const result = await executeFileOperation('list_trash');
      if (result?.result) {
        const trashItems = parseTrashListing(result.result);
        actions.setTrashItems(trashItems);
      } else {
        actions.setTrashItems([]);
      }
    } catch (error) {
      console.error('Failed to load trash items:', error);
      actions.setTrashItems([]);
    }
  }, [executeFileOperation, actions.setTrashItems]);

  const loadCurrentDirectory = useCallback(async (path) => {
    try {
      actions.setFilesLoading(true);
      
      if (path === 'recent') {
        await loadRecentUpdates();
        return;
      } else if (path === 'favorites') {
        await loadFavorites();
        return;
      } else if (path === 'trash') {
        const result = await executeFileOperation('list_trash');
        
        if (result?.result) {
          const trashItems = parseTrashListing(result.result);
          actions.setFiles(trashItems);
          actions.setTrashItems(trashItems);
        } else {
          actions.setFiles([]);
          actions.setTrashItems([]);
        }
        return;
      }
      
      let actualPath = path;
      if (path && path.startsWith('documents/')) {
        actualPath = path.substring(10);
      } else if (path === 'documents') {
        actualPath = '';
      }
      
      const result = await executeFileOperation('list', { path: actualPath });
      
      if (result?.result) {
        const items = parseDirectoryListing(result.result);
        actions.setFiles(items);
      } else {
        actions.setFiles([]);
      }
    } catch (error) {
      console.error('❌ Failed to load directory:', error);
      const displayPath = path || 'ルート';
      notifyError(`ディレクトリ「${displayPath}」の読み込みに失敗しました`);
      actions.setFiles([]);
    } finally {
      actions.setFilesLoading(false);
    }
  }, [executeFileOperation, actions.setFilesLoading, actions.setFiles, actions.setTrashItems, loadRecentUpdates, loadFavorites, notifyError]);

  const initializeDashboard = useCallback(async () => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    try {
      actions.setLoading(true);

      const lastPath = localStorage.getItem('oneagent_last_path') || '';
      const initialPath = lastPath || '';
      actions.setCurrentPath(initialPath);

      await Promise.allSettled([
        loadQuotaInfo(),
        loadFolderTree(),
        loadRecentUpdates(),
        loadFavorites(),
        loadTrashItems(),
        loadCurrentDirectory(initialPath)
      ]);

      const hasShownWelcome = localStorage.getItem('oneagent_welcome_shown');
      if (!hasShownWelcome && user) {
        notifySuccess(`${user.username}さん、ようこそ！`, {
          title: 'ログイン完了',
          duration: 3000
        });
        localStorage.setItem('oneagent_welcome_shown', 'true');
      }

      actions.setInitialized();
    } catch (error) {
      console.error('Dashboard initialization failed:', error);
      notifyError('ダッシュボードの初期化に失敗しました');
    } finally {
      actions.setLoading(false);
      initializationRef.current = false;
    }
  }, [
    user, 
    actions.setLoading, 
    actions.setCurrentPath, 
    actions.setInitialized,
    loadQuotaInfo, 
    loadFolderTree, 
    loadRecentUpdates, 
    loadFavorites, 
    loadTrashItems,
    loadCurrentDirectory,
    notifySuccess, 
    notifyError
  ]);

  useEffect(() => {
    if (isAuthenticated && user && !isInitialized && !initializationRef.current) {
      initializeDashboard();
    }
  }, [isAuthenticated, user, isInitialized, initializeDashboard]);

  useEffect(() => {
    if (isInitialized && currentPath && lastPathRef.current !== currentPath) {
      actions.setFiles([]);
      loadCurrentDirectory(currentPath);
      lastPathRef.current = currentPath;
    }
  }, [currentPath, isInitialized, loadCurrentDirectory, actions.setFiles]);

  // 最適化されたファイル操作完了ハンドラー
  useEffect(() => {
    const handleFileOperationComplete = (event) => {
      const { operationType, data } = event.detail;
      
      console.log('🔄 File operation completed:', operationType);
      
      // 操作タイプに応じて必要な更新のみを実行
      const updates = [];
      
      switch (operationType) {
        case 'add_to_favorites':
        case 'remove_from_favorites':
          // お気に入り操作：お気に入りリストのみ更新
          updates.push(loadFavorites());
          // 現在のパスがお気に入りページの場合のみディレクトリ更新
          if (currentPath === 'favorites') {
            updates.push(loadCurrentDirectory(currentPath));
          }
          break;
          
        case 'create_file':
        case 'create_folder':
        case 'delete_file':
        case 'move_file':
        case 'copy_file':
        case 'rename_file':
          // ファイル操作：ディレクトリ、容量、フォルダツリーを更新
          updates.push(
            loadCurrentDirectory(currentPath),
            loadQuotaInfo(),
            loadFolderTree(true) // 強制更新
          );
          // 最近の更新にも反映
          if (operationType !== 'delete_file') {
            updates.push(loadRecentUpdates());
          }
          break;
          
        case 'restore_from_trash':
        case 'empty_trash':
        case 'permanently_delete':
          // ゴミ箱操作：ゴミ箱、容量、フォルダツリーを更新
          updates.push(
            loadTrashItems(),
            loadQuotaInfo(),
            loadFolderTree(true)
          );
          // 現在のパスがゴミ箱またはメインディレクトリの場合は更新
          if (currentPath === 'trash' || currentPath.startsWith('documents')) {
            updates.push(loadCurrentDirectory(currentPath));
          }
          break;
          
        case 'save_file':
          // ファイル保存：最近の更新のみ
          updates.push(loadRecentUpdates());
          break;
          
        case 'refresh':
          // 手動更新：現在のディレクトリのみ
          updates.push(loadCurrentDirectory(currentPath));
          break;
          
        default:
          // 不明な操作：全体更新（従来の動作）
          updates.push(
            loadCurrentDirectory(currentPath),
            loadRecentUpdates(),
            loadFavorites(),
            loadTrashItems(),
            loadFolderTree(true),
            loadQuotaInfo()
          );
      }
      
      Promise.allSettled(updates).then(() => {
        console.log('✅ Dashboard data refreshed after operation:', operationType);
      }).catch((error) => {
        console.error('❌ Error refreshing dashboard data:', error);
      });
    };

    window.addEventListener('fileOperationCompleted', handleFileOperationComplete);
    
    return () => {
      window.removeEventListener('fileOperationCompleted', handleFileOperationComplete);
    };
  }, [currentPath, loadCurrentDirectory, loadRecentUpdates, loadFavorites, loadTrashItems, loadFolderTree, loadQuotaInfo]);

  useEffect(() => {
    if (currentPath) {
      localStorage.setItem('oneagent_last_path', currentPath);
    }
  }, [currentPath]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.ctrlKey && event.key === 'f') {
        event.preventDefault();
        const searchInput = document.querySelector('[data-search-input]');
        if (searchInput) searchInput.focus();
      }
      if (event.key === 'F5') {
        event.preventDefault();
        loadCurrentDirectory(currentPath);
      }
      if (event.key === 'Escape') {
        actions.setSelectedFiles([]);
        actions.setSearchQuery('');
      }
      if (event.ctrlKey && event.key === '1') {
        event.preventDefault();
        actions.setCurrentPath('');
      }
      if (event.ctrlKey && event.key === '2') {
        event.preventDefault();
        actions.setCurrentPath('recent');
      }
      if (event.ctrlKey && event.key === '3') {
        event.preventDefault();
        actions.setCurrentPath('favorites');
      }
      if (event.ctrlKey && event.key === '4') {
        event.preventDefault();
        actions.setCurrentPath('trash');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentPath, loadCurrentDirectory, actions.setSelectedFiles, actions.setSearchQuery, actions.setCurrentPath]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">ダッシュボードを読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-gray-50 flex flex-col overflow-hidden">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <FileList />
          </div>
        </main>
      </div>
    </div>
  );
};

// 以下は既存のヘルパー関数（変更なし）
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
    console.error('JSON parse error:', error);
    return null;
  }
};

const extractFileContent = (apiResponse) => {
  if (apiResponse?.data?.file?.content !== undefined) {
    return apiResponse.data.file.content;
  }
  
  if (apiResponse?.success && apiResponse.data?.file?.content !== undefined) {
    return apiResponse.data.file.content;
  }
  
  if (apiResponse?.result) {
    const extracted = extractJSONResponse(apiResponse.result);
    
    if (extracted?.data?.file?.content !== undefined) {
      return extracted.data.file.content;
    }
    
    if (Array.isArray(apiResponse.result.content)) {
      return apiResponse.result.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');
    }
    
    if (typeof apiResponse.result === 'string') {
      return apiResponse.result;
    }
    
    if (apiResponse.result.text) {
      return apiResponse.result.text;
    }
    
    if (apiResponse.result.content) {
      return apiResponse.result.content;
    }
  }
  
  return null;
};

const isApiResponseSuccessful = (apiResponse) => {
  if (apiResponse?.success === true) {
    return true;
  }
  
  if (apiResponse?.data?.success === true) {
    return true;
  }
  
  if (apiResponse?.result) {
    const extracted = extractJSONResponse(apiResponse.result);
    if (extracted?.success === true) {
      return true;
    }
  }
  
  return false;
};

const extractApiErrorMessage = (apiResponse) => {
  if (apiResponse?.error?.message) {
    return apiResponse.error.message;
  }
  
  if (apiResponse?.data?.error?.message) {
    return apiResponse.data.error.message;
  }
  
  if (apiResponse?.result) {
    const extracted = extractJSONResponse(apiResponse.result);
    if (extracted?.error?.message) {
      return extracted.error.message;
    }
  }
  
  if (apiResponse?.message) {
    return apiResponse.message;
  }
  
  return null;
};

// 以下のパース関数群も既存のまま（変更なし）
const parseDirectoryListing = (resultData) => {
  if (!resultData) return [];
  
  try {
    const jsonResponse = extractJSONResponse(resultData);
    
    if (jsonResponse && jsonResponse.success && jsonResponse.data) {
      if (jsonResponse.data.files || jsonResponse.data.folders) {
        return parseDirectoryListingJSON(jsonResponse.data);
      }
      
      if (jsonResponse.data.items) {
        return parseDirectoryListingJSON({ files: jsonResponse.data.items, folders: [] });
      }
    }
    
    return parseDirectoryListingText(resultData);
  } catch (error) {
    console.error('Universal directory listing parse error:', error);
    return [];
  }
};

const parseDirectoryListingJSON = (data) => {
  const files = [];
  
  if (data.folders && Array.isArray(data.folders)) {
    data.folders.forEach(folder => {
      files.push({
        id: `folder_${folder.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: folder.name,
        path: folder.path,
        isDirectory: true,
        size: 0,
        modifiedDate: folder.modifiedDate || new Date().toISOString(),
        inFavorites: false
      });
    });
  }

  if (data.files && Array.isArray(data.files)) {
    data.files.forEach(file => {
      files.push({
        id: `file_${file.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        path: file.path,
        isDirectory: false,
        size: file.size || 0,
        modifiedDate: file.modifiedDate || new Date().toISOString(),
        inFavorites: false,
        isExecutable: file.isExecutable || false,
        extension: file.extension || ''
      });
    });
  }
  
  return files;
};

const parseDirectoryListingText = (resultData) => {
  let content = '';
  if (Array.isArray(resultData.content)) {
    content = resultData.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
  } else if (typeof resultData === 'string') {
    content = resultData;
  } else if (resultData.text) {
    content = resultData.text;
  }

  if (!content || 
      content.includes('ディレクトリは空です') || 
      content.includes('ファイルがありません') ||
      content.trim().length === 0) {
    return [];
  }

  const files = [];
  const lines = content.split('\n');
  const processedItems = new Set();
  
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    
    if (isStatusMessage(line)) {
      continue;
    }
    
    const folderMatch = line.match(/^📁\s+([^/\s]+)(?:\/\s*|$)/);
    if (folderMatch) {
      const folderName = folderMatch[1].trim();
      
      if (folderName && 
          folderName.length > 0 && 
          folderName.length <= 255 && 
          !folderName.includes('：') && 
          !folderName.includes(':') && 
          !folderName.includes('を') && 
          !folderName.includes('が') && 
          !folderName.includes('しました') &&
          !folderName.match(/(作成|削除|移動|コピー|変更|更新|追加|復元)/) &&
          isValidFileName(folderName) && 
          !processedItems.has(folderName)) {
        
        processedItems.add(folderName);
        files.push({
          id: `folder_${folderName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: folderName,
          path: folderName,
          isDirectory: true,
          size: 0,
          modifiedDate: new Date().toISOString(),
          inFavorites: false
        });
      }
      continue;
    }

    const fileMatch = line.match(/^📄\s+([^/\s]+(?:\.[^/\s]+)?)\s+\((.+?),\s*(.+?)\)/);
    if (fileMatch) {
      const [, name, sizeStr, dateStr] = fileMatch;
      const fileName = name.trim();
      
      if (fileName && 
          fileName.length > 0 && 
          fileName.length <= 255 &&
          !fileName.includes('：') && 
          !fileName.includes(':') && 
          !fileName.includes('を') && 
          !fileName.includes('が') && 
          !fileName.includes('しました') &&
          !fileName.match(/(作成|削除|移動|コピー|変更|更新|追加|復元)/) &&
          isValidFileName(fileName) && 
          !processedItems.has(fileName)) {
        
        processedItems.add(fileName);
        files.push({
          id: `file_${fileName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: fileName,
          path: fileName,
          isDirectory: false,
          size: parseSizeString(sizeStr),
          modifiedDate: parseDateStringISO8601(dateStr) || 'unknown',
          inFavorites: false,
          isExecutable: line.includes('⚠️')
        });
      }
    }
  }
  
  return files;
};

// 他のparse関数も同様に続く（既存のまま）...

const parseRecentUpdates = (resultData) => {
  if (!resultData) return [];
  
  try {
    const jsonResponse = extractJSONResponse(resultData);
    
    if (jsonResponse && jsonResponse.success && jsonResponse.data) {
      return parseRecentUpdatesJSON(jsonResponse.data);
    }
    
    return parseRecentUpdatesText(resultData);
  } catch (error) {
    console.error('Universal recent updates parse error:', error);
    return [];
  }
};

const parseRecentUpdatesJSON = (data) => {
  if (!data.updates || !Array.isArray(data.updates)) {
    return [];
  }

  const updates = data.updates.map(update => ({
    id: `recent_${update.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: update.name,
    path: update.path,
    isDirectory: update.isDirectory || false,
    size: 0,
    modifiedDate: update.timestamp || new Date().toISOString(),
    action: update.action || 'update',
    inFavorites: false
  }));
  
  return updates;
};

const parseRecentUpdatesText = (resultData) => {
  let content = '';
  if (Array.isArray(resultData.content)) {
    content = resultData.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
  } else if (typeof resultData === 'string') {
    content = resultData;
  } else if (resultData.text) {
    content = resultData.text;
  }

  if (!content || 
      content.includes('まだ更新がありません') || 
      content.includes('最近の更新: まだ更新がありません') ||
      content.trim().length === 0) {
    return [];
  }

  const updates = [];
  const lines = content.split('\n');
  const processedUpdates = new Set();
  
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    
    if (isStatusMessage(line)) {
      continue;
    }
    
    const updateMatch = line.match(/^[✨✏️📦📋♻️]\s+([^:：]+?)(?:\s|$)/);
    if (updateMatch) {
      const fileName = updateMatch[1].trim();
      
      if (fileName && 
          fileName.length > 0 && 
          fileName.length <= 255 &&
          !fileName.includes('：') && 
          !fileName.includes(':') && 
          !fileName.includes('を') && 
          !fileName.includes('が') && 
          !fileName.includes('しました') &&
          !fileName.match(/(作成|削除|移動|コピー|変更|更新|追加|復元)/) &&
          isValidFileName(fileName) && 
          !processedUpdates.has(fileName)) {
        
        processedUpdates.add(fileName);
        
        const actionMatch = line.match(/アクション:\s*(\w+)/);
        const timeMatch = line.match(/日時:\s*(.+)/);
        
        updates.push({
          id: `recent_${fileName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: fileName,
          path: fileName,
          isDirectory: false,
          size: 0,
          modifiedDate: timeMatch ? parseDateStringISO8601(timeMatch[1]) || 'unknown' : 'unknown',
          action: actionMatch ? actionMatch[1] : 'update',
          inFavorites: false
        });
      }
    }
  }
  
  return updates;
};

const parseFavorites = (resultData) => {
  if (!resultData) return [];
  
  try {
    const jsonResponse = extractJSONResponse(resultData);
    
    if (jsonResponse && jsonResponse.success && jsonResponse.data) {
      return parseFavoritesJSON(jsonResponse.data);
    }
    
    return parseFavoritesText(resultData);
  } catch (error) {
    console.error('Universal favorites parse error:', error);
    return [];
  }
};

const parseFavoritesJSON = (data) => {
  if (!data.favorites || !Array.isArray(data.favorites)) {
    return [];
  }

  const favorites = data.favorites.map(favorite => ({
    id: `favorite_${favorite.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: favorite.name,
    path: favorite.path,
    isDirectory: favorite.isDirectory || false,
    size: favorite.size || 0,
    modifiedDate: favorite.addedAt || new Date().toISOString(),
    inFavorites: true,
    exists: favorite.exists !== false
  }));
  
  return favorites;
};

const parseFavoritesText = (resultData) => {
  let content = '';
  if (Array.isArray(resultData.content)) {
    content = resultData.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
  } else if (typeof resultData === 'string') {
    content = resultData;
  } else if (resultData.text) {
    content = resultData.text;
  }

  if (!content || 
      content.includes('まだお気に入りがありません') || 
      content.includes('お気に入り: まだお気に入りがありません') ||
      content.trim().length === 0) {
    return [];
  }

  const favorites = [];
  const lines = content.split('\n');
  const processedFavorites = new Set();
  
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    
    if (isStatusMessage(line)) {
      continue;
    }
    
    const favoriteMatch = line.match(/^[⭐📁📄]\s+([^:：\s]+?)(?:\s|$)/);
    if (favoriteMatch) {
      const fileName = favoriteMatch[1].trim();
      
      if (fileName && 
          fileName.length > 0 && 
          fileName.length <= 255 &&
          !fileName.includes('：') && 
          !fileName.includes(':') && 
          !fileName.includes('を') && 
          !fileName.includes('が') && 
          !fileName.includes('しました') &&
          !fileName.match(/(作成|削除|移動|コピー|変更|更新|追加|復元)/) &&
          isValidFileName(fileName) && 
          !processedFavorites.has(fileName)) {
        
        processedFavorites.add(fileName);
        
        const exists = !line.includes('❌');
        
        favorites.push({
          id: `favorite_${fileName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: fileName,
          path: fileName,
          isDirectory: line.includes('📁'),
          size: 0,
          modifiedDate: new Date().toISOString(),
          inFavorites: true,
          exists: exists
        });
      }
    }
  }
  
  return favorites;
};

const parseTrashListing = (resultData) => {
  if (!resultData) return [];
  
  try {
    const jsonResponse = extractJSONResponse(resultData);
    
    if (jsonResponse && jsonResponse.success && jsonResponse.data) {
      return parseTrashListingJSON(jsonResponse.data);
    }
    
    return parseTrashListingText(resultData);
  } catch (error) {
    console.error('Universal trash listing parse error:', error);
    return [];
  }
};

const parseTrashListingJSON = (data) => {
  if (!data.trashItems || !Array.isArray(data.trashItems)) {
    return [];
  }

  const trashItems = data.trashItems.map(item => ({
    id: `trash_${item.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: item.name,
    path: item.path,
    isDirectory: item.isDirectory || false,
    size: item.size || 0,
    modifiedDate: new Date().toISOString(),
    deletedDate: item.deletedAt || 'unknown',
    originalPath: item.originalPath || item.name,
    inTrash: true,
    exists: true
  }));
  
  return trashItems;
};

const parseTrashListingText = (resultData) => {
  let content = '';
  if (Array.isArray(resultData.content)) {
    content = resultData.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
  } else if (typeof resultData === 'string') {
    content = resultData;
  } else if (resultData.text) {
    content = resultData.text;
  }

  if (!content || 
      content.includes('ゴミ箱は空です') || 
      content.includes('🗑️ ゴミ箱は空です') ||
      content.includes('ゴミ箱: 空') ||
      content.trim().length === 0) {
    return [];
  }

  const trashItems = [];
  const lines = content.split('\n');
  const processedFiles = new Set();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    
    if (isStatusMessage(line)) {
      continue;
    }
    
    const fileMatch = line.match(/^(📄|📁)\s+([^/\s]+(?:\.[^/\s]+)?)\s+(.+)$/);
    if (fileMatch) {
      const [, icon, fileName, sizeInfo] = fileMatch;
      
      if (fileName && 
          fileName.length > 0 && 
          fileName.length <= 255 &&
          !fileName.includes('：') && 
          !fileName.includes(':') && 
          !fileName.includes('を') && 
          !fileName.includes('が') && 
          !fileName.includes('しました') &&
          !fileName.match(/(作成|削除|移動|コピー|変更|更新|追加|復元)/) &&
          isValidFileName(fileName) && 
          !processedFiles.has(fileName)) {
        
        processedFiles.add(fileName);
        
        let originalPath = fileName;
        let deletedDate = 'unknown';
        
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const nextLine = lines[j].trim();
          
          const originalMatch = nextLine.match(/元の場所:\s*(.+)/);
          if (originalMatch) {
            originalPath = originalMatch[1].trim();
            continue;
          }
          
          const deletedMatch = nextLine.match(/削除日時:\s*(.+)/);
          if (deletedMatch) {
            deletedDate = parseDateStringISO8601(deletedMatch[1].trim()) || 'unknown';
            continue;
          }
        }
        
        const trashItem = {
          id: `trash_${fileName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: fileName,
          path: fileName,
          isDirectory: icon === '📁',
          size: parseSizeString(sizeInfo) || 0,
          modifiedDate: new Date().toISOString(),
          deletedDate: deletedDate,
          originalPath: originalPath,
          inTrash: true,
          exists: true
        };
        
        trashItems.push(trashItem);
      }
    }
  }
  
  return trashItems;
};

const parseQuotaInfo = (resultData) => {
  try {
    const jsonResponse = extractJSONResponse(resultData);
    
    if (jsonResponse && jsonResponse.success && jsonResponse.data) {
      if (jsonResponse.data.quota) {
        return parseQuotaInfoJSON(jsonResponse.data.quota);
      }
      
      if (jsonResponse.data.used || jsonResponse.data.total) {
        return parseQuotaInfoJSON(jsonResponse.data);
      }
    }
    
    return parseQuotaInfoText(resultData);
  } catch (error) {
    console.error('Quota info parse error:', error);
    return {
      used: '0 B',
      total: '1 GB',
      percentage: 0,
      fileCount: 0,
      remaining: '1 GB'
    };
  }
};

const parseQuotaInfoJSON = (data) => {
  const quotaInfo = {
    used: data.used || '0 B',
    total: data.total || '1 GB',
    percentage: data.percentage || 0,
    fileCount: data.fileCount || 0,
    remaining: data.remaining || '1 GB'
  };

  if (data.details) {
    quotaInfo.details = data.details;
  }

  return quotaInfo;
};

const parseQuotaInfoText = (resultData) => {
  let content = '';
  
  if (Array.isArray(resultData)) {
    content = resultData.map(item => {
      if (typeof item === 'string') return item;
      if (item && item.text) return item.text;
      if (item && item.content) return item.content;
      return JSON.stringify(item);
    }).join('\n');
  } else if (Array.isArray(resultData.content)) {
    content = resultData.content
      .filter(item => item && (item.type === 'text' || item.text || typeof item === 'string'))
      .map(item => {
        if (typeof item === 'string') return item;
        if (item.text) return item.text;
        if (item.content) return item.content;
        return JSON.stringify(item);
      })
      .join('\n');
  } else if (typeof resultData === 'string') {
    content = resultData;
  } else if (resultData && resultData.text) {
    content = resultData.text;
  } else if (resultData && resultData.content) {
    if (typeof resultData.content === 'string') {
      content = resultData.content;
    } else {
      content = JSON.stringify(resultData.content);
    }
  } else {
    content = JSON.stringify(resultData);
  }

  const quotaInfo = {
    used: '0 B',
    total: '1 GB',
    percentage: 0,
    fileCount: 0,
    remaining: '1 GB'
  };

  const patterns = {
    usage: [
      /使用容量[：:\s]*([^\/\s]+)\s*[\/\/]\s*([^\s\n(]+)/gi,
      /Used[:\s]+([^\/\s]+)\s*[\/\/]\s*([^\s\n(]+)/gi,
      /容量[：:\s]*([^\/\s]+)\s*[\/\/]\s*([^\s\n(]+)/gi,
      /Storage[:\s]+([^\/\s]+)\s*[\/\/]\s*([^\s\n(]+)/gi,
      /(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)[^\/]*[\/\/]\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)/gi,
      /"used"[:\s]*"([^"]+)"[^}]*"total"[:\s]*"([^"]+)"/gi,
      /"total"[:\s]*"([^"]+)"[^}]*"used"[:\s]*"([^"]+)"/gi
    ],
    percentage: [
      /(\d+(?:\.\d+)?)%/g,
      /使用率[：:\s]*(\d+(?:\.\d+)?)%/gi,
      /Usage[:\s]*(\d+(?:\.\d+)?)%/gi,
      /"percentage"[:\s]*(\d+(?:\.\d+)?)/gi
    ],
    fileCount: [
      /ファイル数[：:\s]*(\d+)/gi,
      /Files[:\s]+(\d+)/gi,
      /(?:file|ファイル).*?(\d+)/gi,
      /Count[:\s]*(\d+)/gi,
      /"fileCount"[:\s]*(\d+)/gi,
      /"count"[:\s]*(\d+)/gi
    ],
    remaining: [
      /残り容量[：:\s]*([^\s\n]+)/gi,
      /Remaining[:\s]+([^\s\n]+)/gi,
      /空き容量[：:\s]*([^\s\n]+)/gi,
      /Available[:\s]+([^\s\n]+)/gi,
      /"remaining"[:\s]*"([^"]+)"/gi
    ]
  };

  let usageFound = false;
  for (const pattern of patterns.usage) {
    pattern.lastIndex = 0;
    const matches = [...content.matchAll(pattern)];
    for (const match of matches) {
      if (match.length >= 3) {
        let used, total;
        if (match.length === 5) {
          used = match[1] + ' ' + match[2];
          total = match[3] + ' ' + match[4];
        } else {
          used = match[1].trim();
          total = match[2].trim();
        }
        
        if (/\d+.*?[KMGT]?B/i.test(used) && /\d+.*?[KMGT]?B/i.test(total)) {
          quotaInfo.used = used;
          quotaInfo.total = total;
          usageFound = true;
          break;
        }
      }
    }
    if (usageFound) break;
  }

  for (const pattern of patterns.percentage) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    if (match) {
      quotaInfo.percentage = parseFloat(match[1]);
      break;
    }
  }

  for (const pattern of patterns.fileCount) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    if (match) {
      quotaInfo.fileCount = parseInt(match[1]);
      break;
    }
  }

  for (const pattern of patterns.remaining) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    if (match) {
      quotaInfo.remaining = match[1].trim();
      break;
    }
  }

  try {
    const usedBytes = parseSizeToBytes(quotaInfo.used);
    const totalBytes = parseSizeToBytes(quotaInfo.total);
    
    if (usedBytes > 0 && totalBytes > 0) {
      if (quotaInfo.percentage === 0) {
        quotaInfo.percentage = (usedBytes / totalBytes) * 100;
      }
      
      if (quotaInfo.remaining === '1 GB') {
        const remainingBytes = totalBytes - usedBytes;
        quotaInfo.remaining = formatBytesToSize(remainingBytes);
      }
    }
  } catch (error) {
    console.warn('⚠️ Failed to calculate values:', error);
  }

  return quotaInfo;
};

// ヘルパー関数

const isStatusMessage = (line) => {
  const trimmedLine = line.trim();
  
  const statusPatterns = [
    /^フォルダ[：:]\s*.*[をが].*(作成|削除|移動|コピー|変更|追加).*しました/,
    /^フォルダ[：:].*(作成|削除|移動|コピー|変更|追加).*しました/,
    /^フォルダ\s*[「『].+[」』][をが].*(作成|削除|移動|コピー|変更).*しました/,
    /^フォルダ\s+.+\s*[をが].*(作成|削除|移動|コピー|変更).*しました/,
    /^ファイル[：:]\s*.*[をが].*(作成|削除|移動|コピー|変更|更新).*しました/,
    /^ファイル[：:].*(作成|削除|移動|コピー|変更|更新).*しました/,
    /^ファイル\s*[「『].+[」』][をが].*(作成|削除|移動|コピー|変更|更新).*しました/,
    /^ファイル\s+.+\s*[をが].*(作成|削除|移動|コピー|変更|更新).*しました/,
    /^ディレクトリ[：:]\s*.*[をが].*(作成|削除|移動|コピー|変更).*しました/,
    /^ディレクトリ[：:].*(作成|削除|移動|コピー|変更).*しました/,
    /^.*[をが](作成|削除|移動|コピー|変更|更新|追加|復元)しました$/,
    /^.*の(作成|削除|移動|コピー|変更|更新|追加|復元)が完了しました$/,
    /^(作成|削除|移動|コピー|変更|更新|追加|復元)が完了しました$/,
    /^(作成|削除|移動|コピー|変更|更新|追加|復元)しました$/,
    /^操作.*完了/,
    /^処理.*完了/,
    /^実行.*完了/,
    /^(成功|完了|終了)[：:]/, 
    /^(エラー|警告|注意)[：:]/,
    /^(実行結果|結果|状態|処理中)[：:]/,
    /^Folder[:\s]+.*\s+(created|deleted|moved|copied|modified|added)[\s.]*$/i,
    /^File[:\s]+.*\s+(created|deleted|moved|copied|modified|updated|added)[\s.]*$/i,
    /^Directory[:\s]+.*\s+(created|deleted|moved|copied|modified)[\s.]*$/i,
    /^.*\s+(created|deleted|moved|copied|modified|updated|added)[\s.]*$/i,
    /^(Operation|Process|Execution).*(completed|finished|done)/i,
    /^(Success|Completed|Finished|Done)[:\s]/i,
    /^(Error|Warning|Notice)[:\s]/i,
    /^(Result|Status|Processing)[:\s]/i,
    /^\s*正常に処理されました/,
    /^\s*正常に完了しました/,
    /^\s*処理が正常に終了しました/,
    /^お気に入りに追加しました/,
    /^お気に入りから削除しました/,
    /^ゴミ箱に移動しました/,
    /^ゴミ箱から復元しました/,
    /^ゴミ箱を空にしました/,
    /^📁\s*フォルダ[：:]/,
    /^📄\s*ファイル[：:]/,
    /^📁.*[をが].*(作成|削除|移動|コピー|変更).*しました/,
    /^📄.*[をが].*(作成|削除|移動|コピー|変更|更新).*しました/
  ];
  
  return statusPatterns.some(pattern => pattern.test(trimmedLine));
};

const isValidFileName = (name) => {
  if (!name || name.length === 0) return false;
  if (name === '.' || name === '..') return false;
  if (name.length > 255) return false;
  
  const trimmedName = name.trim();
  
  const invalidPatterns = [
    /^フォルダ[：:]/,
    /^ファイル[：:]/,
    /^ディレクトリ[：:]/,
    /.*[をが].*(作成|削除|移動|コピー|変更|更新|追加|復元).*しました$/,
    /.*の(作成|削除|移動|コピー|変更|更新|追加|復元)が完了しました$/,
    /.*(作成|削除|移動|コピー|変更|更新|追加|復元)が完了しました$/,
    /.*(作成|削除|移動|コピー|変更|更新|追加|復元)しました$/,
    /^(操作|処理|実行).*完了/,
    /^(成功|完了|終了|エラー|警告|注意|実行結果|結果|状態|処理中)[：:]/,
    /^正常に(処理|完了|終了)/,
    /^お気に入りに(追加|削除)/,
    /^ゴミ箱(に移動|から復元|を空に)/,
    /^Folder[:\s]/i,
    /^File[:\s]/i,
    /^Directory[:\s]/i,
    /.*(created|deleted|moved|copied|modified|updated|added)[\s.]*$/i,
    /^(Operation|Process|Execution).*(completed|finished|done)/i,
    /^(Success|Completed|Finished|Done|Error|Warning|Notice|Result|Status|Processing)[:\s]/i,
    /[<>:"/\\|?*\x00-\x1f]/,
    /：.*しました$/,
    /^.*：.*(作成|削除|移動|コピー|変更|更新|追加|復元)/,
    /を(作成|削除|移動|コピー|変更|更新|追加|復元)しました$/,
    /が(作成|削除|移動|コピー|変更|更新|追加|復元).*$/,
    /^フォルダ：.*$/,
    /^ファイル：.*$/
  ];
  
  return !invalidPatterns.some(pattern => pattern.test(trimmedName));
};

const parseSizeToBytes = (sizeStr) => {
  if (!sizeStr) return 0;
  
  const normalized = sizeStr.toString().trim().toUpperCase();
  
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)/,
    /([\d,]+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)/,
    /(\d+\.\d+)(B|KB|MB|GB|TB)/,
    /(\d+)(B|KB|MB|GB|TB)/,
    /^(\d+)$/
  ];
  
  let match = null;
  for (const pattern of patterns) {
    match = normalized.match(pattern);
    if (match) break;
  }
  
  if (!match) {
    return 0;
  }
  
  const valueStr = match[1].replace(/,/g, '');
  const value = parseFloat(valueStr);
  const unit = match[2] || 'B';
  
  if (isNaN(value)) {
    return 0;
  }
  
  const multipliers = { 
    'B': 1, 
    'KB': 1024, 
    'MB': 1024 * 1024, 
    'GB': 1024 * 1024 * 1024, 
    'TB': 1024 * 1024 * 1024 * 1024 
  };
  
  const bytes = Math.floor(value * (multipliers[unit] || 1));
  
  return bytes;
};

const formatBytesToSize = (bytes) => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const buildFolderTreeWithLimit = async (path, depth, maxDepth, maxConcurrent, executeFileOperation) => {
  try {
    const result = await executeFileOperation('list', { path: path || '' });
    if (!result?.result) return [];
    
    const files = parseDirectoryListing(result.result);
    const folders = files.filter(file => file.isDirectory);
    
    const tree = [];
    for (const folder of folders) {
      const folderNode = {
        name: folder.name,
        path: path ? `${path}/${folder.name}` : folder.name,
        children: []
      };
      
      if (depth < maxDepth) {
        const childPath = path ? `${path}/${folder.name}` : folder.name;
        folderNode.children = await buildFolderTreeWithLimit(
          childPath, 
          depth + 1, 
          maxDepth, 
          maxConcurrent,
          executeFileOperation
        );
      }
      
      tree.push(folderNode);
    }
    
    return tree;
  } catch (error) {
    console.error('Failed to build folder tree:', error);
    return [];
  }
};

const parseSizeString = (sizeStr) => {
  if (!sizeStr || typeof sizeStr !== 'string') return 0;
  
  const sizeMatch = sizeStr.match(/(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)/i);
  if (!sizeMatch) {
    const numMatch = sizeStr.match(/(\d+)/);
    return numMatch ? parseInt(numMatch[1]) : 0;
  }
  
  const value = parseFloat(sizeMatch[1]);
  const unit = sizeMatch[2].toUpperCase();
  
  const multipliers = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3 };
  return Math.floor(value * (multipliers[unit] || 1));
};

const parseDateStringISO8601 = (dateStr) => {
  if (!dateStr) return 'unknown';
  
  try {
    const now = new Date();
    
    if (typeof dateStr === 'string') {
      const trimmed = dateStr.trim();
      
      const minutesMatch = trimmed.match(/(\d+)\s*分前/);
      if (minutesMatch) {
        const minutes = parseInt(minutesMatch[1]);
        return new Date(now.getTime() - minutes * 60 * 1000).toISOString();
      }
      
      const hoursMatch = trimmed.match(/(\d+)\s*時間前/);
      if (hoursMatch) {
        const hours = parseInt(hoursMatch[1]);
        return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
      }
      
      const daysMatch = trimmed.match(/(\d+)\s*日前/);
      if (daysMatch) {
        const days = parseInt(daysMatch[1]);
        return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
      }
      
      const isoMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?$/);
      if (isoMatch) {
        try {
          return new Date(trimmed).toISOString();
        } catch (isoError) {
          return 'unknown';
        }
      }
      
      const dateOnlyMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);
      if (dateOnlyMatch) {
        try {
          return new Date(trimmed + 'T12:00:00.000Z').toISOString();
        } catch (dateError) {
          return 'unknown';
        }
      }
      
      const slashDateMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (slashDateMatch) {
        try {
          const [, year, month, day] = slashDateMatch;
          return new Date(year, month - 1, day, 12, 0, 0).toISOString();
        } catch (slashError) {
          return 'unknown';
        }
      }
      
      const jpDateMatch = trimmed.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})[日\s]*(\d{1,2}):(\d{1,2})/);
      if (jpDateMatch) {
        try {
          const [, year, month, day, hour, minute] = jpDateMatch;
          return new Date(year, month - 1, day, hour, minute).toISOString();
        } catch (jpError) {
          return 'unknown';
        }
      }
      
      const jpDateOnlyMatch = trimmed.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})[日]?$/);
      if (jpDateOnlyMatch) {
        try {
          const [, year, month, day] = jpDateOnlyMatch;
          return new Date(year, month - 1, day, 12, 0, 0).toISOString();
        } catch (jpDateError) {
          return 'unknown';
        }
      }
      
      const timeMatch = trimmed.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
      if (timeMatch) {
        try {
          const [, hour, minute, second = '0'] = timeMatch;
          const today = new Date();
          return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 
                         parseInt(hour), parseInt(minute), parseInt(second)).toISOString();
        } catch (timeError) {
          return 'unknown';
        }
      }
      
      try {
        const fallbackDate = new Date(trimmed);
        if (!isNaN(fallbackDate.getTime())) {
          return fallbackDate.toISOString();
        }
      } catch (fallbackError) {
        // ignore
      }
      
      return 'unknown';
    }
    
    try {
      return new Date(dateStr).toISOString();
    } catch (dateObjError) {
      return 'unknown';
    }
  } catch (error) {
    return 'unknown';
  }
};

export default withAuth(DashboardPage);