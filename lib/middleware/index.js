/**
 * ミドルウェア統合
 * Express アプリケーションのミドルウェア設定
 */

import express from 'express';
import session from 'express-session';
import { CONFIG } from '../config/config.js';

import path from 'path';
import { fileURLToPath } from 'url';


/**
 * 基本ミドルウェアの設定
 */
export function setupMiddleware(app, oauthSystem) {
  console.log('⚙️ ミドルウェアを設定中...');

  // JSON パースミドルウェア
  app.use(express.json({ 
    limit: '50mb',
    verify: (req, res, buf) => {
      // JSON パースエラーのログ記録
      req.rawBody = buf;
    }
  }));

  app.use(express.urlencoded({ 
    extended: true, 
    limit: '50mb' 
  }));

  // セッション設定
  setupSession(app);

  // セキュリティミドルウェア
  if (oauthSystem) {
    app.use(oauthSystem.middleware.security);
    app.use(oauthSystem.middleware.cors);
    
    // レート制限（本番環境のみ）
    if (CONFIG.NODE_ENV === 'production') {
      app.use(oauthSystem.middleware.rateLimit);
    }
  }

  // 開発環境でのHTTPS リダイレクト無効化
  if (CONFIG.NODE_ENV === 'production' && CONFIG.SECURITY.FORCE_HTTPS) {
    app.use(forceHttpsMiddleware);
  }

  // リクエストログミドルウェア
  app.use(requestLoggingMiddleware);

  // ヘルスチェック用の早期ルート
  app.get('/health', healthCheckHandler);

  console.log('✅ ミドルウェア設定完了');
}

/**
 * セッション設定
 */
function setupSession(app) {
  const sessionConfig = {
    secret: CONFIG.SESSION.SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'oneagent.sid',
    cookie: {
      secure: CONFIG.SESSION.SECURE,
      httpOnly: CONFIG.SESSION.HTTP_ONLY,
      maxAge: CONFIG.SESSION.MAX_AGE,
      sameSite: CONFIG.SESSION.SAME_SITE
    }
  };

  // 本番環境でのセッションストア設定
  if (CONFIG.NODE_ENV === 'production') {
    // TODO: Redis や他の永続化ストアを使用
    console.log('⚠️ 本番環境でのセッションストア設定を検討してください');
  }

  app.use(session(sessionConfig));
}

/**
 * HTTPS 強制リダイレクトミドルウェア
 */
function forceHttpsMiddleware(req, res, next) {
  if (req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(`https://${req.header('host')}${req.url}`);
  }
  next();
}

/**
 * リクエストログミドルウェア
 */
