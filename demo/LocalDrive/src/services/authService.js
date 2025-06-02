import apiClient from './apiClient.js'
import { OAUTH_CONFIG, STORAGE_KEYS, ERROR_MESSAGES, TOOL_NAME } from '../utils/constants.js'

/**
 * 認証サービス（簡素化版）
 */
export class AuthService {
    constructor() {
        this.currentUser = null
        this.isAuthenticated = false
        this.authCallbacks = new Set()

        // 初期化時にローカルストレージから認証情報を復元
        this.restoreAuthState()
    }

    /**
     * OAuth認証URLを生成
     * @returns {string} 認証URL
     */
    getAuthUrl() {
        const state = this.generateState()
        sessionStorage.setItem('oauth_state', state)

        console.log('🔐 Generating auth URL with state:', state);

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: OAUTH_CONFIG.clientId,
            redirect_uri: OAUTH_CONFIG.redirectUri,
            scope: OAUTH_CONFIG.scopes.join(' '),
            state: state
        })

        const authUrl = `${OAUTH_CONFIG.authorizeUrl}?${params.toString()}`;
        console.log('🔗 Auth URL generated:', authUrl);

        return authUrl;
    }

    /**
     * OAuth認証コードを処理（簡素化版）
     * @param {string} code - 認証コード
     * @param {string} state - ステート
     * @returns {Promise<object>} ユーザー情報
     */
    async handleAuthCallback(code, state) {
        const CALLBACK_PROCESSING_KEY = 'oauth_callback_in_progress';
        const CALLBACK_RESULT_KEY = 'oauth_callback_result';

        // 既に処理中の場合
        if (sessionStorage.getItem(CALLBACK_PROCESSING_KEY) === 'true') {
            console.log('🔄 Auth callback already in progress, waiting...');

            // 処理完了を待つ（最大10秒）
            return new Promise((resolve, reject) => {
                const startTime = Date.now();
                const checkInterval = setInterval(() => {
                    const isProcessing = sessionStorage.getItem(CALLBACK_PROCESSING_KEY) === 'true';
                    const result = sessionStorage.getItem(CALLBACK_RESULT_KEY);

                    if (!isProcessing && result) {
                        clearInterval(checkInterval);
                        sessionStorage.removeItem(CALLBACK_RESULT_KEY);
                        try {
                            const userInfo = JSON.parse(result);
                            console.log('✅ Using cached auth result');
                            resolve(userInfo);
                        } catch (error) {
                            reject(new Error('キャッシュされた認証結果の解析に失敗しました'));
                        }
                    } else if (Date.now() - startTime > 10000) {
                        clearInterval(checkInterval);
                        // タイムアウト時はフラグをクリアして再実行を許可
                        sessionStorage.removeItem(CALLBACK_PROCESSING_KEY);
                        reject(new Error('認証処理がタイムアウトしました'));
                    }
                }, 100);
            });
        }

        console.log('🔍 Handling auth callback:', {
            codeLength: code?.length,
            receivedState: state
        });

        // 処理中フラグを設定
        sessionStorage.setItem(CALLBACK_PROCESSING_KEY, 'true');

        try {
            // ステートの検証
            const storedState = sessionStorage.getItem('oauth_state');
            if (!storedState) {
                throw new Error('保存されたステートが見つかりません');
            }
            if (storedState !== state) {
                throw new Error('ステートが一致しません');
            }

            console.log('✅ State validation passed');

            // 認証コードをアクセストークンに交換
            const tokenResponse = await this.exchangeCodeForTokens(code);
            const { access_token, refresh_token, expires_in } = tokenResponse.data;

            // トークンを保存
            this.saveTokens(access_token, refresh_token, expires_in);

            // ユーザー情報を取得
            const userInfo = await this.fetchUserInfo();

            // 認証状態を更新
            this.setAuthState(userInfo);

            // 成功時のみステートをクリア
            sessionStorage.removeItem('oauth_state');

            // 結果をキャッシュ（同時実行用）
            sessionStorage.setItem(CALLBACK_RESULT_KEY, JSON.stringify(userInfo));

            console.log('✅ Auth callback completed successfully');
            return userInfo;
        } catch (error) {
            console.error('❌ OAuth callback error:', error);

            // エラー時のクリーンアップ
            sessionStorage.removeItem('oauth_state');
            sessionStorage.removeItem(CALLBACK_RESULT_KEY);

            throw new Error('認証に失敗しました: ' + error.message);
        } finally {
            // 処理中フラグをクリア
            sessionStorage.removeItem(CALLBACK_PROCESSING_KEY);
            // 結果キャッシュは少し遅れてクリア
            setTimeout(() => {
                sessionStorage.removeItem(CALLBACK_RESULT_KEY);
            }, 1000);
        }
    }

    /**
     * 認証コードをトークンに交換
     * @param {string} code - 認証コード
     * @returns {Promise} レスポンス
     */
    async exchangeCodeForTokens(code) {
        const data = {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: OAUTH_CONFIG.redirectUri,
            client_id: OAUTH_CONFIG.clientId
        }

        console.log('🔄 Exchanging code for tokens');

        try {
            const response = await apiClient.post('/oauth/token',
                new URLSearchParams(data).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            )

            console.log('✅ Token exchange successful');
            return response
        } catch (error) {
            console.error('❌ Token exchange failed:', error);
            throw error;
        }
    }

    /**
     * ユーザー情報を取得
     * @returns {Promise<object>} ユーザー情報
     */
    async fetchUserInfo() {
        try {
            console.log('🔍 Fetching user info via direct tool execution...');

            const requestData = {
                tool: TOOL_NAME,
                arguments: {
                    action: 'get_quota'
                },
                options: {
                    timeout: 30000
                }
            };

            console.log('📡 Sending direct tool execution request...');
            const response = await apiClient.post('/tools/execute', requestData);

            console.log('📊 Direct tool execution response received');

            if (!response.data.success) {
                throw new Error(response.data.error?.message || 'ツール実行に失敗しました');
            }

            const userInfo = this.extractUserInfoFromResponse(response.data.result);
            console.log('👤 Extracted user info:', userInfo);

            return userInfo;
        } catch (error) {
            console.error('❌ Failed to fetch user info:', error);

            // フォールバック: 基本的なユーザー情報を作成
            const fallbackUserInfo = {
                id: 'user_' + Date.now(),
                username: 'User',
                name: 'User',
                email: 'user@oneagent.local',
                scopes: OAUTH_CONFIG.scopes
            };

            console.log('👤 Using fallback user info:', fallbackUserInfo);
            return fallbackUserInfo;
        }
    }

    /**
     * APIレスポンスからユーザー情報を抽出
     * @param {object} responseData - APIレスポンス
     * @returns {object} ユーザー情報
     */
    extractUserInfoFromResponse(responseData) {
        console.log('🔍 Extracting user info from response');

        try {
            let content = '';

            if (responseData.content) {
                if (Array.isArray(responseData.content)) {
                    content = responseData.content
                        .filter(item => item.type === 'text')
                        .map(item => item.text)
                        .join('\n');
                } else if (typeof responseData.content === 'string') {
                    content = responseData.content;
                } else if (responseData.content.text) {
                    content = responseData.content.text;
                }
            } else if (responseData.text) {
                content = responseData.text;
            } else if (typeof responseData === 'string') {
                content = responseData;
            }

            console.log('📝 Extracted content length:', content.length);

            // ユーザー情報を抽出
            let userId = null;
            let email = null;
            let username = null;

            // ユーザーIDの抽出
            const userIdMatch = content.match(/ユーザー(?:ID)?:\s*([^\s\n,]+)/i) ||
                content.match(/User(?:\s+ID)?:\s*([^\s\n,]+)/i);
            if (userIdMatch) {
                userId = userIdMatch[1];
            } else if (content.includes('admin')) {
                userId = 'admin';
            }

            // メールアドレスの抽出
            const emailMatch = content.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
            if (emailMatch) {
                email = emailMatch[1];
            }

            // デフォルト値の設定
            if (!userId) {
                userId = 'user_' + Date.now();
            }
            if (!username) {
                username = userId;
            }
            if (!email) {
                email = `${userId}@oneagent.local`;
            }

            const userInfo = {
                id: userId,
                username: username,
                name: username,
                email: email,
                scopes: OAUTH_CONFIG.scopes,
                quotaInfo: this.extractQuotaInfo(content)
            };

            console.log('✅ Successfully extracted user info');
            return userInfo;

        } catch (error) {
            console.error('❌ Error extracting user info:', error);
            throw error;
        }
    }

    /**
     * レスポンスから容量情報を抽出
     * @param {string} content - レスポンス内容
     * @returns {object} 容量情報
     */
    extractQuotaInfo(content) {
        try {
            const quotaInfo = {};

            const usageMatch = content.match(/使用容量:\s*([^\/\s]+)\s*\/\s*([^\s\n]+)/i);
            if (usageMatch) {
                quotaInfo.used = usageMatch[1].trim();
                quotaInfo.total = usageMatch[2].trim();
            }

            const percentMatch = content.match(/(\d+(?:\.\d+)?)%/);
            if (percentMatch) {
                quotaInfo.percentage = parseFloat(percentMatch[1]);
            }

            const fileCountMatch = content.match(/ファイル数:\s*(\d+)/i);
            if (fileCountMatch) {
                quotaInfo.fileCount = parseInt(fileCountMatch[1]);
            }

            return quotaInfo;
        } catch (error) {
            console.error('❌ Error extracting quota info:', error);
            return {};
        }
    }

    /**
     * OAuth認証を開始
     */
    async login() {
        try {
            console.log('🚀 Starting OAuth login process...');
            const authUrl = this.getAuthUrl();
            console.log('➡️ Redirecting to auth URL...');
            window.location.href = authUrl;
        } catch (error) {
            console.error('❌ Login initialization failed:', error);
            throw new Error('認証の開始に失敗しました: ' + error.message);
        }
    }

    /**
     * ログアウト
     */
    async logout() {
        try {
            console.log('🚪 Starting logout process...');
            this.clearAuthState()
            console.log('✅ Logout completed');
        } catch (error) {
            console.error('❌ Logout error:', error)
            this.clearAuthState()
        }
    }

    /**
     * 認証トークンの更新
     */
    async refreshToken() {
        const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken)
        if (!refreshToken) {
            throw new Error('リフレッシュトークンがありません')
        }

        try {
            console.log('🔄 Refreshing access token...');

            const response = await apiClient.post('/oauth/refresh', {
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            })

            const { access_token, refresh_token: newRefreshToken, expires_in } = response.data
            this.saveTokens(access_token, newRefreshToken, expires_in)

            console.log('✅ Token refresh successful');
            return access_token
        } catch (error) {
            console.error('❌ Token refresh failed:', error)
            this.clearAuthState()
            throw new Error('トークンの更新に失敗しました: ' + error.message)
        }
    }

    /**
     * 認証状態の確認
     */
    isLoggedIn() {
        const hasToken = !!localStorage.getItem(STORAGE_KEYS.authToken);
        const isAuth = this.isAuthenticated;
        return isAuth && hasToken;
    }

    /**
     * 現在のユーザー情報を取得
     */
    getCurrentUser() {
        return this.currentUser
    }

    /**
     * トークンを保存
     */
    saveTokens(accessToken, refreshToken, expiresIn) {
        console.log('💾 Saving tokens to localStorage...');

        localStorage.setItem(STORAGE_KEYS.authToken, accessToken)
        if (refreshToken) {
            localStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken)
        }

        const expiresAt = Date.now() + (expiresIn * 1000)
        localStorage.setItem('token_expires_at', expiresAt.toString())

        console.log('✅ Tokens saved successfully');
    }

    /**
     * 認証状態を設定
     */
    setAuthState(userInfo) {
        console.log('👤 Setting auth state for user:', userInfo.username);

        this.currentUser = userInfo
        this.isAuthenticated = true

        localStorage.setItem(STORAGE_KEYS.userInfo, JSON.stringify(userInfo))
        this.notifyAuthChange()

        console.log('✅ Auth state set successfully');
    }

    /**
     * 認証状態をクリア
     */
    clearAuthState() {
        console.log('🧹 Clearing auth state...');

        this.currentUser = null
        this.isAuthenticated = false

        localStorage.removeItem(STORAGE_KEYS.authToken)
        localStorage.removeItem(STORAGE_KEYS.refreshToken)
        localStorage.removeItem(STORAGE_KEYS.userInfo)
        localStorage.removeItem('token_expires_at')

        // OAuth関連のsessionStorageもクリア
        sessionStorage.removeItem('oauth_state')
        sessionStorage.removeItem('auth_callback_success')
        sessionStorage.removeItem('auth_callback_processing')
        sessionStorage.removeItem('auth_processing_time')

        this.notifyAuthChange()
        console.log('✅ Auth state cleared');
    }

    /**
     * ローカルストレージから認証状態を復元
     */
    restoreAuthState() {
        console.log('🔄 Restoring auth state from localStorage...');

        const token = localStorage.getItem(STORAGE_KEYS.authToken)
        const userInfoJson = localStorage.getItem(STORAGE_KEYS.userInfo)
        const expiresAt = localStorage.getItem('token_expires_at')

        if (token && userInfoJson && expiresAt) {
            const now = Date.now()
            const expirationTime = parseInt(expiresAt)

            if (now < expirationTime) {
                try {
                    const userInfo = JSON.parse(userInfoJson)
                    this.currentUser = userInfo
                    this.isAuthenticated = true

                    console.log('✅ Auth state restored for user:', userInfo.username);
                } catch (error) {
                    console.error('❌ Failed to parse user info:', error)
                    this.clearAuthState()
                }
            } else {
                console.log('⏰ Token expired, clearing auth state');
                this.clearAuthState()
            }
        } else {
            console.log('ℹ️ No valid auth state found in localStorage');
        }
    }

    /**
     * ランダムなステート文字列を生成
     */
    generateState() {
        const array = new Uint8Array(16)
        crypto.getRandomValues(array)
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
    }

    /**
     * 認証状態変更のコールバックを追加
     */
    onAuthChange(callback) {
        this.authCallbacks.add(callback)
        return () => {
            this.authCallbacks.delete(callback)
        }
    }

    /**
     * 認証状態変更を通知
     */
    notifyAuthChange() {
        console.log('📢 Notifying auth change to', this.authCallbacks.size, 'callbacks');

        this.authCallbacks.forEach(callback => {
            try {
                callback({
                    isAuthenticated: this.isAuthenticated,
                    user: this.currentUser
                })
            } catch (error) {
                console.error('❌ Auth callback error:', error)
            }
        })
    }

    /**
     * 権限確認
     */
    hasScope(scope) {
        return this.isAuthenticated && this.currentUser?.scopes?.includes(scope)
    }

    /**
     * プロファイル写真のURLを取得
     */
    getAvatarUrl() {
        if (!this.currentUser) return null

        const email = this.currentUser.email || 'user@example.com'
        const hash = this.hashEmail(email)
        return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=40`
    }

    /**
     * メールアドレスをハッシュ化
     */
    hashEmail(email) {
        const encoder = new TextEncoder()
        const data = encoder.encode(email.toLowerCase().trim())

        let hash = 0
        for (let i = 0; i < data.length; i++) {
            hash = ((hash << 5) - hash) + data[i]
            hash = hash & hash
        }

        return Math.abs(hash).toString(16)
    }

    /**
     * 直接ツール実行
     */
    async executeToolDirect(toolName, toolArgs, options = {}) {
        try {
            const requestData = {
                tool: toolName,
                arguments: toolArgs,
                options: {
                    timeout: 30000,
                    ...options
                }
            };

            const response = await apiClient.post('/tools/execute', requestData);

            if (!response.data.success) {
                throw new Error(response.data.error?.message || 'ツール実行に失敗しました');
            }

            return response.data;
        } catch (error) {
            console.error('❌ Direct tool execution failed:', error);
            throw error;
        }
    }

    /**
     * ファイル操作専用メソッド
     */
    async executeFileOperation(action, params = {}) {
        return this.executeToolDirect(TOOL_NAME, {
            action: action,
            ...params
        });
    }
}

// シングルトンインスタンス
export const authService = new AuthService()
export default authService