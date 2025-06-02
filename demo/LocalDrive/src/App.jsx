import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FilePage from './pages/FilePage';
import SettingsPage from './pages/SettingsPage';
import AuthCallback from './components/auth/AuthCallback';
import Loading from './components/common/Loading';
import ErrorBoundary from './components/common/ErrorBoundary';
import { AuthProvider, useAuthContext } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { DashboardProvider } from './contexts/DashboardContext';
import { ROUTES } from './utils/constants';
import './index.css';

/**
 * メインアプリケーションコンポーネント（簡素化版）
 */
function AppContent() {
  const { user, isAuthenticated, isLoading, isInitialized, error } = useAuthContext();

  // 初期化完了まで待機
  if (!isInitialized || isLoading) {
    return (
      <Loading 
        message="アプリケーションを起動中..."
        variant="branded"
      />
    );
  }

  // 認証エラーの表示
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              認証エラー
            </h1>
            <p className="text-gray-600 mb-4">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              再試行
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app min-h-screen bg-gray-50">
      <Routes>
        {/* 公開ルート */}
        <Route 
          path={ROUTES.LOGIN}
          element={
            isAuthenticated ? (
              <Navigate to={ROUTES.DASHBOARD} replace />
            ) : (
              <LoginPage />
            )
          } 
        />
        
        <Route 
          path={ROUTES.AUTH_CALLBACK}
          element={<AuthCallback />} 
        />
        
        {/* 保護されたルート */}
        <Route 
          path={ROUTES.DASHBOARD}
          element={
            isAuthenticated ? (
              <DashboardPage />
            ) : (
              <Navigate to={ROUTES.LOGIN} replace />
            )
          } 
        />
        
        <Route 
          path={ROUTES.FILES}
          element={
            isAuthenticated ? (
              <FilePage />
            ) : (
              <Navigate to={ROUTES.LOGIN} replace />
            )
          } 
        />
        
        <Route 
          path={ROUTES.SETTINGS}
          element={
            isAuthenticated ? (
              <SettingsPage />
            ) : (
              <Navigate to={ROUTES.LOGIN} replace />
            )
          } 
        />
        
        {/* デフォルトルート */}
        <Route 
          path="/"
          element={
            <Navigate 
              to={isAuthenticated ? ROUTES.DASHBOARD : ROUTES.LOGIN} 
              replace 
            />
          } 
        />
        
        {/* 404処理 */}
        <Route 
          path="*"
          element={
            <Navigate 
              to={isAuthenticated ? ROUTES.DASHBOARD : ROUTES.LOGIN} 
              replace 
            />
          } 
        />
      </Routes>
    </div>
  );
}

/**
 * ルートアプリケーションコンポーネント
 */
function App() {
  // グローバルエラーハンドリング
  useEffect(() => {
    const handleError = (event) => {
      console.error('🚨 Global Error:', event.error);
    };

    const handleRejection = (event) => {
      console.error('🚨 Unhandled Promise Rejection:', event.reason);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return (
    <ErrorBoundary>
        <Router>
          <DashboardProvider>
          <AuthProvider>
            <NotificationProvider>
              <AppContent />
            </NotificationProvider>
          </AuthProvider>
          </DashboardProvider>
        </Router>
    </ErrorBoundary>
  );
}

export default App;