function requestLoggingMiddleware(req, res, next) {
  const start = Date.now();
  const originalSend = res.send;

  // レスポンス送信時のログ記録
  res.send = function(body) {
    const duration = Date.now() - start;
    const contentLength = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body || '');

    // ログレベルに応じてログ出力
    if (CONFIG.DEBUG.VERBOSE_LOGGING || res.statusCode >= 400) {
      console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms - ${contentLength}bytes`);
    }

    // エラーレスポンスの詳細ログ
    if (res.statusCode >= 500) {
      console.error(`🚨 サーバーエラー: ${req.method} ${req.originalUrl}`, {
        statusCode: res.statusCode,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        body: CONFIG.DEBUG.ENABLED ? req.body : '[HIDDEN]'
      });
    }

    return originalSend.call(this, body);
  };

  next();
}

/**
 * ヘルスチェックハンドラー
 */
function healthCheckHandler(req, res) {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime),
      human: formatUptime(uptime)
    },
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
    },
    version: process.env.npm_package_version || '1.0.0',
    nodeVersion: process.version,
    environment: CONFIG.NODE_ENV
  };

  // 追加のシステム情報（開発環境のみ）
  if (CONFIG.DEBUG.ENABLED) {
    healthData.debug = {
      platform: process.platform,
      arch: process.arch,
      cpuUsage: process.cpuUsage(),
      loadAverage: process.platform !== 'win32' ? require('os').loadavg() : null
    };
  }

  res.json(healthData);
}

/**
 * アップタイムの人間が読める形式への変換
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0) parts.push(`${secs}s`);

  return parts.join(' ') || '0s';
}

/**
 * エラーハンドリングミドルウェアの設定
 */
export function setupErrorHandling(app, oauthSystem) {
  // 404 ハンドラー
  app.use((req, res, next) => {
    res.status(404).json({
      error: 'not_found',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      timestamp: new Date().toISOString()
    });
  });

  // OAuth エラーハンドラー
  if (oauthSystem) {
    app.use(oauthSystem.middleware.errorHandler);
  }

  // 一般的なエラーハンドラー
  app.use((error, req, res, next) => {
    console.error('💥 未処理エラー:', error);

    const statusCode = error.statusCode || error.status || 500;
    const errorResponse = {
      error: error.code || 'internal_server_error',
      message: CONFIG.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message,
      timestamp: new Date().toISOString()
    };

    // 開発環境でのスタックトレース
    if (CONFIG.DEBUG.ENABLED && error.stack) {
      errorResponse.stack = error.stack;
    }

    res.status(statusCode).json(errorResponse);
  });
}

/**
 * 静的ファイル配信の設定
 */
export function setupStaticFiles(app) {
  // 開発環境では無効（Viteが処理）
  if (CONFIG.NODE_ENV === 'development') {
    return;
  }
  
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  const staticPath = path.resolve(__dirname, '../../ai-agent-chat/dist');
  
  // 静的ファイル配信
  app.use(express.static(staticPath, {
    maxAge: CONFIG.NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
    lastModified: true
  }));

  // SPA フォールバック
  app.get('*', (req, res, next) => {
    // API ルートは除外
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/oauth') || 
        req.path.startsWith('/mcp') ||
        req.path.startsWith('/tools')) {
      return next();
    }

    const indexPath = path.join(staticPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        next(err);
      }
    });
  });
}

/**
 * 開発環境用ミドルウェア
 */
export function setupDevelopmentMiddleware(app) {
  if (CONFIG.NODE_ENV !== 'development') {
    return;
  }

  console.log('🔧 開発環境用ミドルウェアを設定中...');

  // 詳細なエラー情報
  app.use((error, req, res, next) => {
    if (error) {
      console.error('🐛 開発環境エラー詳細:', {
        message: error.message,
        stack: error.stack,
        request: {
          method: req.method,
          url: req.originalUrl,
          headers: req.headers,
          body: req.body
        }
      });
    }
    next(error);
  });

  // 開発用ツール情報エンドポイント
  app.get('/dev/info', (req, res) => {
    res.json({
      environment: 'development',
      config: {
        debug: CONFIG.DEBUG,
        ai: {
          provider: CONFIG.AI.PROVIDER,
          model: CONFIG.AI.MODEL,
          streaming: CONFIG.AI.STREAMING
        },
        tools: {
          directory: CONFIG.TOOLS.DIRECTORY,
          reloadInterval: CONFIG.TOOLS.RELOAD_INTERVAL
        }
      },
      process: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      }
    });
  });
}

/**
 * API バージョニング用ミドルウェア
 */
export function setupAPIVersioning(app) {
  // API バージョンヘッダーの処理
  app.use('/api', (req, res, next) => {
    const apiVersion = req.headers['api-version'] || req.query.version || 'v1';
    req.apiVersion = apiVersion;
    
    // サポートされていないバージョンのチェック
    const supportedVersions = ['v1'];
    if (!supportedVersions.includes(apiVersion)) {
      return res.status(400).json({
        error: 'unsupported_api_version',
        message: `API version ${apiVersion} is not supported`,
        supportedVersions
      });
    }

    res.setHeader('API-Version', apiVersion);
    next();
  });
}

/**
 * メトリクス収集用ミドルウェア
 */
export function setupMetrics(app) {
  const metrics = {
    requests: 0,
    responses: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
    totalResponseTime: 0,
    errors: 0,
    startTime: Date.now()
  };

  app.use((req, res, next) => {
    const start = Date.now();
    metrics.requests++;

    const originalSend = res.send;
    res.send = function(...args) {
      const responseTime = Date.now() - start;
      metrics.totalResponseTime += responseTime;

      const statusClass = Math.floor(res.statusCode / 100);
      const statusKey = `${statusClass}xx`;
      if (metrics.responses[statusKey] !== undefined) {
        metrics.responses[statusKey]++;
      }

      if (res.statusCode >= 400) {
        metrics.errors++;
      }

      return originalSend.apply(this, args);
    };

    next();
  });

  // メトリクスエンドポイント
  app.get('/metrics', (req, res) => {
    const uptime = Date.now() - metrics.startTime;
    const avgResponseTime = metrics.requests > 0 
      ? Math.round(metrics.totalResponseTime / metrics.requests) 
      : 0;

    res.json({
      uptime: uptime,
      requests: {
        total: metrics.requests,
        rate: Math.round((metrics.requests / uptime) * 1000 * 60) // requests per minute
      },
      responses: metrics.responses,
      errors: {
        total: metrics.errors,
        rate: metrics.requests > 0 ? ((metrics.errors / metrics.requests) * 100).toFixed(2) + '%' : '0%'
      },
      performance: {
        averageResponseTime: avgResponseTime + 'ms'
      }
    });
  });

  return metrics;
}