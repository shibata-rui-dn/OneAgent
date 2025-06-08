import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Save,
  Download,
  Edit3,
  Eye,
  FileText,
  Image,
  Music,
  Video,
  File,
  Loader2,
  AlertCircle,
  Check,
  Copy,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { formatFileSize, formatDate } from '../../utils/formatUtils.js';
import {
  isTextFile,
  isImageFile,
  isAudioFile,
  isVideoFile,
  getMimeType
} from '../../utils/fileUtils.js';

const FilePreviewModal = ({
  file,
  isOpen,
  onClose,
  onSave,
  onDownload,
  isLoading = false,
  readOnly = false,
  currentPath = ''
}) => {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const fileInfo = useMemo(() => {
    if (!file) return null;

    return {
      isText: isTextFile(file.name),
      isImage: isImageFile(file.name),
      isAudio: isAudioFile(file.name),
      isVideo: isVideoFile(file.name),
      mimeType: getMimeType(file.name),
      canEdit: isTextFile(file.name) && !readOnly && currentPath !== 'trash'
    };
  }, [file, readOnly, currentPath]);

  useEffect(() => {
    setHasUnsavedChanges(content !== originalContent && isEditing);
  }, [content, originalContent, isEditing]);

  useEffect(() => {
    if (isOpen && file) {
      if (file.content !== undefined) {
        setContent(file.content);
        setOriginalContent(file.content);
      } else {
        setContent('');
        setOriginalContent('');
      }
      setIsEditing(false);
      setError('');
      setHasUnsavedChanges(false);
    }
  }, [isOpen, file]);

  const setFileContent = useCallback((fileContent) => {
    setContent(fileContent);
    setOriginalContent(fileContent);
    setError('');
  }, []);

  const setFileError = useCallback((errorMessage) => {
    setError(errorMessage);
    setContent('');
    setOriginalContent('');
  }, []);

  const handleToggleEdit = useCallback(() => {
    if (isEditing && hasUnsavedChanges) {
      if (!confirm('未保存の変更があります。編集を終了しますか？')) {
        return;
      }
      setContent(originalContent);
    }
    setIsEditing(!isEditing);
  }, [isEditing, hasUnsavedChanges, originalContent]);

  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges || !onSave) return;

    setSaving(true);
    try {
      await onSave(content);
      setOriginalContent(content);
      setIsEditing(false);
      setHasUnsavedChanges(false);

      const event = new CustomEvent('fileOperationCompleted', {
        detail: {
          operationType: 'save_file',
          data: {
            fileName: file?.name,
            timestamp: Date.now()
          }
        }
      });
      window.dispatchEvent(event);

    } catch (error) {
      setError(`保存に失敗しました: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }, [content, hasUnsavedChanges, onSave, file]);

  const handleDownload = useCallback(() => {
    if (onDownload) {
      onDownload(file, content);
    }
  }, [file, content, onDownload]);

  const handleCopyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      const button = document.querySelector('[data-copy-button]');
      if (button) {
        const originalText = button.innerHTML;
        button.innerHTML = '<svg class="w-4 h-4"><path d="M20 6L9 17l-5-5"/></svg> コピー済み';
        setTimeout(() => {
          button.innerHTML = originalText;
        }, 2000);
      }
    } catch (error) {
      setError('クリップボードへのコピーに失敗しました');
    }
  }, [content]);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      else if (e.key === 'Escape' && !isEditing) {
        onClose();
      }
      else if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        if (fileInfo?.canEdit) {
          handleToggleEdit();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isEditing, handleSave, onClose, handleToggleEdit, fileInfo]);

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!confirm('未保存の変更があります。閉じますか？')) {
        return;
      }
    }
    onClose();
  }, [hasUnsavedChanges, onClose]);

  if (!isOpen || !file) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={handleClose} />

      <div className={`
        fixed z-50 bg-white rounded-lg shadow-xl transition-all duration-300
        ${isFullscreen
          ? 'inset-4'
          : 'top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl max-h-[90vh] mx-4'
        }
      `}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <FileIcon file={file} />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {file.name}
              </h2>
              <p className="text-sm text-gray-500">
                {formatFileSize(file.size)} • {formatDate(file.modifiedDate)}
              </p>
            </div>
            {hasUnsavedChanges && (
              <div className="flex items-center text-orange-600">
                <AlertCircle className="w-4 h-4 mr-1" />
                <span className="text-sm">未保存</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {fileInfo?.isText && content && (
              <button
                onClick={handleCopyToClipboard}
                className="inline-flex items-center px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors duration-200"
                title="クリップボードにコピー"
                data-copy-button
              >
                <Copy className="w-4 h-4 mr-1" />
                コピー
              </button>
            )}

            {fileInfo?.canEdit && (
              <button
                onClick={handleToggleEdit}
                className={`inline-flex items-center px-3 py-1 text-sm rounded transition-colors duration-200 ${isEditing
                    ? 'text-blue-600 bg-blue-100 hover:bg-blue-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                title={isEditing ? '編集を終了' : '編集モード'}
              >
                {isEditing ? <Eye className="w-4 h-4 mr-1" /> : <Edit3 className="w-4 h-4 mr-1" />}
                {isEditing ? '表示' : '編集'}
              </button>
            )}

            {isEditing && hasUnsavedChanges && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded transition-colors duration-200"
                title="保存 (Ctrl+S)"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-1" />
                )}
                保存
              </button>
            )}

            <button
              onClick={handleDownload}
              className="inline-flex items-center px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors duration-200"
              title="ダウンロード"
            >
              <Download className="w-4 h-4 mr-1" />
              DL
            </button>

            <button
              onClick={handleToggleFullscreen}
              className="inline-flex items-center px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors duration-200"
              title={isFullscreen ? '元のサイズ' : 'フルスクリーン'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>

            <button
              onClick={handleClose}
              className="inline-flex items-center px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors duration-200"
              title="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <LoadingContent />
          ) : error ? (
            <ErrorContent error={error} onRetry={() => setError('')} />
          ) : (
            <FileContent
              file={file}
              content={content}
              isEditing={isEditing}
              fileInfo={fileInfo}
              onChange={setContent}
              isFullscreen={isFullscreen}
            />
          )}
        </div>

        {isEditing && (
          <div className="border-t border-gray-200 p-4 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                編集モード • Ctrl+S: 保存 • Ctrl+E: 表示モードに切り替え
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setContent(originalContent)}
                  disabled={!hasUnsavedChanges}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 transition-colors duration-200"
                >
                  リセット
                </button>
                <button
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges || isSaving}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded transition-colors duration-200"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-1" />
                  )}
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const FileIcon = ({ file }) => {
  if (isImageFile(file.name)) {
    return <Image className="w-6 h-6 text-green-600" />;
  } else if (isAudioFile(file.name)) {
    return <Music className="w-6 h-6 text-pink-600" />;
  } else if (isVideoFile(file.name)) {
    return <Video className="w-6 h-6 text-purple-600" />;
  } else if (isTextFile(file.name)) {
    return <FileText className="w-6 h-6 text-blue-600" />;
  } else {
    return <File className="w-6 h-6 text-gray-600" />;
  }
};

