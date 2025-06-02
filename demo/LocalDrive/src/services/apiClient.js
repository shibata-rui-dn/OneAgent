import axios from 'axios'
import { API_CONFIG, STORAGE_KEYS, ERROR_MESSAGES } from '../utils/constants.js'

// Axiosインスタンスの作成
const apiClient = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
})

// リクエストインターセプター
apiClient.interceptors.request.use(
  (config) => {
    // 認証トークンの追加
    const token = localStorage.getItem(STORAGE_KEYS.authToken)
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    // デバッグ用：リクエストの詳細ログ
    console.log('🔄 API Request Details:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      headers: config.headers,
      data: config.data,
      dataType: typeof config.data,
      dataJSON: JSON.stringify(config.data, null, 2)
    });

    // 直接ツール実行リクエストの詳細チェック
    if (config.data && config.data.tool) {
      console.log('🔧 Direct Tool Execution Debug:', {
        tool: config.data.tool,
        arguments: config.data.arguments,
        options: config.data.options,
        toolType: typeof config.data.tool,
        argumentsType: typeof config.data.arguments
      });

      // ツール名の検証
      if (typeof config.data.tool !== 'string') {
        console.error(`❌ Invalid tool name:`, {
          value: config.data.tool,
          type: typeof config.data.tool,
          expected: 'string'
        });
      }
    }
    
    return config
  },
  (error) => {
    console.error('❌ Request Error:', error)
    return Promise.reject(error)
  }
)

// レスポンスインターセプター
apiClient.interceptors.response.use(
  (response) => {
    // デバッグモードでのログ出力
    if (import.meta.env.VITE_DEBUG_MODE === 'true') {
      console.log('✅ API Response:', {
        status: response.status,
        url: response.config.url,
        data: response.data
      })
    }
    
    return response
  },
  async (error) => {
    const originalRequest = error.config
    
    // デバッグモードでのエラーログ
    if (import.meta.env.VITE_DEBUG_MODE === 'true') {
      console.error('❌ API Error:', {
        status: error.response?.status,
        url: error.config?.url,
        message: error.message,
        data: error.response?.data
      })
    }
    
    // 401エラー（認証切れ）の処理
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      
      try {
        // リフレッシュトークンで認証を更新
        const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken)
        if (refreshToken) {
          const response = await refreshAuthToken(refreshToken)
          const newToken = response.data.access_token
          
          // 新しいトークンを保存
          localStorage.setItem(STORAGE_KEYS.authToken, newToken)
          
          // 元のリクエストを再実行
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return apiClient(originalRequest)
        }
      } catch (refreshError) {
        console.error('🔄 Token refresh failed:', refreshError)
        // リフレッシュ失敗時はログアウト
        clearAuthData()
        window.location.href = '/login'
      }
    }
    
    // エラーレスポンスの正規化
    const normalizedError = normalizeError(error)
    return Promise.reject(normalizedError)
  }
)

/**
 * 認証トークンをリフレッシュ
 * @param {string} refreshToken - リフレッシュトークン
 * @returns {Promise} レスポンスPromise
 */
const refreshAuthToken = (refreshToken) => {
  return axios.post(`${API_CONFIG.baseURL}/oauth/refresh`, {
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })
}

/**
 * 認証データをクリア
 */
const clearAuthData = () => {
  localStorage.removeItem(STORAGE_KEYS.authToken)
  localStorage.removeItem(STORAGE_KEYS.refreshToken)
  localStorage.removeItem(STORAGE_KEYS.userInfo)
}

/**
 * エラーを正規化
 * @param {Error} error - エラーオブジェクト
 * @returns {Error} 正規化されたエラー
 */
const normalizeError = (error) => {
  const normalizedError = new Error()
  
  if (error.response) {
    // サーバーからのレスポンスがある場合
    normalizedError.status = error.response.status
    normalizedError.data = error.response.data
    
    // デバッグ用にレスポンス詳細をログ出力
    if (import.meta.env.VITE_DEBUG_MODE === 'true') {
      console.error('API Error Details:', {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers,
        config: error.config
      })
    }
    
    switch (error.response.status) {
      case 400:
        // 400エラーの詳細メッセージを使用
        normalizedError.message = error.response.data?.message || 
                                  error.response.data?.error || 
                                  'リクエストが無効です'
        break
      case 401:
        normalizedError.message = ERROR_MESSAGES.AUTH_REQUIRED
        break
      case 403:
        normalizedError.message = 'アクセス権限がありません'
        break
      case 404:
        normalizedError.message = 'リソースが見つかりません'
        break
      case 413:
        normalizedError.message = 'ファイルサイズが大きすぎます'
        break
      case 429:
        normalizedError.message = 'リクエストが多すぎます。しばらく待ってから再試行してください'
        break
      case 500:
        normalizedError.message = ERROR_MESSAGES.SERVER_ERROR
        break
      case 503:
        normalizedError.message = 'サービスが一時的に利用できません'
        break
      default:
        normalizedError.message = error.response.data?.message || ERROR_MESSAGES.UNKNOWN_ERROR
    }
  } else if (error.request) {
    // リクエストは送信されたがレスポンスがない場合
    normalizedError.message = ERROR_MESSAGES.NETWORK_ERROR
    normalizedError.type = 'network'
  } else {
    // その他のエラー
    normalizedError.message = error.message || ERROR_MESSAGES.UNKNOWN_ERROR
    normalizedError.type = 'unknown'
  }
  
  normalizedError.original = error
  return normalizedError
}

