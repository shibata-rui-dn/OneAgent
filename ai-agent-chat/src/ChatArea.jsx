import React, { memo, useCallback, useRef } from 'react';
import { Edit3, Bot, Zap, Brain } from 'lucide-react';
import { useChatAreaIsolated, useChatHeaderIsolated } from './IsolatedContexts';
import { useAuth } from './oauth-components';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

// ChatHeaderを独立したコンポーネントとして分離（ツール選択の変更に反応）
const ChatHeader = memo(() => {
    const {
        currentPageId,
        currentPageName,
        editingPageName,
        serverStatus,
        agentConfig,
        selectedToolsSize,
        updatePageName,
        getAnimalEmoji,
        dispatch
    } = useChatHeaderIsolated();

    if (!currentPageId || !currentPageName) return null;

    return (
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-4">
                <span className="text-3xl">{getAnimalEmoji(currentPageName)}</span>
                {editingPageName === currentPageId ? (
                    <input
                        type="text"
                        value={currentPageName}
                        onChange={(e) => updatePageName(currentPageId, e.target.value)}
                        onBlur={() => dispatch({ type: 'SET_EDITING_PAGE_NAME', payload: null })}
                        onKeyPress={(e) => e.key === 'Enter' && dispatch({ type: 'SET_EDITING_PAGE_NAME', payload: null })}
                        className="text-xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none px-1"
                        autoFocus
                    />
                ) : (
                    <h1
                        className="text-xl font-bold cursor-pointer hover:text-blue-600 transition-colors flex items-center"
                        onClick={() => dispatch({ type: 'SET_EDITING_PAGE_NAME', payload: currentPageId })}
                    >
                        {currentPageName}
                        <Edit3 size={16} className="ml-2 text-gray-400" />
                    </h1>
                )}
            </div>

            <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${serverStatus === 'connected' ? 'bg-green-500' :
                            serverStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                        }`} />
                    <span className="text-sm text-gray-600">
                        {selectedToolsSize} ツール選択中
                    </span>
                </div>
                
                {/* ユーザー設定ステータス表示を追加 */}
                <div className="flex items-center space-x-2">
                    <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full flex items-center">
                        <div className="w-2 h-2 bg-green-400 rounded-full mr-1"></div>
                        {serverStatus === 'connected' ? 'オンライン' :
                            serverStatus === 'error' ? 'オフライン' : '接続中'}
                    </div>
                    
                    {/* AIプロバイダー情報 */}
                    {agentConfig && (
                        <div className={`text-xs px-2 py-1 rounded-full font-medium ${
                            agentConfig.userConfig?.hasCustomSettings 
                                ? 'bg-blue-100 text-blue-700' 
                                : 'bg-gray-100 text-gray-600'
                        }`}>
                            {agentConfig.provider?.toUpperCase()} {agentConfig.model}
                            {agentConfig.userConfig?.hasCustomSettings && ' (個人設定)'}
                        </div>
                    )}
                    
                    {agentConfig?.langChainEnabled && (
                        <div className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full font-medium">
                            LangChain Agent
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    return false; // 常に依存関係をチェック
});

const ChatArea = memo(() => {
    const {
        currentPage,
        serverStatus,
        agentConfig,
        updatePageLoading,
        addMessage,
        updateMessage,
        API_BASE_URL,
        hasMessages,
        selectedToolsSize,
        // ユーザー設定対応の新しいプロパティ
        effectiveConfig,
        makeUserConfiguredAPIRequest
    } = useChatAreaIsolated();

    const { authenticatedFetch } = useAuth();

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

        try {
            console.log('🚀 Streaming request starting with conversation history...');

            // ✅ 修正: 会話履歴の準備（新しいメッセージは含めない）
            const conversationHistory = page.messages.map(msg => ({
                role: msg.role,
                content: msg.content
                // timestampは除外
            }));

            // ユーザー設定を考慮したAPIリクエスト
            const requestBody = {
                query, // 新しいメッセージはqueryパラメータのみで送信
                messages: conversationHistory, // 過去のメッセージのみを履歴として送信
                streaming: true,
                tools: Array.from(page.selectedTools),
                ...page.settings
            };

            // ユーザー設定に基づく追加パラメータ
            if (effectiveConfig) {
                requestBody.userConfigApplied = true;
                requestBody.effectiveProvider = effectiveConfig.provider;
                requestBody.effectiveModel = effectiveConfig.model;
                console.log('📋 User config applied to request:', {
                    provider: effectiveConfig.provider,
                    model: effectiveConfig.model,
                    hasCustomSettings: effectiveConfig._meta?.hasUserOverrides,
                    conversationHistoryCount: conversationHistory.length, // ✅ 修正
                    newQuery: query.substring(0, 50) + (query.length > 50 ? '...' : '')
                });
            }

            // makeUserConfiguredAPIRequest を使用（利用可能な場合）
            const apiRequest = makeUserConfiguredAPIRequest || authenticatedFetch;
            
            const response = await apiRequest('/agent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
                signal: abortControllerRef.current.signal
            });


            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Streaming response error:', { status: response.status, errorText });
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const assistantMessage = {
                id: Date.now().toString(),
                role: 'assistant',
                content: '',
                timestamp: new Date(),
                streaming: true,
                toolCalls: [],
                reasoningSteps: [],
                userConfigApplied: !!effectiveConfig?._meta?.hasUserOverrides,
                conversationHistoryCount: conversationHistory.length // ✅ 追加
            };

            addMessage(page.id, assistantMessage);

            // レスポンスボディの確認
            if (!response.body) {
                throw new Error('レスポンスボディが存在しません');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            console.log('📖 Starting to read streaming data with conversation history...');

            try {
                let buffer = '';
                let chunkCount = 0;
                let hasData = false;

                while (true) {
                    const { done, value } = await reader.read();

                    if (done) {
                        //console.log(`✅ Streaming completed. Processed ${chunkCount} chunks with conversation history (${conversationHistory.length} past messages).`);
                        break;
                    }

                    chunkCount++;
                    if (chunkCount % 10 === 0) {
                        //console.log(`📦 Processed ${chunkCount} streaming chunks (conversation history: ${conversationHistory.length})`);
                    }

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6).trim();

                            if (data && data !== '{"type": "end"}') {
                                try {
                                    const chunk = JSON.parse(data);
                                    hasData = true;

                                    // ユーザー設定情報を含むチャンクをログ
                                    if (chunk.configInfo) {
                                        console.log(`📊 Config info in chunk:`, chunk.configInfo);
                                    }

                                    //console.log(`📦 Chunk ${chunkCount}:`, chunk.type || 'unknown', chunk.content?.substring(0, 50) || '');

                                    updateStreamingMessage(assistantMessage.id, chunk, page.id);
                                } catch (parseError) {
                                    console.warn('⚠️ JSON parse error for chunk:', { data, error: parseError.message });
                                }
                            } else if (data === '{"type": "end"}') {
                                console.log('🏁 End marker received');
                            }
                        }
                    }

                    // 安全装置：チャンクが多すぎる場合
                    if (chunkCount > 2000) {
                        console.warn('⚠️ Too many chunks received, terminating');
                        break;
                    }
                }

                // データが全く受信されなかった場合
                if (!hasData) {
                    console.warn('⚠️ No data received from streaming response');
                    updateMessage(page.id, assistantMessage.id, {
                        content: 'ストリーミングレスポンスからデータを受信できませんでした。',
                        streaming: false
                    });
                }

            } finally {
                reader.releaseLock();

                // ストリーミング完了
                updateMessage(page.id, assistantMessage.id, { streaming: false });
            }

        } catch (error) {
            console.error('❌ Streaming error with conversation history:', {
                message: error.message,
                name: error.name,
                conversationHistoryCount: page.messages.length,
                stack: error.stack
            });

            // エラーメッセージをユーザーに表示
            const errorMessage = {
                id: (Date.now() + 2).toString(),
                role: 'assistant',
                content: `ストリーミング処理でエラーが発生しました: ${error.message}`,
                timestamp: new Date()
            };

            addMessage(page.id, errorMessage);
        }
    }, [addMessage, updateMessage, effectiveConfig, makeUserConfiguredAPIRequest, authenticatedFetch]);

    const updateStreamingMessage = useCallback((messageId, chunk, pageId) => {
        try {
            let updates = {};

            if (!chunk || typeof chunk !== 'object') {
                console.warn('⚠️ Invalid chunk received:', chunk);
                return;
            }

            switch (chunk.type) {
                case 'text':
                    if (typeof chunk.content === 'string') {
                        updates.content = (currentContent) => {
                            const newContent = (currentContent || '') + chunk.content;
                            return newContent;
                        };
                    } else {
                        console.warn('⚠️ Text chunk without valid content:', chunk);
                    }
                    break;

                case 'tool_call_start':
                    if (chunk.tool_name) {
                        updates.toolCalls = (currentToolCalls = []) => {
                            const newToolCalls = [...currentToolCalls];

                            let existingToolCall = newToolCalls.find(tc =>
                                tc.name === chunk.tool_name && !tc.result && !tc.error
                            );

                            if (!existingToolCall) {
                                newToolCalls.push({
                                    name: chunk.tool_name,
                                    arguments: chunk.tool_args || '',
                                    status: 'executing',
                                    timestamp: new Date().toISOString()
                                });
                            }

                            return newToolCalls;
                        };
                    }
                    break;

                case 'tool_call_result':
                    if (chunk.tool_name) {
                        updates.toolCalls = (currentToolCalls = []) => {
                            return currentToolCalls.map(tc => {
                                if (tc.name === chunk.tool_name && tc.status === 'executing') {
                                    return {
                                        ...tc,
                                        result: chunk.result || 'No result',
                                        status: 'completed',
                                        completedAt: new Date().toISOString()
                                    };
                                }
                                return tc;
                            });
                        };
                    }
                    break;

                case 'tool_call_error':
                    if (chunk.tool_name) {
                        updates.toolCalls = (currentToolCalls = []) => {
                            return currentToolCalls.map(tc => {
                                if (tc.name === chunk.tool_name && tc.status === 'executing') {
                                    return {
                                        ...tc,
                                        error: chunk.error || 'Unknown error',
                                        status: 'error',
                                        errorAt: new Date().toISOString()
                                    };
                                }
                                return tc;
                            });
                        };
                    }
                    break;

                case 'error':
                    updates.content = (currentContent) =>
                        (currentContent || '') + `\n❌ **エラー**: ${chunk.content || 'Unknown error'}\n`;
                    break;

                // ユーザー設定情報を処理
                case 'config_info':
                    if (chunk.configInfo) {
                        updates.configInfo = chunk.configInfo;
                    }
                    break;

                // ✅ 追加: 初期化情報を処理
                case 'init':
                    console.log('🚀 Streaming initialized:', chunk.content);
                    if (chunk.configInfo) {
                        updates.configInfo = chunk.configInfo;
                    }
                    break;

                default:
                    console.log('🔍 Unknown chunk type:', chunk.type, chunk);
                    break;
            }

            if (Object.keys(updates).length > 0) {
                updateMessage(pageId, messageId, updates);
            }

        } catch (error) {
            console.error('❌ Error updating streaming message:', error);
        }
    }, [updateMessage]);

    const handleNonStreamingResponse = useCallback(async (query, page) => {
        // ✅ 修正: 会話履歴の準備（新しいメッセージは含めない）
        const conversationHistory = page.messages.map(msg => ({
            role: msg.role,
            content: msg.content
            // timestampは除外
        }));

        const requestBody = {
            query, // 新しいメッセージはqueryパラメータのみで送信
            messages: conversationHistory, // 過去のメッセージのみを履歴として送信
            streaming: false,
            tools: Array.from(page.selectedTools),
            ...page.settings
        };

        // ユーザー設定情報を追加
        if (effectiveConfig) {
            requestBody.userConfigApplied = true;
            requestBody.effectiveProvider = effectiveConfig.provider;
            requestBody.effectiveModel = effectiveConfig.model;
            console.log('📋 User config applied to non-streaming request:', {
                provider: effectiveConfig.provider,
                model: effectiveConfig.model,
                conversationHistoryCount: conversationHistory.length, // ✅ 修正
                newQuery: query.substring(0, 50) + (query.length > 50 ? '...' : '')
            });
        }

        // makeUserConfiguredAPIRequest を使用（利用可能な場合）
        const apiRequest = makeUserConfiguredAPIRequest || authenticatedFetch;
        
        const response = await apiRequest('/agent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
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
            toolCalls: result.tool_calls || [],
            configInfo: result.configInfo, // ユーザー設定情報を追加
            userConfigApplied: !!effectiveConfig?._meta?.hasUserOverrides,
            conversationHistoryCount: conversationHistory.length // ✅ 追加
        };

        addMessage(page.id, assistantMessage);
    }, [addMessage, effectiveConfig, makeUserConfiguredAPIRequest, authenticatedFetch]);

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
            {/* ヘッダー（ユーザー設定情報を表示） */}
            <ChatHeader />

            {/* 初期画面またはメッセージリスト */}
            {!hasMessages ? (
                // 初期画面（ユーザー設定情報を含む）
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center text-gray-500">
                        <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
                            <Bot size={40} className="text-blue-500" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">{currentPage.name}との会話</h2>
                        <p className="text-gray-400 mb-4">何でもお気軽にお聞かせください</p>

                        {/* ツール選択数を表示 */}
                        <div className="inline-flex items-center space-x-2 bg-blue-50 px-4 py-2 rounded-full text-sm text-blue-600">
                            <Zap size={16} />
                            <span>{selectedToolsSize}個のツールが利用可能</span>
                        </div>

                        {/* ユーザー設定情報を表示 */}
                        {effectiveConfig && (
                            <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full text-sm ml-2 ${
                                effectiveConfig._meta?.hasUserOverrides 
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'bg-gray-50 text-gray-600'
                            }`}>
                                <Brain size={16} />
                                <span>
                                    {effectiveConfig.provider?.toUpperCase()} {effectiveConfig.model}
                                    {effectiveConfig._meta?.hasUserOverrides ? ' (個人設定)' : ' (システム設定)'}
                                </span>
                            </div>
                        )}

                        {agentConfig?.langChainEnabled && (
                            <div className="inline-flex items-center space-x-2 bg-purple-50 px-4 py-2 rounded-full text-sm text-purple-600 ml-2">
                                <Brain className="w-4 h-4" />
                                <span>高度な推論モード有効</span>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                // メッセージリスト
                <MessageList />
            )}

            {/* 入力エリア */}
            <MessageInput onSendMessage={handleSendMessage} />
        </div>
    );
}, (prevProps, nextProps) => {
    return true;
});

ChatArea.displayName = 'ChatArea';
ChatHeader.displayName = 'ChatHeader';

export default ChatArea;