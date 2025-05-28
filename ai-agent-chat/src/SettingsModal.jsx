import React, { useState, useEffect, memo } from 'react';
import {
  Settings, X, Server, Key, Globe, AlertCircle, Loader, 
  RefreshCw, Save, Copy, Edit3, Brain
} from 'lucide-react';
import { useApp } from './AppContext';

const SettingsModal = memo(() => {
  const { 
    showSettings, 
    agentConfig, 
    fetchAgentConfig, 
    checkServerHealth,
    dispatch,
    API_BASE_URL
  } = useApp();

  const [tempConfig, setTempConfig] = useState({
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    streaming: true,
    openaiApiKey: '',
    azureEndpoint: '',
    azureApiVersion: '2024-02-15-preview',
    localLlmUrl: 'http://localhost:8000',
    localLlmModel: 'Qwen/Qwen2.5-Coder-32B-Instruct'
  });

  const [activeTab, setActiveTab] = useState('general');
  const [envData, setEnvData] = useState(null);
  const [envContent, setEnvContent] = useState('');
  const [isLoadingEnv, setIsLoadingEnv] = useState(false);
  const [envStatus, setEnvStatus] = useState('');

  // 設定モーダルが開かれたときに現在の設定を読み込む
  useEffect(() => {
    if (showSettings) {
      loadCurrentSettings();
    }
  }, [showSettings, agentConfig]);

  const loadCurrentSettings = async () => {
    try {
      if (agentConfig?.config) {
        setTempConfig(prev => ({
          ...prev,
          provider: agentConfig.config.provider || 'openai',
          model: agentConfig.config.model || 'gpt-4o-mini',
          temperature: agentConfig.config.temperature || 0.7,
          streaming: agentConfig.config.streaming !== false,
          localLlmUrl: agentConfig.config.localLlmUrl || 'http://localhost:8000',
          localLlmModel: agentConfig.config.localLlmModel || 'Qwen/Qwen2.5-Coder-32B-Instruct'
        }));
      }

      const envResponse = await fetch(`${API_BASE_URL}/env`);
      if (envResponse.ok) {
        const envData = await envResponse.json();
        if (envData.currentConfig) {
          setTempConfig(prev => ({
            ...prev,
            azureEndpoint: envData.currentConfig.AZURE_OPENAI_ENDPOINT || '',
            azureApiVersion: envData.currentConfig.AZURE_OPENAI_API_VERSION || '2024-02-15-preview'
          }));
        }
      }
    } catch (error) {
      console.error('現在の設定読み込みエラー:', error);
    }
  };

  const fetchEnvData = async () => {
    setIsLoadingEnv(true);
    try {
      const response = await fetch(`${API_BASE_URL}/env`);
      const data = await response.json();
      setEnvData(data);
      setEnvContent(data.content || '');
      setEnvStatus('');
    } catch (error) {
      console.error('.env取得エラー:', error);
      setEnvStatus('エラー: .env取得に失敗しました');
    }
    setIsLoadingEnv(false);
  };

  const updateEnvFile = async () => {
    setIsLoadingEnv(true);
    try {
      const response = await fetch(`${API_BASE_URL}/env`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          envContent: envContent
        })
      });

      const result = await response.json();

      if (response.ok) {
        setEnvStatus('✅ .envファイルを更新しました');
        await fetchEnvData();
      } else {
        setEnvStatus(`❌ エラー: ${result.message}`);
      }
    } catch (error) {
      console.error('.env更新エラー:', error);
      setEnvStatus('❌ エラー: .env更新に失敗しました');
    }
    setIsLoadingEnv(false);
  };

  const reloadEnv = async () => {
    setIsLoadingEnv(true);
    try {
      const response = await fetch(`${API_BASE_URL}/env/reload`, {
        method: 'POST'
      });

      const result = await response.json();

      if (response.ok) {
        setEnvStatus('✅ .env設定を再読み込みしました');
        await fetchAgentConfig();
        await fetchEnvData();

        setTimeout(async () => {
          try {
            await checkServerHealth();
            dispatch({ type: 'SET_SERVER_STATUS', payload: 'connected' });
          } catch (error) {
            dispatch({ type: 'SET_SERVER_STATUS', payload: 'error' });
          }
        }, 1000);
      } else {
        setEnvStatus(`❌ エラー: ${result.message}`);
      }
    } catch (error) {
      console.error('.env再読み込みエラー:', error);
      setEnvStatus('❌ エラー: .env再読み込みに失敗しました');
    }
    setIsLoadingEnv(false);
  };

  const handleTabChange = async (newTab) => {
    setActiveTab(newTab);
    if (newTab === 'env' && !envData) {
      await fetchEnvData();
    }
  };

  const handleSave = async () => {
    try {
      if (activeTab === 'env') {
        await updateEnvFile();
      } else {
        await saveConfigToEnv();
      }
    } catch (error) {
      console.error('設定保存エラー:', error);
      setEnvStatus('❌ エラー: 設定の保存に失敗しました');
    }
  };

  const saveConfigToEnv = async () => {
    try {
      const envVars = {};

      envVars.AI_PROVIDER = tempConfig.provider;
      envVars.AI_MODEL = tempConfig.model;
      envVars.AI_TEMPERATURE = tempConfig.temperature.toString();
      envVars.AI_STREAMING = tempConfig.streaming.toString();

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

      const response = await fetch(`${API_BASE_URL}/env`, {
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
        throw new Error(errorData.message || '設定の保存に失敗しました');
      }

      setEnvStatus('✅ 設定を保存しています...');

      const reloadResponse = await fetch(`${API_BASE_URL}/env/reload`, {
        method: 'POST'
      });

      if (!reloadResponse.ok) {
        const errorData = await reloadResponse.json();
        throw new Error(errorData.message || '設定の再読み込みに失敗しました');
      }

      await fetchAgentConfig();

      setTimeout(async () => {
        try {
          await checkServerHealth();
          dispatch({ type: 'SET_SERVER_STATUS', payload: 'connected' });
          setEnvStatus('✅ 設定を保存し、適用しました');
        } catch (error) {
          dispatch({ type: 'SET_SERVER_STATUS', payload: 'error' });
          setEnvStatus('⚠️ 設定は保存されましたが、サーバーとの接続に問題があります');
        }
      }, 1000);

    } catch (error) {
      console.error('設定保存エラー:', error);
      setEnvStatus(`❌ エラー: ${error.message}`);
      throw error;
    }
  };

  const generateEnvContent = () => {
    const envVars = [];

    envVars.push(`AI_PROVIDER=${tempConfig.provider}`);
    envVars.push(`AI_MODEL=${tempConfig.model}`);
    envVars.push(`AI_TEMPERATURE=${tempConfig.temperature}`);
    envVars.push(`AI_STREAMING=${tempConfig.streaming}`);

    if (tempConfig.provider === 'openai' && tempConfig.openaiApiKey) {
      envVars.push(`OPENAI_API_KEY=${tempConfig.openaiApiKey}`);
    }

    if (tempConfig.provider === 'azureopenai') {
      if (tempConfig.openaiApiKey) envVars.push(`OPENAI_API_KEY=${tempConfig.openaiApiKey}`);
      if (tempConfig.azureEndpoint) envVars.push(`AZURE_OPENAI_ENDPOINT=${tempConfig.azureEndpoint}`);
      if (tempConfig.azureApiVersion) envVars.push(`AZURE_OPENAI_API_VERSION=${tempConfig.azureApiVersion}`);
    }

    if (tempConfig.provider === 'localllm') {
      envVars.push(`LOCAL_LLM_URL=${tempConfig.localLlmUrl}`);
      envVars.push(`LOCAL_LLM_MODEL=${tempConfig.localLlmModel}`);
    }

    envVars.push('PORT=3000');
    envVars.push('HOST=localhost');

    return envVars.join('\n');
  };

  const copyEnvToClipboard = () => {
    navigator.clipboard.writeText(generateEnvContent());
    setEnvStatus('✅ .env設定をクリップボードにコピーしました');
  };

  const applyGeneratedEnv = () => {
    setEnvContent(generateEnvContent());
    setEnvStatus('📝 生成された設定をエディタに適用しました');
  };

  if (!showSettings) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-8 w-[700px] max-w-[90vw] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <Settings className="w-6 h-6 mr-2 text-blue-600" />
            AI設定
          </h2>
          <button
            onClick={() => dispatch({ type: 'SET_SHOW_SETTINGS', payload: false })}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* タブ */}
        <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => handleTabChange('general')}
            className={`flex-1 py-2 px-4 rounded-md transition-colors font-medium ${
              activeTab === 'general'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <Settings className="w-4 h-4 inline mr-2" />
            一般設定
          </button>
          <button
            onClick={() => handleTabChange('endpoints')}
            className={`flex-1 py-2 px-4 rounded-md transition-colors font-medium ${
              activeTab === 'endpoints'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <Server className="w-4 h-4 inline mr-2" />
            エンドポイント
          </button>
          <button
            onClick={() => handleTabChange('env')}
            className={`flex-1 py-2 px-4 rounded-md transition-colors font-medium ${
              activeTab === 'env'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <Edit3 className="w-4 h-4 inline mr-2" />
            .env管理
          </button>
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

        {/* タブコンテンツ - 一般設定 */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                AIプロバイダー
              </label>
              <select
                value={tempConfig.provider}
                onChange={(e) => setTempConfig(prev => ({ ...prev, provider: e.target.value }))}
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

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                モデル
              </label>
              <select
                value={tempConfig.model}
                onChange={(e) => setTempConfig(prev => ({ ...prev, model: e.target.value }))}
                className="w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                {tempConfig.provider === 'localllm' ? (
                  <>
                    <option value="Qwen/Qwen2.5-Coder-32B-Instruct">Qwen2.5-Coder-32B-Instruct</option>
                    <option value="Qwen/Qwen2.5-32B-Instruct">Qwen2.5-32B-Instruct</option>
                    <option value="meta-llama/Llama-3.1-8B-Instruct">Llama-3.1-8B-Instruct</option>
                    <option value="microsoft/DialoGPT-medium">DialoGPT-medium</option>
                  </>
                ) : (
                  <>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Temperature: {tempConfig.temperature}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={tempConfig.temperature}
                onChange={(e) => setTempConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>保守的</span>
                <span>創造的</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <label htmlFor="streaming" className="text-sm font-semibold text-gray-700">
                  ストリーミング
                </label>
                <p className="text-xs text-gray-500">リアルタイムで応答を表示</p>
              </div>
              <input
                type="checkbox"
                id="streaming"
                checked={tempConfig.streaming}
                onChange={(e) => setTempConfig(prev => ({ ...prev, streaming: e.target.checked }))}
                className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>

            {tempConfig.provider === 'localllm' && (
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
            )}
          </div>
        )}

        {/* タブコンテンツ - エンドポイント */}
        {activeTab === 'endpoints' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start">
                <AlertCircle className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-semibold mb-1">API設定について:</p>
                  <p className="text-xs">
                    設定は自動的に保存され、すぐに反映されます。サーバーの再起動は不要です。
                  </p>
                </div>
              </div>
            </div>

            {tempConfig.provider === 'openai' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center">
                  <Key className="w-4 h-4 mr-2" />
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  value={tempConfig.openaiApiKey}
                  onChange={(e) => setTempConfig(prev => ({ ...prev, openaiApiKey: e.target.value }))}
                  placeholder="sk-..."
                  className="w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <p className="text-xs text-gray-500 mt-1">
                  OpenAI APIキーを入力してください。
                </p>
              </div>
            )}

            {tempConfig.provider === 'azureopenai' && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center">
                    <Key className="w-4 h-4 mr-2" />
                    Azure OpenAI API Key
                  </label>
                  <input
                    type="password"
                    value={tempConfig.openaiApiKey}
                    onChange={(e) => setTempConfig(prev => ({ ...prev, openaiApiKey: e.target.value }))}
                    placeholder="Azure OpenAI API Key"
                    className="w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center">
                    <Globe className="w-4 h-4 mr-2" />
                    Azure OpenAI エンドポイント
                  </label>
                  <input
                    type="url"
                    value={tempConfig.azureEndpoint}
                    onChange={(e) => setTempConfig(prev => ({ ...prev, azureEndpoint: e.target.value }))}
                    placeholder="https://your-resource.openai.azure.com"
                    className="w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    APIバージョン
                  </label>
                  <input
                    type="text"
                    value={tempConfig.azureApiVersion}
                    onChange={(e) => setTempConfig(prev => ({ ...prev, azureApiVersion: e.target.value }))}
                    placeholder="2024-02-15-preview"
                    className="w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </>
            )}

            {tempConfig.provider === 'localllm' && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center">
                    <Server className="w-4 h-4 mr-2" />
                    ローカルLLM URL
                  </label>
                  <input
                    type="url"
                    value={tempConfig.localLlmUrl}
                    onChange={(e) => setTempConfig(prev => ({ ...prev, localLlmUrl: e.target.value }))}
                    placeholder="http://localhost:8000"
                    className="w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    モデル名
                  </label>
                  <input
                    type="text"
                    value={tempConfig.localLlmModel}
                    onChange={(e) => setTempConfig(prev => ({ ...prev, localLlmModel: e.target.value }))}
                    placeholder="Qwen/Qwen2.5-Coder-32B-Instruct"
                    className="w-full p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* タブコンテンツ - .env管理 */}
        {activeTab === 'env' && (
          <div className="space-y-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start">
                <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-yellow-800">
                  <p className="font-semibold mb-1">高度な設定:</p>
                  <p className="text-xs">
                    通常は「一般設定」と「エンドポイント」タブで設定することをお勧めします。
                  </p>
                </div>
              </div>
            </div>

            {envData && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center">
                    <Server className="w-4 h-4 mr-2" />
                    現在の設定状態
                  </h4>
                  <button
                    onClick={fetchEnvData}
                    disabled={isLoadingEnv}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200 transition-colors disabled:opacity-50"
                  >
                    {isLoadingEnv ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="font-medium text-gray-600">プロバイダー:</span>
                    <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded">
                      {envData.currentConfig?.AI_PROVIDER || '未設定'}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">モデル:</span>
                    <span className="ml-2">{envData.currentConfig?.AI_MODEL || '未設定'}</span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-gray-700">
                  .env ファイル内容
                </label>
                <div className="flex space-x-2">
                  <button
                    onClick={applyGeneratedEnv}
                    className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm font-medium hover:bg-green-200 transition-colors"
                    title="現在の設定から.env内容を生成"
                  >
                    自動生成
                  </button>
                  <button
                    onClick={copyEnvToClipboard}
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    <Copy className="w-4 h-4 inline mr-1" />
                    コピー
                  </button>
                </div>
              </div>
              <textarea
                value={envContent}
                onChange={(e) => setEnvContent(e.target.value)}
                className="w-full h-64 p-3 text-sm font-mono bg-gray-50 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="# .env ファイルの内容を入力してください&#10;AI_PROVIDER=openai&#10;AI_MODEL=gpt-4o-mini&#10;OPENAI_API_KEY=your-api-key-here"
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={updateEnvFile}
                disabled={isLoadingEnv}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg font-medium disabled:opacity-50 flex items-center justify-center"
              >
                {isLoadingEnv ? (
                  <Loader className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                .envファイルを更新
              </button>
              <button
                onClick={reloadEnv}
                disabled={isLoadingEnv}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all shadow-md hover:shadow-lg font-medium disabled:opacity-50 flex items-center justify-center"
              >
                {isLoadingEnv ? (
                  <Loader className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                設定を再読み込み
              </button>
            </div>
          </div>
        )}

        <div className="flex space-x-3 mt-8">
          <button
            onClick={() => dispatch({ type: 'SET_SHOW_SETTINGS', payload: false })}
            className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            {activeTab === 'env' ? '閉じる' : 'キャンセル'}
          </button>
          {activeTab !== 'env' && (
            <button
              onClick={handleSave}
              disabled={isLoadingEnv}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg font-medium disabled:opacity-50 flex items-center justify-center"
            >
              {isLoadingEnv ? (
                <>
                  <Loader className="w-4 h-4 animate-spin mr-2" />
                  適用中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  設定を保存・適用
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

SettingsModal.displayName = 'SettingsModal';

export default SettingsModal;