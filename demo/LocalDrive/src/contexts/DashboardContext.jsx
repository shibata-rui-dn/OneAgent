import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';

const joinPaths = (...paths) => {
  return paths
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
};

const DashboardStateContext = createContext(null);
const DashboardActionContext = createContext(null);

export const DASHBOARD_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_INITIALIZED: 'SET_INITIALIZED',
  SET_CURRENT_PATH: 'SET_CURRENT_PATH',
  SET_FILES: 'SET_FILES',
  SET_SELECTED_FILES: 'SET_SELECTED_FILES',
  SET_SEARCH_QUERY: 'SET_SEARCH_QUERY',
  SET_FILES_LOADING: 'SET_FILES_LOADING',
  SET_FOLDER_TREE: 'SET_FOLDER_TREE',
  SET_QUOTA_INFO: 'SET_QUOTA_INFO',
  SET_RECENT_FILES: 'SET_RECENT_FILES',
  SET_FAVORITES: 'SET_FAVORITES',
  SET_TRASH_ITEMS: 'SET_TRASH_ITEMS',
  ADD_TO_FAVORITES: 'ADD_TO_FAVORITES',
  REMOVE_FROM_FAVORITES: 'REMOVE_FROM_FAVORITES',
  ADD_OPERATION: 'ADD_OPERATION',
  UPDATE_OPERATION: 'UPDATE_OPERATION',
  REMOVE_OPERATION: 'REMOVE_OPERATION',
  TOGGLE_SIDEBAR: 'TOGGLE_SIDEBAR',
  SET_VIEW_MODE: 'SET_VIEW_MODE',
  BATCH_UPDATE: 'BATCH_UPDATE',
  UPDATE_FILE_FAVORITE_STATUS: 'UPDATE_FILE_FAVORITE_STATUS'
};

const initialState = {
  sidebarCollapsed: false,
  viewMode: 'list',
  isLoading: true,
  isInitialized: false,
  currentPath: 'documents',
  files: [],
  selectedFiles: [],
  searchQuery: '',
  isLoadingFiles: false,
  folderTree: [],
  quotaInfo: null,
  operations: [],
  recentFiles: [],
  favorites: [],
  trashItems: []
};

