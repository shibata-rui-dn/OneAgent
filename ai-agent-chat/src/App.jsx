import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Settings, Wrench, Loader, AlertCircle, CheckCircle, X, Menu } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

const AgentChat = () => {
  // State管理
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tools, setTools] = useState([]);
  const [selectedTools, setSelectedTools] = useState(new Set());
  const [agentConfig, setAgentConfig] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [serverStatus, setServerStatus] = useState('connecting');
  const [toolIcons, setToolIcons] = useState(new Map()); // アイコンキャッシュ
  
  // Settings state
  const [settings, setSettings] = useState({
    streaming: true,
    temperature: 0.7,
    model: 'gpt-4o-mini'
  });

  // Refs
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  // 初期化
  useEffect(() => {
    initializeApp();
  }, []);

  // メッセージが更新されたら最下部にスクロール
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeApp = async () => {
    try {
      // サーバー状態確認
      await checkServerHealth();
      
      // ツール一覧取得
      await fetchTools();
      
      // エージェント設定取得
      await fetchAgentConfig();
      
      setServerStatus('connected');
    } catch (error) {
      console.error('アプリ初期化エラー:', error);
      setServerStatus('error');
    }
  };

  const checkServerHealth = async () => {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error('サーバーに接続できません');
    }
    return response.json();
  };

  const fetchTools = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/tools`);
      const data = await response.json();
      setTools(data.tools || []);
      
      // 初期状態で全ツールを選択
      setSelectedTools(new Set(data.tools.map((tool) => tool.name)));
      
      // アイコンがあるツールのアイコンを取得
      await loadToolIcons(data.tools || []);
      
    } catch (error) {
      console.error('ツール取得エラー:', error);
    }
  };

  // ツールアイコンを読み込み
  const loadToolIcons = async (toolsList) => {
    const iconPromises = toolsList
      .filter(tool => tool.hasIcon)
      .map(async (tool) => {
        try {
          const response = await fetch(`${API_BASE_URL}/tools/${tool.name}/icon`);
          if (response.ok) {
            const svgText = await response.text();
            return [tool.name, svgText];
          }
        } catch (error) {
          console.warn(`アイコン読み込みエラー ${tool.name}:`, error);
        }
        return null;
      });

    const results = await Promise.all(iconPromises);
    const iconMap = new Map();
    
    results.forEach(result => {
      if (result) {
        iconMap.set(result[0], result[1]);
      }
    });
    
    setToolIcons(iconMap);
  };

  const fetchAgentConfig = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/agent/config`);
      const data = await response.json();
      setAgentConfig(data);
      
      if (data.config) {
        setSettings({
          streaming: data.config.streaming,
          temperature: data.config.temperature,
          model: data.config.model
        });
      }
    } catch (error) {
      console.error('エージェント設定取得エラー:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      if (settings.streaming) {
        await handleStreamingResponse(userMessage.content);
      } else {
        await handleNonStreamingResponse(userMessage.content);
      }
    } catch (error) {
      console.error('メッセージ送信エラー:', error);
      
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStreamingResponse = async (query) => {
    abortControllerRef.current = new AbortController();
    
    const response = await fetch(`${API_BASE_URL}/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        streaming: true,
        tools: Array.from(selectedTools), // 選択されたツールのみを送信
        ...settings
      }),
      signal: abortControllerRef.current.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const assistantMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
      toolCalls: []
    };

    setMessages(prev => [...prev, assistantMessage]);

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('レスポンスボディが読み取れません');
    }

    try {
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data) {
              try {
                const chunk = JSON.parse(data);
                updateStreamingMessage(assistantMessage.id, chunk);
              } catch (error) {
                console.warn('JSON parse error:', data);
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      
      // ストリーミング完了
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessage.id 
          ? { ...msg, streaming: false }
          : msg
      ));
    }
  };

  const updateStreamingMessage = (messageId, chunk) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== messageId) return msg;
      
      const updatedMsg = { ...msg };
      
      switch (chunk.type) {
        case 'text':
          updatedMsg.content += chunk.content;
          break;
        case 'tool_call_start':
          if (!updatedMsg.toolCalls) updatedMsg.toolCalls = [];
          updatedMsg.toolCalls.push({
            name: chunk.tool_name,
            arguments: chunk.tool_args,
          });
          break;
        case 'tool_call_result':
          if (updatedMsg.toolCalls) {
            const toolCall = updatedMsg.toolCalls.find(tc => tc.name === chunk.tool_name);
            if (toolCall) {
              toolCall.result = chunk.result;
            }
          }
          break;
        case 'tool_call_error':
          if (updatedMsg.toolCalls) {
            const toolCall = updatedMsg.toolCalls.find(tc => tc.name === chunk.tool_name);
            if (toolCall) {
              toolCall.error = chunk.error;
            }
          }
          break;
        case 'error':
          updatedMsg.content += `\n[エラー: ${chunk.content}]`;
          break;
      }
      
      return updatedMsg;
    }));
  };

  const handleNonStreamingResponse = async (query) => {
    const response = await fetch(`${API_BASE_URL}/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        streaming: false,
        tools: Array.from(selectedTools), // 選択されたツールのみを送信
        ...settings
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    
    const assistantMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: result.content || 'レスポンスが空です',
      timestamp: new Date(),
      toolCalls: result.tool_calls || []
    };

    setMessages(prev => [...prev, assistantMessage]);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleToolSelection = (toolName) => {
    setSelectedTools(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(toolName)) {
        newSelection.delete(toolName);
      } else {
        newSelection.add(toolName);
      }
      return newSelection;
    });
  };

  const selectAllTools = () => {
    setSelectedTools(new Set(tools.map(tool => tool.name)));
  };

  const deselectAllTools = () => {
    setSelectedTools(new Set());
  };

  const clearMessages = () => {
    setMessages([]);
  };

  const stopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  // ツールアイコンコンポーネント
  const ToolIcon = ({ toolName, className = "w-4 h-4" }) => {
    const iconSvg = toolIcons.get(toolName);
    
    if (iconSvg) {
      return (
        <div 
          className={className}
          dangerouslySetInnerHTML={{ __html: iconSvg }}
        />
      );
    }
    
    // デフォルトアイコン
    return <Wrench className={className} />;
  };

  const renderMessage = (message) => {
    const isUser = message.role === 'user';
    
    return (
      <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
        <div className={`flex items-start max-w-3xl ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isUser ? 'bg-blue-500 ml-2' : 'bg-gray-500 mr-2'
          }`}>
            {isUser ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
          </div>
          
          <div className={`rounded-lg px-4 py-2 ${
            isUser 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-100 text-gray-800 border'
          }`}>
            <div className="whitespace-pre-wrap break-words">
              {message.content}
              {message.streaming && (
                <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1"></span>
              )}
            </div>
            
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="text-sm text-gray-600 mb-2 flex items-center">
                  <Wrench size={14} className="mr-1" />
                  使用されたツール
                </div>
                
                {message.toolCalls.map((toolCall, index) => (
                  <div key={index} className="mb-2 p-2 bg-gray-50 rounded text-sm">
                    <div className="font-medium text-gray-700 flex items-center">
                      <ToolIcon toolName={toolCall.name} className="w-4 h-4 mr-2" />
                      {toolCall.name}
                    </div>
                    
                    {toolCall.arguments && (
                      <div className="text-gray-600 mt-1">
                        引数: {JSON.stringify(toolCall.arguments)}
                      </div>
                    )}
                    
                    {toolCall.result && (
                      <div className="text-green-700 mt-1 flex items-start">
                        <CheckCircle size={14} className="mr-1 mt-0.5 flex-shrink-0" />
                        結果: {toolCall.result}
                      </div>
                    )}
                    
                    {toolCall.error && (
                      <div className="text-red-700 mt-1 flex items-start">
                        <AlertCircle size={14} className="mr-1 mt-0.5 flex-shrink-0" />
                        エラー: {toolCall.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            <div className="text-xs text-gray-500 mt-2">
              {message.timestamp.toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSidebar = () => (
    <div className={`fixed inset-y-0 left-0 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
                    w-80 bg-white shadow-lg border-r transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 z-50`}>
      
      <div className="flex items-center justify-between h-16 px-4 border-b">
        <h2 className="text-lg font-semibold">AI Agent Chat</h2>
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-2 rounded-md hover:bg-gray-100"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-4 space-y-6 overflow-y-auto h-full">
        {/* サーバー状態 */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700">サーバー状態</h3>
          <div className={`flex items-center space-x-2 p-2 rounded ${
            serverStatus === 'connected' ? 'bg-green-50 text-green-700' :
            serverStatus === 'error' ? 'bg-red-50 text-red-700' :
            'bg-yellow-50 text-yellow-700'
          }`}>
            {serverStatus === 'connected' ? <CheckCircle size={16} /> :
             serverStatus === 'error' ? <AlertCircle size={16} /> :
             <Loader size={16} className="animate-spin" />}
            <span className="text-sm">
              {serverStatus === 'connected' ? '接続済み' :
               serverStatus === 'error' ? '接続エラー' :
               '接続中...'}
            </span>
          </div>
        </div>

        {/* 設定 */}
        <div className="space-y-3">
          <h3 className="font-medium text-gray-700 flex items-center">
            <Settings size={16} className="mr-2" />
            設定
          </h3>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600">モデル</label>
              <select
                value={settings.model}
                onChange={(e) => setSettings(prev => ({ ...prev, model: e.target.value }))}
                className="w-full mt-1 p-2 border rounded text-sm"
              >
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-gray-600">温度: {settings.temperature}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={settings.temperature}
                onChange={(e) => setSettings(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                className="w-full mt-1"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="streaming"
                checked={settings.streaming}
                onChange={(e) => setSettings(prev => ({ ...prev, streaming: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="streaming" className="text-sm text-gray-600">
                ストリーミング
              </label>
            </div>
          </div>
        </div>

        {/* 利用可能ツール */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-700 flex items-center">
              <Wrench size={16} className="mr-2" />
              利用可能ツール ({tools.length})
            </h3>
          </div>
          
          {/* ツール選択状態の表示 */}
          <div className={`p-2 rounded text-sm ${
            selectedTools.size === 0 ? 'bg-red-50 text-red-700' :
            selectedTools.size === tools.length ? 'bg-green-50 text-green-700' :
            'bg-blue-50 text-blue-700'
          }`}>
            {selectedTools.size === 0 && '⚠️ ツールが選択されていません'}
            {selectedTools.size > 0 && selectedTools.size < tools.length && 
              `📋 ${selectedTools.size}/${tools.length} ツールが選択中`}
            {selectedTools.size === tools.length && selectedTools.size > 0 && 
              '✅ すべてのツールが選択中'}
          </div>

          {/* 一括選択ボタン */}
          <div className="flex space-x-2">
            <button
              onClick={selectAllTools}
              className="flex-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
            >
              すべて選択
            </button>
            <button
              onClick={deselectAllTools}
              className="flex-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200"
            >
              すべて解除
            </button>
          </div>
          
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {tools.map((tool) => (
              <div key={tool.name} className={`border rounded p-3 ${
                selectedTools.has(tool.name) ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
              }`}>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={tool.name}
                    checked={selectedTools.has(tool.name)}
                    onChange={() => toggleToolSelection(tool.name)}
                    className="rounded"
                  />
                  <div className="flex items-center space-x-2 flex-1">
                    <ToolIcon toolName={tool.name} className="w-4 h-4" />
                    <label htmlFor={tool.name} className={`font-medium text-sm cursor-pointer ${
                      selectedTools.has(tool.name) ? 'text-blue-700' : 'text-gray-700'
                    }`}>
                      {tool.name}
                    </label>
                    {tool.hasIcon && (
                      <span className="text-xs text-gray-500">🎨</span>
                    )}
                  </div>
                </div>
                <p className={`text-xs mt-1 ml-6 ${
                  selectedTools.has(tool.name) ? 'text-blue-600' : 'text-gray-600'
                }`}>
                  {tool.description}
                </p>
                {tool.version && (
                  <p className={`text-xs mt-1 ml-6 ${
                    selectedTools.has(tool.name) ? 'text-blue-500' : 'text-gray-500'
                  }`}>
                    v{tool.version}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* アクション */}
        <div className="space-y-2">
          <button
            onClick={clearMessages}
            className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
          >
            チャット履歴をクリア
          </button>
          
          <button
            onClick={async () => {
              await fetchTools();
              console.log('ツールを再読み込みしました');
            }}
            className="w-full px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
          >
            ツールを再読み込み
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      {/* サイドバー */}
      {renderSidebar()}
      
      {/* オーバーレイ（モバイル用） */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* メインチャット */}
      <div className="flex-1 flex flex-col">
        {/* ヘッダー */}
        <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-md hover:bg-gray-100"
            >
              <Menu size={20} />
            </button>
            
            <div className="flex items-center space-x-2">
              <Bot size={24} className="text-blue-500" />
              <h1 className="text-xl font-semibold">AI Agent</h1>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {isLoading && (
              <button
                onClick={stopStreaming}
                className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
              >
                停止
              </button>
            )}
            
            <div className={`w-3 h-3 rounded-full ${
              serverStatus === 'connected' ? 'bg-green-500' :
              serverStatus === 'error' ? 'bg-red-500' :
              'bg-yellow-500'
            }`} />
          </div>
        </div>

        {/* メッセージエリア */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-8">
              <Bot size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-lg">AIエージェントと会話を始めましょう</p>
              <p className="text-sm mt-2">
                選択されたツール: {selectedTools.size}個
              </p>
              {selectedTools.size === 0 && (
                <p className="text-sm mt-1 text-red-500">
                  ⚠️ ツールが選択されていません
                </p>
              )}
              {selectedTools.size > 0 && (
                <div className="flex justify-center space-x-2 mt-3">
                  {Array.from(selectedTools).slice(0, 5).map(toolName => (
                    <div key={toolName} className="flex items-center space-x-1 bg-blue-100 px-2 py-1 rounded text-xs">
                      <ToolIcon toolName={toolName} className="w-3 h-3" />
                      <span>{toolName}</span>
                    </div>
                  ))}
                  {selectedTools.size > 5 && (
                    <span className="text-xs text-gray-400">+{selectedTools.size - 5}個</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map(renderMessage)}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 入力エリア */}
        <div className="bg-white border-t p-4">
          <div className="flex space-x-2">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="メッセージを入力してください..."
              className="flex-1 p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={1}
              disabled={isLoading || serverStatus !== 'connected'}
            />
            
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading || serverStatus !== 'connected'}
              className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isLoading ? (
                <Loader size={20} className="animate-spin" />
              ) : (
                <Send size={20} />
              )}
            </button>
          </div>
          
          <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
            <span>
              Enterで送信 • Shift+Enterで改行
            </span>
            <span className={selectedTools.size === 0 ? 'text-red-500 font-medium' : ''}>
              選択中ツール: {selectedTools.size}/{tools.length}
              {selectedTools.size === 0 && ' (要選択)'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentChat;