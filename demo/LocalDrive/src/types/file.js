/**
 * ファイル関連の型定義とデフォルトオブジェクト
 * JavaScriptプロジェクト用の型情報
 */

/**
 * ファイル情報
 * @typedef {Object} FileInfo
 * @property {string} id - ファイルID
 * @property {string} name - ファイル名
 * @property {string} path - ファイルパス
 * @property {string} type - ファイルタイプ ('file' | 'folder')
 * @property {string} extension - ファイル拡張子
 * @property {number} size - ファイルサイズ（バイト）
 * @property {string} mimeType - MIMEタイプ
 * @property {Date} createdAt - 作成日時
 * @property {Date} modifiedAt - 更新日時
 * @property {Date} [accessedAt] - アクセス日時
 * @property {boolean} isExecutable - 実行可能ファイルかどうか
 * @property {boolean} isHidden - 隠しファイルかどうか
 * @property {string} [thumbnail] - サムネイルURL
 * @property {string} [checksum] - ファイルのチェックサム
 * @property {Object} [metadata] - 追加メタデータ
 */
export const defaultFileInfo = {
  id: '',
  name: '',
  path: '',
  type: 'file',
  extension: '',
  size: 0,
  mimeType: '',
  createdAt: new Date(),
  modifiedAt: new Date(),
  accessedAt: null,
  isExecutable: false,
  isHidden: false,
  thumbnail: null,
  checksum: null,
  metadata: {}
};

/**
 * フォルダ情報
 * @typedef {Object} FolderInfo
 * @property {string} id - フォルダID
 * @property {string} name - フォルダ名
 * @property {string} path - フォルダパス
 * @property {string} type - タイプ（常に'folder'）
 * @property {Date} createdAt - 作成日時
 * @property {Date} modifiedAt - 更新日時
 * @property {number} itemCount - 含まれるアイテム数
 * @property {number} totalSize - 総サイズ（バイト）
 * @property {boolean} isHidden - 隠しフォルダかどうか
 * @property {FileInfo[]} children - 子アイテム
 * @property {Object} [metadata] - 追加メタデータ
 */
export const defaultFolderInfo = {
  id: '',
  name: '',
  path: '',
  type: 'folder',
  createdAt: new Date(),
  modifiedAt: new Date(),
  itemCount: 0,
  totalSize: 0,
  isHidden: false,
  children: [],
  metadata: {}
};

/**
 * ファイル操作リクエスト
 * @typedef {Object} FileOperationRequest
 * @property {string} action - 操作タイプ
 * @property {string} path - 対象パス
 * @property {string} [content] - ファイル内容
 * @property {string} [newPath] - 移動先パス
 * @property {string} [searchQuery] - 検索クエリ
 * @property {string} [searchType] - 検索タイプ
 * @property {Object} [options] - 追加オプション
 */
export const defaultFileOperationRequest = {
  action: '',
  path: '',
  content: null,
  newPath: null,
  searchQuery: null,
  searchType: 'both',
  options: {}
};

/**
 * ファイル操作レスポンス
 * @typedef {Object} FileOperationResponse
 * @property {boolean} success - 成功フラグ
 * @property {string} message - レスポンスメッセージ
 * @property {any} [data] - レスポンスデータ
 * @property {string} [error] - エラーメッセージ
 * @property {Date} timestamp - タイムスタンプ
 */
export const defaultFileOperationResponse = {
  success: false,
  message: '',
  data: null,
  error: null,
  timestamp: new Date()
};

/**
 * 容量情報
 * @typedef {Object} QuotaInfo
 * @property {number} used - 使用容量（バイト）
 * @property {number} total - 総容量（バイト）
 * @property {number} available - 利用可能容量（バイト）
 * @property {number} usagePercent - 使用率（％）
 * @property {number} fileCount - ファイル数
 * @property {number} maxFiles - 最大ファイル数
 * @property {number} maxFileSize - 最大ファイルサイズ
 * @property {string} userId - ユーザーID
 * @property {Date} lastCalculated - 最終計算日時
 */
