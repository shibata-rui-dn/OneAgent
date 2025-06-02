import fs from 'fs/promises';
import { existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// セキュリティ設定
const CONFIG = {
  BASE_DIR: path.join(__dirname, '../../secure_user_files'),
  MAX_FILE_SIZE: 450 * 1024 * 1024, // 450MB per file
  MAX_USER_QUOTA: 1024 * 1024 * 1024, // 1GB per user
  MAX_FILES_PER_USER: 10000,
  MAX_FOLDER_DEPTH: 15,
  EXECUTABLE_EXTENSIONS: ['.exe', '.sh', '.bat', '.ps1', '.scr', '.com', '.cmd', '.msi'],
  TEXT_EXTENSIONS: [
    '.txt', '.md', '.json', '.xml', '.csv', '.yaml', '.yml',
    '.js', '.ts', '.html', '.css', '.py', '.java', '.cpp', '.c',
    '.sh', '.bat', '.sql', '.log', '.ini', '.conf', '.php', '.rb',
    '.ps1', '.cmd'
  ],
  // 新しい設定
  DOCUMENTS_FOLDER: 'documents',
  TRASH_FOLDER: 'trash',
  RECENT_UPDATES_FILE: '.recent_updates.json',
  FAVORITES_FILE: '.favorites.json',
  MAX_RECENT_UPDATES: 100,
  MAX_FAVORITES: 200
};

export default async function secureUserFileManager(args, context) {
  const { action, path: userPath, content, newPath, searchQuery, searchType = 'both', limit = 20 } = args;
  
  if (!action || typeof action !== 'string') {
    throw new Error("actionは必須の文字列です");
  }

  try {
    const user = await authenticateUser(context);
    await ensureBaseDirectory();
    const userDir = await ensureUserDirectory(user.id);
    
    let result;
    switch (action) {
      // 基本ファイル操作（documentsフォルダ内）
      case 'create_folder':
        result = await createFolder(userDir, userPath, user);
        break;
      case 'create_file':
        result = await createFile(userDir, userPath, content, user);
        break;
      case 'read_file':
        result = await readFile(userDir, userPath, user);
        break;
      case 'update_file':
        result = await updateFile(userDir, userPath, content, user);
        break;
      case 'delete':
        result = await moveToTrash(userDir, userPath, user);
        break;
      case 'list':
        result = await listDirectory(userDir, userPath, user);
        break;
      case 'search':
        result = await searchFiles(userDir, searchQuery, searchType, user);
        break;
      case 'move':
        result = await moveItem(userDir, userPath, newPath, user);
        break;
      case 'copy':
        result = await copyItem(userDir, userPath, newPath, user);
        break;
      case 'get_quota':
        result = await getQuotaInfo(userDir, user);
        break;
      
      // 新機能
      case 'get_recent_updates':
        result = await getRecentUpdates(userDir, user, limit);
        break;
      case 'add_to_favorites':
        result = await addToFavorites(userDir, userPath, user);
        break;
      case 'remove_from_favorites':
        result = await removeFromFavorites(userDir, userPath, user);
        break;
      case 'get_favorites':
        result = await getFavorites(userDir, user);
        break;
      case 'move_to_trash':
        result = await moveToTrash(userDir, userPath, user);
        break;
      case 'restore_from_trash':
        result = await restoreFromTrash(userDir, userPath, user);
        break;
      case 'list_trash':
        result = await listTrash(userDir, user);
        break;
      case 'empty_trash':
        result = await emptyTrash(userDir, user);
        break;
      case 'permanently_delete':
        result = await permanentlyDelete(userDir, userPath, user);
        break;
      
      default:
        throw new Error(`未対応のアクション: ${action}`);
    }
    
    await logUserAction(user, action, userPath, 'success');
    
    return {
      content: [
        {
          type: "text",
          text: `✅ ${action} 操作完了 (ユーザー: ${user.name})\n\n${result}`
        }
      ]
    };
    
  } catch (error) {
    if (context && context.user) {
      await logUserAction(context.user, action, userPath, 'error', error.message);
    }
    throw new Error(`セキュアファイル管理エラー: ${error.message}`);
  }
}

async function authenticateUser(context) {
  if (!context) {
    throw new Error("認証コンテキストがありません");
  }
  if (!context.user) {
    throw new Error("認証が必要です。ログインしてください。");
  }
  
  const userScopes = context.scopes || [];
  const requiredScopes = ['read', 'write'];
  const hasRequiredScope = requiredScopes.some(scope => userScopes.includes(scope) || userScopes.includes('admin'));

  if (!hasRequiredScope) {
    throw new Error(`必要な権限がありません。必要なスコープ: ${requiredScopes.join(', ')}`);
  }

  return {
    id: context.user.id,
    name: context.user.username || context.user.id,
    email: context.user.email,
    scopes: userScopes
  };
}

async function ensureBaseDirectory() {
  if (!existsSync(CONFIG.BASE_DIR)) {
    await fs.mkdir(CONFIG.BASE_DIR, { recursive: true });
  }
}

async function ensureUserDirectory(userId) {
  const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (sanitizedUserId !== userId) {
    throw new Error("不正なユーザーIDです");
  }
  
  const userDir = path.join(CONFIG.BASE_DIR, sanitizedUserId);
  if (!existsSync(userDir)) {
    await fs.mkdir(userDir, { recursive: true });
    
    // documentsフォルダ作成
    const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
    await fs.mkdir(documentsDir, { recursive: true });
    
    // trashフォルダ作成
    const trashDir = path.join(userDir, CONFIG.TRASH_FOLDER);
    await fs.mkdir(trashDir, { recursive: true });
    
    // メタデータファイル初期化
    await initializeMetadataFiles(userDir);
    
    const welcomeContent = `# ${userId}さんのファイル領域へようこそ！

このディレクトリはあなた専用の1GBの領域です。

## 利用可能な機能:

### ①ファイル管理サービス
- ファイル・フォルダの作成、編集、移動、コピー
- 最大50MBまでのファイルアップロード
- 最大10,000ファイルまで保存可能
- テキストファイル・バイナリファイル両方に対応

### ②最近の更新
- 最近更新されたファイルの履歴を自動記録
- 最大100件の更新履歴を保持
- タイムスタンプ付きで表示

### ③お気に入り
- 重要なファイル・フォルダをお気に入りに登録
- 最大200件のお気に入りを保存可能
- 素早いアクセスが可能

### ④ゴミ箱
- 削除したファイル・フォルダを安全に一時保存
- ゴミ箱からの復元が可能
- 完全削除またはゴミ箱を空にする操作も可能

## ファイル拡張子:
- **完全に自由**: .txt, .jpg, .mp4, .exe, .custom など任意の拡張子を使用可能
- **必須条件**: ファイル作成時は必ず拡張子を付けてください

## セキュリティ:
- OAuth認証による安全なアクセス
- 他のユーザーのファイルには一切アクセスできません
- 全ての操作がログに記録されます

作成日時: ${new Date().toISOString()}
`;
    
    await fs.writeFile(path.join(userDir, 'README.md'), welcomeContent, 'utf8');
    
    // documentsフォルダにもサンプルファイル作成
    const sampleContent = `# サンプルドキュメント

これはサンプルファイルです。

## 新機能の使い方

### お気に入りに追加
このファイルをお気に入りに追加するには:
\`\`\`
{
  "action": "add_to_favorites",
  "path": "sample.md"
}
\`\`\`

### 最近の更新を確認
最近更新されたファイルを確認するには:
\`\`\`
{
  "action": "get_recent_updates",
  "limit": 10
}
\`\`\`

作成日時: ${new Date().toISOString()}
`;
    
    await fs.writeFile(path.join(documentsDir, 'sample.md'), sampleContent, 'utf8');
  }
  return userDir;
}

async function initializeMetadataFiles(userDir) {
  // 最近の更新履歴ファイル初期化
  const recentUpdatesFile = path.join(userDir, CONFIG.RECENT_UPDATES_FILE);
  if (!existsSync(recentUpdatesFile)) {
    await fs.writeFile(recentUpdatesFile, JSON.stringify([], null, 2), 'utf8');
  }
  
  // お気に入りファイル初期化
  const favoritesFile = path.join(userDir, CONFIG.FAVORITES_FILE);
  if (!existsSync(favoritesFile)) {
    await fs.writeFile(favoritesFile, JSON.stringify([], null, 2), 'utf8');
  }
}

function sanitizePath(userDir, userPath, allowedAreas = ['documents']) {
  if (!userPath) {
    // パスが指定されていない場合はdocumentsフォルダをデフォルトとする
    return path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  }
  
  const normalizedPath = path.normalize(userPath);
  if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
    throw new Error("不正なパスが指定されました");
  }
  
  // パスがdocuments/またはtrash/で始まっているかチェック
  const pathParts = normalizedPath.split(path.sep);
  const rootFolder = pathParts[0];
  
  if (!allowedAreas.includes(rootFolder)) {
    // 許可されたエリア以外の場合、documentsフォルダ内として扱う
    const fullPath = path.join(userDir, CONFIG.DOCUMENTS_FOLDER, normalizedPath);
    if (!fullPath.startsWith(path.join(userDir, CONFIG.DOCUMENTS_FOLDER) + path.sep) && 
        fullPath !== path.join(userDir, CONFIG.DOCUMENTS_FOLDER)) {
      throw new Error("アクセス権限がありません");
    }
    return fullPath;
  }
  
  // 許可されたエリア内のパス
  const fullPath = path.join(userDir, normalizedPath);
  const allowedPaths = allowedAreas.map(area => path.join(userDir, area));
  
  let hasAccess = false;
  for (const allowedPath of allowedPaths) {
    if (fullPath.startsWith(allowedPath + path.sep) || fullPath === allowedPath) {
      hasAccess = true;
      break;
    }
  }
  
  if (!hasAccess) {
    throw new Error("アクセス権限がありません");
  }
  
  return fullPath;
}

