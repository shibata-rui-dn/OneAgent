import { FILE_SIZE_UNITS, FILE_TYPE_ICONS, FILE_CONFIG, SPECIAL_PATHS, METADATA_KEYS } from './constants.js'

/**
 * ファイルサイズを人間が読みやすい形式に変換
 * @param {number} bytes - バイト数
 * @param {number} decimals - 小数点以下の桁数
 * @returns {string} フォーマットされたファイルサイズ
 */
export const formatFileSize = (bytes, decimals = 1) => {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + FILE_SIZE_UNITS[i]
}

/**
 * ファイル拡張子を取得
 * @param {string} filename - ファイル名
 * @returns {string} 拡張子（ドット付き）
 */
export const getFileExtension = (filename) => {
  if (!filename) return ''
  const lastDotIndex = filename.lastIndexOf('.')
  return lastDotIndex > 0 ? filename.substring(lastDotIndex).toLowerCase() : ''
}

/**
 * ファイルタイプに対応するアイコン名を取得
 * @param {string} filename - ファイル名
 * @returns {string} アイコン名
 */
export const getFileIcon = (filename) => {
  const extension = getFileExtension(filename)
  return FILE_TYPE_ICONS[extension] || FILE_TYPE_ICONS.default
}

/**
 * ファイル名がディレクトリかどうかを判定
 * @param {string} filename - ファイル名
 * @returns {boolean} ディレクトリの場合true
 */
export const isDirectory = (filename) => {
  return filename.endsWith('/')
}

/**
 * ファイルが実行可能かどうかを判定
 * @param {string} filename - ファイル名
 * @returns {boolean} 実行可能ファイルの場合true
 */
export const isExecutableFile = (filename) => {
  const extension = getFileExtension(filename)
  return FILE_CONFIG.executableExtensions.includes(extension)
}

/**
 * ファイル名の検証（v3.0.0対応）
 * @param {string} filename - ファイル名
 * @param {string} currentPath - 現在のパス
 * @returns {object} { valid: boolean, error?: string }
 */
