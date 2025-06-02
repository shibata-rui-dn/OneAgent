import { useState, useEffect, useCallback } from 'react'

/**
 * ローカルストレージを管理するフック
 * @param {string} key - ストレージキー
 * @param {any} defaultValue - デフォルト値
 * @returns {[any, Function, Function]} [値, 設定関数, 削除関数]
 */
export const useLocalStorage = (key, defaultValue) => {
  // 初期値の取得
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error)
      return defaultValue
    }
  })
  
  /**
   * 値を設定
   * @param {any} value - 設定する値
   */
  const setValue = useCallback((value) => {
    try {
      // 関数の場合は現在の値を引数として実行
      const valueToStore = value instanceof Function ? value(storedValue) : value
      
      setStoredValue(valueToStore)
      
      // undefinedの場合はキーを削除
      if (valueToStore === undefined) {
        localStorage.removeItem(key)
      } else {
        localStorage.setItem(key, JSON.stringify(valueToStore))
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error)
    }
  }, [key, storedValue])
  
  /**
   * 値を削除
   */
  const removeValue = useCallback(() => {
    try {
      localStorage.removeItem(key)
      setStoredValue(defaultValue)
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error)
    }
  }, [key, defaultValue])
  
  return [storedValue, setValue, removeValue]
}

/**
 * セッションストレージを管理するフック
 * @param {string} key - ストレージキー
 * @param {any} defaultValue - デフォルト値
 * @returns {[any, Function, Function]} [値, 設定関数, 削除関数]
 */
export const useSessionStorage = (key, defaultValue) => {
  // 初期値の取得
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = sessionStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch (error) {
      console.error(`Error reading sessionStorage key "${key}":`, error)
      return defaultValue
    }
  })
  
  /**
   * 値を設定
   * @param {any} value - 設定する値
   */
  const setValue = useCallback((value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      
      setStoredValue(valueToStore)
      
      if (valueToStore === undefined) {
        sessionStorage.removeItem(key)
      } else {
        sessionStorage.setItem(key, JSON.stringify(valueToStore))
      }
    } catch (error) {
      console.error(`Error setting sessionStorage key "${key}":`, error)
    }
  }, [key, storedValue])
  
  /**
   * 値を削除
   */
  const removeValue = useCallback(() => {
    try {
      sessionStorage.removeItem(key)
      setStoredValue(defaultValue)
    } catch (error) {
      console.error(`Error removing sessionStorage key "${key}":`, error)
    }
  }, [key, defaultValue])
  
  return [storedValue, setValue, removeValue]
}

/**
 * UI設定用のローカルストレージフック
 * @returns {object} UI設定の状態とメソッド
 */
export const useUIPreferences = () => {
  const [preferences, setPreferences] = useLocalStorage('ui_preferences', {
    viewMode: 'list',
    sortBy: 'name',
    sortDirection: 'asc',
    sidebarCollapsed: false,
    theme: 'light'
  })
  
  /**
   * 設定を更新
   * @param {object} updates - 更新する設定
   */
  const updatePreferences = useCallback((updates) => {
    setPreferences(prev => ({ ...prev, ...updates }))
  }, [setPreferences])
  
  /**
   * 特定の設定を取得
   * @param {string} key - 設定キー
   * @returns {any} 設定値
   */
  const getPreference = useCallback((key) => {
    return preferences[key]
  }, [preferences])
  
  /**
   * 設定をリセット
   */
  const resetPreferences = useCallback(() => {
    setPreferences({
      viewMode: 'list',
      sortBy: 'name',
      sortDirection: 'asc',
      sidebarCollapsed: false,
      theme: 'light'
    })
  }, [setPreferences])
  
  return {
    preferences,
    updatePreferences,
    getPreference,
    resetPreferences
  }
}

/**
 * ファイルキャッシュ用のローカルストレージフック
 * @returns {object} キャッシュの状態とメソッド
 */
