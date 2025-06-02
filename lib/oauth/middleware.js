/**
 * OAuth 2.0 認証ミドルウェア（デッドロック修正版）
 * セキュリティログの無効化とトークン検証の高速化
 */

import express from 'express';
import session from 'express-session';
import { CONFIG } from '../config/config.js';

/**
 * Bearer トークン抽出
 */
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

/**
 * 基本認証ミドルウェア（高速化版）
 */
export function createAuthMiddleware(database) {
  return (req, res, next) => {
    console.log(`🔍 [AUTH] リクエスト開始: ${req.method} ${req.path}`);
    
    const token = extractBearerToken(req);
    
    if (!token) {
      console.log(`🔍 [AUTH] トークンなし`);
      return res.status(401).json({ 
        error: 'unauthorized',
        error_description: 'Bearer token required'
      });
    }

    console.log(`🔍 [AUTH] トークン検証開始`);
    const decoded = database.validateTokenSync(token);
    
    if (!decoded) {
      console.log(`🔍 [AUTH] トークン検証失敗`);
      return res.status(401).json({ 
        error: 'invalid_token',
        error_description: 'Invalid or expired token'
      });
    }

    console.log(`🔍 [AUTH] トークン検証成功: ${decoded.user.username}`);
    
    req.user = decoded.user;
    req.scopes = decoded.scope.split(' ');
    req.tokenInfo = {
      jti: decoded.jti,
      clientId: decoded.client_id,
      issuedAt: new Date(decoded.iat * 1000),
      expiresAt: new Date(decoded.exp * 1000),
      token: token
    };

    console.log(`🔍 [AUTH] next()呼び出し`);
    next();
  };
}

/**
 * スコープベース認可ミドルウェア（軽量版）
 */
export function requireScope(requiredScopes) {
  if (typeof requiredScopes === 'string') {
    requiredScopes = [requiredScopes];
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'Authentication required'
      });
    }

    const userScopes = req.scopes || [];
    
    // 管理者スコープがあれば全てのリソースにアクセス可能
    if (userScopes.includes('admin')) {
      return next();
    }

    // 必要なスコープのいずれかを持っているかチェック
    const hasRequiredScope = requiredScopes.some(scope => userScopes.includes(scope));
    
    if (!hasRequiredScope) {
      // 🔧 修正: セキュリティログを削除
      if (CONFIG.DEBUG.VERBOSE_LOGGING) {
        console.warn(`🔒 スコープ不足: ${req.user.username} (必要: ${requiredScopes.join(', ')}, 実際: ${userScopes.join(', ')})`);
      }

      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `Required scope: ${requiredScopes.join(' or ')}`,
        scope: requiredScopes.join(' ')
      });
    }

    next();
  };
}

/**
 * ロールベース認可ミドルウェア（軽量版）
 */
export function requireRole(requiredRoles) {
  if (typeof requiredRoles === 'string') {
    requiredRoles = [requiredRoles];
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'Authentication required'
      });
    }

    const userRoles = req.user.roles || [];
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));
    
    if (!hasRequiredRole) {
      // 🔧 修正: セキュリティログを削除
      if (CONFIG.DEBUG.VERBOSE_LOGGING) {
        console.warn(`🔒 権限不足: ${req.user.username} (必要: ${requiredRoles.join(', ')}, 実際: ${userRoles.join(', ')})`);
      }

      return res.status(403).json({
        error: 'access_denied',
        error_description: `Required role: ${requiredRoles.join(' or ')}`
      });
    }

    next();
  };
}

/**
 * 管理者限定ミドルウェア
 */
export function requireAdmin() {
  return (req, res, next) => {
    console.log(`🔍 [ADMIN] 管理者チェック開始: ${req.user?.username}`);
    
    if (!req.user) {
      console.log(`🔍 [ADMIN] ユーザー情報なし`);
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'Authentication required'
      });
    }

    const userRoles = req.user.roles || [];
    const hasAdminRole = userRoles.includes('admin');
    
    if (!hasAdminRole) {
      console.log(`🔍 [ADMIN] 管理者権限なし: ${userRoles}`);
      return res.status(403).json({
        error: 'access_denied',
        error_description: 'Admin role required'
      });
    }

    console.log(`🔍 [ADMIN] 管理者権限確認、next()呼び出し`);
    next();
  };
}

/**
 * オプショナル認証ミドルウェア
 */
export function optionalAuth(database) {
  return (req, res, next) => {
    const token = extractBearerToken(req);
    
    if (token) {
      // 🔧 修正: 同期的なトークン検証
      const decoded = database.validateTokenSync(token);
      if (decoded) {
        req.user = decoded.user;
        req.scopes = decoded.scope.split(' ');
        req.tokenInfo = {
          jti: decoded.jti,
          clientId: decoded.client_id,
          issuedAt: new Date(decoded.iat * 1000),
          expiresAt: new Date(decoded.exp * 1000)
        };
      }
    }

    next();
  };
}

/**
 * リソースオーナー検証ミドルウェア（軽量版）
 */
export function requireResourceOwner(userIdExtractor) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'Authentication required'
      });
    }

    // 管理者は全てのリソースにアクセス可能
    if (req.user.roles && req.user.roles.includes('admin')) {
      return next();
    }

    const resourceUserId = typeof userIdExtractor === 'function' 
      ? userIdExtractor(req) 
      : req.params[userIdExtractor || 'userId'];

    if (req.user.id !== resourceUserId) {
      // 🔧 修正: セキュリティログを削除
      if (CONFIG.DEBUG.VERBOSE_LOGGING) {
        console.warn(`🔒 リソースアクセス拒否: ${req.user.username} -> ${resourceUserId}`);
      }

      return res.status(403).json({
        error: 'access_denied',
        error_description: 'Access to this resource is forbidden'
      });
    }

    next();
  };
}

