/**
 * ユーザー設定管理システム（安定版）
 * ファイルI/O最適化、安全モード対応
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { CONFIG } from './config.js';

/**
 * シンプルなキャッシュ管理クラス
 */
class SimpleCache {
  constructor(maxAge = 30000) { // 30秒
    this.cache = new Map();
    this.maxAge = maxAge;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
  }

  set(key, value) {
    const entry = {
      value,
      timestamp: Date.now()
    };
    
    this.cache.set(key, entry);
    this.stats.sets++;
  }

  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    const age = Date.now() - entry.timestamp;
    if (age > this.maxAge) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    return entry.value;
  }

  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    const age = Date.now() - entry.timestamp;
    if (age > this.maxAge) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  // 🔧 getStats()メソッドを完全安全化
getStats() {
  // ✅ ファイルI/O完全削除
  return {
    initialized: this.initialized,
    safeMode: true,
    cache: {
      size: this.userConfigCache?.cache?.size || 0,
      // hits/missesなどの詳細統計は削除
    },
    note: '完全安全版 - 統計詳細無効化',
    timestamp: new Date().toISOString()
  };
}
}

/**
 * ユーザー設定管理クラス（安定版）
 */
export class UserConfigManager {
    constructor() {
        this.userConfigsDir = path.resolve(CONFIG.DATABASE.DATA_DIR, 'user_configs');
        this.systemConfigCache = null;
        this.initialized = false;
        this.safeMode = true; // デフォルトで安全モード有効

        // シンプルなキャッシュシステム
        this.userConfigCache = new SimpleCache(60000); // 1分キャッシュ
        this.statisticsCache = new SimpleCache(30000); // 30秒キャッシュ

        // 設定可能な項目の定義
        this.CONFIGURABLE_KEYS = [
            // AI関連設定
            'AI_PROVIDER',
            'AI_MODEL',
            'AI_TEMPERATURE',
            'AI_STREAMING',
            'AI_MAX_TOKENS',
            'AI_TIMEOUT',

            // OpenAI設定
            'OPENAI_API_KEY',

            // Azure OpenAI設定
            'AZURE_OPENAI_ENDPOINT',
            'AZURE_OPENAI_API_VERSION',

            // ローカルLLM設定
            'LOCAL_LLM_URL',
            'LOCAL_LLM_MODEL',

            // 追加の設定項目
            'AI_SYSTEM_PROMPT',
            'AI_RESPONSE_FORMAT',
            'AI_SAFETY_ENABLED'
        ];

        // デフォルト値の定義
        this.DEFAULT_VALUES = {
            AI_PROVIDER: 'openai',
            AI_MODEL: 'gpt-4o-mini',
            AI_TEMPERATURE: 0.7,
            AI_STREAMING: true,
            AI_MAX_TOKENS: 2000,
            AI_TIMEOUT: 60000,
            AZURE_OPENAI_API_VERSION: '2024-02-15-preview',
            LOCAL_LLM_URL: 'http://localhost:8000',
            LOCAL_LLM_MODEL: 'Qwen/Qwen2.5-Coder-32B-Instruct',
            AI_SAFETY_ENABLED: true
        };
    }

    /**
     * 初期化
     */
    async initialize() {
        try {
            console.log('🚀 ユーザー設定管理システム（安定版）を初期化しています...');

            // ユーザー設定ディレクトリを作成
            await fs.mkdir(this.userConfigsDir, { recursive: true });

            // システム設定をキャッシュ
            await this.loadSystemConfig();

            this.initialized = true;
            
            console.log('✅ ユーザー設定管理システム（安定版）を初期化しました');
            console.log(`   設定ディレクトリ: ${this.userConfigsDir}`);
            console.log(`   設定可能項目: ${this.CONFIGURABLE_KEYS.length}個`);
            console.log(`   安全モード: ${this.safeMode ? '有効' : '無効'}`);
            
        } catch (error) {
            console.error('❌ ユーザー設定管理システム初期化エラー:', error);
            throw error;
        }
    }

