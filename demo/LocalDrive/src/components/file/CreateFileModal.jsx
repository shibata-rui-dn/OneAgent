import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  FilePlus,
  FolderPlus,
  Upload,
  FileText,
  Loader2,
  AlertCircle,
  Check
} from 'lucide-react';

/**
 * OneDrive風の作成・アップロードモーダルコンポーネント
 */
const CreateFileModal = ({ 
  isOpen, 
  onClose, 
  onCreateFile, 
  onCreateFolder, 
  onFileUpload,
  currentPath = '',
  isCreating = false 
}) => {
  const [activeTab, setActiveTab] = useState('create'); // 'create' or 'upload'
  const [createType, setCreateType] = useState('file'); // 'file' or 'folder'
  const [fileName, setFileName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [error, setError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  
  const fileInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const modalRef = useRef(null);

  // モーダルが開かれた時の初期化
  useEffect(() => {
    if (isOpen) {
      setActiveTab('create');
      setCreateType('file');
      setFileName('');
      setFileContent('');
      setError('');
      setIsDragOver(false);
      
      // ファイル名入力にフォーカス
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ファイル名の検証
  const validateFileName = (name) => {
    if (!name.trim()) {
      return `${createType === 'folder' ? 'フォルダ' : 'ファイル'}名が必要です`;
    }
    if (name.length > 255) {
      return '名前が長すぎます（255文字以内）';
    }
    if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) {
      return '無効な文字が含まれています';
    }
    // 予約語チェック
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL'];
    const nameWithoutExt = name.split('.')[0].toUpperCase();
    if (reservedNames.includes(nameWithoutExt)) {
      return '予約された名前は使用できません';
    }
    return null;
  };

  // 作成処理
  const handleCreate = async () => {
    const trimmedName = fileName.trim();
    const validationError = validateFileName(trimmedName);
    
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setError('');
      if (createType === 'folder') {
        await onCreateFolder(trimmedName);
      } else {
        await onCreateFile(trimmedName, fileContent);
      }
      onClose();
    } catch (error) {
      setError(error.message || '作成に失敗しました');
    }
  };

  // ファイルアップロード処理
  const handleFileUpload = (files) => {
    if (files && files.length > 0) {
      onFileUpload(files);
      onClose();
    }
  };

  // ドラッグ&ドロップ処理
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // モーダル外にドラッグした場合のみ状態をリセット
    if (!modalRef.current?.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files);
    }
  }, []);

  // ファイル選択
  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* オーバーレイ */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        {/* モーダル */}
        <div 
          ref={modalRef}
          className={`bg-white rounded-lg shadow-xl w-full max-w-md transition-all duration-300 ${
            isDragOver ? 'border-2 border-dashed border-blue-500 bg-blue-50' : ''
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              新しいアイテムを作成
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
              disabled={isCreating}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* タブ */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('create')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors duration-200 ${
                activeTab === 'create'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              disabled={isCreating}
            >
              <FilePlus className="w-4 h-4 inline-block mr-2" />
              作成
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors duration-200 ${
                activeTab === 'upload'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              disabled={isCreating}
            >
              <Upload className="w-4 h-4 inline-block mr-2" />
              アップロード
            </button>
          </div>

          {/* コンテンツ */}
          <div className="p-6">
            {isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-50 bg-opacity-90 rounded-lg z-10">
                <div className="text-center">
                  <Upload className="w-12 h-12 text-blue-500 mx-auto mb-2" />
                  <p className="text-lg font-medium text-blue-700">
                    ファイルをドロップしてアップロード
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'create' ? (
              <CreateTab
                createType={createType}
                setCreateType={setCreateType}
                fileName={fileName}
                setFileName={setFileName}
                fileContent={fileContent}
                setFileContent={setFileContent}
                error={error}
                setError={setError}
                isCreating={isCreating}
                onCreate={handleCreate}
                nameInputRef={nameInputRef}
                currentPath={currentPath}
              />
            ) : (
              <UploadTab
                onFileSelect={handleFileSelect}
                isDragOver={isDragOver}
                currentPath={currentPath}
              />
            )}
          </div>

          {/* 隠しファイル入力 */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>
      </div>
    </>
  );
};

/**
 * 作成タブコンポーネント
 */
const CreateTab = ({
  createType,
  setCreateType,
  fileName,
  setFileName,
  fileContent,
  setFileContent,
  error,
  setError,
  isCreating,
  onCreate,
  nameInputRef,
  currentPath
}) => {
  const handleNameChange = (e) => {
    setFileName(e.target.value);
    if (error) {
      setError('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onCreate();
    }
  };

  const getPathDisplay = () => {
    if (currentPath === 'recent' || currentPath === 'favorites' || currentPath === 'trash') {
      return 'ドキュメント';
    }
    if (currentPath === 'documents' || !currentPath) {
      return 'ルート';
    }
    return currentPath.replace('documents/', '');
  };

  return (
    <div className="space-y-4">
      {/* 作成タイプ選択 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          作成するアイテム
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setCreateType('file')}
            className={`p-4 border-2 rounded-lg transition-all duration-200 ${
              createType === 'file'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 hover:border-gray-300 text-gray-700'
            }`}
            disabled={isCreating}
          >
            <FileText className="w-8 h-8 mx-auto mb-2" />
            <div className="text-sm font-medium">ファイル</div>
            <div className="text-xs text-gray-500">テキストファイル</div>
          </button>
          <button
            onClick={() => setCreateType('folder')}
            className={`p-4 border-2 rounded-lg transition-all duration-200 ${
              createType === 'folder'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 hover:border-gray-300 text-gray-700'
            }`}
            disabled={isCreating}
          >
            <FolderPlus className="w-8 h-8 mx-auto mb-2" />
            <div className="text-sm font-medium">フォルダ</div>
            <div className="text-xs text-gray-500">新しいフォルダ</div>
          </button>
        </div>
      </div>

      {/* 作成場所の表示 */}
      <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
        <span className="font-medium">作成場所:</span> {getPathDisplay()}
      </div>

      {/* ファイル名入力 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {createType === 'folder' ? 'フォルダ名' : 'ファイル名'}
        </label>
        <input
          ref={nameInputRef}
          type="text"
          value={fileName}
          onChange={handleNameChange}
          onKeyDown={handleKeyDown}
          placeholder={createType === 'folder' ? 'フォルダ名を入力' : 'ファイル名を入力（例: document.txt）'}
          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error ? 'border-red-300' : 'border-gray-300'
          }`}
          disabled={isCreating}
        />
      </div>

      {/* ファイル内容入力（ファイル作成時のみ） */}
      {createType === 'file' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            初期内容（オプション）
          </label>
          <textarea
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            placeholder="ファイルの初期内容を入力（空でも可）"
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            disabled={isCreating}
          />
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="flex items-center text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 mr-2" />
          {error}
        </div>
      )}

      {/* 作成ボタン */}
      <div className="flex justify-end space-x-3">
        <button
          onClick={onCreate}
          disabled={!fileName.trim() || isCreating}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {isCreating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              作成中...
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" />
              {createType === 'folder' ? 'フォルダを作成' : 'ファイルを作成'}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

/**
 * アップロードタブコンポーネント
 */
const UploadTab = ({ onFileSelect, isDragOver, currentPath }) => {
  const getPathDisplay = () => {
    if (currentPath === 'recent' || currentPath === 'favorites' || currentPath === 'trash') {
      return 'ドキュメント';
    }
    if (currentPath === 'documents' || !currentPath) {
      return 'ルート';
    }
    return currentPath.replace('documents/', '');
  };

  return (
    <div className="space-y-4">
      {/* アップロード場所の表示 */}
      <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
        <span className="font-medium">アップロード先:</span> {getPathDisplay()}
      </div>

      {/* ドラッグ&ドロップエリア */}
      <div 
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 ${
          isDragOver 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          ファイルをアップロード
        </h3>
        <p className="text-gray-600 mb-4">
          ファイルをドラッグ&ドロップするか、クリックして選択
        </p>
        <button
          onClick={onFileSelect}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
        >
          <Upload className="w-4 h-4 mr-2" />
          ファイルを選択
        </button>
      </div>

      {/* サポートファイル情報 */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>• 複数ファイルの同時アップロード対応</p>
        <p>• 最大ファイルサイズ: 450MB</p>
        <p>• サポート形式: テキスト、画像、音声、動画、ドキュメントなど</p>
      </div>
    </div>
  );
};

export default CreateFileModal;