const dashboardReducer = (state, action) => {
  switch (action.type) {
    case DASHBOARD_ACTIONS.SET_LOADING:
      return { ...state, isLoading: action.payload };
      
    case DASHBOARD_ACTIONS.SET_INITIALIZED:
      return { ...state, isInitialized: true, isLoading: false };
      
    case DASHBOARD_ACTIONS.SET_CURRENT_PATH:
      return { 
        ...state, 
        currentPath: action.payload,
        selectedFiles: []
      };
      
    case DASHBOARD_ACTIONS.SET_FILES:
      return { ...state, files: action.payload };
      
    case DASHBOARD_ACTIONS.SET_SELECTED_FILES:
      return { ...state, selectedFiles: action.payload };
      
    case DASHBOARD_ACTIONS.SET_SEARCH_QUERY:
      return { ...state, searchQuery: action.payload };
      
    case DASHBOARD_ACTIONS.SET_FILES_LOADING:
      return { ...state, isLoadingFiles: action.payload };
      
    case DASHBOARD_ACTIONS.SET_FOLDER_TREE:
      return { ...state, folderTree: action.payload };
      
    case DASHBOARD_ACTIONS.SET_QUOTA_INFO:
      return { ...state, quotaInfo: action.payload };
      
    case DASHBOARD_ACTIONS.SET_RECENT_FILES:
      return { ...state, recentFiles: action.payload };
      
    case DASHBOARD_ACTIONS.SET_FAVORITES:
      return { ...state, favorites: action.payload };
      
    case DASHBOARD_ACTIONS.SET_TRASH_ITEMS:
      return { ...state, trashItems: action.payload };
      
    case DASHBOARD_ACTIONS.ADD_TO_FAVORITES:
      const fileToAdd = {
        ...action.payload,
        exists: action.payload.exists !== false, // undefinedの場合はtrueに設定
        inFavorites: true
      };
      return { 
        ...state, 
        favorites: [...state.favorites, fileToAdd]
      };
      
    case DASHBOARD_ACTIONS.REMOVE_FROM_FAVORITES:
      return { 
        ...state, 
        favorites: state.favorites.filter(fav => fav.path !== action.payload.path)
      };
      
    case DASHBOARD_ACTIONS.UPDATE_FILE_FAVORITE_STATUS:
      const { filepath, isFavorite } = action.payload;
      
      const updatedFiles = state.files.map(file => {
        if ((file.path || file.name) === filepath) {
          return { ...file, inFavorites: isFavorite };
        }
        return file;
      });
      
      let updatedFavorites = state.favorites;
      if (isFavorite) {
        const existingFile = state.files.find(f => (f.path || f.name) === filepath);
        if (existingFile && !state.favorites.some(fav => fav.path === filepath)) {
          updatedFavorites = [...state.favorites, { 
            ...existingFile, 
            inFavorites: true, 
            exists: true // 明示的にexistsをtrueに設定
          }];
        }
      } else {
        updatedFavorites = state.favorites.filter(fav => (fav.path || fav.name) !== filepath);
      }
      
      return {
        ...state,
        files: updatedFiles,
        favorites: updatedFavorites
      };
      
    case DASHBOARD_ACTIONS.ADD_OPERATION:
      return { 
        ...state, 
        operations: [...state.operations, action.payload]
      };
      
    case DASHBOARD_ACTIONS.UPDATE_OPERATION:
      return {
        ...state,
        operations: state.operations.map(op => 
          op.id === action.payload.id 
            ? { ...op, ...action.payload.updates }
            : op
        )
      };

    case DASHBOARD_ACTIONS.REMOVE_OPERATION:
      return {
        ...state,
        operations: state.operations.filter(op => op.id !== action.payload.id)
      };
      
    case DASHBOARD_ACTIONS.TOGGLE_SIDEBAR:
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
      
    case DASHBOARD_ACTIONS.SET_VIEW_MODE:
      return { ...state, viewMode: action.payload };
      
    case DASHBOARD_ACTIONS.BATCH_UPDATE:
      return { ...state, ...action.payload };
      
    default:
      return state;
  }
};

