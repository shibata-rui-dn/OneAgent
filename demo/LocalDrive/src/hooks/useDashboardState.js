// src/hooks/useDashboardState.js
import { useState, useCallback, useMemo } from 'react';

/**
 * UI状態専用フック（分離）
 */
export const useUIState = () => {
  const [state, setState] = useState({
    sidebarCollapsed: false,
    viewMode: 'list',
    isLoading: false,
    isInitialized: false
  });

  const updateState = useCallback((updates) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const toggleSidebar = useCallback(() => {
    setState(prev => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }));
  }, []);

  const toggleViewMode = useCallback((mode) => {
    const newMode = mode || (state.viewMode === 'list' ? 'grid' : 'list');
    setState(prev => ({ ...prev, viewMode: newMode }));
    localStorage.setItem('oneagent_view_mode', newMode);
  }, [state.viewMode]);

  return useMemo(() => ({
    ...state,
    updateState,
    toggleSidebar,
    toggleViewMode
  }), [state, updateState, toggleSidebar, toggleViewMode]);
};

/**
 * ファイル状態専用フック（分離）
 */
export const useFileState = () => {
  const [state, setState] = useState({
    currentPath: '',
    files: [],
    selectedFiles: [],
    searchQuery: '',
    isLoadingFiles: false
  });

  const updateFiles = useCallback((files) => {
    setState(prev => ({ ...prev, files }));
  }, []);

  const setCurrentPath = useCallback((path) => {
    setState(prev => ({ 
      ...prev, 
      currentPath: path,
      selectedFiles: [] // パス変更時は選択をクリア
    }));
    localStorage.setItem('oneagent_last_path', path);
  }, []);

  const setSelectedFiles = useCallback((selectedFiles) => {
    setState(prev => ({ ...prev, selectedFiles }));
  }, []);

  const setSearchQuery = useCallback((searchQuery) => {
    setState(prev => ({ ...prev, searchQuery }));
  }, []);

  const setLoadingFiles = useCallback((isLoadingFiles) => {
    setState(prev => ({ ...prev, isLoadingFiles }));
  }, []);

  return useMemo(() => ({
    ...state,
    updateFiles,
    setCurrentPath,
    setSelectedFiles,
    setSearchQuery,
    setLoadingFiles
  }), [
    state,
    updateFiles,
    setCurrentPath,
    setSelectedFiles,
    setSearchQuery,
    setLoadingFiles
  ]);
};

/**
 * システム状態専用フック（分離）
 */
export const useSystemState = () => {
  const [state, setState] = useState({
    folderTree: [],
    quotaInfo: null
  });

  const setFolderTree = useCallback((folderTree) => {
    setState(prev => ({ ...prev, folderTree }));
  }, []);

  const setQuotaInfo = useCallback((quotaInfo) => {
    setState(prev => ({ ...prev, quotaInfo }));
  }, []);

  return useMemo(() => ({
    ...state,
    setFolderTree,
    setQuotaInfo
  }), [state, setFolderTree, setQuotaInfo]);
};

/**
 * ファイル操作専用フック（分離）
 */
