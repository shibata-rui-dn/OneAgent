import React, { useState, useEffect, useContext, createContext } from 'react';

// OAuth 2.0設定
// OAuth 2.0設定（絶対URL版）
const OAUTH_CONFIG = {
    CLIENT_ID: 'oneagent-default-client',
    REDIRECT_URI: 'http://localhost:3000/oauth/callback', // サーバー側のコールバック
    SCOPES: ['read', 'write'],
    // ★ 絶対URLでサーバーを指定
    AUTHORIZATION_URL: 'http://localhost:3000/oauth/authorize',
    TOKEN_URL: 'http://localhost:3000/oauth/token',
    USERINFO_URL: 'http://localhost:3000/oauth/userinfo',
    REVOKE_URL: 'http://localhost:3000/oauth/revoke'
};

// 認証コンテキスト
const AuthContext = createContext();

/**
 * OAuth 2.0 クライアント管理
 */
class OAuthClient {
    constructor() {
        this.accessToken = localStorage.getItem('access_token');
        this.refreshToken = localStorage.getItem('refresh_token');
        this.user = null;
    }

    // PKCE (Proof Key for Code Exchange) 実装
    generateCodeVerifier() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return btoa(String.fromCharCode.apply(null, array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    async generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    // 認可URLを生成
    async getAuthorizationUrl() {
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);

        // PKCEパラメータを保存
        sessionStorage.setItem('code_verifier', codeVerifier);

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: OAUTH_CONFIG.CLIENT_ID,
            redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
            scope: OAUTH_CONFIG.SCOPES.join(' '),
            state: crypto.randomUUID(),
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });

        return `${OAUTH_CONFIG.AUTHORIZATION_URL}?${params}`;
    }

    // 認可コードを交換してトークンを取得
    async exchangeCodeForToken(code, state) {
        const codeVerifier = sessionStorage.getItem('code_verifier');
        if (!codeVerifier) {
            throw new Error('Code verifier not found');
        }

        const response = await fetch(OAUTH_CONFIG.TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
                client_id: OAUTH_CONFIG.CLIENT_ID,
                client_secret: '', // 公開クライアントの場合は空
                code_verifier: codeVerifier
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error_description || error.error);
        }

        const tokens = await response.json();
        this.setTokens(tokens);
        sessionStorage.removeItem('code_verifier');

        return tokens;
    }

    // トークンを保存
    setTokens(tokens) {
        this.accessToken = tokens.access_token;
        this.refreshToken = tokens.refresh_token;

        localStorage.setItem('access_token', tokens.access_token);
        if (tokens.refresh_token) {
            localStorage.setItem('refresh_token', tokens.refresh_token);
        }
    }

    // ユーザー情報を取得
    async getUserInfo() {
        if (!this.accessToken) {
            return null;
        }

        try {
            const response = await fetch(OAUTH_CONFIG.USERINFO_URL, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    await this.refreshAccessToken();
                    return this.getUserInfo(); // リトライ
                }
                throw new Error('Failed to get user info');
            }

            this.user = await response.json();
            return this.user;
        } catch (error) {
            console.error('Error getting user info:', error);
            this.logout();
            return null;
        }
    }

    // アクセストークンをリフレッシュ
    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const response = await fetch(OAUTH_CONFIG.TOKEN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken,
                    client_id: OAUTH_CONFIG.CLIENT_ID,
                    client_secret: ''
                })
            });

            if (!response.ok) {
                throw new Error('Failed to refresh token');
            }

            const tokens = await response.json();
            this.setTokens(tokens);
            return tokens.access_token;
        } catch (error) {
            console.error('Error refreshing token:', error);
            this.logout();
            throw error;
        }
    }

    // 認証APIリクエスト
    async authenticatedRequest(url, options = {}) {
        if (!this.accessToken) {
            throw new Error('No access token available');
        }

        const headers = {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            if (response.status === 401) {
                // トークンが期限切れの場合、リフレッシュを試行
                await this.refreshAccessToken();
                return fetch(url, {
                    ...options,
                    headers: {
                        ...headers,
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                });
            }

            return response;
        } catch (error) {
            console.error('Authenticated request error:', error);
            throw error;
        }
    }

    // ログアウト
    async logout() {
        if (this.accessToken) {
            try {
                await fetch(OAUTH_CONFIG.REVOKE_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        token: this.accessToken
                    })
                });
            } catch (error) {
                console.error('Error revoking token:', error);
            }
        }

        this.accessToken = null;
        this.refreshToken = null;
        this.user = null;

        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
    }

    // 認証状態をチェック
    isAuthenticated() {
        return !!this.accessToken;
    }
}

/**
 * 認証プロバイダーコンポーネント
 */
