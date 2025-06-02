import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getFileExtension, getFileName, getParentDirectory } from '../types/file';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';
import FileEditor from '../components/file/FileEditor';
import FilePreview from '../components/file/FilePreview';
import LoadingScreen from '../components/common/LoadingScreen';

/**
 * ファイル管理画面コンポーネント
 * 個別ファイルの詳細表示・編集・プレビュー
 */
const FilePage = () => {
  const { '*': filePath } = useParams(); // キャッチオールルート
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, user, isLoading } = useAuth();
  
  const [fileInfo, setFileInfo] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // URLパラメータからモードを取得
  const mode = searchParams.get('mode') || 'view'; // 'view' | 'edit' | 'preview'
  const actualFilePath = filePath || '';

  // ファイル情報の読み込み
  useEffect(() => {
    const loadFileInfo = async () => {
      if (!actualFilePath) {
        navigate('/');
        return;
      }

      try {
        setPageLoading(true);
        setError(null);

        // 実際の実装では、fileService.getFileInfo(actualFilePath) を呼び出す
        const mockFileInfo = {
          id: `file_${Date.now()}`,
          name: getFileName(actualFilePath),
          path: actualFilePath,
          type: 'file',
          extension: getFileExtension(actualFilePath),
          size: 1024, // 仮のサイズ
          mimeType: 'text/plain',
          createdAt: new Date(),
          modifiedAt: new Date(),
          isExecutable: false,
          isHidden: false
        };

        setFileInfo(mockFileInfo);

        // ファイル内容の読み込み（テキストファイルの場合）
        if (isTextFile(mockFileInfo.extension)) {
          // 実際の実装では、fileService.readFile(actualFilePath) を呼び出す
          const mockContent = `# ${mockFileInfo.name}

これは${mockFileInfo.name}ファイルの内容です。

作成日時: ${mockFileInfo.createdAt.toLocaleString()}
更新日時: ${mockFileInfo.modifiedAt.toLocaleString()}
ファイルサイズ: ${mockFileInfo.size} bytes

このファイルは編集可能です。`;

          setFileContent(mockContent);
        }

        console.log('📄 File loaded:', actualFilePath);
      } catch (err) {
        console.error('File load error:', err);
        setError('ファイルの読み込みに失敗しました。');
      } finally {
        setPageLoading(false);
      }
    };

    if (isAuthenticated && user) {
      loadFileInfo();
    }
  }, [actualFilePath, isAuthenticated, user, navigate]);

  // モード変更監視
  useEffect(() => {
    setIsEditing(mode === 'edit');
  }, [mode]);

  // ページ離脱時の未保存変更チェック
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // ローディング中の表示
  if (isLoading || pageLoading) {
    return <LoadingScreen />;
  }

  // 未認証の場合は何も表示しない（App.jsでリダイレクト処理される）
  if (!isAuthenticated) {
    return null;
  }

  // エラー表示
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md mx-4">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              エラーが発生しました
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {error}
            </p>
            <div className="space-x-3">
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
              >
                再試行
              </button>
              <button
                onClick={() => navigate('/')}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition-colors"
              >
                ホームに戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ファイル情報がない場合
  if (!fileInfo) {
    return <LoadingScreen />;
  }

  /**
   * テキストファイルかどうかを判定
   * @param {string} extension - ファイル拡張子
   * @returns {boolean} テキストファイルの場合true
   */
  const isTextFile = (extension) => {
    const textExtensions = [
      '.txt', '.md', '.json', '.xml', '.csv', '.yaml', '.yml',
      '.js', '.ts', '.html', '.css', '.py', '.java', '.cpp', '.c',
      '.sh', '.bat', '.sql', '.log', '.ini', '.conf', '.php', '.rb'
    ];
    return textExtensions.includes(extension.toLowerCase());
  };

  /**
   * モード変更処理
   * @param {string} newMode - 新しいモード
   */
  const handleModeChange = (newMode) => {
    if (hasUnsavedChanges && newMode !== 'edit') {
      const confirmed = window.confirm('未保存の変更があります。破棄しますか？');
      if (!confirmed) return;
      setHasUnsavedChanges(false);
    }

    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('mode', newMode);
    navigate(`/file/${actualFilePath}?${newSearchParams.toString()}`, { replace: true });
  };

  /**
   * ファイル内容変更処理
   * @param {string} newContent - 新しい内容
   */
  const handleContentChange = (newContent) => {
    setFileContent(newContent);
    setHasUnsavedChanges(true);
  };

  /**
   * ファイル保存処理
   */
  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      // 実際の実装では、fileService.updateFile(actualFilePath, fileContent) を呼び出す
      console.log('💾 Saving file:', actualFilePath);
      
      // 保存成功のシミュレーション
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setHasUnsavedChanges(false);
      setFileInfo(prev => ({ ...prev, modifiedAt: new Date() }));
      
      console.log('✅ File saved successfully');
    } catch (err) {
      console.error('Save error:', err);
      alert('ファイルの保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * ファイルダウンロード処理
   */
  const handleDownload = () => {
    try {
      const blob = new Blob([fileContent], { type: fileInfo.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileInfo.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('📥 File downloaded:', fileInfo.name);
    } catch (err) {
      console.error('Download error:', err);
      alert('ファイルのダウンロードに失敗しました。');
    }
  };

  /**
   * ファイル削除処理
   */
  const handleDelete = async () => {
    const confirmed = window.confirm(`「${fileInfo.name}」を削除しますか？この操作は取り消せません。`);
    if (!confirmed) return;

    try {
      // 実際の実装では、fileService.deleteFile(actualFilePath) を呼び出す
      console.log('🗑️ Deleting file:', actualFilePath);
      
      // 削除成功のシミュレーション
      await new Promise(resolve => setTimeout(resolve, 500));
      
      alert('ファイルを削除しました。');
      navigate(getParentDirectory(actualFilePath) ? `/path/${getParentDirectory(actualFilePath)}` : '/');
    } catch (err) {
      console.error('Delete error:', err);
      alert('ファイルの削除に失敗しました。');
    }
  };

  /**
   * サイドバー表示切り替え処理
   */
  const handleSidebarToggle = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ヘッダー */}
      <Header
        user={user}
        onSidebarToggle={handleSidebarToggle}
        currentFile={fileInfo}
        fileMode={mode}
        onModeChange={handleModeChange}
        onSave={handleSave}
        onDownload={handleDownload}
        onDelete={handleDelete}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {/* メインコンテンツエリア */}
      <div className="flex-1 flex overflow-hidden">
        {/* サイドバー */}
        <Sidebar
          currentPath={getParentDirectory(actualFilePath)}
          collapsed={sidebarCollapsed}
          onToggle={handleSidebarToggle}
          user={user}
        />

        {/* ファイルコンテンツエリア */}
        <main className={`flex-1 flex flex-col overflow-hidden ${sidebarCollapsed ? 'ml-0' : 'ml-64'} transition-all duration-300`}>
          {/* ファイル情報ヘッダー */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              {/* ファイル情報 */}
              <div className="flex items-center space-x-4">
                <div className="h-8 w-8 bg-blue-100 rounded flex items-center justify-center">
                  <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">{fileInfo.name}</h1>
                  <p className="text-sm text-gray-600">
                    {fileInfo.size} bytes • 更新: {fileInfo.modifiedAt.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* モード切り替えボタン */}
              <div className="flex items-center space-x-2">
                <div className="bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => handleModeChange('view')}
                    className={`px-3 py-1 text-sm rounded ${
                      mode === 'view' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    表示
                  </button>
                  {isTextFile(fileInfo.extension) && (
                    <button
                      onClick={() => handleModeChange('edit')}
                      className={`px-3 py-1 text-sm rounded ${
                        mode === 'edit' 
                          ? 'bg-white text-gray-900 shadow-sm' 
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      編集
                    </button>
                  )}
                  <button
                    onClick={() => handleModeChange('preview')}
                    className={`px-3 py-1 text-sm rounded ${
                      mode === 'preview' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    プレビュー
                  </button>
                </div>

                {/* 保存状態インジケーター */}
                {hasUnsavedChanges && (
                  <div className="flex items-center space-x-2 text-sm text-orange-600">
                    <div className="h-2 w-2 bg-orange-500 rounded-full"></div>
                    <span>未保存</span>
                  </div>
                )}
                
                {isSaving && (
                  <div className="flex items-center space-x-2 text-sm text-blue-600">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>保存中...</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ファイルコンテンツ */}
          <div className="flex-1 overflow-hidden">
            {mode === 'edit' && isTextFile(fileInfo.extension) ? (
              <FileEditor
                content={fileContent}
                onChange={handleContentChange}
                fileInfo={fileInfo}
                onSave={handleSave}
                isSaving={isSaving}
              />
            ) : mode === 'preview' ? (
              <FilePreview
                content={fileContent}
                fileInfo={fileInfo}
              />
            ) : (
              <div className="h-full overflow-auto p-6 bg-white">
                {isTextFile(fileInfo.extension) ? (
                  <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 bg-gray-50 p-4 rounded border">
                    {fileContent}
                  </pre>
                ) : (
                  <div className="text-center py-12">
                    <div className="mx-auto h-24 w-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <svg className="h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      プレビューできません
                    </h3>
                    <p className="text-gray-600 mb-4">
                      このファイル形式はプレビューに対応していません。
                    </p>
                    <button
                      onClick={handleDownload}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                    >
                      ダウンロード
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* キーボードショートカットヘルプ（開発モード時のみ） */}
      {import.meta.env.VITE_DEBUG_MODE === 'true' && (
        <div className="fixed bottom-4 left-4 bg-black bg-opacity-75 text-white text-xs p-3 rounded max-w-xs">
          <div className="font-semibold mb-2">⌨️ Shortcuts:</div>
          <div>Ctrl+S: 保存</div>
          <div>Ctrl+E: 編集モード</div>
          <div>Ctrl+P: プレビュー</div>
          <div>Esc: 表示モード</div>
        </div>
      )}
    </div>
  );
};

export default FilePage;