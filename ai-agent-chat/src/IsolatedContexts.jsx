import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import { useApp } from './AppContext';

// 基本データ用のContext（ページの基本情報のみ）
const BasicDataContext = createContext();

// ツール選択状態専用のContext
const ToolSelectionContext = createContext();

// メッセージデータ用のContext（ストリーミング更新のみ）
const MessageDataContext = createContext();

// 設定モーダル専用のContext
const SettingsModalContext = createContext();

// 設定モーダル専用Provider
export const SettingsModalProvider = ({ children }) => {
    const [showSettings, setShowSettings] = useState(false);

    const settingsValue = useMemo(() => ({
        showSettings,
        setShowSettings
    }), [showSettings]);

    return (
        <SettingsModalContext.Provider value={settingsValue}>
            {children}
        </SettingsModalContext.Provider>
    );
};

// 基本データProvider（showSettingsを除外）
export const BasicDataProvider = ({ children }) => {
    const mainContext = useApp();
    const basicDataRef = useRef(null);

    const basicValue = useMemo(() => {
        // showSettingsを依存関係から完全に除外
        const shouldUpdate = !basicDataRef.current ||
            basicDataRef.current.tools !== mainContext.tools ||
            basicDataRef.current.serverStatus !== mainContext.serverStatus ||
            basicDataRef.current.agentConfig !== mainContext.agentConfig ||
            basicDataRef.current.pages?.length !== mainContext.pages?.length ||
            basicDataRef.current.currentPageId !== mainContext.currentPageId ||
            basicDataRef.current.editingPageName !== mainContext.editingPageName ||
            basicDataRef.current.isInitialized !== mainContext.isInitialized ||
            basicDataRef.current.user?.id !== mainContext.user?.id; // ユーザー情報の変更を監視

        if (shouldUpdate) {
            console.log('BasicDataProvider updating:', {
                reason: !basicDataRef.current ? 'initial' : 'basic change detected',
                currentPageId: mainContext.currentPageId,
                toolsLength: mainContext.tools?.length,
                userId: mainContext.user?.id
            });

            basicDataRef.current = {
                // ページの基本情報（selectedToolsとmessagesは除外）
                pages: (mainContext.pages || []).map(page => ({
                    id: page.id,
                    name: page.name,
                    isLoading: page.isLoading,
                    settings: page.settings
                })),
                currentPageId: mainContext.currentPageId,
                tools: mainContext.tools,
                toolIcons: mainContext.toolIcons,
                serverStatus: mainContext.serverStatus,
                agentConfig: mainContext.agentConfig,
                editingPageName: mainContext.editingPageName,
                isInitialized: mainContext.isInitialized,

                // ユーザー情報を追加
                user: mainContext.user,
                authenticatedFetch: mainContext.authenticatedFetch,

                // Actions
                dispatch: mainContext.dispatch,
                createNewPage: mainContext.createNewPage,
                deletePage: mainContext.deletePage,
                updatePageName: mainContext.updatePageName,
                updatePageLoading: mainContext.updatePageLoading,

                // 設定関連のAPI（追加）
                fetchAgentConfig: mainContext.fetchAgentConfig,
                checkServerHealth: mainContext.checkServerHealth,

                // Utilities
                generateRandomAnimalName: mainContext.generateRandomAnimalName,
                getAnimalEmoji: mainContext.getAnimalEmoji,
                API_BASE_URL: mainContext.API_BASE_URL
            };
        }

        return basicDataRef.current;
    }, [
        mainContext.tools,
        mainContext.serverStatus,
        mainContext.agentConfig,
        mainContext.pages?.length,
        mainContext.currentPageId,
        mainContext.editingPageName,
        mainContext.isInitialized,
        mainContext.user?.id, // ユーザーIDの変更を監視
        // 関数の安定性を確保
        mainContext.fetchAgentConfig,
        mainContext.checkServerHealth
    ]);

    return (
        <BasicDataContext.Provider value={basicValue}>
            {children}
        </BasicDataContext.Provider>
    );
};

