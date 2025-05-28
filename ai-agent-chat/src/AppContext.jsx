import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';

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

// State management
const initialState = {
  pages: [],
  currentPageId: null,
  tools: [],
  toolIcons: new Map(),
  serverStatus: 'connecting',
  agentConfig: null,
  showSettings: false,
  editingPageName: null,
  isInitialized: false
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
      console.log('UPDATE_PAGE action:', action.payload); // デバッグログ
      return {
        ...state,
        pages: (state.pages || []).map(page =>
          page.id === action.payload.id ? { ...page, ...action.payload.updates } : page
        )
      };

    case 'TOGGLE_TOOL_IN_PAGE':
      console.log('TOGGLE_TOOL_IN_PAGE action:', action.payload); // デバッグログ
      return {
        ...state,
        pages: (state.pages || []).map(page => {
          if (page.id === action.payload.pageId) {
            const newSelectedTools = new Set(page.selectedTools);
            const wasSelected = newSelectedTools.has(action.payload.toolName);
            
            if (wasSelected) {
              newSelectedTools.delete(action.payload.toolName);
            } else {
              newSelectedTools.add(action.payload.toolName);
            }
            
            console.log('Tool toggle result:', {
              pageId: page.id,
              toolName: action.payload.toolName,
              wasSelected,
              nowSelected: !wasSelected,
              newSize: newSelectedTools.size
            });
            
            return { ...page, selectedTools: newSelectedTools };
          }
          return page;
        })
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
    
    case 'SET_SHOW_SETTINGS':
      return { ...state, showSettings: action.payload };
    
    case 'SET_EDITING_PAGE_NAME':
      return { ...state, editingPageName: action.payload };
    
    case 'SET_INITIALIZED':
      return { ...state, isInitialized: action.payload };

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
      return {
        ...state,
        pages: (state.pages || []).map(page =>
          page.id === action.payload.pageId
            ? { ...page, messages: [...(page.messages || []), action.payload.message] }
            : page
        )
      };
    
    case 'UPDATE_MESSAGE':
      // ストリーミング最適化: 対象ページのみを更新
      const targetPageIndex = (state.pages || []).findIndex(p => p.id === action.payload.pageId);
      if (targetPageIndex === -1) return state;
      
      const targetPage = state.pages[targetPageIndex];
      const targetMessageIndex = (targetPage.messages || []).findIndex(m => m.id === action.payload.messageId);
      if (targetMessageIndex === -1) return state;
      
      const targetMessage = targetPage.messages[targetMessageIndex];
      const updates = { ...action.payload.updates };
      
      // Handle function updates for streaming content
      Object.keys(updates).forEach(key => {
        if (typeof updates[key] === 'function') {
          updates[key] = updates[key](targetMessage[key]);
        }
      });
      
      const updatedMessage = { ...targetMessage, ...updates };
      
      // 最小限の更新: メッセージ配列のみ更新
      const updatedMessages = [...targetPage.messages];
      updatedMessages[targetMessageIndex] = updatedMessage;
      
      const updatedPage = { ...targetPage, messages: updatedMessages };
      
      // ページ配列の最小限更新
      const updatedPages = [...state.pages];
      updatedPages[targetPageIndex] = updatedPage;
      
      return {
        ...state,
        pages: updatedPages
      };
    
    default:
      return state;
  }
};

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // API functions
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

  // Page management
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
  }, []); // 依存関係を削除

  const deletePage = useCallback((pageId) => {
    // ページ数の確認はreducer内で行う
    dispatch({ type: 'DELETE_PAGE', payload: pageId });
  }, []); // 依存関係を削除

  const updatePageName = useCallback((pageId, newName) => {
    dispatch({ 
      type: 'UPDATE_PAGE', 
      payload: { id: pageId, updates: { name: newName } }
    });
  }, []); // 依存関係を削除

  const toggleToolInPage = useCallback((pageId, toolName) => {
    // 最新の状態は reducer 内で取得
    dispatch({
      type: 'TOGGLE_TOOL_IN_PAGE',
      payload: { pageId, toolName }
    });
  }, []); // 依存関係を削除

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

      // 初期ページの作成はreducerで状態を確認して行う
      dispatch({ type: 'INITIALIZE_PAGES' });
      dispatch({ type: 'SET_INITIALIZED', payload: true });

    } catch (error) {
      console.error('アプリ初期化エラー:', error);
      dispatch({ type: 'SET_SERVER_STATUS', payload: 'error' });

      // エラーが発生しても初期ページは作成
      dispatch({ type: 'INITIALIZE_PAGES' });
      dispatch({ type: 'SET_INITIALIZED', payload: true });
    }
  }, [checkServerHealth, fetchTools, fetchAgentConfig]); // state.pagesの依存関係を削除

  // Memoized values with shallow comparison for pages
  const currentPage = useMemo(() => {
    return (state.pages || []).find(p => p.id === state.currentPageId);
  }, [state.pages, state.currentPageId]);

  // Memoized pages to prevent unnecessary re-renders
  const memoizedPages = useMemo(() => state.pages, [state.pages]);
  
  // Stable callback references that don't cause re-renders
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
    // State - only include what components actually need
    pages: memoizedPages,
    currentPageId: state.currentPageId,
    tools: state.tools,
    toolIcons: state.toolIcons,
    serverStatus: state.serverStatus,
    agentConfig: state.agentConfig,
    showSettings: state.showSettings,
    editingPageName: state.editingPageName,
    isInitialized: state.isInitialized,
    currentPage,
    
    // Stable callbacks
    ...stableCallbacks,
    
    // Constants
    API_BASE_URL: API_BASE_URL
  }), [
    // Only depend on values that actually change and matter
    memoizedPages,
    state.currentPageId,
    state.tools,
    state.toolIcons,
    state.serverStatus,
    state.agentConfig,
    state.showSettings,
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