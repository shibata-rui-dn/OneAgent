import React, { memo, useCallback, useRef, useEffect } from 'react';
import { 
  User, Bot, Wrench, Brain, Zap, Eye, Target, Cpu, Cog 
} from 'lucide-react';
import { useApp } from './AppContext';

const MessageItem = memo(({ message, agentConfig }) => {
  const isUser = message.role === 'user';

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

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`}>
      <div className={`flex items-start max-w-5xl ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-md ${
          isUser ? 'bg-gradient-to-r from-blue-500 to-blue-600 ml-3' : 'bg-gradient-to-r from-gray-500 to-gray-600 mr-3'
        }`}>
          {isUser ? <User size={18} className="text-white" /> : <Bot size={18} className="text-white" />}
        </div>

        <div className={`rounded-2xl px-6 py-4 shadow-sm max-w-full ${
          isUser
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

MessageItem.displayName = 'MessageItem';

const MessageList = memo(() => {
  const { currentPage, agentConfig, getAnimalEmoji } = useApp();
  const messagesEndRef = useRef(null);

  // デバッグ用ログ（本番では削除）
  console.log('MessageList rendering', { 
    pageId: currentPage?.id, 
    messageCount: currentPage?.messages?.length,
    lastMessageId: currentPage?.messages?.[currentPage.messages.length - 1]?.id
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentPage?.messages?.length]); // メッセージ数のみに依存

  if (!currentPage) return null;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {currentPage.messages.length === 0 ? (
        <div className="text-center text-gray-500 mt-16">
          <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
            <Bot size={40} className="text-blue-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">{currentPage.name}との会話</h2>
          <p className="text-gray-400 mb-4">何でもお気軽にお聞かせください</p>
          <div className="inline-flex items-center space-x-2 bg-blue-50 px-4 py-2 rounded-full text-sm text-blue-600">
            <Zap size={16} />
            <span>{currentPage?.selectedTools?.size || 0}個のツールが利用可能</span>
          </div>
          {agentConfig?.langChainEnabled && (
            <div className="inline-flex items-center space-x-2 bg-purple-50 px-4 py-2 rounded-full text-sm text-purple-600 ml-2">
              <Brain className="w-4 h-4" />
              <span>高度な推論モード有効</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 max-w-full">
          {currentPage.messages.map(message => (
            <MessageItem 
              key={message.id} 
              message={message} 
              agentConfig={agentConfig}
            />
          ))}
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for MessageList
  const prevPage = prevProps?.currentPage;
  const nextPage = nextProps?.currentPage;
  
  if (!prevPage && !nextPage) return true;
  if (!prevPage || !nextPage) return false;
  
  // Only re-render if page ID changes or message count changes
  return prevPage.id === nextPage.id && 
         prevPage.messages?.length === nextPage.messages?.length;
});

MessageList.displayName = 'MessageList';

export default MessageList;