// ツール選択状態専用Provider（最適化版）
export const ToolSelectionProvider = ({ children }) => {
    const mainContext = useApp();
    const toolSelectionRef = useRef(null);

    const toolSelectionValue = useMemo(() => {
        const currentPage = mainContext.pages?.find(p => p.id === mainContext.currentPageId);
        const selectedTools = currentPage?.selectedTools || new Set();
        
        // Set の内容を配列にして文字列化（安定した比較のため）
        const toolsArray = [...selectedTools].sort();
        const toolsString = toolsArray.join(',');
        
        // 前回と同じ内容の場合は、同じ参照を返す
        if (toolSelectionRef.current?.toolsString === toolsString && 
            toolSelectionRef.current?.currentPageId === mainContext.currentPageId) {
            return toolSelectionRef.current.value;
        }

        const newValue = {
            currentPageId: mainContext.currentPageId,
            selectedTools: selectedTools,
            selectedToolsSize: selectedTools.size,
            toolsArray: toolsArray, // デバッグ用
            toggleToolInPage: mainContext.toggleToolInPage,
            dispatch: mainContext.dispatch
        };

        // 参照をキャッシュ
        toolSelectionRef.current = {
            currentPageId: mainContext.currentPageId,
            toolsString: toolsString,
            value: newValue
        };

        console.log('ToolSelectionProvider updating:', {
            pageId: mainContext.currentPageId,
            toolsString,
            size: selectedTools.size
        });

        return newValue;
    }, [
        mainContext.currentPageId,
        // Set の内容変更を効率的に検知
        mainContext.pages?.find(p => p.id === mainContext.currentPageId)?.selectedTools ?
            [...mainContext.pages.find(p => p.id === mainContext.currentPageId).selectedTools].sort().join(',') :
            '',
        mainContext.toggleToolInPage,
        mainContext.dispatch
    ]);

    return (
        <ToolSelectionContext.Provider value={toolSelectionValue}>
            {children}
        </ToolSelectionContext.Provider>
    );
};

// メッセージデータProvider
export const MessageDataProvider = ({ children }) => {
    const mainContext = useApp();
    const messageDataRef = useRef(null);

    const messageValue = useMemo(() => {
        const currentPage = (mainContext.pages || []).find(p => p.id === mainContext.currentPageId);

        // currentPageの参照安定性を向上させる（selectedToolsの変更も含める）
        const shouldUpdateCurrentPage = !messageDataRef.current?.currentPage ||
            messageDataRef.current.currentPage.id !== currentPage?.id ||
            messageDataRef.current.currentPage.name !== currentPage?.name ||
            messageDataRef.current.currentPage.messages?.length !== currentPage?.messages?.length ||
            messageDataRef.current.currentPage.isLoading !== currentPage?.isLoading ||
            // settingsオブジェクトの内容変更をチェック
            JSON.stringify(messageDataRef.current.currentPage.settings) !== JSON.stringify(currentPage?.settings) ||
            // ✅ selectedToolsの変更もチェック
            messageDataRef.current.currentPage.selectedTools?.size !== currentPage?.selectedTools?.size ||
            !setsAreEqual(messageDataRef.current.currentPage.selectedTools, currentPage?.selectedTools);

        if (shouldUpdateCurrentPage || !messageDataRef.current) {
            console.log('MessageDataProvider updating currentPage:', {
                reason: !messageDataRef.current ? 'initial' : 'page content changed',
                pageId: currentPage?.id,
                messageCount: currentPage?.messages?.length,
                selectedToolsSize: currentPage?.selectedTools?.size
            });

            const optimizedCurrentPage = currentPage ? {
                id: currentPage.id,
                name: currentPage.name,
                messages: currentPage.messages,
                isLoading: currentPage.isLoading,
                settings: currentPage.settings,
                selectedTools: currentPage.selectedTools // 安定した参照として保持
            } : null;

            messageDataRef.current = {
                currentPage: optimizedCurrentPage,
                addMessage: mainContext.addMessage,
                updateMessage: mainContext.updateMessage,
                checkServerHealth: mainContext.checkServerHealth,
                fetchTools: mainContext.fetchTools,
                fetchAgentConfig: mainContext.fetchAgentConfig
            };
        }

        return messageDataRef.current;
    }, [
        // メッセージデータに関連する重要な変更のみを監視
        mainContext.currentPageId,
        mainContext.pages?.find(p => p.id === mainContext.currentPageId)?.id,
        mainContext.pages?.find(p => p.id === mainContext.currentPageId)?.name,
        mainContext.pages?.find(p => p.id === mainContext.currentPageId)?.messages?.length,
        mainContext.pages?.find(p => p.id === mainContext.currentPageId)?.isLoading,
        // ✅ selectedToolsの変更も監視対象に追加
        mainContext.pages?.find(p => p.id === mainContext.currentPageId)?.selectedTools?.size,
        // selectedToolsの中身の変更も検知するために配列化
        mainContext.pages?.find(p => p.id === mainContext.currentPageId)?.selectedTools ? 
            [...mainContext.pages.find(p => p.id === mainContext.currentPageId).selectedTools].sort().join(',') : '',
        mainContext.addMessage,
        mainContext.updateMessage,
        mainContext.checkServerHealth,
        mainContext.fetchTools,
        mainContext.fetchAgentConfig
    ]);

    return (
        <MessageDataContext.Provider value={messageValue}>
            {children}
        </MessageDataContext.Provider>
    );
};

const setsAreEqual = (set1, set2) => {
    if (!set1 && !set2) return true;
    if (!set1 || !set2) return false;
    if (set1.size !== set2.size) return false;
    
    for (const item of set1) {
        if (!set2.has(item)) return false;
    }
    return true;
};