export const validateFileName = (filename, currentPath = '') => {
  if (!filename) {
    return { valid: false, error: 'ファイル名が必要です' }
  }
  
  if (filename.length > 255) {
    return { valid: false, error: 'ファイル名が長すぎます（255文字以内）' }
  }
  
  // 無効な文字をチェック
  const invalidChars = /[<>:"/\\|?*\x00-\x1f]/
  if (invalidChars.test(filename)) {
    return { valid: false, error: '無効な文字が含まれています' }
  }
  
  // 予約語をチェック（Windows）
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']
  const nameWithoutExt = filename.split('.')[0].toUpperCase()
  if (reservedNames.includes(nameWithoutExt)) {
    return { valid: false, error: '予約された名前は使用できません' }
  }

  // 特別なパスでの制限
  if (isSpecialPath(currentPath)) {
    return { valid: false, error: `${currentPath}では新しいファイルを作成できません` }
  }
  
  return { valid: true }
}

/**
 * ファイルパスの検証（v3.0.0対応）
 * @param {string} path - ファイルパス
 * @returns {object} { valid: boolean, error?: string }
 */
export const validateFilePath = (path) => {
  if (!path) {
    return { valid: false, error: 'パスが必要です' }
  }
  
  // パストラバーサル攻撃の防止
  if (path.includes('..') || path.startsWith('/')) {
    return { valid: false, error: '不正なパスです' }
  }
  
  // 最大パス長をチェック
  if (path.length > 1000) {
    return { valid: false, error: 'パスが長すぎます' }
  }
  
  // フォルダの深さをチェック
  const depth = path.split('/').length - 1
  if (depth > FILE_CONFIG.maxFolderDepth) {
    return { valid: false, error: `フォルダの階層が深すぎます（最大${FILE_CONFIG.maxFolderDepth}階層）` }
  }
  
  return { valid: true }
}

/**
 * ファイルサイズの検証
 * @param {number} size - ファイルサイズ（バイト）
 * @returns {object} { valid: boolean, error?: string }
 */
export const validateFileSize = (size) => {
  if (size > FILE_CONFIG.maxFileSize) {
    const maxSizeMB = (FILE_CONFIG.maxFileSize / 1024 / 1024).toFixed(1)
    const actualSizeMB = (size / 1024 / 1024).toFixed(1)
    return { 
      valid: false, 
      error: `ファイルサイズが上限を超えています（${actualSizeMB}MB > ${maxSizeMB}MB）` 
    }
  }
  
  return { valid: true }
}

/**
 * ファイル拡張子の検証
 * @param {string} filename - ファイル名
 * @returns {object} { valid: boolean, error?: string }
 */
export const validateFileExtension = (filename) => {
  const extension = getFileExtension(filename)
  
  if (extension && !FILE_CONFIG.supportedFileTypes.includes(extension)) {
    return { 
      valid: false, 
      error: `サポートされていないファイル形式です: ${extension}` 
    }
  }
  
  return { valid: true }
}

/**
 * パスからディレクトリ部分を取得
 * @param {string} path - ファイルパス
 * @returns {string} ディレクトリパス
 */
export const getDirectoryPath = (path) => {
  if (!path) return ''
  const lastSlashIndex = path.lastIndexOf('/')
  return lastSlashIndex > 0 ? path.substring(0, lastSlashIndex) : ''
}

/**
 * パスからファイル名部分を取得
 * @param {string} path - ファイルパス
 * @returns {string} ファイル名
 */
export const getFileName = (path) => {
  if (!path) return ''
  const lastSlashIndex = path.lastIndexOf('/')
  return lastSlashIndex >= 0 ? path.substring(lastSlashIndex + 1) : path
}

/**
 * パスを正規化（v3.0.0対応）
 * @param {string} path - ファイルパス
 * @returns {string} 正規化されたパス
 */
export const normalizePath = (path) => {
  if (!path) return ''
  
  // 特別なパスの処理
  if (isSpecialPath(path)) {
    return path
  }
  
  // documentsプレフィックスの処理
  if (path.startsWith('documents/')) {
    path = path.substring(10)
  } else if (path === 'documents') {
    return ''
  }
  
  // 連続するスラッシュを単一に
  path = path.replace(/\/+/g, '/')
  
  // 先頭と末尾のスラッシュを削除
  path = path.replace(/^\/+|\/+$/g, '')
  
  return path
}

/**
 * パスを結合（v3.0.0対応）
 * @param {...string} paths - 結合するパス
 * @returns {string} 結合されたパス
 */
export const joinPaths = (...paths) => {
  const validPaths = paths.filter(Boolean)
  if (validPaths.length === 0) return ''
  
  const joined = validPaths.join('/')
  return normalizePath(joined)
}

/**
 * 特別なパスかどうかを判定（v3.0.0新規）
 * @param {string} path - パス
 * @returns {boolean} 特別なパスの場合true
 */
export const isSpecialPath = (path) => {
  return Object.values(SPECIAL_PATHS).includes(path)
}

/**
 * documentsパスに変換（v3.0.0新規）
 * @param {string} path - パス
 * @returns {string} documentsプレフィックス付きパス
 */
export const toDocumentsPath = (path) => {
  if (!path || path === 'documents') return 'documents'
  if (path.startsWith('documents/')) return path
  if (isSpecialPath(path)) return path
  return `documents/${path}`
}

/**
 * ファイルリストを名前でソート（v3.0.0対応）
 * @param {Array} files - ファイルリスト
 * @param {string} direction - ソート方向 ('asc' or 'desc')
 * @param {string} currentPath - 現在のパス
 * @returns {Array} ソートされたファイルリスト
 */
export const sortFilesByName = (files, direction = 'asc', currentPath = '') => {
  return [...files].sort((a, b) => {
    const aName = a.name.toLowerCase()
    const bName = b.name.toLowerCase()
    
    // 特別なパス以外ではディレクトリを優先
    if (currentPath !== SPECIAL_PATHS.TRASH && currentPath !== SPECIAL_PATHS.RECENT) {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
    }
    
    const comparison = aName.localeCompare(bName, 'ja')
    return direction === 'asc' ? comparison : -comparison
  })
}

/**
 * ファイルリストをサイズでソート
 * @param {Array} files - ファイルリスト
 * @param {string} direction - ソート方向 ('asc' or 'desc')
 * @param {string} currentPath - 現在のパス
 * @returns {Array} ソートされたファイルリスト
 */
export const sortFilesBySize = (files, direction = 'asc', currentPath = '') => {
  return [...files].sort((a, b) => {
    // 特別なパス以外ではディレクトリを優先
    if (currentPath !== SPECIAL_PATHS.TRASH && currentPath !== SPECIAL_PATHS.RECENT) {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
    }
    
    const comparison = (a.size || 0) - (b.size || 0)
    return direction === 'asc' ? comparison : -comparison
  })
}

/**
 * ファイルリストを更新日時でソート（v3.0.0対応）
 * @param {Array} files - ファイルリスト
 * @param {string} direction - ソート方向 ('asc' or 'desc')
 * @param {string} currentPath - 現在のパス
 * @returns {Array} ソートされたファイルリスト
 */
export const sortFilesByDate = (files, direction = 'asc', currentPath = '') => {
  return [...files].sort((a, b) => {
    // 特別なパス以外ではディレクトリを優先
    if (currentPath !== SPECIAL_PATHS.TRASH && currentPath !== SPECIAL_PATHS.RECENT) {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
    }
    
    // ゴミ箱では削除日時を使用
    const dateField = currentPath === SPECIAL_PATHS.TRASH ? METADATA_KEYS.DELETED_DATE : 'modifiedDate'
    const aDate = new Date(a[dateField] || 0)
    const bDate = new Date(b[dateField] || 0)
    const comparison = aDate.getTime() - bDate.getTime()
    return direction === 'asc' ? comparison : -comparison
  })
}

/**
 * ファイルリストをフィルタリング（v3.0.0対応）
 * @param {Array} files - ファイルリスト
 * @param {string} searchTerm - 検索語
 * @param {string} currentPath - 現在のパス
 * @returns {Array} フィルタされたファイルリスト
 */
export const filterFiles = (files, searchTerm, currentPath = '') => {
  if (!searchTerm) return files
  
  const term = searchTerm.toLowerCase()
  return files.filter(file => {
    // 基本的な名前検索
    if (file.name.toLowerCase().includes(term)) return true
    
    // 特別なパスでの追加検索
    if (currentPath === SPECIAL_PATHS.RECENT && file.action) {
      return file.action.toLowerCase().includes(term)
    }
    
    if (currentPath === SPECIAL_PATHS.TRASH && file.originalPath) {
      return file.originalPath.toLowerCase().includes(term)
    }
    
    return false
  })
}

/**
 * ファイルのMIMEタイプを推測
 * @param {string} filename - ファイル名
 * @returns {string} MIMEタイプ
 */
export const getMimeType = (filename) => {
  const extension = getFileExtension(filename)
  
  const mimeTypes = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.jsx': 'application/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo'
  }
  
  return mimeTypes[extension] || 'application/octet-stream'
}