export const defaultQuotaInfo = {
  used: 0,
  total: 1073741824, // 1GB
  available: 1073741824,
  usagePercent: 0,
  fileCount: 0,
  maxFiles: 10000,
  maxFileSize: 52428800, // 50MB
  userId: '',
  lastCalculated: new Date()
};

/**
 * ファイル検索結果
 * @typedef {Object} SearchResult
 * @property {string} path - ファイルパス
 * @property {string} name - ファイル名
 * @property {string} type - ファイルタイプ
 * @property {number} size - ファイルサイズ
 * @property {Date} modifiedAt - 更新日時
 * @property {string} [contentMatch] - コンテンツマッチ部分
 * @property {number} [score] - 検索スコア
 * @property {string[]} [highlights] - ハイライト箇所
 */
export const defaultSearchResult = {
  path: '',
  name: '',
  type: 'file',
  size: 0,
  modifiedAt: new Date(),
  contentMatch: null,
  score: 0,
  highlights: []
};

/**
 * ファイルアップロード情報
 * @typedef {Object} FileUploadInfo
 * @property {File} file - ファイルオブジェクト
 * @property {string} name - ファイル名
 * @property {string} path - アップロード先パス
 * @property {number} size - ファイルサイズ
 * @property {string} type - MIMEタイプ
 * @property {number} progress - アップロード進捗（0-100）
 * @property {string} status - ステータス
 * @property {string} [error] - エラーメッセージ
 * @property {Date} startedAt - アップロード開始時刻
 */
export const defaultFileUploadInfo = {
  file: null,
  name: '',
  path: '',
  size: 0,
  type: '',
  progress: 0,
  status: 'pending',
  error: null,
  startedAt: new Date()
};

/**
 * ファイル操作タイプ定数
 */
export const FILE_ACTIONS = {
  CREATE_FOLDER: 'create_folder',
  CREATE_FILE: 'create_file',
  READ_FILE: 'read_file',
  UPDATE_FILE: 'update_file',
  DELETE: 'delete',
  LIST: 'list',
  SEARCH: 'search',
  MOVE: 'move',
  COPY: 'copy',
  GET_QUOTA: 'get_quota',
  UPLOAD: 'upload',
  DOWNLOAD: 'download'
};

/**
 * ファイルタイプ定数
 */
export const FILE_TYPES = {
  FILE: 'file',
  FOLDER: 'folder',
  LINK: 'link'
};

/**
 * 検索タイプ定数
 */
export const SEARCH_TYPES = {
  FILENAME: 'filename',
  CONTENT: 'content',
  BOTH: 'both'
};

/**
 * ファイルステータス定数
 */
export const FILE_STATUS = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELLED: 'cancelled'
};

/**
 * ソート方法定数
 */
export const SORT_TYPES = {
  NAME_ASC: 'name_asc',
  NAME_DESC: 'name_desc',
  SIZE_ASC: 'size_asc',
  SIZE_DESC: 'size_desc',
  DATE_ASC: 'date_asc',
  DATE_DESC: 'date_desc',
  TYPE_ASC: 'type_asc',
  TYPE_DESC: 'type_desc'
};

/**
 * 表示モード定数
 */
export const VIEW_MODES = {
  LIST: 'list',
  GRID: 'grid',
  TILES: 'tiles'
};

/**
 * 許可されるファイル拡張子
 */
export const ALLOWED_EXTENSIONS = [
  '.txt', '.md', '.json', '.xml', '.csv', '.yaml', '.yml',
  '.js', '.ts', '.html', '.css', '.py', '.java', '.cpp', '.c',
  '.sh', '.bat', '.sql', '.log', '.ini', '.conf', '.php', '.rb',
  '.exe', '.ps1', '.scr', '.com', '.cmd', '.msi',
  '.pdf', '.docx', '.xlsx', '.pptx', '.zip', '.tar', '.gz'
];

