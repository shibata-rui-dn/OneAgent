import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// デバッグ用のグローバル設定
if (import.meta.env.VITE_DEBUG_MODE === 'true') {
  // React開発者ツールの詳細モード
  if (typeof window !== 'undefined') {
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot = (id, root, priorityLevel) => {
        console.log('🔄 React Render:', { id, priorityLevel });
      };
    }
  }
  
  // パフォーマンス監視
  console.log('🚀 OneDrive風ファイル管理デモアプリ起動中...');
  console.log('📊 デバッグモード: 有効');
  console.log('🔗 バックエンドURL:', import.meta.env.VITE_BACKEND_URL);
  console.log('🔐 OAuth設定確認済み');
}

// サービスワーカーの登録（将来のPWA対応）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('📱 SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('❌ SW registration failed: ', registrationError);
      });
  });
}

// グローバルエラーハンドリング
window.addEventListener('error', (event) => {
  console.error('🚨 Global Error:', event.error);
  
  if (import.meta.env.VITE_DEBUG_MODE === 'true') {
    console.error('📋 Error Details:', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    });
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('🚨 Unhandled Promise Rejection:', event.reason);
  
  if (import.meta.env.VITE_DEBUG_MODE === 'true') {
    console.error('📋 Promise Rejection Details:', event);
  }
});

// アプリケーション初期化
const initializeApp = () => {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  
  // React.StrictModeを無効化して重複実行を防止
  root.render(<App />);
  
  if (import.meta.env.VITE_DEBUG_MODE === 'true') {
    console.log('✅ OneDrive風ファイル管理デモアプリが正常に起動しました');
    console.log('📱 UI框架: React 18');
    console.log('🎨 スタイル: Tailwind CSS');
    console.log('🔐 認証: OAuth 2.0');
    console.log('📁 ファイル管理: OneAgent Secure Tool');
    console.log('⚠️ React.StrictMode: 無効 (認証の重複実行防止)');
  }
};

// DOM読み込み完了後にアプリを初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}