    /**
     * システム設定の読み込み
     */
    async loadSystemConfig() {
        try {
            const systemConfig = {};

            // 設定可能な項目についてシステム設定を読み込み
            for (const key of this.CONFIGURABLE_KEYS) {
                if (key in CONFIG.AI || process.env[key]) {
                    switch (key) {
                        case 'AI_PROVIDER':
                            systemConfig[key] = CONFIG.AI.PROVIDER;
                            break;
                        case 'AI_MODEL':
                            systemConfig[key] = CONFIG.AI.MODEL;
                            break;
                        case 'AI_TEMPERATURE':
                            systemConfig[key] = CONFIG.AI.TEMPERATURE;
                            break;
                        case 'AI_STREAMING':
                            systemConfig[key] = CONFIG.AI.STREAMING;
                            break;
                        case 'AI_MAX_TOKENS':
                            systemConfig[key] = CONFIG.AI.MAX_TOKENS;
                            break;
                        case 'AI_TIMEOUT':
                            systemConfig[key] = CONFIG.AI.TIMEOUT;
                            break;
                        case 'OPENAI_API_KEY':
                            systemConfig[key] = CONFIG.AI.OPENAI_API_KEY ? '***SYSTEM***' : '';
                            break;
                        case 'AZURE_OPENAI_ENDPOINT':
                            systemConfig[key] = CONFIG.AI.AZURE_OPENAI_ENDPOINT;
                            break;
                        case 'AZURE_OPENAI_API_VERSION':
                            systemConfig[key] = CONFIG.AI.AZURE_OPENAI_API_VERSION;
                            break;
                        case 'LOCAL_LLM_URL':
                            systemConfig[key] = CONFIG.AI.LOCAL_LLM_URL;
                            break;
                        case 'LOCAL_LLM_MODEL':
                            systemConfig[key] = CONFIG.AI.LOCAL_LLM_MODEL;
                            break;
                        default:
                            systemConfig[key] = process.env[key] || this.DEFAULT_VALUES[key] || '';
                    }
                } else {
                    systemConfig[key] = this.DEFAULT_VALUES[key] || '';
                }
            }

            this.systemConfigCache = systemConfig;
            console.log(`📋 システム設定をキャッシュしました: ${Object.keys(systemConfig).length}項目`);
            
            return systemConfig;
        } catch (error) {
            console.error('システム設定読み込みエラー:', error);
            throw error;
        }
    }

    /**
     * ユーザー設定ファイルのパス取得
     */
    getUserConfigPath(userId) {
        return path.join(this.userConfigsDir, `${userId}.json`);
    }

    /**
     * ユーザー設定の読み込み
     */
    async loadUserConfig(userId) {
        // キャッシュ確認
        const cached = this.userConfigCache.get(userId);
        if (cached) {
            console.log(`📋 [CACHE] ユーザー設定キャッシュヒット: ${userId}`);
            return cached;
        }
        
        const configPath = this.getUserConfigPath(userId);
        
        try {
            if (!existsSync(configPath)) {
                console.log(`📝 ユーザー設定ファイルが存在しません: ${userId} (システムデフォルトを使用)`);
                return {};
            }

            const configData = await fs.readFile(configPath, 'utf8');
            const userConfig = JSON.parse(configData);

            // バリデーションを実行
            const validatedConfig = this.validateAndSanitizeConfig(userConfig);

            // キャッシュに保存
            this.userConfigCache.set(userId, validatedConfig);

            console.log(`📖 ユーザー設定を読み込み: ${userId} (${Object.keys(validatedConfig).length}項目)`);
            
            return validatedConfig;
            
        } catch (error) {
            console.error(`ユーザー設定読み込みエラー [${userId}]:`, error);
            return {};
        }
    }

    /**
     * ユーザー設定の保存
     */
    async saveUserConfig(userId, userConfig) {
        const configPath = this.getUserConfigPath(userId);
        
        try {
            // バリデーションを実行
            const validatedConfig = this.validateAndSanitizeConfig(userConfig);

            const configToSave = {
                ...validatedConfig,
                _metadata: {
                    userId,
                    updatedAt: new Date().toISOString(),
                    updatedBy: userId,
                    version: '2.0',
                    configKeys: Object.keys(validatedConfig)
                }
            };

            // 原子的書き込み（一時ファイル経由）
            const tempPath = `${configPath}.tmp.${Date.now()}`;
            
            try {
                await fs.writeFile(tempPath, JSON.stringify(configToSave, null, 2));
                await fs.rename(tempPath, configPath);
            } catch (writeError) {
                // 一時ファイルのクリーンアップ
                try {
                    if (existsSync(tempPath)) {
                        await fs.unlink(tempPath);
                    }
                } catch (cleanupError) {
                    console.warn(`一時ファイルクリーンアップエラー: ${cleanupError.message}`);
                }
                throw writeError;
            }

            // キャッシュを更新
            this.userConfigCache.set(userId, validatedConfig);

            // 統計キャッシュを無効化
            this.statisticsCache.clear();

            console.log(`💾 ユーザー設定を保存: ${userId} (${Object.keys(validatedConfig).length}項目)`);
            
            return configToSave;
            
        } catch (error) {
            console.error(`ユーザー設定保存エラー [${userId}]:`, error);
            throw error;
        }
    }