// =============================================================================
// 表示用ヘルパー関数（documents/trash プレフィックス除去）
// =============================================================================

/**
 * ファイルパスから表示用パスを生成（documents/ や trash/ プレフィックスを除去）
 */
function getDisplayPath(fullPath, userDir, area = 'documents') {
  const areaDir = path.join(userDir, area);
  if (fullPath.startsWith(areaDir + path.sep)) {
    return path.relative(areaDir, fullPath);
  } else if (fullPath === areaDir) {
    return '';
  }
  return path.basename(fullPath);
}

/**
 * 相対パスから表示用パスを生成
 */
function getDisplayPathFromRelative(relativePath) {
  if (relativePath.startsWith('documents/')) {
    return relativePath.substring('documents/'.length);
  } else if (relativePath.startsWith('trash/')) {
    return relativePath.substring('trash/'.length);
  }
  return relativePath;
}

function validateFileExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (!ext) {
    throw new Error("ファイル作成時は拡張子が必須です。任意の拡張子（.txt, .jpg, .mp4, .exe, .custom など）を使用できます。");
  }
  
  if (ext === '.') {
    throw new Error("拡張子が不正です。ドットの後に文字を指定してください（例: .txt, .jpg, .custom）。");
  }
  
  if (ext.length <= 1) {
    throw new Error("拡張子が不正です。ドットの後に文字を指定してください（例: .txt, .jpg, .custom）。");
  }
  
  if (filePath.endsWith('.')) {
    throw new Error("ファイル名がドットで終わっています。拡張子を指定してください（例: filename.txt）。");
  }
  
  const extWithoutDot = ext.substring(1);
  if (!/^[a-zA-Z0-9_-]+$/.test(extWithoutDot)) {
    throw new Error("拡張子に無効な文字が含まれています。英数字、アンダースコア、ハイフンのみ使用可能です。");
  }
}

function isExecutableFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONFIG.EXECUTABLE_EXTENSIONS.includes(ext);
}

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONFIG.TEXT_EXTENSIONS.includes(ext);
}

function checkFolderDepth(userDir, targetPath) {
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  const relativePath = path.relative(documentsDir, targetPath);
  const depth = relativePath.split(path.sep).length;
  if (depth > CONFIG.MAX_FOLDER_DEPTH) {
    throw new Error(`フォルダの階層が深すぎます（最大${CONFIG.MAX_FOLDER_DEPTH}階層）`);
  }
}

async function checkUserQuota(userDir, additionalSize = 0) {
  const currentSize = await getDirectorySize(userDir);
  if (currentSize + additionalSize > CONFIG.MAX_USER_QUOTA) {
    const quotaGB = (CONFIG.MAX_USER_QUOTA / (1024 * 1024 * 1024)).toFixed(1);
    const currentGB = (currentSize / (1024 * 1024 * 1024)).toFixed(1);
    const additionalMB = (additionalSize / (1024 * 1024)).toFixed(1);
    throw new Error(`容量制限を超えています。現在: ${currentGB}GB, 追加: ${additionalMB}MB, 制限: ${quotaGB}GB`);
  }
}

