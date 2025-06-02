import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { defaultQuotaInfo, formatFileSize } from '../types/file';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';
import LoadingScreen from '../components/common/LoadingScreen';

/**
 * 設定画面コンポーネント
 * ユーザー情報、容量管理、アプリケーション設定
 */
const SettingsPage = () => {
  const { isAuthenticated, user, logout, isLoading, getAvatarUrl } = useAuth();
  const navigate = useNavigate();
  
  const [quotaInfo, setQuotaInfo] = useState(defaultQuotaInfo);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'storage' | 'security' | 'about'
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // 設定情報の読み込み
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setPageLoading(true);
        
        // 容量情報の取得
        // 実際の実装では、fileService.getQuotaInfo() を呼び出す
        const mockQuotaInfo = {
          ...defaultQuotaInfo,
          used: 157286400, // 150MB
          fileCount: 247,
          userId: user?.id,
          lastCalculated: new Date()
        };
        mockQuotaInfo.available = mockQuotaInfo.total - mockQuotaInfo.used;
        mockQuotaInfo.usagePercent = Math.round((mockQuotaInfo.used / mockQuotaInfo.total) * 100);
        
        setQuotaInfo(mockQuotaInfo);
        
        console.log('⚙️ Settings loaded for user:', user?.username);
      } catch (error) {
        console.error('Settings load error:', error);
      } finally {
        setPageLoading(false);
      }
    };

    if (isAuthenticated && user) {
      loadSettings();
    }
  }, [isAuthenticated, user]);

  // ローディング中の表示
  if (isLoading || pageLoading) {
    return <LoadingScreen />;
  }

  // 未認証の場合は何も表示しない（App.jsでリダイレクト処理される）
  if (!isAuthenticated) {
    return null;
  }

  /**
   * ログアウト処理
   */
  const handleLogout = async () => {
    const confirmed = window.confirm('ログアウトしますか？');
    if (!confirmed) return;

    try {
      setIsLoggingOut(true);
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      // エラーが発生してもログアウト画面に遷移
      navigate('/login');
    }
  };

  /**
   * サイドバー表示切り替え処理
   */
  const handleSidebarToggle = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  /**
   * キャッシュクリア処理
   */
  const handleClearCache = () => {
    try {
      localStorage.removeItem('file_cache');
      sessionStorage.clear();
      alert('キャッシュをクリアしました。');
    } catch (error) {
      console.error('Cache clear error:', error);
      alert('キャッシュのクリアに失敗しました。');
    }
  };

  /**
   * データエクスポート処理
   */
  const handleExportData = async () => {
    try {
      // 実際の実装では、fileService.exportUserData() を呼び出す
      const exportData = {
        user: user,
        quotaInfo: quotaInfo,
        exportDate: new Date().toISOString(),
        version: '1.0.0'
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${user.username}_data_export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('📤 User data exported');
    } catch (error) {
      console.error('Export error:', error);
      alert('データのエクスポートに失敗しました。');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ヘッダー */}
      <Header
        user={user}
        onSidebarToggle={handleSidebarToggle}
        currentPage="settings"
      />

      {/* メインコンテンツエリア */}
      <div className="flex-1 flex overflow-hidden">
        {/* サイドバー */}
        <Sidebar
          currentPath=""
          collapsed={sidebarCollapsed}
          onToggle={handleSidebarToggle}
          user={user}
          activePage="settings"
        />

        {/* 設定コンテンツエリア */}
        <main className={`flex-1 flex flex-col overflow-hidden ${sidebarCollapsed ? 'ml-0' : 'ml-64'} transition-all duration-300`}>
          {/* 設定ヘッダー */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">設定</h1>
                <p className="text-sm text-gray-600">アカウント情報とアプリケーション設定</p>
              </div>
            </div>
          </div>

          {/* タブナビゲーション */}
          <div className="bg-white border-b border-gray-200">
            <nav className="px-6">
              <div className="flex space-x-8">
                {[
                  { id: 'profile', name: 'プロフィール', icon: 'user' },
                  { id: 'storage', name: 'ストレージ', icon: 'database' },
                  { id: 'security', name: 'セキュリティ', icon: 'shield' },
                  { id: 'about', name: 'アプリについて', icon: 'info' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {tab.icon === 'user' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />}
                      {tab.icon === 'database' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />}
                      {tab.icon === 'shield' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />}
                      {tab.icon === 'info' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
                    </svg>
                    <span>{tab.name}</span>
                  </button>
                ))}
              </div>
            </nav>
          </div>

          {/* 設定コンテンツ */}
          <div className="flex-1 overflow-auto p-6">
            {/* プロフィールタブ */}
            {activeTab === 'profile' && (
              <div className="max-w-4xl">
                <div className="bg-white rounded-lg shadow p-6 mb-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">ユーザー情報</h2>
                  
                  <div className="flex items-center space-x-6 mb-6">
                    <div className="h-24 w-24 bg-gray-200 rounded-full flex items-center justify-center">
                      {getAvatarUrl ? (
                        <img
                          src={getAvatarUrl()}
                          alt="Avatar"
                          className="h-24 w-24 rounded-full"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div className="h-24 w-24 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-2xl font-medium text-blue-600">
                          {user?.username?.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="text-xl font-medium text-gray-900">{user?.name || user?.username}</h3>
                      <p className="text-gray-600">{user?.email}</p>
                      <p className="text-sm text-gray-500 mt-1">ID: {user?.id}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">ユーザー名</label>
                      <input
                        type="text"
                        value={user?.username || ''}
                        disabled
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">メールアドレス</label>
                      <input
                        type="email"
                        value={user?.email || ''}
                        disabled
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-500"
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {isLoggingOut ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>ログアウト中...</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          <span>ログアウト</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ストレージタブ */}
            {activeTab === 'storage' && (
              <div className="max-w-4xl">
                <div className="bg-white rounded-lg shadow p-6 mb-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">ストレージ使用状況</h2>
                  
                  {/* 容量使用状況バー */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        使用容量: {formatFileSize(quotaInfo.used)} / {formatFileSize(quotaInfo.total)}
                      </span>
                      <span className="text-sm text-gray-500">{quotaInfo.usagePercent}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full ${
                          quotaInfo.usagePercent > 90 ? 'bg-red-500' :
                          quotaInfo.usagePercent > 75 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${quotaInfo.usagePercent}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* 詳細統計 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">{quotaInfo.fileCount}</div>
                      <div className="text-sm text-gray-600">ファイル数</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{formatFileSize(quotaInfo.available)}</div>
                      <div className="text-sm text-gray-600">利用可能</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{formatFileSize(quotaInfo.maxFileSize)}</div>
                      <div className="text-sm text-gray-600">最大ファイルサイズ</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">{quotaInfo.maxFiles}</div>
                      <div className="text-sm text-gray-600">最大ファイル数</div>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500">
                    最終更新: {quotaInfo.lastCalculated.toLocaleString()}
                  </div>
                </div>
              </div>
            )}

            {/* セキュリティタブ */}
            {activeTab === 'security' && (
              <div className="max-w-4xl">
                <div className="bg-white rounded-lg shadow p-6 mb-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">セキュリティ設定</h2>
                  
                  <div className="space-y-6">
                    {/* OAuth認証情報 */}
                    <div>
                      <h3 className="text-md font-medium text-gray-900 mb-2">認証情報</h3>
                      <div className="bg-green-50 border border-green-200 rounded-md p-4">
                        <div className="flex items-center">
                          <svg className="h-5 w-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm text-green-800">OAuth 2.0で認証済み</span>
                        </div>
                        <div className="mt-2 text-xs text-green-700">
                          権限: {user?.scopes?.join(', ') || 'N/A'}
                        </div>
                      </div>
                    </div>

                    {/* データ管理 */}
                    <div>
                      <h3 className="text-md font-medium text-gray-900 mb-2">データ管理</h3>
                      <div className="space-y-3">
                        <button
                          onClick={handleExportData}
                          className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          ユーザーデータをエクスポート
                        </button>
                        <button
                          onClick={handleClearCache}
                          className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          キャッシュをクリア
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* アプリについてタブ */}
            {activeTab === 'about' && (
              <div className="max-w-4xl">
                <div className="bg-white rounded-lg shadow p-6 mb-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">アプリケーション情報</h2>
                  
                  <div className="space-y-6">
                    {/* アプリ情報 */}
                    <div className="text-center">
                      <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">OneDrive風ファイル管理</h3>
                      <p className="text-gray-600 mb-4">セキュアなファイル管理システム</p>
                      <div className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                        Version 1.0.0
                      </div>
                    </div>

                    {/* 技術情報 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">フロントエンド</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• React 18</li>
                          <li>• Tailwind CSS</li>
                          <li>• Vite</li>
                          <li>• React Router</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">バックエンド</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• OneAgent Server</li>
                          <li>• OAuth 2.0</li>
                          <li>• Secure File Manager</li>
                          <li>• Node.js</li>
                        </ul>
                      </div>
                    </div>

                    {/* 制限事項 */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">制限事項</h4>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• 最大容量: 1GB/ユーザー</li>
                          <li>• 最大ファイルサイズ: 50MB/ファイル</li>
                          <li>• 最大ファイル数: 10,000ファイル/ユーザー</li>
                          <li>• 最大フォルダ階層: 15階層</li>
                          <li>• 実行可能ファイル: 実行権限制限あり</li>
                        </ul>
                      </div>
                    </div>

                    {/* ライセンス */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">ライセンス</h4>
                      <p className="text-sm text-gray-600">
                        このアプリケーションはOneAgentプロジェクトの一部として開発されています。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default SettingsPage;