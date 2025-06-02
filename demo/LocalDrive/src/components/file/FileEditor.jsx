import React, { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Save, 
  X, 
  Download, 
  Copy, 
  Eye, 
  Edit3, 
  FileText, 
  Code, 
  AlertCircle,
  Clock,
  CheckCircle
} from 'lucide-react'
import { isTextFile, getFileExtension } from '../../utils/fileUtils.js'
import { formatFileSize, formatDate } from '../../utils/formatUtils.js'

/**
 * ファイルエディタコンポーネント
 * @param {object} props - プロパティ
 * @param {object} props.file - ファイル情報
 * @param {string} props.content - ファイル内容
 * @param {boolean} props.isLoading - ローディング状態
 * @param {boolean} props.readOnly - 読み取り専用モード
 * @param {Function} props.onSave - 保存時のコールバック
 * @param {Function} props.onClose - 閉じる時のコールバック
 * @param {Function} props.onDownload - ダウンロード時のコールバック
 * @param {string} props.className - 追加のCSSクラス
 * @returns {JSX.Element} ファイルエディタ
 */
const FileEditor = ({
  file,
  content = '',
  isLoading = false,
  readOnly = false,
  onSave,
  onClose,
  onDownload,
  className = ''
}) => {
  const [editorContent, setEditorContent] = useState(content)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // 'success', 'error'
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [autoSaveTimer, setAutoSaveTimer] = useState(null)
  const textareaRef = useRef(null)
  
  // ファイル内容が変更された時の処理
  useEffect(() => {
    setEditorContent(content)
    setIsDirty(false)
  }, [content])
  
  // 自動保存のタイマー設定
  useEffect(() => {
    if (isDirty && !readOnly && autoSaveTimer === null) {
      const timer = setTimeout(() => {
        handleAutoSave()
      }, 5000) // 5秒後に自動保存
      
      setAutoSaveTimer(timer)
    }
    
    return () => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer)
        setAutoSaveTimer(null)
      }
    }
  }, [isDirty, readOnly, autoSaveTimer])
  
  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+S で保存
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      // Ctrl+D でダウンロード
      else if (e.ctrlKey && e.key === 'd') {
        e.preventDefault()
        handleDownload()
      }
      // Escape で閉じる
      else if (e.key === 'Escape') {
        handleClose()
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  /**
   * コンテンツ変更のハンドリング
   */
  const handleContentChange = useCallback((value) => {
    setEditorContent(value)
    setIsDirty(value !== content)
    setSaveStatus(null)
    
    // 自動保存タイマーをリセット
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      setAutoSaveTimer(null)
    }
  }, [content, autoSaveTimer])
  
  /**
   * 保存処理
   */
  const handleSave = useCallback(async () => {
    if (!isDirty || isSaving || readOnly) return
    
    setIsSaving(true)
    setSaveStatus(null)
    
    try {
      await onSave(editorContent)
      setIsDirty(false)
      setSaveStatus('success')
      
      // 自動保存タイマーをクリア
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer)
        setAutoSaveTimer(null)
      }
      
      // 3秒後にステータスをクリア
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (error) {
      setSaveStatus('error')
      console.error('Save failed:', error)
    } finally {
      setIsSaving(false)
    }
  }, [editorContent, isDirty, isSaving, readOnly, onSave, autoSaveTimer])
  
  /**
   * 自動保存処理
   */
  const handleAutoSave = useCallback(async () => {
    if (!isDirty || readOnly) return
    
    try {
      await onSave(editorContent)
      setIsDirty(false)
      setSaveStatus('success')
      setTimeout(() => setSaveStatus(null), 2000)
    } catch (error) {
      // 自動保存のエラーは静かに処理
      console.error('Auto-save failed:', error)
    } finally {
      setAutoSaveTimer(null)
    }
  }, [editorContent, isDirty, readOnly, onSave])
  
  /**
   * ダウンロード処理
   */
  const handleDownload = useCallback(() => {
    if (onDownload) {
      onDownload(editorContent, file.name)
    } else {
      // デフォルトのダウンロード処理
      const blob = new Blob([editorContent], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
  }, [editorContent, file.name, onDownload])
  
  /**
   * コピー処理
   */
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(editorContent)
      setSaveStatus('copied')
      setTimeout(() => setSaveStatus(null), 2000)
    } catch (error) {
      console.error('Copy failed:', error)
    }
  }, [editorContent])
  
  /**
   * 閉じる処理
   */
  const handleClose = useCallback(() => {
    if (isDirty) {
      const confirm = window.confirm('未保存の変更があります。閉じますか？')
      if (!confirm) return
    }
    
    onClose()
  }, [isDirty, onClose])
  
  /**
   * ファイルタイプに応じたエディタの設定
   */
  const getEditorSettings = () => {
    const extension = getFileExtension(file.name)
    const settings = {
      language: 'text',
      tabSize: 2,
      showLineNumbers: false
    }
    
    // プログラミング言語の場合
    const codeExtensions = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.py', '.java', '.cpp', '.c']
    if (codeExtensions.includes(extension)) {
      settings.language = 'code'
      settings.showLineNumbers = true
      settings.tabSize = 2
    }
    
    // JSON/XMLの場合
    if (['.json', '.xml'].includes(extension)) {
      settings.language = 'data'
      settings.showLineNumbers = true
      settings.tabSize = 2
    }
    
    return settings
  }
  
  const editorSettings = getEditorSettings()
  const isCodeFile = editorSettings.language === 'code'
  
  if (isLoading) {
    return <LoadingState />
  }
  
  return (
    <div className={`flex flex-col h-full bg-white ${className}`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center">
          {isCodeFile ? (
            <Code className="w-5 h-5 text-blue-600 mr-2" />
          ) : (
            <FileText className="w-5 h-5 text-gray-600 mr-2" />
          )}
          <div>
            <h2 className="text-lg font-medium text-gray-900">{file.name}</h2>
            <div className="flex items-center text-sm text-gray-500 space-x-4">
              <span>{formatFileSize(file.size)}</span>
              <span>{formatDate(file.modifiedDate)}</span>
              {file.isExecutable && (
                <span className="text-orange-600 flex items-center">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  実行可能ファイル
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* ステータス表示 */}
          {saveStatus && (
            <div className="flex items-center text-sm">
              {saveStatus === 'success' && (
                <span className="text-green-600 flex items-center">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  保存完了
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-red-600 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  保存エラー
                </span>
              )}
              {saveStatus === 'copied' && (
                <span className="text-blue-600 flex items-center">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  コピー完了
                </span>
              )}
            </div>
          )}
          
          {/* 未保存インジケーター */}
          {isDirty && (
            <div className="text-orange-600 flex items-center text-sm">
              <Clock className="w-4 h-4 mr-1" />
              未保存
            </div>
          )}
          
          {/* プレビューモード切り替え */}
          {isTextFile(file.name) && (
            <button
              onClick={() => setIsPreviewMode(!isPreviewMode)}
              className={`btn-ghost btn-sm ${isPreviewMode ? 'bg-blue-100 text-blue-600' : ''}`}
              title={isPreviewMode ? '編集モード' : 'プレビューモード'}
            >
              {isPreviewMode ? <Edit3 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
          
          {/* アクションボタン */}
          <button
            onClick={handleCopy}
            className="btn-ghost btn-sm"
            title="コピー (Ctrl+C)"
          >
            <Copy className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleDownload}
            className="btn-ghost btn-sm"
            title="ダウンロード (Ctrl+D)"
          >
            <Download className="w-4 h-4" />
          </button>
          
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="btn-primary btn-sm"
              title="保存 (Ctrl+S)"
            >
              <Save className="w-4 h-4 mr-1" />
              {isSaving ? '保存中...' : '保存'}
            </button>
          )}
          
          <button
            onClick={handleClose}
            className="btn-ghost btn-sm text-gray-500"
            title="閉じる (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* エディタエリア */}
      <div className="flex-1 overflow-hidden">
        {isPreviewMode ? (
          <PreviewPane content={editorContent} file={file} />
        ) : (
          <EditorPane
            content={editorContent}
            onChange={handleContentChange}
            settings={editorSettings}
            readOnly={readOnly}
            ref={textareaRef}
          />
        )}
      </div>
      
      {/* ステータスバー */}
      <div className="flex items-center justify-between p-2 border-t border-gray-200 bg-gray-50 text-sm text-gray-600">
        <div className="flex items-center space-x-4">
          <span>{editorContent.length} 文字</span>
          <span>{editorContent.split('\n').length} 行</span>
          {editorSettings.language !== 'text' && (
            <span className="capitalize">{editorSettings.language}</span>
          )}
        </div>
        
        <div className="flex items-center space-x-4">
          {readOnly && (
            <span className="text-yellow-600">読み取り専用</span>
          )}
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  )
}

/**
 * エディタペインコンポーネント
 */
const EditorPane = React.forwardRef(({ 
  content, 
  onChange, 
  settings, 
  readOnly 
}, ref) => {
  return (
    <div className="h-full flex">
      {/* 行番号 */}
      {settings.showLineNumbers && (
        <div className="bg-gray-50 border-r border-gray-200 p-2 text-sm font-mono text-gray-500 select-none">
          {content.split('\n').map((_, index) => (
            <div key={index} className="leading-6 text-right">
              {index + 1}
            </div>
          ))}
        </div>
      )}
      
      {/* テキストエリア */}
      <textarea
        ref={ref}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className={`
          flex-1 p-4 font-mono text-sm leading-6 resize-none border-none outline-none
          ${readOnly ? 'bg-gray-50 cursor-default' : 'bg-white'}
        `}
        style={{
          tabSize: settings.tabSize
        }}
        spellCheck={false}
        placeholder={readOnly ? '' : 'ファイル内容を入力してください...'}
      />
    </div>
  )
})

/**
 * プレビューペインコンポーネント
 */
const PreviewPane = ({ content, file }) => {
  const extension = getFileExtension(file.name)
  
  // Markdownのプレビュー（簡易版）
  if (extension === '.md') {
    return (
      <div className="h-full overflow-auto p-4 prose prose-sm max-w-none">
        <div dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }} />
      </div>
    )
  }
  
  // JSONのプレビュー
  if (extension === '.json') {
    try {
      const parsed = JSON.parse(content)
      return (
        <div className="h-full overflow-auto p-4">
          <pre className="text-sm bg-gray-50 p-4 rounded-lg overflow-auto">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        </div>
      )
    } catch (error) {
      return (
        <div className="h-full overflow-auto p-4">
          <div className="text-red-600 mb-4">
            JSON解析エラー: {error.message}
          </div>
          <pre className="text-sm bg-gray-50 p-4 rounded-lg overflow-auto">
            {content}
          </pre>
        </div>
      )
    }
  }
  
  // デフォルトのテキストプレビュー
  return (
    <div className="h-full overflow-auto p-4">
      <pre className="text-sm whitespace-pre-wrap font-mono leading-6">
        {content}
      </pre>
    </div>
  )
}

/**
 * ローディング状態コンポーネント
 */
const LoadingState = () => (
  <div className="flex items-center justify-center h-64">
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
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/`(.*)`/gim, '<code>$1</code>')
    .replace(/\n/gim, '<br>')
}

export default FileEditor