async function checkUserFileCount(userDir) {
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  const fileCount = await getFileCount(documentsDir);
  if (fileCount >= CONFIG.MAX_FILES_PER_USER) {
    throw new Error(`ファイル数の上限に達しています（現在: ${fileCount}, 最大: ${CONFIG.MAX_FILES_PER_USER}ファイル）`);
  }
}

async function getDirectorySize(dir) {
  let size = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile()) {
        try {
          const stats = await fs.stat(fullPath);
          size += stats.size;
        } catch (error) {
          // ファイルアクセスエラーは無視
        }
      } else if (entry.isDirectory()) {
        size += await getDirectorySize(fullPath);
      }
    }
  } catch (error) {
    // ディレクトリアクセスエラーは無視
  }
  return size;
}

async function getFileCount(dir) {
  let count = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        count++;
      } else if (entry.isDirectory()) {
        count += await getFileCount(path.join(dir, entry.name));
      }
    }
  } catch (error) {
    // エラーは無視
  }
  return count;
}

// =============================================================================
// メタデータ管理関数
// =============================================================================

async function addToRecentUpdates(userDir, filePath, action) {
  try {
    const recentUpdatesFile = path.join(userDir, CONFIG.RECENT_UPDATES_FILE);
    let updates = [];
    
    if (existsSync(recentUpdatesFile)) {
      const content = await fs.readFile(recentUpdatesFile, 'utf8');
      updates = JSON.parse(content);
    }
    
    // 新しい更新を追加
    const update = {
      path: filePath,
      action: action,
      timestamp: new Date().toISOString()
    };
    
    // 同じファイルの古い記録を削除
    updates = updates.filter(u => u.path !== filePath);
    
    // 先頭に追加
    updates.unshift(update);
    
    // 最大件数を超えた場合は古いものを削除
    if (updates.length > CONFIG.MAX_RECENT_UPDATES) {
      updates = updates.slice(0, CONFIG.MAX_RECENT_UPDATES);
    }
    
    await fs.writeFile(recentUpdatesFile, JSON.stringify(updates, null, 2), 'utf8');
  } catch (error) {
    // メタデータ更新エラーは無視
  }
}

async function removeFromRecentUpdates(userDir, filePath) {
  try {
    const recentUpdatesFile = path.join(userDir, CONFIG.RECENT_UPDATES_FILE);
    if (existsSync(recentUpdatesFile)) {
      const content = await fs.readFile(recentUpdatesFile, 'utf8');
      let updates = JSON.parse(content);
      updates = updates.filter(u => u.path !== filePath);
      await fs.writeFile(recentUpdatesFile, JSON.stringify(updates, null, 2), 'utf8');
    }
  } catch (error) {
    // メタデータ更新エラーは無視
  }
}

// =============================================================================
// 基本ファイル操作（documentsフォルダ内）
// =============================================================================

async function createFolder(userDir, userPath, user) {
  if (!userPath) throw new Error("フォルダパスが必要です");
  const targetPath = sanitizePath(userDir, userPath);
  checkFolderDepth(userDir, targetPath);
  if (existsSync(targetPath)) throw new Error("同名のファイルまたはフォルダが既に存在します");
  await fs.mkdir(targetPath, { recursive: true });
  
  // 表示用パスを取得
  const displayPath = getDisplayPath(targetPath, userDir, 'documents');
  const relativePath = path.relative(path.join(userDir, CONFIG.DOCUMENTS_FOLDER), targetPath);
  await addToRecentUpdates(userDir, relativePath, 'create_folder');
  
  return `📁 フォルダを作成しました: ${displayPath || '(ルート)'}`;
}