/**
 * 実行可能ファイル拡張子
 */
export const EXECUTABLE_EXTENSIONS = [
  '.exe', '.sh', '.bat', '.ps1', '.scr', '.com', '.cmd', '.msi'
];

/**
 * ファイル関連のユーティリティ関数
 */

/**
 * ファイルサイズを人間が読みやすい形式に変換
 * @param {number} bytes - バイト数
 * @returns {string} フォーマットされたサイズ
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * ファイル拡張子を取得
 * @param {string} filename - ファイル名
 * @returns {string} 拡張子
 */
export const getFileExtension = (filename) => {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? '' : filename.substring(lastDot).toLowerCase();
};

/**
 * MIMEタイプを取得
 * @param {string} filename - ファイル名
 * @returns {string} MIMEタイプ
 */
export const getMimeType = (filename) => {
  const ext = getFileExtension(filename);
  const mimeTypes = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.zip': 'application/zip'
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

/**
 * ファイルアイコンクラスを取得
 * @param {string} filename - ファイル名
 * @param {string} type - ファイルタイプ
 * @returns {string} アイコンクラス
 */
export const getFileIconClass = (filename, type) => {
  if (type === 'folder') return 'folder';
  
  const ext = getFileExtension(filename);
  const iconMap = {
    '.txt': 'file-text',
    '.md': 'file-text',
    '.json': 'file-code',
    '.xml': 'file-code',
    '.html': 'file-code',
    '.css': 'file-code',
    '.js': 'file-code',
    '.py': 'file-code',
    '.java': 'file-code',
    '.pdf': 'file-pdf',
    '.jpg': 'file-image',
    '.jpeg': 'file-image',
    '.png': 'file-image',
    '.gif': 'file-image',
    '.zip': 'file-archive',
    '.tar': 'file-archive',
    '.gz': 'file-archive',
    '.exe': 'file-executable',
    '.sh': 'file-executable',
    '.bat': 'file-executable'
  };
  return iconMap[ext] || 'file';
};

/**
 * ファイルが実行可能かどうかを判定
 * @param {string} filename - ファイル名
 * @returns {boolean} 実行可能な場合true
 */
export const isExecutableFile = (filename) => {
  const ext = getFileExtension(filename);
  return EXECUTABLE_EXTENSIONS.includes(ext);
};

/**
 * パスを正規化
 * @param {string} path - パス
 * @returns {string} 正規化されたパス
 */
export const normalizePath = (path) => {
  if (!path || path === '/') return '';
  return path.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
};

/**
 * パスからファイル名を取得
 * @param {string} path - ファイルパス
 * @returns {string} ファイル名
 */
export const getFileName = (path) => {
  if (!path) return '';
  const segments = path.split('/');
  return segments[segments.length - 1] || '';
};

/**
 * パスから親ディレクトリを取得
 * @param {string} path - ファイルパス
 * @returns {string} 親ディレクトリパス
 */
export const getParentDirectory = (path) => {
  if (!path || path === '/') return '';
  const segments = path.split('/').filter(Boolean);
  segments.pop();
  return segments.join('/');
};

/**
 * ブレッドクラムを生成
 * @param {string} path - 現在のパス
 * @returns {Array} ブレッドクラム配列
 */
export const generateBreadcrumbs = (path) => {
  if (!path || path === '/') {
    return [{ name: 'ホーム', path: '' }];
  }
  
  const segments = path.split('/').filter(Boolean);
  const breadcrumbs = [{ name: 'ホーム', path: '' }];
  
  let currentPath = '';
  segments.forEach(segment => {
    currentPath += '/' + segment;
    breadcrumbs.push({
      name: segment,
      path: currentPath.substring(1) // 先頭の / を除去
    });
  });
  
  return breadcrumbs;
};