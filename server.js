#!/usr/bin/env node

/**
 * OneAgent - メインサーバー (ユーザー設定管理統合版)
 * 動的ツール管理MCP対応サーバー + OAuth 2.0認証 + AIエージェント + ユーザー設定管理
 */

import express from 'express';
import session from 'express-session';
import { fileURLToPath } from 'url';
import path from 'path';

// 内部モジュール
import { CONFIG } from './lib/config/config.js';
import { setupMiddleware } from './lib/oauth/middleware.js';
import { initializeOAuth } from './lib/oauth/index.js';
import { ToolManager } from './lib/tools/manager.js';
import { AIAgent } from './lib/ai/agent.js';
import { setupRoutes } from './lib/api/routes.js';
import { createMcpEndpoints } from './lib/mcp/endpoints.js';
import { userConfigManager } from './lib/config/user-config-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * アプリケーション初期化（ユーザー設定管理対応版）
 */
class OneAgentServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.toolManager = null;
    this.aiAgent = null;
    this.oauthSystem = null;
    this.userConfigManager = userConfigManager;
    this.mcpCleanup = null;
  }

  async initialize() {
    console.log('🚀 OneAgent サーバーを初期化しています...');

    try {
      // ユーザー設定管理システム初期化
      console.log('👤 ユーザー設定管理システムを初期化中...');
      await this.userConfigManager.initialize();

      // OAuth 2.0認証システム初期化
      console.log('🔐 OAuth 2.0認証システムを初期化中...');
      this.oauthSystem = await initializeOAuth();

      // ツール管理システム初期化
      console.log('🛠️ ツール管理システムを初期化中...');
      this.toolManager = new ToolManager();
      await this.toolManager.loadTools();

      // AIエージェント初期化（システムデフォルト設定）
      console.log('🤖 AIエージェント（システムデフォルト）を初期化中...');
      this.aiAgent = new AIAgent(this.toolManager);

      // ミドルウェア設定
      console.log('⚙️ ミドルウェアを設定中...');
      setupMiddleware(this.app, this.oauthSystem);

      // APIルート設定
      console.log('🛣️ APIルートを設定中...');
      setupRoutes(this.app, {
        toolManager: this.toolManager,
        aiAgent: this.aiAgent,
        oauthSystem: this.oauthSystem,
        userConfigManager: this.userConfigManager
      });

      // MCP エンドポイント設定
      console.log('🔗 MCPエンドポイントを設定中...');
      this.mcpCleanup = createMcpEndpoints(this.app, this.toolManager);

      console.log('✅ サーバー初期化完了');

    } catch (error) {
      console.error('❌ サーバー初期化エラー:', error);
      throw error;
    }
  }

  async start() {
    try {
      await this.initialize();

      // HTTPサーバー起動
      this.server = this.app.listen(CONFIG.SERVER.PORT, CONFIG.SERVER.HOST, () => {
        this.printStartupInfo();
      });

      // グレースフルシャットダウン設定
      this.setupGracefulShutdown();

    } catch (error) {
      console.error('❌ サーバー起動エラー:', error);
      process.exit(1);
    }
  }

  async printStartupInfo() {
    const baseUrl = `http://${CONFIG.SERVER.HOST}:${CONFIG.SERVER.PORT}`;

    // ユーザー設定統計を取得
    const userConfigStats = await this.userConfigManager.getStatistics();

    console.log('\n🎉 OneAgent サーバーが起動しました!');
    console.log('═'.repeat(70));
    console.log(`📍 サーバーURL: ${baseUrl}`);
    console.log('');
    console.log('🔗 主要エンドポイント:');
    console.log(`   WebUI:           ${baseUrl} (フロントエンド)`);
    console.log(`   ヘルスチェック:   ${baseUrl}/health`);
    console.log(`   OAuth認証:       ${baseUrl}/oauth/authorize`);
    console.log(`   AIエージェント:   ${baseUrl}/agent`);
    console.log(`   ツール管理:      ${baseUrl}/tools`);
    console.log(`   ユーザー設定:    ${baseUrl}/config/user`);
    console.log(`   MCP:            ${baseUrl}/mcp`);
    console.log('');
    console.log('🛠️ システム情報:');
    console.log(`   読み込み済みツール: ${this.toolManager.tools.size}個`);
    console.log(`   ツールディレクトリ: ${CONFIG.TOOLS.DIRECTORY}`);
    console.log(`   AIプロバイダー:    ${CONFIG.AI.PROVIDER.toUpperCase()}`);
    console.log(`   OAuth認証:        ${this.oauthSystem ? '✅ 有効' : '❌ 無効'}`);
    console.log(`   ユーザー設定管理:  ${this.userConfigManager.initialized ? '✅ 有効' : '❌ 無効'}`);

    if (CONFIG.AI.PROVIDER === 'localllm') {
      console.log(`   ローカルLLM URL:  ${CONFIG.AI.LOCAL_LLM_URL}`);
      console.log(`   モデル:           ${CONFIG.AI.LOCAL_LLM_MODEL}`);
    } else {
      console.log(`   モデル:           ${CONFIG.AI.MODEL}`);
    }

    console.log('');
    console.log('👥 ユーザー設定統計:');
    if (userConfigStats.safeMode) {
      console.log('   安全モード:          有効（詳細統計無効化）');
      console.log('   キャッシュ統計:      利用可能');
    } else {
      console.log(`   登録済みユーザー:      ${userConfigStats.totalUsers}人`);
      console.log(`   カスタム設定ユーザー:  ${userConfigStats.usersWithCustomSettings}人`);
      if (userConfigStats.providerDistribution && Object.keys(userConfigStats.providerDistribution).length > 0) {
        console.log('   プロバイダー分布:');
        Object.entries(userConfigStats.providerDistribution).forEach(([provider, count]) => {
          console.log(`     ${provider}: ${count}人`);
        });
      }
    }

    console.log('');
    console.log('💡 次のステップ:');
    console.log('   1. WebUIでログイン（admin/admin123 または demo/demo123）');
    console.log('   2. 設定ボタンから個人用AI設定をカスタマイズ');
    console.log('   3. ツールを選択してAIエージェントと対話');
    console.log('   4. 独自ツールの作成: node create-tool.js --interactive');
    console.log('');
    console.log('🔧 主要機能:');
    console.log('   • ユーザーごとの個別AI設定（プロバイダー、モデル、APIキーなど）');
    console.log('   • システム設定とユーザー設定の階層管理');
    console.log('   • 管理者によるシステム全体設定とユーザー統計');
    console.log('   • 設定の動的反映（サーバー再起動不要）');
    console.log('   • 安全モード対応（ファイルI/O最適化）');
    console.log('═'.repeat(70));
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\n${signal} 受信: サーバーを終了しています...`);

      try {
        // HTTPサーバーを終了
        if (this.server) {
          await new Promise((resolve) => {
            this.server.close(resolve);
          });
        }

        // MCPセッションのクリーンアップ
        if (this.mcpCleanup && typeof this.mcpCleanup.cleanup === 'function') {
          await this.mcpCleanup.cleanup();
        }

        // ユーザー設定管理システムのクリーンアップ
        if (this.userConfigManager && this.userConfigManager.initialized) {
          await this.userConfigManager.cleanup();
        }

        // OAuth システムのクリーンアップ
        if (this.oauthSystem && this.oauthSystem.cleanup) {
          await this.oauthSystem.cleanup();
        }

        // ツール管理システムのクリーンアップ
        if (this.toolManager && this.toolManager.cleanup) {
          await this.toolManager.cleanup();
        }

        console.log('✅ サーバーが正常に終了しました');
        process.exit(0);

      } catch (error) {
        console.error('❌ シャットダウンエラー:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // 未処理のPromise拒否をキャッチ
    process.on('unhandledRejection', (reason, promise) => {
      console.error('未処理のPromise拒否:', reason);
      console.error('Promise:', promise);
    });

    // 未処理の例外をキャッチ
    process.on('uncaughtException', (error) => {
      console.error('未処理の例外:', error);
      process.exit(1);
    });
  }

  /**
   * 動的設定更新（開発・運用支援機能）
   */
  async reloadUserConfigs() {
    try {
      console.log('🔄 ユーザー設定を再読み込み中...');

      // ユーザー設定管理システムのキャッシュをクリア
      this.userConfigManager.userConfigCache.clear();
      await this.userConfigManager.loadSystemConfig();

      console.log('✅ ユーザー設定の再読み込み完了');
      return true;
    } catch (error) {
      console.error('❌ ユーザー設定再読み込みエラー:', error);
      return false;
    }
  }

  /**
   * システム健全性チェック
   */
  async getSystemHealth() {
    try {
      const health = {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        services: {
          server: 'running',
          oauth: this.oauthSystem ? 'active' : 'inactive',
          toolManager: this.toolManager ? 'active' : 'inactive',
          aiAgent: this.aiAgent && this.aiAgent.isInitialized ? 'active' : 'inactive',
          userConfigManager: this.userConfigManager.initialized ? 'active' : 'inactive'
        },
        statistics: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          tools: this.toolManager ? this.toolManager.getStatistics() : null,
          oauth: this.oauthSystem ? this.oauthSystem.getStats() : null,
          userConfigs: await this.userConfigManager.getStatistics(),
          ai: this.aiAgent ? this.aiAgent.getStatistics() : null
        }
      };

      // 健全性判定
      const services = Object.values(health.services);
      const inactiveServices = services.filter(status => status !== 'active' && status !== 'running');

      if (inactiveServices.length > 0) {
        health.status = 'degraded';
      }

      return health;
    } catch (error) {
      return {
        timestamp: new Date().toISOString(),
        status: 'unhealthy',
        error: error.message,
        services: {
          server: 'error'
        }
      };
    }
  }
}

/**
 * 開発・運用支援用のユーティリティ関数
 */
class OneAgentUtils {
  constructor(server) {
    this.server = server;
  }

  /**
   * ユーザー設定の一括管理
   */
  async manageUserConfigs() {
    const allConfigs = await this.server.userConfigManager.getAllUserConfigs();

    console.log('\n👥 ユーザー設定一覧:');
    console.log('═'.repeat(50));

    allConfigs.forEach(userConfig => {
      console.log(`📋 ${userConfig.userId}:`);
      console.log(`   カスタム設定: ${userConfig.hasCustomSettings ? 'あり' : 'なし'}`);
      console.log(`   最終更新: ${userConfig.lastUpdated || '未更新'}`);

      if (userConfig.hasCustomSettings) {
        const config = userConfig.config;
        if (config.AI_PROVIDER) console.log(`   プロバイダー: ${config.AI_PROVIDER}`);
        if (config.AI_MODEL) console.log(`   モデル: ${config.AI_MODEL}`);
        if (config.AI_TEMPERATURE !== undefined) console.log(`   Temperature: ${config.AI_TEMPERATURE}`);
      }
      console.log('');
    });

    return allConfigs;
  }

  /**
   * システム統計の表示
   */
  async showSystemStats() {
    const health = await this.server.getSystemHealth();

    console.log('\n📊 システム統計:');
    console.log('═'.repeat(50));
    console.log(`状態: ${health.status}`);
    console.log(`稼働時間: ${Math.floor(health.statistics.uptime / 60)}分`);
    console.log(`メモリ使用量: ${Math.round(health.statistics.memory.used / 1024 / 1024)}MB`);
    console.log('');

    if (health.statistics.userConfigs) {
      const userStats = health.statistics.userConfigs;
      if (userStats.safeMode) {
        console.log('👥 ユーザー設定統計:');
        console.log('   安全モード: 有効（詳細統計無効化）');
      } else {
        console.log('👥 ユーザー設定統計:');
        console.log(`   総ユーザー数: ${userStats.totalUsers}`);
        console.log(`   カスタム設定ユーザー: ${userStats.usersWithCustomSettings}`);
      }
      console.log('');
    }

    return health;
  }

  /**
   * 設定のバックアップ
   */
  async backupConfigs() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupData = {
        timestamp,
        systemConfig: await this.server.userConfigManager.loadSystemConfig(),
        userConfigs: await this.server.userConfigManager.getAllUserConfigs(),
        oauthStats: this.server.oauthSystem.getStats(),
        toolStats: this.server.toolManager.getStatistics()
      };

      const fs = await import('fs/promises');
      const path = await import('path');

      const backupDir = path.join(CONFIG.DATABASE.DATA_DIR, 'backups');
      await fs.mkdir(backupDir, { recursive: true });

      const backupFile = path.join(backupDir, `oneagent-backup-${timestamp}.json`);
      await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));

      console.log(`💾 設定をバックアップしました: ${backupFile}`);
      return backupFile;
    } catch (error) {
      console.error('❌ バックアップエラー:', error);
      throw error;
    }
  }
}

/**
 * メイン実行
 */
async function main() {
  const server = new OneAgentServer();
  await server.start();

  // 開発環境での追加機能
  if (CONFIG.NODE_ENV === 'development') {
    const utils = new OneAgentUtils(server);

    // グローバルオブジェクトに公開（デバッグ用）
    global.oneAgentServer = server;
    global.oneAgentUtils = utils;

    console.log('\n🔧 開発モード: デバッグ用オブジェクトを公開');
    console.log('   global.oneAgentServer - サーバーインスタンス');
    console.log('   global.oneAgentUtils - ユーティリティ関数');
  }

  return server;
}

// スクリプト直接実行時
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { OneAgentServer, OneAgentUtils };