export const useFileCache = () => {
  const [cache, setCache] = useLocalStorage('file_cache', {})
  
  /**
   * キャッシュに保存
   * @param {string} path - ファイルパス
   * @param {any} data - データ
   * @param {number} ttl - 生存時間（ミリ秒）
   */
  const setCacheItem = useCallback((path, data, ttl = 300000) => { // デフォルト5分
    const item = {
      data,
      timestamp: Date.now(),
      expires: Date.now() + ttl
    }
    
    setCache(prev => ({
      ...prev,
      [path]: item
    }))
  }, [setCache])
  
  /**
   * キャッシュから取得
   * @param {string} path - ファイルパス
   * @returns {any} キャッシュされたデータ
   */
  const getCacheItem = useCallback((path) => {
    const item = cache[path]
    if (!item) return null
    
    // 期限切れの場合は削除
    if (Date.now() > item.expires) {
      setCache(prev => {
        const newCache = { ...prev }
        delete newCache[path]
        return newCache
      })
      return null
    }
    
    return item.data
  }, [cache, setCache])
  
  /**
   * キャッシュから削除
   * @param {string} path - ファイルパス
   */
  const removeCacheItem = useCallback((path) => {
    setCache(prev => {
      const newCache = { ...prev }
      delete newCache[path]
      return newCache
    })
  }, [setCache])
  
  /**
   * 期限切れのキャッシュをクリア
   */
  const clearExpiredCache = useCallback(() => {
    const now = Date.now()
    setCache(prev => {
      const newCache = {}
      
      Object.entries(prev).forEach(([path, item]) => {
        if (now <= item.expires) {
          newCache[path] = item
        }
      })
      
      return newCache
    })
  }, [setCache])
  
  /**
   * 全キャッシュをクリア
   */
  const clearAllCache = useCallback(() => {
    setCache({})
  }, [setCache])
  
  // 定期的に期限切れキャッシュをクリア
  useEffect(() => {
    const interval = setInterval(clearExpiredCache, 60000) // 1分ごと
    return () => clearInterval(interval)
  }, [clearExpiredCache])
  
  return {
    cache,
    setCacheItem,
    getCacheItem,
    removeCacheItem,
    clearExpiredCache,
    clearAllCache
  }
}

/**
 * 最近のファイル履歴を管理するフック
 * @param {number} maxItems - 最大保存件数
 * @returns {object} 履歴の状態とメソッド
 */
export const useRecentFiles = (maxItems = 10) => {
  const [recentFiles, setRecentFiles] = useLocalStorage('recent_files', [])
  
  /**
   * ファイルを履歴に追加
   * @param {object} file - ファイル情報
   */
  const addToRecent = useCallback((file) => {
    setRecentFiles(prev => {
      // 既存のアイテムを削除
      const filtered = prev.filter(item => item.path !== file.path)
      
      // 先頭に追加
      const newRecent = [
        {
          ...file,
          accessedAt: Date.now()
        },
        ...filtered
      ]
      
      // 最大件数を超えた場合は古いものを削除
      return newRecent.slice(0, maxItems)
    })
  }, [setRecentFiles, maxItems])
  
  /**
   * 履歴から削除
   * @param {string} path - ファイルパス
   */
  const removeFromRecent = useCallback((path) => {
    setRecentFiles(prev => prev.filter(item => item.path !== path))
  }, [setRecentFiles])
  
  /**
   * 履歴をクリア
   */
  const clearRecent = useCallback(() => {
    setRecentFiles([])
  }, [setRecentFiles])
  
  return {
    recentFiles,
    addToRecent,
    removeFromRecent,
    clearRecent
  }
}

/**
 * アプリケーション設定を管理するフック
 * @returns {object} 設定の状態とメソッド
 */
export const useAppSettings = () => {
  const [settings, setSettings] = useLocalStorage('app_settings', {
    autoSave: true,
    autoSaveInterval: 30000, // 30秒
    showHiddenFiles: false,
    confirmDelete: true,
    defaultNewFileName: 'untitled',
    maxFileSize: 50 * 1024 * 1024, // 50MB
    language: 'ja'
  })
  
  /**
   * 設定を更新
   * @param {string} key - 設定キー
   * @param {any} value - 設定値
   */
  const updateSetting = useCallback((key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }))
  }, [setSettings])
  
  /**
   * 複数の設定を一括更新
   * @param {object} updates - 更新する設定
   */
  const updateSettings = useCallback((updates) => {
    setSettings(prev => ({ ...prev, ...updates }))
  }, [setSettings])
  
  /**
   * 設定をリセット
   */
  const resetSettings = useCallback(() => {
    setSettings({
      autoSave: true,
      autoSaveInterval: 30000,
      showHiddenFiles: false,
      confirmDelete: true,
      defaultNewFileName: 'untitled',
      maxFileSize: 50 * 1024 * 1024,
      language: 'ja'
    })
  }, [setSettings])
  
  return {
    settings,
    updateSetting,
    updateSettings,
    resetSettings
  }
}

/**
 * 汎用的なストレージフック（ローカル/セッション選択可能）
 * @param {string} key - ストレージキー
 * @param {any} defaultValue - デフォルト値
 * @param {'local'|'session'} storageType - ストレージタイプ
 * @returns {[any, Function, Function]} [値, 設定関数, 削除関数]
 */
export const useStorage = (key, defaultValue, storageType = 'local') => {
  if (storageType === 'session') {
    return useSessionStorage(key, defaultValue)
  }
  return useLocalStorage(key, defaultValue)
}

export default useLocalStorage