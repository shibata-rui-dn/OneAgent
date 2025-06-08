export const extractFileContentFromResponse = (result) => {
  if (!result) return null;

  if (result.data && result.data.file && result.data.file.content !== undefined) {
    return result.data.file.content;
  }

  if (result.result) {
    let parsedResult;
    try {
      let resultText;
      if (Array.isArray(result.result.content)) {
        resultText = result.result.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join('\n');
      } else if (typeof result.result === 'string') {
        resultText = result.result;
      } else if (result.result.text) {
        resultText = result.result.text;
      } else {
        resultText = JSON.stringify(result.result);
      }
      
      parsedResult = JSON.parse(resultText);
    } catch (parseError) {
      parsedResult = result.result;
    }

    if (parsedResult.success && parsedResult.data && parsedResult.data.file) {
      return parsedResult.data.file.content || '';
    } else if (Array.isArray(result.result.content)) {
      return result.result.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');
    } else if (typeof result.result === 'string') {
      return result.result;
    } else if (result.result.text) {
      return result.result.text;
    } else if (result.result.content) {
      return result.result.content;
    }
  }

  return null;
};

export const extractZipDataFromResponse = (result) => {
  if (!result) return null;

  if (result.data && result.data.zipFile) {
    return result.data.zipFile;
  }

  if (result.result) {
    let parsedResult;
    try {
      const resultText = Array.isArray(result.result.content) 
        ? result.result.content.filter(item => item.type === 'text').map(item => item.text).join('\n')
        : typeof result.result === 'string' 
          ? result.result 
          : JSON.stringify(result.result);
      
      parsedResult = JSON.parse(resultText);
      
      if (parsedResult.success && parsedResult.data && parsedResult.data.zipFile) {
        return parsedResult.data.zipFile;
      }
    } catch (parseError) {
      console.error('ZIP response parse error:', parseError);
    }
  }

  return null;
};

export const base64ToBlob = (base64Data, mimeType = 'application/octet-stream') => {
  const cleanBase64 = base64Data.startsWith('base64:') 
    ? base64Data.substring(7) 
    : base64Data;

  try {
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  } catch (error) {
    throw new Error(`Base64データの変換に失敗しました: ${error.message}`);
  }
};

export const getFileMimeType = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  const mimeTypes = {
    'txt': 'text/plain', 'md': 'text/markdown', 'json': 'application/json',
    'xml': 'application/xml', 'csv': 'text/csv', 'html': 'text/html',
    'css': 'text/css', 'js': 'application/javascript',
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
    'gif': 'image/gif', 'svg': 'image/svg+xml', 'webp': 'image/webp',
    'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'mp4': 'video/mp4',
    'pdf': 'application/pdf', 'zip': 'application/zip'
  };

  return mimeTypes[ext] || 'application/octet-stream';
};

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

export const createBlobFromContent = (content, filename) => {
  if (typeof content === 'string' && content.startsWith('base64:')) {
    const mimeType = getFileMimeType(filename);
    return base64ToBlob(content, mimeType);
  } else if (typeof content === 'string' && content.startsWith('data:')) {
    const mimeType = content.split(',')[0].split(':')[1].split(';')[0];
    const base64Data = content.split(',')[1];
    return base64ToBlob(base64Data, mimeType);
  } else {
    const mimeType = getFileMimeType(filename);
    return new Blob([content], { type: mimeType });
  }
};

export const downloadSingleFile = async (file, content, executeFileOperation) => {
  if (file.isDirectory) {
    throw new Error('ディレクトリはダウンロードできません');
  }

  let downloadContent = content;
  
  if (!downloadContent) {
    const result = await executeFileOperation('read_file', {
      path: file.path || file.name
    });
    
    if (!result?.success) {
      throw new Error('ファイルの読み取りに失敗しました');
    }

    downloadContent = extractFileContentFromResponse(result);
    
    if (!downloadContent && downloadContent !== '') {
      throw new Error('ファイル内容を取得できませんでした');
    }
  }
  
  const blob = createBlobFromContent(downloadContent, file.name);
  downloadBlob(blob, file.name);
};

export const downloadMultipleFilesAsZip = async (selectedFiles, executeFileOperation) => {
  if (!selectedFiles || selectedFiles.length === 0) {
    throw new Error('ダウンロードするファイルが選択されていません');
  }

  const fileList = selectedFiles.map(file => file.path || file.name || file);
  
  const result = await executeFileOperation('download_zip', {
    zipPaths: fileList
  });
  
  if (!result?.success) {
    throw new Error(result?.error?.message || 'ZIPファイルの作成に失敗しました');
  }

  const zipData = extractZipDataFromResponse(result);

  if (!zipData || !zipData.content) {
    throw new Error('ZIPファイルデータが見つかりません');
  }

  const blob = base64ToBlob(zipData.content, 'application/zip');
  const filename = zipData.name || `selected_files_${new Date().toISOString().slice(0, 10)}.zip`;
  
  downloadBlob(blob, filename);
  
  return filename;
};