const LoadingContent = () => (
  <div className="flex items-center justify-center h-64">
    <div className="text-center">
      <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
      <p className="text-gray-600">ファイルを読み込み中...</p>
    </div>
  </div>
);

const ErrorContent = ({ error, onRetry }) => (
  <div className="flex items-center justify-center h-64">
    <div className="text-center">
      <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-4" />
      <p className="text-red-700 mb-4">{error}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors duration-200"
      >
        再試行
      </button>
    </div>
  </div>
);

const FileContent = ({
  file,
  content,
  isEditing,
  fileInfo,
  onChange,
  isFullscreen
}) => {
  const containerHeight = isFullscreen ? 'calc(100vh - 200px)' : '60vh';

  let displayContent = content;

  if (typeof content === 'string' && content.trim().startsWith('{')) {
    try {
      const parsedContent = JSON.parse(content);

      if (parsedContent.success && parsedContent.data && parsedContent.data.file) {
        displayContent = parsedContent.data.file.content || '';
      } else if (parsedContent.data && parsedContent.data.file && parsedContent.data.file.content) {
        displayContent = parsedContent.data.file.content;
      }
    } catch (parseError) {
      // JSONパースに失敗した場合は元のcontentをそのまま使用
    }
  }

  if (typeof displayContent === 'string' && displayContent.startsWith('base64:')) {
    // Base64 コンテンツはそのまま使用
  }

  if (displayContent === undefined || displayContent === null) {
    return (
      <div className="p-4 flex items-center justify-center" style={{ height: containerHeight }}>
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">
            ファイル内容を読み込めませんでした
          </p>
          <p className="text-sm text-gray-500">
            コンテンツが空またはundefinedです
          </p>
        </div>
      </div>
    );
  }

  if (fileInfo?.isText) {
    return (
      <div className="p-4" style={{ height: containerHeight }}>
        {isEditing ? (
          <textarea
            value={displayContent || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-full p-4 border border-gray-300 rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="ファイルの内容を入力してください..."
            style={{ minHeight: '400px' }}
          />
        ) : (
          <div className="h-full overflow-auto">
            <pre className="whitespace-pre-wrap font-mono text-sm text-gray-900 bg-gray-50 p-4 rounded-lg">
              {displayContent || 'ファイルは空です'}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (fileInfo?.isImage && displayContent) {
    let imageUrl;
    if (displayContent.startsWith('data:')) {
      imageUrl = displayContent;
    } else if (displayContent.startsWith('base64:')) {
      const base64Data = displayContent.substring(7);
      imageUrl = `data:${fileInfo.mimeType};base64,${base64Data}`;
    } else {
      imageUrl = `data:${fileInfo.mimeType};base64,${displayContent}`;
    }

    return (
      <div className="p-4 flex items-center justify-center" style={{ height: containerHeight }}>
        <img
          src={imageUrl}
          alt={file.name}
          className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.parentNode.innerHTML = `
              <div class="text-center">
                <div class="w-16 h-16 bg-gray-200 rounded-lg mx-auto mb-4 flex items-center justify-center">
                  <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                  </svg>
                </div>
                <p class="text-gray-600">画像を表示できませんでした</p>
              </div>
            `;
          }}
        />
      </div>
    );
  }

  if (fileInfo?.isAudio && displayContent) {
    let audioUrl;
    if (displayContent.startsWith('data:')) {
      audioUrl = displayContent;
    } else if (displayContent.startsWith('base64:')) {
      const base64Data = displayContent.substring(7);
      audioUrl = `data:${fileInfo.mimeType};base64,${base64Data}`;
    } else {
      audioUrl = `data:${fileInfo.mimeType};base64,${displayContent}`;
    }

    return (
      <div className="p-4 flex items-center justify-center" style={{ height: containerHeight }}>
        <div className="text-center">
          <Music className="w-16 h-16 text-pink-600 mx-auto mb-4" />
          <audio controls className="w-full max-w-md">
            <source src={audioUrl} type={fileInfo.mimeType} />
            お使いのブラウザは音声ファイルをサポートしていません。
          </audio>
          <p className="text-sm text-gray-500 mt-2">{file.name}</p>
        </div>
      </div>
    );
  }

  if (fileInfo?.isVideo && displayContent) {
    let videoUrl;
    if (displayContent.startsWith('data:')) {
      videoUrl = displayContent;
    } else if (displayContent.startsWith('base64:')) {
      const base64Data = displayContent.substring(7);
      videoUrl = `data:${fileInfo.mimeType};base64,${base64Data}`;
    } else {
      videoUrl = `data:${fileInfo.mimeType};base64,${displayContent}`;
    }

    return (
      <div className="p-4 flex items-center justify-center" style={{ height: containerHeight }}>
        <div className="text-center">
          <video controls className="max-w-full max-h-full rounded-lg shadow-lg">
            <source src={videoUrl} type={fileInfo.mimeType} />
            お使いのブラウザは動画ファイルをサポートしていません。
          </video>
          <p className="text-sm text-gray-500 mt-2">{file.name}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex items-center justify-center" style={{ height: containerHeight }}>
      <div className="text-center">
        <File className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 mb-2">
          このファイル形式はプレビューできません
        </p>
        <p className="text-sm text-gray-500">
          ファイルタイプ: {fileInfo?.mimeType}
        </p>
        {displayContent && (
          <div className="mt-4 text-xs text-gray-400">
            <p>コンテンツサイズ: {displayContent.length} 文字</p>
            <p>データ型: {typeof displayContent}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FilePreviewModal;