    /**
     * 設定の検証とサニタイズ
     */
    validateAndSanitizeConfig(config) {
        const sanitized = {};

        for (const [key, value] of Object.entries(config)) {
            // メタデータは除外
            if (key.startsWith('_')) continue;

            // 設定可能なキーのみ許可
            if (!this.CONFIGURABLE_KEYS.includes(key)) {
                console.warn(`⚠️ 無効な設定キー: ${key} (スキップ)`);
                continue;
            }

            // 値のバリデーション
            const validatedValue = this.validateConfigValue(key, value);
            if (validatedValue !== null) {
                sanitized[key] = validatedValue;
            }
        }

        return sanitized;
    }

    /**
     * 設定値のバリデーション
     */
    validateConfigValue(key, value) {
        try {
            switch (key) {
                case 'AI_PROVIDER':
                    return ['openai', 'azureopenai', 'localllm'].includes(value) ? value : null;

                case 'AI_MODEL':
                    return typeof value === 'string' && value.length > 0 ? value : null;

                case 'AI_TEMPERATURE':
                    const temp = parseFloat(value);
                    return !isNaN(temp) && temp >= 0 && temp <= 2 ? temp : null;

                case 'AI_STREAMING':
                    return typeof value === 'boolean' ? value : null;

                case 'AI_MAX_TOKENS':
                    const tokens = parseInt(value);
                    return !isNaN(tokens) && tokens > 0 && tokens <= 100000 ? tokens : null;

                case 'AI_TIMEOUT':
                    const timeout = parseInt(value);
                    return !isNaN(timeout) && timeout >= 1000 && timeout <= 300000 ? timeout : null;

                case 'OPENAI_API_KEY':
                    return typeof value === 'string' && value.length > 0 ? value : null;

                case 'AZURE_OPENAI_ENDPOINT':
                case 'LOCAL_LLM_URL':
                    try {
                        new URL(value);
                        return value;
                    } catch {
                        return null;
                    }

                case 'AZURE_OPENAI_API_VERSION':
                case 'LOCAL_LLM_MODEL':
                    return typeof value === 'string' && value.length > 0 ? value : null;

                case 'AI_SAFETY_ENABLED':
                    return typeof value === 'boolean' ? value : null;

                default:
                    return typeof value === 'string' ? value : null;
            }
        } catch (error) {
            console.warn(`⚠️ 設定値検証エラー ${key}:`, error);
            return null;
        }
    }

