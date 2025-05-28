import React, { createContext, useContext, useMemo, useRef } from 'react';
import { useApp } from './AppContext';

// 静的データ用のContext（ストリーミング更新の影響を受けない）
const StaticDataContext = createContext();

// メッセージデータ用のContext（ストリーミング更新のみ）
const MessageDataContext = createContext();

// 静的データProvider
export const StaticDataProvider = ({ children }) => {
  const mainContext = useApp();
  const staticDataRef = useRef(null);

  const staticValue = useMemo(() => {
    // ページの基本情報とselectedToolsの変更を監視
    const currentPage = mainContext.pages?.find(p => p.id === mainContext.currentPageId);
    const currentSelectedToolsArray = currentPage?.selectedTools ? [...currentPage.selectedTools].sort() : [];
    const currentSelectedToolsKey = currentSelectedToolsArray.join(',');
    
    // 初回または重要な変更があった場合のみ更新
    const shouldUpdate = !staticDataRef.current ||
      staticDataRef.current.tools !== mainContext.tools ||
      staticDataRef.current.serverStatus !== mainContext.serverStatus ||
      staticDataRef.current.agentConfig !== mainContext.agentConfig ||
      staticDataRef.current.pages?.length !== mainContext.pages?.length ||
      staticDataRef.current.currentPageId !== mainContext.currentPageId ||
      staticDataRef.current.showSettings !== mainContext.showSettings ||
      staticDataRef.current.editingPageName !== mainContext.editingPageName ||
      staticDataRef.current.isInitialized !== mainContext.isInitialized ||
      staticDataRef.current.currentSelectedToolsKey !== currentSelectedToolsKey;

    if (shouldUpdate) {
      console.log('StaticDataProvider updating:', {
        reason: !staticDataRef.current ? 'initial' : 'change detected',
        currentSelectedToolsKey,
        previousSelectedToolsKey: staticDataRef.current?.currentSelectedToolsKey,
        currentPageId: mainContext.currentPageId
      });

      staticDataRef.current = {
        // ページの基本情報（メッセージは除外、selectedToolsは含む）
        pages: (mainContext.pages || []).map(page => ({
          id: page.id,
          name: page.name,
          selectedTools: page.selectedTools,
          isLoading: page.isLoading,
          settings: page.settings
        })),
        currentPageId: mainContext.currentPageId,
        currentSelectedToolsKey: currentSelectedToolsKey,
        tools: mainContext.tools,
        toolIcons: mainContext.toolIcons,
        serverStatus: mainContext.serverStatus,
        agentConfig: mainContext.agentConfig,
        showSettings: mainContext.showSettings,
        editingPageName: mainContext.editingPageName,
        isInitialized: mainContext.isInitialized,
        
        // Actions
        dispatch: mainContext.dispatch,
        createNewPage: mainContext.createNewPage,
        deletePage: mainContext.deletePage,
        updatePageName: mainContext.updatePageName,
        toggleToolInPage: mainContext.toggleToolInPage,
        updatePageLoading: mainContext.updatePageLoading,
        
        // Utilities
        generateRandomAnimalName: mainContext.generateRandomAnimalName,
        getAnimalEmoji: mainContext.getAnimalEmoji,
        API_BASE_URL: mainContext.API_BASE_URL
      };
    }

    return staticDataRef.current;
  }, [
    mainContext.tools,
    mainContext.serverStatus,
    mainContext.agentConfig,
    mainContext.pages?.length,
    mainContext.currentPageId,
    mainContext.showSettings,
    mainContext.editingPageName,
    mainContext.isInitialized,
    // selectedToolsの内容変更を検知するために、配列化してキー化
    mainContext.pages?.find(p => p.id === mainContext.currentPageId)?.selectedTools ? 
      [...mainContext.pages.find(p => p.id === mainContext.currentPageId).selectedTools].sort().join(',') : 
      ''
  ]);

  return (
    <StaticDataContext.Provider value={staticValue}>
      {children}
    </StaticDataContext.Provider>
  );
};

