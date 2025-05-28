import React, { createContext, useContext, useReducer, useCallback, useMemo, useRef } from 'react';

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

// State management（showSettingsを削除）
const initialState = {
    pages: [],
    currentPageId: null,
    tools: [],
    toolIcons: new Map(),
    serverStatus: 'connecting',
    agentConfig: null,
    editingPageName: null,
    isInitialized: false
    // showSettingsを削除
};

const appReducer = (state, action) => {
    switch (action.type) {
        case 'SET_PAGES':
            return { ...state, pages: Array.isArray(action.payload) ? action.payload : [] };

        case 'ADD_PAGE':
            const newPage = action.payload;
            // 新しいページにツールを自動設定
            if (newPage.selectedTools.size === 0 && (state.tools || []).length > 0) {
                newPage.selectedTools = new Set((state.tools || []).map(t => t.name));
            }
            return { ...state, pages: [...(state.pages || []), newPage] };

        case 'DELETE_PAGE':
            const pages = state.pages || [];
            if (pages.length <= 1) return state; // 最後のページは削除しない

            const remainingPages = pages.filter(p => p.id !== action.payload);
            const newCurrentPageId = state.currentPageId === action.payload
                ? remainingPages[0]?.id || null
                : state.currentPageId;
            return {
                ...state,
                pages: remainingPages,
                currentPageId: newCurrentPageId
            };

        case 'UPDATE_PAGE':
            console.log('UPDATE_PAGE action:', action.payload);

            // ページ更新の最適化：特定のページのみを更新
            const targetPageIndex = (state.pages || []).findIndex(p => p.id === action.payload.id);
            if (targetPageIndex === -1) return state;

            const updatedPages = [...state.pages];
            updatedPages[targetPageIndex] = {
                ...updatedPages[targetPageIndex],
                ...action.payload.updates
            };

            return {
                ...state,
                pages: updatedPages
            };

        case 'TOGGLE_TOOL_IN_PAGE':
            console.log('TOGGLE_TOOL_IN_PAGE action:', action.payload);

            // ツール選択の最適化：対象ページのみを更新
            const toolPageIndex = (state.pages || []).findIndex(p => p.id === action.payload.pageId);
            if (toolPageIndex === -1) return state;

            const toolUpdatedPages = [...state.pages];
            const targetPage = toolUpdatedPages[toolPageIndex];
            const newSelectedTools = new Set(targetPage.selectedTools);
            const wasSelected = newSelectedTools.has(action.payload.toolName);

            if (wasSelected) {
                newSelectedTools.delete(action.payload.toolName);
            } else {
                newSelectedTools.add(action.payload.toolName);
            }

            console.log('Tool toggle result:', {
                pageId: targetPage.id,
                toolName: action.payload.toolName,
                wasSelected,
                nowSelected: !wasSelected,
                newSize: newSelectedTools.size
            });

            toolUpdatedPages[toolPageIndex] = {
                ...targetPage,
                selectedTools: newSelectedTools
            };

            return {
                ...state,
                pages: toolUpdatedPages
            };

        case 'SET_CURRENT_PAGE':
            return { ...state, currentPageId: action.payload };

        case 'SET_TOOLS':
            return { ...state, tools: Array.isArray(action.payload) ? action.payload : [] };

        case 'SET_TOOL_ICONS':
            return { ...state, toolIcons: action.payload instanceof Map ? action.payload : new Map() };

        case 'SET_SERVER_STATUS':
            return { ...state, serverStatus: action.payload };

        case 'SET_AGENT_CONFIG':
            return { ...state, agentConfig: action.payload };

        case 'SET_EDITING_PAGE_NAME':
            return { ...state, editingPageName: action.payload };

        case 'SET_INITIALIZED':
            return { ...state, isInitialized: action.payload };

        // SET_SHOW_SETTINGSケースを削除

        case 'INITIALIZE_PAGES':
            // 初期ページがない場合のみ作成
            if ((state.pages || []).length === 0) {
                const initialPage = {
                    id: Date.now().toString(),
                    name: generateRandomAnimalName(),
                    messages: [],
                    selectedTools: (state.tools || []).length > 0
                        ? new Set((state.tools || []).map(t => t.name))
                        : new Set(),
                    isLoading: false,
                    settings: {
                        streaming: true,
                        temperature: 0.7,
                        model: 'gpt-4o-mini'
                    }
                };
                return {
                    ...state,
                    pages: [initialPage],
                    currentPageId: initialPage.id
                };
            }
            return state;

        case 'ADD_MESSAGE':
            // メッセージ追加の最適化：対象ページのみを更新
            const messagePageIndex = (state.pages || []).findIndex(p => p.id === action.payload.pageId);
            if (messagePageIndex === -1) return state;

            const messageUpdatedPages = [...state.pages];
            messageUpdatedPages[messagePageIndex] = {
                ...messageUpdatedPages[messagePageIndex],
                messages: [...(messageUpdatedPages[messagePageIndex].messages || []), action.payload.message]
            };

            return {
                ...state,
                pages: messageUpdatedPages
            };

        case 'UPDATE_MESSAGE':
            // ストリーミング最適化: 対象ページのみを更新
            const targetPageIndexMsg = (state.pages || []).findIndex(p => p.id === action.payload.pageId);
            if (targetPageIndexMsg === -1) return state;

            const targetPageMsg = state.pages[targetPageIndexMsg];
            const targetMessageIndex = (targetPageMsg.messages || []).findIndex(m => m.id === action.payload.messageId);
            if (targetMessageIndex === -1) return state;

            const targetMessage = targetPageMsg.messages[targetMessageIndex];
            const updates = { ...action.payload.updates };

            // Handle function updates for streaming content
            Object.keys(updates).forEach(key => {
                if (typeof updates[key] === 'function') {
                    updates[key] = updates[key](targetMessage[key]);
                }
            });

            const updatedMessage = { ...targetMessage, ...updates };

            // 最小限の更新: メッセージ配列のみ更新
            const updatedMessages = [...targetPageMsg.messages];
            updatedMessages[targetMessageIndex] = updatedMessage;

            const updatedPageMsg = { ...targetPageMsg, messages: updatedMessages };

            // ページ配列の最小限更新
            const updatedPagesMsg = [...state.pages];
            updatedPagesMsg[targetPageIndexMsg] = updatedPageMsg;

            return {
                ...state,
                pages: updatedPagesMsg
            };

        default:
            return state;
    }
};

