import React, { useEffect } from 'react';
import { Loader, Bot } from 'lucide-react';
import { AppProvider, useApp } from './AppContext';
import { IsolatedProviders } from './IsolatedContexts';
import IconBar from './IconBar';
import ToolPalette from './ToolPalette';
import ChatArea from './ChatArea';
import SettingsModal from './SettingsModal.jsx';

const AppContent = () => {
  const appContext = useApp();
  const { 
    isInitialized, 
    currentPage, 
    pages,
    tools,
    createNewPage,
    initializeApp,
    dispatch
  } = appContext;

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  // 初期化完了後とツール読み込み後にツール選択を更新（初回のみ）
  useEffect(() => {
    if (isInitialized && tools.length > 0) {
      const updatedPages = (pages || []).map(page => {
        // selectedToolsが空で、かつページが新規作成されたばかりの場合のみ全ツールを選択
        // メッセージが0個の場合は新規ページとみなす
        if (page.selectedTools.size === 0 && page.messages.length === 0) {
          console.log('Auto-selecting all tools for new page:', page.id);
          return {
            ...page,
            selectedTools: new Set(tools.map(t => t.name))
          };
        }
        return page;
      });
      
      // 実際に変更があった場合のみ更新
      const hasChanges = updatedPages.some((page, index) => 
        page.selectedTools.size !== (pages || [])[index]?.selectedTools.size
      );
      
      if (hasChanges) {
        dispatch({ type: 'SET_PAGES', payload: updatedPages });
      }
    }
  }, [isInitialized, tools]); // pagesとdispatchを依存関係から除外して無限ループを防ぐ

  // ローディング状態
  if (!isInitialized) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <div className="text-center">
          <Loader size={48} className="mx-auto mb-4 text-blue-500 animate-spin" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">初期化中...</h2>
          <p className="text-gray-500">サーバーに接続しています</p>
        </div>
      </div>
    );
  }

  return (
    <IsolatedProviders>
      <div className="flex h-screen bg-gray-50 w-full">
        {/* アイコンバー */}
        <IconBar />

        {/* メインコンテンツ */}
        {currentPage ? (
          <>
            {/* ツールパレット */}
            <ToolPalette />

            {/* チャットエリア */}
            <ChatArea />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <div className="w-32 h-32 mx-auto mb-6 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
                <Bot size={64} className="text-blue-500" />
              </div>
              <h2 className="text-2xl font-bold mb-4">ページがありません</h2>
              <p className="text-gray-400 mb-6">新しいページを作成して会話を始めましょう</p>
              <button
                onClick={createNewPage}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg transform hover:scale-105 font-medium"
              >
                新しいページを作成
              </button>
            </div>
          </div>
        )}

        {/* 設定モーダル */}
        <SettingsModal />
      </div>
    </IsolatedProviders>
  );
};

const MultiPageAgentChat = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default MultiPageAgentChat;