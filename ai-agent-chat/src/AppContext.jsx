import React, { createContext, useContext, useReducer, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAuth } from './oauth-components'; // 認証フック追加
import { useUserConfig } from './useUserConfig';

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

// State management（ユーザー設定統合完全版）
const initialState = {
    pages: [],
    currentPageId: null,
    tools: [],
    toolIcons: new Map(),
    serverStatus: 'connecting',
    agentConfig: null,
    editingPageName: null,
    isInitialized: false,
    // ユーザー設定関連を強化
    userConfigEnabled: false,
    effectiveConfig: null,
    configInitialized: false,
    aiConfigStatus: 'loading', // loading, ready, error
    lastConfigUpdate: null
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

        // ユーザー設定関連のアクションを強化
        case 'SET_USER_CONFIG_ENABLED':
            return { ...state, userConfigEnabled: action.payload };

        case 'SET_EFFECTIVE_CONFIG':
            return { 
                ...state, 
                effectiveConfig: action.payload,
                lastConfigUpdate: new Date().toISOString()
            };

        case 'SET_CONFIG_INITIALIZED':
            return { ...state, configInitialized: action.payload };

        case 'SET_AI_CONFIG_STATUS':
            return { ...state, aiConfigStatus: action.payload };

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
                        streaming: state.effectiveConfig?.streaming !== undefined 
                            ? state.effectiveConfig.streaming 
                            : true,
                        temperature: state.effectiveConfig?.temperature !== undefined 
                            ? state.effectiveConfig.temperature 
                            : 0.7,
                        model: state.effectiveConfig?.model || 'gpt-4o-mini'
                    }
                };
                return {
                    ...state,
                    pages: [initialPage],
                    currentPageId: initialPage.id
                };
            }
            return state;

        case 'UPDATE_PAGE_SETTINGS_FROM_CONFIG':
            // ユーザー設定の変更を既存ページに反映
            if (!state.effectiveConfig) return state;
            
            const configUpdatedPages = (state.pages || []).map(page => ({
                ...page,
                settings: {
                    ...page.settings,
                    streaming: state.effectiveConfig.streaming !== undefined 
                        ? state.effectiveConfig.streaming 
                        : page.settings.streaming,
                    temperature: state.effectiveConfig.temperature !== undefined 
                        ? state.effectiveConfig.temperature 
                        : page.settings.temperature,
                    model: state.effectiveConfig.model || page.settings.model
                }
            }));

            return {
                ...state,
                pages: configUpdatedPages
            };

        case 'ADD_MESSAGE':
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

            const updatedMessages = [...targetPageMsg.messages];
            updatedMessages[targetMessageIndex] = updatedMessage;

            const updatedPageMsg = { ...targetPageMsg, messages: updatedMessages };

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
    
    // 認証フックを追加
    const { authenticatedFetch, user } = useAuth();

    // ユーザー設定フックを統合（完全版）
    const {
        userConfig,
        effectiveConfig,
        configInfo,
        isLoading: configLoading,
        loadUserConfig,
        updateUserConfig,
        resetUserConfig,
        refreshConfigs,
        validateConfig,
        hasCustomConfig
    } = useUserConfig();

    // 設定初期化状態の管理
    const configInitializedRef = useRef(false);
    const lastConfigHashRef = useRef('');

    // ユーザー設定の変更を監視してstateに反映（強化版）
    useEffect(() => {
        if (effectiveConfig && user) {
            const configHash = JSON.stringify({
                provider: effectiveConfig.provider,
                model: effectiveConfig.model,
                temperature: effectiveConfig.temperature,
                streaming: effectiveConfig.streaming,
                hasCustomConfig: configInfo.hasUserOverrides
            });

            // 設定が実際に変更された場合のみ更新
            if (lastConfigHashRef.current !== configHash) {
                console.log('🔄 User config updated and applied:', {
                    provider: effectiveConfig.provider,
                    model: effectiveConfig.model,
                    hasCustomSettings: configInfo.hasUserOverrides,
                    userOverrideKeys: configInfo.userOverrideKeys,
                    previousHash: lastConfigHashRef.current.substring(0, 20),
                    newHash: configHash.substring(0, 20)
                });

                dispatch({ type: 'SET_EFFECTIVE_CONFIG', payload: effectiveConfig });
                dispatch({ type: 'SET_USER_CONFIG_ENABLED', payload: configInfo.hasUserOverrides });
                dispatch({ type: 'SET_AI_CONFIG_STATUS', payload: 'ready' });
                
                // 既存ページの設定も更新
                if (configInitializedRef.current) {
                    dispatch({ type: 'UPDATE_PAGE_SETTINGS_FROM_CONFIG' });
                }

                configInitializedRef.current = true;
                lastConfigHashRef.current = configHash;

                // エージェント設定も更新
                if (configInitializedRef.current) {
                    fetchAgentConfig();
                }
            }

            if (!state.configInitialized) {
                dispatch({ type: 'SET_CONFIG_INITIALIZED', payload: true });
            }
        }
    }, [effectiveConfig, configInfo, user]);

    // 設定読み込みエラーの監視
    useEffect(() => {
        if (configLoading) {
            dispatch({ type: 'SET_AI_CONFIG_STATUS', payload: 'loading' });
        } else if (!effectiveConfig && !configLoading) {
            dispatch({ type: 'SET_AI_CONFIG_STATUS', payload: 'error' });
        }
    }, [configLoading, effectiveConfig]);

    // API functions - ユーザー設定対応強化版
    const checkServerHealth = useCallback(async () => {
        const response = await authenticatedFetch('/health');
        if (!response.ok) {
            throw new Error('サーバーに接続できません');
        }
        return response.json();
    }, [authenticatedFetch]);

    const fetchTools = useCallback(async () => {
        try {
            const response = await authenticatedFetch('/tools');
            const data = await response.json();
            dispatch({ type: 'SET_TOOLS', payload: data.tools || [] });
            await loadToolIcons(data.tools || []);
        } catch (error) {
            console.error('ツール取得エラー:', error);
        }
    }, [authenticatedFetch]);

    const loadToolIcons = useCallback(async (toolsList) => {
        const iconPromises = toolsList
            .filter(tool => tool.hasIcon)
            .map(async (tool) => {
                try {
                    const response = await authenticatedFetch(`/tools/${tool.name}/icon`);
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
    }, [authenticatedFetch]);

    const fetchAgentConfig = useCallback(async () => {
        try {
            console.log('🤖 Fetching agent config with user settings...');
            const response = await authenticatedFetch('/agent/config');
            const data = await response.json();
            
            console.log('📊 Agent config received:', {
                provider: data.provider,
                model: data.model,
                hasCustomSettings: data.userConfig?.hasCustomSettings,
                configSource: data.userConfig?.configSource
            });
            
            dispatch({ type: 'SET_AGENT_CONFIG', payload: data });
        } catch (error) {
            console.error('エージェント設定取得エラー:', error);
            dispatch({ type: 'SET_AI_CONFIG_STATUS', payload: 'error' });
        }
    }, [authenticatedFetch]);

    // Page management（ユーザー設定対応）
    const createNewPage = useCallback(() => {
        const newPage = {
            id: Date.now().toString(),
            name: generateRandomAnimalName(),
            messages: [],
            selectedTools: new Set(),
            isLoading: false,
            settings: {
                streaming: state.effectiveConfig?.streaming !== undefined 
                    ? state.effectiveConfig.streaming 
                    : true,
                temperature: state.effectiveConfig?.temperature !== undefined 
                    ? state.effectiveConfig.temperature 
                    : 0.7,
                model: state.effectiveConfig?.model || 'gpt-4o-mini'
            }
        };

        dispatch({ type: 'ADD_PAGE', payload: newPage });
        dispatch({ type: 'SET_CURRENT_PAGE', payload: newPage.id });
    }, [state.effectiveConfig]);

    const deletePage = useCallback((pageId) => {
        dispatch({ type: 'DELETE_PAGE', payload: pageId });
    }, []);

    const updatePageName = useCallback((pageId, newName) => {
        dispatch({
            type: 'UPDATE_PAGE',
            payload: { id: pageId, updates: { name: newName } }
        });
    }, []);

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

    // ユーザー設定管理関数（強化版）
    const handleConfigUpdate = useCallback(async (configUpdates) => {
        try {
            console.log('🔄 Updating user config from App (ENHANCED):', configUpdates);
            dispatch({ type: 'SET_AI_CONFIG_STATUS', payload: 'loading' });
            
            // 設定の妥当性を事前チェック
            const validation = validateConfig(configUpdates);
            if (!validation.valid) {
                throw new Error(`設定が無効です: ${validation.errors.join(', ')}`);
            }

            const result = await updateUserConfig(configUpdates);
            
            // 成功時にエージェント設定も再読み込み
            await Promise.all([
                fetchAgentConfig(),
                checkServerHealth()
            ]);
            
            dispatch({ type: 'SET_AI_CONFIG_STATUS', payload: 'ready' });
            console.log('✅ Config update completed successfully');
            
            return result;
        } catch (error) {
            console.error('❌ Config update failed:', error);
            dispatch({ type: 'SET_AI_CONFIG_STATUS', payload: 'error' });
            throw error;
        }
    }, [updateUserConfig, fetchAgentConfig, checkServerHealth, validateConfig]);

    const handleConfigReset = useCallback(async () => {
        try {
            console.log('🔄 Resetting user config from App (ENHANCED)');
            dispatch({ type: 'SET_AI_CONFIG_STATUS', payload: 'loading' });
            
            const result = await resetUserConfig();
            
            // 成功時にエージェント設定も再読み込み
            await Promise.all([
                fetchAgentConfig(),
                checkServerHealth()
            ]);
            
            dispatch({ type: 'SET_AI_CONFIG_STATUS', payload: 'ready' });
            console.log('✅ Config reset completed successfully');
            
            return result;
        } catch (error) {
            console.error('❌ Config reset failed:', error);
            dispatch({ type: 'SET_AI_CONFIG_STATUS', payload: 'error' });
            throw error;
        }
    }, [resetUserConfig, fetchAgentConfig, checkServerHealth]);

    // ユーザー固有のAPIリクエスト関数（新機能）
    const makeUserConfiguredAPIRequest = useCallback(async (endpoint, options = {}) => {
        if (!user) {
            throw new Error('ユーザー認証が必要です');
        }

        // ユーザー設定が読み込まれるまで待機
        if (!state.configInitialized && configLoading) {
            console.log('⏳ Waiting for user config to load...');
            return new Promise((resolve, reject) => {
                const checkInterval = setInterval(() => {
                    if (state.configInitialized || !configLoading) {
                        clearInterval(checkInterval);
                        resolve(authenticatedFetch(endpoint, options));
                    }
                }, 100);
                
                // 5秒でタイムアウト
                setTimeout(() => {
                    clearInterval(checkInterval);
                    reject(new Error('ユーザー設定の読み込みがタイムアウトしました'));
                }, 5000);
            });
        }

        return authenticatedFetch(endpoint, options);
    }, [user, state.configInitialized, configLoading, authenticatedFetch]);

    // Initialize app - ユーザー設定対応強化版
    const initializeApp = useCallback(async () => {
        try {
            console.log('🚀 Initializing app with enhanced user config support...');
            
            // サーバーの基本チェック
            await checkServerHealth();
            dispatch({ type: 'SET_SERVER_STATUS', payload: 'connected' });
            
            // ツールの読み込み
            await fetchTools();
            
            // ユーザー設定の読み込み（認証後）
            if (user) {
                console.log('👤 Loading user-specific config...');
                dispatch({ type: 'SET_AI_CONFIG_STATUS', payload: 'loading' });
                
                try {
                    await loadUserConfig();
                    // エージェント設定の読み込み（ユーザー設定を含む）
                    await fetchAgentConfig();
                    dispatch({ type: 'SET_AI_CONFIG_STATUS', payload: 'ready' });
                } catch (configError) {
                    console.error('❌ Failed to load user config:', configError);
                    dispatch({ type: 'SET_AI_CONFIG_STATUS', payload: 'error' });
                    // 設定読み込みに失敗してもアプリは継続
                }
            } else {
                console.log('🔄 User not authenticated, using default config...');
                await fetchAgentConfig();
            }

            dispatch({ type: 'INITIALIZE_PAGES' });
            dispatch({ type: 'SET_INITIALIZED', payload: true });

            console.log('✅ App initialization completed with user config support');

        } catch (error) {
            console.error('❌ アプリ初期化エラー:', error);
            dispatch({ type: 'SET_SERVER_STATUS', payload: 'error' });
            dispatch({ type: 'SET_AI_CONFIG_STATUS', payload: 'error' });
            dispatch({ type: 'INITIALIZE_PAGES' });
            dispatch({ type: 'SET_INITIALIZED', payload: true });
        }
    }, [checkServerHealth, fetchTools, fetchAgentConfig, loadUserConfig, user]);

    // ユーザー変更時の設定リロード
    useEffect(() => {
        if (user && state.isInitialized) {
            console.log('👤 User changed, reloading config...');
            loadUserConfig().catch(error => {
                console.error('Failed to reload user config:', error);
            });
        }
    }, [user?.id, state.isInitialized, loadUserConfig]);

    // Memoized values（ユーザー設定対応強化版）
    const currentPage = useMemo(() => {
        const page = (state.pages || []).find(p => p.id === state.currentPageId);

        if (page && currentPageRef.current?.id === page.id) {
            const prev = currentPageRef.current;

            if (prev.name === page.name &&
                prev.messages?.length === page.messages?.length &&
                prev.isLoading === page.isLoading &&
                JSON.stringify(prev.settings) === JSON.stringify(page.settings)) {

                const updatedPage = {
                    ...prev,
                    messages: page.messages,
                    isLoading: page.isLoading,
                    selectedTools: page.selectedTools
                };

                currentPageRef.current = updatedPage;
                return updatedPage;
            }
        }

        currentPageRef.current = page;
        return page;
    }, [state.pages, state.currentPageId]);

    // Stable callback references（ユーザー設定対応強化版）
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
        getAnimalEmoji,
        // ユーザー設定関連の関数
        handleConfigUpdate,
        handleConfigReset,
        refreshConfigs,
        makeUserConfiguredAPIRequest, // 新機能
        // ユーザー設定フックの機能を直接公開
        loadUserConfig,
        updateUserConfig,
        resetUserConfig,
        validateConfig
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
        fetchAgentConfig,
        handleConfigUpdate,
        handleConfigReset,
        refreshConfigs,
        makeUserConfiguredAPIRequest,
        loadUserConfig,
        updateUserConfig,
        resetUserConfig,
        validateConfig
    ]);

    const contextValue = useMemo(() => ({
        // State
        pages: state.pages,
        currentPageId: state.currentPageId,
        tools: state.tools,
        toolIcons: state.toolIcons,
        serverStatus: state.serverStatus,
        agentConfig: state.agentConfig,
        editingPageName: state.editingPageName,
        isInitialized: state.isInitialized,
        currentPage,

        // ユーザー設定関連のStateを強化
        userConfigEnabled: state.userConfigEnabled,
        effectiveConfig: state.effectiveConfig,
        configInitialized: state.configInitialized,
        aiConfigStatus: state.aiConfigStatus,
        lastConfigUpdate: state.lastConfigUpdate,
        
        // ユーザー設定フックの情報
        userConfig,
        configInfo,
        configLoading,
        hasCustomConfig,

        // 認証情報
        user,
        authenticatedFetch,

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
        state.userConfigEnabled,
        state.effectiveConfig,
        state.configInitialized,
        state.aiConfigStatus,
        state.lastConfigUpdate,
        currentPage,
        userConfig,
        configInfo,
        configLoading,
        hasCustomConfig,
        user,
        authenticatedFetch,
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