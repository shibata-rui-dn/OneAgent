#!/usr/bin/env node
/**
 * bundle-imports.mjs
 *
 * 指定したエントリーファイル内のimport文からローカルパスのモジュールを再帰的に抽出し、
 * 各ファイルの内容をコードブロック形式（例: ```ファイル名 ... ```）で1つのテキストにまとめた結果を、
 * ./log/result.txt に保存します。
 *
 * エントリーファイル自体も含めます。
 *
 * 使い方:
 *   node bundle-imports.mjs <エントリーファイルパス>
 *
 * ※ ファイルの拡張子が省略されている場合、.js と .jsx を順にチェックします。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESモジュールで __dirname を再現するための定義
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// エントリーファイル内のimport文からパス部分を抽出する関数
function extractImports(fileContent) {
  // 単純な正規表現: import ... from 'パス' または import ... from "パス"
  const importRegex = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
  const matches = [];
  let match;
  while ((match = importRegex.exec(fileContent)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

// エントリーファイルから再帰的に読み込み、コードをまとめる関数
function bundleImports(entryFilePath) {
  const entryDir = path.dirname(entryFilePath);
  // 重複読み込みを防ぐためのセット
  const processedFiles = new Set();
  let bundleContent = '';

  function processFile(filePath, baseDir) {
    // 絶対パスに変換（baseDirは呼び出し元のディレクトリ）
    let absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(baseDir, filePath);

    // 拡張子がなければ、.js, .jsx の順でファイルの存在を確認
    if (!fs.existsSync(absolutePath)) {
      if (fs.existsSync(absolutePath + '.js')) {
        absolutePath += '.js';
      } else if (fs.existsSync(absolutePath + '.jsx')) {
        absolutePath += '.jsx';
      } else {
        console.error(`ファイルが見つかりません: ${filePath}`);
        return;
      }
    }

    // 既に処理済みの場合はスキップ
    if (processedFiles.has(absolutePath)) {
      return;
    }
    processedFiles.add(absolutePath);

    // ファイル内容を読み込む
    const content = fs.readFileSync(absolutePath, 'utf-8');

    // 結果にコードブロック形式で追加（ファイル名または絶対パスを先頭に記載）
    bundleContent += `\n\`\`\`${absolutePath}\n${content}\n\`\`\`\n`;

    // このファイル内のimport文から、さらに読み込むべきファイルを抽出
    const furtherImports = extractImports(content);
    furtherImports.forEach(importPath => {
      // 外部ライブラリはスキップし、ローカルパスのみ処理
      if (importPath.startsWith('.') || importPath.startsWith('/')) {
        processFile(importPath, path.dirname(absolutePath));
      }
    });
  }

  // エントリーファイル自体も結果に含める
  const entryContent = fs.readFileSync(entryFilePath, 'utf-8');
  bundleContent += `\n\`\`\`${entryFilePath}\n${entryContent}\n\`\`\`\n`;

  // エントリーファイルのimport文からスタート
  const imports = extractImports(entryContent);
  imports.forEach(importPath => {
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      processFile(importPath, entryDir);
    }
  });

  return bundleContent;
}

// コマンドライン引数のチェック
if (process.argv.length < 3) {
  console.error("使用方法: node bundle-imports.mjs <エントリーファイルパス>");
  process.exit(1);
}

const entryFile = process.argv[2];
const result = bundleImports(entryFile);

// ログを保存するディレクトリが存在しなければ作成
const logDir = path.join(process.cwd(), 'myMemo');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logFilePath = path.join(logDir, 'result.txt');

// 結果をログファイルに書き出し
fs.writeFileSync(logFilePath, result, 'utf-8');
console.log(`ログを保存しました: ${logFilePath}`);