// 結合Provider
export const IsolatedProviders = ({ children }) => {
    return (
        <SettingsModalProvider>
            <BasicDataProvider>
                <ToolSelectionProvider>
                    <MessageDataProvider>
                        {children}
                    </MessageDataProvider>
                </ToolSelectionProvider>
            </BasicDataProvider>
        </SettingsModalProvider>
    );
};

// カスタムフック
export const useBasicData = () => {
    const context = useContext(BasicDataContext);
    if (!context) {
        throw new Error('useBasicData must be used within BasicDataProvider');
    }
    return context;
};

export const useToolSelection = () => {
    const context = useContext(ToolSelectionContext);
    if (!context) {
        throw new Error('useToolSelection must be used within ToolSelectionProvider');
    }
    return context;
};

export const useMessageData = () => {
    const context = useContext(MessageDataContext);
    if (!context) {
        throw new Error('useMessageData must be used within MessageDataProvider');
    }
    return context;
};

// 設定モーダル専用フック
export const useSettingsModal = () => {
    const context = useContext(SettingsModalContext);
    if (!context) {
        throw new Error('useSettingsModal must be used within SettingsModalProvider');
    }
    return context;
};

// 各コンポーネント用の特化フック（依存関係を最小化）
export const useIconBarIsolated = () => {
    const basicData = useBasicData();

    return useMemo(() => ({
        pages: basicData.pages,
        currentPageId: basicData.currentPageId,
        createNewPage: basicData.createNewPage,
        deletePage: basicData.deletePage,
        getAnimalEmoji: basicData.getAnimalEmoji,
        dispatch: basicData.dispatch,
        // ユーザー情報を追加
        user: basicData.user,
        authenticatedFetch: basicData.authenticatedFetch
        // setShowSettingsを除外してIconBarを安定化
    }), [
        basicData.pages,
        basicData.currentPageId,
        basicData.createNewPage,
        basicData.deletePage,
        basicData.getAnimalEmoji,
        basicData.dispatch,
        basicData.user,
        basicData.authenticatedFetch
    ]);
};

// 設定ボタン専用フック
export const useSettingsButtonIsolated = () => {
    const settingsModal = useSettingsModal();

    return useMemo(() => ({
        setShowSettings: settingsModal.setShowSettings
    }), [
        settingsModal.setShowSettings
    ]);
};

// ToolPalette専用フック（最適化版）
export const useToolPaletteIsolated = () => {
    const basicData = useBasicData();
    const toolSelection = useToolSelection();
    const prevToolsRef = useRef('');

    return useMemo(() => {
        const toolsString = toolSelection.toolsArray?.join(',') || '';
        
        // ツール選択が変わった場合のみログ出力
        if (prevToolsRef.current !== toolsString) {
            console.log('useToolPaletteIsolated: tool selection changed:', {
                pageId: toolSelection.currentPageId,
                oldTools: prevToolsRef.current,
                newTools: toolsString,
                size: toolSelection.selectedToolsSize,
                timestamp: Date.now()
            });
            prevToolsRef.current = toolsString;
        }

        return {
            currentPageId: toolSelection.currentPageId,
            selectedTools: toolSelection.selectedTools,
            selectedToolsSize: toolSelection.selectedToolsSize,
            tools: basicData.tools,
            serverStatus: basicData.serverStatus,
            toggleToolInPage: toolSelection.toggleToolInPage,
            dispatch: toolSelection.dispatch
        };
    }, [
        toolSelection.currentPageId,
        toolSelection.selectedToolsSize,
        toolSelection.toolsArray?.join(','), // 選択内容の変更を監視
        basicData.tools?.length,
        basicData.serverStatus,
        toolSelection.toggleToolInPage,
        toolSelection.dispatch
    ]);
};

export const useMessageInputIsolated = () => {
    const basicData = useBasicData();

    const currentPage = useMemo(() => {
        return basicData.pages.find(p => p.id === basicData.currentPageId);
    }, [basicData.pages, basicData.currentPageId]);

    return useMemo(() => ({
        currentPage,
        serverStatus: basicData.serverStatus
    }), [currentPage, basicData.serverStatus]);
};

export const useMessageListIsolated = () => {
    const messageData = useMessageData();
    const basicData = useBasicData();

    return useMemo(() => ({
        currentPage: messageData.currentPage,
        agentConfig: basicData.agentConfig,
        getAnimalEmoji: basicData.getAnimalEmoji
    }), [
        messageData.currentPage,
        basicData.agentConfig,
        basicData.getAnimalEmoji
    ]);
};