async function createFile(userDir, userPath, content = '', user) {
  if (!userPath) throw new Error("ファイルパスが必要です");
  if (typeof content !== 'string') throw new Error("ファイル内容は文字列である必要があります");
  
  const targetPath = sanitizePath(userDir, userPath);
  validateFileExtension(targetPath);
  
  let fileBuffer;
  let isBinary = false;
  
  if (content.startsWith('data:')) {
    try {
      const base64Data = content.split(',')[1];
      fileBuffer = Buffer.from(base64Data, 'base64');
      isBinary = true;
    } catch (error) {
      throw new Error("無効なData URL形式です");
    }
  } else if (content.startsWith('base64:')) {
    try {
      const base64Data = content.substring(7);
      fileBuffer = Buffer.from(base64Data, 'base64');
      isBinary = true;
    } catch (error) {
      throw new Error("無効なBase64データです");
    }
  } else {
    fileBuffer = Buffer.from(content, 'utf8');
  }
  
  const fileSize = fileBuffer.length;
  if (fileSize > CONFIG.MAX_FILE_SIZE) {
    const maxSizeMB = (CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(1);
    const actualSizeMB = (fileSize / 1024 / 1024).toFixed(1);
    throw new Error(`ファイルサイズが上限を超えています（ファイル: ${actualSizeMB}MB, 最大: ${maxSizeMB}MB）`);
  }
  
  await checkUserQuota(userDir, fileSize);
  await checkUserFileCount(userDir);
  checkFolderDepth(userDir, targetPath);
  
  if (existsSync(targetPath)) throw new Error("同名のファイルが既に存在します");
  
  const parentDir = path.dirname(targetPath);
  if (!existsSync(parentDir)) {
    await fs.mkdir(parentDir, { recursive: true });
  }
  
  await fs.writeFile(targetPath, fileBuffer);
  
  // 表示用パスを取得して最近の更新に追加
  const displayPath = getDisplayPath(targetPath, userDir, 'documents');
  const relativePath = path.relative(path.join(userDir, CONFIG.DOCUMENTS_FOLDER), targetPath);
  await addToRecentUpdates(userDir, relativePath, 'create');
  
  const fileTypeInfo = isBinary ? 'バイナリファイル' : 'テキストファイル';
  const fileExtension = path.extname(targetPath);
  
  if (isExecutableFile(targetPath)) {
    try {
      if (process.platform !== 'win32') {
        await fs.chmod(targetPath, 0o644);
      }
      return `📄 実行可能ファイル(${fileTypeInfo})を作成しました: ${displayPath}\n拡張子: ${fileExtension}\n内容: ${formatFileSize(fileSize)}\n⚠️ セキュリティのため実行権限は制限されています`;
    } catch (chmodError) {
      return `📄 実行可能ファイル(${fileTypeInfo})を作成しました: ${displayPath}\n拡張子: ${fileExtension}\n内容: ${formatFileSize(fileSize)}\n⚠️ セキュリティのため実行は推奨されません`;
    }
  }
  
  return `📄 ファイル(${fileTypeInfo})を作成しました: ${displayPath}\n拡張子: ${fileExtension}\n内容: ${formatFileSize(fileSize)}`;
}

async function readFile(userDir, userPath, user) {
  if (!userPath) throw new Error("ファイルパスが必要です");
  const targetPath = sanitizePath(userDir, userPath, ['documents', 'trash']);
  if (!existsSync(targetPath)) throw new Error("ファイルが見つかりません");
  const stats = statSync(targetPath);
  if (!stats.isFile()) throw new Error("指定されたパスはファイルではありません");
  
  let content;
  let fileType;
  
  if (isTextFile(targetPath)) {
    try {
      content = await fs.readFile(targetPath, 'utf8');
      fileType = 'テキストファイル';
    } catch (error) {
      const buffer = await fs.readFile(targetPath);
      content = 'base64:' + buffer.toString('base64');
      fileType = 'バイナリファイル（Base64エンコード）';
    }
  } else {
    const buffer = await fs.readFile(targetPath);
    content = 'base64:' + buffer.toString('base64');
    fileType = 'バイナリファイル（Base64エンコード）';
  }
  
  // 表示用パスを決定
  let displayPath;
  if (targetPath.includes('/trash/')) {
    displayPath = getDisplayPath(targetPath, userDir, 'trash');
  } else {
    displayPath = getDisplayPath(targetPath, userDir, 'documents');
  }
  
  const executableWarning = isExecutableFile(targetPath) ? 
    '\n⚠️ これは実行可能ファイルです。実行は制限されています。' : '';
  
  return `📖 ファイル内容(${fileType}): ${displayPath}${executableWarning}\n\n${content}`;
}

async function updateFile(userDir, userPath, content, user) {
  if (!userPath) throw new Error("ファイルパスが必要です");
  if (typeof content !== 'string') throw new Error("ファイル内容は文字列である必要があります");
  
  let fileBuffer;
  let isBinary = false;
  
  if (content.startsWith('data:')) {
    try {
      const base64Data = content.split(',')[1];
      fileBuffer = Buffer.from(base64Data, 'base64');
      isBinary = true;
    } catch (error) {
      throw new Error("無効なData URL形式です");
    }
  } else if (content.startsWith('base64:')) {
    try {
      const base64Data = content.substring(7);
      fileBuffer = Buffer.from(base64Data, 'base64');
      isBinary = true;
    } catch (error) {
      throw new Error("無効なBase64データです");
    }
  } else {
    fileBuffer = Buffer.from(content, 'utf8');
  }
  
  const fileSize = fileBuffer.length;
  if (fileSize > CONFIG.MAX_FILE_SIZE) {
    const maxSizeMB = (CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(1);
    const actualSizeMB = (fileSize / 1024 / 1024).toFixed(1);
    throw new Error(`ファイルサイズが上限を超えています（ファイル: ${actualSizeMB}MB, 最大: ${maxSizeMB}MB）`);
  }
  
  const targetPath = sanitizePath(userDir, userPath);
  if (!existsSync(targetPath)) throw new Error("ファイルが見つかりません");
  const stats = statSync(targetPath);
  if (!stats.isFile()) throw new Error("指定されたパスはファイルではありません");
  
  const currentSize = stats.size;
  const sizeDiff = fileSize - currentSize;
  
  if (sizeDiff > 0) {
    await checkUserQuota(userDir, sizeDiff);
  }
  
  await fs.writeFile(targetPath, fileBuffer);
  
  // 表示用パスを取得して最近の更新に追加
  const displayPath = getDisplayPath(targetPath, userDir, 'documents');
  const relativePath = path.relative(path.join(userDir, CONFIG.DOCUMENTS_FOLDER), targetPath);
  await addToRecentUpdates(userDir, relativePath, 'update');
  
  const fileTypeInfo = isBinary ? 'バイナリファイル' : 'テキストファイル';
  
  if (isExecutableFile(targetPath)) {
    try {
      if (process.platform !== 'win32') {
        await fs.chmod(targetPath, 0o644);
      }
      return `✏️ 実行可能ファイル(${fileTypeInfo})を更新しました: ${displayPath}\n新しい内容: ${formatFileSize(fileSize)}\n⚠️ セキュリティのため実行権限は制限されています`;
    } catch (chmodError) {
      return `✏️ 実行可能ファイル(${fileTypeInfo})を更新しました: ${displayPath}\n新しい内容: ${formatFileSize(fileSize)}\n⚠️ セキュリティのため実行は推奨されません`;
    }
  }
  
  return `✏️ ファイル(${fileTypeInfo})を更新しました: ${displayPath}\n新しい内容: ${formatFileSize(fileSize)}`;
}

async function listDirectory(userDir, userPath = '', user) {
  const targetPath = sanitizePath(userDir, userPath, ['documents', 'trash']);
  if (!existsSync(targetPath)) throw new Error("ディレクトリが見つかりません");
  const stats = statSync(targetPath);
  if (!stats.isDirectory()) throw new Error("指定されたパスはディレクトリではありません");
  
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  if (entries.length === 0) {
    const displayPath = getDisplayPath(targetPath, userDir, targetPath.includes('/trash/') ? 'trash' : 'documents');
    return `📂 ディレクトリは空です: ${displayPath || '(ルート)'}`;
  }
  
  const folders = [];
  const files = [];
  
  // どのエリアにいるか判定
  const isTrashArea = targetPath.includes('/trash/');
  const areaName = isTrashArea ? 'trash' : 'documents';
  
  for (const entry of entries) {
    const itemFullPath = path.join(targetPath, entry.name);
    const itemDisplayPath = getDisplayPath(itemFullPath, userDir, areaName);
    
    if (entry.isDirectory()) {
      folders.push(`📁 ${itemDisplayPath}/`);
    } else {
      const stats = statSync(itemFullPath);
      const size = formatFileSize(stats.size);
      const modified = stats.mtime.toISOString().split('T')[0];
      const executableMark = isExecutableFile(itemFullPath) ? ' ⚠️' : '';
      files.push(`📄 ${itemDisplayPath} (${size}, ${modified})${executableMark}`);
    }
  }
  
  const result = [];
  const currentDisplayPath = getDisplayPath(targetPath, userDir, areaName);
  result.push(`📂 ディレクトリ一覧: ${currentDisplayPath || '(ルート)'} (ユーザー: ${user.name})`);
  result.push('');
  
  if (folders.length > 0) {
    result.push('📁 フォルダ:');
    result.push(...folders);
    result.push('');
  }
  
  if (files.length > 0) {
    result.push('📄 ファイル:');
    result.push(...files);
    if (files.some(f => f.includes('⚠️'))) {
      result.push('');
      result.push('⚠️ 実行可能ファイルは実行権限が制限されています');
    }
  }
  
  return result.join('\n');
}

async function searchFiles(userDir, query, searchType, user) {
  if (!query) throw new Error("検索クエリが必要です");
  const results = [];
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  await searchInDirectory(documentsDir, '', query, searchType, results);
  
  if (results.length === 0) {
    return `🔍 検索結果: 該当するファイルが見つかりませんでした\nクエリ: "${query}" (ユーザー: ${user.name})`;
  }
  
  const resultText = [];
  resultText.push(`🔍 検索結果: ${results.length}件見つかりました (ユーザー: ${user.name})`);
  resultText.push(`クエリ: "${query}" (検索タイプ: ${searchType})`);
  resultText.push('');
  
  for (const result of results) {
    const displayPath = getDisplayPathFromRelative(result.path);
    const executableMark = isExecutableFile(result.path) ? ' ⚠️' : '';
    resultText.push(`📄 ${displayPath}${executableMark}`);
    if (result.contentMatch) {
      resultText.push(`   💬 内容にマッチ: "${result.contentMatch}"`);
    }
    resultText.push('');
  }
  
  return resultText.join('\n');
}

async function searchInDirectory(baseDir, relativePath, query, searchType, results) {
  const currentDir = path.join(baseDir, relativePath);
  try {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const itemRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;
      const itemFullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        if ((searchType === 'filename' || searchType === 'both') && 
            entry.name.toLowerCase().includes(query.toLowerCase())) {
          results.push({ path: itemRelativePath + '/', contentMatch: null });
        }
        await searchInDirectory(baseDir, itemRelativePath, query, searchType, results);
      } else {
        let matches = false;
        let contentMatch = null;
        
        if ((searchType === 'filename' || searchType === 'both') && 
            entry.name.toLowerCase().includes(query.toLowerCase())) {
          matches = true;
        }
        
        if ((searchType === 'content' || searchType === 'both') && !matches) {
          try {
            const stats = statSync(itemFullPath);
            if (stats.size <= CONFIG.MAX_FILE_SIZE) {
              if (isTextFile(itemFullPath)) {
                try {
                  const content = await fs.readFile(itemFullPath, 'utf8');
                  const lowerContent = content.toLowerCase();
                  const lowerQuery = query.toLowerCase();
                  
                  if (lowerContent.includes(lowerQuery)) {
                    matches = true;
                    const index = lowerContent.indexOf(lowerQuery);
                    const start = Math.max(0, index - 30);
                    const end = Math.min(content.length, index + query.length + 30);
                    contentMatch = content.substring(start, end);
                  }
                } catch (error) {
                  // テキストファイル読み取りエラーは無視
                }
              }
            }
          } catch (error) {
            // ファイル読み取りエラーは無視
          }
        }
        
        if (matches) {
          results.push({ path: itemRelativePath, contentMatch: contentMatch });
        }
      }
    }
  } catch (error) {
    // ディレクトリ読み取りエラーは無視
  }
}