const AppContext = createContext();

export const AppProvider = ({ children }) => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const currentPageRef = useRef(null);

    // API functions - 依存関係を最小化
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
            dispatch({ type: 'SET_TOOLS', payload: data.tools || [] });
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

        dispatch({ type: 'SET_TOOL_ICONS', payload: iconMap });
    }, []);

    const fetchAgentConfig = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/agent/config`);
            const data = await response.json();
            dispatch({ type: 'SET_AGENT_CONFIG', payload: data });
        } catch (error) {
            console.error('エージェント設定取得エラー:', error);
        }
    }, []);

    // Page management - 依存関係を最小化
    const createNewPage = useCallback(() => {
        const newPage = {
            id: Date.now().toString(),
            name: generateRandomAnimalName(),
            messages: [],
            selectedTools: new Set(),
            isLoading: false,
            settings: {
                streaming: true,
                temperature: 0.7,
                model: 'gpt-4o-mini'
            }
        };

        dispatch({ type: 'ADD_PAGE', payload: newPage });
        dispatch({ type: 'SET_CURRENT_PAGE', payload: newPage.id });
    }, []);

    const deletePage = useCallback((pageId) => {
        dispatch({ type: 'DELETE_PAGE', payload: pageId });
    }, []);

    const updatePageName = useCallback((pageId, newName) => {
        dispatch({
            type: 'UPDATE_PAGE',
            payload: { id: pageId, updates: { name: newName } }
        });
    }, []);

    // ツール選択の最適化：安定した参照を持つコールバック
    const toggleToolInPage = useCallback((pageId, toolName) => {
        dispatch({
            type: 'TOGGLE_TOOL_IN_PAGE',
            payload: { pageId, toolName }
        });
    }, []);

    const updatePageLoading = useCallback((pageId, isLoading) => {
        dispatch({
            type: 'UPDATE_PAGE',
            payload: { id: pageId, updates: { isLoading } }
        });
    }, []);

    const addMessage = useCallback((pageId, message) => {
        dispatch({
            type: 'ADD_MESSAGE',
            payload: { pageId, message }
        });
    }, []);

    const updateMessage = useCallback((pageId, messageId, updates) => {
        dispatch({
            type: 'UPDATE_MESSAGE',
            payload: { pageId, messageId, updates }
        });
    }, []);

    // Initialize app
    const initializeApp = useCallback(async () => {
        try {
            await checkServerHealth();
            await fetchTools();
            await fetchAgentConfig();

            dispatch({ type: 'SET_SERVER_STATUS', payload: 'connected' });
            dispatch({ type: 'INITIALIZE_PAGES' });
            dispatch({ type: 'SET_INITIALIZED', payload: true });

        } catch (error) {
            console.error('アプリ初期化エラー:', error);
            dispatch({ type: 'SET_SERVER_STATUS', payload: 'error' });
            dispatch({ type: 'INITIALIZE_PAGES' });
            dispatch({ type: 'SET_INITIALIZED', payload: true });
        }
    }, [checkServerHealth, fetchTools, fetchAgentConfig]);

    // Memoized values
    const currentPage = useMemo(() => {
        const page = (state.pages || []).find(p => p.id === state.currentPageId);

        // 以前のcurrentPageと比較して、重要な変更がない場合は同じ参照を返す
        if (page && currentPageRef.current?.id === page.id) {
            const prev = currentPageRef.current;

            // メッセージ、ローディング状態、基本設定の変更のみで再作成
            if (prev.name === page.name &&
                prev.messages?.length === page.messages?.length &&
                prev.isLoading === page.isLoading &&
                JSON.stringify(prev.settings) === JSON.stringify(page.settings)) {

                // selectedToolsの参照は維持しつつ、他の重要な変更のみ適用
                const updatedPage = {
                    ...prev,
                    messages: page.messages, // メッセージは最新の参照を使用
                    isLoading: page.isLoading,
                    selectedTools: page.selectedTools // 新しい参照で更新（ツール選択用）
                };

                currentPageRef.current = updatedPage;
                return updatedPage;
            }
        }

        // 新しいページまたは重要な変更がある場合のみ新しい参照を作成
        currentPageRef.current = page;
        return page;
    }, [state.pages, state.currentPageId]);

    // Stable callback references
    const stableCallbacks = useMemo(() => ({
        dispatch,
        initializeApp,
        createNewPage,
        deletePage,
        updatePageName,
        toggleToolInPage,
        updatePageLoading,
        addMessage,
        updateMessage,
        checkServerHealth,
        fetchTools,
        fetchAgentConfig,
        generateRandomAnimalName,
        getAnimalEmoji
    }), [
        initializeApp,
        createNewPage,
        deletePage,
        updatePageName,
        toggleToolInPage,
        updatePageLoading,
        addMessage,
        updateMessage,
        checkServerHealth,
        fetchTools,
        fetchAgentConfig
    ]);

    const contextValue = useMemo(() => ({
        // State（showSettingsを削除）
        pages: state.pages,
        currentPageId: state.currentPageId,
        tools: state.tools,
        toolIcons: state.toolIcons,
        serverStatus: state.serverStatus,
        agentConfig: state.agentConfig,
        editingPageName: state.editingPageName,
        isInitialized: state.isInitialized,
        currentPage,

        // Stable callbacks
        ...stableCallbacks,

        // Constants
        API_BASE_URL: API_BASE_URL
    }), [
        state.pages,
        state.currentPageId,
        state.tools,
        state.toolIcons,
        state.serverStatus,
        state.agentConfig,
        state.editingPageName,
        state.isInitialized,
        currentPage,
        stableCallbacks
    ]);

    return (
        <AppContext.Provider value={contextValue}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};