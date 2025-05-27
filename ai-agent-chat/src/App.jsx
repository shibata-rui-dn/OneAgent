import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Send, Bot, User, Settings, Plus, Wrench, Loader, AlertCircle,
  CheckCircle, X, Edit3, Trash2, Copy, Save, RefreshCw,
  MessageSquare, Zap, Palette, Server, Key, Globe, Brain,
  Lightbulb, Cog, Eye, Target, Cpu
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000';

// ランダム動物名生成
const ANIMAL_NAMES = [
  'パンダ', 'コアラ', 'ライオン', 'トラ', 'ゾウ', 'キリン', 'シマウマ', 'カンガルー',
  'ペンギン', 'フクロウ', 'ワシ', 'ハヤブサ', 'イルカ', 'クジラ', 'アザラシ', 'ラッコ',
  'ウサギ', 'リス', 'タヌキ', 'キツネ', 'オオカミ', 'クマ', 'シカ', 'イノシシ',
  'ヒョウ', 'チーター', 'サル', 'ゴリラ', 'オランウータン', 'チンパンジー'
];

const generateRandomAnimalName = () => {
  return ANIMAL_NAMES[Math.floor(Math.random() * ANIMAL_NAMES.length)];
};

// ページアイコン生成（動物の絵文字）
const getAnimalEmoji = (name) => {
  const emojiMap = {
    'パンダ': '🐼', 'コアラ': '🐨', 'ライオン': '🦁', 'トラ': '🐯', 'ゾウ': '🐘',
    'キリン': '🦒', 'シマウマ': '🦓', 'カンガルー': '🦘', 'ペンギン': '🐧', 'フクロウ': '🦉',
    'ワシ': '🦅', 'ハヤブサ': '🦅', 'イルカ': '🐬', 'クジラ': '🐋', 'アザラシ': '🦭',
    'ラッコ': '🦦', 'ウサギ': '🐰', 'リス': '🐿️', 'タヌキ': '🦝', 'キツネ': '🦊',
    'オオカミ': '🐺', 'クマ': '🐻', 'シカ': '🦌', 'イノシシ': '🐗', 'ヒョウ': '🐆',
    'チーター': '🐆', 'サル': '🐵', 'ゴリラ': '🦍', 'オランウータン': '🦧', 'チンパンジー': '🐵'
  };
  return emojiMap[name] || '🐾';
};

// ツールアイコンコンポーネント（メモ化）
const ToolIcon = React.memo(({ toolName, className = "w-6 h-6", toolIcons }) => {
  const iconSvg = toolIcons.get(toolName);

  if (iconSvg) {
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: iconSvg }}
      />
    );
  }

  return <Wrench className={className} />;
});

