// アプリケーション設定
export const APP_CONFIG = {
  name: import.meta.env.VITE_APP_TITLE || 'Local Drive（デモ用）',
  version: import.meta.env.VITE_APP_VERSION || '1.2.1',
  port: import.meta.env.VITE_DEMO_PORT || 3551,
  debugMode: import.meta.env.VITE_DEBUG_MODE === 'true' || import.meta.env.DEV,
  logLevel: import.meta.env.VITE_LOG_LEVEL || 'info'
}

// API設定
export const API_CONFIG = {
  baseURL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000',
  apiBaseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000
}

// OAuth設定
export const OAUTH_CONFIG = {
  clientId: import.meta.env.VITE_OAUTH_CLIENT_ID || 'oneagent-default-client',
  redirectUri: import.meta.env.VITE_OAUTH_REDIRECT_URI || 'http://localhost:3551/oauth/callback',
  authorizeUrl: import.meta.env.VITE_OAUTH_AUTHORIZE_URL || 'http://localhost:3000/oauth/authorize',
  tokenUrl: import.meta.env.VITE_OAUTH_TOKEN_URL || 'http://localhost:3000/oauth/token',
  scopes: import.meta.env.VITE_OAUTH_SCOPES?.split(' ') || ['read', 'write']
}

// ファイル管理設定（v3.0.0拡張）
export const FILE_CONFIG = {
  maxFileSize: parseInt(import.meta.env.VITE_MAX_FILE_SIZE || '452428800'), // 450MB
  maxUserQuota: 1024 * 1024 * 1024, // 1GB
  maxFilesPerUser: 10000,
  maxFolderDepth: 15,
  
  // v3.0.0 新機能制限
  maxRecentUpdates: 100,
  maxFavorites: 200,
  
  supportedFileTypes: import.meta.env.VITE_SUPPORTED_FILE_TYPES?.split(',') || [
    '.txt', '.md', '.json', '.xml', '.csv', '.jsx', '.js', '.html', '.css',
    '.py', '.java', '.cpp', '.c', '.sh', '.bat', '.sql', '.log', '.ini', '.conf',
    '.yaml', '.yml', '.pdf', '.docx', '.xlsx', '.pptx',
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.mp3', '.wav', '.mp4', '.avi', '.mov'
  ],
  executableExtensions: ['.exe', '.sh', '.bat', '.ps1', '.scr', '.com', '.cmd', '.msi']
}

// ローカルストレージキー（v3.0.0拡張）
export const STORAGE_KEYS = {
  authToken: 'oneagent_auth_token',
  refreshToken: 'oneagent_refresh_token',
  userInfo: 'oneagent_user_info',
  uiPreferences: 'oneagent_ui_preferences',
  fileCache: 'oneagent_file_cache',
  lastPath: 'oneagent_last_path',
  
  // v3.0.0 新機能
  recentUpdates: 'oneagent_recent_updates',
  favorites: 'oneagent_favorites',
  viewMode: 'oneagent_view_mode',
  sidebarState: 'oneagent_sidebar_state'
}

