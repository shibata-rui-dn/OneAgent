/**
 * OAuth 2.0 サーバー実装（デバッグ強化版）
 * 認証フローの処理とエンドポイント管理
 * 認証失敗の詳細なデバッグ情報を追加
 */

import crypto from 'crypto';
import { CONFIG } from '../config/config.js';

/**
 * OAuth 2.0 エンドポイント実装（デバッグ強化版）
 */
export class OAuthServer {
    constructor(database) {
        this.db = database;
    }

    // ===== 認可エンドポイント =====

    /**
     * 認可エンドポイント GET /oauth/authorize
     */
    async handleAuthorize(req, res) {
        const {
            response_type,
            client_id,
            redirect_uri,
            scope,
            state,
            code_challenge,
            code_challenge_method
        } = req.query;

        try {
            console.log('🔐 認可リクエスト:', { client_id, redirect_uri, scope, state });

            // パラメータ検証
            const validation = this.validateAuthorizeRequest({
                response_type,
                client_id,
                redirect_uri,
                scope,
                code_challenge,
                code_challenge_method
            });

            if (!validation.valid) {
                return this.sendError(res, redirect_uri, validation.error, state, validation.description);
            }

            const { client, validScopes } = validation;

            // ユーザー認証状態をチェック
            const user = this.getAuthenticatedUser(req);
            if (!user) {
                // ログインページにリダイレクト
                const loginUrl = this.buildLoginUrl({
                    response_type,
                    client_id,
                    redirect_uri,
                    scope: validScopes.join(' '),
                    state: state || '',
                    code_challenge: code_challenge || '',
                    code_challenge_method: code_challenge_method || ''
                });

                console.log('👤 未認証ユーザー、ログインページにリダイレクト');
                return res.redirect(loginUrl);
            }

            console.log('✅ ユーザー認証済み:', user.username);

            // 認可コードを生成
            const authCode = this.db.createAuthCode(
                user.id,
                client_id,
                redirect_uri,
                validScopes,
                code_challenge
            );

            const params = new URLSearchParams({
                code: authCode,
                state: state || ''
            });

            console.log('🎫 認可コード発行、リダイレクト:', redirect_uri);
            res.redirect(`${redirect_uri}?${params}`);

        } catch (error) {
            console.error('❌ OAuth認可エラー:', error);
            this.sendError(res, redirect_uri, 'server_error', state);
        }
    }

    /**
     * 認可リクエストの検証
     */
    validateAuthorizeRequest(params) {
        const { response_type, client_id, redirect_uri, scope, code_challenge, code_challenge_method } = params;

        // response_type検証
        if (response_type !== 'code') {
            return { valid: false, error: 'unsupported_response_type' };
        }

        // client_id, redirect_uri必須チェック
        if (!client_id || !redirect_uri) {
            return { valid: false, error: 'invalid_request', description: 'Missing required parameters' };
        }

        // クライアント検証
        const client = this.db.getClient(client_id);
        if (!client) {
            return { valid: false, error: 'invalid_client' };
        }

        // リダイレクトURI検証
        if (!this.db.validateRedirectUri(client_id, redirect_uri)) {
            return { valid: false, error: 'invalid_redirect_uri' };
        }

        // スコープ検証
        const requestedScopes = scope ? scope.split(' ') : ['read'];
        const validScopes = requestedScopes.filter(s => CONFIG.OAUTH.SUPPORTED_SCOPES.includes(s));

        if (validScopes.length === 0) {
            return { valid: false, error: 'invalid_scope' };
        }

        // PKCE検証（オプション）
        if (code_challenge && code_challenge_method !== 'S256') {
            return {
                valid: false,
                error: 'invalid_request',
                description: 'Only S256 code challenge method is supported'
            };
        }

        return { valid: true, client, validScopes };
    }

