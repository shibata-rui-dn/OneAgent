import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'

/**
 * 日付を人間が読みやすい形式にフォーマット
 * @param {string|Date} date - 日付
 * @param {string} pattern - フォーマットパターン
 * @returns {string} フォーマットされた日付
 */
export const formatDate = (date, pattern = 'yyyy年MM月dd日 HH:mm') => {
  if (!date) return ''
  
  let dateObj = date
  if (typeof date === 'string') {
    dateObj = parseISO(date)
  }
  
  if (!isValid(dateObj)) return '無効な日付'
  
  return format(dateObj, pattern, { locale: ja })
}

/**
 * 相対的な時間を表示
 * @param {string|Date} date - 日付
 * @returns {string} 相対時間（例: "3分前"）
 */
export const formatRelativeTime = (date) => {
  if (!date) return ''
  
  let dateObj = date
  if (typeof date === 'string') {
    dateObj = parseISO(date)
  }
  
  if (!isValid(dateObj)) return '無効な日付'
  
  return formatDistanceToNow(dateObj, { 
    addSuffix: true, 
    locale: ja 
  })
}

/**
 * ファイルサイズを人間が読みやすい形式にフォーマット
 * @param {number} bytes - バイト数
 * @param {number} decimals - 小数点以下の桁数
 * @returns {string} フォーマットされたファイルサイズ
 */
