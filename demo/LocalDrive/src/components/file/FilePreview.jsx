import React, { useState, useEffect } from 'react'
import { 
  X, 
  Download, 
  Edit, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  FileText, 
  Image, 
  File, 
  AlertCircle,
  Eye,
  Code,
  Database
} from 'lucide-react'
import { 
  isTextFile, 
  isImageFile, 
  getFileExtension, 
  isPreviewableFile 
} from '../../utils/fileUtils.js'
import { formatFileSize, formatDate } from '../../utils/formatUtils.js'

/**
 * ファイルプレビューコンポーネント
 * @param {object} props - プロパティ
 * @param {object} props.file - ファイル情報
 * @param {string} props.content - ファイル内容
 * @param {boolean} props.isOpen - プレビューが開いているかどうか
 * @param {boolean} props.isLoading - ローディング状態
 * @param {Function} props.onClose - 閉じる時のコールバック
 * @param {Function} props.onEdit - 編集時のコールバック
 * @param {Function} props.onDownload - ダウンロード時のコールバック
 * @param {string} props.className - 追加のCSSクラス
 * @returns {JSX.Element} ファイルプレビュー
 */
const FilePreview = ({
  file,
  content = '',
  isOpen = false,
  isLoading = false,
  onClose,
  onEdit,
  onDownload,
  className = ''
}) => {
  const [zoomLevel, setZoomLevel] = useState(100)
  const [rotation, setRotation] = useState(0)
  
  // プレビューが開かれた時にリセット
  useEffect(() => {
    if (isOpen) {
      setZoomLevel(100)
      setRotation(0)
    }
  }, [isOpen])
  
  // ESCキーでプレビューを閉じる
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])
  
  if (!isOpen) return null
  
  const extension = getFileExtension(file.name)
  const canEdit = isTextFile(file.name)
  const canZoom = isImageFile(file.name)
  
  return (
    <div className="modal-overlay z-50">
      <div className={`bg-white rounded-xl shadow-strong max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col ${className}`}>
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center">
            <PreviewIcon file={file} />
            <div className="ml-3">
              <h2 className="text-lg font-medium text-gray-900">{file.name}</h2>
              <div className="flex items-center text-sm text-gray-500 space-x-4">
                <span>{formatFileSize(file.size)}</span>
                <span>{formatDate(file.modifiedDate)}</span>
                {file.isExecutable && (
                  <span className="text-orange-600 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    実行可能
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* ズーム制御 */}
            {canZoom && (
              <>
                <button
                  onClick={() => setZoomLevel(prev => Math.max(25, prev - 25))}
                  className="btn-ghost btn-sm"
                  disabled={zoomLevel <= 25}
                  title="縮小"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                
                <span className="text-sm text-gray-600 min-w-12 text-center">
                  {zoomLevel}%
                </span>
                
                <button
                  onClick={() => setZoomLevel(prev => Math.min(400, prev + 25))}
                  className="btn-ghost btn-sm"
                  disabled={zoomLevel >= 400}
                  title="拡大"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                
                <button
                  onClick={() => setRotation(prev => (prev + 90) % 360)}
                  className="btn-ghost btn-sm"
                  title="回転"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </>
            )}
            
            {/* アクションボタン */}
            {canEdit && (
              <button
                onClick={() => onEdit(file)}
                className="btn-secondary btn-sm"
                title="編集"
              >
                <Edit className="w-4 h-4 mr-1" />
                編集
              </button>
            )}
            
            <button
              onClick={() => onDownload(file, content)}
              className="btn-secondary btn-sm"
              title="ダウンロード"
            >
              <Download className="w-4 h-4 mr-1" />
              ダウンロード
            </button>
            
            <button
              onClick={onClose}
              className="btn-ghost btn-sm text-gray-500"
              title="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* プレビューコンテンツ */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <LoadingState />
          ) : isPreviewableFile(file.name) ? (
            <PreviewContent 
              file={file} 
              content={content} 
              zoomLevel={zoomLevel}
              rotation={rotation}
            />
          ) : (
            <NonPreviewableState file={file} onDownload={() => onDownload(file, content)} />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * プレビューアイコンコンポーネント
 */
const PreviewIcon = ({ file }) => {
  if (isImageFile(file.name)) {
    return <Image className="w-6 h-6 text-green-600" />
  }
  
  if (isTextFile(file.name)) {
    const extension = getFileExtension(file.name)
    
    if (['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.py', '.java'].includes(extension)) {
      return <Code className="w-6 h-6 text-blue-600" />
    }
    
    if (['.json', '.xml', '.csv'].includes(extension)) {
      return <Database className="w-6 h-6 text-purple-600" />
    }
    
    return <FileText className="w-6 h-6 text-gray-600" />
  }
  
  return <File className="w-6 h-6 text-gray-500" />
}

/**
 * プレビューコンテンツコンポーネント
 */
const PreviewContent = ({ file, content, zoomLevel, rotation }) => {
  if (isImageFile(file.name)) {
    return (
      <ImagePreview 
        file={file} 
        content={content} 
        zoomLevel={zoomLevel}
        rotation={rotation}
      />
    )
  }
  
  if (isTextFile(file.name)) {
    return <TextPreview file={file} content={content} />
  }
  
  return <NonPreviewableState file={file} />
}

/**
 * 画像プレビューコンポーネント
 */
const ImagePreview = ({ file, content, zoomLevel, rotation }) => {
  const [imageError, setImageError] = useState(false)
  
  // 実際のアプリケーションでは、contentはBase64エンコードされた画像データになります
  // ここではプレースホルダーとして処理
  const imageUrl = content || `https://via.placeholder.com/400x300/f3f4f6/6b7280?text=${encodeURIComponent(file.name)}`
  
  if (imageError) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">画像を読み込めませんでした</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex items-center justify-center h-full bg-gray-50 overflow-auto p-4">
      <img
        src={imageUrl}
        alt={file.name}
        style={{
          transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
          transformOrigin: 'center',
          maxWidth: '100%',
          maxHeight: '100%'
        }}
        onError={() => setImageError(true)}
        className="transition-transform duration-200"
      />
    </div>
  )
}

/**
 * テキストプレビューコンポーネント
 */
const TextPreview = ({ file, content }) => {
  const extension = getFileExtension(file.name)
  
  // Markdownファイルの場合
  if (extension === '.md') {
    return (
      <div className="h-full overflow-auto bg-white">
        <div className="max-w-4xl mx-auto p-6 prose prose-sm">
          <div dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }} />
        </div>
      </div>
    )
  }
  
  // JSONファイルの場合
  if (extension === '.json') {
    try {
      const parsed = JSON.parse(content)
      return (
        <div className="h-full overflow-auto bg-white p-4">
          <pre className="text-sm bg-gray-50 p-4 rounded-lg overflow-auto font-mono">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        </div>
      )
    } catch (error) {
      // JSON解析エラーの場合は通常のテキストとして表示
    }
  }
  
  // コードファイルの場合（シンタックスハイライトなし）
  const isCodeFile = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.py', '.java', '.cpp', '.c'].includes(extension)
  
  return (
    <div className="h-full overflow-auto bg-white">
      <div className="flex">
        {/* 行番号（コードファイルの場合のみ） */}
        {isCodeFile && (
          <div className="bg-gray-50 border-r border-gray-200 p-4 text-sm font-mono text-gray-500 select-none">
            {content.split('\n').map((_, index) => (
              <div key={index} className="leading-6 text-right">
                {index + 1}
              </div>
            ))}
          </div>
        )}
        
        {/* コンテンツ */}
        <div className="flex-1">
          <pre className={`p-4 text-sm whitespace-pre-wrap ${isCodeFile ? 'font-mono' : ''} leading-6`}>
            {content || 'ファイル内容がありません'}
          </pre>
        </div>
      </div>
    </div>
  )
}