// ChatHeader専用フック（最適化版）
export const useChatHeaderIsolated = () => {
    const basicData = useBasicData();
    const toolSelection = useToolSelection();
    const prevSizeRef = useRef(0);

    return useMemo(() => {
        const currentSize = toolSelection.selectedToolsSize || 0;
        
        // サイズが変わった場合のみログ出力
        if (prevSizeRef.current !== currentSize) {
            console.log('useChatHeaderIsolated: tool size changed:', {
                pageId: basicData.currentPageId,
                oldSize: prevSizeRef.current,
                newSize: currentSize,
                timestamp: Date.now()
            });
            prevSizeRef.current = currentSize;
        }

        return {
            currentPageId: basicData.currentPageId,
            currentPageName: basicData.pages?.find(p => p.id === basicData.currentPageId)?.name,
            editingPageName: basicData.editingPageName,
            serverStatus: basicData.serverStatus,
            agentConfig: basicData.agentConfig,
            selectedToolsSize: currentSize,
            updatePageName: basicData.updatePageName,
            getAnimalEmoji: basicData.getAnimalEmoji,
            dispatch: basicData.dispatch
        };
    }, [
        basicData.currentPageId,
        basicData.pages?.find(p => p.id === basicData.currentPageId)?.name,
        basicData.editingPageName,
        basicData.serverStatus,
        basicData.agentConfig,
        toolSelection.selectedToolsSize, // サイズのみを監視
        basicData.updatePageName,
        basicData.getAnimalEmoji,
        basicData.dispatch
    ]);
};

// ChatArea本体用フック
export const useChatAreaIsolated = () => {
    const messageData = useMessageData();
    const basicData = useBasicData();
    const toolSelection = useToolSelection();
    
    // AppContextからユーザー設定関連の情報を取得
    const mainContext = useApp();

    return useMemo(() => {
        const currentPage = messageData.currentPage;
        const hasMessages = currentPage?.messages?.length > 0;

        console.log('useChatAreaIsolated called (USER-CONFIG):', {
            pageId: currentPage?.id,
            hasMessages,
            messageCount: currentPage?.messages?.length,
            selectedToolsSize: hasMessages ? 'N/A' : toolSelection.selectedToolsSize,
            hasUserConfig: mainContext.effectiveConfig?._meta?.hasUserOverrides,
            provider: mainContext.effectiveConfig?.provider,
            timestamp: Date.now()
        });

        const result = {
            currentPage: messageData.currentPage,
            serverStatus: basicData.serverStatus,
            agentConfig: basicData.agentConfig,
            updatePageLoading: basicData.updatePageLoading,
            addMessage: messageData.addMessage,
            updateMessage: messageData.updateMessage,
            API_BASE_URL: basicData.API_BASE_URL,
            hasMessages,
            
            // ユーザー設定関連を追加
            effectiveConfig: mainContext.effectiveConfig,
            userConfigEnabled: mainContext.userConfigEnabled,
            configInitialized: mainContext.configInitialized,
            makeUserConfiguredAPIRequest: mainContext.makeUserConfiguredAPIRequest
        };

        // 初期画面（メッセージなし）の場合のみツール選択情報を含める
        if (!hasMessages) {
            result.selectedToolsSize = toolSelection.selectedToolsSize || 0;
        }

        return result;
    }, [
        messageData.currentPage?.id,
        messageData.currentPage?.messages?.length,
        messageData.currentPage?.name,
        messageData.currentPage?.isLoading,
        basicData.serverStatus,
        basicData.agentConfig,
        basicData.updatePageLoading,
        messageData.addMessage,
        messageData.updateMessage,
        basicData.API_BASE_URL,
        // ユーザー設定関連の依存関係を追加
        mainContext.effectiveConfig,
        mainContext.userConfigEnabled,
        mainContext.configInitialized,
        mainContext.makeUserConfiguredAPIRequest,
        // 初期画面でのみツール選択サイズを依存関係に含める
        messageData.currentPage?.messages?.length === 0 ? toolSelection.selectedToolsSize : null
    ]);
};

// 設定モーダル専用フック（最適化版）
export const useSettingsModalIsolated = () => {
    const settingsModal = useSettingsModal();
    const basicData = useBasicData();

    return useMemo(() => ({
        showSettings: settingsModal.showSettings,
        setShowSettings: settingsModal.setShowSettings,
        agentConfig: basicData.agentConfig,
        API_BASE_URL: basicData.API_BASE_URL,
        // 必要なときだけ呼び出される関数（直接渡す）
        fetchAgentConfig: basicData.fetchAgentConfig,
        checkServerHealth: basicData.checkServerHealth,
        dispatch: basicData.dispatch
    }), [
        // showSettingsの変更のみを監視（最も重要な依存関係）
        settingsModal.showSettings,
        settingsModal.setShowSettings,
        // agentConfigの参照変更のみを監視（内容の変更は無視）
        basicData.agentConfig
        // API_BASE_URLと関数は安定している前提で依存関係から除外
    ]);
};