async function moveItem(userDir, sourcePath, destPath, user) {
  if (!sourcePath || !destPath) throw new Error("移動元と移動先のパスが必要です");
  const sourceFullPath = sanitizePath(userDir, sourcePath);
  const destFullPath = sanitizePath(userDir, destPath);
  
  if (!existsSync(sourceFullPath)) throw new Error("移動元のファイルまたはフォルダが見つかりません");
  if (existsSync(destFullPath)) throw new Error("移動先に同名のファイルまたはフォルダが既に存在します");
  
  const sourceStats = statSync(sourceFullPath);
  if (sourceStats.isFile()) {
    validateFileExtension(destFullPath);
  }
  
  checkFolderDepth(userDir, destFullPath);
  
  const parentDir = path.dirname(destFullPath);
  if (!existsSync(parentDir)) {
    await fs.mkdir(parentDir, { recursive: true });
  }
  
  await fs.rename(sourceFullPath, destFullPath);
  
  if (sourceStats.isFile() && isExecutableFile(destFullPath)) {
    try {
      if (process.platform !== 'win32') {
        await fs.chmod(destFullPath, 0o644);
      }
    } catch (chmodError) {
      // 権限変更エラーは無視
    }
  }
  
  // 表示用パスと最近の更新・お気に入りを更新
  const sourceDisplayPath = getDisplayPath(sourceFullPath, userDir, 'documents');
  const destDisplayPath = getDisplayPath(destFullPath, userDir, 'documents');
  
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  const sourceRelativePath = path.relative(documentsDir, sourceFullPath);
  const destRelativePath = path.relative(documentsDir, destFullPath);
  
  await removeFromRecentUpdates(userDir, sourceRelativePath);
  await addToRecentUpdates(userDir, destRelativePath, 'move');
  await updateFavoritesPath(userDir, sourceRelativePath, destRelativePath);
  
  return `📦 移動完了: ${sourceDisplayPath} → ${destDisplayPath}`;
}

async function copyItem(userDir, sourcePath, destPath, user) {
  if (!sourcePath || !destPath) throw new Error("コピー元とコピー先のパスが必要です");
  const sourceFullPath = sanitizePath(userDir, sourcePath);
  const destFullPath = sanitizePath(userDir, destPath);
  
  if (!existsSync(sourceFullPath)) throw new Error("コピー元のファイルまたはフォルダが見つかりません");
  if (existsSync(destFullPath)) throw new Error("コピー先に同名のファイルまたはフォルダが既に存在します");
  
  const sourceStats = statSync(sourceFullPath);
  if (sourceStats.isFile()) {
    validateFileExtension(destFullPath);
  }
  
  checkFolderDepth(userDir, destFullPath);
  
  if (sourceStats.isDirectory()) {
    const dirSize = await getDirectorySize(sourceFullPath);
    await checkUserQuota(userDir, dirSize);
  } else {
    await checkUserQuota(userDir, sourceStats.size);
  }
  
  await checkUserFileCount(userDir);
  
  const parentDir = path.dirname(destFullPath);
  if (!existsSync(parentDir)) {
    await fs.mkdir(parentDir, { recursive: true });
  }
  
  // 表示用パス
  const sourceDisplayPath = getDisplayPath(sourceFullPath, userDir, 'documents');
  const destDisplayPath = getDisplayPath(destFullPath, userDir, 'documents');
  
  if (sourceStats.isDirectory()) {
    await copyDirectory(sourceFullPath, destFullPath);
    
    const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
    const destRelativePath = path.relative(documentsDir, destFullPath);
    await addToRecentUpdates(userDir, destRelativePath, 'copy');
    
    return `📋 フォルダをコピー完了: ${sourceDisplayPath} → ${destDisplayPath}`;
  } else {
    await fs.copyFile(sourceFullPath, destFullPath);
    
    if (isExecutableFile(destFullPath)) {
      try {
        if (process.platform !== 'win32') {
          await fs.chmod(destFullPath, 0o644);
        }
      } catch (chmodError) {
        // 権限変更エラーは無視
      }
    }
    
    const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
    const destRelativePath = path.relative(documentsDir, destFullPath);
    await addToRecentUpdates(userDir, destRelativePath, 'copy');
    
    return `📋 ファイルをコピー完了: ${sourceDisplayPath} → ${destDisplayPath}`;
  }
}

