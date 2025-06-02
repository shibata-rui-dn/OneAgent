/**
 * OAuth 2.0 認証システム統合
 * データベース、サーバー、ミドルウェアの初期化とエクスポート
 */

import { CONFIG } from '../config/config.js';
import { OAuthDatabase } from './database.js';
import { OAuthServer } from './server.js';
import { 
  createAuthMiddleware,
  requireScope,
  requireRole,
  requireAdmin,
  optionalAuth,
  requireResourceOwner,
  createRateLimitMiddleware,
  createIPWhitelistMiddleware,
  securityHeaders,
  createCorsMiddleware,
  errorHandler
} from './middleware.js';

/**
 * OAuth システム初期化
 */
export async function initializeOAuth() {
  try {
    console.log('🔐 OAuth 2.0認証システムを初期化中...');

    // データベース初期化
    const database = new OAuthDatabase();
    await database.initialize();

    // サーバー初期化
    const server = new OAuthServer(database);

    // ミドルウェア作成
    const authMiddleware = createAuthMiddleware(database);
    const rateLimitMiddleware = createRateLimitMiddleware();

    // 統計情報取得用の関数
    const getStats = () => database.getStatistics();

    // 定期的なクリーンアップタスク開始
    startCleanupTasks(database);

    console.log('✅ OAuth 2.0認証システムが正常に初期化されました');
    console.log('🔧 ミドルウェア設定確認:');
    console.log('  requireAdmin type:', typeof requireAdmin);
    console.log('  requireAdmin():', typeof requireAdmin());

    return {
      database,
      server,
      middleware: {
        auth: authMiddleware,
        optionalAuth: optionalAuth(database),
        requireScope,
        requireRole,
        requireAdmin: requireAdmin(), 
        requireResourceOwner,
        rateLimit: rateLimitMiddleware,
        security: securityHeaders(),
        cors: createCorsMiddleware(),
        errorHandler: errorHandler()
      },
      getStats,
      cleanup: () => cleanup(database)
    };

  } catch (error) {
    console.error('❌ OAuth 2.0認証システム初期化エラー:', error);
    throw error;
  }
}

/**
 * クリーンアップタスクの開始
 */
function startCleanupTasks(database) {
  // 期限切れトークンのクリーンアップ（1時間ごと）
  const tokenCleanupInterval = setInterval(() => {
    database.cleanupExpiredTokens().catch(error => {
      console.error('トークンクリーンアップエラー:', error);
    });
  }, 60 * 60 * 1000); // 1時間

  // データベースバックアップ（設定に基づく）
  if (CONFIG.DATABASE.BACKUP_ENABLED) {
    const backupInterval = setInterval(async () => {
      try {
        await backupDatabase(database);
      } catch (error) {
        console.error('データベースバックアップエラー:', error);
      }
    }, CONFIG.DATABASE.BACKUP_INTERVAL);

    // クリーンアップ関数でインターバルをクリア
    database._cleanupIntervals = [tokenCleanupInterval, backupInterval];
  } else {
    database._cleanupIntervals = [tokenCleanupInterval];
  }
}

/**
 * データベースバックアップ
 */
async function backupDatabase(database) {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const backupDir = path.join(CONFIG.DATABASE.DATA_DIR, 'backups');
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // ユーザーデータのバックアップ
    const usersBackupPath = path.join(backupDir, `users_${timestamp}.json`);
    const usersData = Object.fromEntries(database.users);
    await fs.writeFile(usersBackupPath, JSON.stringify(usersData, null, 2));

    // 統計情報の記録
    const statsPath = path.join(backupDir, `stats_${timestamp}.json`);
    const stats = {
      timestamp: new Date().toISOString(),
      statistics: database.getStatistics(),
      config: {
        nodeEnv: CONFIG.NODE_ENV,
        version: process.env.npm_package_version || '1.0.0'
      }
    };
    await fs.writeFile(statsPath, JSON.stringify(stats, null, 2));

    console.log(`💾 データベースバックアップ完了: ${timestamp}`);

    // 古いバックアップファイルの削除（30日以上古いもの）
    await cleanupOldBackups(backupDir);

  } catch (error) {
    console.error('データベースバックアップエラー:', error);
    throw error;
  }
}

/**
 * 古いバックアップファイルのクリーンアップ
 */
async function cleanupOldBackups(backupDir) {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const files = await fs.readdir(backupDir);
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    for (const file of files) {
      const filePath = path.join(backupDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.mtime.getTime() < thirtyDaysAgo) {
        await fs.unlink(filePath);
        console.log(`🗑️ 古いバックアップファイルを削除: ${file}`);
      }
    }
  } catch (error) {
    console.error('バックアップクリーンアップエラー:', error);
  }
}

/**
 * システムクリーンアップ
 */
async function cleanup(database) {
  try {
    console.log('🧹 OAuth システムをクリーンアップ中...');

    // クリーンアップタスクの停止
    if (database._cleanupIntervals) {
      for (const interval of database._cleanupIntervals) {
        clearInterval(interval);
      }
      delete database._cleanupIntervals;
    }

    // 最終的なデータ保存
    await database.cleanup();

    console.log('✅ OAuth システムクリーンアップ完了');
  } catch (error) {
    console.error('OAuth システムクリーンアップエラー:', error);
    throw error;
  }
}

// 既存のエクスポートを維持
export {
  OAuthDatabase,
  OAuthServer,
  createAuthMiddleware,
  requireScope,
  requireRole,
  requireAdmin,
  optionalAuth,
  requireResourceOwner,
  createRateLimitMiddleware,
  createIPWhitelistMiddleware,
  securityHeaders,
  createCorsMiddleware,
  errorHandler
};