export function AuthProvider({ children }) {
    const [authClient] = useState(() => new OAuthClient());
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        initializeAuth();
    }, []);

    const initializeAuth = async () => {
        try {
            // URLからコールバックパラメータをチェック
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            const state = urlParams.get('state');
            const error = urlParams.get('error');

            if (error) {
                console.error('OAuth error:', error);
                setIsLoading(false);
                return;
            }

            if (code && state) {
                // 認可コードを交換
                await authClient.exchangeCodeForToken(code, state);

                // URLをクリーンアップ
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            // ユーザー情報を取得
            if (authClient.isAuthenticated()) {
                const userInfo = await authClient.getUserInfo();
                if (userInfo) {
                    setUser(userInfo);
                    setIsAuthenticated(true);
                }
            }
        } catch (error) {
            console.error('Auth initialization error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const login = async () => {
        try {
            const authUrl = await authClient.getAuthorizationUrl();
            window.location.href = authUrl;
        } catch (error) {
            console.error('Login error:', error);
        }
    };

    const logout = async () => {
        try {
            await authClient.logout();
            setUser(null);
            setIsAuthenticated(false);
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const authenticatedFetch = async (url, options = {}) => {
        // 相対URLの場合は絶対URLに変換
        const fullUrl = url.startsWith('http') ? url : `http://localhost:3000${url}`;
        return authClient.authenticatedRequest(fullUrl, options);
    };

    const value = {
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
        authenticatedFetch,
        authClient
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * 認証フックの使用
 */
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

/**
 * ログインコンポーネント
 */
export function LoginComponent() {
    const { login, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">認証状態を確認中...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
            <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">🤖 OneAgent</h1>
                    <p className="text-gray-600">セキュアなAIエージェントプラットフォーム</p>
                </div>

                <button
                    onClick={login}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>セキュアログイン</span>
                </button>

                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-semibold text-gray-800 mb-2">デモアカウント</h3>
                    <div className="text-sm text-gray-600 space-y-1">
                        <p><strong>管理者:</strong> admin / admin123</p>
                        <p><strong>一般ユーザー:</strong> demo / demo123</p>
                    </div>
                </div>

                <div className="mt-6 text-center">
                    <p className="text-xs text-gray-500">
                        OAuth 2.0 + PKCE による安全な認証
                    </p>
                </div>
            </div>
        </div>
    );
}

/**
 * ユーザー情報コンポーネント
 */
export function UserProfile({ onLogout }) {
    const { user, logout } = useAuth();

    const handleLogout = async () => {
        await logout();
        if (onLogout) onLogout();
    };

    if (!user) return null;

    return (
        <div className="flex items-center space-x-3 p-3 bg-white rounded-lg shadow-sm border">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-sm">
                    {user.profile?.displayName?.charAt(0) || user.username.charAt(0).toUpperCase()}
                </span>
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                    {user.profile?.displayName || user.username}
                </p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>

            <button
                onClick={handleLogout}
                className="text-gray-400 hover:text-red-500 transition-colors duration-200"
                title="ログアウト"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
            </button>
        </div>
    );
}

/**
 * セキュアファイル管理ツール統合コンポーネント
 */
export function SecureFileManager() {
    const { authenticatedFetch, user } = useAuth();
    const [files, setFiles] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (user) {
            loadFiles();
        }
    }, [user, currentPath]);

    const loadFiles = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await authenticatedFetch('/agent', {
                method: 'POST',
                body: JSON.stringify({
                    query: `現在のディレクトリのファイル一覧を表示してください: ${currentPath || '/'}`,
                    tools: ['secure_file_manager'],
                    streaming: false
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            // ファイル一覧をパースして状態を更新
            // 実際の実装では、レスポンスフォーマットに応じて調整
            console.log('File list result:', result);

        } catch (err) {
            setError(`ファイル読み込みエラー: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const createFile = async (filename, content) => {
        try {
            const response = await authenticatedFetch('/agent', {
                method: 'POST',
                body: JSON.stringify({
                    query: `ファイル「${filename}」を作成し、内容を「${content}」として保存してください`,
                    tools: ['secure_file_manager'],
                    streaming: false
                })
            });

            if (response.ok) {
                await loadFiles(); // リロード
            }
        } catch (err) {
            setError(`ファイル作成エラー: ${err.message}`);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    📁 セキュアファイル管理
                </h2>
                <p className="text-gray-600">
                    認証済みユーザー: {user?.username} のファイル
                </p>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-800">{error}</p>
                </div>
            )}

            <div className="bg-white rounded-lg shadow border">
                <div className="p-4 border-b">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">
                            パス: /{currentPath}
                        </span>
                        <button
                            onClick={loadFiles}
                            disabled={loading}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? '読み込み中...' : '更新'}
                        </button>
                    </div>
                </div>

                <div className="p-4">
                    {loading ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-600">ファイルを読み込み中...</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-gray-600">
                                セキュアファイル管理ツールが利用可能です。
                                チャットでファイル操作の指示を出してください。
                            </p>
                            <div className="text-sm text-gray-500">
                                例: "readme.txtファイルを作成して、プロジェクトの説明を書いてください"
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * 保護されたルートコンポーネント
 */
export function ProtectedRoute({ children }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">認証状態を確認中...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <LoginComponent />;
    }

    return children;
}