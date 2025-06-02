/**
 * ユーザー設定管理フック（完全版）
 * 個人設定とシステム設定の管理
 * 各ユーザーが独自のAPIキー、エンドポイント、モデル名を設定可能
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './oauth-components';

/**
 * ユーザー設定管理フック（完全版）
 */
export const useUserConfig = () => {
  const { authenticatedFetch, user } = useAuth();
  
  // 状態管理
  const [userConfig, setUserConfig] = useState(null);
  const [systemConfig, setSystemConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [configStats, setConfigStats] = useState(null);
  
  // 重複リクエスト防止
  const loadingRef = useRef(false);
  const configCacheRef = useRef(null);
  const lastLoadTimeRef = useRef(0);

  // キャッシュ有効期限（5分）
  const CACHE_DURATION = 5 * 60 * 1000;

  /**
   * 設定可能なキーの定義
   */
  const CONFIGURABLE_KEYS = [
    'AI_PROVIDER',
    'AI_MODEL', 
    'AI_TEMPERATURE',
    'AI_STREAMING',
    'AI_MAX_TOKENS',
    'AI_TIMEOUT',
    'OPENAI_API_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_API_VERSION',
    'LOCAL_LLM_URL',
    'LOCAL_LLM_MODEL',
    'AI_SYSTEM_PROMPT',
    'AI_RESPONSE_FORMAT',
    'AI_SAFETY_ENABLED'
  ];

  /**
   * ユーザー設定の読み込み（改良版）
   */
  const loadUserConfig = useCallback(async (forceReload = false) => {
    if (!user || loadingRef.current) return;
    
    // キャッシュチェック
    const now = Date.now();
    if (!forceReload && 
        configCacheRef.current && 
        (now - lastLoadTimeRef.current) < CACHE_DURATION) {
      console.log('🔄 Using cached user config');
      return configCacheRef.current;
    }
    
    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      console.log('🔄 Loading user config (COMPLETE)...');
      
      const response = await authenticatedFetch('/config/user');
      if (!response.ok) {
        throw new Error(`設定取得エラー: ${response.status}`);
      }

      const data = await response.json();
      setUserConfig(data);
      configCacheRef.current = data;
      lastLoadTimeRef.current = now;
      setLastUpdated(new Date());
      
      console.log('✅ User config loaded:', {
        hasUserOverrides: data.meta?.hasUserOverrides,
        userKeys: data.meta?.userKeys?.length || 0,
        systemKeys: data.meta?.systemKeys?.length || 0
      });

      return data;

    } catch (err) {
      console.error('❌ Failed to load user config:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [user, authenticatedFetch]);

  /**
   * システム設定の読み込み（管理者のみ）
   */
  const loadSystemConfig = useCallback(async () => {
    if (!user?.roles?.includes('admin') || loadingRef.current) return;
    
    try {
      console.log('🔄 Loading system config...');
      
      const response = await authenticatedFetch('/env/system');
      if (!response.ok) {
        throw new Error(`システム設定取得エラー: ${response.status}`);
      }

      const data = await response.json();
      setSystemConfig(data);
      
      console.log('✅ System config loaded:', data);
      return data;

    } catch (err) {
      console.error('❌ Failed to load system config:', err);
      // システム設定のエラーはユーザー設定に影響しない
    }
  }, [user, authenticatedFetch]);

  /**
   * 設定統計の読み込み
   */
  const loadConfigStats = useCallback(async () => {
    if (!user?.roles?.includes('admin')) return;

    try {
      const response = await authenticatedFetch('/config/stats');
      if (response.ok) {
        const stats = await response.json();
        setConfigStats(stats);
        return stats;
      }
    } catch (err) {
      console.warn('設定統計の取得に失敗:', err);
    }
  }, [user, authenticatedFetch]);

  /**
   * ユーザー設定の更新（改良版）
   */
  const updateUserConfig = useCallback(async (configUpdates) => {
    if (!user || isLoading) return null;

    // 設定可能なキーのみ許可
    const filteredUpdates = {};
    for (const [key, value] of Object.entries(configUpdates)) {
      if (CONFIGURABLE_KEYS.includes(key)) {
        filteredUpdates[key] = value;
      } else {
        console.warn(`無効な設定キー: ${key} (スキップ)`);
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      throw new Error('更新可能な設定項目がありません');
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('💾 Updating user config:', filteredUpdates);

      const response = await authenticatedFetch('/config/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          config: filteredUpdates
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '設定更新に失敗しました');
      }

      const result = await response.json();
      
      // キャッシュをクリア
      configCacheRef.current = null;
      lastLoadTimeRef.current = 0;
      
      // 設定を再読み込み
      await loadUserConfig(true);
      
      console.log('✅ User config updated:', result);
      return result;

    } catch (err) {
      console.error('❌ Failed to update user config:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user, isLoading, authenticatedFetch, loadUserConfig]);

  /**
   * 特定の設定項目を更新
   */
  const updateConfigKey = useCallback(async (key, value) => {
    if (!CONFIGURABLE_KEYS.includes(key)) {
      throw new Error(`設定項目 ${key} は更新できません`);
    }

    return await updateUserConfig({ [key]: value });
  }, [updateUserConfig]);

  /**
   * 複数の設定項目を一括更新
   */
  const updateMultipleConfigKeys = useCallback(async (updates) => {
    const validUpdates = {};
    const invalidKeys = [];

    for (const [key, value] of Object.entries(updates)) {
      if (CONFIGURABLE_KEYS.includes(key)) {
        validUpdates[key] = value;
      } else {
        invalidKeys.push(key);
      }
    }

    if (invalidKeys.length > 0) {
      console.warn('無効な設定キー:', invalidKeys);
    }

    if (Object.keys(validUpdates).length === 0) {
      throw new Error('更新可能な設定項目がありません');
    }

    return await updateUserConfig(validUpdates);
  }, [updateUserConfig]);

  /**
   * ユーザー設定のリセット（改良版）
   */
  const resetUserConfig = useCallback(async () => {
    if (!user || isLoading) return null;

    setIsLoading(true);
    setError(null);

    try {
      console.log('🔄 Resetting user config...');

      const response = await authenticatedFetch('/config/user/reset', {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '設定リセットに失敗しました');
      }

      const result = await response.json();
      
      // キャッシュをクリア
      configCacheRef.current = null;
      lastLoadTimeRef.current = 0;
      
      // 設定を再読み込み
      await loadUserConfig(true);
      
      console.log('✅ User config reset:', result);
      return result;

    } catch (err) {
      console.error('❌ Failed to reset user config:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user, isLoading, authenticatedFetch, loadUserConfig]);

  /**
   * 設定項目の削除（改良版）
   */
  const removeConfigKey = useCallback(async (key) => {
    if (!user || isLoading) return null;

    if (!CONFIGURABLE_KEYS.includes(key)) {
      throw new Error(`設定項目 ${key} は削除できません`);
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log(`🗑️ Removing config key: ${key}`);

      const response = await authenticatedFetch(`/config/user/${key}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '設定項目の削除に失敗しました');
      }

      const result = await response.json();
      
      // キャッシュをクリア
      configCacheRef.current = null;
      lastLoadTimeRef.current = 0;
      
      // 設定を再読み込み
      await loadUserConfig(true);
      
      console.log('✅ Config key removed:', result);
      return result;

    } catch (err) {
      console.error('❌ Failed to remove config key:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user, isLoading, authenticatedFetch, loadUserConfig]);

  /**
   * システム設定の更新（管理者のみ）
   */
  const updateSystemConfig = useCallback(async (envVariables) => {
    if (!user?.roles?.includes('admin') || isLoading) return null;

    setIsLoading(true);
    setError(null);

    try {
      console.log('💾 Updating system config:', envVariables);

      const response = await authenticatedFetch('/env/system', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          variables: envVariables
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'システム設定更新に失敗しました');
      }

      // システム設定を再読み込み
      const reloadResponse = await authenticatedFetch('/env/system/reload', {
        method: 'POST'
      });

      if (!reloadResponse.ok) {
        const errorData = await reloadResponse.json();
        throw new Error(errorData.message || 'システム設定の再読み込みに失敗しました');
      }

      const result = await reloadResponse.json();
      
      // 設定を再読み込み
      await loadSystemConfig();
      await loadUserConfig(true); // ユーザー設定も更新される可能性がある
      
      console.log('✅ System config updated:', result);
      return result;

    } catch (err) {
      console.error('❌ Failed to update system config:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [user, isLoading, authenticatedFetch, loadSystemConfig, loadUserConfig]);

  /**
   * 設定の手動リフレッシュ
   */
  const refreshConfigs = useCallback(async () => {
    try {
      const promises = [loadUserConfig(true)]; // 強制リロード
      
      if (user?.roles?.includes('admin')) {
        promises.push(loadSystemConfig());
        promises.push(loadConfigStats());
      }
      
      await Promise.all(promises);
    } catch (err) {
      console.error('設定リフレッシュエラー:', err);
      throw err;
    }
  }, [loadUserConfig, loadSystemConfig, loadConfigStats, user]);

  /**
   * 設定の妥当性検証
   */
  const validateConfig = useCallback((config) => {
    const errors = [];
    const warnings = [];

    for (const [key, value] of Object.entries(config)) {
      if (!CONFIGURABLE_KEYS.includes(key)) {
        errors.push(`無効な設定キー: ${key}`);
        continue;
      }

      // 個別のバリデーションルール
      switch (key) {
        case 'AI_PROVIDER':
          if (!['openai', 'azureopenai', 'localllm'].includes(value)) {
            errors.push('AI_PROVIDER must be one of: openai, azureopenai, localllm');
          }
          break;

        case 'AI_TEMPERATURE':
          const temp = parseFloat(value);
          if (isNaN(temp) || temp < 0 || temp > 2) {
            errors.push('AI_TEMPERATURE must be a number between 0 and 2');
          }
          break;

        case 'AI_MAX_TOKENS':
          const maxTokens = parseInt(value);
          if (isNaN(maxTokens) || maxTokens < 1 || maxTokens > 100000) {
            errors.push('AI_MAX_TOKENS must be a number between 1 and 100000');
          }
          break;

        case 'AI_TIMEOUT':
          const timeout = parseInt(value);
          if (isNaN(timeout) || timeout < 1000 || timeout > 300000) {
            errors.push('AI_TIMEOUT must be a number between 1000 and 300000');
          }
          break;

        case 'LOCAL_LLM_URL':
        case 'AZURE_OPENAI_ENDPOINT':
          try {
            new URL(value);
          } catch {
            errors.push(`${key} must be a valid URL`);
          }
          break;

        case 'AI_STREAMING':
        case 'AI_SAFETY_ENABLED':
          if (typeof value !== 'boolean') {
            errors.push(`${key} must be a boolean value`);
          }
          break;
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
      configurableKeys: CONFIGURABLE_KEYS
    };
  }, []);

  /**
   * 設定のエクスポート
   */
  const exportConfig = useCallback(() => {
    if (!userConfig) {
      throw new Error('設定データがありません');
    }

    const exportData = {
      version: '2.0',
      userId: user.id,
      username: user.username,
      exportedAt: new Date().toISOString(),
      config: userConfig.config || {},
      metadata: userConfig.meta || {}
    };

    return exportData;
  }, [userConfig, user]);

  /**
   * 設定のインポート
   */
  const importConfig = useCallback(async (importData) => {
    if (!importData.version || !importData.config) {
      throw new Error('無効な設定ファイル形式です');
    }

    // バージョンチェック
    if (importData.version !== '2.0') {
      console.warn('異なるバージョンの設定ファイルです');
    }

    // 設定の妥当性を検証
    const validation = validateConfig(importData.config);
    if (!validation.valid) {
      throw new Error(`無効な設定データ: ${validation.errors.join(', ')}`);
    }

    // 設定を更新
    return await updateUserConfig(importData.config);
  }, [validateConfig, updateUserConfig]);

  // 初期読み込み
  useEffect(() => {
    if (user && !configCacheRef.current) {
      loadUserConfig();
      if (user.roles?.includes('admin')) {
        loadSystemConfig();
        loadConfigStats();
      }
    }
  }, [user, loadUserConfig, loadSystemConfig, loadConfigStats]);

  // 有効な設定値を計算（ユーザー設定 > システム設定）
  const effectiveConfig = {
    provider: userConfig?.config?.AI_PROVIDER || systemConfig?.currentConfig?.AI_PROVIDER || 'openai',
    model: userConfig?.config?.AI_MODEL || systemConfig?.currentConfig?.AI_MODEL || 'gpt-4o-mini',
    temperature: userConfig?.config?.AI_TEMPERATURE !== undefined 
      ? parseFloat(userConfig.config.AI_TEMPERATURE)
      : (systemConfig?.currentConfig?.AI_TEMPERATURE !== undefined 
        ? parseFloat(systemConfig.currentConfig.AI_TEMPERATURE) 
        : 0.7),
    streaming: userConfig?.config?.AI_STREAMING !== undefined 
      ? userConfig.config.AI_STREAMING 
      : (systemConfig?.currentConfig?.AI_STREAMING !== undefined 
        ? systemConfig.currentConfig.AI_STREAMING 
        : true),
    maxTokens: userConfig?.config?.AI_MAX_TOKENS !== undefined
      ? parseInt(userConfig.config.AI_MAX_TOKENS)
      : (systemConfig?.currentConfig?.AI_MAX_TOKENS !== undefined
        ? parseInt(systemConfig.currentConfig.AI_MAX_TOKENS)
        : 2000),
    timeout: userConfig?.config?.AI_TIMEOUT !== undefined
      ? parseInt(userConfig.config.AI_TIMEOUT)
      : (systemConfig?.currentConfig?.AI_TIMEOUT !== undefined
        ? parseInt(systemConfig.currentConfig.AI_TIMEOUT)
        : 60000),
    hasOpenAIKey: !!(userConfig?.config?.OPENAI_API_KEY || systemConfig?.currentConfig?.OPENAI_API_KEY),
    hasAzureEndpoint: !!(userConfig?.config?.AZURE_OPENAI_ENDPOINT || systemConfig?.currentConfig?.AZURE_OPENAI_ENDPOINT),
    localLlmUrl: userConfig?.config?.LOCAL_LLM_URL || systemConfig?.currentConfig?.LOCAL_LLM_URL || 'http://localhost:8000',
    localLlmModel: userConfig?.config?.LOCAL_LLM_MODEL || systemConfig?.currentConfig?.LOCAL_LLM_MODEL || 'Qwen/Qwen2.5-Coder-32B-Instruct',
    systemPrompt: userConfig?.config?.AI_SYSTEM_PROMPT || systemConfig?.currentConfig?.AI_SYSTEM_PROMPT || '',
    responseFormat: userConfig?.config?.AI_RESPONSE_FORMAT || systemConfig?.currentConfig?.AI_RESPONSE_FORMAT || 'markdown',
    safetyEnabled: userConfig?.config?.AI_SAFETY_ENABLED !== undefined 
      ? userConfig.config.AI_SAFETY_ENABLED 
      : (systemConfig?.currentConfig?.AI_SAFETY_ENABLED !== undefined 
        ? systemConfig.currentConfig.AI_SAFETY_ENABLED 
        : true)
  };

  // 設定ソース情報
  const configInfo = {
    hasUserOverrides: userConfig?.meta?.hasUserOverrides || false,
    userOverrideKeys: userConfig?.meta?.userKeys || [],
    systemKeys: userConfig?.meta?.systemKeys || [],
    configSourceMap: userConfig?.meta?.configSource || {},
    isAdmin: user?.roles?.includes('admin') || false,
    canEditSystem: user?.roles?.includes('admin') || false,
    lastUpdated: lastUpdated,
    cacheAge: lastLoadTimeRef.current ? Date.now() - lastLoadTimeRef.current : 0
  };

  return {
    // 状態
    userConfig,
    systemConfig,
    effectiveConfig,
    configInfo,
    configStats,
    isLoading,
    error,
    lastUpdated,

    // アクション
    loadUserConfig,
    loadSystemConfig,
    loadConfigStats,
    updateUserConfig,
    updateConfigKey,
    updateMultipleConfigKeys,
    resetUserConfig,
    removeConfigKey,
    updateSystemConfig,
    refreshConfigs,

    // バリデーション
    validateConfig,

    // インポート/エクスポート
    exportConfig,
    importConfig,

    // ユーティリティ
    clearError: () => setError(null),
    hasCustomConfig: configInfo.hasUserOverrides,
    getConfigSource: (key) => {
      if (configInfo.userOverrideKeys.includes(key)) return 'user';
      if (configInfo.systemKeys.includes(key)) return 'system';
      return 'default';
    },
    isConfigurable: (key) => CONFIGURABLE_KEYS.includes(key),
    getConfigurableKeys: () => [...CONFIGURABLE_KEYS]
  };
};

/**
 * 設定値のヘルパー関数（改良版）
 */
export const useConfigHelpers = () => {
  /**
   * 設定値を安全にパース
   */
  const parseConfigValue = useCallback((value, type = 'string', defaultValue = null) => {
    if (value === undefined || value === null) return defaultValue;

    try {
      switch (type) {
        case 'number':
          return typeof value === 'number' ? value : parseFloat(value);
        case 'int':
          return typeof value === 'number' ? Math.floor(value) : parseInt(value);
        case 'boolean':
          if (typeof value === 'boolean') return value;
          if (typeof value === 'string') return value.toLowerCase() === 'true';
          return Boolean(value);
        case 'array':
          return Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',').map(s => s.trim()) : []);
        case 'url':
          try {
            new URL(value);
            return value;
          } catch {
            return defaultValue;
          }
        default:
          return String(value);
      }
    } catch (error) {
      console.warn(`Failed to parse config value: ${value} as ${type}`, error);
      return defaultValue;
    }
  }, []);

  /**
   * 設定値を安全にフォーマット
   */
  const formatConfigValue = useCallback((value, type = 'string') => {
    if (value === undefined || value === null) return '';

    try {
      switch (type) {
        case 'number':
        case 'int':
          return String(value);
        case 'boolean':
          return String(Boolean(value));
        case 'array':
          return Array.isArray(value) ? value.join(',') : String(value);
        default:
          return String(value);
      }
    } catch (error) {
      console.warn(`Failed to format config value: ${value} as ${type}`, error);
      return '';
    }
  }, []);

  /**
   * 設定値の妥当性検証（改良版）
   */
  const validateConfigValue = useCallback((key, value) => {
    const validators = {
      AI_TEMPERATURE: (v) => {
        const num = parseFloat(v);
        return !isNaN(num) && num >= 0 && num <= 2;
      },
      AI_MAX_TOKENS: (v) => {
        const num = parseInt(v);
        return !isNaN(num) && num > 0 && num <= 100000;
      },
      AI_TIMEOUT: (v) => {
        const num = parseInt(v);
        return !isNaN(num) && num >= 1000 && num <= 300000;
      },
      LOCAL_LLM_URL: (v) => {
        try {
          new URL(v);
          return true;
        } catch {
          return false;
        }
      },
      AZURE_OPENAI_ENDPOINT: (v) => {
        try {
          new URL(v);
          return true;
        } catch {
          return false;
        }
      },
      AI_PROVIDER: (v) => ['openai', 'azureopenai', 'localllm'].includes(v),
      AI_STREAMING: (v) => typeof parseConfigValue(v, 'boolean') === 'boolean',
      AI_SAFETY_ENABLED: (v) => typeof parseConfigValue(v, 'boolean') === 'boolean',
      OPENAI_API_KEY: (v) => typeof v === 'string' && v.length > 0,
      AI_MODEL: (v) => typeof v === 'string' && v.length > 0,
      LOCAL_LLM_MODEL: (v) => typeof v === 'string' && v.length > 0,
      AI_SYSTEM_PROMPT: (v) => typeof v === 'string',
      AI_RESPONSE_FORMAT: (v) => ['markdown', 'plain', 'structured'].includes(v)
    };

    const validator = validators[key];
    return validator ? validator(value) : true;
  }, [parseConfigValue]);

  /**
   * 設定差分の計算
   */
  const calculateConfigDiff = useCallback((oldConfig, newConfig) => {
    const added = {};
    const modified = {};
    const removed = {};

    // 新しい設定項目と変更された項目
    for (const [key, value] of Object.entries(newConfig)) {
      if (!(key in oldConfig)) {
        added[key] = value;
      } else if (oldConfig[key] !== value) {
        modified[key] = { old: oldConfig[key], new: value };
      }
    }

    // 削除された項目
    for (const key of Object.keys(oldConfig)) {
      if (!(key in newConfig)) {
        removed[key] = oldConfig[key];
      }
    }

    return { added, modified, removed };
  }, []);

  return {
    parseConfigValue,
    formatConfigValue,
    validateConfigValue,
    calculateConfigDiff
  };
};

/**
 * 設定変更通知フック（改良版）
 */
export const useConfigNotifications = () => {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((message, type = 'info', duration = 5000, data = null) => {
    const id = Date.now().toString();
    const notification = { 
      id, 
      message, 
      type, 
      timestamp: new Date(),
      data
    };
    
    setNotifications(prev => [...prev, notification]);

    if (duration > 0) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const updateNotification = useCallback((id, updates) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, ...updates } : n)
    );
  }, []);

  return {
    notifications,
    addNotification,
    removeNotification,
    clearNotifications,
    updateNotification
  };
};

/**
 * 設定テンプレートフック
 */
export const useConfigTemplates = () => {
  const templates = {
    openai: {
      name: 'OpenAI (標準)',
      description: 'OpenAI APIを使用した標準設定',
      config: {
        AI_PROVIDER: 'openai',
        AI_MODEL: 'gpt-4o-mini',
        AI_TEMPERATURE: 0.7,
        AI_STREAMING: true,
        AI_MAX_TOKENS: 2000,
        AI_TIMEOUT: 60000,
        AI_SAFETY_ENABLED: true
      }
    },
    openai_creative: {
      name: 'OpenAI (創造的)',
      description: '創造性を重視したOpenAI設定',
      config: {
        AI_PROVIDER: 'openai',
        AI_MODEL: 'gpt-4o',
        AI_TEMPERATURE: 1.2,
        AI_STREAMING: true,
        AI_MAX_TOKENS: 4000,
        AI_TIMEOUT: 90000,
        AI_SAFETY_ENABLED: true
      }
    },
    azure: {
      name: 'Azure OpenAI',
      description: 'Azure OpenAI サービス設定',
      config: {
        AI_PROVIDER: 'azureopenai',
        AI_MODEL: 'gpt-4o-mini',
        AI_TEMPERATURE: 0.7,
        AI_STREAMING: true,
        AI_MAX_TOKENS: 2000,
        AI_TIMEOUT: 60000,
        AZURE_OPENAI_API_VERSION: '2024-02-15-preview',
        AI_SAFETY_ENABLED: true
      }
    },
    localllm: {
      name: 'ローカルLLM',
      description: 'ローカルLLM（VLLM）設定',
      config: {
        AI_PROVIDER: 'localllm',
        AI_MODEL: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        AI_TEMPERATURE: 0.8,
        AI_STREAMING: true,
        AI_MAX_TOKENS: 4000,
        AI_TIMEOUT: 120000,
        LOCAL_LLM_URL: 'http://localhost:8000',
        LOCAL_LLM_MODEL: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        AI_SAFETY_ENABLED: false
      }
    }
  };

  const applyTemplate = useCallback((templateName, updateUserConfig) => {
    const template = templates[templateName];
    if (!template) {
      throw new Error(`テンプレート「${templateName}」が見つかりません`);
    }

    return updateUserConfig(template.config);
  }, []);

  return {
    templates,
    applyTemplate,
    getTemplateNames: () => Object.keys(templates),
    getTemplate: (name) => templates[name]
  };
};