/**
 * レート制限ミドルウェア（軽量版）
 */
export function createRateLimitMiddleware() {
  const requests = new Map();
  const WINDOW_SIZE = CONFIG.SECURITY.RATE_LIMIT_WINDOW;
  const MAX_REQUESTS = CONFIG.SECURITY.RATE_LIMIT_MAX;

  // 古いエントリのクリーンアップ（間隔を長くして負荷軽減）
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of requests.entries()) {
      const validTimestamps = timestamps.filter(time => now - time < WINDOW_SIZE);
      if (validTimestamps.length === 0) {
        requests.delete(key);
      } else {
        requests.set(key, validTimestamps);
      }
    }
  }, WINDOW_SIZE / 2); // クリーンアップ間隔を半分に

  return (req, res, next) => {
    const identifier = req.user?.id || req.ip;
    const now = Date.now();
    
    if (!requests.has(identifier)) {
      requests.set(identifier, []);
    }

    const timestamps = requests.get(identifier);
    const recentRequests = timestamps.filter(time => now - time < WINDOW_SIZE);
    
    if (recentRequests.length >= MAX_REQUESTS) {
      const resetTime = Math.ceil((recentRequests[0] + WINDOW_SIZE - now) / 1000);
      
      res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', resetTime);
      
      // 🔧 修正: セキュリティログを削除
      if (CONFIG.DEBUG.VERBOSE_LOGGING) {
        console.warn(`🔒 レート制限: ${identifier} (${recentRequests.length}/${MAX_REQUESTS})`);
      }

      return res.status(429).json({
        error: 'rate_limit_exceeded',
        error_description: 'Too many requests',
        retry_after: resetTime
      });
    }

    recentRequests.push(now);
    requests.set(identifier, recentRequests);

    res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', MAX_REQUESTS - recentRequests.length);

    next();
  };
}

/**
 * IP制限ミドルウェア（軽量版）
 */
export function createIPWhitelistMiddleware(allowedIPs = []) {
  if (CONFIG.NODE_ENV === 'development') {
    // 開発環境では制限なし
    return (req, res, next) => next();
  }

  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
      // 🔧 修正: セキュリティログを削除
      if (CONFIG.DEBUG.VERBOSE_LOGGING) {
        console.warn(`🔒 IP制限: ${clientIP}`);
      }

      return res.status(403).json({
        error: 'access_denied',
        error_description: 'Access from this IP address is not allowed'
      });
    }

    next();
  };
}

/**
 * セキュリティヘッダーミドルウェア
 */
export function securityHeaders() {
  return (req, res, next) => {
    // セキュリティヘッダーの設定
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    if (CONFIG.SECURITY.FORCE_HTTPS) {
      res.setHeader('Strict-Transport-Security', 
        `max-age=${CONFIG.SECURITY.HSTS_MAX_AGE}; includeSubDomains; preload`);
    }

    if (CONFIG.SECURITY.CONTENT_SECURITY_POLICY) {
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
    }

    next();
  };
}

/**
 * CORS設定ミドルウェア
 */
export function createCorsMiddleware() {
  return (req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = CONFIG.CORS.ORIGINS;

    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }

    if (CONFIG.CORS.CREDENTIALS) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 
      'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Max-Age', CONFIG.CORS.MAX_AGE);

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    next();
  };
}

/**
 * エラーハンドリングミドルウェア（軽量版）
 */
export function errorHandler() {
  return (error, req, res, next) => {
    console.error('❌ API エラー:', error);

    // 🔧 修正: セキュリティログを削除

    // JWT関連エラー
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Invalid JWT token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Token has expired'
      });
    }

    // 一般的なエラー
    const statusCode = error.statusCode || error.status || 500;
    const errorResponse = {
      error: error.code || 'server_error',
      error_description: CONFIG.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message
    };

    if (CONFIG.DEBUG.ENABLED && error.stack) {
      errorResponse.debug = error.stack;
    }

    res.status(statusCode).json(errorResponse);
  };
}

/**
 * ミドルウェア統計情報取得（軽量版）
 */
export function getMiddlewareStats() {
  return {
    activeRequests: 0,
    totalRequests: 0,
    blockedRequests: 0,
    rateLimitViolations: 0,
    securityLogEnabled: false, // 🔧 修正: 常に無効
    securityLogMode: 'disabled' // 🔧 修正: 無効化
  };
}

/**
 * アプリケーション共通ミドルウェアを一括設定
 */
export function setupMiddleware(app, oauthSystem) {
  // JSON ボディパース
  app.use(express.json({ limit: '200mb' }));  
  app.use(express.urlencoded({ 
    extended: false, 
    limit: '200mb' 
  }));

  // セッション
  app.use(session({
    secret: CONFIG.SESSION.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: CONFIG.SESSION.MAX_AGE,
      secure: CONFIG.SESSION.SECURE,
      httpOnly: CONFIG.SESSION.HTTP_ONLY,
      sameSite: CONFIG.SESSION.SAME_SITE
    }
  }));

  // セキュリティヘッダー
  app.use(oauthSystem.middleware.security);

  // CORS
  app.use(oauthSystem.middleware.cors);

  // レート制限
  app.use(oauthSystem.middleware.rateLimit);

  // エラーハンドラは最後に
  app.use(oauthSystem.middleware.errorHandler);
}