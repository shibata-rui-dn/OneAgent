import React, { useState, useEffect, memo, useCallback, useRef } from 'react';
import {
  Settings, X, Server, Key, Globe, AlertCircle, Loader, 
  RefreshCw, Save, Copy, Edit3, Brain, User, Shield, Trash2, 
  RotateCcw, Check, Eye, EyeOff, Download, Upload, HelpCircle
} from 'lucide-react';
import { useSettingsModalIsolated } from './IsolatedContexts';
import { useAuth } from './oauth-components';

const SettingsModal = memo(() => {
  const { 
    showSettings, 
    setShowSettings,
    agentConfig, 
    fetchAgentConfig, 
    checkServerHealth,
    dispatch,
    API_BASE_URL
  } = useSettingsModalIsolated();

  const { authenticatedFetch, user } = useAuth();

  // デバッグ用ログ
  console.log('SettingsModal rendering (COMPLETE-VERSION)', { 
    showSettings,
    hasUserConfig: !!agentConfig?.userConfig,
    timestamp: Date.now()
  });

  // 初期化済みフラグを追加
  const initializedRef = useRef(false);

  const [tempConfig, setTempConfig] = useState({
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    streaming: true,
    maxTokens: 2000,
    timeout: 60000,
    openaiApiKey: '',
    azureEndpoint: '',
    azureApiVersion: '2024-02-15-preview',
    localLlmUrl: 'http://localhost:8000',
    localLlmModel: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    systemPrompt: '',
    responseFormat: 'markdown',
    safetyEnabled: true
  });

  const [activeTab, setActiveTab] = useState('user');
  const [configType, setConfigType] = useState('user');
  const [userConfigData, setUserConfigData] = useState(null);
  const [systemConfigData, setSystemConfigData] = useState(null);
  const [envStatus, setEnvStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [configStats, setConfigStats] = useState(null);

  // 利用可能なモデル定義
  const MODELS = {
    openai: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini', description: '高速・低コスト' },
      { value: 'gpt-4o', label: 'GPT-4o', description: '最新モデル' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: '高性能' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', description: '軽量・高速' }
    ],
    azureopenai: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Azure版' },
      { value: 'gpt-4o', label: 'GPT-4o', description: 'Azure版' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: 'Azure版' },
      { value: 'gpt-35-turbo', label: 'GPT-3.5 Turbo', description: 'Azure版' }
    ],
    localllm: [
      { value: 'Qwen/Qwen2.5-Coder-32B-Instruct', label: 'Qwen2.5 Coder 32B', description: 'コーディング特化' },
      { value: 'Qwen/Qwen2.5-32B-Instruct', label: 'Qwen2.5 32B', description: '汎用高性能' },
      { value: 'meta-llama/Llama-3.1-8B-Instruct', label: 'Llama 3.1 8B', description: '軽量版' },
      { value: 'microsoft/DialoGPT-medium', label: 'DialoGPT Medium', description: '対話特化' }
    ]
  };

  // 設定値の検証
  const validateConfig = useCallback((config) => {
    const errors = {};

    if (config.temperature < 0 || config.temperature > 2) {
      errors.temperature = 'Temperatureは0.0から2.0の間で設定してください';
    }

    if (config.maxTokens < 1 || config.maxTokens > 100000) {
      errors.maxTokens = 'Max Tokensは1から100000の間で設定してください';
    }

    if (config.timeout < 1000 || config.timeout > 300000) {
      errors.timeout = 'Timeoutは1000から300000msの間で設定してください';
    }

    if (config.provider === 'openai' && !config.openaiApiKey) {
      errors.openaiApiKey = 'OpenAI API Keyは必須です';
    }

    if (config.provider === 'azureopenai') {
      if (!config.openaiApiKey) {
        errors.openaiApiKey = 'Azure OpenAI API Keyは必須です';
      }
      if (!config.azureEndpoint) {
        errors.azureEndpoint = 'Azure OpenAI Endpointは必須です';
      } else {
        try {
          new URL(config.azureEndpoint);
        } catch {
          errors.azureEndpoint = '有効なURLを入力してください';
        }
      }
    }

    if (config.provider === 'localllm') {
      try {
        new URL(config.localLlmUrl);
      } catch {
        errors.localLlmUrl = '有効なURLを入力してください';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, []);

  // ユーザー設定の読み込み関数（改良版）
  const loadUserConfig = useCallback(async () => {
    console.log('🔄 loadUserConfig called (COMPLETE)');
    
    try {
      if (initializedRef.current) {
        console.log('⏭️ Already initialized, skipping');
        return;
      }

      setIsLoading(true);

      // ユーザー設定を取得
      console.log('🌐 Fetching user config...');
      const userResponse = await authenticatedFetch('/config/user');
      console.log('📥 User config response:', { ok: userResponse.ok, status: userResponse.status });
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        console.log('📊 User config data received:', userData);
        setUserConfigData(userData);

        // 設定統計も取得
        try {
          const statsResponse = await authenticatedFetch('/config/stats');
          if (statsResponse.ok) {
            const stats = await statsResponse.json();
            setConfigStats(stats);
          }
        } catch (error) {
          console.warn('統計情報の取得に失敗:', error);
        }

        // ユーザー設定またはシステム設定から初期値を設定
        const config = userData.config || {};
        const newConfig = {
          provider: config.AI_PROVIDER || 'openai',
          model: config.AI_MODEL || 'gpt-4o-mini',
          temperature: config.AI_TEMPERATURE !== undefined ? parseFloat(config.AI_TEMPERATURE) : 0.7,
          streaming: config.AI_STREAMING !== undefined ? config.AI_STREAMING : true,
          maxTokens: config.AI_MAX_TOKENS !== undefined ? parseInt(config.AI_MAX_TOKENS) : 2000,
          timeout: config.AI_TIMEOUT !== undefined ? parseInt(config.AI_TIMEOUT) : 60000,
          openaiApiKey: config.OPENAI_API_KEY === '***MASKED***' ? '' : (config.OPENAI_API_KEY || ''),
          azureEndpoint: config.AZURE_OPENAI_ENDPOINT || '',
          azureApiVersion: config.AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
          localLlmUrl: config.LOCAL_LLM_URL || 'http://localhost:8000',
          localLlmModel: config.LOCAL_LLM_MODEL || 'Qwen/Qwen2.5-Coder-32B-Instruct',
          systemPrompt: config.AI_SYSTEM_PROMPT || '',
          responseFormat: config.AI_RESPONSE_FORMAT || 'markdown',
          safetyEnabled: config.AI_SAFETY_ENABLED !== undefined ? config.AI_SAFETY_ENABLED : true
        };

        console.log('📋 Config loaded:', newConfig);
        setTempConfig(newConfig);
        validateConfig(newConfig);
      } else {
        console.error('❌ Failed to fetch user config');
        setEnvStatus('❌ ユーザー設定の取得に失敗しました');
      }

      initializedRef.current = true;
      console.log('✅ loadUserConfig completed');

    } catch (error) {
      console.error('❌ ユーザー設定読み込みエラー:', error);
      setEnvStatus(`❌ エラー: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [authenticatedFetch, validateConfig]);

  // システム設定の読み込み関数（管理者のみ）
  const loadSystemConfig = useCallback(async () => {
    if (!user?.roles?.includes('admin')) {
      return;
    }

    try {
      console.log('🌐 Fetching system config...');
      const systemResponse = await authenticatedFetch('/env/system');
      
      if (systemResponse.ok) {
        const systemData = await systemResponse.json();
        console.log('📊 System config data received:', systemData);
        setSystemConfigData(systemData);
      } else {
        console.error('❌ Failed to fetch system config');
      }
    } catch (error) {
      console.error('❌ システム設定読み込みエラー:', error);
    }
  }, [authenticatedFetch, user]);

  // モーダルが開かれたときに設定を読み込み
  useEffect(() => {
    if (showSettings && !initializedRef.current) {
      loadUserConfig();
      loadSystemConfig();
    }
  }, [showSettings, loadUserConfig, loadSystemConfig]);

  // モーダルが閉じられたときに初期化フラグをリセット
  useEffect(() => {
    if (!showSettings) {
      initializedRef.current = false;
      setEnvStatus('');
      setValidationErrors({});
    }
  }, [showSettings]);

  // 設定値変更時の検証
  useEffect(() => {
    if (Object.keys(tempConfig).length > 0) {
      validateConfig(tempConfig);
    }
  }, [tempConfig, validateConfig]);

  // 設定タイプ変更時の処理
  const handleConfigTypeChange = (newType) => {
    setConfigType(newType);
    if (newType === 'system' && !systemConfigData) {
      loadSystemConfig();
    }
  };

  // 設定値の更新
  const updateTempConfig = useCallback((key, value) => {
    setTempConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  // ユーザー設定の保存（改良版）
  const saveUserConfig = async () => {
    console.log('🚀 saveUserConfig called (COMPLETE)', { tempConfig });
    
    if (!validateConfig(tempConfig)) {
      setEnvStatus('❌ 設定に問題があります。エラーを修正してください。');
      return;
    }

    setIsLoading(true);
    
    try {
      const configToSave = {
        AI_PROVIDER: tempConfig.provider,
        AI_MODEL: tempConfig.model,
        AI_TEMPERATURE: tempConfig.temperature,
        AI_STREAMING: tempConfig.streaming,
        AI_MAX_TOKENS: tempConfig.maxTokens,
        AI_TIMEOUT: tempConfig.timeout
      };

      // 高度な設定
      if (tempConfig.systemPrompt) {
        configToSave.AI_SYSTEM_PROMPT = tempConfig.systemPrompt;
      }
      if (tempConfig.responseFormat) {
        configToSave.AI_RESPONSE_FORMAT = tempConfig.responseFormat;
      }
      if (tempConfig.safetyEnabled !== undefined) {
        configToSave.AI_SAFETY_ENABLED = tempConfig.safetyEnabled;
      }

      // プロバイダー固有の設定
      if (tempConfig.provider === 'openai' && tempConfig.openaiApiKey) {
        configToSave.OPENAI_API_KEY = tempConfig.openaiApiKey;
      }

      if (tempConfig.provider === 'azureopenai') {
        if (tempConfig.openaiApiKey) configToSave.OPENAI_API_KEY = tempConfig.openaiApiKey;
        if (tempConfig.azureEndpoint) configToSave.AZURE_OPENAI_ENDPOINT = tempConfig.azureEndpoint;
        if (tempConfig.azureApiVersion) configToSave.AZURE_OPENAI_API_VERSION = tempConfig.azureApiVersion;
      }

      if (tempConfig.provider === 'localllm') {
        configToSave.LOCAL_LLM_URL = tempConfig.localLlmUrl;
        configToSave.LOCAL_LLM_MODEL = tempConfig.localLlmModel;
      }

      console.log('📝 Saving user config:', configToSave);

      const response = await authenticatedFetch('/config/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          config: configToSave
        })
      });

      console.log('📥 Save response:', { ok: response.ok, status: response.status });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'ユーザー設定の保存に失敗しました');
      }

      const result = await response.json();
      console.log('✅ User config saved successfully:', result);

      setEnvStatus('✅ 個人設定を保存しました');
      
      // 設定を再読み込み
      await fetchAgentConfig();
      await loadUserConfig();

      setTimeout(async () => {
        try {
          await checkServerHealth();
          dispatch({ type: 'SET_SERVER_STATUS', payload: 'connected' });
          setEnvStatus('✅ 個人設定を保存し、適用しました');
        } catch (error) {
          console.error('⚠️ Server health check failed:', error);
          dispatch({ type: 'SET_SERVER_STATUS', payload: 'error' });
          setEnvStatus('⚠️ 設定は保存されましたが、サーバーとの接続に問題があります');
        }
      }, 1000);

    } catch (error) {
      console.error('❌ ユーザー設定保存エラー:', error);
      setEnvStatus(`❌ エラー: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // システム設定の保存（管理者のみ、従来の機能）
  const saveSystemConfig = async () => {
    if (!user?.roles?.includes('admin')) {
      setEnvStatus('❌ エラー: 管理者権限が必要です');
      return;
    }

    if (!validateConfig(tempConfig)) {
      setEnvStatus('❌ 設定に問題があります。エラーを修正してください。');
      return;
    }

    console.log('🚀 saveSystemConfig called (COMPLETE)', { tempConfig });
    setIsLoading(true);
    
    try {
      const envVars = {};

      envVars.AI_PROVIDER = tempConfig.provider;
      envVars.AI_MODEL = tempConfig.model;
      envVars.AI_TEMPERATURE = tempConfig.temperature.toString();
      envVars.AI_STREAMING = tempConfig.streaming.toString();
      envVars.AI_MAX_TOKENS = tempConfig.maxTokens.toString();
      envVars.AI_TIMEOUT = tempConfig.timeout.toString();

      if (tempConfig.systemPrompt) {
        envVars.AI_SYSTEM_PROMPT = tempConfig.systemPrompt;
      }
      if (tempConfig.responseFormat) {
        envVars.AI_RESPONSE_FORMAT = tempConfig.responseFormat;
      }
      if (tempConfig.safetyEnabled !== undefined) {
        envVars.AI_SAFETY_ENABLED = tempConfig.safetyEnabled.toString();
      }

      if (tempConfig.provider === 'openai' && tempConfig.openaiApiKey) {
        envVars.OPENAI_API_KEY = tempConfig.openaiApiKey;
      }

      if (tempConfig.provider === 'azureopenai') {
        if (tempConfig.openaiApiKey) envVars.OPENAI_API_KEY = tempConfig.openaiApiKey;
        if (tempConfig.azureEndpoint) envVars.AZURE_OPENAI_ENDPOINT = tempConfig.azureEndpoint;
        if (tempConfig.azureApiVersion) envVars.AZURE_OPENAI_API_VERSION = tempConfig.azureApiVersion;
      }

      if (tempConfig.provider === 'localllm') {
        envVars.LOCAL_LLM_URL = tempConfig.localLlmUrl;
        envVars.LOCAL_LLM_MODEL = tempConfig.localLlmModel;
      }

      envVars.PORT = '3000';
      envVars.HOST = 'localhost';

      console.log('📝 System environment variables to save:', envVars);

      const response = await authenticatedFetch('/env/system', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          variables: envVars
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'システム設定の保存に失敗しました');
      }

      setEnvStatus('✅ システム設定を保存しています...');

      const reloadResponse = await authenticatedFetch('/env/system/reload', {
        method: 'POST'
      });

      if (!reloadResponse.ok) {
        const errorData = await reloadResponse.json();
        throw new Error(errorData.message || 'システム設定の再読み込みに失敗しました');
      }

      await fetchAgentConfig();
      await loadSystemConfig();

      setEnvStatus('✅ システム設定を保存し、適用しました');

    } catch (error) {
      console.error('❌ システム設定保存エラー:', error);
      setEnvStatus(`❌ エラー: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ユーザー設定のリセット
  const resetUserConfig = async () => {
    if (!window.confirm('個人設定をリセットして、システムデフォルトに戻しますか？\n\nこの操作は元に戻せません。')) {
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await authenticatedFetch('/config/user/reset', {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'ユーザー設定のリセットに失敗しました');
      }

      setEnvStatus('✅ 個人設定をリセットしました');
      
      // 設定を再読み込み
      await fetchAgentConfig();
      initializedRef.current = false; // 強制的に再読み込み
      await loadUserConfig();

    } catch (error) {
      console.error('❌ ユーザー設定リセットエラー:', error);
      setEnvStatus(`❌ エラー: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 設定項目の削除
  const removeUserConfigKey = async (key) => {
    if (!window.confirm(`設定項目「${key}」を削除しますか？\n\nこの項目はシステムデフォルト値に戻ります。`)) {
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await authenticatedFetch(`/config/user/${key}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '設定項目の削除に失敗しました');
      }

      setEnvStatus(`✅ 設定項目「${key}」を削除しました`);
      
      // 設定を再読み込み
      await fetchAgentConfig();
      initializedRef.current = false;
      await loadUserConfig();

    } catch (error) {
      console.error('❌ 設定項目削除エラー:', error);
      setEnvStatus(`❌ エラー: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 設定のエクスポート
  const exportConfig = () => {
    const exportData = {
      version: '2.0',
      userId: user.id,
      exportedAt: new Date().toISOString(),
      config: tempConfig,
      metadata: userConfigData?.meta
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oneagent-config-${user.username}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setEnvStatus('✅ 設定をエクスポートしました');
  };

  // 設定のインポート
  const importConfig = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target.result);
        
        if (importData.version && importData.config) {
          setTempConfig(importData.config);
          setEnvStatus('✅ 設定をインポートしました。保存ボタンを押して適用してください。');
        } else {
          throw new Error('無効な設定ファイル形式です');
        }
      } catch (error) {
        setEnvStatus(`❌ インポートエラー: ${error.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    if (configType === 'user') {
      await saveUserConfig();
    } else {
      await saveSystemConfig();
    }
  };

  if (!showSettings) return null;

  const isAdmin = user?.roles?.includes('admin');
  const hasUserConfig = userConfigData?.meta?.hasUserOverrides;
  const userOverrideKeys = userConfigData?.meta?.userKeys || [];
  const hasValidationErrors = Object.keys(validationErrors).length > 0;
  const currentModels = MODELS[tempConfig.provider] || MODELS.openai;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-8 w-[900px] max-w-[90vw] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <Settings className="w-6 h-6 mr-2 text-blue-600" />
            AI設定管理
            <span className="ml-2 text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
              v2.0
            </span>
          </h2>
          <button
            onClick={() => setShowSettings(false)}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* 設定タイプ選択 */}
        <div className="mb-6">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => handleConfigTypeChange('user')}
              className={`flex-1 py-2 px-4 rounded-md transition-colors font-medium flex items-center justify-center ${
                configType === 'user'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <User className="w-4 h-4 mr-2" />
              個人設定
              {hasUserConfig && (
                <span className="ml-2 w-2 h-2 bg-blue-500 rounded-full"></span>
              )}
            </button>
            {isAdmin && (
              <button
                onClick={() => handleConfigTypeChange('system')}
                className={`flex-1 py-2 px-4 rounded-md transition-colors font-medium flex items-center justify-center ${
                  configType === 'system'
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <Shield className="w-4 h-4 mr-2" />
                システム設定
              </button>
            )}
          </div>

          {/* 設定情報表示 */}
          <div className="mt-4 text-sm">
            {configType === 'user' ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start">
                  <User className="w-4 h-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                  <div className="text-blue-800">
                    <p className="font-semibold mb-1">個人設定について:</p>
                    <p className="text-xs">
                      あなた専用のAI設定です。システム設定より優先されます。
                      {hasUserConfig ? (
                        <span className="font-medium"> 現在{userOverrideKeys.length}個の項目をカスタマイズ中です。</span>
                      ) : (
                        <span> 現在はシステムデフォルトを使用しています。</span>
                      )}
                    </p>
                    {configStats && (
                      <p className="text-xs mt-1 opacity-75">
                        全体統計: {configStats.usersWithCustomSettings}/{configStats.totalUsers} ユーザーがカスタム設定を使用
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div className="flex items-start">
                  <Shield className="w-4 h-4 text-purple-600 mr-2 mt-0.5 flex-shrink-0" />
                  <div className="text-purple-800">
                    <p className="font-semibold mb-1">システム設定について (管理者):</p>
                    <p className="text-xs">
                      全ユーザーのデフォルト設定です。個人設定がない場合に使用されます。
                      変更は全ユーザーに影響する可能性があります。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ステータス表示 */}
        {envStatus && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            envStatus.startsWith('✅') ? 'bg-green-50 text-green-700' :
            envStatus.startsWith('❌') ? 'bg-red-50 text-red-700' :
            envStatus.startsWith('⚠️') ? 'bg-yellow-50 text-yellow-700' :
            'bg-blue-50 text-blue-700'
          }`}>
            {envStatus}
          </div>
        )}

        {/* 検証エラー表示 */}
        {hasValidationErrors && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <AlertCircle className="w-4 h-4 text-red-500 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">設定に問題があります:</p>
                <ul className="text-xs text-red-600 mt-1">
                  {Object.entries(validationErrors).map(([key, error]) => (
                    <li key={key}>• {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ローディング表示 */}
        {isLoading && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg flex items-center text-blue-700">
            <Loader className="w-4 h-4 animate-spin mr-2" />
            処理中...
          </div>
        )}

        {/* 設定フォーム */}
        <div className="space-y-6">
          {/* AIプロバイダー */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              AIプロバイダー
              {configType === 'user' && userOverrideKeys.includes('AI_PROVIDER') && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
              )}
            </label>
            <select
              value={tempConfig.provider}
              onChange={(e) => updateTempConfig('provider', e.target.value)}
              className="w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="openai">OpenAI</option>
              <option value="azureopenai">Azure OpenAI</option>
              <option value="localllm">Local LLM (VLLM)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {tempConfig.provider === 'openai' && 'OpenAI APIを使用'}
              {tempConfig.provider === 'azureopenai' && 'Azure OpenAI サービスを使用'}
              {tempConfig.provider === 'localllm' && 'ローカルLLM（VLLM）を使用 - LangChain Agent有効'}
            </p>
          </div>

          {/* モデル */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              モデル
              {configType === 'user' && userOverrideKeys.includes('AI_MODEL') && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
              )}
            </label>
            <select
              value={tempConfig.model}
              onChange={(e) => updateTempConfig('model', e.target.value)}
              className="w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              {currentModels.map(model => (
                <option key={model.value} value={model.value}>
                  {model.label} - {model.description}
                </option>
              ))}
            </select>
          </div>

          {/* 基本設定行 */}
          <div className="grid grid-cols-2 gap-4">
            {/* Temperature */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Temperature: {tempConfig.temperature}
                {configType === 'user' && userOverrideKeys.includes('AI_TEMPERATURE') && (
                  <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
                )}
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={tempConfig.temperature}
                onChange={(e) => updateTempConfig('temperature', parseFloat(e.target.value))}
                className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer ${
                  validationErrors.temperature ? 'border-red-500' : ''
                }`}
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>保守的</span>
                <span>創造的</span>
              </div>
              {validationErrors.temperature && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.temperature}</p>
              )}
            </div>

            {/* Max Tokens */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Max Tokens
                {configType === 'user' && userOverrideKeys.includes('AI_MAX_TOKENS') && (
                  <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
                )}
              </label>
              <input
                type="number"
                min="1"
                max="100000"
                value={tempConfig.maxTokens}
                onChange={(e) => updateTempConfig('maxTokens', parseInt(e.target.value))}
                className={`w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                  validationErrors.maxTokens ? 'border-red-500' : ''
                }`}
              />
              {validationErrors.maxTokens && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.maxTokens}</p>
              )}
            </div>
          </div>

          {/* ストリーミングとタイムアウト */}
          <div className="grid grid-cols-2 gap-4">
            {/* Streaming */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <label htmlFor="streaming" className="text-sm font-semibold text-gray-700 flex items-center">
                  ストリーミング
                  {configType === 'user' && userOverrideKeys.includes('AI_STREAMING') && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
                  )}
                </label>
                <p className="text-xs text-gray-500">リアルタイムで応答を表示</p>
              </div>
              <input
                type="checkbox"
                id="streaming"
                checked={tempConfig.streaming}
                onChange={(e) => updateTempConfig('streaming', e.target.checked)}
                className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>

            {/* Timeout */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Timeout (ms)
                {configType === 'user' && userOverrideKeys.includes('AI_TIMEOUT') && (
                  <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
                )}
              </label>
              <input
                type="number"
                min="1000"
                max="300000"
                step="1000"
                value={tempConfig.timeout}
                onChange={(e) => updateTempConfig('timeout', parseInt(e.target.value))}
                className={`w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                  validationErrors.timeout ? 'border-red-500' : ''
                }`}
              />
              {validationErrors.timeout && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.timeout}</p>
              )}
            </div>
          </div>

          {/* API設定 */}
          {tempConfig.provider === 'openai' && (
            <div>
              <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                <Key className="w-4 h-4 mr-2" />
                OpenAI API Key
                {configType === 'user' && userOverrideKeys.includes('OPENAI_API_KEY') && (
                  <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={tempConfig.openaiApiKey}
                  onChange={(e) => updateTempConfig('openaiApiKey', e.target.value)}
                  placeholder="sk-..."
                  className={`w-full p-3 pr-10 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                    validationErrors.openaiApiKey ? 'border-red-500' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {validationErrors.openaiApiKey && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.openaiApiKey}</p>
              )}
            </div>
          )}

          {tempConfig.provider === 'azureopenai' && (
            <>
              <div>
                <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                  <Key className="w-4 h-4 mr-2" />
                  Azure OpenAI API Key
                  {configType === 'user' && userOverrideKeys.includes('OPENAI_API_KEY') && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={tempConfig.openaiApiKey}
                    onChange={(e) => updateTempConfig('openaiApiKey', e.target.value)}
                    placeholder="Azure OpenAI API Key"
                    className={`w-full p-3 pr-10 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                      validationErrors.openaiApiKey ? 'border-red-500' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {validationErrors.openaiApiKey && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors.openaiApiKey}</p>
                )}
              </div>
              <div>
                <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                  <Globe className="w-4 h-4 mr-2" />
                  Azure OpenAI エンドポイント
                  {configType === 'user' && userOverrideKeys.includes('AZURE_OPENAI_ENDPOINT') && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
                  )}
                </label>
                <input
                  type="url"
                  value={tempConfig.azureEndpoint}
                  onChange={(e) => updateTempConfig('azureEndpoint', e.target.value)}
                  placeholder="https://your-resource.openai.azure.com"
                  className={`w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                    validationErrors.azureEndpoint ? 'border-red-500' : ''
                  }`}
                />
                {validationErrors.azureEndpoint && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors.azureEndpoint}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  API Version
                  {configType === 'user' && userOverrideKeys.includes('AZURE_OPENAI_API_VERSION') && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
                  )}
                </label>
                <input
                  type="text"
                  value={tempConfig.azureApiVersion}
                  onChange={(e) => updateTempConfig('azureApiVersion', e.target.value)}
                  placeholder="2024-02-15-preview"
                  className="w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </>
          )}

          {tempConfig.provider === 'localllm' && (
            <>
              <div>
                <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                  <Server className="w-4 h-4 mr-2" />
                  ローカルLLM URL
                  {configType === 'user' && userOverrideKeys.includes('LOCAL_LLM_URL') && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
                  )}
                </label>
                <input
                  type="url"
                  value={tempConfig.localLlmUrl}
                  onChange={(e) => updateTempConfig('localLlmUrl', e.target.value)}
                  placeholder="http://localhost:8000"
                  className={`w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                    validationErrors.localLlmUrl ? 'border-red-500' : ''
                  }`}
                />
                {validationErrors.localLlmUrl && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors.localLlmUrl}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  ローカルLLM モデル
                  {configType === 'user' && userOverrideKeys.includes('LOCAL_LLM_MODEL') && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
                  )}
                </label>
                <select
                  value={tempConfig.localLlmModel}
                  onChange={(e) => updateTempConfig('localLlmModel', e.target.value)}
                  className="w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                >
                  {MODELS.localllm.map(model => (
                    <option key={model.value} value={model.value}>
                      {model.label} - {model.description}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-start">
                  <Brain className="w-5 h-5 text-purple-600 mr-2 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-purple-800">
                    <p className="font-semibold mb-1">LangChain Agent モード:</p>
                    <p className="text-xs">
                      ローカルLLM使用時は高度な推論機能（ReAct Agent）が有効になり、思考プロセスがリアルタイムで表示されます。
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 高度な設定（折りたたみ可能） */}
          <div className="border-t pt-6">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-left"
            >
              <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                <Settings className="w-5 h-5 mr-2" />
                高度な設定
              </h3>
              <div className={`transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                {/* システムプロンプト */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    システムプロンプト（カスタム）
                    {configType === 'user' && userOverrideKeys.includes('AI_SYSTEM_PROMPT') && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
                    )}
                  </label>
                  <textarea
                    value={tempConfig.systemPrompt}
                    onChange={(e) => updateTempConfig('systemPrompt', e.target.value)}
                    placeholder="カスタムシステムプロンプトを入力（空欄の場合はデフォルトを使用）"
                    rows={3}
                    className="w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-vertical"
                  />
                </div>

                {/* レスポンス形式 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    レスポンス形式
                    {configType === 'user' && userOverrideKeys.includes('AI_RESPONSE_FORMAT') && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
                    )}
                  </label>
                  <select
                    value={tempConfig.responseFormat}
                    onChange={(e) => updateTempConfig('responseFormat', e.target.value)}
                    className="w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  >
                    <option value="markdown">Markdown</option>
                    <option value="plain">Plain Text</option>
                    <option value="structured">Structured</option>
                  </select>
                </div>

                {/* セーフティ */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <label htmlFor="safetyEnabled" className="text-sm font-semibold text-gray-700 flex items-center">
                      セーフティフィルター
                      {configType === 'user' && userOverrideKeys.includes('AI_SAFETY_ENABLED') && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">カスタム</span>
                      )}
                    </label>
                    <p className="text-xs text-gray-500">有害なコンテンツの生成を防ぐ</p>
                  </div>
                  <input
                    type="checkbox"
                    id="safetyEnabled"
                    checked={tempConfig.safetyEnabled}
                    onChange={(e) => updateTempConfig('safetyEnabled', e.target.checked)}
                    className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* カスタマイズされた設定項目一覧（個人設定の場合のみ） */}
          {configType === 'user' && hasUserConfig && (
            <div className="bg-gray-50 border rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                <Edit3 className="w-4 h-4 mr-2" />
                カスタマイズ済み設定項目
              </h4>
              <div className="space-y-2">
                {userOverrideKeys.map(key => (
                  <div key={key} className="flex items-center justify-between bg-white p-2 rounded border">
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">{key}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        ({userConfigData.config[key] === '***MASKED***' ? '設定済み' : 
                          typeof userConfigData.config[key] === 'string' && userConfigData.config[key].length > 30 
                            ? userConfigData.config[key].substring(0, 30) + '...' 
                            : userConfigData.config[key]})
                      </span>
                    </div>
                    <button
                      onClick={() => removeUserConfigKey(key)}
                      className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                      title="この設定項目を削除"
                      disabled={isLoading}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* アクションボタン */}
        <div className="flex space-x-3 mt-8">
          <button
            onClick={() => setShowSettings(false)}
            className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            閉じる
          </button>

          {/* 設定管理ボタン */}
          <div className="flex space-x-2">
            <button
              onClick={exportConfig}
              className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium flex items-center"
              title="設定をエクスポート"
            >
              <Download className="w-4 h-4" />
            </button>

            <label className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium flex items-center cursor-pointer">
              <Upload className="w-4 h-4" />
              <input
                type="file"
                accept=".json"
                onChange={importConfig}
                className="hidden"
              />
            </label>

            {configType === 'user' && hasUserConfig && (
              <button
                onClick={resetUserConfig}
                disabled={isLoading}
                className="px-4 py-3 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors font-medium disabled:opacity-50 flex items-center"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={isLoading || hasValidationErrors}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg font-medium disabled:opacity-50 flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <Loader className="w-4 h-4 animate-spin mr-2" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {configType === 'user' ? '個人設定を保存' : 'システム設定を保存'}
                {hasValidationErrors && <AlertCircle className="w-4 h-4 ml-2 text-red-300" />}
              </>
            )}
          </button>
        </div>

        {/* ヘルプテキスト */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start">
            <HelpCircle className="w-4 h-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-700">
              <p className="font-semibold mb-1">💡 ヒント:</p>
              <ul className="space-y-1">
                <li>• 個人設定はあなたのみに適用され、他のユーザーには影響しません</li>
                <li>• 設定を削除すると、その項目はシステムデフォルト値に戻ります</li>
                <li>• APIキーなどの機密情報は暗号化されて保存されます</li>
                <li>• 設定のエクスポート/インポート機能で他の環境に設定を移行できます</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

SettingsModal.displayName = 'SettingsModal';

export default SettingsModal;