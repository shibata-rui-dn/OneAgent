import React, { memo } from 'react';
import { Plus, Settings, X } from 'lucide-react';
import { useIconBarIsolated, useSettingsButtonIsolated } from './IsolatedContexts';

// 設定ボタンを独立したコンポーネントとして分離
const SettingsButton = memo(() => {
  const { setShowSettings } = useSettingsButtonIsolated();

  // デバッグ用ログ
  console.log('SettingsButton rendering (ISOLATED)', { 
    timestamp: Date.now()
  });

  return (
    <button
      onClick={() => setShowSettings(true)}
      className="w-12 h-12 bg-gray-700 rounded-xl flex items-center justify-center hover:bg-gray-600 transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-105"
      title="AI設定"
    >
      <Settings size={20} className="text-gray-300" />
    </button>
  );
}, (prevProps, nextProps) => {
  // SettingsButtonはpropsを受け取らないので、常にtrueを返して再レンダリングを防ぐ
  return true;
});

const IconBar = memo(() => {
  const { 
    pages, 
    currentPageId, 
    createNewPage, 
    deletePage, 
    getAnimalEmoji,
    dispatch
  } = useIconBarIsolated(); // 設定関連を除外

  // デバッグ用ログ
  console.log('IconBar rendering (SETTINGS-ISOLATED)', { 
    pageCount: pages?.length,
    currentPageId,
    timestamp: Date.now()
  });

  return (
    <div className="w-16 bg-gradient-to-b from-gray-900 to-gray-800 flex flex-col items-center py-4 space-y-3 shadow-lg">
      {/* ページ作成ボタン */}
      <button
        onClick={createNewPage}
        className="w-12 h-12 bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl flex items-center justify-center hover:from-blue-700 hover:to-blue-600 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
        title="新しいページを作成"
      >
        <Plus size={22} className="text-white" />
      </button>

      {/* ページアイコン */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {pages?.map((page) => (
          <div key={page.id} className="relative group">
            <button
              onClick={() => dispatch({ type: 'SET_CURRENT_PAGE', payload: page.id })}
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-105 ${
                currentPageId === page.id
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title={page.name}
            >
              <span className="text-xl">{getAnimalEmoji(page.name)}</span>
            </button>

            {/* ページ削除ボタン */}
            {pages.length > 1 && (
              <button
                onClick={() => deletePage(page.id)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full items-center justify-center hidden group-hover:flex hover:bg-red-600 shadow-md transition-all duration-200"
                title="ページを削除"
              >
                <X size={12} className="text-white" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 設定ボタン（独立したコンポーネント） */}
      <SettingsButton />
    </div>
  );
}, (prevProps, nextProps) => {
  // IconBar用のカスタム比較関数
  // propsが変わらない限り再レンダリングしない
  return true; // このコンポーネントはpropsを受け取らないので常にtrueを返す
});

SettingsButton.displayName = 'SettingsButton';
IconBar.displayName = 'IconBar';

export default IconBar;