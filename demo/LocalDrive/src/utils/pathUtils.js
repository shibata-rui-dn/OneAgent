/**
 * パスを正規化（相対パス形式に変換）
 * @param {string} path - 元のパス
 * @returns {string} 正規化されたパス
 */
export const normalizePath = (path) => {
  if (!path) return '';
  
  // 先頭と末尾のスラッシュを除去
  path = path.replace(/^\/+|\/+$/g, '');
  
  // 連続するスラッシュを単一に
  path = path.replace(/\/+/g, '/');
  
  // パストラバーサル攻撃を防ぐため '..' を除去
  path = path.replace(/\.\./g, '');
  
  return path;
};

/**
 * パスを結合
 * @param {...string} paths - 結合するパス
 * @returns {string} 結合されたパス
 */
export const joinPaths = (...paths) => {
  const validPaths = paths.filter(Boolean);
  if (validPaths.length === 0) return '';
  
  const joined = validPaths.join('/');
  return normalizePath(joined);
};