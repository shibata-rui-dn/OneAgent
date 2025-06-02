/**
 * OneAgent 設定管理（セキュリティログ制御追加版）
 * 環境変数と設定の一元管理
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 環境変数の読み込み
dotenv.config();

/**
 * 設定値の検証と型変換
 */
class ConfigValidator {
  static string(value, defaultValue = '', required = false) {
    if (required && !value) {
      throw new Error(`Required configuration value is missing`);
    }
    return value || defaultValue;
  }

  static number(value, defaultValue = 0, min = null, max = null) {
    const num = value ? parseInt(value, 10) : defaultValue;
    if (isNaN(num)) {
      return defaultValue;
    }
    if (min !== null && num < min) return min;
    if (max !== null && num > max) return max;
    return num;
  }

  static float(value, defaultValue = 0.0, min = null, max = null) {
    const num = value ? parseFloat(value) : defaultValue;
    if (isNaN(num)) {
      return defaultValue;
    }
    if (min !== null && num < min) return min;
    if (max !== null && num > max) return max;
    return num;
  }

  static boolean(value, defaultValue = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return defaultValue;
  }

  static array(value, defaultValue = [], separator = ',') {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      return value.split(separator).map(item => item.trim()).filter(Boolean);
    }
    return defaultValue;
  }

  static url(value, defaultValue = null, required = false) {
    if (required && !value) {
      throw new Error(`Required URL configuration is missing`);
    }

    if (!value) return defaultValue;

    try {
      new URL(value);
      return value;
    } catch (error) {
      console.warn(`Invalid URL: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }
  }
}

function getDefaultOAuthRedirectUris() {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const backendUrl = `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3000}`;

  return [
    `${frontendUrl}/oauth/callback`,
    `${backendUrl}/oauth/callback`
  ];
}

function getDefaultCorsOrigins() {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const backendUrl = `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3000}`;

  if (process.env.NODE_ENV === 'production') {
    return [frontendUrl];
  } else {
    return [backendUrl, frontendUrl];
  }
}

/**
 * メイン設定オブジェクト（セキュリティログ制御追加版）
 */
export const CONFIG = {
  // 環境設定
  NODE_ENV: ConfigValidator.string(process.env.NODE_ENV, 'development'),

  // サーバー設定
  SERVER: {
    PORT: ConfigValidator.number(process.env.PORT, 3000, 1, 65535),
    HOST: ConfigValidator.string(process.env.HOST, 'localhost'),
    BASE_URL: ConfigValidator.url(
      process.env.BASE_URL,
      `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3000}`
    )
  },

  // ツール設定
  TOOLS: {
    DIRECTORY: path.resolve(__dirname, '../../YourTool'),
    MAX_TOOLS: ConfigValidator.number(process.env.MAX_TOOLS, 100, 1, 1000),
    RELOAD_INTERVAL: ConfigValidator.number(process.env.TOOLS_RELOAD_INTERVAL, 0), // 0 = 無効
    ALLOWED_EXTENSIONS: ConfigValidator.array(
      process.env.ALLOWED_TOOL_EXTENSIONS,
      ['.js', '.mjs'],
      ','
    )
  },

  // AI設定
  AI: {
    PROVIDER: ConfigValidator.string(process.env.AI_PROVIDER, 'openai').toLowerCase(),
    MODEL: ConfigValidator.string(process.env.AI_MODEL, 'gpt-4o-mini'),
    STREAMING: ConfigValidator.boolean(process.env.AI_STREAMING, true),
    TEMPERATURE: ConfigValidator.float(process.env.AI_TEMPERATURE, 0.7, 0.0, 2.0),
    MAX_TOKENS: ConfigValidator.number(process.env.AI_MAX_TOKENS, 2000, 1, 100000),
    TIMEOUT: ConfigValidator.number(process.env.AI_TIMEOUT, 60000, 1000, 300000), // ms

    // OpenAI設定
    OPENAI_API_KEY: ConfigValidator.string(process.env.OPENAI_API_KEY),

    // Azure OpenAI設定
    AZURE_OPENAI_ENDPOINT: ConfigValidator.url(process.env.AZURE_OPENAI_ENDPOINT),
    AZURE_OPENAI_API_VERSION: ConfigValidator.string(
      process.env.AZURE_OPENAI_API_VERSION,
      '2024-02-15-preview'
    ),

    // ローカルLLM設定
    LOCAL_LLM_URL: ConfigValidator.url(
      process.env.LOCAL_LLM_URL,
      'http://localhost:8000'
    ),
    LOCAL_LLM_MODEL: ConfigValidator.string(
      process.env.LOCAL_LLM_MODEL,
      'Qwen/Qwen2.5-Coder-32B-Instruct'
    )
  },

  // OAuth 2.0設定
  OAUTH: {
    JWT_SECRET: ConfigValidator.string(
      process.env.JWT_SECRET,
      crypto.randomBytes(64).toString('hex')
    ),
    JWT_EXPIRY: ConfigValidator.string(process.env.JWT_EXPIRY, '15m'),
    REFRESH_TOKEN_EXPIRY: ConfigValidator.string(process.env.REFRESH_TOKEN_EXPIRY, '7d'),
    AUTH_CODE_EXPIRY: ConfigValidator.number(process.env.AUTH_CODE_EXPIRY, 600, 60, 3600), // seconds

    CLIENT_ID: ConfigValidator.string(
      process.env.OAUTH_CLIENT_ID,
      'oneagent-default-client'
    ),
    CLIENT_SECRET: ConfigValidator.string(
      process.env.OAUTH_CLIENT_SECRET,
      crypto.randomBytes(32).toString('hex')
    ),

    REDIRECT_URIS: ConfigValidator.array(
      process.env.OAUTH_REDIRECT_URIS,
      getDefaultOAuthRedirectUris(), // 動的に生成
      ','
    ),

    SUPPORTED_SCOPES: ConfigValidator.array(
      process.env.OAUTH_SCOPES,
      ['read', 'write', 'admin'],
      ','
    ),

    // データベースファイルパス
    USERS_DB_PATH: ConfigValidator.string(
      process.env.OAUTH_USERS_DB_PATH,
      path.resolve(__dirname, '../../data/oauth_users.json')
    ),
    TOKENS_DB_PATH: ConfigValidator.string(
      process.env.OAUTH_TOKENS_DB_PATH,
      path.resolve(__dirname, '../../data/oauth_tokens.json')
    )
  },

  // セッション設定
  SESSION: {
    SECRET: ConfigValidator.string(
      process.env.SESSION_SECRET,
      process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex')
    ),
    MAX_AGE: ConfigValidator.number(process.env.SESSION_MAX_AGE, 24 * 60 * 60 * 1000), // 24時間
    SECURE: ConfigValidator.boolean(
      process.env.SESSION_SECURE,
      process.env.NODE_ENV === 'production'
    ),
    HTTP_ONLY: ConfigValidator.boolean(process.env.SESSION_HTTP_ONLY, true),
    SAME_SITE: ConfigValidator.string(process.env.SESSION_SAME_SITE, 'lax')
  },

  // ファイルシステム設定
  FILES: {
    BASE_DIR: path.resolve(__dirname, '../../user_files'),
    MAX_FILE_SIZE: ConfigValidator.number(process.env.MAX_FILE_SIZE, 10 * 1024 * 1024), // 10MB
    MAX_FILES_PER_USER: ConfigValidator.number(process.env.MAX_FILES_PER_USER, 1000, 1, 10000),
    MAX_FOLDER_DEPTH: ConfigValidator.number(process.env.MAX_FOLDER_DEPTH, 10, 1, 20),
    ALLOWED_EXTENSIONS: ConfigValidator.array(
      process.env.ALLOWED_FILE_EXTENSIONS,
      [
        '.txt', '.md', '.json', '.xml', '.csv', '.yaml', '.yml',
        '.js', '.ts', '.html', '.css', '.py', '.java', '.cpp', '.c',
        '.sh', '.bat', '.sql', '.log', '.ini', '.conf'
      ],
      ','
    )
  },

  // ログ設定（セキュリティログ制御追加）
  LOGGING: {
    LEVEL: ConfigValidator.string(process.env.LOG_LEVEL, 'info').toLowerCase(),
    FILE_PATH: ConfigValidator.string(
      process.env.LOG_FILE_PATH,
      path.resolve(__dirname, '../../logs/oneagent.log')
    ),
    MAX_FILE_SIZE: ConfigValidator.number(process.env.LOG_MAX_FILE_SIZE, 10 * 1024 * 1024), // 10MB
    MAX_FILES: ConfigValidator.number(process.env.LOG_MAX_FILES, 5, 1, 100),

    // 🔧 追加: セキュリティログ制御設定
    SECURITY_LOG_ENABLED: ConfigValidator.boolean(
      process.env.SECURITY_LOG_ENABLED,
      false // デフォルトで無効化
    ),
    SECURITY_LOG_PATH: ConfigValidator.string(
      process.env.SECURITY_LOG_PATH,
      process.env.NODE_ENV === 'development'
        ? path.resolve(__dirname, '../../user_files/_security_logs')
        : '' // 本番環境では空文字（無効化）
    ),
    SECURITY_LOG_CONSOLE: ConfigValidator.boolean(
      process.env.SECURITY_LOG_CONSOLE,
      true // コンソールログは有効
    ),
    SECURITY_LOG_TIMEOUT: ConfigValidator.number(
      process.env.SECURITY_LOG_TIMEOUT,
      1000, // 1秒
      100,
      10000
    )
  },

  // CORS設定
  CORS: {
    ORIGINS: ConfigValidator.array(
      process.env.CORS_ORIGINS,
      getDefaultCorsOrigins(), // 動的に生成
      ','
    ),
    CREDENTIALS: ConfigValidator.boolean(process.env.CORS_CREDENTIALS, true),
    MAX_AGE: ConfigValidator.number(process.env.CORS_MAX_AGE, 86400) // 24時間
  },

  // セキュリティ設定
  SECURITY: {
    RATE_LIMIT_WINDOW: ConfigValidator.number(process.env.RATE_LIMIT_WINDOW, 15 * 60 * 1000), // 15分
    RATE_LIMIT_MAX: ConfigValidator.number(process.env.RATE_LIMIT_MAX, 100, 1, 10000),
    FORCE_HTTPS: ConfigValidator.boolean(
      process.env.FORCE_HTTPS,
      process.env.NODE_ENV === 'production'
    ),
    HSTS_MAX_AGE: ConfigValidator.number(process.env.HSTS_MAX_AGE, 31536000), // 1年
    CONTENT_SECURITY_POLICY: ConfigValidator.boolean(process.env.CSP_ENABLED, true)
  },

  // データベース設定
  DATABASE: {
    TYPE: ConfigValidator.string(process.env.DB_TYPE, 'json').toLowerCase(), // json, sqlite, postgres
    CONNECTION_STRING: ConfigValidator.string(process.env.DATABASE_URL),
    DATA_DIR: path.resolve(__dirname, '../../data'),
    BACKUP_ENABLED: ConfigValidator.boolean(process.env.DB_BACKUP_ENABLED, true),
    BACKUP_INTERVAL: ConfigValidator.number(process.env.DB_BACKUP_INTERVAL, 24 * 60 * 60 * 1000) // 24時間
  },

  // 開発・デバッグ設定
  DEBUG: {
    ENABLED: ConfigValidator.boolean(
      process.env.DEBUG_ENABLED,
      process.env.NODE_ENV === 'development'
    ),
    VERBOSE_LOGGING: ConfigValidator.boolean(process.env.VERBOSE_LOGGING, false),
    TOOL_RELOAD_ON_CHANGE: ConfigValidator.boolean(
      process.env.TOOL_RELOAD_ON_CHANGE,
      process.env.NODE_ENV === 'development'
    ),
    PRINT_ENV_ON_START: ConfigValidator.boolean(process.env.PRINT_ENV_ON_START, false)
  }
};

/**
 * 設定の検証（セキュリティログ警告追加）
 */
export function validateConfig() {
  const errors = [];
  const warnings = [];

  // 必須設定のチェック
  if (CONFIG.AI.PROVIDER === 'openai' && !CONFIG.AI.OPENAI_API_KEY) {
    errors.push('OPENAI_API_KEY is required when using OpenAI provider');
  }

  if (CONFIG.AI.PROVIDER === 'azureopenai') {
    if (!CONFIG.AI.OPENAI_API_KEY) {
      errors.push('OPENAI_API_KEY is required for Azure OpenAI');
    }
    if (!CONFIG.AI.AZURE_OPENAI_ENDPOINT) {
      errors.push('AZURE_OPENAI_ENDPOINT is required for Azure OpenAI');
    }
  }

  // 🔧 追加: セキュリティログ設定の警告
  if (CONFIG.LOGGING.SECURITY_LOG_ENABLED && !CONFIG.LOGGING.SECURITY_LOG_PATH) {
    warnings.push('SECURITY_LOG_ENABLED is true but SECURITY_LOG_PATH is not set');
  }

  if (CONFIG.NODE_ENV === 'production' && CONFIG.LOGGING.SECURITY_LOG_PATH) {
    warnings.push('Security file logging is enabled in production - this may cause performance issues');
  }

  // セキュリティ関連の警告
  if (CONFIG.NODE_ENV === 'production') {
    if (CONFIG.OAUTH.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET should be at least 32 characters in production');
    }

    if (!CONFIG.SECURITY.FORCE_HTTPS) {
      warnings.push('HTTPS is recommended in production');
    }
  }

  // 警告の表示
  if (warnings.length > 0) {
    console.warn('⚠️  設定に関する警告:');
    warnings.forEach(warning => console.warn(`   - ${warning}`));
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}

/**
 * 設定情報を安全に表示（機密情報をマスク）
 */
export function printConfig() {
  if (!CONFIG.DEBUG.PRINT_ENV_ON_START) {
    return;
  }

  const safeConfig = JSON.parse(JSON.stringify(CONFIG));

  // 機密情報をマスク
  const sensitiveKeys = [
    'JWT_SECRET', 'CLIENT_SECRET', 'OPENAI_API_KEY', 'SESSION_SECRET',
    'AZURE_OPENAI_ENDPOINT', 'LOCAL_LLM_URL', 'API_KEY', 'SECRET', 'TOKEN', 'PASSWORD'
  ];

  function maskSensitiveData(obj, path = '') {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === 'object' && value !== null) {
        maskSensitiveData(value, currentPath);
      } else if (sensitiveKeys.some(sensitiveKey =>
        key.includes(sensitiveKey) || currentPath.includes(sensitiveKey)
      )) {
        obj[key] = value ? `${'*'.repeat(Math.min(value.length, 8))}` : '';
      }
    }
  }

  maskSensitiveData(safeConfig);

  console.log('📋 現在の設定:');
  console.log(JSON.stringify(safeConfig, null, 2));
}

/**
 * 環境別設定の適用（セキュリティログ設定追加）
 */
export function applyEnvironmentConfig() {
  if (CONFIG.NODE_ENV === 'production') {
    // 本番環境での追加設定
    CONFIG.DEBUG.ENABLED = false;
    CONFIG.DEBUG.VERBOSE_LOGGING = false;
    CONFIG.SECURITY.FORCE_HTTPS = true;

    // 🔧 追加: 本番環境ではセキュリティファイルログを強制無効化
    if (CONFIG.LOGGING.SECURITY_LOG_PATH) {
      console.warn('⚠️  本番環境でセキュリティファイルログが無効化されました（パフォーマンス最適化）');
      CONFIG.LOGGING.SECURITY_LOG_PATH = '';
    }

  } else if (CONFIG.NODE_ENV === 'development') {
    // 開発環境での追加設定
    CONFIG.DEBUG.ENABLED = true;
    CONFIG.TOOLS.RELOAD_INTERVAL = 5000; // 5秒間隔でツールリロード

    // 🔧 追加: 開発環境でのセキュリティログ設定
    if (CONFIG.LOGGING.SECURITY_LOG_ENABLED && !CONFIG.LOGGING.SECURITY_LOG_PATH) {
      CONFIG.LOGGING.SECURITY_LOG_PATH = path.resolve(__dirname, '../../user_files/_security_logs');
      console.log('📝 開発環境でセキュリティログパスを自動設定しました');
    }
  }
}

// 初期化時に設定を検証
try {
  applyEnvironmentConfig();
  validateConfig();
  printConfig();

  // 🔧 追加: セキュリティログ設定の状況表示
  console.log(`🔒 セキュリティログ設定: ${CONFIG.LOGGING.SECURITY_LOG_ENABLED ? '有効' : '無効'}`);
  if (CONFIG.LOGGING.SECURITY_LOG_ENABLED) {
    console.log(`   ファイル: ${CONFIG.LOGGING.SECURITY_LOG_PATH ? '有効' : '無効'}`);
    console.log(`   コンソール: ${CONFIG.LOGGING.SECURITY_LOG_CONSOLE ? '有効' : '無効'}`);
    console.log(`   タイムアウト: ${CONFIG.LOGGING.SECURITY_LOG_TIMEOUT}ms`);
  }

} catch (error) {
  console.error('❌ 設定エラー:', error.message);
  process.exit(1);
}

export default CONFIG;