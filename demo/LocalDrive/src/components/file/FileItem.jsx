import React, { useState, useRef } from 'react'
import { 
  Folder, 
  File, 
  FileText, 
  FileCode, 
  Database, 
  Settings, 
  Zap, 
  Terminal,
  Archive,
  Image,
  MoreVertical,
  Check,
  Star,
  Clock,
  Trash2,
  RotateCcw,
  Heart,
  Music,
  Video,
  FileSpreadsheet,
  Presentation
} from 'lucide-react'
import { formatFileSize, formatRelativeTime, truncateText } from '../../utils/formatUtils.js'
import { getFileExtension, isDirectory, isExecutableFile, isImageFile, isTextFile, isAudioFile, isVideoFile } from '../../utils/fileUtils.js'

/**
 * ファイルアイテムコンポーネント（v3.0.0対応・完全実装）
 * 新機能：お気に入り表示、ゴミ箱メタデータ、最近の更新表示、名前変更、ドラッグ&ドロップ
 * 改善：直接お気に入りボタンを追加
 */
const FileItem = ({
  file,
  isSelected = false,
  isRenaming = false,
  isDragging = false,
  isFavorite = false,
  viewMode = 'grid',
  currentPath = '',
  onClick,
  onDoubleClick,
  onSelect,
  onContextMenu,
  onRename,
  onToggleFavorite,
  onDragStart,
  onDragEnd,
  onDrop,
  className = ''
}) => {
  const [editName, setEditName] = useState(file.name);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);
  
  // 名前変更モードになった時にフォーカス
  React.useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  // ファイルアイコンを取得（v3.0.0対応・拡張版）
  const getFileIcon = () => {
    if (isDirectory(file.name)) {
      return <Folder className="w-8 h-8 text-blue-500" />
    }
    
    const extension = getFileExtension(file.name)
    
    // ファイルタイプに応じたアイコン（拡張版）
    const iconMap = {
      // テキストファイル
      '.txt': <FileText className="w-8 h-8 text-gray-600" />,
      '.md': <FileText className="w-8 h-8 text-blue-600" />,
      '.log': <FileText className="w-8 h-8 text-gray-500" />,
      '.rtf': <FileText className="w-8 h-8 text-blue-500" />,
      
      // コードファイル
      '.js': <FileCode className="w-8 h-8 text-yellow-600" />,
      '.jsx': <FileCode className="w-8 h-8 text-blue-600" />,
      '.ts': <FileCode className="w-8 h-8 text-blue-700" />,
      '.tsx': <FileCode className="w-8 h-8 text-blue-700" />,
      '.html': <FileCode className="w-8 h-8 text-orange-600" />,
      '.css': <FileCode className="w-8 h-8 text-blue-500" />,
      '.scss': <FileCode className="w-8 h-8 text-pink-600" />,
      '.py': <FileCode className="w-8 h-8 text-green-600" />,
      '.java': <FileCode className="w-8 h-8 text-red-600" />,
      '.cpp': <FileCode className="w-8 h-8 text-blue-800" />,
      '.c': <FileCode className="w-8 h-8 text-gray-700" />,
      '.php': <FileCode className="w-8 h-8 text-purple-600" />,
      '.rb': <FileCode className="w-8 h-8 text-red-500" />,
      '.go': <FileCode className="w-8 h-8 text-cyan-600" />,
      '.rust': <FileCode className="w-8 h-8 text-orange-700" />,
      
      // データファイル
      '.json': <Database className="w-8 h-8 text-green-700" />,
      '.xml': <Database className="w-8 h-8 text-purple-600" />,
      '.csv': <Database className="w-8 h-8 text-green-500" />,
      '.sql': <Database className="w-8 h-8 text-orange-700" />,
      '.db': <Database className="w-8 h-8 text-gray-600" />,
      '.sqlite': <Database className="w-8 h-8 text-blue-600" />,
      
      // 設定ファイル
      '.ini': <Settings className="w-8 h-8 text-purple-500" />,
      '.conf': <Settings className="w-8 h-8 text-purple-500" />,
      '.config': <Settings className="w-8 h-8 text-purple-500" />,
      '.yaml': <Settings className="w-8 h-8 text-blue-600" />,
      '.yml': <Settings className="w-8 h-8 text-blue-600" />,
      '.toml': <Settings className="w-8 h-8 text-orange-500" />,
      '.env': <Settings className="w-8 h-8 text-yellow-600" />,
      
      // 実行可能ファイル
      '.exe': <Zap className="w-8 h-8 text-red-600" />,
      '.msi': <Zap className="w-8 h-8 text-red-500" />,
      '.app': <Zap className="w-8 h-8 text-blue-600" />,
      '.deb': <Zap className="w-8 h-8 text-orange-600" />,
      '.rpm': <Zap className="w-8 h-8 text-red-700" />,
      '.sh': <Terminal className="w-8 h-8 text-green-700" />,
      '.bat': <Terminal className="w-8 h-8 text-yellow-700" />,
      '.cmd': <Terminal className="w-8 h-8 text-yellow-600" />,
      '.ps1': <Terminal className="w-8 h-8 text-blue-700" />,
      '.zsh': <Terminal className="w-8 h-8 text-green-600" />,
      '.fish': <Terminal className="w-8 h-8 text-cyan-500" />,
      
      // アーカイブ
      '.zip': <Archive className="w-8 h-8 text-purple-600" />,
      '.rar': <Archive className="w-8 h-8 text-red-600" />,
      '.7z': <Archive className="w-8 h-8 text-orange-600" />,
      '.tar': <Archive className="w-8 h-8 text-gray-600" />,
      '.gz': <Archive className="w-8 h-8 text-gray-600" />,
      '.bz2': <Archive className="w-8 h-8 text-gray-700" />,
      '.xz': <Archive className="w-8 h-8 text-blue-500" />,
      
      // 画像
      '.jpg': <Image className="w-8 h-8 text-green-600" />,
      '.jpeg': <Image className="w-8 h-8 text-green-600" />,
      '.png': <Image className="w-8 h-8 text-blue-600" />,
      '.gif': <Image className="w-8 h-8 text-purple-600" />,
      '.svg': <Image className="w-8 h-8 text-orange-600" />,
      '.bmp': <Image className="w-8 h-8 text-gray-600" />,
      '.webp': <Image className="w-8 h-8 text-green-500" />,
      '.ico': <Image className="w-8 h-8 text-blue-500" />,
      '.tiff': <Image className="w-8 h-8 text-purple-500" />,
      
      // 音声
      '.mp3': <Music className="w-8 h-8 text-pink-600" />,
      '.wav': <Music className="w-8 h-8 text-blue-600" />,
      '.flac': <Music className="w-8 h-8 text-purple-600" />,
      '.aac': <Music className="w-8 h-8 text-green-600" />,
      '.ogg': <Music className="w-8 h-8 text-orange-600" />,
      '.m4a': <Music className="w-8 h-8 text-gray-600" />,
      
      // 動画
      '.mp4': <Video className="w-8 h-8 text-red-600" />,
      '.avi': <Video className="w-8 h-8 text-blue-600" />,
      '.mov': <Video className="w-8 h-8 text-purple-600" />,
      '.wmv': <Video className="w-8 h-8 text-orange-600" />,
      '.flv': <Video className="w-8 h-8 text-red-500" />,
      '.webm': <Video className="w-8 h-8 text-green-600" />,
      '.mkv': <Video className="w-8 h-8 text-cyan-600" />,
      '.m4v': <Video className="w-8 h-8 text-gray-600" />,
      
      // ドキュメント
      '.pdf': <FileText className="w-8 h-8 text-red-700" />,
      '.doc': <FileText className="w-8 h-8 text-blue-700" />,
      '.docx': <FileText className="w-8 h-8 text-blue-700" />,
      '.xls': <FileSpreadsheet className="w-8 h-8 text-green-700" />,
      '.xlsx': <FileSpreadsheet className="w-8 h-8 text-green-700" />,
      '.ppt': <Presentation className="w-8 h-8 text-orange-700" />,
      '.pptx': <Presentation className="w-8 h-8 text-orange-700" />,
      '.odt': <FileText className="w-8 h-8 text-blue-600" />,
      '.ods': <FileSpreadsheet className="w-8 h-8 text-green-600" />,
      '.odp': <Presentation className="w-8 h-8 text-orange-600" />
    }
    
    return iconMap[extension] || <File className="w-8 h-8 text-gray-500" />
  }
  
  // ファイルのプレビュー画像を取得（画像ファイルの場合）
  const getPreviewImage = () => {
    if (isImageFile(file.name) && file.content) {
      // 実際の実装では、ファイル内容をBase64エンコードして表示
      return null // プレビュー機能は後で実装
    }
    return null
  }
  
  // ドラッグ&ドロップのハンドリング（拡張版）
  const handleDragStart = (e) => {
    if (currentPath === 'trash' || isRenaming) {
      e.preventDefault();
      return;
    }
    
    e.dataTransfer.setData('text/plain', file.name);
    e.dataTransfer.setData('application/json', JSON.stringify(file));
    e.dataTransfer.effectAllowed = 'move';
    
    // ドラッグイメージをカスタマイズ
    const dragImage = e.target.cloneNode(true);
    dragImage.style.opacity = '0.5';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
    
    onDragStart && onDragStart(file);
  }
  
  const handleDragOver = (e) => {
    if (isDirectory(file.name) && currentPath !== 'trash' && !isRenaming) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    }
  }
  
  const handleDragLeave = (e) => {
    // 子要素への移動は無視
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  }
  
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (isDirectory(file.name) && currentPath !== 'trash' && !isRenaming) {
      try {
        const draggedFileName = e.dataTransfer.getData('text/plain');
        const draggedFileData = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
        
        if (draggedFileName && draggedFileName !== file.name) {
          onDrop && onDrop(draggedFileData || { name: draggedFileName }, file);
        }
      } catch (error) {
        console.error('Drop handling error:', error);
      }
    }
  }
  
  const handleDragEnd = () => {
    setIsDragOver(false);
    onDragEnd && onDragEnd();
  }
  
  // 名前変更関連のハンドラー
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onRename && onRename(editName);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditName(file.name);
      onRename && onRename(file.name); // 元の名前で確定（実質キャンセル）
    }
  }
  
  const handleBlur = () => {
    onRename && onRename(editName);
  }

  // 特別なパス用のメタ情報を取得（拡張版）
  const getMetaInfo = () => {
    const info = []
    
    // 最近の更新でのアクション表示
    if (currentPath === 'recent' && file.action) {
      const actionLabels = {
        create: '作成',
        update: '更新',
        move: '移動',
        copy: 'コピー',
        restore: '復元',
        rename: '名前変更',
        favorite: 'お気に入り',
        unfavorite: 'お気に入り解除'
      }
      info.push({
        icon: Clock,
        label: actionLabels[file.action] || file.action,
        color: 'text-blue-500'
      })
    }
    
    // ゴミ箱での削除情報
    if (currentPath === 'trash') {
      info.push({
        icon: Trash2,
        label: '削除済み',
        color: 'text-red-500'
      })
    }
    
    // 実行可能ファイルの警告
    if (file.isExecutable || isExecutableFile(file.name)) {
      info.push({
        icon: Zap,
        label: '実行可能',
        color: 'text-orange-600'
      })
    }
    
    // ファイルタイプ別の追加情報
    if (isImageFile(file.name)) {
      info.push({
        icon: Image,
        label: '画像',
        color: 'text-green-500'
      })
    } else if (isAudioFile(file.name)) {
      info.push({
        icon: Music,
        label: '音声',
        color: 'text-pink-500'
      })
    } else if (isVideoFile(file.name)) {
      info.push({
        icon: Video,
        label: '動画',
        color: 'text-purple-500'
      })
    }
    
    return info
  }

  // 日付表示の取得
  const getDateDisplay = () => {
    switch (currentPath) {
      case 'trash':
        return formatRelativeTime(file.deletedDate || file.modifiedDate)
      case 'recent':
        return formatRelativeTime(file.modifiedDate)
      default:
        return formatRelativeTime(file.modifiedDate)
    }
  }

  // アクセシビリティ対応のキーボードハンドラー
  const handleKeyPress = (e) => {
    if (isRenaming) return;
    
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick && onClick(file);
    }
  }

  // ダブルクリックハンドラー
  const handleDoubleClick = (e) => {
    if (isRenaming) return;
    e.preventDefault();
    
    // ディレクトリの場合は通常のナビゲーション
    if (file.isDirectory) {
      onDoubleClick && onDoubleClick(file);
    } else {
      // ファイルの場合はプレビューを開く
      onClick && onClick(file);
    }
  };

  // お気に入りボタンのハンドラー
  const handleFavoriteClick = (e) => {
    if (onToggleFavorite) {
      onToggleFavorite(e);
    }
  };
  
  // グリッド表示
  if (viewMode === 'grid') {
    const metaInfo = getMetaInfo()
    
    return (
      <div
        className={`
          relative group cursor-pointer rounded-lg border-2 transition-all duration-200
          ${isSelected 
            ? 'border-blue-300 bg-blue-50 shadow-md' 
            : 'border-transparent hover:border-gray-300 hover:shadow-sm'
          }
          ${isDragOver ? 'border-blue-400 bg-blue-50 shadow-lg' : ''}
          ${isDragging ? 'opacity-50 scale-95' : ''}
          ${currentPath === 'trash' ? 'opacity-75' : ''}
          ${isRenaming ? 'ring-2 ring-blue-500' : ''}
          ${className}
        `}
        onClick={isRenaming ? undefined : () => onClick && onClick(file)}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => !isRenaming && onContextMenu && onContextMenu(e, file)}
        onKeyDown={handleKeyPress}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        draggable={!isRenaming && currentPath !== 'trash'}
        tabIndex={isRenaming ? -1 : 0}
        role="button"
        aria-label={`${file.isDirectory ? 'フォルダ' : 'ファイル'}: ${file.name}`}
        aria-selected={isSelected}
      >
        {/* 選択チェックボックス */}
        <div className="absolute top-2 left-2 z-10">
          <button
            className={`
              w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200
              ${isSelected 
                ? 'bg-blue-600 border-blue-600 text-white' 
                : 'bg-white border-gray-300 opacity-0 group-hover:opacity-100'
              }
            `}
            onClick={(e) => {
              e.stopPropagation()
              onSelect && onSelect(!isSelected)
            }}
            aria-label={isSelected ? '選択を解除' : '選択'}
          >
            {isSelected && <Check className="w-3 h-3" />}
          </button>
        </div>

        {/* お気に入りボタン（ゴミ箱以外） */}
        {currentPath !== 'trash' && (
          <div className="absolute top-2 right-2 z-10">
            <button
              className={`
                w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200
                ${isFavorite 
                  ? 'bg-yellow-100 text-yellow-600 opacity-100' 
                  : 'bg-white/80 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-yellow-500 hover:bg-yellow-50'
                }
                backdrop-blur-sm border border-white/50 shadow-sm
              `}
              onClick={handleFavoriteClick}
              title={isFavorite ? 'お気に入りから削除' : 'お気に入りに追加'}
            >
              <Star className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
            </button>
          </div>
        )}

        {/* メニューボタン */}
        <div className="absolute top-2 right-10 z-10">
          <button
            className="w-6 h-6 rounded-full bg-white/80 backdrop-blur-sm border border-white/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-sm"
            onClick={(e) => {
              e.stopPropagation()
              onContextMenu && onContextMenu(e, file)
            }}
            aria-label="メニューを開く"
          >
            <MoreVertical className="w-3 h-3 text-gray-600" />
          </button>
        </div>
        
        {/* メタ情報バッジ */}
        {metaInfo.length > 0 && (
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-10">
            <div className="flex space-x-1">
              {metaInfo.slice(0, 2).map((meta, index) => (
                <div
                  key={index}
                  className="flex items-center bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-sm"
                  title={meta.label}
                >
                  <meta.icon className={`w-3 h-3 ${meta.color}`} />
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* ファイル内容 */}
        <div className="p-4 text-center">
          {/* アイコン/プレビュー */}
          <div className="mb-3 flex justify-center">
            {getPreviewImage() || getFileIcon()}
          </div>
          
          {/* ファイル名 */}
          <div className="space-y-1">
            {isRenaming ? (
              <div className="px-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleBlur}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full px-2 py-1 text-sm text-center border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="ファイル名を編集"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-1">
                <p 
                  className="text-sm font-medium text-gray-900 break-words px-1"
                  title={file.name}
                >
                  {truncateText(file.name, 20)}
                </p>
                {/* お気に入りアイコン（既にお気に入りの場合のみ表示） */}
                {isFavorite && (
                  <Star className="w-4 h-4 text-yellow-500 fill-current flex-shrink-0" />
                )}
              </div>
            )}
            
            {/* ファイル情報 */}
            <div className="text-xs text-gray-500 space-y-0.5">
              {!isDirectory(file.name) && (
                <div>{formatFileSize(file.size)}</div>
              )}
              <div>{getDateDisplay()}</div>
              
              {/* ゴミ箱での元の場所表示 */}
              {currentPath === 'trash' && file.originalPath && (
                <div className="text-xs text-blue-600" title={file.originalPath}>
                  元: {truncateText(file.originalPath, 15)}
                </div>
              )}
            </div>
          </div>
          
          {/* 詳細メタ情報（下部） */}
          {metaInfo.length > 2 && (
            <div className="mt-2 flex justify-center space-x-2">
              {metaInfo.slice(2).map((meta, index) => (
                <div
                  key={index}
                  className="flex items-center text-xs"
                  title={meta.label}
                >
                  <meta.icon className={`w-3 h-3 mr-1 ${meta.color}`} />
                  <span className={meta.color}>{meta.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* ドラッグオーバーインジケーター */}
        {isDragOver && (
          <div className="absolute inset-0 border-2 border-dashed border-blue-400 bg-blue-50 bg-opacity-50 rounded-lg flex items-center justify-center">
            <div className="text-blue-700 font-medium">ここにドロップ</div>
          </div>
        )}
      </div>
    )
  }
  
  // リスト表示（簡易版、主にFileListコンポーネントのテーブル行で使用）
  return (
    <div
      className={`
        flex items-center p-2 rounded-lg transition-colors duration-200
        ${isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}
        ${currentPath === 'trash' ? 'opacity-75' : ''}
        ${isDragging ? 'opacity-50' : ''}
        ${isDragOver ? 'bg-blue-50 border-blue-300' : ''}
        ${isRenaming ? 'ring-2 ring-blue-500' : ''}
        ${className}
      `}
      onClick={isRenaming ? undefined : () => onClick && onClick(file)}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => !isRenaming && onContextMenu && onContextMenu(e, file)}
      onKeyDown={handleKeyPress}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      draggable={!isRenaming && currentPath !== 'trash'}
      tabIndex={isRenaming ? -1 : 0}
      role="button"
      aria-label={`${file.isDirectory ? 'フォルダ' : 'ファイル'}: ${file.name}`}
      aria-selected={isSelected}
    >
      {/* 選択チェックボックス */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => {
          e.stopPropagation()
          onSelect && onSelect(e.target.checked)
        }}
        className="rounded border-gray-300 mr-3"
        aria-label={isSelected ? '選択を解除' : '選択'}
      />
      
      {/* アイコン */}
      <div className="mr-3 flex-shrink-0">
        {getFileIcon()}
      </div>
      
      {/* ファイル情報 */}
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="ファイル名を編集"
          />
        ) : (
          <div>
            <div className="flex items-center">
              <p className="text-sm font-medium text-gray-900 truncate">
                {file.name}
              </p>
              {/* インラインメタ情報 */}
              {getMetaInfo().map((meta, index) => (
                <meta.icon
                  key={index}
                  className={`w-4 h-4 ml-2 flex-shrink-0 ${meta.color}`}
                  title={meta.label}
                />
              ))}
              {/* お気に入りアイコン（既にお気に入りの場合のみ表示） */}
              {isFavorite && (
                <Star className="w-4 h-4 ml-2 text-yellow-500 fill-current flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center space-x-4 text-xs text-gray-500">
              {!isDirectory(file.name) && (
                <span>{formatFileSize(file.size)}</span>
              )}
              <span>{getDateDisplay()}</span>
              
              {/* 最近の更新でのアクション表示 */}
              {currentPath === 'recent' && file.action && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {file.action}
                </span>
              )}
              
              {/* ゴミ箱での元の場所表示 */}
              {currentPath === 'trash' && file.originalPath && (
                <span className="text-blue-600" title={file.originalPath}>
                  元: {truncateText(file.originalPath, 20)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* お気に入りボタン（リスト表示・ゴミ箱以外） */}
      {currentPath !== 'trash' && (
        <button
          onClick={handleFavoriteClick}
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 mr-2 ${
            isFavorite 
              ? 'text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50' 
              : 'text-gray-300 hover:text-yellow-500 hover:bg-yellow-50'
          }`}
          title={isFavorite ? 'お気に入りから削除' : 'お気に入りに追加'}
        >
          <Star className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
        </button>
      )}
      
      {/* メニューボタン */}
      <button
        className="inline-flex items-center px-2 py-1 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors duration-200 opacity-0 group-hover:opacity-100 flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          onContextMenu && onContextMenu(e, file)
        }}
        aria-label="メニューを開く"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      
      {/* ドラッグオーバーインジケーター */}
      {isDragOver && (
        <div className="absolute inset-0 border-2 border-dashed border-blue-400 bg-blue-50 bg-opacity-50 flex items-center justify-center">
          <div className="text-blue-700 font-medium text-sm">ここにドロップ</div>
        </div>
      )}
    </div>
  )
}

/**
 * ファイル作成中の一時的なアイテム（v3.0.0対応・改良版）
 */
export const TempFileItem = ({ 
  type = 'file', 
  isCreating = false, 
  onCancel,
  onCreate 
}) => {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  
  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])
  
  const validateName = (name) => {
    if (!name.trim()) {
      return 'ファイル名が必要です'
    }
    if (name.length > 255) {
      return 'ファイル名が長すぎます'
    }
    if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) {
      return '無効な文字が含まれています'
    }
    return null
  }
  
  const handleSubmit = () => {
    const trimmedName = name.trim()
    const validationError = validateName(trimmedName)
    
    if (validationError) {
      setError(validationError)
      return
    }
    
    onCreate(trimmedName, type)
  }
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }
  
  const handleNameChange = (e) => {
    setName(e.target.value)
    if (error) {
      setError('')
    }
  }
  
  const icon = type === 'folder' ? 
    <Folder className="w-8 h-8 text-blue-500" /> :
    <File className="w-8 h-8 text-gray-500" />
  
  return (
    <div className="relative group rounded-lg border-2 border-dashed border-blue-300 bg-blue-50">
      <div className="p-4 text-center">
        <div className="mb-3 flex justify-center">
          {icon}
        </div>
        
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={handleNameChange}
            placeholder={`新しい${type === 'folder' ? 'フォルダ' : 'ファイル'}名`}
            className={`w-full px-3 py-2 text-sm text-center border rounded focus:outline-none focus:ring-2 ${
              error 
                ? 'border-red-300 focus:ring-red-500' 
                : 'border-gray-300 focus:ring-blue-500'
            }`}
            onBlur={onCancel}
            onKeyDown={handleKeyDown}
            disabled={isCreating}
            aria-label={`新しい${type === 'folder' ? 'フォルダ' : 'ファイル'}の名前`}
          />
          
          {error && (
            <div className="text-xs text-red-600 mt-1">
              {error}
            </div>
          )}
          
          {isCreating && (
            <div className="flex items-center justify-center text-xs text-blue-600">
              <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600 mr-2"></div>
              作成中...
            </div>
          )}
          
          {!isCreating && (
            <div className="flex justify-center space-x-2 text-xs text-gray-500">
              <span>Enter: 作成</span>
              <span>Esc: キャンセル</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 特別なパス用のプレースホルダーアイテム（改良版）
 */
export const PlaceholderFileItem = ({ 
  type = 'recent',
  message = 'アイテムがありません',
  actionLabel,
  onAction
}) => {
  const getIcon = () => {
    switch (type) {
      case 'recent':
        return <Clock className="w-12 h-12 text-gray-300" />
      case 'favorites':
        return <Heart className="w-12 h-12 text-gray-300" />
      case 'trash':
        return <Trash2 className="w-12 h-12 text-gray-300" />
      default:
        return <File className="w-12 h-12 text-gray-300" />
    }
  }

  return (
    <div className="relative group rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors duration-200">
      <div className="p-8 text-center">
        <div className="mb-4 flex justify-center">
          {getIcon()}
        </div>
        <p className="text-sm text-gray-500 mb-4">{message}</p>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * ファイル選択用のチェックボックス付きアイテム（新規）
 */
export const SelectableFileItem = ({ 
  file, 
  isSelected, 
  onSelect, 
  viewMode = 'list',
  className = '' 
}) => {
  return (
    <div className={`relative ${className}`}>
      <FileItem
        file={file}
        isSelected={isSelected}
        viewMode={viewMode}
        onSelect={onSelect}
      />
      {isSelected && (
        <div className="absolute inset-0 bg-blue-100 bg-opacity-25 border-2 border-blue-400 rounded-lg pointer-events-none" />
      )}
    </div>
  )
}

export default FileItem