async function copyDirectory(source, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destPath);
    } else {
      await fs.copyFile(sourcePath, destPath);
      
      if (isExecutableFile(destPath)) {
        try {
          if (process.platform !== 'win32') {
            await fs.chmod(destPath, 0o644);
          }
        } catch (chmodError) {
          // 権限変更エラーは無視
        }
      }
    }
  }
}

// =============================================================================
// 新機能: 最近の更新
// =============================================================================

async function getRecentUpdates(userDir, user, limit) {
  const recentUpdatesFile = path.join(userDir, CONFIG.RECENT_UPDATES_FILE);
  
  if (!existsSync(recentUpdatesFile)) {
    return `📅 最近の更新: まだ更新がありません (ユーザー: ${user.name})`;
  }
  
  const content = await fs.readFile(recentUpdatesFile, 'utf8');
  const updates = JSON.parse(content);
  
  if (updates.length === 0) {
    return `📅 最近の更新: まだ更新がありません (ユーザー: ${user.name})`;
  }
  
  const limitedUpdates = updates.slice(0, limit);
  const result = [];
  result.push(`📅 最近の更新 (最新${limitedUpdates.length}件) (ユーザー: ${user.name})`);
  result.push('');
  
  for (const update of limitedUpdates) {
    const actionIcon = {
      'create': '✨',
      'create_folder': '📁',
      'update': '✏️',
      'move': '📦',
      'copy': '📋',
      'restore': '♻️'
    }[update.action] || '📄';
    
    const timestamp = new Date(update.timestamp).toLocaleString('ja-JP');
    const displayPath = getDisplayPathFromRelative(update.path);
    result.push(`${actionIcon} ${displayPath}`);
    result.push(`   アクション: ${update.action} | 日時: ${timestamp}`);
    result.push('');
  }
  
  return result.join('\n');
}

// =============================================================================
// 新機能: お気に入り
// =============================================================================

async function addToFavorites(userDir, filePath, user) {
  if (!filePath) throw new Error("ファイルパスが必要です");
  
  const targetPath = sanitizePath(userDir, filePath);
  if (!existsSync(targetPath)) throw new Error("ファイルまたはフォルダが見つかりません");
  
  const favoritesFile = path.join(userDir, CONFIG.FAVORITES_FILE);
  let favorites = [];
  
  if (existsSync(favoritesFile)) {
    const content = await fs.readFile(favoritesFile, 'utf8');
    favorites = JSON.parse(content);
  }
  
  // 相対パスを取得
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  const relativePath = path.relative(documentsDir, targetPath);
  
  // 既にお気に入りに登録されているかチェック
  if (favorites.some(fav => fav.path === relativePath)) {
    const displayPath = getDisplayPathFromRelative(relativePath);
    return `⭐ 既にお気に入りに登録済みです: ${displayPath}`;
  }
  
  // 最大件数チェック
  if (favorites.length >= CONFIG.MAX_FAVORITES) {
    throw new Error(`お気に入りの最大件数(${CONFIG.MAX_FAVORITES}件)に達しています`);
  }
  
  // お気に入りに追加
  const stats = statSync(targetPath);
  const favorite = {
    path: relativePath,
    name: path.basename(relativePath),
    type: stats.isDirectory() ? 'folder' : 'file',
    addedAt: new Date().toISOString()
  };
  
  favorites.push(favorite);
  await fs.writeFile(favoritesFile, JSON.stringify(favorites, null, 2), 'utf8');
  
  const displayPath = getDisplayPathFromRelative(relativePath);
  return `⭐ お気に入りに追加しました: ${displayPath}`;
}

async function removeFromFavorites(userDir, filePath, user) {
  if (!filePath) throw new Error("ファイルパスが必要です");
  
  const favoritesFile = path.join(userDir, CONFIG.FAVORITES_FILE);
  if (!existsSync(favoritesFile)) {
    return `⭐ お気に入りは空です`;
  }
  
  const content = await fs.readFile(favoritesFile, 'utf8');
  let favorites = JSON.parse(content);
  
  // 相対パスを正規化
  let relativePath = filePath;
  if (filePath.startsWith('documents/')) {
    relativePath = filePath.substring('documents/'.length);
  }
  
  const initialLength = favorites.length;
  favorites = favorites.filter(fav => fav.path !== relativePath);
  
  if (favorites.length === initialLength) {
    const displayPath = getDisplayPathFromRelative(relativePath);
    return `⭐ お気に入りに登録されていません: ${displayPath}`;
  }
  
  await fs.writeFile(favoritesFile, JSON.stringify(favorites, null, 2), 'utf8');
  
  const displayPath = getDisplayPathFromRelative(relativePath);
  return `⭐ お気に入りから削除しました: ${displayPath}`;
}