/**
 * プレビューできないファイルの状態コンポーネント
 */
const NonPreviewableState = ({ file, onDownload }) => {
  const extension = getFileExtension(file.name)
  
  const getFileTypeInfo = () => {
    if (file.isExecutable) {
      return {
        icon: <AlertCircle className="w-16 h-16 text-orange-500" />,
        title: '実行可能ファイル',
        description: 'このファイルは実行可能ファイルです。セキュリティのため、プレビューできません。',
        warning: true
      }
    }
    
    const binaryExtensions = ['.exe', '.zip', '.tar', '.gz', '.pdf', '.docx', '.xlsx', '.pptx']
    if (binaryExtensions.includes(extension)) {
      return {
        icon: <File className="w-16 h-16 text-gray-400" />,
        title: 'バイナリファイル',
        description: 'このファイル形式はプレビューできません。ダウンロードしてご確認ください。',
        warning: false
      }
    }
    
    return {
      icon: <Eye className="w-16 h-16 text-gray-400" />,
      title: 'プレビュー非対応',
      description: 'このファイル形式はプレビューに対応していません。',
      warning: false
    }
  }
  
  const fileTypeInfo = getFileTypeInfo()
  
  return (
    <div className="flex items-center justify-center h-full bg-gray-50">
      <div className="text-center max-w-md mx-auto p-6">
        {fileTypeInfo.icon}
        
        <h3 className={`text-lg font-medium mt-4 mb-2 ${fileTypeInfo.warning ? 'text-orange-800' : 'text-gray-900'}`}>
          {fileTypeInfo.title}
        </h3>
        
        <p className="text-gray-600 mb-6">
          {fileTypeInfo.description}
        </p>
        
        <div className="space-y-3">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">ファイル名:</span>
              <span className="font-medium text-gray-900">{file.name}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-gray-600">サイズ:</span>
              <span className="font-medium text-gray-900">{formatFileSize(file.size)}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-gray-600">更新日時:</span>
              <span className="font-medium text-gray-900">{formatDate(file.modifiedDate)}</span>
            </div>
          </div>
          
          {onDownload && (
            <button
              onClick={onDownload}
              className="btn-primary w-full"
            >
              <Download className="w-4 h-4 mr-2" />
              ダウンロード
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * ローディング状態コンポーネント
 */
const LoadingState = () => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center">
      <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
      <p className="text-gray-600">ファイルを読み込み中...</p>
    </div>
  </div>
)

/**
 * 簡易Markdownパーサー
 * @param {string} content - Markdownコンテンツ
 * @returns {string} HTML
 */
const parseMarkdown = (content) => {
  return content
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-6 mb-3">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-8 mb-4">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-8 mb-6">$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em class="italic">$1</em>')
    .replace(/`(.*?)`/gim, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
    .replace(/```([\s\S]*?)```/gim, '<pre class="bg-gray-100 p-4 rounded-lg overflow-auto font-mono text-sm my-4"><code>$1</code></pre>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" class="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/^- (.*$)/gim, '<li class="ml-4">$1</li>')
    .replace(/\n\n/gim, '</p><p class="mb-4">')
    .replace(/\n/gim, '<br>')
    .replace(/^(.+)$/gim, '<p class="mb-4">$1</p>')
}

/**
 * クイックプレビューコンポーネント（ファイル一覧での使用）
 */
export const QuickPreview = ({ file, onClose }) => {
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    const loadContent = async () => {
      try {
        // ファイル内容の取得処理（実際のアプリでは fileService.readFile を使用）
        setContent('プレビュー内容...')
      } catch (error) {
        setContent('ファイルの読み込みに失敗しました')
      } finally {
        setIsLoading(false)
      }
    }
    
    if (isPreviewableFile(file.name)) {
      loadContent()
    } else {
      setIsLoading(false)
    }
  }, [file])
  
  return (
    <div className="absolute right-0 top-0 w-80 h-64 bg-white border border-gray-200 rounded-lg shadow-medium z-10 overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-900 truncate">
          {file.name}
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      
      <div className="h-56 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="loading-spinner w-6 h-6" />
          </div>
        ) : isPreviewableFile(file.name) ? (
          <div className="p-3 h-full overflow-auto">
            {isImageFile(file.name) ? (
              <img
                src={`https://via.placeholder.com/300x200/f3f4f6/6b7280?text=${encodeURIComponent(file.name)}`}
                alt={file.name}
                className="max-w-full h-auto"
              />
            ) : (
              <pre className="text-xs whitespace-pre-wrap">
                {content.substring(0, 500)}
                {content.length > 500 && '...'}
              </pre>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <File className="w-8 h-8 mx-auto mb-2" />
              <p className="text-xs">プレビュー非対応</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default FilePreview