    /**
     * ユーザーの統合設定取得
     */
    async getUserMergedConfig(userId) {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            const systemConfig = this.systemConfigCache || await this.loadSystemConfig();
            const userConfig = await this.loadUserConfig(userId);

            // システム設定をベースにユーザー設定をマージ
            const mergedConfig = { ...systemConfig };

            // ユーザー設定で上書き（機密情報を適切に処理）
            for (const [key, value] of Object.entries(userConfig)) {
                if (this.CONFIGURABLE_KEYS.includes(key)) {
                    mergedConfig[key] = value;
                }
            }

            // APIキーのフォールバック処理
            if (!mergedConfig.OPENAI_API_KEY || mergedConfig.OPENAI_API_KEY === '***SYSTEM***') {
                mergedConfig.OPENAI_API_KEY = CONFIG.AI.OPENAI_API_KEY;
            }

            // Azure OpenAI Endpointのフォールバック
            if (!mergedConfig.AZURE_OPENAI_ENDPOINT || mergedConfig.AZURE_OPENAI_ENDPOINT === '***SYSTEM***') {
                mergedConfig.AZURE_OPENAI_ENDPOINT = CONFIG.AI.AZURE_OPENAI_ENDPOINT;
            }

            // Local LLM URLのフォールバック
            if (!mergedConfig.LOCAL_LLM_URL || mergedConfig.LOCAL_LLM_URL === '***SYSTEM***') {
                mergedConfig.LOCAL_LLM_URL = CONFIG.AI.LOCAL_LLM_URL;
            }

            // 設定のメタ情報を追加
            mergedConfig._meta = {
                userId,
                hasUserOverrides: Object.keys(userConfig).length > 0,
                systemKeys: Object.keys(systemConfig),
                userKeys: Object.keys(userConfig).filter(key => !key.startsWith('_')),
                mergedAt: new Date().toISOString(),
                configSource: this.getConfigSourceMap(systemConfig, userConfig),
                fallbackApplied: {
                    openaiApiKey: !userConfig.OPENAI_API_KEY && !!CONFIG.AI.OPENAI_API_KEY,
                    azureEndpoint: !userConfig.AZURE_OPENAI_ENDPOINT && !!CONFIG.AI.AZURE_OPENAI_ENDPOINT,
                    localLlmUrl: !userConfig.LOCAL_LLM_URL && !!CONFIG.AI.LOCAL_LLM_URL
                }
            };

            return mergedConfig;
            
        } catch (error) {
            console.error(`統合設定取得エラー [${userId}]:`, error);
            
            // エラーの場合は実際のシステム設定を返す
            const fallbackConfig = {
                AI_PROVIDER: CONFIG.AI.PROVIDER,
                AI_MODEL: CONFIG.AI.MODEL,
                AI_TEMPERATURE: CONFIG.AI.TEMPERATURE,
                AI_STREAMING: CONFIG.AI.STREAMING,
                AI_MAX_TOKENS: CONFIG.AI.MAX_TOKENS,
                AI_TIMEOUT: CONFIG.AI.TIMEOUT,
                OPENAI_API_KEY: CONFIG.AI.OPENAI_API_KEY,
                AZURE_OPENAI_ENDPOINT: CONFIG.AI.AZURE_OPENAI_ENDPOINT,
                AZURE_OPENAI_API_VERSION: CONFIG.AI.AZURE_OPENAI_API_VERSION,
                LOCAL_LLM_URL: CONFIG.AI.LOCAL_LLM_URL,
                LOCAL_LLM_MODEL: CONFIG.AI.LOCAL_LLM_MODEL,
                _meta: {
                    userId,
                    hasUserOverrides: false,
                    error: error.message,
                    fallbackApplied: {
                        openaiApiKey: true,
                        azureEndpoint: true,
                        localLlmUrl: true
                    }
                }
            };
            return fallbackConfig;
        }
    }

    /**
     * 設定ソースマップの生成
     */
    getConfigSourceMap(systemConfig, userConfig) {
        const sourceMap = {};

        for (const key of this.CONFIGURABLE_KEYS) {
            if (userConfig[key] !== undefined) {
                sourceMap[key] = 'user';
            } else if (systemConfig[key] !== undefined) {
                sourceMap[key] = 'system';
            } else {
                sourceMap[key] = 'default';
            }
        }

        return sourceMap;
    }

    /**
     * ユーザー設定の一部更新
     */
    async updateUserConfig(userId, updates) {
        try {
            const currentConfig = await this.loadUserConfig(userId);

            // 現在の設定に更新をマージ
            const updatedConfig = { ...currentConfig };

            // 更新項目を検証・適用
            for (const [key, value] of Object.entries(updates)) {
                if (this.CONFIGURABLE_KEYS.includes(key)) {
                    const validatedValue = this.validateConfigValue(key, value);
                    if (validatedValue !== null) {
                        updatedConfig[key] = validatedValue;
                    }
                }
            }

            return await this.saveUserConfig(userId, updatedConfig);
        } catch (error) {
            console.error(`ユーザー設定更新エラー [${userId}]:`, error);
            throw error;
        }
    }

    /**
     * ユーザー設定のリセット
     */
    async resetUserConfig(userId) {
        const configPath = this.getUserConfigPath(userId);
        
        try {
            if (existsSync(configPath)) {
                // バックアップを作成
                const backupPath = `${configPath}.backup.${Date.now()}`;
                await fs.copyFile(configPath, backupPath);
                console.log(`📁 設定バックアップ作成: ${backupPath}`);

                // 設定ファイルを削除
                await fs.unlink(configPath);
            }

            // キャッシュからも削除
            this.userConfigCache.delete(userId);

            // 統計キャッシュを無効化
            this.statisticsCache.clear();

            console.log(`🔄 ユーザー設定をリセット: ${userId}`);
            
            return {};
            
        } catch (error) {
            console.error(`ユーザー設定リセットエラー [${userId}]:`, error);
            throw error;
        }
    }

    /**
     * 特定のユーザー設定項目を削除
     */
    async removeUserConfigKey(userId, key) {
        try {
            if (!this.CONFIGURABLE_KEYS.includes(key)) {
                throw new Error(`設定項目 ${key} は削除できません`);
            }

            const currentConfig = await this.loadUserConfig(userId);

            if (key in currentConfig) {
                const updatedConfig = { ...currentConfig };
                delete updatedConfig[key];

                await this.saveUserConfig(userId, updatedConfig);

                console.log(`🗑️ ユーザー設定項目を削除: ${userId}.${key}`);
                return true;
            }

            return false;
        } catch (error) {
            console.error(`ユーザー設定項目削除エラー [${userId}.${key}]:`, error);
            throw error;
        }
    }

    /**
     * 全ユーザーの設定一覧取得（安全版）
     */
    async getAllUserConfigs() {
        if (this.safeMode) {
            console.log('🛡️ 全ユーザー設定取得: 安全モード（ファイルI/O無し）');
            return [];
        }
        
        try {
            const files = await fs.readdir(this.userConfigsDir);
            const userConfigs = [];

            for (const file of files) {
                if (file.endsWith('.json') && !file.includes('.backup.') && !file.includes('.tmp.')) {
                    try {
                        const userId = file.replace('.json', '');
                        const config = await this.loadUserConfig(userId);

                        userConfigs.push({
                            userId,
                            config,
                            hasCustomSettings: Object.keys(config).length > 0,
                            customKeyCount: Object.keys(config).length,
                            lastUpdated: config._metadata?.updatedAt || null,
                            configVersion: config._metadata?.version || '1.0'
                        });
                        
                    } catch (fileError) {
                        console.warn(`ユーザー設定ファイル読み込みエラー [${file}]:`, fileError.message);
                    }
                }
            }

            console.log(`📊 全ユーザー設定取得完了: ${userConfigs.length}件`);
            return userConfigs;

        } catch (error) {
            console.error('全ユーザー設定取得エラー:', error);
            return [];
        }
    }

    /**
     * 設定の完全性チェック
     */
    async validateUserConfigIntegrity(userId) {
        try {
            const config = await this.loadUserConfig(userId);
            const issues = [];

            for (const [key, value] of Object.entries(config)) {
                if (!this.CONFIGURABLE_KEYS.includes(key)) {
                    issues.push(`無効な設定キー: ${key}`);
                    continue;
                }

                const validatedValue = this.validateConfigValue(key, value);
                if (validatedValue === null) {
                    issues.push(`無効な設定値: ${key} = ${value}`);
                }
            }

            return {
                valid: issues.length === 0,
                issues,
                configKeys: Object.keys(config),
                validKeyCount: Object.keys(config).filter(key =>
                    this.CONFIGURABLE_KEYS.includes(key)
                ).length
            };
        } catch (error) {
            return {
                valid: false,
                issues: [`設定検証エラー: ${error.message}`]
            };
        }
    }

    /**
     * 設定使用統計の取得（安全版）
     */
    async getConfigUsageStatistics() {
        // キャッシュ確認
        const cached = this.statisticsCache.get('usage_stats');
        if (cached) {
            console.log('📊 [CACHE] 統計情報キャッシュヒット');
            return cached;
        }

        if (this.safeMode) {
            console.log('🛡️ 設定使用統計取得: 安全モード（ファイルI/O無し）');
            const stats = {
                timestamp: new Date().toISOString(),
                note: '安全モード - 詳細統計無効化',
                totalUsers: 'ファイルI/O無効化により取得不可',
                usersWithCustomSettings: 'ファイルI/O無効化により取得不可',
                safeMode: true
            };
            
            this.statisticsCache.set('usage_stats', stats);
            return stats;
        }
        
        try {
            console.log('📊 統計情報を新規計算中...');

            const allConfigs = await this.getAllUserConfigs();
            const stats = {
                totalUsers: allConfigs.length,
                usersWithCustomSettings: allConfigs.filter(c => c.hasCustomSettings).length,
                keyUsageCount: {},
                providerDistribution: {},
                modelDistribution: {},
                averageCustomKeys: 0,
                calculatedAt: new Date().toISOString()
            };

            let totalCustomKeys = 0;

            for (const userConfig of allConfigs) {
                const config = userConfig.config;

                // キー使用統計
                for (const key of Object.keys(config)) {
                    stats.keyUsageCount[key] = (stats.keyUsageCount[key] || 0) + 1;
                }

                // プロバイダー分布
                if (config.AI_PROVIDER) {
                    stats.providerDistribution[config.AI_PROVIDER] =
                        (stats.providerDistribution[config.AI_PROVIDER] || 0) + 1;
                }

                // モデル分布
                if (config.AI_MODEL) {
                    stats.modelDistribution[config.AI_MODEL] =
                        (stats.modelDistribution[config.AI_MODEL] || 0) + 1;
                }

                totalCustomKeys += userConfig.customKeyCount;
            }

            stats.averageCustomKeys = allConfigs.length > 0
                ? Math.round(totalCustomKeys / allConfigs.length * 100) / 100
                : 0;

            // キャッシュに保存
            this.statisticsCache.set('usage_stats', stats);

            console.log('✅ 統計情報計算完了');
            return stats;

        } catch (error) {
            console.error('設定使用統計取得エラー:', error);
            return {
                error: error.message,
                totalUsers: 0,
                usersWithCustomSettings: 0,
                calculatedAt: new Date().toISOString()
            };
        }
    }

    /**
     * 統計情報取得（安全版）
     */
    async getStatistics() {
        if (this.safeMode) {
            console.log('🛡️ 統計情報取得: 安全モード（ファイルI/O無し）');
            return {
                initialized: this.initialized,
                safeMode: true,
                cache: this.userConfigCache?.getStats() || {},
                note: '安全モード - ファイルI/O無効化により制限された情報',
                timestamp: new Date().toISOString()
            };
        }

        try {
            const usageStats = await this.getConfigUsageStatistics();
            const cacheStats = this.userConfigCache.getStats();

            return {
                ...usageStats,
                systemConfig: {
                    keyCount: Object.keys(this.systemConfigCache || {}).length,
                    configurableKeys: this.CONFIGURABLE_KEYS.length
                },
                initialized: this.initialized,
                cache: cacheStats,
                lastUpdate: new Date().toISOString(),
                version: '2.0-stable'
            };
        } catch (error) {
            console.error('統計情報取得エラー:', error);
            return {
                error: error.message,
                initialized: this.initialized,
                cache: this.userConfigCache.getStats(),
                lastUpdate: new Date().toISOString(),
                version: '2.0-stable'
            };
        }
    }

    /**
     * 設定のバリデーション
     */
    validateUserConfig(config) {
        const errors = [];
        const warnings = [];

        for (const [key, value] of Object.entries(config)) {
            if (!this.CONFIGURABLE_KEYS.includes(key)) {
                errors.push(`無効な設定キー: ${key}`);
                continue;
            }

            const validatedValue = this.validateConfigValue(key, value);
            if (validatedValue === null) {
                errors.push(`無効な設定値: ${key} = ${value}`);
            }
        }

        // 警告チェック
        if (config.AI_PROVIDER === 'openai' && !config.OPENAI_API_KEY) {
            warnings.push('OpenAIプロバイダーにはOPENAI_API_KEYが必要です');
        }

        if (config.AI_PROVIDER === 'azureopenai' &&
            (!config.OPENAI_API_KEY || !config.AZURE_OPENAI_ENDPOINT)) {
            warnings.push('Azure OpenAIにはOPENAI_API_KEYとAZURE_OPENAI_ENDPOINTが必要です');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            configurableKeys: this.CONFIGURABLE_KEYS
        };
    }

    /**
     * 安全モードの設定
     */
    setSafeMode(enabled) {
        this.safeMode = enabled;
        console.log(`🛡️ 安全モード: ${enabled ? '有効' : '無効'}`);
    }

    /**
     * クリーンアップ
     */
    async cleanup() {
        try {
            // キャッシュをクリア
            this.userConfigCache.clear();
            this.statisticsCache.clear();
            this.systemConfigCache = null;

            console.log('🧹 ユーザー設定管理システム（安定版）をクリーンアップしました');
            
        } catch (error) {
            console.error('クリーンアップエラー:', error);
        }
    }
}

// シングルトンインスタンス
export const userConfigManager = new UserConfigManager();