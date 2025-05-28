import React, { memo, useCallback, useRef } from 'react';
import { Edit3 } from 'lucide-react';
import { useApp } from './AppContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

const ChatArea = memo(() => {
  const { 
    currentPage, 
    serverStatus, 
    agentConfig,
    editingPageName,
    updatePageName,
    updatePageLoading,
    addMessage,
    updateMessage,
    getAnimalEmoji,
    API_BASE_URL,
    dispatch
  } = useApp();

  // デバッグ用ログ（本番では削除）
  // console.log('ChatArea rendering');

  const abortControllerRef = useRef(null);

  const handleSendMessage = useCallback(async (message) => {
    if (!currentPage || !message.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    };

    // メッセージを追加し、ローディング開始
    addMessage(currentPage.id, userMessage);
    updatePageLoading(currentPage.id, true);

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

      addMessage(currentPage.id, errorMessage);
    } finally {
      updatePageLoading(currentPage.id, false);
    }
  }, [currentPage, addMessage, updatePageLoading]);

  const handleStreamingResponse = useCallback(async (query, page) => {
    abortControllerRef.current = new AbortController();

    const response = await fetch(`${API_BASE_URL}/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        streaming: true,
        tools: Array.from(page.selectedTools),
        ...page.settings
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

    addMessage(page.id, assistantMessage);

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
                updateStreamingMessage(assistantMessage.id, chunk, page.id);
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
      updateMessage(page.id, assistantMessage.id, { streaming: false });
    }
  }, [API_BASE_URL, addMessage, updateMessage]);

  const updateStreamingMessage = useCallback((messageId, chunk, pageId) => {
    // デバッグログ（本番では削除）
    // console.log('Updating streaming message:', { messageId, chunk, pageId });
    
    let updates = {};

    switch (chunk.type) {
      case 'text':
        // 関数型更新を使用して確実に累積
        updates.content = (currentContent) => {
          const newContent = (currentContent || '') + chunk.content;
          // デバッグログ（本番では削除）
          // console.log('Content update:', { currentContent, chunkContent: chunk.content, newContent });
          return newContent;
        };
        break;

      case 'tool_call_start':
        updates.toolCalls = (currentToolCalls = []) => {
          const newToolCalls = [...currentToolCalls];
          
          // 既存のツール呼び出しを検索
          let existingToolCall = newToolCalls.find(tc =>
            tc.name === chunk.tool_name && !tc.result && !tc.error
          );

          if (!existingToolCall) {
            newToolCalls.push({
              name: chunk.tool_name,
              arguments: chunk.tool_args,
              status: 'executing',
              timestamp: new Date().toISOString()
            });
          }
          
          return newToolCalls;
        };
        break;

      case 'tool_call_result':
        updates.toolCalls = (currentToolCalls = []) => {
          return currentToolCalls.map(tc => {
            if (tc.name === chunk.tool_name && tc.status === 'executing') {
              return {
                ...tc,
                result: chunk.result,
                status: 'completed',
                completedAt: new Date().toISOString()
              };
            }
            return tc;
          });
        };
        break;

      case 'tool_call_error':
        updates.toolCalls = (currentToolCalls = []) => {
          return currentToolCalls.map(tc => {
            if (tc.name === chunk.tool_name && tc.status === 'executing') {
              return {
                ...tc,
                error: chunk.error,
                status: 'error',
                errorAt: new Date().toISOString()
              };
            }
            return tc;
          });
        };
        break;

      case 'error':
        updates.content = (currentContent) => 
          (currentContent || '') + `\n❌ **エラー**: ${chunk.content}\n`;
        break;
    }

    // updateMessage関数を使用
    updateMessage(pageId, messageId, updates);
  }, [updateMessage]);

  const handleNonStreamingResponse = useCallback(async (query, page) => {
    const response = await fetch(`${API_BASE_URL}/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        streaming: false,
        tools: Array.from(page.selectedTools),
        ...page.settings
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

    addMessage(page.id, assistantMessage);
  }, [API_BASE_URL, addMessage]);

  if (!currentPage) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="w-32 h-32 mx-auto mb-6 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
            <Bot size={64} className="text-blue-500" />
          </div>
          <h2 className="text-2xl font-bold mb-4">ページがありません</h2>
          <p className="text-gray-400 mb-6">新しいページを作成して会話を始めましょう</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-gray-50 to-white min-w-0">
      {/* ヘッダー */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-4">
          <span className="text-3xl">{getAnimalEmoji(currentPage.name)}</span>
          {editingPageName === currentPage.id ? (
            <input
              type="text"
              value={currentPage.name}
              onChange={(e) => updatePageName(currentPage.id, e.target.value)}
              onBlur={() => dispatch({ type: 'SET_EDITING_PAGE_NAME', payload: null })}
              onKeyPress={(e) => e.key === 'Enter' && dispatch({ type: 'SET_EDITING_PAGE_NAME', payload: null })}
              className="text-xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none px-1"
              autoFocus
            />
          ) : (
            <h1
              className="text-xl font-bold cursor-pointer hover:text-blue-600 transition-colors flex items-center"
              onClick={() => dispatch({ type: 'SET_EDITING_PAGE_NAME', payload: currentPage.id })}
            >
              {currentPage.name}
              <Edit3 size={16} className="ml-2 text-gray-400" />
            </h1>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              serverStatus === 'connected' ? 'bg-green-500' :
              serverStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
            }`} />
            <span className="text-sm text-gray-600">
              {currentPage?.selectedTools?.size || 0} ツール選択中
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

      {/* メッセージリスト */}
      <MessageList />

      {/* 入力エリア */}
      <MessageInput onSendMessage={handleSendMessage} />
    </div>
  );
});

ChatArea.displayName = 'ChatArea';

export default ChatArea;