export const DashboardProvider = ({ children }) => {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);
  
  const setLoading = useCallback((loading) => {
    dispatch({ type: DASHBOARD_ACTIONS.SET_LOADING, payload: loading });
  }, []);

  const setInitialized = useCallback(() => {
    dispatch({ type: DASHBOARD_ACTIONS.SET_INITIALIZED });
  }, []);

  const setCurrentPath = useCallback((path) => {
    dispatch({ type: DASHBOARD_ACTIONS.SET_CURRENT_PATH, payload: path });
  }, []);

  const setFiles = useCallback((files) => {
    dispatch({ type: DASHBOARD_ACTIONS.SET_FILES, payload: files });
  }, []);

  const setSelectedFiles = useCallback((files) => {
    dispatch({ type: DASHBOARD_ACTIONS.SET_SELECTED_FILES, payload: files });
  }, []);

  const setSearchQuery = useCallback((query) => {
    dispatch({ type: DASHBOARD_ACTIONS.SET_SEARCH_QUERY, payload: query });
  }, []);

  const setFilesLoading = useCallback((loading) => {
    dispatch({ type: DASHBOARD_ACTIONS.SET_FILES_LOADING, payload: loading });
  }, []);

  const setFolderTree = useCallback((tree) => {
    dispatch({ type: DASHBOARD_ACTIONS.SET_FOLDER_TREE, payload: tree });
  }, []);

  const setQuotaInfo = useCallback((info) => {
    dispatch({ type: DASHBOARD_ACTIONS.SET_QUOTA_INFO, payload: info });
  }, []);

  const setRecentFiles = useCallback((files) => {
    dispatch({ type: DASHBOARD_ACTIONS.SET_RECENT_FILES, payload: files });
  }, []);

  const setFavorites = useCallback((favorites) => {
    // お気に入りファイルにexistsプロパティを確実に設定
    const favoritesWithExists = favorites.map(fav => ({
      ...fav,
      exists: fav.exists !== false // undefinedの場合はtrueに設定
    }));
    dispatch({ type: DASHBOARD_ACTIONS.SET_FAVORITES, payload: favoritesWithExists });
  }, []);

  const setTrashItems = useCallback((items) => {
    dispatch({ type: DASHBOARD_ACTIONS.SET_TRASH_ITEMS, payload: items });
  }, []);

  const addToFavorites = useCallback((file) => {
    const fileWithExists = {
      ...file,
      exists: file.exists !== false, // undefinedの場合はtrueに設定
      inFavorites: true
    };
    dispatch({ type: DASHBOARD_ACTIONS.ADD_TO_FAVORITES, payload: fileWithExists });
  }, []);

  const removeFromFavorites = useCallback((file) => {
    dispatch({ type: DASHBOARD_ACTIONS.REMOVE_FROM_FAVORITES, payload: file });
  }, []);

  const updateFileFavoriteStatus = useCallback((filepath, isFavorite) => {
    dispatch({ 
      type: DASHBOARD_ACTIONS.UPDATE_FILE_FAVORITE_STATUS, 
      payload: { filepath, isFavorite } 
    });
  }, []);

  const addOperation = useCallback((operation) => {
    dispatch({ type: DASHBOARD_ACTIONS.ADD_OPERATION, payload: operation });
  }, []);

  const updateOperation = useCallback((id, updates) => {
    dispatch({ type: DASHBOARD_ACTIONS.UPDATE_OPERATION, payload: { id, updates } });
  }, []);

  const removeOperation = useCallback((id) => {
    dispatch({ type: DASHBOARD_ACTIONS.REMOVE_OPERATION, payload: { id } });
  }, []);

  const toggleSidebar = useCallback(() => {
    dispatch({ type: DASHBOARD_ACTIONS.TOGGLE_SIDEBAR });
  }, []);

  const setViewMode = useCallback((mode) => {
    dispatch({ type: DASHBOARD_ACTIONS.SET_VIEW_MODE, payload: mode });
  }, []);

  const batchUpdate = useCallback((updates) => {
    dispatch({ type: DASHBOARD_ACTIONS.BATCH_UPDATE, payload: updates });
  }, []);

  const actions = useMemo(() => ({
    setLoading,
    setInitialized,
    setCurrentPath,
    setFiles,
    setSelectedFiles,
    setSearchQuery,
    setFilesLoading,
    setFolderTree,
    setQuotaInfo,
    setRecentFiles,
    setFavorites,
    setTrashItems,
    addToFavorites,
    removeFromFavorites,
    updateFileFavoriteStatus,
    addOperation,
    updateOperation,
    removeOperation,
    toggleSidebar,
    setViewMode,
    batchUpdate
  }), [
    setLoading,
    setInitialized,
    setCurrentPath,
    setFiles,
    setSelectedFiles,
    setSearchQuery,
    setFilesLoading,
    setFolderTree,
    setQuotaInfo,
    setRecentFiles,
    setFavorites,
    setTrashItems,
    addToFavorites,
    removeFromFavorites,
    updateFileFavoriteStatus,
    addOperation,
    updateOperation,
    removeOperation,
    toggleSidebar,
    setViewMode,
    batchUpdate
  ]);

  return (
    <DashboardStateContext.Provider value={state}>
      <DashboardActionContext.Provider value={actions}>
        {children}
      </DashboardActionContext.Provider>
    </DashboardStateContext.Provider>
  );
};

export const useDashboardState = () => {
  const context = useContext(DashboardStateContext);
  if (context === null) {
    throw new Error('useDashboardState must be used within a DashboardProvider');
  }
  return context;
};

export const useDashboardActions = () => {
  const context = useContext(DashboardActionContext);
  if (context === null) {
    throw new Error('useDashboardActions must be used within a DashboardProvider');
  }
  return context;
};

export const useDashboardSelector = (selector) => {
  const state = useDashboardState();
  return useMemo(() => selector(state), [selector, state]);
};

export const useFileState = () => {
  return useDashboardSelector(useCallback(state => ({
    files: state.files,
    currentPath: state.currentPath,
    selectedFiles: state.selectedFiles,
    searchQuery: state.searchQuery,
    isLoadingFiles: state.isLoadingFiles
  }), []));
};