async function getFavorites(userDir, user) {
  const favoritesFile = path.join(userDir, CONFIG.FAVORITES_FILE);
  
  if (!existsSync(favoritesFile)) {
    return `⭐ お気に入り: まだお気に入りがありません (ユーザー: ${user.name})`;
  }
  
  const content = await fs.readFile(favoritesFile, 'utf8');
  const favorites = JSON.parse(content);
  
  if (favorites.length === 0) {
    return `⭐ お気に入り: まだお気に入りがありません (ユーザー: ${user.name})`;
  }
  
  const result = [];
  result.push(`⭐ お気に入り (${favorites.length}件) (ユーザー: ${user.name})`);
  result.push('');
  
  for (const favorite of favorites) {
    const icon = favorite.type === 'folder' ? '📁' : '📄';
    const addedDate = new Date(favorite.addedAt).toLocaleString('ja-JP');
    
    // ファイルが存在するかチェック
    const fullPath = path.join(userDir, CONFIG.DOCUMENTS_FOLDER, favorite.path);
    const exists = existsSync(fullPath);
    const statusIcon = exists ? '' : ' ❌';
    
    const displayPath = getDisplayPathFromRelative(favorite.path);
    result.push(`${icon} ${displayPath}${statusIcon}`);
    result.push(`   追加日時: ${addedDate}`);
    if (!exists) {
      result.push(`   ⚠️ ファイルが見つかりません`);
    }
    result.push('');
  }
  
  return result.join('\n');
}

async function updateFavoritesPath(userDir, oldPath, newPath) {
  try {
    const favoritesFile = path.join(userDir, CONFIG.FAVORITES_FILE);
    if (existsSync(favoritesFile)) {
      const content = await fs.readFile(favoritesFile, 'utf8');
      let favorites = JSON.parse(content);
      
      favorites = favorites.map(fav => {
        if (fav.path === oldPath) {
          return { ...fav, path: newPath, name: path.basename(newPath) };
        }
        return fav;
      });
      
      await fs.writeFile(favoritesFile, JSON.stringify(favorites, null, 2), 'utf8');
    }
  } catch (error) {
    // エラーは無視
  }
}

// =============================================================================
// 新機能: ゴミ箱
// =============================================================================

async function moveToTrash(userDir, userPath, user) {
  if (!userPath) throw new Error("削除するパスが必要です");
  const sourcePath = sanitizePath(userDir, userPath);
  if (!existsSync(sourcePath)) throw new Error("ファイルまたはフォルダが見つかりません");
  
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  const trashDir = path.join(userDir, CONFIG.TRASH_FOLDER);
  const relativePath = path.relative(documentsDir, sourcePath);
  
  // ゴミ箱内でのファイル名を決定（重複回避）
  let trashFileName = path.basename(relativePath);
  let trashPath = path.join(trashDir, trashFileName);
  let counter = 1;
  
  while (existsSync(trashPath)) {
    const ext = path.extname(trashFileName);
    const nameWithoutExt = path.basename(trashFileName, ext);
    trashFileName = `${nameWithoutExt}_${counter}${ext}`;
    trashPath = path.join(trashDir, trashFileName);
    counter++;
  }
  
  // ファイルまたはフォルダをゴミ箱に移動
  await fs.rename(sourcePath, trashPath);
  
  // メタデータファイルを作成（復元時に元の場所を記録）
  const metaData = {
    originalPath: relativePath,
    deletedAt: new Date().toISOString(),
    type: statSync(trashPath).isDirectory() ? 'folder' : 'file'
  };
  
  await fs.writeFile(trashPath + '.meta', JSON.stringify(metaData, null, 2), 'utf8');
  
  // 最近の更新とお気に入りから削除
  await removeFromRecentUpdates(userDir, relativePath);
  await removeFromFavorites(userDir, relativePath, user);
  
  const stats = statSync(trashPath);
  const itemType = stats.isDirectory() ? 'フォルダ' : 'ファイル';
  
  const sourceDisplayPath = getDisplayPathFromRelative(relativePath);
  return `🗑️ ${itemType}をゴミ箱に移動しました: ${sourceDisplayPath} → ${trashFileName}`;
}

async function restoreFromTrash(userDir, trashPath, user) {
  if (!trashPath) throw new Error("復元するファイルのパスが必要です");
  
  let fullTrashPath;
  if (trashPath.startsWith('trash/')) {
    fullTrashPath = path.join(userDir, trashPath);
  } else {
    fullTrashPath = path.join(userDir, CONFIG.TRASH_FOLDER, trashPath);
  }
  
  if (!existsSync(fullTrashPath)) throw new Error("ゴミ箱にファイルが見つかりません");
  
  // メタデータファイルを読み込み
  const metaDataPath = fullTrashPath + '.meta';
  if (!existsSync(metaDataPath)) {
    throw new Error("復元用のメタデータが見つかりません");
  }
  
  const metaDataContent = await fs.readFile(metaDataPath, 'utf8');
  const metaData = JSON.parse(metaDataContent);
  
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  const restorePath = path.join(documentsDir, metaData.originalPath);
  
  // 復元先に同名のファイルがある場合は名前を変更
  let finalRestorePath = restorePath;
  let counter = 1;
  
  while (existsSync(finalRestorePath)) {
    const ext = path.extname(metaData.originalPath);
    const nameWithoutExt = path.basename(metaData.originalPath, ext);
    const dir = path.dirname(metaData.originalPath);
    const newName = `${nameWithoutExt}_restored_${counter}${ext}`;
    finalRestorePath = path.join(documentsDir, dir, newName);
    counter++;
  }
  
  // 復元先ディレクトリを作成
  const parentDir = path.dirname(finalRestorePath);
  if (!existsSync(parentDir)) {
    await fs.mkdir(parentDir, { recursive: true });
  }
  
  // ファイルを復元
  await fs.rename(fullTrashPath, finalRestorePath);
  
  // メタデータファイルを削除
  await fs.unlink(metaDataPath);
  
  // 最近の更新に追加
  const newRelativePath = path.relative(documentsDir, finalRestorePath);
  await addToRecentUpdates(userDir, newRelativePath, 'restore');
  
  const itemType = metaData.type === 'folder' ? 'フォルダ' : 'ファイル';
  const trashFileName = path.basename(fullTrashPath);
  const newDisplayPath = getDisplayPathFromRelative(newRelativePath);
  
  return `♻️ ${itemType}をゴミ箱から復元しました: ${trashFileName} → ${newDisplayPath}`;
}

