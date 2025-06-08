#!/usr/bin/env node

/**
 * 拡張セキュアファイル管理ツールのインストールスクリプト（JSON対応版）
 * 
 * 新機能:
 * ①ファイル管理サービス（documents フォルダ内）
 * ②最近の更新
 * ③お気に入り 
 * ④ゴミ箱
 * 
 * 更新: JSON形式のレスポンス対応、構造化されたデータ出力
 * 
 * 使用方法:
 * node install-enhanced-secure-file-manager.js
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OneAgentプロジェクトのYourToolディレクトリ
const TOOLS_DIR = path.join(__dirname, 'YourTool');

// =============================================================================
// 拡張セキュアユーザーファイル管理ツール (LocalDrive)
// =============================================================================

const LocalDrive_CONFIG = {
  "name": "LocalDrive",
  "description": "ストレージサービス。ファイル管理、最近の更新、お気に入り、ゴミ箱機能を提供。JSON形式レスポンス対応。",
  "version": "4.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": [
          "create_folder", "create_file", "read_file", "update_file", "delete", "list", "search", "move", "copy", "get_quota",
          "get_recent_updates", "add_to_favorites", "remove_from_favorites", "get_favorites", 
          "move_to_trash", "restore_from_trash", "list_trash", "empty_trash", "permanently_delete"
        ],
        "description": "実行するアクション"
      },
      "path": {
        "type": "string",
        "description": "ファイルまたはフォルダのパス（メインエリア相対またはゴミ箱相対）"
      },
      "content": {
        "type": "string",
        "description": "ファイルの内容（create_file、update_fileで使用）"
      },
      "newPath": {
        "type": "string",
        "description": "移動先パス（move、copyで使用）"
      },
      "searchQuery": {
        "type": "string", 
        "description": "検索クエリ（searchで使用）"
      },
      "searchType": {
        "type": "string",
        "enum": ["filename", "content", "both"],
        "description": "検索タイプ（searchで使用、デフォルト: both）"
      },
      "limit": {
        "type": "number",
        "description": "結果の最大件数（get_recent_updatesで使用、デフォルト: 20）"
      }
    },
    "required": ["action"],
    "additionalProperties": false
  },
  "security": {
    "requiresAuth": true,
    "scopes": ["read", "write"]
  },
  "icon": {
    "filename": "secure_file_manager_icon.svg",
    "description": "拡張セキュアファイル管理アイコン",
    "type": "4",
    "colorScheme": "green"
  }
};

const LocalDrive_HANDLER = `import fs from 'fs/promises';
import { existsSync, statSync, createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// セキュリティ設定
const CONFIG = {
  BASE_DIR: path.join(__dirname, '../../secure_user_files'),
  MAX_FILE_SIZE: 450 * 1024 * 1024, // 450MB per file
  MAX_USER_QUOTA: 1024 * 1024 * 1024, // 1GB per user
  MAX_FILES_PER_USER: 10000,
  MAX_FOLDER_DEPTH: 15,
  MAX_ZIP_SIZE: 500 * 1024 * 1024, // 500MB max zip size
  EXECUTABLE_EXTENSIONS: ['.exe', '.sh', '.bat', '.ps1', '.scr', '.com', '.cmd', '.msi'],
  TEXT_EXTENSIONS: [
    '.txt', '.md', '.json', '.xml', '.csv', '.yaml', '.yml',
    '.js', '.ts', '.html', '.css', '.py', '.java', '.cpp', '.c',
    '.sh', '.bat', '.sql', '.log', '.ini', '.conf', '.php', '.rb',
    '.ps1', '.cmd'
  ],
  DOCUMENTS_FOLDER: 'documents',
  TRASH_FOLDER: 'trash',
  RECENT_UPDATES_FILE: '.recent_updates.json',
  FAVORITES_FILE: '.favorites.json',
  MAX_RECENT_UPDATES: 100,
  MAX_FAVORITES: 200
};

export default async function secureUserFileManager(args, context) {
  const { action, path: userPath, content, newPath, searchQuery, searchType = 'both', limit = 20, zipPaths } = args;
  
  if (!action || typeof action !== 'string') {
    return createErrorResponse('actionは必須の文字列です');
  }

  try {
    const user = await authenticateUser(context);
    await ensureBaseDirectory();
    const userDir = await ensureUserDirectory(user.id);
    
    let result;
    switch (action) {
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
      case 'download_zip':
        result = await downloadZip(userDir, zipPaths || [userPath], user);
        break;
      default:
        return createErrorResponse(\`未対応のアクション: \${action}\`);
    }
    
    await logUserAction(user, action, userPath, 'success');
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
    
  } catch (error) {
    if (context && context.user) {
      await logUserAction(context.user, action, userPath, 'error', error.message);
    }
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(createErrorResponse(error.message), null, 2)
        }
      ]
    };
  }
}

// JSON レスポンス作成ヘルパー関数
function createSuccessResponse(action, data, message = '操作が完了しました') {
  return {
    success: true,
    action: action,
    data: data,
    message: message,
    timestamp: new Date().toISOString()
  };
}

function createErrorResponse(message, details = null) {
  return {
    success: false,
    error: {
      message: message,
      details: details
    },
    timestamp: new Date().toISOString()
  };
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
    throw new Error(\`必要な権限がありません。必要なスコープ: \${requiredScopes.join(', ')}\`);
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
    
    const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
    await fs.mkdir(documentsDir, { recursive: true });
    
    const trashDir = path.join(userDir, CONFIG.TRASH_FOLDER);
    await fs.mkdir(trashDir, { recursive: true });
    
    await initializeMetadataFiles(userDir);
    
    const welcomeContent = \`# \${userId}さんのファイル領域へようこそ！

このディレクトリはあなた専用の1GBの領域です。

## 利用可能な機能:

### ①ファイル管理サービス
- ファイル・フォルダの作成、編集、移動、コピー
- 最大450MBまでのファイルアップロード
- 最大10,000ファイルまで保存可能
- テキストファイル・バイナリファイル両方に対応

### ②最近の更新
- 最近更新されたファイルの履歴を自動記録
- 最大100件の更新履歴を保持
- ISO 8601形式のタイムスタンプ付きで表示

### ③お気に入り
- 重要なファイル・フォルダをお気に入りに登録
- 最大200件のお気に入りを保存可能
- 素早いアクセスが可能

### ④ゴミ箱
- 削除したファイル・フォルダを安全に一時保存
- ゴミ箱からの復元が可能
- 完全削除またはゴミ箱を空にする操作も可能

### ⑤ZIPダウンロード 🆕
- 複数ファイル・フォルダを一括でZIP化
- 最大500MBまでのZIPファイル生成
- Base64エンコードでダウンロード対応

## API v4.1の新機能:
- **ZIPダウンロード**: 複数ファイル・フォルダを一括でZIP化してダウンロード
- **JSON構造化レスポンス**: 全ての操作結果がJSON形式で返されます
- **詳細なメタデータ**: ファイル情報、タイムスタンプ、サイズ情報を正確に提供
- **エラーハンドリング強化**: エラー情報も構造化されて返されます

作成日時: \${new Date().toISOString()}
\`;
    
    await fs.writeFile(path.join(userDir, 'README.md'), welcomeContent, 'utf8');
    
    const sampleContent = \`# サンプルドキュメント (JSON API v4.1対応)

これはサンプルファイルです。新しいJSON APIの機能を体験できます。

## 新しいZIPダウンロード機能

### 単一ファイル・フォルダのZIP化
\\\`\\\`\\\`json
{
  "action": "download_zip",
  "path": "documents/project"
}
\\\`\\\`\\\`

### 複数ファイル・フォルダのZIP化
\\\`\\\`\\\`json
{
  "action": "download_zip",
  "zipPaths": ["documents/file1.txt", "documents/folder1", "documents/important.pdf"]
}
\\\`\\\`\\\`

### ZIPダウンロードレスポンス例
\\\`\\\`\\\`json
{
  "success": true,
  "action": "download_zip",
  "data": {
    "zipFile": {
      "name": "download_20250608_153045.zip",
      "content": "base64:UEsDBBQAAAAIAEQ...",
      "size": 15728640,
      "sizeFormatted": "15.0 MB",
      "encoding": "base64",
      "itemCount": 5,
      "includedPaths": [
        "documents/file1.txt",
        "documents/folder1",
        "documents/important.pdf"
      ]
    }
  },
  "message": "ZIPファイルを作成しました（5個のアイテム、15.0 MB）"
}
\\\`\\\`\\\`

作成日時: \${new Date().toISOString()}
\`;
    
    await fs.writeFile(path.join(documentsDir, 'sample.md'), sampleContent, 'utf8');
  }
  return userDir;
}

async function initializeMetadataFiles(userDir) {
  const recentUpdatesFile = path.join(userDir, CONFIG.RECENT_UPDATES_FILE);
  if (!existsSync(recentUpdatesFile)) {
    await fs.writeFile(recentUpdatesFile, JSON.stringify([], null, 2), 'utf8');
  }
  
  const favoritesFile = path.join(userDir, CONFIG.FAVORITES_FILE);
  if (!existsSync(favoritesFile)) {
    await fs.writeFile(favoritesFile, JSON.stringify([], null, 2), 'utf8');
  }
}

function sanitizePath(userDir, userPath, allowedAreas = ['documents']) {
  if (!userPath) {
    return path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  }
  
  const normalizedPath = path.normalize(userPath);
  if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
    throw new Error("不正なパスが指定されました");
  }
  
  const pathParts = normalizedPath.split(path.sep);
  const rootFolder = pathParts[0];
  
  if (!allowedAreas.includes(rootFolder)) {
    const fullPath = path.join(userDir, CONFIG.DOCUMENTS_FOLDER, normalizedPath);
    if (!fullPath.startsWith(path.join(userDir, CONFIG.DOCUMENTS_FOLDER) + path.sep) && 
        fullPath !== path.join(userDir, CONFIG.DOCUMENTS_FOLDER)) {
      throw new Error("アクセス権限がありません");
    }
    return fullPath;
  }
  
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

function getDisplayPath(fullPath, userDir, area = 'documents') {
  const areaDir = path.join(userDir, area);
  if (fullPath.startsWith(areaDir + path.sep)) {
    return path.relative(areaDir, fullPath);
  } else if (fullPath === areaDir) {
    return '';
  }
  return path.basename(fullPath);
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
    throw new Error(\`フォルダの階層が深すぎます（最大\${CONFIG.MAX_FOLDER_DEPTH}階層）\`);
  }
}

async function checkUserQuota(userDir, additionalSize = 0) {
  const currentSize = await getDirectorySize(userDir);
  if (currentSize + additionalSize > CONFIG.MAX_USER_QUOTA) {
    const quotaGB = (CONFIG.MAX_USER_QUOTA / (1024 * 1024 * 1024)).toFixed(1);
    const currentGB = (currentSize / (1024 * 1024 * 1024)).toFixed(1);
    const additionalMB = (additionalSize / (1024 * 1024)).toFixed(1);
    throw new Error(\`容量制限を超えています。現在: \${currentGB}GB, 追加: \${additionalMB}MB, 制限: \${quotaGB}GB\`);
  }
}

async function checkUserFileCount(userDir) {
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  const fileCount = await getFileCount(documentsDir);
  if (fileCount >= CONFIG.MAX_FILES_PER_USER) {
    throw new Error(\`ファイル数の上限に達しています（現在: \${fileCount}, 最大: \${CONFIG.MAX_FILES_PER_USER}ファイル）\`);
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

async function addToRecentUpdates(userDir, filePath, action) {
  try {
    const recentUpdatesFile = path.join(userDir, CONFIG.RECENT_UPDATES_FILE);
    let updates = [];
    
    if (existsSync(recentUpdatesFile)) {
      const content = await fs.readFile(recentUpdatesFile, 'utf8');
      updates = JSON.parse(content);
    }
    
    const update = {
      path: filePath,
      action: action,
      timestamp: new Date().toISOString()
    };
    
    updates = updates.filter(u => u.path !== filePath);
    updates.unshift(update);
    
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

async function downloadZip(userDir, zipPaths, user) {
  if (!zipPaths || !Array.isArray(zipPaths) || zipPaths.length === 0) {
    throw new Error("ZIP化するパスが指定されていません");
  }

  const tempDir = path.join(userDir, '.temp');
  if (!existsSync(tempDir)) {
    await fs.mkdir(tempDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
  const zipFileName = \`download_\${timestamp}.zip\`;
  const zipPath = path.join(tempDir, zipFileName);

  // ZIP作成
  await createZipFile(userDir, zipPaths, zipPath);

  // ZIP ファイルサイズをチェック
  const stats = statSync(zipPath);
  if (stats.size > CONFIG.MAX_ZIP_SIZE) {
    await fs.unlink(zipPath);
    const maxSizeMB = (CONFIG.MAX_ZIP_SIZE / 1024 / 1024).toFixed(1);
    const actualSizeMB = (stats.size / 1024 / 1024).toFixed(1);
    throw new Error(\`ZIPファイルサイズが上限を超えています（ファイル: \${actualSizeMB}MB, 最大: \${maxSizeMB}MB）\`);
  }

  // Base64エンコード
  const zipBuffer = await fs.readFile(zipPath);
  const base64Content = 'base64:' + zipBuffer.toString('base64');

  // 一時ファイル削除
  await fs.unlink(zipPath);

  // 有効なパスをカウント
  let validPaths = [];
  for (const zipPath of zipPaths) {
    try {
      const fullPath = sanitizePath(userDir, zipPath, ['documents', 'trash']);
      if (existsSync(fullPath)) {
        validPaths.push(zipPath);
      }
    } catch (error) {
      // 無効なパスは無視
    }
  }

  const zipInfo = {
    name: zipFileName,
    content: base64Content,
    size: stats.size,
    sizeFormatted: formatFileSize(stats.size),
    encoding: 'base64',
    itemCount: validPaths.length,
    includedPaths: validPaths,
    createdAt: new Date().toISOString()
  };

  return createSuccessResponse('download_zip', {
    zipFile: zipInfo
  }, \`ZIPファイルを作成しました（\${validPaths.length}個のアイテム、\${formatFileSize(stats.size)}）\`);
}

async function createZipFile(userDir, zipPaths, outputPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // 最高圧縮レベル
    });

    output.on('close', () => {
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // パスを追加
    for (const zipPath of zipPaths) {
      try {
        const fullPath = sanitizePath(userDir, zipPath, ['documents', 'trash']);
        if (existsSync(fullPath)) {
          const stats = statSync(fullPath);
          const relativeName = path.basename(zipPath);
          
          if (stats.isDirectory()) {
            archive.directory(fullPath, relativeName);
          } else {
            archive.file(fullPath, { name: relativeName });
          }
        }
      } catch (error) {
        // 無効なパスは無視
        console.warn(\`Invalid path skipped: \${zipPath}\`);
      }
    }

    archive.finalize();
  });
}

async function createFolder(userDir, userPath, user) {
  if (!userPath) throw new Error("フォルダパスが必要です");
  const targetPath = sanitizePath(userDir, userPath);
  checkFolderDepth(userDir, targetPath);
  if (existsSync(targetPath)) throw new Error("同名のファイルまたはフォルダが既に存在します");
  await fs.mkdir(targetPath, { recursive: true });
  
  const displayPath = getDisplayPath(targetPath, userDir, 'documents');
  const relativePath = path.relative(path.join(userDir, CONFIG.DOCUMENTS_FOLDER), targetPath);
  await addToRecentUpdates(userDir, relativePath, 'create_folder');
  
  return createSuccessResponse('create_folder', {
    folder: {
      name: path.basename(targetPath),
      path: displayPath,
      fullPath: relativePath,
      isDirectory: true,
      createdDate: new Date().toISOString()
    }
  }, \`フォルダ「\${displayPath || '(ルート)'}」を作成しました\`);
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
    throw new Error(\`ファイルサイズが上限を超えています（ファイル: \${actualSizeMB}MB, 最大: \${maxSizeMB}MB）\`);
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
  
  const displayPath = getDisplayPath(targetPath, userDir, 'documents');
  const relativePath = path.relative(path.join(userDir, CONFIG.DOCUMENTS_FOLDER), targetPath);
  await addToRecentUpdates(userDir, relativePath, 'create');
  
  const fileInfo = {
    name: path.basename(targetPath),
    path: displayPath,
    fullPath: relativePath,
    isDirectory: false,
    size: fileSize,
    sizeFormatted: formatFileSize(fileSize),
    extension: path.extname(targetPath),
    isExecutable: isExecutableFile(targetPath),
    isBinary: isBinary,
    createdDate: new Date().toISOString()
  };
  
  return createSuccessResponse('create_file', {
    file: fileInfo
  }, \`ファイル「\${displayPath}」を作成しました（\${formatFileSize(fileSize)}）\`);
}

async function readFile(userDir, userPath, user) {
  if (!userPath) throw new Error("ファイルパスが必要です");
  const targetPath = sanitizePath(userDir, userPath, ['documents', 'trash']);
  if (!existsSync(targetPath)) throw new Error("ファイルが見つかりません");
  const stats = statSync(targetPath);
  if (!stats.isFile()) throw new Error("指定されたパスはファイルではありません");
  
  let content;
  let fileType;
  let encoding = 'text';
  
  if (isTextFile(targetPath)) {
    try {
      content = await fs.readFile(targetPath, 'utf8');
      fileType = 'text';
    } catch (error) {
      const buffer = await fs.readFile(targetPath);
      content = 'base64:' + buffer.toString('base64');
      fileType = 'binary';
      encoding = 'base64';
    }
  } else {
    const buffer = await fs.readFile(targetPath);
    content = 'base64:' + buffer.toString('base64');
    fileType = 'binary';
    encoding = 'base64';
  }
  
  let displayPath;
  if (targetPath.includes('/trash/')) {
    displayPath = getDisplayPath(targetPath, userDir, 'trash');
  } else {
    displayPath = getDisplayPath(targetPath, userDir, 'documents');
  }
  
  const fileInfo = {
    name: path.basename(targetPath),
    path: displayPath,
    content: content,
    size: stats.size,
    sizeFormatted: formatFileSize(stats.size),
    modifiedDate: stats.mtime.toISOString(),
    fileType: fileType,
    encoding: encoding,
    isExecutable: isExecutableFile(targetPath),
    extension: path.extname(targetPath)
  };
  
  return createSuccessResponse('read_file', {
    file: fileInfo
  }, \`ファイル「\${displayPath}」を読み込みました\`);
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
    throw new Error(\`ファイルサイズが上限を超えています（ファイル: \${actualSizeMB}MB, 最大: \${maxSizeMB}MB）\`);
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
  
  const displayPath = getDisplayPath(targetPath, userDir, 'documents');
  const relativePath = path.relative(path.join(userDir, CONFIG.DOCUMENTS_FOLDER), targetPath);
  await addToRecentUpdates(userDir, relativePath, 'update');
  
  const fileInfo = {
    name: path.basename(targetPath),
    path: displayPath,
    fullPath: relativePath,
    isDirectory: false,
    size: fileSize,
    sizeFormatted: formatFileSize(fileSize),
    previousSize: currentSize,
    sizeDiff: sizeDiff,
    extension: path.extname(targetPath),
    isExecutable: isExecutableFile(targetPath),
    isBinary: isBinary,
    modifiedDate: new Date().toISOString()
  };
  
  return createSuccessResponse('update_file', {
    file: fileInfo
  }, \`ファイル「\${displayPath}」を更新しました（\${formatFileSize(fileSize)}）\`);
}

async function listDirectory(userDir, userPath = '', user) {
  const targetPath = sanitizePath(userDir, userPath, ['documents', 'trash']);
  if (!existsSync(targetPath)) throw new Error("ディレクトリが見つかりません");
  const stats = statSync(targetPath);
  if (!stats.isDirectory()) throw new Error("指定されたパスはディレクトリではありません");
  
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  
  const files = [];
  const folders = [];
  
  const isTrashArea = targetPath.includes('/trash/');
  const areaName = isTrashArea ? 'trash' : 'documents';
  
  for (const entry of entries) {
    const itemFullPath = path.join(targetPath, entry.name);
    const itemDisplayPath = getDisplayPath(itemFullPath, userDir, areaName);
    
    if (entry.isDirectory()) {
      folders.push({
        name: entry.name,
        path: itemDisplayPath,
        isDirectory: true,
        size: 0,
        modifiedDate: statSync(itemFullPath).mtime.toISOString(),
        isExecutable: false
      });
    } else {
      const itemStats = statSync(itemFullPath);
      files.push({
        name: entry.name,
        path: itemDisplayPath,
        isDirectory: false,
        size: itemStats.size,
        sizeFormatted: formatFileSize(itemStats.size),
        modifiedDate: itemStats.mtime.toISOString(),
        extension: path.extname(entry.name),
        isExecutable: isExecutableFile(itemFullPath),
        isTextFile: isTextFile(itemFullPath)
      });
    }
  }
  
  const currentDisplayPath = getDisplayPath(targetPath, userDir, areaName);
  
  return createSuccessResponse('list', {
    currentPath: currentDisplayPath || '',
    area: areaName,
    folders: folders,
    files: files,
    totalItems: folders.length + files.length,
    folderCount: folders.length,
    fileCount: files.length
  }, \`ディレクトリ「\${currentDisplayPath || '(ルート)'}」を一覧表示しました（\${folders.length + files.length}件）\`);
}

async function searchFiles(userDir, query, searchType, user) {
  if (!query) throw new Error("検索クエリが必要です");
  const results = [];
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  await searchInDirectory(documentsDir, '', query, searchType, results);
  
  const searchResults = results.map(result => ({
    name: path.basename(result.path),
    path: result.path.startsWith('documents/') ? result.path.substring(10) : result.path,
    isDirectory: result.path.endsWith('/'),
    size: result.size || 0,
    sizeFormatted: result.size ? formatFileSize(result.size) : '0 B',
    modifiedDate: result.modifiedDate || new Date().toISOString(),
    extension: path.extname(result.path),
    isExecutable: isExecutableFile(result.path),
    contentMatch: result.contentMatch,
    matchType: result.contentMatch ? 'content' : 'filename'
  }));
  
  return createSuccessResponse('search', {
    query: query,
    searchType: searchType,
    results: searchResults,
    totalResults: searchResults.length
  }, \`「\${query}」の検索結果：\${searchResults.length}件見つかりました\`);
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
          results.push({ 
            path: itemRelativePath + '/', 
            contentMatch: null,
            size: 0,
            modifiedDate: statSync(itemFullPath).mtime.toISOString()
          });
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
          const stats = statSync(itemFullPath);
          results.push({ 
            path: itemRelativePath, 
            contentMatch: contentMatch,
            size: stats.size,
            modifiedDate: stats.mtime.toISOString()
          });
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
  
  const sourceDisplayPath = getDisplayPath(sourceFullPath, userDir, 'documents');
  const destDisplayPath = getDisplayPath(destFullPath, userDir, 'documents');
  
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  const sourceRelativePath = path.relative(documentsDir, sourceFullPath);
  const destRelativePath = path.relative(documentsDir, destFullPath);
  
  await removeFromRecentUpdates(userDir, sourceRelativePath);
  await addToRecentUpdates(userDir, destRelativePath, 'move');
  await updateFavoritesPath(userDir, sourceRelativePath, destRelativePath);
  
  const itemInfo = {
    name: path.basename(destFullPath),
    sourcePath: sourceDisplayPath,
    destPath: destDisplayPath,
    fullSourcePath: sourceRelativePath,
    fullDestPath: destRelativePath,
    isDirectory: sourceStats.isDirectory(),
    size: sourceStats.isFile() ? sourceStats.size : 0,
    sizeFormatted: sourceStats.isFile() ? formatFileSize(sourceStats.size) : '0 B',
    movedDate: new Date().toISOString()
  };
  
  return createSuccessResponse('move', {
    item: itemInfo
  }, \`「\${sourceDisplayPath}」を「\${destDisplayPath}」に移動しました\`);
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
  
  const sourceDisplayPath = getDisplayPath(sourceFullPath, userDir, 'documents');
  const destDisplayPath = getDisplayPath(destFullPath, userDir, 'documents');
  
  if (sourceStats.isDirectory()) {
    await copyDirectory(sourceFullPath, destFullPath);
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
  }
  
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  const destRelativePath = path.relative(documentsDir, destFullPath);
  await addToRecentUpdates(userDir, destRelativePath, 'copy');
  
  const itemInfo = {
    name: path.basename(destFullPath),
    sourcePath: sourceDisplayPath,
    destPath: destDisplayPath,
    fullDestPath: destRelativePath,
    isDirectory: sourceStats.isDirectory(),
    size: sourceStats.isFile() ? sourceStats.size : await getDirectorySize(destFullPath),
    sizeFormatted: sourceStats.isFile() ? formatFileSize(sourceStats.size) : formatFileSize(await getDirectorySize(destFullPath)),
    copiedDate: new Date().toISOString()
  };
  
  return createSuccessResponse('copy', {
    item: itemInfo
  }, \`「\${sourceDisplayPath}」を「\${destDisplayPath}」にコピーしました\`);
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

async function getRecentUpdates(userDir, user, limit) {
  const recentUpdatesFile = path.join(userDir, CONFIG.RECENT_UPDATES_FILE);
  
  if (!existsSync(recentUpdatesFile)) {
    return createSuccessResponse('get_recent_updates', {
      updates: [],
      totalUpdates: 0,
      limit: limit
    }, '最近の更新はありません');
  }
  
  const content = await fs.readFile(recentUpdatesFile, 'utf8');
  const updates = JSON.parse(content);
  
  if (updates.length === 0) {
    return createSuccessResponse('get_recent_updates', {
      updates: [],
      totalUpdates: 0,
      limit: limit
    }, '最近の更新はありません');
  }
  
  const limitedUpdates = updates.slice(0, limit);
  const formattedUpdates = limitedUpdates.map(update => ({
    name: path.basename(update.path),
    path: update.path,
    action: update.action,
    timestamp: update.timestamp,
    isDirectory: update.action === 'create_folder',
    actionIcon: {
      'create': '✨',
      'create_folder': '📁',
      'update': '✏️',
      'move': '📦',
      'copy': '📋',
      'restore': '♻️'
    }[update.action] || '📄'
  }));
  
  return createSuccessResponse('get_recent_updates', {
    updates: formattedUpdates,
    totalUpdates: updates.length,
    limit: limit,
    requestedLimit: limit
  }, \`最近の更新：\${limitedUpdates.length}件を表示しています\`);
}

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
  
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  const relativePath = path.relative(documentsDir, targetPath);
  
  if (favorites.some(fav => fav.path === relativePath)) {
    return createSuccessResponse('add_to_favorites', {
      item: {
        name: path.basename(relativePath),
        path: relativePath,
        alreadyExists: true
      }
    }, \`「\${path.basename(relativePath)}」は既にお気に入りに登録済みです\`);
  }
  
  if (favorites.length >= CONFIG.MAX_FAVORITES) {
    throw new Error(\`お気に入りの最大件数(\${CONFIG.MAX_FAVORITES}件)に達しています\`);
  }
  
  const stats = statSync(targetPath);
  const favorite = {
    path: relativePath,
    name: path.basename(relativePath),
    type: stats.isDirectory() ? 'folder' : 'file',
    addedAt: new Date().toISOString(),
    size: stats.isFile() ? stats.size : 0,
    extension: stats.isFile() ? path.extname(relativePath) : null
  };
  
  favorites.push(favorite);
  await fs.writeFile(favoritesFile, JSON.stringify(favorites, null, 2), 'utf8');
  
  return createSuccessResponse('add_to_favorites', {
    item: favorite,
    totalFavorites: favorites.length
  }, \`「\${favorite.name}」をお気に入りに追加しました\`);
}

async function removeFromFavorites(userDir, filePath, user) {
  if (!filePath) throw new Error("ファイルパスが必要です");
  
  const favoritesFile = path.join(userDir, CONFIG.FAVORITES_FILE);
  if (!existsSync(favoritesFile)) {
    return createSuccessResponse('remove_from_favorites', {
      removed: false,
      totalFavorites: 0
    }, 'お気に入りは空です');
  }
  
  const content = await fs.readFile(favoritesFile, 'utf8');
  let favorites = JSON.parse(content);
  
  let relativePath = filePath;
  if (filePath.startsWith('documents/')) {
    relativePath = filePath.substring('documents/'.length);
  }
  
  const initialLength = favorites.length;
  const removedItem = favorites.find(fav => fav.path === relativePath);
  favorites = favorites.filter(fav => fav.path !== relativePath);
  
  if (favorites.length === initialLength) {
    return createSuccessResponse('remove_from_favorites', {
      removed: false,
      item: {
        name: path.basename(relativePath),
        path: relativePath
      },
      totalFavorites: favorites.length
    }, \`「\${path.basename(relativePath)}」はお気に入りに登録されていません\`);
  }
  
  await fs.writeFile(favoritesFile, JSON.stringify(favorites, null, 2), 'utf8');
  
  return createSuccessResponse('remove_from_favorites', {
    removed: true,
    item: removedItem,
    totalFavorites: favorites.length
  }, \`「\${removedItem.name}」をお気に入りから削除しました\`);
}

async function getFavorites(userDir, user) {
  const favoritesFile = path.join(userDir, CONFIG.FAVORITES_FILE);
  
  if (!existsSync(favoritesFile)) {
    return createSuccessResponse('get_favorites', {
      favorites: [],
      totalFavorites: 0
    }, 'お気に入りはありません');
  }
  
  const content = await fs.readFile(favoritesFile, 'utf8');
  const favorites = JSON.parse(content);
  
  if (favorites.length === 0) {
    return createSuccessResponse('get_favorites', {
      favorites: [],
      totalFavorites: 0
    }, 'お気に入りはありません');
  }
  
  const formattedFavorites = favorites.map(favorite => {
    const fullPath = path.join(userDir, CONFIG.DOCUMENTS_FOLDER, favorite.path);
    const exists = existsSync(fullPath);
    
    return {
      name: favorite.name,
      path: favorite.path,
      type: favorite.type,
      isDirectory: favorite.type === 'folder',
      addedAt: favorite.addedAt,
      size: favorite.size || 0,
      sizeFormatted: favorite.size ? formatFileSize(favorite.size) : '0 B',
      extension: favorite.extension,
      exists: exists,
      icon: favorite.type === 'folder' ? '📁' : '📄'
    };
  });
  
  return createSuccessResponse('get_favorites', {
    favorites: formattedFavorites,
    totalFavorites: formattedFavorites.length,
    existingCount: formattedFavorites.filter(f => f.exists).length,
    missingCount: formattedFavorites.filter(f => !f.exists).length
  }, \`お気に入り：\${formattedFavorites.length}件\`);
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

async function moveToTrash(userDir, userPath, user) {
  if (!userPath) throw new Error("削除するパスが必要です");
  const sourcePath = sanitizePath(userDir, userPath);
  if (!existsSync(sourcePath)) throw new Error("ファイルまたはフォルダが見つかりません");
  
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  const trashDir = path.join(userDir, CONFIG.TRASH_FOLDER);
  const relativePath = path.relative(documentsDir, sourcePath);
  
  let trashFileName = path.basename(relativePath);
  let trashPath = path.join(trashDir, trashFileName);
  let counter = 1;
  
  while (existsSync(trashPath)) {
    const ext = path.extname(trashFileName);
    const nameWithoutExt = path.basename(trashFileName, ext);
    trashFileName = \`\${nameWithoutExt}_\${counter}\${ext}\`;
    trashPath = path.join(trashDir, trashFileName);
    counter++;
  }
  
  const stats = statSync(sourcePath);
  await fs.rename(sourcePath, trashPath);
  
  const metaData = {
    originalPath: relativePath,
    deletedAt: new Date().toISOString(),
    type: stats.isDirectory() ? 'folder' : 'file',
    originalSize: stats.isFile() ? stats.size : 0
  };
  
  await fs.writeFile(trashPath + '.meta', JSON.stringify(metaData, null, 2), 'utf8');
  
  await removeFromRecentUpdates(userDir, relativePath);
  await removeFromFavorites(userDir, relativePath, user);
  
  const itemInfo = {
    name: path.basename(relativePath),
    originalPath: relativePath,
    trashPath: trashFileName,
    isDirectory: stats.isDirectory(),
    size: stats.isFile() ? stats.size : 0,
    sizeFormatted: stats.isFile() ? formatFileSize(stats.size) : '0 B',
    deletedAt: metaData.deletedAt
  };
  
  return createSuccessResponse('move_to_trash', {
    item: itemInfo
  }, \`「\${path.basename(relativePath)}」をゴミ箱に移動しました\`);
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
  
  const metaDataPath = fullTrashPath + '.meta';
  if (!existsSync(metaDataPath)) {
    throw new Error("復元用のメタデータが見つかりません");
  }
  
  const metaDataContent = await fs.readFile(metaDataPath, 'utf8');
  const metaData = JSON.parse(metaDataContent);
  
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  const restorePath = path.join(documentsDir, metaData.originalPath);
  
  let finalRestorePath = restorePath;
  let counter = 1;
  
  while (existsSync(finalRestorePath)) {
    const ext = path.extname(metaData.originalPath);
    const nameWithoutExt = path.basename(metaData.originalPath, ext);
    const dir = path.dirname(metaData.originalPath);
    const newName = \`\${nameWithoutExt}_restored_\${counter}\${ext}\`;
    finalRestorePath = path.join(documentsDir, dir, newName);
    counter++;
  }
  
  const parentDir = path.dirname(finalRestorePath);
  if (!existsSync(parentDir)) {
    await fs.mkdir(parentDir, { recursive: true });
  }
  
  await fs.rename(fullTrashPath, finalRestorePath);
  await fs.unlink(metaDataPath);
  
  const newRelativePath = path.relative(documentsDir, finalRestorePath);
  await addToRecentUpdates(userDir, newRelativePath, 'restore');
  
  const itemInfo = {
    name: path.basename(finalRestorePath),
    originalPath: metaData.originalPath,
    restoredPath: newRelativePath,
    trashPath: path.basename(fullTrashPath),
    isDirectory: metaData.type === 'folder',
    size: metaData.originalSize || 0,
    sizeFormatted: metaData.originalSize ? formatFileSize(metaData.originalSize) : '0 B',
    deletedAt: metaData.deletedAt,
    restoredAt: new Date().toISOString()
  };
  
  return createSuccessResponse('restore_from_trash', {
    item: itemInfo
  }, \`「\${itemInfo.name}」をゴミ箱から復元しました\`);
}

async function listTrash(userDir, user) {
  const trashDir = path.join(userDir, CONFIG.TRASH_FOLDER);
  
  if (!existsSync(trashDir)) {
    return createSuccessResponse('list_trash', {
      trashItems: [],
      totalItems: 0
    }, 'ゴミ箱は空です');
  }
  
  const entries = await fs.readdir(trashDir, { withFileTypes: true });
  const trashItems = entries.filter(entry => !entry.name.endsWith('.meta'));
  
  if (trashItems.length === 0) {
    return createSuccessResponse('list_trash', {
      trashItems: [],
      totalItems: 0
    }, 'ゴミ箱は空です');
  }
  
  const formattedItems = [];
  
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
    
    const stats = statSync(itemPath);
    
    formattedItems.push({
      name: entry.name,
      path: entry.name,
      isDirectory: entry.isDirectory(),
      size: entry.isFile() ? stats.size : 0,
      sizeFormatted: entry.isFile() ? formatFileSize(stats.size) : '0 B',
      originalPath: metaData ? metaData.originalPath : 'unknown',
      deletedAt: metaData ? metaData.deletedAt : 'unknown',
      type: metaData ? metaData.type : (entry.isDirectory() ? 'folder' : 'file'),
      extension: entry.isFile() ? path.extname(entry.name) : null,
      icon: entry.isDirectory() ? '📁' : '📄'
    });
  }
  
  return createSuccessResponse('list_trash', {
    trashItems: formattedItems,
    totalItems: formattedItems.length,
    folderCount: formattedItems.filter(item => item.isDirectory).length,
    fileCount: formattedItems.filter(item => !item.isDirectory).length
  }, \`ゴミ箱：\${formattedItems.length}件のアイテム\`);
}

async function emptyTrash(userDir, user) {
  const trashDir = path.join(userDir, CONFIG.TRASH_FOLDER);
  
  if (!existsSync(trashDir)) {
    return createSuccessResponse('empty_trash', {
      deletedCount: 0,
      reclaimedSpace: 0,
      reclaimedSpaceFormatted: '0 B'
    }, 'ゴミ箱は既に空です');
  }
  
  const entries = await fs.readdir(trashDir, { withFileTypes: true });
  
  if (entries.length === 0) {
    return createSuccessResponse('empty_trash', {
      deletedCount: 0,
      reclaimedSpace: 0,
      reclaimedSpaceFormatted: '0 B'
    }, 'ゴミ箱は既に空です');
  }
  
  let deletedCount = 0;
  let reclaimedSpace = 0;
  
  for (const entry of entries) {
    const itemPath = path.join(trashDir, entry.name);
    
    if (entry.isDirectory()) {
      reclaimedSpace += await getDirectorySize(itemPath);
      await fs.rmdir(itemPath, { recursive: true });
      deletedCount++;
    } else {
      if (!entry.name.endsWith('.meta')) {
        const stats = statSync(itemPath);
        reclaimedSpace += stats.size;
        deletedCount++;
      }
      await fs.unlink(itemPath);
    }
  }
  
  return createSuccessResponse('empty_trash', {
    deletedCount: deletedCount,
    reclaimedSpace: reclaimedSpace,
    reclaimedSpaceFormatted: formatFileSize(reclaimedSpace)
  }, \`ゴミ箱を空にしました：\${deletedCount}件のアイテムを完全削除（\${formatFileSize(reclaimedSpace)}を回収）\`);
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
  const fileName = path.basename(fullTrashPath);
  const size = stats.isFile() ? stats.size : await getDirectorySize(fullTrashPath);
  
  if (stats.isDirectory()) {
    await fs.rmdir(fullTrashPath, { recursive: true });
  } else {
    await fs.unlink(fullTrashPath);
  }
  
  const metaDataPath = fullTrashPath + '.meta';
  if (existsSync(metaDataPath)) {
    await fs.unlink(metaDataPath);
  }
  
  const itemInfo = {
    name: fileName,
    path: trashPath,
    isDirectory: stats.isDirectory(),
    size: size,
    sizeFormatted: formatFileSize(size),
    deletedAt: new Date().toISOString()
  };
  
  return createSuccessResponse('permanently_delete', {
    item: itemInfo,
    reclaimedSpace: size,
    reclaimedSpaceFormatted: formatFileSize(size)
  }, \`「\${fileName}」を完全削除しました（\${formatFileSize(size)}を回収）\`);
}

async function getQuotaInfo(userDir, user) {
  const usedSize = await getDirectorySize(userDir);
  const documentsDir = path.join(userDir, CONFIG.DOCUMENTS_FOLDER);
  const trashDir = path.join(userDir, CONFIG.TRASH_FOLDER);
  const documentsSize = await getDirectorySize(documentsDir);
  const trashSize = await getDirectorySize(trashDir);
  const fileCount = await getFileCount(documentsDir);
  
  const totalCapacity = CONFIG.MAX_USER_QUOTA;
  const usagePercent = (usedSize / totalCapacity) * 100;
  const remainingSize = Math.max(0, totalCapacity - usedSize);
  
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
  
  const quotaInfo = {
    used: formatFileSize(usedSize),
    total: formatFileSize(totalCapacity),
    remaining: formatFileSize(remainingSize),
    percentage: Math.round(usagePercent * 100) / 100,
    fileCount: fileCount,
    maxFiles: CONFIG.MAX_FILES_PER_USER,
    details: {
      documentsSize: formatFileSize(documentsSize),
      trashSize: formatFileSize(trashSize),
      recentUpdatesCount: recentUpdatesCount,
      favoritesCount: favoritesCount,
      maxRecentUpdates: CONFIG.MAX_RECENT_UPDATES,
      maxFavorites: CONFIG.MAX_FAVORITES
    },
    limits: {
      maxFileSize: formatFileSize(CONFIG.MAX_FILE_SIZE),
      maxFolderDepth: CONFIG.MAX_FOLDER_DEPTH,
      maxZipSize: formatFileSize(CONFIG.MAX_ZIP_SIZE),
      totalCapacity: formatFileSize(totalCapacity)
    },
    user: {
      id: user.id,
      name: user.name,
      email: user.email || 'N/A'
    }
  };
  
  return createSuccessResponse('get_quota', quotaInfo, 
    \`容量使用状況：\${formatFileSize(usedSize)} / \${formatFileSize(totalCapacity)} (\${Math.round(usagePercent)}%)\`);
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
    
    const logFile = path.join(logDir, \`\${new Date().toISOString().split('T')[0]}.log\`);
    await fs.appendFile(logFile, JSON.stringify(logEntry) + '\\n', 'utf8');
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
}`;

const SECURE_FILE_MANAGER_ICON = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" 
        fill="#86EFAC" stroke="#22C55E" stroke-width="2"/>
  <polyline points="14,2 14,8 20,8" fill="#22C55E"/>
  
  <path d="M12 10l-2 2 2 2 4-4z" fill="#15803D" stroke="#15803D" stroke-width="1"/>
  <circle cx="12" cy="13" r="3" fill="none" stroke="#15803D" stroke-width="1.5"/>
  
  <circle cx="7" cy="6" r="1.5" fill="none" stroke="#22C55E" stroke-width="0.8"/>
  <path d="M7 5.5v1l0.5 0.5" stroke="#22C55E" stroke-width="0.6"/>
  
  <path d="M10 4.5l0.5 1 1 0.2-0.7 0.7 0.2 1-0.9-0.5-0.9 0.5 0.2-1-0.7-0.7 1-0.2z" 
        fill="#FCD34D" stroke="#F59E0B" stroke-width="0.3"/>
  
  <rect x="15.5" y="17" width="2" height="2.5" fill="none" stroke="#EF4444" stroke-width="0.8"/>
  <path d="M15.5 17h2M16 16.5v-0.5M17 16.5v-0.5" stroke="#EF4444" stroke-width="0.6"/>
  
  <rect x="6" y="18" width="8" height="1" fill="#86EFAC"/>
  <rect x="6" y="18" width="5" height="1" fill="#22C55E"/>
  <text x="6.5" y="19.8" font-size="2" fill="#15803D">JSON</text>
</svg>`;

// =============================================================================
// インストール処理
// =============================================================================

async function installEnhancedSecureFileManager() {
  try {
    console.log('🛠️ 拡張セキュアファイル管理ツール (v4.0.0・JSON対応版) をインストールしています...');
    
    if (!existsSync(TOOLS_DIR)) {
      console.log('📁 YourToolディレクトリを作成しています...');
      await fs.mkdir(TOOLS_DIR, { recursive: true });
    }
    
    const secureUserFileManagerDir = path.join(TOOLS_DIR, 'LocalDrive');
    if (existsSync(secureUserFileManagerDir)) {
      console.log('⚠️  LocalDrive ディレクトリが既に存在します。上書きします...');
      await fs.rmdir(secureUserFileManagerDir, { recursive: true });
    }
    
    await fs.mkdir(secureUserFileManagerDir, { recursive: true });
    
    console.log('📄 LocalDrive/config.json を作成しています...');
    await fs.writeFile(
      path.join(secureUserFileManagerDir, 'config.json'),
      JSON.stringify(LocalDrive_CONFIG, null, 2),
      'utf8'
    );
    
    console.log('⚙️ LocalDrive/handler.js を作成しています...');
    await fs.writeFile(
      path.join(secureUserFileManagerDir, 'handler.js'),
      LocalDrive_HANDLER,
      'utf8'
    );
    
    console.log('🎨 LocalDrive/icon を作成しています...');
    await fs.writeFile(
      path.join(secureUserFileManagerDir, 'secure_file_manager_icon.svg'),
      SECURE_FILE_MANAGER_ICON,
      'utf8'
    );
    
    const readmeContent = `# 拡張セキュアファイル管理ツール v4.0.0 (JSON対応版)

## v4.0.0 の主要な改善点

### 🎯 JSON構造化レスポンス
- **統一されたAPI応答**: 全ての操作結果がJSON形式で返されます
- **構造化データ**: ファイル情報、メタデータ、エラー情報が明確に分離
- **一貫性の向上**: パース処理の簡素化とエラー削減

### 📊 強化されたデータ構造

#### ファイル一覧レスポンス例
\`\`\`json
{
  "success": true,
  "action": "list",
  "data": {
    "currentPath": "",
    "area": "documents",
    "folders": [
      {
        "name": "projects",
        "path": "projects",
        "isDirectory": true,
        "size": 0,
        "modifiedDate": "2025-06-08T15:30:45.123Z",
        "isExecutable": false
      }
    ],
    "files": [
      {
        "name": "sample.txt",
        "path": "sample.txt",
        "isDirectory": false,
        "size": 2048,
        "sizeFormatted": "2.0 KB",
        "modifiedDate": "2025-06-08T15:30:45.123Z",
        "extension": ".txt",
        "isExecutable": false,
        "isTextFile": true
      }
    ],
    "totalItems": 2,
    "folderCount": 1,
    "fileCount": 1
  },
  "message": "ディレクトリ「(ルート)」を一覧表示しました（2件）",
  "timestamp": "2025-06-08T15:30:45.123Z"
}
\`\`\`

#### クォータ情報レスポンス例
\`\`\`json
{
  "success": true,
  "action": "get_quota",
  "data": {
    "used": "512.5 MB",
    "total": "1 GB",
    "remaining": "511.5 MB",
    "percentage": 51.25,
    "fileCount": 127,
    "maxFiles": 10000,
    "details": {
      "documentsSize": "480.2 MB",
      "trashSize": "32.3 MB",
      "recentUpdatesCount": 15,
      "favoritesCount": 8,
      "maxRecentUpdates": 100,
      "maxFavorites": 200
    },
    "limits": {
      "maxFileSize": "450 MB",
      "maxFolderDepth": 15,
      "totalCapacity": "1 GB"
    },
    "user": {
      "id": "user123",
      "name": "ユーザー123",
      "email": "user@example.com"
    }
  },
  "message": "容量使用状況：512.5 MB / 1 GB (51%)",
  "timestamp": "2025-06-08T15:30:45.123Z"
}
\`\`\`

### 🔧 技術的改善点

#### 1. レスポンス構造の統一
- **成功レスポンス**: \`success: true\` + \`data\` + \`message\`
- **エラーレスポンス**: \`success: false\` + \`error\` + \`details\`
- **タイムスタンプ**: 全レスポンスにISO 8601形式の日時

#### 2. データ完全性の向上
- **ファイルサイズ**: バイト数 + フォーマット済み文字列
- **日時情報**: ISO 8601形式で統一
- **メタデータ**: 拡張子、実行可能性、ファイルタイプ

#### 3. エラーハンドリングの強化
- **詳細なエラー情報**: エラーメッセージ + 追加詳細
- **操作トレーサビリティ**: 全操作のログ記録
- **堅牢性向上**: 部分的失敗への対応

## 主要機能（JSON対応済み）

### ①ファイル管理サービス
- **CRUD操作**: 作成・読取・更新・削除（全てJSON形式）
- **メタデータ**: サイズ、日時、拡張子、権限情報
- **バイナリサポート**: Base64エンコーディング対応

### ②最近の更新
- **構造化履歴**: アクション、タイムスタンプ、ファイル情報
- **アイコン付き**: 操作タイプ別のビジュアル表示
- **フィルタリング**: 件数制限とページネーション

### ③お気に入り
- **詳細情報**: ファイルタイプ、追加日時、存在確認
- **管理機能**: 追加・削除・一覧（全てJSON形式）
- **統計情報**: 総数、存在数、欠損数

### ④ゴミ箱
- **メタデータ保持**: 元の場所、削除日時、ファイルサイズ
- **復元機能**: 詳細な復元情報をJSON形式で提供
- **容量回収**: 削除時の容量回収量を正確に計算

### ⑤クォータ管理
- **詳細分析**: エリア別使用量、制限情報、ユーザー情報
- **リアルタイム**: 正確な使用量計算と残容量
- **制限管理**: ファイル数、サイズ、階層制限

## 開発者向け情報

### API エンドポイント
全ての操作で統一されたJSON形式のレスポンスを提供：

- \`list\`: ディレクトリ一覧
- \`get_quota\`: 容量情報
- \`get_recent_updates\`: 最近の更新
- \`get_favorites\`: お気に入り一覧
- \`list_trash\`: ゴミ箱一覧

### レスポンス形式
\`\`\`typescript
interface SuccessResponse {
  success: true;
  action: string;
  data: any;
  message: string;
  timestamp: string; // ISO 8601
}

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    details?: any;
  };
  timestamp: string; // ISO 8601
}
\`\`\`

## 移行ガイド

### 従来版からの変更点
1. **レスポンス形式**: テキスト → JSON構造
2. **エラー処理**: 文字列 → 構造化オブジェクト
3. **メタデータ**: 基本情報 → 詳細情報
4. **パフォーマンス**: パース処理の高速化

### 推奨される実装
- JSON.parse() でのレスポンス解析
- success フィールドでの成功/失敗判定
- data フィールドからの情報取得
- timestamp フィールドでの操作時刻記録

## インストール後の確認

1. OneAgentサーバーでツールをリロード
2. JSON形式のレスポンス確認
3. 全機能の正常動作確認
4. Dashboard側の対応確認
`;

    await fs.writeFile(
      path.join(TOOLS_DIR, 'ENHANCED_SECURE_FILE_MANAGER_JSON_README.md'),
      readmeContent,
      'utf8'
    );
    
    console.log('\n✅ 拡張セキュアファイル管理ツール v4.0.0 (JSON対応版) のインストールが完了しました！');
    console.log(`📁 インストール場所: ${TOOLS_DIR}`);
    
  } catch (error) {
    console.error('❌ インストール中にエラーが発生しました:', error.message);
    process.exit(1);
  }
}

// メイン実行
installEnhancedSecureFileManager();