// メッセージデータProvider
export const MessageDataProvider = ({ children }) => {
  const mainContext = useApp();

  const messageValue = useMemo(() => ({
    currentPage: mainContext.currentPage,
    addMessage: mainContext.addMessage,
    updateMessage: mainContext.updateMessage,
    checkServerHealth: mainContext.checkServerHealth,
    fetchTools: mainContext.fetchTools,
    fetchAgentConfig: mainContext.fetchAgentConfig
  }), [
    mainContext.currentPage,
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

// 結合Provider
export const IsolatedProviders = ({ children }) => {
  return (
    <StaticDataProvider>
      <MessageDataProvider>
        {children}
      </MessageDataProvider>
    </StaticDataProvider>
  );
};

// カスタムフック
export const useStaticData = () => {
  const context = useContext(StaticDataContext);
  if (!context) {
    throw new Error('useStaticData must be used within StaticDataProvider');
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

// 各コンポーネント用の特化フック
export const useIconBarIsolated = () => {
  const staticData = useStaticData();
  
  return useMemo(() => ({
    pages: staticData.pages,
    currentPageId: staticData.currentPageId,
    createNewPage: staticData.createNewPage,
    deletePage: staticData.deletePage,
    getAnimalEmoji: staticData.getAnimalEmoji,
    dispatch: staticData.dispatch
  }), [
    staticData.pages,
    staticData.currentPageId,
    staticData.createNewPage,
    staticData.deletePage,
    staticData.getAnimalEmoji,
    staticData.dispatch
  ]);
};

export const useToolPaletteIsolated = () => {
  const staticData = useStaticData();
  
  const currentPage = useMemo(() => {
    return staticData.pages.find(p => p.id === staticData.currentPageId);
  }, [staticData.pages, staticData.currentPageId]);
  
  // selectedToolsの内容をキー化して変更を検知
  const selectedToolsKey = useMemo(() => {
    return currentPage?.selectedTools ? [...currentPage.selectedTools].sort().join(',') : '';
  }, [currentPage?.selectedTools]);
  
  // デバッグ用ログ
  console.log('useToolPaletteIsolated update:', {
    pageId: currentPage?.id,
    selectedToolsSize: currentPage?.selectedTools?.size,
    selectedToolsKey,
    selectedTools: currentPage?.selectedTools ? [...currentPage.selectedTools] : [],
    timestamp: Date.now()
  });
  
  return useMemo(() => ({
    currentPage,
    tools: staticData.tools,
    serverStatus: staticData.serverStatus,
    toggleToolInPage: staticData.toggleToolInPage,
    dispatch: staticData.dispatch
  }), [
    currentPage?.id,
    selectedToolsKey, // selectedToolsの内容変更を監視
    staticData.tools,
    staticData.serverStatus,
    staticData.toggleToolInPage,
    staticData.dispatch
  ]);
};

export const useMessageInputIsolated = () => {
  const staticData = useStaticData();
  
  const currentPage = useMemo(() => {
    return staticData.pages.find(p => p.id === staticData.currentPageId);
  }, [staticData.pages, staticData.currentPageId]);
  
  return useMemo(() => ({
    currentPage,
    serverStatus: staticData.serverStatus
  }), [currentPage, staticData.serverStatus]);
};

export const useMessageListIsolated = () => {
  const messageData = useMessageData();
  const staticData = useStaticData();
  
  return useMemo(() => ({
    currentPage: messageData.currentPage,
    agentConfig: staticData.agentConfig,
    getAnimalEmoji: staticData.getAnimalEmoji
  }), [
    messageData.currentPage,
    staticData.agentConfig,
    staticData.getAnimalEmoji
  ]);
};

export const useChatAreaIsolated = () => {
  const messageData = useMessageData();
  const staticData = useStaticData();
  
  return useMemo(() => ({
    currentPage: messageData.currentPage,
    serverStatus: staticData.serverStatus,
    agentConfig: staticData.agentConfig,
    editingPageName: staticData.editingPageName,
    updatePageName: staticData.updatePageName,
    updatePageLoading: staticData.updatePageLoading,
    addMessage: messageData.addMessage,
    updateMessage: messageData.updateMessage,
    getAnimalEmoji: staticData.getAnimalEmoji,
    API_BASE_URL: staticData.API_BASE_URL,
    dispatch: staticData.dispatch
  }), [
    messageData.currentPage,
    staticData.serverStatus,
    staticData.agentConfig,
    staticData.editingPageName,
    staticData.updatePageName,
    staticData.updatePageLoading,
    messageData.addMessage,
    messageData.updateMessage,
    staticData.getAnimalEmoji,
    staticData.API_BASE_URL,
    staticData.dispatch
  ]);
};