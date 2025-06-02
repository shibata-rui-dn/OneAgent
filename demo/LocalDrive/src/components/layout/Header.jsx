import React, { useState, useRef, useCallback } from 'react';
import {
  Search,
  Bell,
  Settings,
  Shield,
  X
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import LogoutButton from '../auth/LogoutButton.jsx';
import { APP_CONFIG } from '../../utils/constants.js';
import { useDashboardActions, useFileState } from '../../contexts/DashboardContext';

/**
 * 簡略化されたヘッダーコンポーネント（v3.0.0対応）
 */
const Header = React.memo(() => {
  const { user } = useAuth();
  const actions = useDashboardActions();
  const { searchQuery } = useFileState();

  // ローカル状態（最小限に限定）
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const searchTimeoutRef = useRef(null);
  const searchInputRef = useRef(null);

  // searchQuery プロパティが変更されたときのみローカル状態を更新
  React.useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  // 検索処理（デバウンス付き）
  const handleSearchChange = useCallback((e) => {
    const query = e.target.value;
    setLocalSearchQuery(query);

    // 既存のタイマーをクリア
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // デバウンス付きリアルタイム検索
    searchTimeoutRef.current = setTimeout(() => {
      actions.setSearchQuery(query);
    }, 300);
  }, [actions]);

  // Enterキーでの検索
  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      actions.setSearchQuery(localSearchQuery);
    }
  }, [actions, localSearchQuery]);

  // 検索のクリア
  const clearSearch = useCallback(() => {
    setLocalSearchQuery('');
    actions.setSearchQuery('');
    searchInputRef.current?.focus();
  }, [actions]);

  // 通知ボタンの切り替え
  const toggleNotifications = useCallback(() => {
    setShowNotifications(prev => !prev);
  }, []);

  // クリックアウトサイド処理
  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (showNotifications && !e.target.closest('.notification-container')) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showNotifications]);

  // クリーンアップ
  React.useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between h-16 px-4">
        {/* 左側：ロゴ */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold text-gray-900">
                {APP_CONFIG.name}
              </h1>
              <p className="text-xs text-gray-500">
                v{APP_CONFIG.version}
              </p>
            </div>
          </div>
        </div>

        {/* 中央：検索バー */}
        <div className="flex-1 max-w-2xl mx-4">
          <div className="relative">
            <div
              className={`
                flex items-center w-full bg-gray-50 rounded-lg border transition-all duration-200
                ${isSearchFocused ? 'border-blue-500 bg-white shadow-md' : 'border-gray-200'}
              `}
            >
              <Search className="w-5 h-5 text-gray-400 ml-3" />
              <input
                ref={searchInputRef}
                type="text"
                value={localSearchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                placeholder="ファイルを検索..."
                className="flex-1 px-3 py-2 bg-transparent border-none outline-none text-gray-900 placeholder-gray-500"
                data-search-input
              />
              {localSearchQuery && (
                <button
                  onClick={clearSearch}
                  className="p-2 text-gray-400 hover:text-gray-600"
                  title="検索をクリア"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <div className="hidden sm:flex items-center px-3 py-1 border-l border-gray-200">
                <kbd className="text-xs text-gray-500 font-mono">Ctrl+F</kbd>
              </div>
            </div>
          </div>
        </div>

        {/* 右側：通知とユーザーメニュー */}
        <div className="flex items-center space-x-2">
          {/* 通知ボタン */}
          <div className="relative notification-container">
            <button
              onClick={toggleNotifications}
              className="inline-flex items-center px-2 py-1 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors duration-200 relative"
              title="通知"
            >
              <Bell className="w-5 h-5" />
              {/* 通知バッジ */}
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            {/* 通知ドロップダウン */}
            {showNotifications && (
              <NotificationDropdown
                onClose={() => setShowNotifications(false)}
              />
            )}
          </div>

          {/* ユーザーメニュー */}
          <UserMenu user={user} />
        </div>
      </div>

      {/* モバイル用検索バー */}
      <div className="lg:hidden border-t border-gray-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={localSearchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="ファイルを検索..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
    </header>
  );
});

/**
 * 通知ドロップダウンコンポーネント
 */
const NotificationDropdown = React.memo(({ onClose }) => {
  const notifications = React.useMemo(() => [
    {
      id: 1,
      type: 'success',
      title: 'ファイルが正常にアップロードされました',
      message: 'document.pdf が正常にアップロードされました。',
      time: '2分前',
      read: false
    },
    {
      id: 2,
      type: 'info',
      title: 'v3.0.0の新機能',
      message: 'お気に入り、最近の更新、ゴミ箱機能が追加されました。',
      time: '1時間前',
      read: false
    }
  ], []);

  return (
    <div className="notification-dropdown absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">通知</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">新しい通知はありません</p>
          </div>
        ) : (
          <div className="py-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${!notification.read ? 'bg-blue-50' : ''
                  }`}
              >
                <div className="flex items-start">
                  <div className={`w-2 h-2 rounded-full mt-2 mr-3 flex-shrink-0 ${notification.type === 'info' ? 'bg-blue-500' :
                      notification.type === 'success' ? 'bg-green-500' : 'bg-gray-500'
                    }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {notification.title}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {notification.message}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {notification.time}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * ユーザーメニューコンポーネント
 */
const UserMenu = React.memo(({ user }) => {
  const { getAvatarUrl } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const avatarUrl = React.useMemo(() => getAvatarUrl(), [getAvatarUrl]);

  const toggleMenu = useCallback(() => {
    setIsOpen(!isOpen);
  }, [isOpen]);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  if (!user) return null;

  return (
    <div className="relative">
      {/* ユーザーアバター */}
      <button
        onClick={toggleMenu}
        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
      >
        <img
          src={avatarUrl || '/default-avatar.png'}
          alt={user?.username || 'User'}
          className="w-8 h-8 rounded-full bg-gray-300"
          onError={(e) => {
            e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.username || 'User')}&background=3b82f6&color=fff&size=32`;
          }}
        />
        <div className="hidden md:block text-left">
          <p className="text-sm font-medium text-gray-900">{user?.username}</p>
          <p className="text-xs text-gray-500">{user?.email}</p>
        </div>
      </button>

      {/* ドロップダウンメニュー */}
      {isOpen && (
        <>
          {/* オーバーレイ */}
          <div
            className="fixed inset-0 z-40"
            onClick={closeMenu}
          />

          {/* メニューコンテンツ */}
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
            <div className="py-2">
              {/* ユーザー情報 */}
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900">{user?.username}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>

              {/* メニューアイテム */}
              <button
                onClick={closeMenu}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
              >
                <Settings className="w-4 h-4 mr-2" />
                設定
              </button>

              <div className="border-t border-gray-100 my-1" />

              <div className="px-4 py-2">
                <LogoutButton
                  variant="ghost"
                  size="sm"
                  showConfirm={true}
                  className="w-full justify-start"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

Header.displayName = 'Header';

export default Header;