import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Loading from '../common/Loading';
import { ROUTES, ERROR_MESSAGES } from '../../utils/constants';

/**
 * OAuth認証コールバックコンポーネント（最適化版）
 * 不要な再レンダリングを最小限に抑制
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { handleAuthCallback, isAuthenticated, user } = useAuth();
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState(null);
  
  // 重複実行防止
  const isProcessingRef = useRef(false);
  const hasProcessedRef = useRef(false);

  // URLパラメータをメモ化して不要な再計算を防ぐ
  const authParams = useMemo(() => ({
    code: searchParams.get('code'),
    state: searchParams.get('state'),
    error: searchParams.get('error')
  }), [searchParams]);

  // 認証済み状態の早期チェック
  useEffect(() => {
    if (isAuthenticated && user && !hasProcessedRef.current) {
      console.log('✅ Already authenticated, immediate redirect');
      hasProcessedRef.current = true;
      setStatus('success');
      navigate(ROUTES.DASHBOARD, { replace: true });
      return;
    }
  }, [isAuthenticated, user, navigate]);

  // OAuth認証処理（パラメータ変化時のみ実行）
  useEffect(() => {
    const processAuth = async () => {
      // 重複実行防止
      if (isProcessingRef.current || hasProcessedRef.current) {
        return;
      }

      // パラメータチェック
      if (!authParams.code && !authParams.error) {
        navigate(ROUTES.LOGIN, { replace: true });
        return;
      }

      isProcessingRef.current = true;
      console.log('🔄 Processing OAuth callback...');

      try {
        if (authParams.error) {
          throw new Error(authParams.error);
        }

        if (!authParams.code || !authParams.state) {
          throw new Error('認証パラメータが不足しています');
        }

        const userInfo = await handleAuthCallback(authParams.code, authParams.state);
        
        if (userInfo) {
          console.log('✅ Auth success:', userInfo.username);
          hasProcessedRef.current = true;
          setStatus('success');
          
          setTimeout(() => {
            navigate(ROUTES.DASHBOARD, { replace: true });
          }, 500);
        }

      } catch (authError) {
        console.error('❌ Auth failed:', authError);
        hasProcessedRef.current = true;
        setError(authError.message);
        setStatus('error');

        setTimeout(() => {
          navigate(ROUTES.LOGIN, { replace: true });
        }, 3000);
      } finally {
        isProcessingRef.current = false;
      }
    };

    processAuth();
  }, [authParams.code, authParams.state, authParams.error, handleAuthCallback, navigate]);
  // ↑ 具体的なパラメータ値のみに依存

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col justify-center">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-xl sm:px-10">

          {status === 'processing' && (
            <div className="text-center">
              <div className="mb-6">
                <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-spin border-t-blue-600 mx-auto"></div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                認証を処理しています
              </h2>
              <p className="text-gray-600">
                しばらくお待ちください...
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              <div className="mx-auto h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                ログイン成功
              </h2>
              <p className="text-gray-600">
                ダッシュボードに移動しています...
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <div className="mx-auto h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
                <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                認証エラー
              </h2>
              <p className="text-gray-600 mb-4">
                {error || '認証に失敗しました'}
              </p>
              <p className="mt-4 text-xs text-gray-500">
                3秒後に自動的にログインページに戻ります
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default React.memo(AuthCallback); // React.memoで不要な再レンダリングを防ぐ