export const formatFileSize = (bytes, decimals = 1) => {
  if (bytes === 0) return '0 B'
  if (!bytes || isNaN(bytes)) return '-'
  
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * 数値をパーセンテージにフォーマット
 * @param {number} value - 数値（0-1）
 * @param {number} decimals - 小数点以下の桁数
 * @returns {string} パーセンテージ文字列
 */
export const formatPercentage = (value, decimals = 1) => {
  if (value == null || isNaN(value)) return '0%'
  return (value * 100).toFixed(decimals) + '%'
}

/**
 * 数値を3桁区切りでフォーマット
 * @param {number} value - 数値
 * @returns {string} フォーマットされた数値
 */
export const formatNumber = (value) => {
  if (value == null || isNaN(value)) return '0'
  return value.toLocaleString('ja-JP')
}

/**
 * 文字列を切り詰める
 * @param {string} text - 文字列
 * @param {number} length - 最大長
 * @param {string} suffix - 省略記号
 * @returns {string} 切り詰められた文字列
 */
export const truncateText = (text, length = 50, suffix = '...') => {
  if (!text) return ''
  if (text.length <= length) return text
  return text.substring(0, length - suffix.length) + suffix
}

/**
 * ファイルパスを切り詰める（中央部分を省略）
 * @param {string} path - ファイルパス
 * @param {number} maxLength - 最大長
 * @returns {string} 切り詰められたパス
 */
export const truncatePath = (path, maxLength = 50) => {
  if (!path || path.length <= maxLength) return path
  
  const segments = path.split('/')
  if (segments.length <= 2) {
    return truncateText(path, maxLength)
  }
  
  let result = segments[0]
  let endParts = [segments[segments.length - 1]]
  let remainingLength = maxLength - result.length - 3 // "..." の分
  
  for (let i = segments.length - 2; i > 0; i--) {
    const segment = segments[i]
    if (remainingLength - segment.length - 1 > 0) { // "/" の分
      endParts.unshift(segment)
      remainingLength -= segment.length + 1
    } else {
      break
    }
  }
  
  if (endParts.length < segments.length - 1) {
    return result + '/.../' + endParts.join('/')
  }
  
  return path
}

/**
 * キャメルケースをケバブケースに変換
 * @param {string} str - キャメルケース文字列
 * @returns {string} ケバブケース文字列
 */
export const camelToKebab = (str) => {
  return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * ケバブケースをキャメルケースに変換
 * @param {string} str - ケバブケース文字列
 * @returns {string} キャメルケース文字列
 */
export const kebabToCamel = (str) => {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase())
}

/**
 * 文字列をタイトルケースに変換
 * @param {string} str - 文字列
 * @returns {string} タイトルケース文字列
 */
export const toTitleCase = (str) => {
  return str.replace(/\w\S*/g, (txt) => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  )
}

/**
 * エラーメッセージをユーザーフレンドリーに変換
 * @param {string|Error} error - エラー
 * @returns {string} ユーザーフレンドリーなエラーメッセージ
 */
export const formatErrorMessage = (error) => {
  if (!error) return '不明なエラーが発生しました'
  
  const message = error.message || error.toString()
  
  // 一般的なエラーパターンのマッピング
  const errorPatterns = {
    'Network Error': 'ネットワークエラーが発生しました',
    'timeout': '通信がタイムアウトしました',
    'Unauthorized': '認証が必要です',
    'Forbidden': 'アクセス権限がありません',
    'Not Found': 'リソースが見つかりません',
    'Internal Server Error': 'サーバーエラーが発生しました',
    'Service Unavailable': 'サービスが利用できません'
  }
  
  for (const [pattern, userMessage] of Object.entries(errorPatterns)) {
    if (message.includes(pattern)) {
      return userMessage
    }
  }
  
  return message
}

/**
 * URLを安全にフォーマット
 * @param {string} url - URL
 * @returns {string} フォーマットされたURL
 */
export const formatUrl = (url) => {
  if (!url) return ''
  
  try {
    const urlObj = new URL(url)
    return urlObj.toString()
  } catch {
    // プロトコルが省略されている場合
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}`
    }
    return url
  }
}

/**
 * ファイル名から拡張子を除いた名前を取得
 * @param {string} filename - ファイル名
 * @returns {string} 拡張子を除いたファイル名
 */
export const getFileBaseName = (filename) => {
  if (!filename) return ''
  const lastDotIndex = filename.lastIndexOf('.')
  return lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename
}

/**
 * バイト数を読みやすい形式に変換（詳細版）
 * @param {number} bytes - バイト数
 * @param {object} options - オプション
 * @returns {object} { value: number, unit: string, formatted: string }
 */
export const formatFileSizeDetailed = (bytes, options = {}) => {
  const {
    decimals = 1,
    binary = true,
    longUnit = false
  } = options
  
  if (bytes === 0) {
    return { value: 0, unit: 'B', formatted: '0 B' }
  }
  
  const k = binary ? 1024 : 1000
  const sizes = binary 
    ? (longUnit ? ['Bytes', 'KB', 'MB', 'GB', 'TB'] : ['B', 'KB', 'MB', 'GB', 'TB'])
    : (longUnit ? ['Bytes', 'kB', 'MB', 'GB', 'TB'] : ['B', 'kB', 'MB', 'GB', 'TB'])
  
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))
  const unit = sizes[i] || sizes[sizes.length - 1]
  
  return {
    value,
    unit,
    formatted: `${value} ${unit}`
  }
}

/**
 * 進捗度を可視化
 * @param {number} current - 現在の値
 * @param {number} total - 総数
 * @returns {object} { percentage: number, formatted: string, bar: string }
 */
export const formatProgress = (current, total) => {
  if (!total || total === 0) {
    return { percentage: 0, formatted: '0%', bar: '' }
  }
  
  const percentage = Math.min(100, Math.max(0, (current / total) * 100))
  const formatted = `${Math.round(percentage)}%`
  
  // シンプルなプログレスバーの文字表現
  const barLength = 20
  const filledLength = Math.round((percentage / 100) * barLength)
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength)
  
  return { percentage, formatted, bar }
}

/**
 * カラーコードを生成（ファイル名ベース）
 * @param {string} text - テキスト
 * @returns {string} HEXカラーコード
 */
export const generateColorFromText = (text) => {
  if (!text) return '#6B7280' // デフォルトのグレー
  
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  // より見やすい色の範囲に制限
  const hue = Math.abs(hash) % 360
  const saturation = 60 + (Math.abs(hash) % 30) // 60-90%
  const lightness = 45 + (Math.abs(hash) % 15) // 45-60%
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

/**
 * ファイルタイプに応じた色を取得
 * @param {string} filename - ファイル名
 * @returns {string} 色クラス名
 */
export const getFileTypeColor = (filename) => {
  const extension = filename.split('.').pop()?.toLowerCase()
  
  const colorMap = {
    // コード
    'js': 'text-yellow-600',
    'jsx': 'text-blue-600',
    'ts': 'text-blue-700',
    'tsx': 'text-blue-700',
    'html': 'text-orange-600',
    'css': 'text-blue-500',
    'py': 'text-green-600',
    'java': 'text-red-600',
    'cpp': 'text-blue-800',
    'c': 'text-gray-700',
    
    // データ
    'json': 'text-green-700',
    'xml': 'text-purple-600',
    'csv': 'text-green-500',
    'sql': 'text-orange-700',
    
    // ドキュメント
    'md': 'text-gray-800',
    'txt': 'text-gray-600',
    'pdf': 'text-red-700',
    
    // 設定
    'ini': 'text-purple-500',
    'conf': 'text-purple-500',
    'yaml': 'text-blue-600',
    'yml': 'text-blue-600'
  }
  
  return colorMap[extension] || 'text-gray-500'
}