// ファイルタイプとアイコンのマッピング（v3.0.0拡張）
export const FILE_TYPE_ICONS = {
  // テキストファイル
  '.txt': 'FileText',
  '.md': 'FileText',
  '.log': 'FileText',
  
  // コードファイル
  '.js': 'FileCode',
  '.jsx': 'FileCode',
  '.ts': 'FileCode',
  '.tsx': 'FileCode',
  '.html': 'FileCode',
  '.css': 'FileCode',
  '.py': 'FileCode',
  '.java': 'FileCode',
  '.cpp': 'FileCode',
  '.c': 'FileCode',
  '.php': 'FileCode',
  '.rb': 'FileCode',
  
  // データファイル
  '.json': 'Database',
  '.xml': 'Database',
  '.csv': 'Database',
  '.sql': 'Database',
  '.yaml': 'Database',
  '.yml': 'Database',
  
  // 設定ファイル
  '.ini': 'Settings',
  '.conf': 'Settings',
  '.config': 'Settings',
  '.env': 'Settings',
  
  // 実行可能ファイル
  '.exe': 'Zap',
  '.sh': 'Terminal',
  '.bat': 'Terminal',
  '.ps1': 'Terminal',
  '.cmd': 'Terminal',
  
  // アーカイブ
  '.zip': 'Archive',
  '.tar': 'Archive',
  '.gz': 'Archive',
  '.rar': 'Archive',
  '.7z': 'Archive',
  
  // ドキュメント
  '.pdf': 'FileText',
  '.docx': 'FileText',
  '.xlsx': 'FileSpreadsheet',
  '.pptx': 'Presentation',
  
  // 画像
  '.jpg': 'Image',
  '.jpeg': 'Image',
  '.png': 'Image',
  '.gif': 'Image',
  '.svg': 'Image',
  '.bmp': 'Image',
  '.webp': 'Image',
  
  // 音声・動画
  '.mp3': 'Music',
  '.wav': 'Music',
  '.mp4': 'Video',
  '.avi': 'Video',
  '.mov': 'Video',
  
  // デフォルト
  default: 'File'
}

// ファイルサイズ単位
export const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

// UI設定（v3.0.0拡張）
export const UI_CONFIG = {
  // ページネーション
  defaultPageSize: 50,
  pageSizeOptions: [25, 50, 100, 200],
  
  // グリッドとリスト表示
  defaultViewMode: 'list', // 'grid' or 'list'
  gridItemsPerRow: {
    sm: 2,
    md: 3,
    lg: 4,
    xl: 5,
    '2xl': 6
  },
  
  // 自動更新間隔（秒）
  autoRefreshInterval: 30,
  
  // アニメーション設定
  animationDuration: 200,
  
  // モバイル対応
  mobileBreakpoint: 768,
  
  // サイドバー
  sidebarWidth: 256,
  sidebarCollapsedWidth: 64,
  
  // ヘッダー
  headerHeight: 64,
  
  // フッター
  footerHeight: 48,
  
  // v3.0.0 新UI設定
  quickNavMaxItems: 10,
  recentPreviewItems: 5,
  favoritesPreviewItems: 5,
  notificationMaxItems: 50
}

// エラーメッセージ（v3.0.0拡張）
export const ERROR_MESSAGES = {
  // 認証エラー
  AUTH_REQUIRED: 'ログインが必要です',
  AUTH_EXPIRED: 'セッションが期限切れです。再度ログインしてください',
  AUTH_INVALID: '認証情報が無効です',
  
  // ファイル操作エラー
  FILE_NOT_FOUND: 'ファイルが見つかりません',
  FILE_TOO_LARGE: 'ファイルサイズが上限を超えています',
  FILE_TYPE_NOT_SUPPORTED: 'サポートされていないファイル形式です',
  FOLDER_NOT_EMPTY: 'フォルダが空ではありません',
  INVALID_FILE_NAME: '無効なファイル名です',
  QUOTA_EXCEEDED: '容量制限を超えています',
  
  // v3.0.0 新機能エラー
  FAVORITES_LIMIT_EXCEEDED: 'お気に入りの上限（200件）を超えています',
  RECENT_UPDATES_ERROR: '最近の更新の取得に失敗しました',
  TRASH_OPERATION_ERROR: 'ゴミ箱操作に失敗しました',
  RESTORE_ERROR: 'ファイルの復元に失敗しました',
  
  // ネットワークエラー
  NETWORK_ERROR: 'ネットワークエラーが発生しました',
  SERVER_ERROR: 'サーバーエラーが発生しました',
  TIMEOUT_ERROR: '通信がタイムアウトしました',
  
  // 一般的なエラー
  UNKNOWN_ERROR: '不明なエラーが発生しました',
  OPERATION_FAILED: '操作に失敗しました'
}

