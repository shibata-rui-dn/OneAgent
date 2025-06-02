import React, { useState } from 'react'
import { LogOut, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth.js'

/**
 * ログアウトボタンコンポーネント
 * @param {object} props - プロパティ
 * @param {string} props.size - ボタンサイズ ('sm', 'md', 'lg')
 * @param {string} props.variant - ボタンバリアント ('primary', 'secondary', 'ghost', 'danger')
 * @param {string} props.className - 追加のCSSクラス
 * @param {boolean} props.showIcon - アイコンを表示するかどうか
 * @param {boolean} props.showConfirm - 確認ダイアログを表示するかどうか
 * @param {string} props.text - ボタンテキスト
 * @returns {JSX.Element} ログアウトボタン
 */
const LogoutButton = ({ 
  size = 'md', 
  variant = 'ghost', 
  className = '', 
  showIcon = true,
  showConfirm = false,
  text = 'ログアウト'
}) => {
  const { logout, isLoading } = useAuth()
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  }
  
  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger'
  }
  
  const handleLogout = () => {
    if (showConfirm) {
      setShowConfirmDialog(true)
    } else {
      logout()
    }
  }
  
  const confirmLogout = () => {
    setShowConfirmDialog(false)
    logout()
  }
  
  const cancelLogout = () => {
    setShowConfirmDialog(false)
  }
  
  return (
    <>
      <button
        onClick={handleLogout}
        disabled={isLoading}
        className={`
          btn
          ${sizeClasses[size]}
          ${variantClasses[variant]}
          ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
          ${className}
        `}
        title="ログアウト"
      >
        {isLoading ? (
          <>
            <div className="loading-spinner w-4 h-4 mr-2" />
            ログアウト中...
          </>
        ) : (
          <>
            {showIcon && <LogOut className="w-4 h-4 mr-2" />}
            {text}
          </>
        )}
      </button>
      
      {/* 確認ダイアログ */}
      {showConfirmDialog && (
        <LogoutConfirmDialog 
          onConfirm={confirmLogout}
          onCancel={cancelLogout}
        />
      )}
    </>
  )
}

/**
 * ログアウト確認ダイアログコンポーネント
 * @param {object} props - プロパティ
 * @param {Function} props.onConfirm - 確認時のコールバック
 * @param {Function} props.onCancel - キャンセル時のコールバック
 * @returns {JSX.Element} 確認ダイアログ
 */
const LogoutConfirmDialog = ({ onConfirm, onCancel }) => {
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="p-6">
          {/* アイコンとヘッダー */}
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center mr-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">
              ログアウトの確認
            </h3>
          </div>
          
          {/* メッセージ */}
          <p className="text-gray-600 mb-6">
            ログアウトしますか？未保存の変更がある場合は失われる可能性があります。
          </p>
          
          {/* ボタン */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={onCancel}
              className="btn-secondary"
            >
              キャンセル
            </button>
            <button
              onClick={onConfirm}
              className="btn-danger"
            >
              <LogOut className="w-4 h-4 mr-2" />
              ログアウト
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * ユーザーメニューコンポーネント
 */
export const UserMenu = () => {
  const { user, getAvatarUrl } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  
  if (!user) return null
  
  const avatarUrl = getAvatarUrl()
  
  return (
    <div className="relative">
      {/* ユーザーアバター */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
      >
        <img
          src={avatarUrl || '/default-avatar.png'}
          alt={user.username}
          className="w-8 h-8 rounded-full bg-gray-300"
          onError={(e) => {
            e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=3b82f6&color=fff&size=32`
          }}
        />
        <div className="hidden md:block text-left">
          <p className="text-sm font-medium text-gray-900">{user.username}</p>
          <p className="text-xs text-gray-500">{user.email}</p>
        </div>
      </button>
      
      {/* ドロップダウンメニュー */}
      {isOpen && (
        <>
          {/* オーバーレイ */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* メニューコンテンツ */}
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-strong border border-gray-200 z-50">
            <div className="py-2">
              {/* ユーザー情報 */}
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900">{user.username}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
              
              {/* メニューアイテム */}
              <button
                onClick={() => {
                  setIsOpen(false)
                  // 設定ページへのナビゲーション（後で実装）
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
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
  )
}

export default LogoutButton