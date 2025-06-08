/**
 * ツール管理システム（外部スクリプト自動実行版）
 * 動的ツール読み込み、実行、管理機能
 * install-file-manager-tool.js自動実行機能
 */

import fs from 'fs/promises';
import { existsSync, statSync, watchFile, unwatchFile } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { CONFIG } from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ツール管理クラス（外部スクリプト自動実行版）
 */
export class ToolManager {
  constructor() {
    this.tools = new Map();
    this.toolHandlers = new Map();
    this.watchedFiles = new Set();
    this.loadingPromises = new Map();
    this.stats = {
      totalLoaded: 0,
      loadErrors: 0,
      executions: 0,
      executionErrors: 0,
      lastReload: null,
      autoInstalled: 0
    };
  }

  /**
   * ツールの読み込み（外部スクリプト自動実行版）
   */
  async loadTools() {
    try {
      const toolsDir = CONFIG.TOOLS.DIRECTORY;
      
      // ツールディレクトリの存在確認
      if (!existsSync(toolsDir)) {
        console.log(`📁 ツールディレクトリが存在しません。作成中: ${toolsDir}`);
        await fs.mkdir(toolsDir, { recursive: true });
        
        // 🔧 修正: 外部スクリプトを自動実行してセキュアファイル管理ツールをインストール
        console.log('🚀 初回起動につき、セキュアファイル管理ツールを自動インストールします...');
        await this.runSecureFileManagerInstaller();
        
        console.log(`✅ ツールディレクトリを作成しました: ${toolsDir}`);
      }

      console.log(`🔍 ツールディレクトリをスキャン中: ${toolsDir}`);

      const entries = await fs.readdir(toolsDir, { withFileTypes: true });
      const toolDirs = entries.filter(entry => entry.isDirectory());

      // セキュアファイル管理ツールの存在確認と自動インストール
      const hasSecureFileManager = toolDirs.some(dir => dir.name === 'user_file_manager');
      if (!hasSecureFileManager) {
        console.log('🔍 user_file_manager が見つかりません。自動インストールします...');
        await this.runSecureFileManagerInstaller();
        
        // 再度ディレクトリをスキャン
        const updatedEntries = await fs.readdir(toolsDir, { withFileTypes: true });
        toolDirs.push(...updatedEntries.filter(entry => 
          entry.isDirectory() && !toolDirs.some(existing => existing.name === entry.name)
        ));
      }

      if (toolDirs.length === 0) {
        console.log(`📦 ツールが見つかりません。`);
        this.displayToolInstallationGuide();
        
        this.stats.totalLoaded = 0;
        this.stats.loadErrors = 0;
        this.stats.lastReload = new Date().toISOString();
        
        return { success: 0, errors: 0 };
      }

      const loadPromises = toolDirs.map(toolDir => 
        this.loadTool(toolDir.name, path.join(toolsDir, toolDir.name))
      );

      const results = await Promise.allSettled(loadPromises);
      
      // 結果の集計
      let successCount = 0;
      let errorCount = 0;
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          errorCount++;
          console.error(`❌ ツール読み込みエラー ${toolDirs[index].name}:`, result.reason);
        }
      });

      this.stats.totalLoaded = successCount;
      this.stats.loadErrors = errorCount;
      this.stats.lastReload = new Date().toISOString();

      console.log(`✅ ツール読み込み完了: ${successCount}個成功, ${errorCount}個エラー`);

      // 開発モードでのファイル監視
      if (CONFIG.DEBUG.TOOL_RELOAD_ON_CHANGE) {
        this.setupFileWatching();
      }

      return { success: successCount, errors: errorCount };

    } catch (error) {
      console.error('❌ ツール読み込みエラー:', error);
      throw error;
    }
  }

  /**
   * 🚀 修正版: 外部スクリプトを実行してセキュアファイル管理ツールをインストール
   */
  async runSecureFileManagerInstaller() {
    return new Promise((resolve, reject) => {
      console.log('🛠️ install-file-manager-tool.js を自動実行中...');
      
      // プロジェクトルートディレクトリを取得
      const projectRoot = path.resolve(__dirname, '../../');
      const installerScript = path.join(projectRoot, 'install-file-manager-tool.js');
      
      // スクリプトファイルの存在確認
      if (!existsSync(installerScript)) {
        console.error(`❌ インストールスクリプトが見つかりません: ${installerScript}`);
        return reject(new Error(`インストールスクリプトが見つかりません: ${installerScript}`));
      }
      
      console.log(`📄 インストールスクリプト実行: ${installerScript}`);
      
      // child_processでnode install-file-manager-tool.jsを実行
      const child = spawn('node', [installerScript], {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32' // Windowsでは shell: true が必要な場合がある
      });
      
      let stdout = '';
      let stderr = '';
      
      // 標準出力をキャプチャ
      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        // リアルタイムでログ出力（プレフィックス付き）
        output.split('\n').filter(line => line.trim()).forEach(line => {
          console.log(`[installer] ${line}`);
        });
      });
      
      // 標準エラーをキャプチャ
      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        // エラーもリアルタイムで出力
        output.split('\n').filter(line => line.trim()).forEach(line => {
          console.error(`[installer:error] ${line}`);
        });
      });
      
      // プロセス終了時の処理
      child.on('close', (code) => {
        if (code === 0) {
          console.log('✅ セキュアファイル管理ツールの自動インストールが完了しました！');
          console.log('🔧 外部スクリプト実行により、手動実行と同じ品質でインストールされました');
          
          this.stats.autoInstalled++;
          resolve();
        } else {
          console.error(`❌ インストールスクリプトがエラーコード ${code} で終了しました`);
          if (stderr) {
            console.error('エラー詳細:', stderr);
          }
          reject(new Error(`インストールスクリプト実行失敗: exit code ${code}`));
        }
      });
      
      // プロセス開始エラーの処理
      child.on('error', (error) => {
        console.error('❌ インストールスクリプト実行エラー:', error);
        reject(error);
      });
      
      // タイムアウト処理（60秒）
      const timeout = setTimeout(() => {
        console.error('❌ インストールスクリプトがタイムアウトしました（60秒）');
        child.kill();
        reject(new Error('インストールスクリプトタイムアウト'));
      }, 60000);
      
      // プロセス終了時にタイムアウトをクリア
      child.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * ツールインストールガイドの表示（修正版）
   */
  displayToolInstallationGuide() {
    console.log('\n🛠️ ツールインストールガイド');
    console.log('═'.repeat(50));
    console.log('ツールが見つかりません。以下の方法でツールをインストールしてください：');
    console.log('');
    console.log('🚀 自動インストール（推奨）:');
    console.log('   node install-file-manager-tool.js');
    console.log('   ※ サーバー起動時に自動実行されます');
    console.log('');
    console.log('🔧 カスタムツール作成:');
    console.log('   node create-tool.js --interactive');
    console.log('');
    console.log('📁 ツールディレクトリ:');
    console.log(`   ${CONFIG.TOOLS.DIRECTORY}`);
    console.log('');
    console.log('🎯 自動インストール対象ツール:');
    console.log('   • user_file_manager (OAuth認証セキュアファイル管理)');
    console.log('   • 1GB/ユーザー専用領域');
    console.log('   • 拡張子チェック機能（手動実行版と同じ品質）');
    console.log('   • 詳細なアクセスログ');
    console.log('   • 50MB/ファイル、10,000ファイル制限');
    console.log('═'.repeat(50));
  }

  /**
   * 個別ツールの読み込み
   */
  async loadTool(toolName, toolPath) {
    try {
      const configPath = path.join(toolPath, 'config.json');
      const handlerPath = path.join(toolPath, 'handler.js');

      // 設定ファイルの確認
      if (!existsSync(configPath)) {
        throw new Error(`設定ファイルが見つかりません: ${configPath}`);
      }

      // ハンドラーファイルの確認
      if (!existsSync(handlerPath)) {
        throw new Error(`ハンドラーファイルが見つかりません: ${handlerPath}`);
      }

      // 設定ファイルの読み込み
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);

      // 設定の検証
      this.validateToolConfig(config, toolName);

      // アイコンファイルの確認
      let iconPath = null;
      if (config.icon && config.icon.filename) {
        const potentialIconPath = path.join(toolPath, config.icon.filename);
        if (existsSync(potentialIconPath)) {
          iconPath = potentialIconPath;
        } else {
          console.warn(`⚠️ アイコンファイルが見つかりません: ${config.icon.filename}`);
        }
      }

      // ツール情報を保存
      const toolInfo = {
        name: config.name || toolName,
        description: config.description || `${toolName} ツール`,
        inputSchema: config.inputSchema || { type: "object", properties: {} },
        version: config.version || "1.0.0",
        security: config.security || { requiresAuth: false },
        handlerPath: handlerPath,
        configPath: configPath,
        icon: config.icon || null,
        iconPath: iconPath,
        loadedAt: new Date().toISOString(),
        lastModified: statSync(handlerPath).mtime.toISOString(),
        autoInstalled: toolName === 'user_file_manager' && this.stats.autoInstalled > 0
      };

      this.tools.set(toolName, toolInfo);

      // ファイル監視対象に追加
      if (CONFIG.DEBUG.TOOL_RELOAD_ON_CHANGE) {
        this.watchedFiles.add(configPath);
        this.watchedFiles.add(handlerPath);
      }

      const iconInfo = config.icon ? ' 🎨' : '';
      const securityInfo = config.security?.requiresAuth ? ' 🔒' : '';
      const autoInstallInfo = toolInfo.autoInstalled ? ' 🚀' : '';
      
      console.log(`  📦 ツール「${toolName}」を読み込み${iconInfo}${securityInfo}${autoInstallInfo}`);

      return toolInfo;

    } catch (error) {
      console.warn(`  ⚠️ ツール「${toolName}」の読み込み失敗: ${error.message}`);
      throw error;
    }
  }

  /**
   * ツール設定の検証
   */
  validateToolConfig(config, toolName) {
    if (!config.name) {
      throw new Error('ツール名が設定されていません');
    }

    if (!config.description) {
      throw new Error('ツールの説明が設定されていません');
    }

    if (!config.inputSchema || typeof config.inputSchema !== 'object') {
      throw new Error('有効な入力スキーマが設定されていません');
    }

    // セキュリティ設定の検証
    if (config.security) {
      if (typeof config.security.requiresAuth !== 'boolean') {
        console.warn(`⚠️ ツール「${toolName}」: security.requiresAuth は boolean である必要があります`);
      }

      if (config.security.scopes && !Array.isArray(config.security.scopes)) {
        console.warn(`⚠️ ツール「${toolName}」: security.scopes は配列である必要があります`);
      }
    }
  }

  /**
   * ツールハンドラーの実行
   */
  async executeToolHandler(toolName, args, authContext = null) {
    const startTime = Date.now();
    
    try {
      const tool = this.tools.get(toolName);
      if (!tool) {
        throw new Error(`ツール「${toolName}」が見つかりません`);
      }

      // 認証チェック
      if (tool.security?.requiresAuth && !authContext) {
        throw new Error(`ツール「${toolName}」は認証が必要です`);
      }

      // スコープチェック
      if (tool.security?.requiresAuth && tool.security?.scopes && authContext) {
        const requiredScopes = tool.security.scopes;
        const userScopes = authContext.scopes || [];
        
        const hasRequiredScope = requiredScopes.some(scope => 
          userScopes.includes(scope) || userScopes.includes('admin')
        );

        if (!hasRequiredScope) {
          throw new Error(`必要なスコープが不足しています: ${requiredScopes.join(', ')}`);
        }
      }

      // ハンドラーの読み込み（キャッシュまたは新規読み込み）
      if (!this.toolHandlers.has(toolName)) {
        await this.loadToolHandler(toolName, tool);
      }

      const handler = this.toolHandlers.get(toolName);

      if (typeof handler !== 'function') {
        throw new Error(`ツール「${toolName}」のハンドラーが正しく定義されていません`);
      }

      console.log(`🔧 ツール実行開始: ${toolName}`);
      
      // ハンドラー実行
      const result = await handler(args, authContext);

      // 実行時間の記録
      const executionTime = Date.now() - startTime;
      console.log(`✅ ツール実行完了: ${toolName} (${executionTime}ms)`);

      // 統計更新
      this.stats.executions++;

      // 結果の検証
      this.validateToolResult(result, toolName);

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ ツール実行エラー: ${toolName} (${executionTime}ms)`, error);
      
      // 統計更新
      this.stats.executionErrors++;

      throw new Error(`ツール「${toolName}」の実行エラー: ${error.message}`);
    }
  }

  /**
   * ツールハンドラーの読み込み
   */
  async loadToolHandler(toolName, tool) {
    try {
      // 既存のハンドラーをクリア（リロード対応）
      if (this.toolHandlers.has(toolName)) {
        this.toolHandlers.delete(toolName);
      }

      // キャッシュバスターを使用してモジュール読み込み
      const cacheBuster = `?t=${Date.now()}&v=${tool.version}`;
      const handlerModule = await import(`file://${tool.handlerPath}${cacheBuster}`);
      
      const handler = handlerModule.default || handlerModule;
      this.toolHandlers.set(toolName, handler);

      console.log(`📥 ハンドラー読み込み: ${toolName}`);

    } catch (error) {
      console.error(`❌ ハンドラー読み込みエラー: ${toolName}`, error);
      throw new Error(`ハンドラー読み込み失敗: ${error.message}`);
    }
  }

  /**
   * ツール実行結果の検証
   */
  validateToolResult(result, toolName) {
    if (!result || typeof result !== 'object') {
      throw new Error('ツールは有効なオブジェクトを返す必要があります');
    }

    if (!result.content || !Array.isArray(result.content)) {
      throw new Error('ツール結果にcontentプロパティ（配列）が必要です');
    }

    for (const item of result.content) {
      if (!item.type || typeof item.type !== 'string') {
        throw new Error('content項目にはtypeプロパティが必要です');
      }

      if (item.type === 'text' && typeof item.text !== 'string') {
        throw new Error('text型のcontent項目にはtextプロパティが必要です');
      }
    }
  }

  /**
   * ツール一覧の取得
   */
  getToolsList() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      version: tool.version,
      security: tool.security,
      icon: tool.icon,
      hasIcon: !!tool.iconPath,
      loadedAt: tool.loadedAt,
      lastModified: tool.lastModified,
      autoInstalled: tool.autoInstalled || false
    }));
  }

  /**
   * OpenAI関数呼び出し形式でのツール定義取得
   */
  getOpenAITools() {
    return Array.from(this.tools.values()).map(tool => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));
  }

  /**
   * 選択されたツールのOpenAI定義取得
   */
  getSelectedOpenAITools(selectedToolNames) {
    if (!selectedToolNames || selectedToolNames.length === 0) {
      return [];
    }

    const selectedTools = [];
    const notFoundTools = [];

    for (const toolName of selectedToolNames) {
      const tool = this.tools.get(toolName);
      if (tool) {
        selectedTools.push({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
          }
        });
      } else {
        notFoundTools.push(toolName);
      }
    }

    if (notFoundTools.length > 0) {
      console.warn(`⚠️ 以下のツールが見つかりません: ${notFoundTools.join(', ')}`);
    }

    return selectedTools;
  }

  /**
   * 選択されたツールの検証
   */
  validateSelectedTools(selectedToolNames) {
    if (!selectedToolNames || selectedToolNames.length === 0) {
      return { valid: true, notFound: [] };
    }

    const notFound = [];
    for (const toolName of selectedToolNames) {
      if (!this.tools.has(toolName)) {
        notFound.push(toolName);
      }
    }

    return {
      valid: notFound.length === 0,
      notFound: notFound
    };
  }

  /**
   * ツールアイコンの取得
   */
  async getToolIcon(toolName) {
    const tool = this.tools.get(toolName);
    if (!tool || !tool.iconPath) {
      return null;
    }

    try {
      const iconData = await fs.readFile(tool.iconPath, 'utf8');
      return {
        filename: tool.icon.filename,
        contentType: 'image/svg+xml',
        data: iconData
      };
    } catch (error) {
      console.error(`アイコン読み込みエラー ${toolName}:`, error.message);
      return null;
    }
  }

  /**
   * ツールのリロード
   */
  async reloadTools() {
    console.log("🔄 ツールをリロードしています...");
    
    try {
      // 既存のデータをクリア
      this.tools.clear();
      this.toolHandlers.clear();
      
      // ファイル監視を停止
      this.stopFileWatching();
      
      // ツールを再読み込み
      const result = await this.loadTools();
      
      console.log(`✅ ツールリロード完了: ${result.success}個成功, ${result.errors}個エラー`);
      
      return result;
      
    } catch (error) {
      console.error('❌ ツールリロードエラー:', error);
      throw error;
    }
  }

  /**
   * 個別ツールのリロード
   */
  async reloadTool(toolName) {
    try {
      const existingTool = this.tools.get(toolName);
      if (!existingTool) {
        throw new Error(`ツール「${toolName}」が見つかりません`);
      }

      // ハンドラーキャッシュをクリア
      this.toolHandlers.delete(toolName);

      // ツールを再読み込み
      const toolPath = path.dirname(existingTool.handlerPath);
      await this.loadTool(toolName, toolPath);

      console.log(`✅ ツール「${toolName}」を個別リロードしました`);

    } catch (error) {
      console.error(`❌ ツール「${toolName}」のリロードエラー:`, error);
      throw error;
    }
  }

  /**
   * ファイル監視の設定
   */
  setupFileWatching() {
    if (!CONFIG.DEBUG.TOOL_RELOAD_ON_CHANGE) {
      return;
    }

    console.log('👀 ツールファイルの監視を開始しました');

    for (const filePath of this.watchedFiles) {
      watchFile(filePath, { interval: 1000 }, async (curr, prev) => {
        if (curr.mtime > prev.mtime) {
          console.log(`📝 ファイル変更を検出: ${filePath}`);
          
          try {
            // 該当するツールを特定
            const toolName = Array.from(this.tools.entries())
              .find(([name, tool]) => 
                tool.handlerPath === filePath || tool.configPath === filePath
              )?.[0];

            if (toolName) {
              await this.reloadTool(toolName);
            }
          } catch (error) {
            console.error('ファイル変更時のリロードエラー:', error);
          }
        }
      });
    }
  }

  /**
   * ファイル監視の停止
   */
  stopFileWatching() {
    for (const filePath of this.watchedFiles) {
      unwatchFile(filePath);
    }
    this.watchedFiles.clear();
  }

  /**
   * 統計情報の取得
   */
  getStatistics() {
    const tools = Array.from(this.tools.values());
    
    return {
      ...this.stats,
      tools: {
        total: this.tools.size,
        withAuth: tools.filter(t => t.security?.requiresAuth).length,
        withIcons: tools.filter(t => t.iconPath).length,
        autoInstalled: tools.filter(t => t.autoInstalled).length,
        byVersion: tools.reduce((acc, tool) => {
          const version = tool.version || 'unknown';
          acc[version] = (acc[version] || 0) + 1;
          return acc;
        }, {})
      },
      memory: {
        loadedHandlers: this.toolHandlers.size,
        watchedFiles: this.watchedFiles.size
      },
      autoInstall: {
        enabled: true,
        method: 'external_script', // 🔧 追加: 実行方法を示す
        secureFileManagerInstalled: this.tools.has('user_file_manager'),
        installationCount: this.stats.autoInstalled,
        scriptPath: 'install-file-manager-tool.js' // 🔧 追加: スクリプトパス
      },
      installationGuide: {
        autoCommand: 'node install-file-manager-tool.js',
        manualCommand: 'node install-file-manager-tool.js',
        customCommand: 'node create-tool.js --interactive',
        toolsDirectory: CONFIG.TOOLS.DIRECTORY,
        note: '外部スクリプト実行により手動実行と同じ品質を保証' // 🔧 追加
      }
    };
  }

  /**
   * クリーンアップ
   */
  async cleanup() {
    console.log('🧹 ツール管理システムをクリーンアップ中...');
    
    // ファイル監視を停止
    this.stopFileWatching();
    
    // キャッシュをクリア
    this.tools.clear();
    this.toolHandlers.clear();
    
    console.log('✅ ツール管理システムクリーンアップ完了');
  }
}