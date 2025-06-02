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

/**
 * DashboardPageコンポーネント（v3.0.0・修正版）
 * 機能：ファイル管理ダッシュボードのメイン画面
 * 修正：
 * 1. カスタムイベントによる即座更新対応
 * 2. 日付パース処理の改善
 * 3. サイドバー折り畳み機能削除、画面サイズ調整、StatusBar削除、クォータ情報更新強化
 */
const DashboardPage = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, executeFileOperation } = useAuth();
  const { success: notifySuccess, error: notifyError } = useNotification();
  
  // Context から状態とアクションを取得
  const actions = useDashboardActions();
  const { isLoading, isInitialized } = useUIState();
  const { currentPath } = useFileState();
  const { quotaInfo, folderTree } = useSystemState();
  
  // 初期化フラグとAPI関数を安定化
  const initializationRef = useRef(false);
  const lastPathRef = useRef('');

  // API呼び出し関数群を useCallback でメモ化
  const loadQuotaInfo = useCallback(async () => {
    try {
      console.log('🔄 Loading quota info...');
      const result = await executeFileOperation('get_quota');
      
      console.log('📊 Raw quota API response:');
      console.log('  - Type:', typeof result);
      console.log('  - Success:', result?.success);
      console.log('  - Result exists:', !!result?.result);
      console.log('  - Full response:', JSON.stringify(result, null, 2));
      
      if (result?.success && result?.result) {
        console.log('📊 Processing quota result...');
        const quotaData = parseQuotaInfo(result.result);
        console.log('📊 Parsed quota data:', quotaData);
        
        // 使用量が0Bの場合は推定を試行
        if (quotaData.used === '0 B' || parseSizeToBytes(quotaData.used) === 0) {
          console.warn('⚠️ Warning: Quota shows 0 B usage - attempting estimation');
          console.warn('⚠️ Original API result:', result.result);
          
          // ファイルサイズからの推定を実行
          try {
            console.log('📏 Estimating usage from actual files...');
            
            // 現在のファイル一覧から総サイズを計算
            const filesResult = await executeFileOperation('list', { path: '' });
            if (filesResult?.success && filesResult?.result) {
              const filesList = parseDirectoryListing(filesResult.result);
              const totalSize = filesList.reduce((sum, file) => {
                return sum + (file.size || 0);
              }, 0);
              
              console.log('📏 Estimated total file size:', totalSize, 'bytes');
              
              if (totalSize > 0) {
                const estimatedUsed = formatBytesToSize(totalSize);
                console.log('📏 Estimated usage:', estimatedUsed);
                
                const totalBytes = parseSizeToBytes(quotaData.total);
                const percentage = totalBytes > 0 ? (totalSize / totalBytes) * 100 : 0;
                const remaining = formatBytesToSize(Math.max(0, totalBytes - totalSize));
                
                const updatedQuota = {
                  ...quotaData,
                  used: estimatedUsed,
                  percentage: percentage,
                  remaining: remaining,
                  fileCount: filesList.length,
                  isEstimated: true // 推定値であることを示すフラグ
                };
                
                console.log('📏 Updated quota with estimation:', updatedQuota);
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
        console.warn('⚠️ Invalid quota result structure:', result);
        
        // デバッグ用: レスポンス構造を詳細に調査
        if (result) {
          console.log('📊 Debugging response structure:');
          console.log('  - Keys:', Object.keys(result));
          console.log('  - Values:', Object.values(result));
          
          if (result.result) {
            console.log('  - Result type:', typeof result.result);
            console.log('  - Result keys:', Object.keys(result.result || {}));
          }
        }
        
        // APIが失敗した場合は推定を試行
        console.log('📏 API failed, trying estimation...');
        try {
          const filesResult = await executeFileOperation('list', { path: '' });
          if (filesResult?.success && filesResult?.result) {
            const filesList = parseDirectoryListing(filesResult.result);
            const totalSize = filesList.reduce((sum, file) => {
              return sum + (file.size || 0);
            }, 0);
            
            if (totalSize > 0) {
              const estimatedUsed = formatBytesToSize(totalSize);
              const totalCapacity = 1024 * 1024 * 1024; // 1GB デフォルト
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
              
              console.log('📏 Using fully estimated quota:', estimatedQuota);
              actions.setQuotaInfo(estimatedQuota);
              return;
            }
          }
        } catch (estimationError) {
          console.error('❌ Estimation failed:', estimationError);
        }
        
        // 推定も失敗した場合はフォールバック
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
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // エラー時も推定を試行
      try {
        const filesResult = await executeFileOperation('list', { path: '' });
        if (filesResult?.success && filesResult?.result) {
          const filesList = parseDirectoryListing(filesResult.result);
          const totalSize = filesList.reduce((sum, file) => {
            return sum + (file.size || 0);
          }, 0);
          
          if (totalSize > 0) {
            const estimatedUsed = formatBytesToSize(totalSize);
            const totalCapacity = 1024 * 1024 * 1024; // 1GB デフォルト
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
            
            console.log('📏 Using error fallback estimation:', estimatedQuota);
            actions.setQuotaInfo(estimatedQuota);
            return;
          }
        }
      } catch (estimationError) {
        console.error('❌ Estimation also failed:', estimationError);
      }
      
      // 全て失敗した場合のフォールバック
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

  const loadFolderTree = useCallback(async () => {
    try {
      const tree = await buildFolderTreeWithLimit('', 0, 3, 3, executeFileOperation);
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
        console.log('🗑️ Loaded trash items:', trashItems);
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
      
      console.log('📁 Loading directory:', path);
      
      // 特別なパスの処理
      if (path === 'recent') {
        await loadRecentUpdates();
        return;
      } else if (path === 'favorites') {
        await loadFavorites();
        return;
      } else if (path === 'trash') {
        console.log('🗑️ Loading trash directory...');
        const result = await executeFileOperation('list_trash');
        console.log('🗑️ Trash result:', result);
        
        if (result?.result) {
          const trashItems = parseTrashListing(result.result);
          console.log('🗑️ Parsed trash items:', trashItems);
          actions.setFiles(trashItems);
          // ゴミ箱データも同時に更新
          actions.setTrashItems(trashItems);
        } else {
          console.log('🗑️ No trash result, setting empty');
          actions.setFiles([]);
          actions.setTrashItems([]);
        }
        return;
      }
      
      // documentsプレフィックスの処理を改善
      let actualPath = path;
      if (path && path.startsWith('documents/')) {
        actualPath = path.substring(10); // "documents/"を除去
      } else if (path === 'documents') {
        actualPath = ''; // ルートディレクトリ
      }
      
      console.log('📁 Loading documents path:', actualPath);
      
      // 通常のディレクトリ一覧取得
      const result = await executeFileOperation('list', { path: actualPath });
      
      if (result?.result) {
        const items = parseDirectoryListing(result.result);
        console.log('📁 Parsed directory items:', items);
        actions.setFiles(items);
      } else {
        console.log('📁 No directory result, setting empty');
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

  // 初期化処理
  const initializeDashboard = useCallback(async () => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    try {
      actions.setLoading(true);

      // デフォルトパスの設定
      const lastPath = localStorage.getItem('oneagent_last_path') || '';
      const initialPath = lastPath || '';
      actions.setCurrentPath(initialPath);

      // 並行処理で効率化（クォータ情報を最初に読み込み）
      await Promise.allSettled([
        loadQuotaInfo(),
        loadFolderTree(),
        loadRecentUpdates(),
        loadFavorites(),
        loadTrashItems(),
        loadCurrentDirectory(initialPath)
      ]);

      // ウェルカム通知（初回アクセス時のみ）
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

  // 初期化useEffect
  useEffect(() => {
    if (isAuthenticated && user && !isInitialized && !initializationRef.current) {
      initializeDashboard();
    }
  }, [isAuthenticated, user, isInitialized, initializeDashboard]);

  // パス変更時のディレクトリ自動再読み込み
  useEffect(() => {
    if (isInitialized && currentPath && lastPathRef.current !== currentPath) {
      // 前のパスのデータをクリア
      actions.setFiles([]);
      
      // 新しいパスのディレクトリを読み込み
      loadCurrentDirectory(currentPath);
      
      // 現在のパスを記録
      lastPathRef.current = currentPath;
    }
  }, [currentPath, isInitialized, loadCurrentDirectory, actions.setFiles]);

  // ★ 修正：カスタムイベント監視による即座更新
  useEffect(() => {
    const handleFileOperationComplete = (event) => {
      const { operationType, data } = event.detail;
      console.log('🔄 File operation completed:', operationType, data);
      
      // 更新処理を即座に実行
      Promise.allSettled([
        loadCurrentDirectory(currentPath),
        loadRecentUpdates(),
        loadFavorites(),
        loadTrashItems(),
        loadFolderTree(),
        loadQuotaInfo()
      ]).then(() => {
        console.log('✅ Dashboard data refreshed after operation:', operationType);
      }).catch((error) => {
        console.error('❌ Error refreshing dashboard data:', error);
      });
    };

    // カスタムイベントリスナーを追加
    window.addEventListener('fileOperationCompleted', handleFileOperationComplete);
    
    return () => {
      window.removeEventListener('fileOperationCompleted', handleFileOperationComplete);
    };
  }, [currentPath, loadCurrentDirectory, loadRecentUpdates, loadFavorites, loadTrashItems, loadFolderTree, loadQuotaInfo]);

  // パス変更の保存
  useEffect(() => {
    if (currentPath) {
      localStorage.setItem('oneagent_last_path', currentPath);
    }
  }, [currentPath]);

  // キーボードショートカット
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
      // ナビゲーションショートカット
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

  // ローディング中
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
      {/* Header */}
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            {/* FileList */}
            <FileList />
          </div>
        </main>
      </div>
    </div>
  );
};

// ヘルパー関数群（パーサー関数）- 日付処理を修正

// 共通ヘルパー関数
const isStatusMessage = (line) => {
  const trimmedLine = line.trim();
  
  const statusPatterns = [
    // フォルダ操作メッセージパターン
    /^フォルダ[：:]\s*.*[をが].*(作成|削除|移動|コピー|変更|追加).*しました/,
    /^フォルダ[：:].*(作成|削除|移動|コピー|変更|追加).*しました/,
    /^フォルダ\s*[「『].+[」』][をが].*(作成|削除|移動|コピー|変更).*しました/,
    /^フォルダ\s+.+\s*[をが].*(作成|削除|移動|コピー|変更).*しました/,
    
    // ファイル操作メッセージパターン
    /^ファイル[：:]\s*.*[をが].*(作成|削除|移動|コピー|変更|更新).*しました/,
    /^ファイル[：:].*(作成|削除|移動|コピー|変更|更新).*しました/,
    /^ファイル\s*[「『].+[」』][をが].*(作成|削除|移動|コピー|変更|更新).*しました/,
    /^ファイル\s+.+\s*[をが].*(作成|削除|移動|コピー|変更|更新).*しました/,
    
    // ディレクトリ操作メッセージパターン
    /^ディレクトリ[：:]\s*.*[をが].*(作成|削除|移動|コピー|変更).*しました/,
    /^ディレクトリ[：:].*(作成|削除|移動|コピー|変更).*しました/,
    
    // 一般的な操作メッセージ
    /^.*[をが](作成|削除|移動|コピー|変更|更新|追加|復元)しました$/,
    /^.*の(作成|削除|移動|コピー|変更|更新|追加|復元)が完了しました$/,
    /^(作成|削除|移動|コピー|変更|更新|追加|復元)が完了しました$/,
    /^(作成|削除|移動|コピー|変更|更新|追加|復元)しました$/,
    
    // システムメッセージパターン
    /^操作.*完了/,
    /^処理.*完了/,
    /^実行.*完了/,
    /^(成功|完了|終了)[：:]/, 
    /^(エラー|警告|注意)[：:]/,
    /^(実行結果|結果|状態|処理中)[：:]/,
    
    // 英語パターン
    /^Folder[:\s]+.*\s+(created|deleted|moved|copied|modified|added)[\s.]*$/i,
    /^File[:\s]+.*\s+(created|deleted|moved|copied|modified|updated|added)[\s.]*$/i,
    /^Directory[:\s]+.*\s+(created|deleted|moved|copied|modified)[\s.]*$/i,
    /^.*\s+(created|deleted|moved|copied|modified|updated|added)[\s.]*$/i,
    /^(Operation|Process|Execution).*(completed|finished|done)/i,
    /^(Success|Completed|Finished|Done)[:\s]/i,
    /^(Error|Warning|Notice)[:\s]/i,
    /^(Result|Status|Processing)[:\s]/i,
    
    // その他のシステムメッセージ
    /^\s*正常に処理されました/,
    /^\s*正常に完了しました/,
    /^\s*処理が正常に終了しました/,
    /^お気に入りに追加しました/,
    /^お気に入りから削除しました/,
    /^ゴミ箱に移動しました/,
    /^ゴミ箱から復元しました/,
    /^ゴミ箱を空にしました/,
    
    // 📁や📄で始まってもメッセージの場合
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
  
  // システムメッセージパターンを除外
  const invalidPatterns = [
    // 操作完了メッセージ
    /^フォルダ[：:]/,
    /^ファイル[：:]/,
    /^ディレクトリ[：:]/,
    /.*[をが].*(作成|削除|移動|コピー|変更|更新|追加|復元).*しました$/,
    /.*の(作成|削除|移動|コピー|変更|更新|追加|復元)が完了しました$/,
    /.*(作成|削除|移動|コピー|変更|更新|追加|復元)が完了しました$/,
    /.*(作成|削除|移動|コピー|変更|更新|追加|復元)しました$/,
    
    // システムメッセージ
    /^(操作|処理|実行).*完了/,
    /^(成功|完了|終了|エラー|警告|注意|実行結果|結果|状態|処理中)[：:]/,
    /^正常に(処理|完了|終了)/,
    /^お気に入りに(追加|削除)/,
    /^ゴミ箱(に移動|から復元|を空に)/,
    
    // 英語パターン
    /^Folder[:\s]/i,
    /^File[:\s]/i,
    /^Directory[:\s]/i,
    /.*(created|deleted|moved|copied|modified|updated|added)[\s.]*$/i,
    /^(Operation|Process|Execution).*(completed|finished|done)/i,
    /^(Success|Completed|Finished|Done|Error|Warning|Notice|Result|Status|Processing)[:\s]/i,
    
    // 無効な文字を含む場合
    /[<>:"/\\|?*\x00-\x1f]/,
    
    // 不自然な形式
    /：.*しました$/,  // コロンで始まってしましたで終わる
    /^.*：.*(作成|削除|移動|コピー|変更|更新|追加|復元)/,  // コロンを含むメッセージ
    /を(作成|削除|移動|コピー|変更|更新|追加|復元)しました$/,  // 「を〜しました」で終わる
    /が(作成|削除|移動|コピー|変更|更新|追加|復元).*$/,  // 「が〜」を含む
    
    // 特定の問題のあるパターン
    /^フォルダ：.*$/,  // 「フォルダ：」で始まる全て
    /^ファイル：.*$/   // 「ファイル：」で始まる全て
  ];
  
  return !invalidPatterns.some(pattern => pattern.test(trimmedName));
};

// サイズ文字列をバイト数に変換するヘルパー関数（改良版）
const parseSizeToBytes = (sizeStr) => {
  if (!sizeStr) return 0;
  
  console.log('🔢 Parsing size string:', sizeStr);
  
  // 文字列の正規化
  const normalized = sizeStr.toString().trim().toUpperCase();
  
  // 様々なパターンに対応
  const patterns = [
    // 標準的なパターン: "100 MB", "1.5 GB"
    /(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)/,
    // カンマ区切り: "1,000 MB"
    /([\d,]+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)/,
    // 小数点のみ: "100.5MB"
    /(\d+\.\d+)(B|KB|MB|GB|TB)/,
    // 整数のみ: "100MB"
    /(\d+)(B|KB|MB|GB|TB)/,
    // 数値のみ（バイト単位と仮定）
    /^(\d+)$/
  ];
  
  let match = null;
  for (const pattern of patterns) {
    match = normalized.match(pattern);
    if (match) break;
  }
  
  if (!match) {
    console.warn('⚠️ Could not parse size string:', sizeStr);
    return 0;
  }
  
  // 数値部分からカンマを除去
  const valueStr = match[1].replace(/,/g, '');
  const value = parseFloat(valueStr);
  const unit = match[2] || 'B'; // デフォルトはバイト
  
  if (isNaN(value)) {
    console.warn('⚠️ Invalid number in size string:', sizeStr);
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
  console.log('🔢 Parsed:', sizeStr, '->', bytes, 'bytes');
  
  return bytes;
};

// バイト数をサイズ文字列に変換するヘルパー関数
const formatBytesToSize = (bytes) => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const parseQuotaInfo = (resultData) => {
  try {
    console.log('🔍 Parsing quota info, input type:', typeof resultData);
    console.log('🔍 Full input data:', JSON.stringify(resultData, null, 2));
    
    let content = '';
    
    // より包括的なコンテンツ抽出
    if (Array.isArray(resultData)) {
      // 配列の場合、全要素を結合
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
      // オブジェクト全体を文字列化して解析
      content = JSON.stringify(resultData);
    }

    console.log('📝 Extracted content length:', content.length);
    console.log('📝 Extracted content:', content.substring(0, 500) + (content.length > 500 ? '...' : ''));

    const quotaInfo = {
      used: '0 B',
      total: '1 GB',
      percentage: 0,
      fileCount: 0,
      remaining: '1 GB'
    };

    // より包括的なパターンマッチング
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

    // 使用量の解析
    let usageFound = false;
    for (const pattern of patterns.usage) {
      pattern.lastIndex = 0; // Reset regex
      const matches = [...content.matchAll(pattern)];
      for (const match of matches) {
        if (match.length >= 3) {
          let used, total;
          if (match.length === 5) {
            // 数値と単位が分離されている場合
            used = match[1] + ' ' + match[2];
            total = match[3] + ' ' + match[4];
          } else {
            used = match[1].trim();
            total = match[2].trim();
          }
          
          console.log('📊 Found usage pattern:', used, '/', total);
          
          // サイズ形式の妥当性チェック
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

    // パーセンテージの解析
    for (const pattern of patterns.percentage) {
      pattern.lastIndex = 0;
      const match = pattern.exec(content);
      if (match) {
        quotaInfo.percentage = parseFloat(match[1]);
        console.log('📊 Found percentage:', quotaInfo.percentage);
        break;
      }
    }

    // ファイル数の解析
    for (const pattern of patterns.fileCount) {
      pattern.lastIndex = 0;
      const match = pattern.exec(content);
      if (match) {
        quotaInfo.fileCount = parseInt(match[1]);
        console.log('📊 Found file count:', quotaInfo.fileCount);
        break;
      }
    }

    // 残り容量の解析
    for (const pattern of patterns.remaining) {
      pattern.lastIndex = 0;
      const match = pattern.exec(content);
      if (match) {
        quotaInfo.remaining = match[1].trim();
        console.log('📊 Found remaining:', quotaInfo.remaining);
        break;
      }
    }

    // 使用量が見つからない場合の代替手法
    if (!usageFound) {
      console.log('⚠️ Usage not found, trying alternative extraction...');
      
      // 数値を直接抽出
      const numbers = content.match(/\d+(?:\.\d+)?/g);
      const sizes = content.match(/\d+(?:\.\d+)?\s*[KMGT]?B/gi);
      
      console.log('🔍 Found numbers:', numbers);
      console.log('🔍 Found sizes:', sizes);
      
      if (sizes && sizes.length >= 2) {
        quotaInfo.used = sizes[0];
        quotaInfo.total = sizes[1];
        console.log('📊 Alternative usage extraction:', quotaInfo.used, '/', quotaInfo.total);
      } else if (numbers && numbers.length >= 2) {
        // 数値のみの場合はバイト単位と仮定
        quotaInfo.used = numbers[0] + ' B';
        quotaInfo.total = numbers[1] + ' B';
        console.log('📊 Fallback usage (bytes):', quotaInfo.used, '/', quotaInfo.total);
      }
    }

    // 計算による補完
    try {
      const usedBytes = parseSizeToBytes(quotaInfo.used);
      const totalBytes = parseSizeToBytes(quotaInfo.total);
      
      if (usedBytes > 0 && totalBytes > 0) {
        // パーセンテージを計算
        if (quotaInfo.percentage === 0) {
          quotaInfo.percentage = (usedBytes / totalBytes) * 100;
          console.log('📊 Calculated percentage:', quotaInfo.percentage);
        }
        
        // 残り容量を計算
        if (quotaInfo.remaining === '1 GB') {
          const remainingBytes = totalBytes - usedBytes;
          quotaInfo.remaining = formatBytesToSize(remainingBytes);
          console.log('📊 Calculated remaining:', quotaInfo.remaining);
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to calculate values:', error);
    }

    // ファイル数が見つからない場合のファイル一覧からの推定
    if (quotaInfo.fileCount === 0) {
      try {
        // ファイル数を推定（簡易的）
        const fileMatches = content.match(/📄/g);
        const folderMatches = content.match(/📁/g);
        if (fileMatches || folderMatches) {
          quotaInfo.fileCount = (fileMatches?.length || 0) + (folderMatches?.length || 0);
          console.log('📊 Estimated file count from content:', quotaInfo.fileCount);
        }
      } catch (error) {
        console.warn('⚠️ Failed to estimate file count:', error);
      }
    }

    console.log('✅ Final quota info:', quotaInfo);
    return quotaInfo;
  } catch (error) {
    console.error('❌ Quota info parse error:', error);
    console.error('❌ Error stack:', error.stack);
    return {
      used: '0 B',
      total: '1 GB',
      percentage: 0,
      fileCount: 0,
      remaining: '1 GB'
    };
  }
};

const parseDirectoryListing = (resultData) => {
  if (!resultData) return [];
  
  try {
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
    const processedItems = new Set(); // 重複防止
    
    console.log('📁 Parsing directory content:', content); // デバッグ用
    
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      
      console.log('📋 Processing line:', line); // デバッグ用
      
      // サーバーからの状況メッセージを除外
      if (isStatusMessage(line)) {
        console.log('🚫 Filtered out status message:', line); // デバッグ用
        continue;
      }
      
      // フォルダのパース（改良版・より厳密）
      const folderMatch = line.match(/^📁\s+([^/\s]+)(?:\/\s*|$)/);
      if (folderMatch) {
        const folderName = folderMatch[1].trim();
        
        console.log('📁 Matched folder pattern:', folderName); // デバッグ用
        
        // フォルダ名にシステムメッセージが含まれていないかチェック
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
          
          console.log('✅ Adding valid folder:', folderName); // デバッグ用
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
        } else {
          console.log('❌ Rejected folder name:', folderName); // デバッグ用
        }
        continue;
      }

      // ファイルのパース（改良版・より厳密）
      const fileMatch = line.match(/^📄\s+([^/\s]+(?:\.[^/\s]+)?)\s+\((.+?),\s*(.+?)\)/);
      if (fileMatch) {
        const [, name, sizeStr, dateStr] = fileMatch;
        const fileName = name.trim();
        
        console.log('📄 Matched file pattern:', fileName); // デバッグ用
        
        // ファイル名にシステムメッセージが含まれていないかチェック
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
          
          console.log('✅ Adding valid file:', fileName); // デバッグ用
          processedItems.add(fileName);
          files.push({
            id: `file_${fileName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: fileName,
            path: fileName,
            isDirectory: false,
            size: parseSizeString(sizeStr),
            modifiedDate: parseDateString(dateStr) || new Date().toISOString(),
            inFavorites: false,
            isExecutable: line.includes('⚠️')
          });
        } else {
          console.log('❌ Rejected file name:', fileName); // デバッグ用
        }
        continue;
      }
      
      console.log('⚠️ Unmatched line:', line); // デバッグ用
    }
    
    console.log('📋 Final parsed files:', files); // デバッグ用
    return files;
  } catch (error) {
    console.error('Directory listing parse error:', error);
    return [];
  }
};

const parseRecentUpdates = (resultData) => {
  if (!resultData) return [];
  
  try {
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
    
    console.log('🔄 Parsing recent updates content:', content); // デバッグ用
    
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      
      console.log('🔄 Processing recent update line:', line); // デバッグ用
      
      // サーバーからの状況メッセージを除外
      if (isStatusMessage(line)) {
        console.log('🚫 Filtered out status message in recent updates:', line);
        continue;
      }
      
      const updateMatch = line.match(/^[✨✏️📦📋♻️]\s+([^:：]+?)(?:\s|$)/);
      if (updateMatch) {
        const fileName = updateMatch[1].trim();
        
        console.log('🔄 Matched recent update:', fileName); // デバッグ用
        
        // ファイル名の有効性をチェック
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
          
          console.log('✅ Adding valid recent update:', fileName); // デバッグ用
          updates.push({
            id: `recent_${fileName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: fileName,
            path: fileName,
            isDirectory: false,
            size: 0,
            modifiedDate: timeMatch ? parseDateString(timeMatch[1]) || new Date().toISOString() : new Date().toISOString(),
            action: actionMatch ? actionMatch[1] : 'update',
            inFavorites: false
          });
        } else {
          console.log('❌ Rejected recent update name:', fileName); // デバッグ用
        }
      }
    }
    
    console.log('🔄 Final parsed recent updates:', updates); // デバッグ用
    return updates;
  } catch (error) {
    console.error('Recent updates parse error:', error);
    return [];
  }
};

const parseFavorites = (resultData) => {
  if (!resultData) return [];
  
  try {
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
    
    console.log('⭐ Parsing favorites content:', content); // デバッグ用
    
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      
      console.log('⭐ Processing favorite line:', line); // デバッグ用
      
      // サーバーからの状況メッセージを除外
      if (isStatusMessage(line)) {
        console.log('🚫 Filtered out status message in favorites:', line);
        continue;
      }
      
      const favoriteMatch = line.match(/^[⭐📁📄]\s+([^:：\s]+?)(?:\s|$)/);
      if (favoriteMatch) {
        const fileName = favoriteMatch[1].trim();
        
        console.log('⭐ Matched favorite:', fileName); // デバッグ用
        
        // ファイル名の有効性をチェック
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
          
          console.log('✅ Adding valid favorite:', fileName); // デバッグ用
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
        } else {
          console.log('❌ Rejected favorite name:', fileName); // デバッグ用
        }
      }
    }
    
    console.log('⭐ Final parsed favorites:', favorites); // デバッグ用
    return favorites;
  } catch (error) {
    console.error('Favorites parse error:', error);
    return [];
  }
};

const parseTrashListing = (resultData) => {
  if (!resultData) return [];
  
  try {
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

    console.log('🗑️ Trash content to parse:', content);

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
    
    let currentFile = null;
    let originalPath = null;
    let deletedDate = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length === 0) continue;
      
      console.log('🗑️ Processing trash line:', line); // デバッグ用
      
      // サーバーからの状況メッセージを除外
      if (isStatusMessage(line)) {
        console.log('🚫 Filtered out status message in trash:', line);
        continue;
      }
      
      // ファイル行を検出（📄 または 📁 で始まる）
      const fileMatch = line.match(/^(📄|📁)\s+([^/\s]+(?:\.[^/\s]+)?)\s+(.+)$/);
      if (fileMatch) {
        const [, icon, fileName, sizeInfo] = fileMatch;
        
        console.log('🗑️ Matched trash item:', fileName); // デバッグ用
        
        // ファイル名の有効性をチェック
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
          
          // 次の行から元の場所と削除日時を探す
          originalPath = fileName; // デフォルト値
          deletedDate = new Date().toISOString(); // デフォルト値
          
          // 次の2行をチェック
          for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
            const nextLine = lines[j].trim();
            
            const originalMatch = nextLine.match(/元の場所:\s*(.+)/);
            if (originalMatch) {
              originalPath = originalMatch[1].trim();
              continue;
            }
            
            const deletedMatch = nextLine.match(/削除日時:\s*(.+)/);
            if (deletedMatch) {
              deletedDate = parseDateString(deletedMatch[1].trim()) || new Date().toISOString();
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
          
          console.log('✅ Adding valid trash item:', trashItem); // デバッグ用
          trashItems.push(trashItem);
        } else {
          console.log('❌ Rejected trash item name:', fileName); // デバッグ用
        }
        continue;
      }
    }
    
    console.log('🗑️ Final parsed trash items:', trashItems);
    return trashItems;
  } catch (error) {
    console.error('❌ Trash listing parse error:', error);
    return [];
  }
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
  
  // サイズ情報を含む部分だけを抽出
  const sizeMatch = sizeStr.match(/(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)/i);
  if (!sizeMatch) {
    // 数値のみの場合（バイト単位と仮定）
    const numMatch = sizeStr.match(/(\d+)/);
    return numMatch ? parseInt(numMatch[1]) : 0;
  }
  
  const value = parseFloat(sizeMatch[1]);
  const unit = sizeMatch[2].toUpperCase();
  
  const multipliers = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3 };
  return Math.floor(value * (multipliers[unit] || 1));
};

// ★ 修正：日付パース処理の改善
const parseDateString = (dateStr) => {
  if (!dateStr) return null;
  
  try {
    const now = new Date();
    
    // 相対時間表記の処理
    if (typeof dateStr === 'string') {
      const trimmed = dateStr.trim();
      
      // 「○分前」形式
      const minutesMatch = trimmed.match(/(\d+)\s*分前/);
      if (minutesMatch) {
        const minutes = parseInt(minutesMatch[1]);
        return new Date(now.getTime() - minutes * 60 * 1000).toISOString();
      }
      
      // 「○時間前」形式
      const hoursMatch = trimmed.match(/(\d+)\s*時間前/);
      if (hoursMatch) {
        const hours = parseInt(hoursMatch[1]);
        return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
      }
      
      // 「○日前」形式
      const daysMatch = trimmed.match(/(\d+)\s*日前/);
      if (daysMatch) {
        const days = parseInt(daysMatch[1]);
        return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
      }
      
      // ISO形式やその他の標準的な日付形式
      const isoMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      if (isoMatch) {
        return new Date(trimmed).toISOString();
      }
      
      // 日本語の日付形式（年/月/日 時:分）
      const jpDateMatch = trimmed.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})[日\s]*(\d{1,2}):(\d{1,2})/);
      if (jpDateMatch) {
        const [, year, month, day, hour, minute] = jpDateMatch;
        return new Date(year, month - 1, day, hour, minute).toISOString();
      }
      
      // 時刻のみの場合（今日の日付で補完）
      const timeMatch = trimmed.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
      if (timeMatch) {
        const [, hour, minute, second = '0'] = timeMatch;
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 
                       parseInt(hour), parseInt(minute), parseInt(second)).toISOString();
      }
      
      // デフォルトで現在時刻から少し前の時間を設定
      console.warn('⚠️ Could not parse date string:', dateStr, '- using current time with random offset');
      const randomMinutesAgo = Math.floor(Math.random() * 60) + 1; // 1-60分前
      return new Date(now.getTime() - randomMinutesAgo * 60 * 1000).toISOString();
    }
    
    // Date オブジェクトの場合
    return new Date(dateStr).toISOString();
  } catch (error) {
    console.warn('⚠️ Date parsing error for:', dateStr, error);
    // エラー時は現在時刻から少し前の時間を返す
    const randomMinutesAgo = Math.floor(Math.random() * 60) + 1;
    return new Date(Date.now() - randomMinutesAgo * 60 * 1000).toISOString();
  }
};

export default withAuth(DashboardPage);