/**
 * ファイルがテキストファイルかどうかを判定
 * @param {string} filename - ファイル名
 * @returns {boolean} テキストファイルの場合true
 */
export const isTextFile = (filename) => {
  const textExtensions = ['.txt', '.md', '.json', '.xml', '.csv', '.html', '.css', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.sh', '.bat', '.sql', '.log', '.ini', '.conf', '.yaml', '.yml']
  const extension = getFileExtension(filename)
  return textExtensions.includes(extension)
}

/**
 * ファイルが画像ファイルかどうかを判定
 * @param {string} filename - ファイル名
 * @returns {boolean} 画像ファイルの場合true
 */
export const isImageFile = (filename) => {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp']
  const extension = getFileExtension(filename)
  return imageExtensions.includes(extension)
}

/**
 * ファイルが音声ファイルかどうかを判定（v3.0.0新規）
 * @param {string} filename - ファイル名
 * @returns {boolean} 音声ファイルの場合true
 */
export const isAudioFile = (filename) => {
  const audioExtensions = ['.mp3', '.wav', '.aac', '.ogg', '.flac', '.m4a']
  const extension = getFileExtension(filename)
  return audioExtensions.includes(extension)
}

/**
 * ファイルが動画ファイルかどうかを判定（v3.0.0新規）
 * @param {string} filename - ファイル名
 * @returns {boolean} 動画ファイルの場合true
 */
export const isVideoFile = (filename) => {
  const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv']
  const extension = getFileExtension(filename)
  return videoExtensions.includes(extension)
}

/**
 * ブラウザでプレビュー可能なファイルかどうかを判定（v3.0.0拡張）
 * @param {string} filename - ファイル名
 * @returns {boolean} プレビュー可能な場合true
 */
export const isPreviewableFile = (filename) => {
  return isTextFile(filename) || isImageFile(filename) || isAudioFile(filename) || isVideoFile(filename)
}

/**
 * ファイルダウンロード用のBlobを作成
 * @param {string} content - ファイル内容
 * @param {string} filename - ファイル名
 * @returns {Blob} Blobオブジェクト
 */
export const createDownloadBlob = (content, filename) => {
  const mimeType = getMimeType(filename)
  return new Blob([content], { type: mimeType })
}

/**
 * ファイルをダウンロード
 * @param {string} content - ファイル内容
 * @param {string} filename - ファイル名
 */
export const downloadFile = (content, filename) => {
  const blob = createDownloadBlob(content, filename)
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  URL.revokeObjectURL(url)
}

/**
 * ファイルメタデータを生成（v3.0.0新規）
 * @param {object} file - ファイル情報
 * @param {string} action - アクション
 * @param {object} additionalData - 追加データ
 * @returns {object} メタデータ
 */
export const createFileMetadata = (file, action, additionalData = {}) => {
  const metadata = {
    name: file.name,
    path: file.path,
    size: file.size,
    isDirectory: file.isDirectory,
    modifiedDate: file.modifiedDate,
    action,
    timestamp: new Date().toISOString(),
    ...additionalData
  }
  
  // 特定のアクションに応じたメタデータを追加
  switch (action) {
    case 'delete':
      metadata[METADATA_KEYS.DELETED_DATE] = new Date().toISOString()
      metadata[METADATA_KEYS.ORIGINAL_PATH] = file.path
      break
    case 'favorite':
      metadata[METADATA_KEYS.FAVORITE_DATE] = new Date().toISOString()
      metadata.inFavorites = true
      break
    case 'access':
      metadata[METADATA_KEYS.LAST_ACCESS] = new Date().toISOString()
      break
  }
  
  return metadata
}

/**
 * ファイルのお気に入り状態をチェック（v3.0.0新規）
 * @param {object} file - ファイル情報
 * @param {Array} favorites - お気に入りリスト
 * @returns {boolean} お気に入りの場合true
 */
export const isFavoriteFile = (file, favorites) => {
  if (!Array.isArray(favorites)) return false
  return favorites.some(fav => fav.path === file.path)
}

/**
 * 最近の更新リストに追加（v3.0.0新規）
 * @param {Array} recentList - 現在のリスト
 * @param {object} file - ファイル情報
 * @param {string} action - アクション
 * @param {number} maxItems - 最大保持数
 * @returns {Array} 更新されたリスト
 */
export const addToRecentUpdates = (recentList, file, action, maxItems = FILE_CONFIG.maxRecentUpdates) => {
  const safeList = Array.isArray(recentList) ? recentList : []
  
  // 既存のエントリを削除
  const filtered = safeList.filter(item => item.path !== file.path)
  
  // 新しいエントリを先頭に追加
  const newEntry = {
    ...file,
    action,
    modifiedDate: new Date().toISOString()
  }
  
  const updated = [newEntry, ...filtered]
  
  // 最大数を超えた場合は古いものを削除
  return updated.slice(0, maxItems)
}

/**
 * ファイルパスの深度を取得（v3.0.0新規）
 * @param {string} path - パス
 * @returns {number} 深度
 */
export const getPathDepth = (path) => {
  if (!path || isSpecialPath(path)) return 0
  const normalizedPath = normalizePath(path)
  return normalizedPath ? normalizedPath.split('/').length : 0
}

/**
 * 安全なファイル名を生成（v3.0.0新規）
 * @param {string} filename - 元のファイル名
 * @returns {string} 安全なファイル名
 */
export const sanitizeFileName = (filename) => {
  if (!filename) return 'untitled'
  
  // 無効な文字を置換
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '') // 先頭のドットを削除
    .substring(0, 255) // 長さ制限
}

/**
 * ファイル名の重複を解決（v3.0.0新規）
 * @param {string} filename - ファイル名
 * @param {Array} existingFiles - 既存ファイルリスト
 * @returns {string} 重複しないファイル名
 */
export const resolveFileNameConflict = (filename, existingFiles) => {
  if (!Array.isArray(existingFiles)) return filename
  
  const existingNames = existingFiles.map(f => f.name.toLowerCase())
  
  if (!existingNames.includes(filename.toLowerCase())) {
    return filename
  }
  
  const extension = getFileExtension(filename)
  const baseName = extension 
    ? filename.substring(0, filename.length - extension.length)
    : filename
  
  let counter = 1
  let newName
  
  do {
    newName = extension 
      ? `${baseName} (${counter})${extension}`
      : `${baseName} (${counter})`
    counter++
  } while (existingNames.includes(newName.toLowerCase()) && counter < 1000)
  
  return newName
}