async function listTrash(userDir, user) {
  const trashDir = path.join(userDir, CONFIG.TRASH_FOLDER);
  
  if (!existsSync(trashDir)) {
    return `🗑️ ゴミ箱は空です (ユーザー: ${user.name})`;
  }
  
  const entries = await fs.readdir(trashDir, { withFileTypes: true });
  const trashItems = entries.filter(entry => !entry.name.endsWith('.meta'));
  
  if (trashItems.length === 0) {
    return `🗑️ ゴミ箱は空です (ユーザー: ${user.name})`;
  }
  
  const result = [];
  result.push(`🗑️ ゴミ箱 (${trashItems.length}件) (ユーザー: ${user.name})`);
  result.push('');
  
  for (const entry of trashItems) {
    const itemPath = path.join(trashDir, entry.name);
    const metaPath = itemPath + '.meta';
    
    let metaData = null;
    if (existsSync(metaPath)) {
      try {
        const metaContent = await fs.readFile(metaPath, 'utf8');
        metaData = JSON.parse(metaContent);
      } catch (error) {
        // メタデータ読み取りエラーは無視
      }
    }
    
    const icon = entry.isDirectory() ? '📁' : '📄';
    const stats = statSync(itemPath);
    const size = entry.isFile() ? formatFileSize(stats.size) : '';
    const deletedDate = metaData ? new Date(metaData.deletedAt).toLocaleString('ja-JP') : '不明';
    const originalDisplayPath = metaData ? getDisplayPathFromRelative(metaData.originalPath) : '不明';
    
    result.push(`${icon} ${entry.name} ${size}`);
    result.push(`   元の場所: ${originalDisplayPath}`);
    result.push(`   削除日時: ${deletedDate}`);
    result.push('');
  }
  
  return result.join('\n');
}

async function emptyTrash(userDir, user) {
  const trashDir = path.join(userDir, CONFIG.TRASH_FOLDER);
  
  if (!existsSync(trashDir)) {
    return `🗑️ ゴミ箱は既に空です (ユーザー: ${user.name})`;
  }
  
  const entries = await fs.readdir(trashDir, { withFileTypes: true });
  
  if (entries.length === 0) {
    return `🗑️ ゴミ箱は既に空です (ユーザー: ${user.name})`;
  }
  
  let deletedCount = 0;
  
  for (const entry of entries) {
    const itemPath = path.join(trashDir, entry.name);
    
    if (entry.isDirectory()) {
      await fs.rmdir(itemPath, { recursive: true });
      deletedCount++;
    } else {
      await fs.unlink(itemPath);
      if (!entry.name.endsWith('.meta')) {
        deletedCount++;
      }
    }
  }
  
  return `🗑️ ゴミ箱を空にしました: ${deletedCount}件のアイテムを完全削除 (ユーザー: ${user.name})`;
}

async function permanentlyDelete(userDir, trashPath, user) {
  if (!trashPath) throw new Error("削除するファイルのパスが必要です");
  
  let fullTrashPath;
  if (trashPath.startsWith('trash/')) {
    fullTrashPath = path.join(userDir, trashPath);
  } else {
    fullTrashPath = path.join(userDir, CONFIG.TRASH_FOLDER, trashPath);
  }
  
  if (!existsSync(fullTrashPath)) throw new Error("ゴミ箱にファイルが見つかりません");
  
  const stats = statSync(fullTrashPath);
  const itemType = stats.isDirectory() ? 'フォルダ' : 'ファイル';
  const fileName = path.basename(fullTrashPath);
  
  // ファイルまたはフォルダを完全削除
  if (stats.isDirectory()) {
    await fs.rmdir(fullTrashPath, { recursive: true });
  } else {
    await fs.unlink(fullTrashPath);
  }
  
  // メタデータファイルも削除
  const metaDataPath = fullTrashPath + '.meta';
  if (existsSync(metaDataPath)) {
    await fs.unlink(metaDataPath);
  }
  
  return `🗑️ ${itemType}を完全削除しました: ${fileName}`;
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

async function getQuotaInfo(userDir, user) {
  const usedSize = await getDirectorySize(userDir);
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  const trashDir = path.join(userDir, CONFIG.TRASH_FOLDER);
  const documentsSize = await getDirectorySize(documentsDir);
  const trashSize = await getDirectorySize(trashDir);
  const fileCount = await getFileCount(documentsDir);
  
  const quotaGB = (CONFIG.MAX_USER_QUOTA / (1024 * 1024 * 1024)).toFixed(1);
  const usedGB = (usedSize / (1024 * 1024 * 1024)).toFixed(2);
  const usagePercent = ((usedSize / CONFIG.MAX_USER_QUOTA) * 100).toFixed(1);
  const remainingSize = CONFIG.MAX_USER_QUOTA - usedSize;
  
  // 最近の更新とお気に入りの件数取得
  let recentUpdatesCount = 0;
  let favoritesCount = 0;
  
  try {
    const recentUpdatesFile = path.join(userDir, CONFIG.RECENT_UPDATES_FILE);
    if (existsSync(recentUpdatesFile)) {
      const content = await fs.readFile(recentUpdatesFile, 'utf8');
      const updates = JSON.parse(content);
      recentUpdatesCount = updates.length;
    }
    
    const favoritesFile = path.join(userDir, CONFIG.FAVORITES_FILE);
    if (existsSync(favoritesFile)) {
      const content = await fs.readFile(favoritesFile, 'utf8');
      const favorites = JSON.parse(content);
      favoritesCount = favorites.length;
    }
  } catch (error) {
    // メタデータ読み取りエラーは無視
  }
  
  return `📊 容量使用状況 (ユーザー: ${user.name})
  
🗃️  全体使用容量: ${formatFileSize(usedSize)} / ${quotaGB}GB (${usagePercent}%)
📄 ファイル数: ${fileCount} / ${CONFIG.MAX_FILES_PER_USER}
💾 残り容量: ${formatFileSize(remainingSize)}

📂 エリア別使用量:
   📁 メインエリア: ${formatFileSize(documentsSize)}
   🗑️ ゴミ箱: ${formatFileSize(trashSize)}

📋 機能使用状況:
   📅 最近の更新: ${recentUpdatesCount} / ${CONFIG.MAX_RECENT_UPDATES}件
   ⭐ お気に入り: ${favoritesCount} / ${CONFIG.MAX_FAVORITES}件

👤 ユーザー情報:
   📁 ユーザーID: ${user.id}
   📧 メール: ${user.email || 'N/A'}
   🛡️ セキュリティ: OAuth認証済み

🔧 システム仕様:
   ⚠️ 実行可能ファイル: 作成可能（実行権限制限）
   📋 拡張子: 必須（任意の拡張子使用可能）
   🔄 ファイル形式: テキスト・バイナリ両方対応`;
}

async function logUserAction(user, action, path, status, error = null) {
  try {
    const logDir = path.join(CONFIG.BASE_DIR, '.logs');
    if (!existsSync(logDir)) {
      await fs.mkdir(logDir, { recursive: true });
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: user.name,
      action: action,
      path: path || '',
      status: status,
      error: error,
      ip: user.ip || 'unknown'
    };
    
    const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.log`);
    await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n', 'utf8');
  } catch (logError) {
    // ログエラーは無視
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}