// メッセージコンポーネント（メモ化）
const Message = React.memo(({ message, agentConfig, processMessageContent }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`}>
      <div className={`flex items-start max-w-5xl ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-md ${isUser ? 'bg-gradient-to-r from-blue-500 to-blue-600 ml-3' : 'bg-gradient-to-r from-gray-500 to-gray-600 mr-3'
          }`}>
          {isUser ? <User size={18} className="text-white" /> : <Bot size={18} className="text-white" />}
        </div>

        <div className={`rounded-2xl px-6 py-4 shadow-sm max-w-full ${isUser
            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
            : 'bg-white text-gray-800 border border-gray-200'
          }`}>
          <div className="break-words">
            {isUser ? (
              <>
                <div className="whitespace-pre-wrap">{message.content}</div>
                {message.streaming && (
                  <span className="inline-block w-2 h-5 bg-gray-300 animate-pulse ml-1 rounded"></span>
                )}
              </>
            ) : (
              <div>
                {processMessageContent(message.content)}
                {message.streaming && (
                  <div className="flex items-center mt-2 text-gray-500">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400 mr-2"></div>
                    <span className="text-sm">処理中...</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ツール実行情報の詳細表示 */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="text-sm font-semibold text-gray-600 mb-2 flex items-center">
                <Wrench className="w-4 h-4 mr-1" />
                ツール実行詳細
              </div>
              <div className="space-y-2">
                {message.toolCalls.map((tool, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-800">{tool.name}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        tool.status === 'completed' ? 'bg-green-100 text-green-700' :
                        tool.status === 'error' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {tool.status === 'completed' ? '完了' :
                         tool.status === 'error' ? 'エラー' : '実行中'}
                      </span>
                    </div>
                    {tool.result && (
                      <div className="text-gray-600 mt-1">
                        <strong>結果:</strong> {tool.result}
                      </div>
                    )}
                    {tool.error && (
                      <div className="text-red-600 mt-1">
                        <strong>エラー:</strong> {tool.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-gray-400 mt-3 flex items-center justify-between">
            <span>{message.timestamp.toLocaleTimeString()}</span>
            {!isUser && agentConfig?.langChainEnabled && (
              <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-medium">
                LangChain Agent
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

// ツールボタンコンポーネント（メモ化）
const ToolButton = React.memo(({ tool, isSelected, onToggle, toolIcons }) => (
  <button
    onClick={() => onToggle(tool.name)}
    className={`p-3 rounded-lg border-2 transition-all duration-300 flex items-center space-x-3 hover:shadow-md ${isSelected
      ? 'border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm'
      : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    title={tool.description}
  >
    <div className="relative">
      <ToolIcon toolName={tool.name} className="w-8 h-8 flex-shrink-0" toolIcons={toolIcons} />
      {isSelected && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
          <CheckCircle size={10} className="text-white" />
        </div>
      )}
    </div>
    <div className="flex-1 text-left min-w-0">
      <div className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-700' : 'text-gray-700'
        }`}>
        {tool.name}
      </div>
      <div className={`text-xs mt-1 line-clamp-2 ${isSelected ? 'text-blue-600' : 'text-gray-500'
        }`}>
        {tool.description}
      </div>
    </div>
  </button>
));

// ページアイコンコンポーネント（メモ化）
const PageIcon = React.memo(({ page, isActive, onSelect, onDelete, canDelete }) => (
  <div className="relative group">
    <button
      onClick={() => onSelect(page.id)}
      className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-105 ${isActive
        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
      title={page.name}
    >
      <span className="text-xl">{getAnimalEmoji(page.name)}</span>
    </button>

    {/* ページ削除ボタン */}
    {canDelete && (
      <button
        onClick={() => onDelete(page.id)}
        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full items-center justify-center hidden group-hover:flex hover:bg-red-600 shadow-md transition-all duration-200"
        title="ページを削除"
      >
        <X size={12} className="text-white" />
      </button>
    )}
  </div>
));

const MultiPageAgentChat = () => {
  // State管理
  const [pages, setPages] = useState([]);
  const [currentPageId, setCurrentPageId] = useState(null);
  const [tools, setTools] = useState([]);
  const [toolIcons, setToolIcons] = useState(new Map());
  const [serverStatus, setServerStatus] = useState('connecting');
  const [agentConfig, setAgentConfig] = useState(null);

  // UI状態
  const [showSettings, setShowSettings] = useState(false);
  const [editingPageName, setEditingPageName] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Refs
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  // メモ化された値
  const currentPage = useMemo(() => {
    return pages.find(p => p.id === currentPageId);
  }, [pages, currentPageId]);

  const canDeletePages = useMemo(() => {
    return pages.length > 1;
  }, [pages.length]);

  // スクロール関数（メモ化）
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // メッセージ内容処理（メモ化）
  const processMessageContent = useCallback((content) => {
    const lines = content.split('\n');
    const processedElements = [];
    let currentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        continue;
      }

      // 利用可能なツール表示
      if (trimmedLine.includes('🔧 **利用可能なツール**')) {
        processedElements.push(
          <div key={currentIndex++} className="my-3 p-3 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg">
            <div className="flex items-center text-blue-800 font-medium">
              <Wrench className="w-4 h-4 mr-2" />
              {trimmedLine.replace(/🔧 \*\*利用可能なツール\*\*:/, '利用可能なツール:')}
            </div>
          </div>
        );
        continue;
      }

      // 思考プロセス
      if (trimmedLine.includes('💭 **思考')) {
        processedElements.push(
          <div key={currentIndex++} className="my-3 p-4 bg-indigo-50 border-l-4 border-indigo-400 rounded-r-lg">
            <div className="flex items-start">
              <Brain className="w-5 h-5 mr-2 text-indigo-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-indigo-800 font-semibold text-sm mb-1">
                  {trimmedLine.replace(/💭 \*\*思考\d*\*\*:?/, '思考プロセス')}
                </div>
                <div className="text-indigo-700 text-sm">
                  {line.replace(/💭 \*\*思考\d*\*\*:?\s*/, '')}
                </div>
              </div>
            </div>
          </div>
        );
        continue;
      }

      // アクション
      if (trimmedLine.includes('⚡ **アクション')) {
        processedElements.push(
          <div key={currentIndex++} className="my-3 p-4 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg">
            <div className="flex items-start">
              <Zap className="w-5 h-5 mr-2 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-amber-800 font-semibold text-sm mb-1">
                  実行アクション
                </div>
                <div className="text-amber-700 text-sm">
                  {line.replace(/⚡ \*\*アクション\d*\*\*:?\s*/, '')}
                </div>
              </div>
            </div>
          </div>
        );
        continue;
      }

      // 観察結果
      if (trimmedLine.includes('✅ **観察')) {
        processedElements.push(
          <div key={currentIndex++} className="my-3 p-4 bg-emerald-50 border-l-4 border-emerald-400 rounded-r-lg">
            <div className="flex items-start">
              <Eye className="w-5 h-5 mr-2 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-emerald-800 font-semibold text-sm mb-1">
                  観察結果
                </div>
                <div className="text-emerald-700 text-sm">
                  {line.replace(/✅ \*\*観察\d*\*\*:?\s*/, '')}
                </div>
              </div>
            </div>
          </div>
        );
        continue;
      }

      // 最終回答
      if (trimmedLine.includes('📋 **最終回答**')) {
        processedElements.push(
          <div key={currentIndex++} className="my-4 p-4 bg-purple-50 border-2 border-purple-400 rounded-lg">
            <div className="flex items-center text-purple-800 font-bold text-base mb-2">
              <Target className="w-5 h-5 mr-2" />
              最終回答
            </div>
          </div>
        );
        continue;
      }

      // AI Agent分析開始
      if (trimmedLine.includes('🤖 **AI Agent**')) {
        processedElements.push(
          <div key={currentIndex++} className="my-3 p-3 bg-gray-50 border-l-4 border-gray-400 rounded-r-lg">
            <div className="flex items-center text-gray-700 font-medium">
              <Cpu className="w-4 h-4 mr-2" />
              <div className="animate-pulse">AI Agent 分析中...</div>
            </div>
          </div>
        );
        continue;
      }

      // ツール実行中
      if (trimmedLine.includes('🔧 ') && trimmedLine.includes('実行中')) {
        const toolName = trimmedLine.match(/🔧 \*\*(.+?)\*\*/)?.[1] || 'ツール';
        processedElements.push(
          <div key={currentIndex++} className="my-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center text-blue-700 font-medium">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <Cog className="w-4 h-4 mr-2" />
              {toolName} 実行中...
            </div>
          </div>
        );
        continue;
      }

      // ツールリスト表示
      if (trimmedLine.startsWith('• ')) {
        processedElements.push(
          <div key={currentIndex++} className="ml-4 text-sm text-gray-600 flex items-center">
            <div className="w-2 h-2 bg-blue-400 rounded-full mr-2"></div>
            {trimmedLine.replace('• ', '')}
          </div>
        );
        continue;
      }

      // 通常のテキスト
      if (trimmedLine) {
        processedElements.push(
          <div key={currentIndex++} className="my-1 text-gray-800">
            {line}
          </div>
        );
      }
    }

    return processedElements.length > 0 ? processedElements : [
      <div key={0} className="text-gray-800">{content}</div>
    ];
  }, []);

  // 初期化
  useEffect(() => {
    initializeApp();
  }, []);

  // メッセージが更新されたら最下部にスクロール（最適化）
  useEffect(() => {
    if (currentPage?.messages?.length > 0) {
      scrollToBottom();
    }
  }, [currentPage?.messages?.length, scrollToBottom]);

  const initializeApp = async () => {
    try {
      await checkServerHealth();
      await fetchTools();
      await fetchAgentConfig();

      setServerStatus('connected');

      // 初期ページがない場合のみ作成
      if (pages.length === 0) {
        const initialPage = createInitialPage();
        setPages([initialPage]);
        setCurrentPageId(initialPage.id);
      }

      setIsInitialized(true);

    } catch (error) {
      console.error('アプリ初期化エラー:', error);
      setServerStatus('error');

      // エラーが発生しても初期ページは作成
      if (pages.length === 0) {
        const initialPage = createInitialPage();
        setPages([initialPage]);
        setCurrentPageId(initialPage.id);
      }
      setIsInitialized(true);
    }
  };

  const createInitialPage = useCallback(() => {
    return {
      id: Date.now().toString(),
      name: generateRandomAnimalName(),
      messages: [],
      selectedTools: new Set(),
      settings: {
        streaming: true,
        temperature: 0.7,
        model: 'gpt-4o-mini'
      }
    };
  }, []);

  // 初期化完了後とツール読み込み後にツール選択を更新（最適化）
  useEffect(() => {
    if (isInitialized && tools.length > 0) {
      setPages(prev => prev.map(page => {
        if (page.selectedTools.size === 0) {
          return {
            ...page,
            selectedTools: new Set(tools.map(t => t.name))
          };
        }
        return page;
      }));
    }
  }, [isInitialized, tools.length]); // tools.lengthのみを監視

  const checkServerHealth = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error('サーバーに接続できません');
    }
    return response.json();
  }, []);

  const fetchTools = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/tools`);
      const data = await response.json();
      setTools(data.tools || []);
      await loadToolIcons(data.tools || []);
    } catch (error) {
      console.error('ツール取得エラー:', error);
    }
  }, []);

  const loadToolIcons = useCallback(async (toolsList) => {
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
  }, []);

  const fetchAgentConfig = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/agent/config`);
      const data = await response.json();
      setAgentConfig(data);
    } catch (error) {
      console.error('エージェント設定取得エラー:', error);
    }
  }, []);

  // ページ管理（メモ化）
  const createNewPage = useCallback(() => {
    const newPage = {
      id: Date.now().toString(),
      name: generateRandomAnimalName(),
      messages: [],
      selectedTools: new Set(tools.map(t => t.name)),
      settings: {
        streaming: true,
        temperature: 0.7,
        model: 'gpt-4o-mini'
      }
    };

    setPages(prev => [...prev, newPage]);
    setCurrentPageId(newPage.id);
  }, [tools]);

  const deletePage = useCallback((pageId) => {
    if (pages.length <= 1) return;

    setPages(prev => prev.filter(p => p.id !== pageId));

    if (currentPageId === pageId) {
      const remainingPages = pages.filter(p => p.id !== pageId);
      setCurrentPageId(remainingPages[0]?.id || null);
    }
  }, [pages.length, currentPageId, pages]);

  const updatePageName = useCallback((pageId, newName) => {
    setPages(prev => prev.map(page =>
      page.id === pageId ? { ...page, name: newName } : page
    ));
  }, []);

  const toggleToolInPage = useCallback((pageId, toolName) => {
    setPages(prev => prev.map(page => {
      if (page.id === pageId) {
        const newSelectedTools = new Set(page.selectedTools);
        if (newSelectedTools.has(toolName)) {
          newSelectedTools.delete(toolName);
        } else {
          newSelectedTools.add(toolName);
        }
        return { ...page, selectedTools: newSelectedTools };
      }
      return page;
    }));
  }, []);

  // メッセージ送信（メモ化）
  const handleSendMessage = useCallback(async (message) => {
    if (!currentPage || !message.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    };

    // ページのメッセージを更新
    setPages(prev => prev.map(page =>
      page.id === currentPageId
        ? { ...page, messages: [...page.messages, userMessage] }
        : page
    ));

    try {
      if (currentPage.settings.streaming) {
        await handleStreamingResponse(message, currentPage);
      } else {
        await handleNonStreamingResponse(message, currentPage);
      }
    } catch (error) {
      console.error('メッセージ送信エラー:', error);

      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
        timestamp: new Date()
      };

      setPages(prev => prev.map(page =>
        page.id === currentPageId
          ? { ...page, messages: [...page.messages, errorMessage] }
          : page
      ));
    }
  }, [currentPage, currentPageId]);

  const handleStreamingResponse = useCallback(async (query, currentPage) => {
    abortControllerRef.current = new AbortController();

    const response = await fetch(`${API_BASE_URL}/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        streaming: true,
        tools: Array.from(currentPage.selectedTools),
        ...currentPage.settings
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
      toolCalls: [],
      reasoningSteps: []
    };

    setPages(prev => prev.map(page =>
      page.id === currentPageId
        ? { ...page, messages: [...page.messages, assistantMessage] }
        : page
    ));

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
            if (data && data !== '{"type": "end"}') {
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
      setPages(prev => prev.map(page =>
        page.id === currentPageId
          ? {
            ...page,
            messages: page.messages.map(msg =>
              msg.id === assistantMessage.id
                ? { ...msg, streaming: false }
                : msg
            )
          }
          : page
      ));
    }
  }, [currentPageId]);

  const updateStreamingMessage = useCallback((messageId, chunk) => {
    setPages(prev => prev.map(page => {
      if (page.id !== currentPageId) return page;

      return {
        ...page,
        messages: page.messages.map(msg => {
          if (msg.id !== messageId) return msg;

          const updatedMsg = { ...msg };

          switch (chunk.type) {
            case 'text':
              updatedMsg.content += chunk.content;
              break;

            case 'tool_call_start':
              if (!updatedMsg.toolCalls) updatedMsg.toolCalls = [];

              let existingToolCall = updatedMsg.toolCalls.find(tc =>
                tc.name === chunk.tool_name && !tc.result && !tc.error
              );

              if (!existingToolCall) {
                updatedMsg.toolCalls.push({
                  name: chunk.tool_name,
                  arguments: chunk.tool_args,
                  status: 'executing',
                  timestamp: new Date().toISOString()
                });
              }
              break;

            case 'tool_call_result':
              if (updatedMsg.toolCalls) {
                const toolCall = updatedMsg.toolCalls.find(tc =>
                  tc.name === chunk.tool_name && tc.status === 'executing'
                );
                if (toolCall) {
                  toolCall.result = chunk.result;
                  toolCall.status = 'completed';
                  toolCall.completedAt = new Date().toISOString();
                }
              }
              break;

            case 'tool_call_error':
              if (updatedMsg.toolCalls) {
                const toolCall = updatedMsg.toolCalls.find(tc =>
                  tc.name === chunk.tool_name && tc.status === 'executing'
                );
                if (toolCall) {
                  toolCall.error = chunk.error;
                  toolCall.status = 'error';
                  toolCall.errorAt = new Date().toISOString();
                }
              }
              break;

            case 'error':
              updatedMsg.content += `\n❌ **エラー**: ${chunk.content}\n`;
              break;
          }

          return updatedMsg;
        })
      };
    }));
  }, [currentPageId]);

  const handleNonStreamingResponse = useCallback(async (query, currentPage) => {
    const response = await fetch(`${API_BASE_URL}/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        streaming: false,
        tools: Array.from(currentPage.selectedTools),
        ...currentPage.settings
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

    setPages(prev => prev.map(page =>
      page.id === currentPageId
        ? { ...page, messages: [...page.messages, assistantMessage] }
        : page
    ));
  }, [currentPageId]);

  // コンポーネント
  const IconBar = React.memo(() => (
    <div className="w-16 bg-gradient-to-b from-gray-900 to-gray-800 flex flex-col items-center py-4 space-y-3 shadow-lg">
      {/* ページ作成ボタン */}
      <button
        onClick={createNewPage}
        className="w-12 h-12 bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl flex items-center justify-center hover:from-blue-700 hover:to-blue-600 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
        title="新しいページを作成"
      >
        <Plus size={22} className="text-white" />
      </button>

      {/* ページアイコン */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {pages.map((page) => (
          <PageIcon
            key={page.id}
            page={page}
            isActive={currentPageId === page.id}
            onSelect={setCurrentPageId}
            onDelete={deletePage}
            canDelete={canDeletePages}
          />
        ))}
      </div>

      {/* 設定ボタン */}
      <button
        onClick={() => setShowSettings(true)}
        className="w-12 h-12 bg-gray-700 rounded-xl flex items-center justify-center hover:bg-gray-600 transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-105"
        title="AI設定"
      >
        <Settings size={20} className="text-gray-300" />
      </button>
    </div>
  ));

  const ToolPalette = React.memo(({ page }) => {
    const handleSelectAll = useCallback(() => {
      setPages(prev => prev.map(p =>
        p.id === page.id
          ? { ...p, selectedTools: new Set(tools.map(t => t.name)) }
          : p
      ));
    }, [page.id, tools]);

    const handleDeselectAll = useCallback(() => {
      setPages(prev => prev.map(p =>
        p.id === page.id
          ? { ...p, selectedTools: new Set() }
          : p
      ));
    }, [page.id]);

    const handleToggleTool = useCallback((toolName) => {
      toggleToolInPage(page.id, toolName);
    }, [page.id, toggleToolInPage]);

    return (
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-purple-50">
          <h3 className="font-bold text-gray-800 mb-2 flex items-center">
            <Palette className="w-5 h-5 mr-2 text-blue-600" />
            ツールパレット
          </h3>
          <div className="text-sm text-gray-600 flex items-center justify-between">
            <span>選択中: {page?.selectedTools?.size || 0}/{tools.length}</span>
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full mr-1 ${serverStatus === 'connected' ? 'bg-green-500' :
                serverStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                }`}></div>
              <span className="text-xs">
                {serverStatus === 'connected' ? 'オンライン' :
                  serverStatus === 'error' ? 'オフライン' : '接続中'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 p-3 overflow-y-auto">
          <div className="grid grid-cols-1 gap-2">
            {tools.map((tool) => (
              <ToolButton
                key={tool.name}
                tool={tool}
                isSelected={page?.selectedTools?.has(tool.name) || false}
                onToggle={handleToggleTool}
                toolIcons={toolIcons}
              />
            ))}
          </div>

          {tools.length === 0 && (
            <div className="text-center text-gray-500 mt-8 p-6">
              <Wrench size={40} className="mx-auto mb-4 text-gray-300" />
              <p className="text-sm font-medium">ツールが見つかりません</p>
              <p className="text-xs mt-1">サーバーに接続を確認してください</p>
            </div>
          )}
        </div>

        {/* 一括操作ボタン */}
        <div className="p-3 border-t bg-gray-50">
          <div className="flex space-x-2">
            <button
              onClick={handleSelectAll}
              className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors duration-200"
            >
              すべて選択
            </button>
            <button
              onClick={handleDeselectAll}
              className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors duration-200"
            >
              すべて解除
            </button>
          </div>
        </div>
      </div>
    );
  });

  const ChatArea = React.memo(({ page }) => {
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = useCallback(async () => {
      if (!inputMessage.trim() || isLoading) return;

      setIsLoading(true);
      await handleSendMessage(inputMessage);
      setInputMessage('');
      setIsLoading(false);
    }, [inputMessage, isLoading, handleSendMessage]);

    const handleKeyPress = useCallback((e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    }, [handleSubmit]);

    const handleNameEdit = useCallback(() => {
      setEditingPageName(page.id);
    }, [page.id]);

    const handleNameSave = useCallback(() => {
      setEditingPageName(null);
    }, []);

    const handleNameChange = useCallback((e) => {
      updatePageName(page.id, e.target.value);
    }, [page.id, updatePageName]);

    const handleNameKeyPress = useCallback((e) => {
      if (e.key === 'Enter') {
        handleNameSave();
      }
    }, [handleNameSave]);

    return (
      <div className="flex-1 flex flex-col bg-gradient-to-br from-gray-50 to-white min-w-0">
        {/* ヘッダー */}
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-4">
            <span className="text-3xl">{getAnimalEmoji(page.name)}</span>
            {editingPageName === page.id ? (
              <input
                type="text"
                value={page.name}
                onChange={handleNameChange}
                onBlur={handleNameSave}
                onKeyPress={handleNameKeyPress}
                className="text-xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none px-1"
                autoFocus
              />
            ) : (
              <h1
                className="text-xl font-bold cursor-pointer hover:text-blue-600 transition-colors flex items-center"
                onClick={handleNameEdit}
              >
                {page.name}
                <Edit3 size={16} className="ml-2 text-gray-400" />
              </h1>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${serverStatus === 'connected' ? 'bg-green-500' :
                serverStatus === 'error' ? 'bg-red-500' :
                  'bg-yellow-500'
                }`} />
              <span className="text-sm text-gray-600">
                {page?.selectedTools?.size || 0} ツール選択中
              </span>
            </div>
            <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full flex items-center">
              <div className="w-2 h-2 bg-green-400 rounded-full mr-1"></div>
              {serverStatus === 'connected' ? 'オンライン' :
                serverStatus === 'error' ? 'オフライン' : '接続中'}
            </div>
            {agentConfig?.langChainEnabled && (
              <div className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full font-medium">
                LangChain Agent
              </div>
            )}
          </div>
        </div>

        {/* メッセージエリア */}
        <div className="flex-1 overflow-y-auto p-6">
          {page.messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-16">
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
                <Bot size={40} className="text-blue-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2">{page.name}との会話</h2>
              <p className="text-gray-400 mb-4">何でもお気軽にお聞かせください</p>
              <div className="inline-flex items-center space-x-2 bg-blue-50 px-4 py-2 rounded-full text-sm text-blue-600">
                <Zap size={16} />
                <span>{page?.selectedTools?.size || 0}個のツールが利用可能</span>
              </div>
              {agentConfig?.langChainEnabled && (
                <div className="inline-flex items-center space-x-2 bg-purple-50 px-4 py-2 rounded-full text-sm text-purple-600 ml-2">
                  <Brain size={16} />
                  <span>高度な推論モード有効</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 max-w-full">
              {page.messages.map(message => (
                <Message
                  key={message.id}
                  message={message}
                  agentConfig={agentConfig}
                  processMessageContent={processMessageContent}
                />
              ))}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 入力エリア */}
        <div className="bg-white border-t p-6 shadow-sm">
          <div className="flex space-x-4 max-w-full">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="メッセージを入力してください..."
              className="flex-1 p-4 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 min-w-0"
              disabled={isLoading || serverStatus !== 'connected'}
            />

            <button
              onClick={handleSubmit}
              disabled={!inputMessage.trim() || isLoading || serverStatus !== 'connected'}
              className="px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 disabled:transform-none"
            >
              {isLoading ? (
                <Loader size={20} className="animate-spin" />
              ) : (
                <Send size={20} />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  });

  const SettingsModal = React.memo(() => {
    const [tempConfig, setTempConfig] = useState({
      provider: agentConfig?.config?.provider || 'openai',
      model: agentConfig?.config?.model || 'gpt-4o-mini',
      temperature: agentConfig?.config?.temperature || 0.7,
      streaming: agentConfig?.config?.streaming !== false,
      openaiApiKey: '',
      azureEndpoint: '',
      azureApiVersion: '2024-02-15-preview',
      localLlmUrl: agentConfig?.config?.localLlmUrl || 'http://localhost:8000',
      localLlmModel: agentConfig?.config?.localLlmModel || 'Qwen/Qwen2.5-Coder-32B-Instruct'
    });

    const [activeTab, setActiveTab] = useState('general');
    const [envData, setEnvData] = useState(null);
    const [envContent, setEnvContent] = useState('');
    const [isLoadingEnv, setIsLoadingEnv] = useState(false);
    const [envStatus, setEnvStatus] = useState('');

    // 設定モーダルが開かれたときに現在の設定を読み込む（最適化）
    useEffect(() => {
      if (showSettings) {
        loadCurrentSettings();
      }
    }, [showSettings]);

    const loadCurrentSettings = useCallback(async () => {
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
    }, [agentConfig]);

    const fetchEnvData = useCallback(async () => {
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
    }, []);

    const updateEnvFile = useCallback(async () => {
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
    }, [envContent, fetchEnvData]);

    const reloadEnv = useCallback(async () => {
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
              setServerStatus('connected');
            } catch (error) {
              setServerStatus('error');
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
    }, [fetchAgentConfig, fetchEnvData, checkServerHealth]);

    const handleTabChange = useCallback(async (newTab) => {
      setActiveTab(newTab);
      if (newTab === 'env' && !envData) {
        await fetchEnvData();
      }
    }, [envData, fetchEnvData]);

    const generateEnvContent = useCallback(() => {
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
    }, [tempConfig]);

    const saveConfigToEnv = useCallback(async () => {
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
            setServerStatus('connected');
            setEnvStatus('✅ 設定を保存し、適用しました');
          } catch (error) {
            setServerStatus('error');
            setEnvStatus('⚠️ 設定は保存されましたが、サーバーとの接続に問題があります');
          }
        }, 1000);

      } catch (error) {
        console.error('設定保存エラー:', error);
        setEnvStatus(`❌ エラー: ${error.message}`);
        throw error;
      }
    }, [tempConfig, fetchAgentConfig, checkServerHealth]);

    const handleSave = useCallback(async () => {
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
    }, [activeTab, updateEnvFile, saveConfigToEnv]);

    const copyEnvToClipboard = useCallback(() => {
      navigator.clipboard.writeText(generateEnvContent());
      setEnvStatus('✅ .env設定をクリップボードにコピーしました');
    }, [generateEnvContent]);

    const applyGeneratedEnv = useCallback(() => {
      setEnvContent(generateEnvContent());
      setEnvStatus('📝 生成された設定をエディタに適用しました');
    }, [generateEnvContent]);

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
              onClick={() => setShowSettings(false)}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* タブ */}
          <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => handleTabChange('general')}
              className={`flex-1 py-2 px-4 rounded-md transition-colors font-medium ${activeTab === 'general'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
                }`}
            >
              <Settings className="w-4 h-4 inline mr-2" />
              一般設定
            </button>
            <button
              onClick={() => handleTabChange('endpoints')}
              className={`flex-1 py-2 px-4 rounded-md transition-colors font-medium ${activeTab === 'endpoints'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
                }`}
            >
              <Server className="w-4 h-4 inline mr-2" />
              エンドポイント
            </button>
            <button
              onClick={() => handleTabChange('env')}
              className={`flex-1 py-2 px-4 rounded-md transition-colors font-medium ${activeTab === 'env'
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
            <div className={`mb-4 p-3 rounded-lg text-sm ${envStatus.startsWith('✅') ? 'bg-green-50 text-green-700' :
              envStatus.startsWith('❌') ? 'bg-red-50 text-red-700' :
                envStatus.startsWith('⚠️') ? 'bg-yellow-50 text-yellow-700' :
                  'bg-blue-50 text-blue-700'
              }`}>
              {envStatus}
            </div>
          )}

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
                    OpenAI APIキーを入力してください。<a href="https://platform.openai.com/account/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">こちら</a>から取得できます。
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
                    <p className="text-xs text-gray-500 mt-1">
                      Azure OpenAIリソースのAPIキーを入力してください。
                    </p>
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
                    <p className="text-xs text-gray-500 mt-1">
                      Azure OpenAIリソースのエンドポイントURLを入力してください。
                    </p>
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
                    <p className="text-xs text-gray-500 mt-1">
                      使用するAPIのバージョンを指定してください。
                    </p>
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
                    <p className="text-xs text-gray-500 mt-1">
                      VLLMサーバーまたはOpenAI互換APIのエンドポイントURLを入力してください。
                    </p>
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
                    <p className="text-xs text-gray-500 mt-1">
                      VLLMで起動したモデル名またはローカルAPIで使用するモデル名を入力してください。
                    </p>
                  </div>
                </>
              )}

              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  設定のテスト
                </h4>
                <p className="text-xs text-gray-500 mb-3">
                  「設定を保存」ボタンを押すと、設定が自動的に適用され、接続がテストされます。
                </p>
                <div className="text-xs text-gray-600">
                  <div className="flex items-center justify-between">
                    <span>現在のプロバイダー:</span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                      {agentConfig?.config?.provider || '未設定'}
                    </span>
                  </div>
                  {agentConfig?.langChainEnabled && (
                    <div className="flex items-center justify-between mt-1">
                      <span>LangChain Agent:</span>
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">
                        有効
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'env' && (
            <div className="space-y-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-semibold mb-1">高度な設定:</p>
                    <p className="text-xs">
                      通常は「一般設定」と「エンドポイント」タブで設定することをお勧めします。
                      このタブは.envファイルを直接編集したい上級者向けです。
                    </p>
                  </div>
                </div>
              </div>

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

                {envData && (
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
                    <div>
                      <span className="font-medium text-gray-600">Temperature:</span>
                      <span className="ml-2">{envData.currentConfig?.AI_TEMPERATURE || '未設定'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">ストリーミング:</span>
                      <span className="ml-2">{envData.currentConfig?.AI_STREAMING || '未設定'}</span>
                    </div>
                  </div>
                )}
              </div>

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
                <p className="text-xs text-gray-500 mt-2">
                  .envファイルの内容を直接編集できます。保存後、「設定を再読み込み」で反映されます。
                </p>
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

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-semibold mb-1">重要な注意事項:</p>
                    <ul className="text-xs space-y-1 list-disc list-inside">
                      <li>APIキーなどの機密情報は慎重に扱ってください</li>
                      <li>「設定を再読み込み」でプロセス再起動なしに設定を適用できます</li>
                      <li>プロバイダー変更時は適切なAPI設定も併せて更新してください</li>
                      <li>バックアップファイルが自動作成されます</li>
                      <li>簡単な設定変更は「エンドポイント」タブをご利用ください</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex space-x-3 mt-8">
            <button
              onClick={() => setShowSettings(false)}
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

  // ローディング状態
  if (!isInitialized) {
    return (
      <div className="flex h-screen bg-gray-50 items-center justify-center">
        <div className="text-center">
          <Loader size={48} className="mx-auto mb-4 text-blue-500 animate-spin" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">初期化中...</h2>
          <p className="text-gray-500">サーバーに接続しています</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 w-full">
      <IconBar />

      {currentPage ? (
        <>
          <ToolPalette page={currentPage} />
          <ChatArea page={currentPage} />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="w-32 h-32 mx-auto mb-6 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
              <Bot size={64} className="text-blue-500" />
            </div>
            <h2 className="text-2xl font-bold mb-4">ページがありません</h2>
            <p className="text-gray-400 mb-6">新しいページを作成して会話を始めましょう</p>
            <button
              onClick={createNewPage}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg transform hover:scale-105 font-medium"
            >
              新しいページを作成
            </button>
          </div>
        </div>
      )}

      <SettingsModal />
    </div>
  );
};

export default MultiPageAgentChat;