/**
 * リトライ機能付きAPI呼び出し
 * @param {Function} apiCall - API呼び出し関数
 * @param {number} maxRetries - 最大リトライ回数
 * @param {number} retryDelay - リトライ間隔（ms）
 * @returns {Promise} レスポンスPromise
 */
export const withRetry = async (apiCall, maxRetries = API_CONFIG.retryAttempts, retryDelay = API_CONFIG.retryDelay) => {
  let lastError
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall()
    } catch (error) {
      lastError = error
      
      // 最後の試行または致命的なエラーの場合はリトライしない
      if (attempt === maxRetries || isNonRetryableError(error)) {
        throw error
      }
      
      // 指数バックオフでリトライ間隔を増加
      const delay = retryDelay * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, delay))
      
      console.warn(`🔄 Retrying API call (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms`)
    }
  }
  
  throw lastError
}

/**
 * リトライしないエラーかどうかを判定
 * @param {Error} error - エラーオブジェクト
 * @returns {boolean} リトライしない場合true
 */
const isNonRetryableError = (error) => {
  const nonRetryableStatuses = [400, 401, 403, 404, 422]
  return error.status && nonRetryableStatuses.includes(error.status)
}

/**
 * ファイルアップロード用のマルチパートリクエスト
 * @param {string} url - アップロードURL
 * @param {FormData} formData - フォームデータ
 * @param {Function} onProgress - 進捗コールバック
 * @returns {Promise} レスポンスPromise
 */
export const uploadFile = (url, formData, onProgress) => {
  return apiClient.post(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress(progress)
      }
    }
  })
}

/**
 * ファイルダウンロード用のリクエスト
 * @param {string} url - ダウンロードURL
 * @param {Function} onProgress - 進捗コールバック
 * @returns {Promise} レスポンスPromise
 */
export const downloadFile = (url, onProgress) => {
  return apiClient.get(url, {
    responseType: 'blob',
    onDownloadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress(progress)
      }
    }
  })
}

/**
 * ヘルスチェック
 * @returns {Promise} レスポンスPromise
 */
export const healthCheck = () => {
  return apiClient.get('/health')
}

/**
 * 接続テスト
 * @returns {Promise<boolean>} 接続可能な場合true
 */
export const testConnection = async () => {
  try {
    await healthCheck()
    return true
  } catch (error) {
    console.error('Connection test failed:', error)
    return false
  }
}

/**
 * APIクライアント設定の更新
 * @param {object} config - 新しい設定
 */
export const updateApiConfig = (config) => {
  if (config.baseURL) {
    apiClient.defaults.baseURL = config.baseURL
  }
  if (config.timeout) {
    apiClient.defaults.timeout = config.timeout
  }
  if (config.headers) {
    Object.assign(apiClient.defaults.headers, config.headers)
  }
}

/**
 * レスポンスキャッシュ機能
 */
class ResponseCache {
  constructor(maxSize = 50, ttl = 5 * 60 * 1000) { // 5分
    this.cache = new Map()
    this.maxSize = maxSize
    this.ttl = ttl
  }
  
  /**
   * キャッシュキーを生成
   * @param {string} method - HTTPメソッド
   * @param {string} url - URL
   * @param {object} params - パラメータ
   * @returns {string} キャッシュキー
   */
  generateKey(method, url, params) {
    return `${method}:${url}:${JSON.stringify(params || {})}`
  }
  
  /**
   * キャッシュから値を取得
   * @param {string} key - キャッシュキー
   * @returns {any} キャッシュされた値
   */
  get(key) {
    const item = this.cache.get(key)
    if (!item) return null
    
    if (Date.now() > item.expires) {
      this.cache.delete(key)
      return null
    }
    
    return item.data
  }
  
  /**
   * キャッシュに値を設定
   * @param {string} key - キャッシュキー
   * @param {any} data - データ
   */
  set(key, data) {
    // キャッシュサイズの制限
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    
    this.cache.set(key, {
      data,
      expires: Date.now() + this.ttl
    })
  }
  
  /**
   * キャッシュをクリア
   */
  clear() {
    this.cache.clear()
  }
}

// グローバルキャッシュインスタンス
export const responseCache = new ResponseCache()

/**
 * キャッシュ機能付きGETリクエスト
 * @param {string} url - URL
 * @param {object} params - パラメータ
 * @param {boolean} useCache - キャッシュを使用するかどうか
 * @returns {Promise} レスポンスPromise
 */
export const getCached = async (url, params = {}, useCache = true) => {
  const cacheKey = responseCache.generateKey('GET', url, params)
  
  if (useCache) {
    const cachedData = responseCache.get(cacheKey)
    if (cachedData) {
      console.log('📦 Using cached data for:', url)
      return { data: cachedData }
    }
  }
  
  const response = await apiClient.get(url, { params })
  
  if (useCache && response.status === 200) {
    responseCache.set(cacheKey, response.data)
  }
  
  return response
}

export default apiClient