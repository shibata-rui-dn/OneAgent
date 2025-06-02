import React, { useState, useRef, useCallback } from 'react'
import { 
  Upload, 
  File, 
  X, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Plus,
  Cloud
} from 'lucide-react'
import { formatFileSize } from '../../utils/formatUtils.js'
import { validateFileSize, validateFileExtension } from '../../utils/fileUtils.js'
import { FILE_CONFIG } from '../../utils/constants.js'

/**
 * ファイルアップロードコンポーネント
 * @param {object} props - プロパティ
 * @param {Function} props.onUpload - アップロード時のコールバック
 * @param {string} props.targetPath - アップロード先パス
 * @param {boolean} props.multiple - 複数ファイル選択可能かどうか
 * @param {Array} props.acceptedTypes - 受け入れ可能なファイルタイプ
 * @param {number} props.maxFileSize - 最大ファイルサイズ
 * @param {boolean} props.disabled - 無効状態
 * @param {string} props.className - 追加のCSSクラス
 * @returns {JSX.Element} ファイルアップロードコンポーネント
 */
const FileUpload = ({
  onUpload,
  targetPath = '',
  multiple = true,
  acceptedTypes = FILE_CONFIG.supportedFileTypes,
  maxFileSize = FILE_CONFIG.maxFileSize,
  disabled = false,
  className = ''
}) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploadProgress, setUploadProgress] = useState({})
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)
  
  /**
   * ファイルを検証
   * @param {File} file - ファイルオブジェクト
   * @returns {object} 検証結果
   */
  const validateFile = useCallback((file) => {
    const errors = []
    
    // ファイルサイズの検証
    const sizeValidation = validateFileSize(file.size)
    if (!sizeValidation.valid) {
      errors.push(sizeValidation.error)
    }
    
    // ファイル拡張子の検証
    const extensionValidation = validateFileExtension(file.name)
    if (!extensionValidation.valid) {
      errors.push(extensionValidation.error)
    }
    
    return {
      valid: errors.length === 0,
      errors
    }
  }, [])
  
  /**
   * ファイルリストを処理
   * @param {FileList} fileList - ファイルリスト
   */
  const processFiles = useCallback((fileList) => {
    const files = Array.from(fileList)
    const processedFiles = files.map(file => {
      const validation = validateFile(file)
      return {
        file,
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
        type: file.type,
        validation,
        status: validation.valid ? 'ready' : 'error'
      }
    })
    
    setSelectedFiles(prev => [...prev, ...processedFiles])
  }, [validateFile])
  
  /**
   * ドラッグオーバーのハンドリング
   */
  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragOver(true)
    }
  }, [disabled])
  
  /**
   * ドラッグリーブのハンドリング
   */
  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])
  
  /**
   * ドロップのハンドリング
   */
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    
    if (disabled) return
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      processFiles(files)
    }
  }, [disabled, processFiles])
  
  /**
   * ファイル選択のハンドリング
   */
  const handleFileSelect = useCallback((e) => {
    const files = e.target.files
    if (files.length > 0) {
      processFiles(files)
    }
    // ファイル入力をリセット
    e.target.value = ''
  }, [processFiles])
  
  /**
   * ファイルを削除
   * @param {string} fileId - ファイルID
   */
  const removeFile = useCallback((fileId) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== fileId))
  }, [])
  
  /**
   * 全ファイルをクリア
   */
  const clearAllFiles = useCallback(() => {
    setSelectedFiles([])
    setUploadProgress({})
  }, [])
  
  /**
   * アップロードを実行
   */
  const handleUpload = useCallback(async () => {
    const validFiles = selectedFiles.filter(f => f.validation.valid)
    if (validFiles.length === 0) return
    
    setIsUploading(true)
    
    try {
      for (const fileInfo of validFiles) {
        const { file, id } = fileInfo
        
        // 進捗を更新
        setUploadProgress(prev => ({ ...prev, [id]: 0 }))
        
        // ファイル内容を読み取り
        const content = await readFileAsText(file)
        
        // 進捗を50%に更新
        setUploadProgress(prev => ({ ...prev, [id]: 50 }))
        
        try {
          // アップロード実行
          await onUpload(file.name, content, targetPath)
          
          // 成功
          setUploadProgress(prev => ({ ...prev, [id]: 100 }))
          setSelectedFiles(prev => 
            prev.map(f => 
              f.id === id ? { ...f, status: 'success' } : f
            )
          )
        } catch (error) {
          // エラー
          setSelectedFiles(prev => 
            prev.map(f => 
              f.id === id ? { ...f, status: 'error', error: error.message } : f
            )
          )
        }
      }
    } finally {
      setIsUploading(false)
    }
  }, [selectedFiles, onUpload, targetPath])
  
  /**
   * ファイルをテキストとして読み込み
   * @param {File} file - ファイルオブジェクト
   * @returns {Promise<string>} ファイル内容
   */
  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = (e) => reject(new Error('ファイル読み取りエラー'))
      reader.readAsText(file)
    })
  }
  
  const validFiles = selectedFiles.filter(f => f.validation.valid)
  const hasErrors = selectedFiles.some(f => !f.validation.valid)
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* ドロップゾーン */}
      <div
        className={`
          dropzone
          ${isDragOver ? 'dropzone-active' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <div className="flex flex-col items-center">
          <Cloud className="w-12 h-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            ファイルをアップロード
          </h3>
          <p className="text-gray-600 mb-4 text-center">
            ファイルをドラッグ&ドロップするか、クリックして選択してください
          </p>
          
          <button 
            className="btn-primary"
            disabled={disabled}
          >
            <Plus className="w-4 h-4 mr-2" />
            ファイルを選択
          </button>
          
          <div className="mt-4 text-sm text-gray-500 text-center">
            <p>対応形式: {acceptedTypes.join(', ')}</p>
            <p>最大サイズ: {formatFileSize(maxFileSize)}</p>
          </div>
        </div>
      </div>
      
      {/* 隠れたファイル入力 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        accept={acceptedTypes.join(',')}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />
      
      {/* 選択されたファイル一覧 */}
      {selectedFiles.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium text-gray-900">
              選択されたファイル ({selectedFiles.length})
            </h4>
            <div className="flex space-x-2">
              {validFiles.length > 0 && (
                <button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="btn-primary btn-sm"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploading ? 'アップロード中...' : 'アップロード'}
                </button>
              )}
              <button
                onClick={clearAllFiles}
                disabled={isUploading}
                className="btn-secondary btn-sm"
              >
                すべてクリア
              </button>
            </div>
          </div>
          
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {selectedFiles.map((fileInfo) => (
              <FileUploadItem
                key={fileInfo.id}
                fileInfo={fileInfo}
                progress={uploadProgress[fileInfo.id]}
                onRemove={() => removeFile(fileInfo.id)}
                disabled={isUploading}
              />
            ))}
          </div>
          
          {hasErrors && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                <p className="text-sm text-red-700">
                  一部のファイルにエラーがあります。エラーのあるファイルは除外されます。
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * ファイルアップロードアイテムコンポーネント
 */
const FileUploadItem = ({ fileInfo, progress, onRemove, disabled }) => {
  const { file, name, size, validation, status, error } = fileInfo
  
  const getStatusIcon = () => {
    switch (status) {
      case 'ready':
        return <File className="w-5 h-5 text-gray-500" />
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />
      default:
        return <File className="w-5 h-5 text-gray-500" />
    }
  }
  
  const getStatusColor = () => {
    switch (status) {
      case 'ready':
        return validation.valid ? 'border-gray-200' : 'border-red-200 bg-red-50'
      case 'success':
        return 'border-green-200 bg-green-50'
      case 'error':
        return 'border-red-200 bg-red-50'
      default:
        return 'border-gray-200'
    }
  }
  
  return (
    <div className={`flex items-center p-3 border rounded-lg ${getStatusColor()}`}>
      {/* アイコン */}
      <div className="mr-3">
        {getStatusIcon()}
      </div>
      
      {/* ファイル情報 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-900 truncate">
            {name}
          </p>
          <p className="text-sm text-gray-500 ml-2">
            {formatFileSize(size)}
          </p>
        </div>
        
        {/* エラーメッセージ */}
        {!validation.valid && (
          <div className="mt-1">
            {validation.errors.map((err, index) => (
              <p key={index} className="text-xs text-red-600">
                {err}
              </p>
            ))}
          </div>
        )}
        
        {/* アップロードエラー */}
        {status === 'error' && error && (
          <p className="text-xs text-red-600 mt-1">
            アップロードエラー: {error}
          </p>
        )}
        
        {/* プログレスバー */}
        {typeof progress === 'number' && progress < 100 && (
          <div className="mt-2">
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {progress}% 完了
            </p>
          </div>
        )}
        
        {/* 成功メッセージ */}
        {status === 'success' && (
          <p className="text-xs text-green-600 mt-1">
            アップロード完了
          </p>
        )}
      </div>
      
      {/* 削除ボタン */}
      <button
        onClick={onRemove}
        disabled={disabled}
        className="ml-3 p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        title="削除"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

/**
 * 簡易アップロードボタンコンポーネント
 */
export const SimpleUploadButton = ({ onUpload, disabled, className = '' }) => {
  const fileInputRef = useRef(null)
  
  const handleFileSelect = async (e) => {
    const files = e.target.files
    if (files.length > 0) {
      for (const file of files) {
        try {
          const content = await readFileAsText(file)
          await onUpload(file.name, content)
        } catch (error) {
          console.error('Upload failed:', error)
        }
      }
    }
    e.target.value = ''
  }
  
  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = (e) => reject(new Error('ファイル読み取りエラー'))
      reader.readAsText(file)
    })
  }
  
  return (
    <>
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        className={`btn-secondary ${className}`}
      >
        <Upload className="w-4 h-4 mr-2" />
        ファイルアップロード
      </button>
      
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={FILE_CONFIG.supportedFileTypes.join(',')}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />
    </>
  )
}

export default FileUpload