// 成功メッセージ（v3.0.0拡張）
export const SUCCESS_MESSAGES = {
  // 基本操作
  FILE_UPLOADED: 'ファイルがアップロードされました',
  FILE_DELETED: 'ファイルが削除されました',
  FILE_RENAMED: 'ファイル名が変更されました',
  FILE_MOVED: 'ファイルが移動されました',
  FILE_COPIED: 'ファイルがコピーされました',
  FOLDER_CREATED: 'フォルダが作成されました',
  FOLDER_DELETED: 'フォルダが削除されました',
  
  // v3.0.0 新機能
  ADDED_TO_FAVORITES: 'お気に入りに追加されました',
  REMOVED_FROM_FAVORITES: 'お気に入りから削除されました',
  MOVED_TO_TRASH: 'ゴミ箱に移動されました',
  RESTORED_FROM_TRASH: 'ゴミ箱から復元されました',
  TRASH_EMPTIED: 'ゴミ箱を空にしました',
  FILE_PERMANENTLY_DELETED: 'ファイルを完全に削除しました',
  
  OPERATION_SUCCESS: '操作が完了しました'
}

// ルート定義（v3.0.0拡張）
export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/',
  FILES: '/files',
  SETTINGS: '/settings',
  AUTH_CALLBACK: '/oauth/callback',
  NOT_FOUND: '/404'
}

// 特別なパス定義（v3.0.0新規）
export const SPECIAL_PATHS = {
  DOCUMENTS: 'documents',
  RECENT: 'recent',
  FAVORITES: 'favorites',
  TRASH: 'trash',
  SETTINGS: 'settings'
}

// ★ ツール名（変更なし）
export const TOOL_NAME = 'LocalDrive'

// API エンドポイント
export const API_ENDPOINTS = {
  TOOLS_EXECUTE: '/tools/execute',
  OAUTH_AUTHORIZE: '/oauth/authorize',
  OAUTH_TOKEN: '/oauth/token',
  OAUTH_REFRESH: '/oauth/refresh',
  HEALTH: '/health',
  TOOLS: '/tools'
}

// キーボードショートカット（v3.0.0拡張）
export const KEYBOARD_SHORTCUTS = {
  // 基本操作
  NEW_FILE: 'ctrl+alt+n',
  NEW_FOLDER: 'ctrl+shift+n',
  DELETE: 'delete',
  RENAME: 'f2',
  COPY: 'ctrl+c',
  CUT: 'ctrl+x',
  PASTE: 'ctrl+v',
  SELECT_ALL: 'ctrl+a',
  SEARCH: 'ctrl+f',
  REFRESH: 'f5',
  
  // v3.0.0 新機能
  NAVIGATE_DOCUMENTS: 'ctrl+1',
  NAVIGATE_RECENT: 'ctrl+2',
  NAVIGATE_FAVORITES: 'ctrl+3',
  NAVIGATE_TRASH: 'ctrl+4',
  TOGGLE_FAVORITES: 'ctrl+d',
  EMPTY_TRASH: 'ctrl+shift+delete'
}

// パフォーマンス設定（v3.0.0拡張）
export const PERFORMANCE_CONFIG = {
  // 仮想化設定
  virtualListThreshold: 100,
  virtualListItemHeight: 60,
  
  // キャッシュ設定
  cacheSize: 50,
  cacheExpiry: 5 * 60 * 1000, // 5分
  
  // デバウンス設定
  searchDebounceTime: 300,
  resizeDebounceTime: 250,
  
  // レンダリング最適化
  maxRenderItems: 1000,
  
  // v3.0.0 新機能
  recentUpdatesRefreshInterval: 30000, // 30秒
  favoritesValidationInterval: 60000, // 1分
  trashCleanupInterval: 24 * 60 * 60 * 1000 // 24時間
}