export const useUIState = () => {
  return useDashboardSelector(useCallback(state => ({
    sidebarCollapsed: state.sidebarCollapsed,
    viewMode: state.viewMode,
    isLoading: state.isLoading,
    isInitialized: state.isInitialized
  }), []));
};

export const useSystemState = () => {
  return useDashboardSelector(useCallback(state => ({
    folderTree: state.folderTree,
    quotaInfo: state.quotaInfo,
    operations: state.operations,
    recentFiles: state.recentFiles,
    favorites: state.favorites,
    trashItems: state.trashItems
  }), []));
};

export const createFileOperations = (actions, executeFileOperation, notifySuccess, notifyError) => {
  
  const notifyOperationComplete = (operationId, operationType = 'file_operation', isLightweight = false) => {
    const event = new CustomEvent('fileOperationCompleted', {
      detail: { 
        operationType, 
        data: { 
          operationId,
          timestamp: Date.now(),
          isLightweight
        }
      }
    });
    window.dispatchEvent(event);
    
    if (operationId) {
      setTimeout(() => {
        actions.removeOperation(operationId);
      }, 2000);
    }
  };

  return {
    async createFile(filename, currentPath, content = '') {
      const operationId = Date.now().toString();
      actions.addOperation({
        id: operationId,
        type: 'create',
        target: filename,
        status: 'running',
        timestamp: new Date(),
        progress: 0
      });

      try {
        const specialPaths = ['recent', 'favorites', 'trash'];
        const isSpecialPath = specialPaths.includes(currentPath);
        
        let targetPath;
        if (isSpecialPath) {
          targetPath = filename;
        } else {
          const normalizedCurrentPath = currentPath.startsWith('documents/') 
            ? currentPath.substring(10) 
            : currentPath === 'documents' ? '' : currentPath;
          targetPath = normalizedCurrentPath ? joinPaths(normalizedCurrentPath, filename) : filename;
        }

        actions.updateOperation(operationId, { progress: 50 });

        const result = await executeFileOperation('create_file', {
          path: targetPath,
          content: content
        });

        if (result?.success) {
          actions.updateOperation(operationId, { status: 'completed', progress: 100 });
          
          // コンパクトな通知
          notifySuccess('ファイルを作成しました');
          
          notifyOperationComplete(operationId, 'create_file');
          
          return true;
        } else {
          throw new Error(result?.error?.message || 'ファイルの作成に失敗しました');
        }

      } catch (error) {
        actions.updateOperation(operationId, { 
          status: 'error', 
          error: error.message,
          progress: 0 
        });
        notifyError(error.message || 'ファイルの作成に失敗しました');
        
        setTimeout(() => {
          actions.removeOperation(operationId);
        }, 5000);
        
        return false;
      }
    },

    async createFolder(folderName, currentPath) {
      const operationId = Date.now().toString();
      actions.addOperation({
        id: operationId,
        type: 'create',
        target: folderName,
        status: 'running',
        timestamp: new Date(),
        progress: 0
      });

      try {
        const specialPaths = ['recent', 'favorites', 'trash'];
        const isSpecialPath = specialPaths.includes(currentPath);
        
        let targetPath;
        if (isSpecialPath) {
          targetPath = folderName;
        } else {
          const normalizedCurrentPath = currentPath.startsWith('documents/') 
            ? currentPath.substring(10) 
            : currentPath === 'documents' ? '' : currentPath;
          targetPath = normalizedCurrentPath ? joinPaths(normalizedCurrentPath, folderName) : folderName;
        }

        actions.updateOperation(operationId, { progress: 50 });

        const result = await executeFileOperation('create_folder', { path: targetPath });
        
        if (result?.success) {
          actions.updateOperation(operationId, { status: 'completed', progress: 100 });
          
          // コンパクトな通知
          notifySuccess('フォルダを作成しました');
          
          notifyOperationComplete(operationId, 'create_folder');
          
          return true;
        } else {
          throw new Error(result?.error?.message || 'フォルダの作成に失敗しました');
        }

      } catch (error) {
        actions.updateOperation(operationId, { 
          status: 'error', 
          error: error.message,
          progress: 0 
        });
        notifyError(error.message || 'フォルダの作成に失敗しました');
        
        setTimeout(() => {
          actions.removeOperation(operationId);
        }, 5000);
        
        return false;
      }
    },

    async deleteFile(filepath, currentPath) {
      const operationId = Date.now().toString();
      actions.addOperation({
        id: operationId,
        type: 'delete',
        target: filepath,
        status: 'running',
        timestamp: new Date(),
        progress: 0
      });

      try {
        actions.updateOperation(operationId, { progress: 50 });

        let result;
        if (currentPath === 'trash') {
          result = await executeFileOperation('permanently_delete', { path: filepath });
        } else {
          result = await executeFileOperation('delete', { path: filepath });
        }
        
        if (result?.success) {
          actions.updateOperation(operationId, { status: 'completed', progress: 100 });
          
          // コンパクトな通知
          notifySuccess(currentPath === 'trash' ? '完全に削除しました' : 'ゴミ箱に移動しました');
          
          notifyOperationComplete(operationId, 'delete_file');
          
          return true;
        } else {
          throw new Error(result?.error?.message || 'ファイルの削除に失敗しました');
        }

      } catch (error) {
        actions.updateOperation(operationId, { 
          status: 'error', 
          error: error.message,
          progress: 0 
        });
        notifyError(error.message || 'ファイルの削除に失敗しました');
        
        setTimeout(() => {
          actions.removeOperation(operationId);
        }, 5000);
        
        return false;
      }
    },

    async addToFavorites(filepath) {
      const operationId = Date.now().toString();
      
      actions.updateFileFavoriteStatus(filepath, true);
      
      actions.addOperation({
        id: operationId,
        type: 'favorite',
        target: filepath,
        status: 'running',
        timestamp: new Date(),
        progress: 0
      });

      try {
        actions.updateOperation(operationId, { progress: 50 });

        const result = await executeFileOperation('add_to_favorites', { path: filepath });
        
        if (result?.success) {
          actions.updateOperation(operationId, { status: 'completed', progress: 100 });
          
          // お気に入り操作では通知しない
          
          notifyOperationComplete(operationId, 'add_to_favorites', true);
          return true;
        } else {
          actions.updateFileFavoriteStatus(filepath, false);
          throw new Error(result?.error?.message || 'お気に入りの追加に失敗しました');
        }

      } catch (error) {
        actions.updateFileFavoriteStatus(filepath, false);
        
        actions.updateOperation(operationId, { 
          status: 'error', 
          error: error.message,
          progress: 0 
        });
        
        setTimeout(() => {
          actions.removeOperation(operationId);
        }, 5000);
        
        throw error;
      }
    },

    async removeFromFavorites(filepath) {
      const operationId = Date.now().toString();
      
      actions.updateFileFavoriteStatus(filepath, false);
      
      actions.addOperation({
        id: operationId,
        type: 'unfavorite',
        target: filepath,
        status: 'running',
        timestamp: new Date(),
        progress: 0
      });

      try {
        actions.updateOperation(operationId, { progress: 50 });

        const result = await executeFileOperation('remove_from_favorites', { path: filepath });
        
        if (result?.success) {
          actions.updateOperation(operationId, { status: 'completed', progress: 100 });
          
          // お気に入り操作では通知しない
          
          notifyOperationComplete(operationId, 'remove_from_favorites', true);
          return true;
        } else {
          actions.updateFileFavoriteStatus(filepath, true);
          throw new Error(result?.error?.message || 'お気に入りの削除に失敗しました');
        }

      } catch (error) {
        actions.updateFileFavoriteStatus(filepath, true);
        
        actions.updateOperation(operationId, { 
          status: 'error', 
          error: error.message,
          progress: 0 
        });
        
        setTimeout(() => {
          actions.removeOperation(operationId);
        }, 5000);
        
        throw error;
      }
    },

    async restoreFromTrash(filepath) {
      const operationId = Date.now().toString();
      actions.addOperation({
        id: operationId,
        type: 'restore',
        target: filepath,
        status: 'running',
        timestamp: new Date(),
        progress: 0
      });

      try {
        actions.updateOperation(operationId, { progress: 50 });

        const result = await executeFileOperation('restore_from_trash', { path: filepath });
        
        if (result?.success) {
          actions.updateOperation(operationId, { status: 'completed', progress: 100 });
          
          // コンパクトな通知
          notifySuccess('復元しました');
          
          notifyOperationComplete(operationId, 'restore_from_trash');
          return true;
        } else {
          throw new Error(result?.error?.message || 'ファイルの復元に失敗しました');
        }

      } catch (error) {
        actions.updateOperation(operationId, { 
          status: 'error', 
          error: error.message,
          progress: 0 
        });
        notifyError(error.message || 'ファイルの復元に失敗しました');
        
        setTimeout(() => {
          actions.removeOperation(operationId);
        }, 5000);
        
        return false;
      }
    },

    async emptyTrash() {
      const operationId = Date.now().toString();
      actions.addOperation({
        id: operationId,
        type: 'empty_trash',
        target: 'ゴミ箱',
        status: 'running',
        timestamp: new Date(),
        progress: 0
      });

      try {
        actions.updateOperation(operationId, { progress: 50 });

        const result = await executeFileOperation('empty_trash');
        
        if (result?.success) {
          actions.updateOperation(operationId, { status: 'completed', progress: 100 });
          
          // コンパクトな通知
          notifySuccess('ゴミ箱を空にしました');
          
          notifyOperationComplete(operationId, 'empty_trash');
          return true;
        } else {
          throw new Error(result?.error?.message || 'ゴミ箱を空にできませんでした');
        }

      } catch (error) {
        actions.updateOperation(operationId, { 
          status: 'error', 
          error: error.message,
          progress: 0 
        });
        notifyError(error.message || 'ゴミ箱を空にできませんでした');
        
        setTimeout(() => {
          actions.removeOperation(operationId);
        }, 5000);
        
        return false;
      }
    },

    async copyFile(filepath, destinationPath) {
      const operationId = Date.now().toString();
      actions.addOperation({
        id: operationId,
        type: 'copy',
        target: filepath,
        status: 'running',
        timestamp: new Date(),
        progress: 0
      });

      try {
        actions.updateOperation(operationId, { progress: 50 });

        const result = await executeFileOperation('copy', { 
          path: filepath, 
          destination: destinationPath 
        });
        
        if (result?.success) {
          actions.updateOperation(operationId, { status: 'completed', progress: 100 });
          
          // コンパクトな通知
          notifySuccess('コピーしました');
          
          notifyOperationComplete(operationId, 'copy_file');
          return true;
        } else {
          throw new Error(result?.error?.message || 'ファイルのコピーに失敗しました');
        }

      } catch (error) {
        actions.updateOperation(operationId, { 
          status: 'error', 
          error: error.message,
          progress: 0 
        });
        notifyError(error.message || 'ファイルのコピーに失敗しました');
        
        setTimeout(() => {
          actions.removeOperation(operationId);
        }, 5000);
        
        return false;
      }
    },

    async moveFile(filepath, destinationPath) {
      const operationId = Date.now().toString();
      actions.addOperation({
        id: operationId,
        type: 'move',
        target: filepath,
        status: 'running',
        timestamp: new Date(),
        progress: 0
      });

      try {
        actions.updateOperation(operationId, { progress: 50 });

        const result = await executeFileOperation('move', { 
          path: filepath, 
          destination: destinationPath 
        });
        
        if (result?.success) {
          actions.updateOperation(operationId, { status: 'completed', progress: 100 });
          
          // コンパクトな通知
          notifySuccess('移動しました');
          
          notifyOperationComplete(operationId, 'move_file');
          return true;
        } else {
          throw new Error(result?.error?.message || 'ファイルの移動に失敗しました');
        }

      } catch (error) {
        actions.updateOperation(operationId, { 
          status: 'error', 
          error: error.message,
          progress: 0 
        });
        notifyError(error.message || 'ファイルの移動に失敗しました');
        
        setTimeout(() => {
          actions.removeOperation(operationId);
        }, 5000);
        
        return false;
      }
    }
  };
};