export const useFileOperations = (fileState, systemState, executeFileOperation, notification) => {
  const refreshCurrentDirectory = useCallback(async () => {
    fileState.setLoadingFiles(true);
    try {
      const result = await executeFileOperation('list', { path: fileState.currentPath });
      if (result?.result) {
        const items = parseDirectoryListing(result.result);
        fileState.updateFiles(items);
      }
      notification.success('ディレクトリを更新しました');
    } catch (error) {
      notification.error(`ディレクトリの読み込みに失敗しました: ${error.message}`);
    } finally {
      fileState.setLoadingFiles(false);
    }
  }, [fileState.currentPath, executeFileOperation, fileState, notification]);

  const createFile = useCallback(async () => {
    const filename = prompt('ファイル名を入力してください:');
    if (!filename) return;

    try {
      const targetPath = fileState.currentPath 
        ? `${fileState.currentPath}/${filename}` 
        : filename;

      await executeFileOperation('create_file', {
        path: targetPath,
        content: ''
      });

      notification.success(`ファイル「${filename}」を作成しました`);
      await refreshCurrentDirectory();
    } catch (error) {
      notification.error(`ファイルの作成に失敗しました: ${error.message}`);
    }
  }, [fileState.currentPath, executeFileOperation, notification, refreshCurrentDirectory]);

  const createFolder = useCallback(async () => {
    const folderName = prompt('フォルダ名を入力してください:');
    if (!folderName) return;

    try {
      const targetPath = fileState.currentPath 
        ? `${fileState.currentPath}/${folderName}` 
        : folderName;

      await executeFileOperation('create_folder', { path: targetPath });
      notification.success(`フォルダ「${folderName}」を作成しました`);
      await refreshCurrentDirectory();
    } catch (error) {
      notification.error(`フォルダの作成に失敗しました: ${error.message}`);
    }
  }, [fileState.currentPath, executeFileOperation, notification, refreshCurrentDirectory]);

  const deleteFile = useCallback(async (filepath) => {
    if (!confirm(`「${filepath}」を削除しますか？`)) return;

    try {
      await executeFileOperation('delete', { path: filepath });
      notification.success(`ファイル「${filepath}」を削除しました`);
      await refreshCurrentDirectory();
    } catch (error) {
      notification.error(`ファイルの削除に失敗しました: ${error.message}`);
    }
  }, [executeFileOperation, notification, refreshCurrentDirectory]);

  return useMemo(() => ({
    refreshCurrentDirectory,
    createFile,
    createFolder,
    deleteFile
  }), [refreshCurrentDirectory, createFile, createFolder, deleteFile]);
};

// ヘルパー関数
const parseDirectoryListing = (resultData) => {
  // 既存の実装をそのまま使用
  const items = [];
  const resultText = extractTextFromResponse(resultData);
  
  if (typeof resultText !== 'string' || !resultText.trim()) {
    return [];
  }

  const lines = resultText.split('\n');
  for (const line of lines) {
    if (line.includes('📁') && line.includes('/')) {
      const match = line.match(/📁\s+(.+)\/$/);
      if (match) {
        items.push({
          name: match[1],
          path: match[1],
          isDirectory: true,
          size: 0,
          modifiedDate: new Date().toISOString()
        });
      }
    } else if (line.includes('📄')) {
      const match = line.match(/📄\s+(.+?)\s+\((.+?),\s*(.+?)\)(\s*⚠️)?/);
      if (match) {
        const [, name, size, date, executable] = match;
        items.push({
          name: name,
          path: name,
          isDirectory: false,
          size: parseFileSize(size),
          modifiedDate: new Date(date).toISOString(),
          isExecutable: !!executable
        });
      }
    }
  }
  return items;
};

const extractTextFromResponse = (responseData) => {
  let content = '';
  if (responseData.content) {
    if (Array.isArray(responseData.content)) {
      content = responseData.content
        .filter(item => item && item.type === 'text')
        .map(item => item.text || '')
        .join('\n');
    } else if (typeof responseData.content === 'string') {
      content = responseData.content;
    } else if (responseData.content.text) {
      content = responseData.content.text;
    }
  } else if (responseData.text) {
    content = responseData.text;
  } else if (typeof responseData === 'string') {
    content = responseData;
  }
  return content;
};

const parseFileSize = (sizeStr) => {
  const match = sizeStr.match(/^([\d.]+)\s*(B|KB|MB|GB)$/);
  if (!match) return 0;

  const [, num, unit] = match;
  const size = parseFloat(num);

  switch (unit) {
    case 'KB': return size * 1024;
    case 'MB': return size * 1024 * 1024;
    case 'GB': return size * 1024 * 1024 * 1024;
    default: return size;
  }
};