// デバッグ用
export const DEBUG_CONFIG = {
  enableConsoleLogging: APP_CONFIG.debugMode,
  enablePerformanceLogging: APP_CONFIG.debugMode,
  enableAPILogging: APP_CONFIG.debugMode,
  logLevel: APP_CONFIG.logLevel
}

// 開発用のデフォルトユーザー
export const DEV_USERS = {
  admin: { username: 'admin', password: 'admin123' },
  demo: { username: 'demo', password: 'demo123' }
}

// ツール関連設定（v3.0.0拡張）
export const TOOL_CONFIG = {
  // メインツール名
  SECURE_FILE_MANAGER: TOOL_NAME,
  
  // ツール実行設定
  DEFAULT_TIMEOUT: 30000,
  MAX_RETRIES: 3,
  
  // 基本ファイル操作アクション
  FILE_ACTIONS: {
    CREATE_FILE: 'create_file',
    READ_FILE: 'read_file',
    UPDATE_FILE: 'update_file',
    DELETE: 'delete',
    LIST: 'list',
    SEARCH: 'search',
    GET_QUOTA: 'get_quota',
    CREATE_FOLDER: 'create_folder',
    MOVE: 'move',
    COPY: 'copy'
  },
  
  // v3.0.0 新機能アクション
  NEW_ACTIONS: {
    GET_RECENT_UPDATES: 'get_recent_updates',
    ADD_TO_FAVORITES: 'add_to_favorites',
    REMOVE_FROM_FAVORITES: 'remove_from_favorites',
    GET_FAVORITES: 'get_favorites',
    MOVE_TO_TRASH: 'move_to_trash', // deleteと同じ
    RESTORE_FROM_TRASH: 'restore_from_trash',
    LIST_TRASH: 'list_trash',
    EMPTY_TRASH: 'empty_trash',
    PERMANENTLY_DELETE: 'permanently_delete'
  },
  
  // レスポンス期待パターン
  SUCCESS_PATTERNS: [
    'ユーザー',
    'User',
    '容量',
    'quota',
    'ファイル',
    'file',
    '完了',
    '成功',
    'お気に入り',
    'favorites',
    '最近',
    'recent',
    'ゴミ箱',
    'trash'
  ],
  
  // エラーパターン
  ERROR_PATTERNS: [
    'エラー',
    'error',
    'failed',
    '失敗',
    'not found',
    '見つかりません',
    '上限',
    'limit',
    '権限',
    'permission'
  ]
}

// 通知設定（v3.0.0新規）
export const NOTIFICATION_CONFIG = {
  DEFAULT_DURATION: 5000,
  SUCCESS_DURATION: 3000,
  ERROR_DURATION: 8000,
  WARNING_DURATION: 6000,
  INFO_DURATION: 5000,
  
  MAX_NOTIFICATIONS: 5,
  POSITION: 'top-right',
  
  TYPES: {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
  }
}

// 操作タイプ定義（v3.0.0新規）
export const OPERATION_TYPES = {
  // 基本操作
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  MOVE: 'move',
  COPY: 'copy',
  
  // v3.0.0 新機能
  FAVORITE: 'favorite',
  UNFAVORITE: 'unfavorite',
  RESTORE: 'restore',
  EMPTY_TRASH: 'empty_trash',
  PERMANENTLY_DELETE: 'permanently_delete'
}

// ファイルの状態定義（v3.0.0新規）
export const FILE_STATES = {
  NORMAL: 'normal',
  FAVORITE: 'favorite',
  RECENT: 'recent',
  DELETED: 'deleted',
  MODIFIED: 'modified'
}

// メタデータキー（v3.0.0新規）
export const METADATA_KEYS = {
  DELETED_DATE: 'deletedDate',
  ORIGINAL_PATH: 'originalPath',
  FAVORITE_DATE: 'favoriteDate',
  LAST_ACCESS: 'lastAccess',
  ACTION_TYPE: 'action'
}