    /**
     * ログインURLの構築
     */
    buildLoginUrl(params) {
        const queryParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value) {
                queryParams.set(key, value);
            }
        });

        return `/oauth/login?${queryParams}`;
    }

    // ===== トークンエンドポイント =====

    /**
     * トークンエンドポイント POST /oauth/token
     */
    async handleToken(req, res) {
        const {
            grant_type,
            code,
            redirect_uri,
            client_id,
            client_secret,
            code_verifier,
            refresh_token
        } = req.body;

        try {
            console.log('🎫 トークンリクエスト:', { grant_type, client_id });

            // クライアント認証
            const client = this.authenticateClient(client_id, client_secret);
            if (!client) {
                return res.status(401).json({
                    error: 'invalid_client',
                    error_description: 'Client authentication failed'
                });
            }

            if (grant_type === 'authorization_code') {
                return await this.handleAuthorizationCodeGrant(req, res, {
                    code,
                    redirect_uri,
                    client_id,
                    code_verifier
                });
            } else if (grant_type === 'refresh_token') {
                return await this.handleRefreshTokenGrant(req, res, {
                    refresh_token,
                    client_id
                });
            } else {
                return res.status(400).json({
                    error: 'unsupported_grant_type',
                    error_description: 'Only authorization_code and refresh_token are supported'
                });
            }

        } catch (error) {
            console.error('❌ OAuth トークンエラー:', error);
            res.status(400).json({
                error: 'invalid_grant',
                error_description: error.message
            });
        }
    }

    /**
     * 認可コードグラント処理
     */
    async handleAuthorizationCodeGrant(req, res, params) {
        const { code, redirect_uri, client_id, code_verifier } = params;

        if (!code || !redirect_uri) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Missing required parameters'
            });
        }

        const authCode = this.db.validateAuthCode(code, client_id, redirect_uri, code_verifier);
        if (!authCode) {
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'Invalid authorization code'
            });
        }

        console.log('✅ 認可コード検証成功、トークン発行');

        const tokens = this.db.createTokens(authCode.userId, client_id, authCode.scopes);

        // 成功ログ
        console.log('🎉 アクセストークン発行:', {
            userId: authCode.userId,
            scopes: authCode.scopes,
            expiresIn: tokens.expires_in
        });

        res.json(tokens);
    }

    /**
     * リフレッシュトークングラント処理
     */
    async handleRefreshTokenGrant(req, res, params) {
        const { refresh_token, client_id } = params;

        if (!refresh_token) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Missing refresh token'
            });
        }

        console.log('🔄 リフレッシュトークンでアクセストークン更新');

        const tokens = this.db.refreshAccessToken(refresh_token);

        console.log('✅ トークン更新成功');
        res.json(tokens);
    }

    /**
     * クライアント認証
     */
    authenticateClient(clientId, clientSecret) {
        const client = this.db.getClient(clientId);

        if (!client) {
            return null;
        }

        // 公開クライアントの場合はシークレット不要
        if (client.type === 'public') {
            return client;
        }

        // 機密クライアントの場合はシークレット必須
        if (client.secret !== clientSecret) {
            return null;
        }

        return client;
    }

    // ===== ユーザー情報エンドポイント =====

    /**
     * ユーザー情報エンドポイント GET /oauth/userinfo
     */
    async handleUserInfo(req, res) {
        const token = this.extractBearerToken(req);
        if (!token) {
            return res.status(401).json({
                error: 'invalid_token',
                error_description: 'Missing or invalid Bearer token'
            });
        }

        const decoded = this.db.validateToken(token);
        if (!decoded) {
            return res.status(401).json({
                error: 'invalid_token',
                error_description: 'Token is expired or invalid'
            });
        }

        console.log('📋 ユーザー情報リクエスト:', decoded.user.username);

        // スコープに基づいて返す情報を制限
        const scopes = decoded.scope.split(' ');
        const userInfo = {
            sub: decoded.sub,
            username: decoded.user.username,
            preferred_username: decoded.user.username
        };

        // スコープベースの情報追加
        if (scopes.includes('read') || scopes.includes('profile')) {
            userInfo.name = decoded.user.profile?.displayName;
            userInfo.profile = decoded.user.profile;
        }

        if (scopes.includes('read') || scopes.includes('email')) {
            userInfo.email = decoded.user.email;
            userInfo.email_verified = decoded.user.emailVerified;
        }

        if (scopes.includes('admin') && decoded.user.roles.includes('admin')) {
            userInfo.roles = decoded.user.roles;
            userInfo.scopes = scopes;
        }

        res.json(userInfo);
    }

    // ===== トークン取り消しエンドポイント =====

    /**
     * トークン取り消し POST /oauth/revoke
     */
    async handleRevoke(req, res) {
        const { token, token_type_hint } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Missing token parameter'
            });
        }

        console.log('🗑️ トークン取り消しリクエスト');

        const revoked = this.db.revokeToken(token);

        if (revoked) {
            console.log('✅ トークン取り消し成功');
        } else {
            console.log('⚠️ トークンが見つかりません（既に期限切れの可能性）');
        }

        // RFC 7009に従い、成功・失敗に関わらず200を返す
        res.status(200).json({ success: true });
    }

    // ===== ログインページとフォーム認証 =====

    /**
     * ログインページ GET /oauth/login
     */
    async handleLogin(req, res) {
        const params = req.query;

        console.log('🔐 ログインページ表示');

        const loginForm = this.generateLoginForm(params);
        res.send(loginForm);
    }

    /**
     * フォーム認証処理 POST /oauth/authenticate（デバッグ強化版）
     */
    async handleAuthenticate(req, res) {
        const { username, password, ...oauthParams } = req.body;

        try {
            console.log('🔍 ユーザー認証試行:', username);
            console.log('📋 OAuth パラメータ:', oauthParams);
            console.log('🔑 パスワード長:', password ? password.length : 0);

            // 認証実行
            const user = await this.db.authenticateUser(username, password);
            if (!user) {
                console.log('❌ 認証失敗:', username);

                const errorParams = new URLSearchParams({
                    ...oauthParams,
                    error: 'invalid_credentials'
                });
                
                console.log('↩️ 認証失敗でログインページにリダイレクト:', `/oauth/login?${errorParams}`);
                return res.redirect(`/oauth/login?${errorParams}`);
            }

            console.log('✅ 認証成功:', user.username);

            // セッションにユーザー情報を保存
            req.session = req.session || {};
            req.session.user = user;

            // OAuthパラメータの検証
            const { response_type, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = oauthParams;

            console.log('🔍 OAuth パラメータ検証:', {
                response_type,
                client_id,
                redirect_uri,
                scope,
                state: !!state
            });

            if (!response_type || !client_id || !redirect_uri) {
                console.error('❌ 必要なOAuthパラメータが不足');
                return res.status(400).json({
                    error: 'invalid_request',
                    error_description: 'Missing required OAuth parameters'
                });
            }

            // パラメータ検証
            const validation = this.validateAuthorizeRequest({
                response_type,
                client_id,
                redirect_uri,
                scope,
                code_challenge,
                code_challenge_method
            });

            if (!validation.valid) {
                console.error('❌ OAuth パラメータ検証失敗:', validation.error);
                return this.sendError(res, redirect_uri, validation.error, state, validation.description);
            }

            const { validScopes } = validation;

            // 認可コードを生成
            const authCode = this.db.createAuthCode(
                user.id,
                client_id,
                redirect_uri,
                validScopes,
                code_challenge
            );

            const params = new URLSearchParams({
                code: authCode,
                state: state || ''
            });

            console.log('🎫 認可コード発行、リダイレクト:', redirect_uri);
            console.log('📋 リダイレクトパラメータ:', params.toString());

            res.redirect(`${redirect_uri}?${params}`);

        } catch (error) {
            console.error('❌ 認証処理エラー:', error);
            const errorParams = new URLSearchParams({
                ...oauthParams,
                error: 'server_error'
            });
            res.redirect(`/oauth/login?${errorParams}`);
        }
    }

    /**
     * ログインフォームHTML生成（エラー表示改善版）
     */
    generateLoginForm(params) {
        let errorMessage = '';
        
        if (params.error === 'invalid_credentials') {
            errorMessage = '<div class="error">ユーザー名またはパスワードが正しくありません。</div>';
        } else if (params.error === 'server_error') {
            errorMessage = '<div class="error">サーバーエラーが発生しました。しばらく後にお試しください。</div>';
        } else if (params.error) {
            errorMessage = `<div class="error">認証エラー: ${params.error}</div>`;
        }

        return `
<!DOCTYPE html>
<html lang="ja">
<head>
    <title>OneAgent - セキュアログイン</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }
        .login-container {
            background: white;
            padding: 2.5rem;
            border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            width: 100%;
            max-width: 420px;
        }
        .logo {
            text-align: center;
            margin-bottom: 2rem;
        }
        .logo h1 {
            color: #1f2937;
            font-size: 2rem;
            font-weight: 800;
            margin-bottom: 0.5rem;
        }
        .logo p {
            color: #6b7280;
            font-size: 0.875rem;
        }
        .error {
            background: #fef2f2;
            color: #dc2626;
            padding: 0.875rem;
            border-radius: 8px;
            margin-bottom: 1.5rem;
            border: 1px solid #fecaca;
            font-size: 0.875rem;
        }
        .form-group {
            margin-bottom: 1.25rem;
        }
        label {
            display: block;
            margin-bottom: 0.5rem;
            color: #374151;
            font-weight: 500;
            font-size: 0.875rem;
        }
        input[type="text"], input[type="password"] {
            width: 100%;
            padding: 0.875rem;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
        }
        input[type="text"]:focus, input[type="password"]:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        .btn {
            width: 100%;
            padding: 0.875rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
        }
        .btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 10px 25px -5px rgba(102, 126, 234, 0.4);
        }
        .btn:active {
            transform: translateY(0);
        }
        .demo-users {
            margin-top: 1.5rem;
            padding: 1.25rem;
            background: #f9fafb;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
        }
        .demo-users h3 {
            margin-bottom: 0.75rem;
            color: #374151;
            font-size: 0.875rem;
            font-weight: 600;
        }
        .demo-users p {
            margin-bottom: 0.5rem;
            color: #6b7280;
            font-size: 0.8125rem;
        }
        .demo-users p:last-child {
            margin-bottom: 0;
        }
        .security-info {
            margin-top: 1.5rem;
            text-align: center;
            padding-top: 1.5rem;
            border-top: 1px solid #e5e7eb;
        }
        .security-info p {
            color: #6b7280;
            font-size: 0.75rem;
            margin-bottom: 0.25rem;
        }
        .security-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            color: #059669;
            font-size: 0.75rem;
            font-weight: 500;
        }
        .debug-info {
            margin-top: 1rem;
            padding: 0.75rem;
            background: #f3f4f6;
            border-radius: 6px;
            font-size: 0.75rem;
            color: #6b7280;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">
            <h1>🤖 OneAgent</h1>
            <p>セキュアなAIエージェントプラットフォーム</p>
        </div>
        
        ${errorMessage}
        
        <form method="POST" action="/oauth/authenticate">
            ${Object.entries(params).map(([key, value]) =>
            `<input type="hidden" name="${key}" value="${value}">`
        ).join('')}
            
            <div class="form-group">
                <label for="username">ユーザー名またはメールアドレス</label>
                <input type="text" id="username" name="username" required autocomplete="username">
            </div>
            
            <div class="form-group">
                <label for="password">パスワード</label>
                <input type="password" id="password" name="password" required autocomplete="current-password">
            </div>
            
            <button type="submit" class="btn">セキュアログイン</button>
        </form>
        
        <div class="demo-users">
            <h3>デモアカウント</h3>
            <p><strong>管理者:</strong> admin / admin123</p>
            <p><strong>一般ユーザー:</strong> demo / demo123</p>
        </div>
        
        ${CONFIG.DEBUG.ENABLED ? `
        <div class="debug-info">
            <strong>デバッグ情報:</strong><br>
            クライアントID: ${params.client_id || 'なし'}<br>
            リダイレクトURI: ${params.redirect_uri || 'なし'}<br>
            エラー: ${params.error || 'なし'}
        </div>
        ` : ''}
        
        <div class="security-info">
            <p>OAuth 2.0 + PKCE による安全な認証</p>
            <div class="security-badge">
                🔒 エンドツーエンド暗号化
            </div>
        </div>
    </div>
</body>
</html>`;
    }

    // ===== ユーティリティメソッド =====

    /**
     * Bearer トークンの抽出
     */
    extractBearerToken(req) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.slice(7);
        }
        return null;
    }

    /**
     * セッションから認証済みユーザーを取得
     */
    getAuthenticatedUser(req) {
        return req.session?.user || null;
    }

    /**
     * エラーレスポンスの送信
     */
    sendError(res, redirectUri, error, state, description = null) {
        if (redirectUri) {
            const params = new URLSearchParams({
                error,
                state: state || ''
            });

            if (description) {
                params.set('error_description', description);
            }

            console.log(`↩️ エラーリダイレクト: ${error} -> ${redirectUri}?${params}`);
            res.redirect(`${redirectUri}?${params}`);
        } else {
            const errorResponse = { error };
            if (description) {
                errorResponse.error_description = description;
            }
            res.status(400).json(errorResponse);
        }
    }

    /**
     * セキュリティヘッダーの設定
     */
    setSecurityHeaders(res) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
    }
}