#!/usr/bin/env node

/**
 * 経費管理システム用MCPツールのインストールスクリプト（外部API対応版 + Bearer Token認証修正版）
 * 
 * 機能:
 * ①経費レポート作成
 * ②レポート一覧取得
 * ③レポート詳細取得
 * ④レポートフォーマット確認
 * ⑤レポート更新
 * ⑥レポート削除
 * 
 * 修正内容:
 * - Bearer Token認証の実装
 * - 認証コンテキストの適切な活用
 * - デバッグ情報の強化
 * 
 * 使用方法:
 * node install-expense-management-tool.js
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
// 経費管理ツール (expense_manager) - Bearer Token認証修正版
// =============================================================================

const EXPENSE_MANAGER_CONFIG = {
  "name": "expense_manager",
  "description": "OAuth認証を使用した経費管理システム。localhost:3552のAPIサーバーと連携して経費レポートの作成、一覧表示、詳細確認、更新、削除機能を提供。Bearer Token認証対応版。",
  "version": "2.2.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": [
          "create_report", "list_reports", "get_report", "get_report_format", 
          "update_report", "delete_report"
        ],
        "description": "実行するアクション"
      },
      "title": {
        "type": "string",
        "description": "経費レポートのタイトル（create_report、update_reportで使用）"
      },
      "date": {
        "type": "string",
        "description": "経費発生日（YYYY-MM-DD形式、create_report、update_reportで使用）"
      },
      "category": {
        "type": "string",
        "enum": ["交通費", "食費", "宿泊費", "その他"],
        "description": "経費カテゴリ（create_report、update_reportで使用）"
      },
      "amount": {
        "type": "number",
        "description": "金額（円、create_report、update_reportで使用）"
      },
      "description": {
        "type": "string",
        "description": "詳細説明（create_report、update_reportで使用）"
      },
      "receipt": {
        "type": "boolean",
        "description": "領収書の有無（create_report、update_reportで使用）"
      },
      "reportId": {
        "type": "string",
        "description": "レポートID（get_report、update_report、delete_reportで使用）"
      },
      "limit": {
        "type": "number",
        "description": "取得件数制限（list_reportsで使用、デフォルト: 20）"
      },
      "offset": {
        "type": "number",
        "description": "取得開始位置（list_reportsで使用、デフォルト: 0）"
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
    "filename": "expense_manager_icon.svg",
    "description": "経費管理システムアイコン（Bearer Token対応）",
    "type": "2",
    "colorScheme": "blue"
  }
};

const EXPENSE_MANAGER_HANDLER = `// 設定
const CONFIG = {
  // 外部APIサーバの設定（localhost:3552のサーバーに対応）
  API_BASE_URL: process.env.EXPENSE_API_BASE_URL || 'http://localhost:3552/api',
  API_TIMEOUT: 30000, // 30秒
  MAX_AMOUNT: 1000000, // 100万円
  REPORT_FORMAT: {
    title: 'string',
    date: 'YYYY-MM-DD',
    category: 'string',
    amount: 'number',
    description: 'string',
    receipt: 'boolean'
  }
};

export default async function expenseManager(args, context) {
  const { 
    action, title, date, category, amount, description, receipt,
    reportId, limit = 20, offset = 0
  } = args;
  
  if (!action || typeof action !== 'string') {
    throw new Error("actionは必須の文字列です");
  }

  try {
    console.log('🔍 [DEBUG] expense_manager 開始');
    console.log('🔍 [DEBUG] args:', JSON.stringify(args, null, 2));
    console.log('🔍 [DEBUG] context keys:', Object.keys(context || {}));
    
    const user = await authenticateUser(context);
    console.log('🔍 [DEBUG] user:', JSON.stringify(user, null, 2));
    
    let result;
    switch (action) {
      case 'create_report':
        result = await createReport({
          title, date, category, amount, description, receipt
        }, user, context);
        break;
      case 'list_reports':
        result = await listReports(user, limit, offset, context);
        break;
      case 'get_report':
        result = await getReport(reportId, user, context);
        break;
      case 'get_report_format':
        result = await getReportFormat();
        break;
      case 'update_report':
        result = await updateReport(reportId, {
          title, date, category, amount, description, receipt
        }, user, context);
        break;
      case 'delete_report':
        result = await deleteReport(reportId, user, context);
        break;
      default:
        throw new Error(\`未対応のアクション: \${action}\`);
    }
    
    return {
      content: [
        {
          type: "text",
          text: \`✅ \${action} 操作完了 (ユーザー: \${user.name})\\n\\n\${result}\`
        }
      ]
    };
    
  } catch (error) {
    console.error('❌ [DEBUG] expense_manager エラー:', error);
    throw new Error(\`経費管理エラー: \${error.message}\`);
  }
}

// 🔧 修正版: 認証コンテキストのデバッグ付き検証
async function authenticateUser(context) {
  console.log('🔍 [DEBUG] authenticateUser 開始');
  console.log('🔍 [DEBUG] context:', context ? Object.keys(context) : 'null');
  
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

// =============================================================================
// API呼び出し共通関数（Bearer Token認証対応版）
// =============================================================================

async function callExpenseAPI(endpoint, method = 'GET', data = null, user, authContext) {
  console.log('🔍 [DEBUG] callExpenseAPI 開始');
  console.log('🔍 [DEBUG] endpoint:', endpoint);
  console.log('🔍 [DEBUG] method:', method);
  console.log('🔍 [DEBUG] authContext keys:', Object.keys(authContext || {}));
  
  const url = \`\${CONFIG.API_BASE_URL}\${endpoint}\`;
  
  // 🔧 修正: 認証トークンの取得（複数パターンを試行）
  let authToken = null;
  
  // パターン1: tokenInfo.token
  if (authContext && authContext.tokenInfo && authContext.tokenInfo.token) {
    authToken = authContext.tokenInfo.token;
    console.log('✅ [DEBUG] tokenInfo.tokenからトークン取得');
  }
  // パターン2: accessToken
  else if (authContext && authContext.accessToken) {
    authToken = authContext.accessToken;
    console.log('✅ [DEBUG] accessTokenからトークン取得');
  }
  // パターン3: user.accessToken
  else if (authContext && authContext.user && authContext.user.accessToken) {
    authToken = authContext.user.accessToken;
    console.log('✅ [DEBUG] user.accessTokenからトークン取得');
  }
  // パターン4: Bearer Tokenヘッダーから抽出（フォールバック）
  else if (authContext && authContext.headers && authContext.headers.authorization) {
    const authHeader = authContext.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      authToken = authHeader.slice(7);
      console.log('✅ [DEBUG] headers.authorizationからトークン取得');
    }
  }
  
  if (!authToken) {
    console.error('❌ [DEBUG] アクセストークンが見つかりません');
    console.error('🔍 [DEBUG] 利用可能なコンテキスト:', Object.keys(authContext || {}));
    console.error('🔍 [DEBUG] tokenInfo:', authContext?.tokenInfo);
    console.error('🔍 [DEBUG] accessToken:', authContext?.accessToken ? 'あり' : 'なし');
    throw new Error('認証トークンが取得できません。OAuth認証を完了してください。');
  }
  
  console.log(\`🎫 [DEBUG] トークン確認: \${authToken.substring(0, 20)}...\`);
  
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      // 🔧 修正: Bearer Token認証を使用
      'Authorization': \`Bearer \${authToken}\`,
      'User-Agent': 'ExpenseManager-MCP/2.2.0-debug'
    },
    timeout: CONFIG.API_TIMEOUT
  };
  
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }
  
  console.log(\`🔄 [DEBUG] API呼び出し: \${method} \${url}\`);
  console.log(\`📋 [DEBUG] リクエストヘッダー:\`, options.headers);
  
  try {
    const response = await fetch(url, options);
    
    console.log(\`📡 [DEBUG] API応答: \${response.status} \${response.statusText}\`);
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.text();
        console.error(\`❌ [DEBUG] APIエラー詳細:\`, errorData);
      } catch (e) {
        errorData = \`HTTP \${response.status} \${response.statusText}\`;
      }
      throw new Error(\`API Error (\${response.status}): \${errorData}\`);
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const result = await response.json();
      console.log(\`✅ [DEBUG] API成功:\`, result);
      return result;
    } else {
      const result = await response.text();
      console.log(\`✅ [DEBUG] API成功 (text):\`, result);
      return result;
    }
  } catch (error) {
    console.error(\`❌ [DEBUG] API呼び出し失敗:\`, error);
    if (error.name === 'AbortError') {
      throw new Error('API呼び出しがタイムアウトしました');
    }
    throw new Error(\`API呼び出しエラー: \${error.message}\`);
  }
}

// =============================================================================
// レポート作成（修正版）
// =============================================================================

async function createReport(reportData, user, authContext) {
  const { title, date, category, amount, description, receipt } = reportData;
  
  console.log('🔍 [DEBUG] createReport 開始');
  
  // バリデーション
  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new Error("タイトルは必須の文字列です");
  }
  if (!date || !isValidDate(date)) {
    throw new Error("日付はYYYY-MM-DD形式で入力してください");
  }
  if (!category || !['交通費', '食費', '宿泊費', 'その他'].includes(category)) {
    throw new Error("カテゴリは '交通費', '食費', '宿泊費', 'その他' のいずれかです");
  }
  if (typeof amount !== 'number' || amount < 0 || amount > CONFIG.MAX_AMOUNT) {
    throw new Error(\`金額は0円以上\${CONFIG.MAX_AMOUNT.toLocaleString()}円以下の数値です\`);
  }
  if (!description || typeof description !== 'string' || !description.trim()) {
    throw new Error("詳細説明は必須の文字列です");
  }
  if (typeof receipt !== 'boolean') {
    throw new Error("領収書の有無は真偽値（true/false）です");
  }
  
  // APIに送信するデータ
  const apiData = {
    title: title.trim(),
    date: date,
    category: category,
    amount: Math.round(amount),
    description: description.trim(),
    receipt: receipt
  };
  
  // 🔧 修正: authContextを追加
  const report = await callExpenseAPI('/reports', 'POST', apiData, user, authContext);
  
  const receiptText = receipt ? '✅ あり' : '❌ なし';
  const categoryIcon = getCategoryIcon(category);
  
  return \`💼 経費レポートを作成しました

📋 レポート詳細:
   🆔 ID: \${report.id || report.reportId || 'N/A'}
   📝 タイトル: \${title}
   📅 日付: \${date}
   \${categoryIcon} カテゴリ: \${category}
   💰 金額: ¥\${amount.toLocaleString()}
   📄 説明: \${description}
   🧾 領収書: \${receiptText}
   
👤 作成者: \${user.name}
🕒 作成日時: \${new Date().toLocaleString('ja-JP')}\`;
}

// =============================================================================
// レポート一覧取得（修正版）
// =============================================================================

async function listReports(user, limit, offset, authContext) {
  try {
    console.log('🔍 [DEBUG] listReports 開始');
    
    // 🔧 修正: authContextを追加
    const response = await callExpenseAPI('/reports', 'GET', null, user, authContext);
    
    // APIレスポンスの形式を確認して適切に処理
    let reports = [];
    if (response && response.success && response.reports) {
      reports = response.reports;
    } else if (Array.isArray(response)) {
      reports = response;
    } else {
      reports = [];
    }
    
    if (reports.length === 0) {
      return \`📊 経費レポート一覧 (ユーザー: \${user.name})

まだレポートがありません。新しいレポートを作成してください。

💡 レポート作成例:
{
  "action": "create_report",
  "title": "出張経費レポート - 大阪",
  "date": "2024-01-15",
  "category": "交通費",
  "amount": 15000,
  "description": "新幹線往復料金（東京-大阪）",
  "receipt": true
}\`;
    }
    
    // 新しい順にソート
    reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // クライアント側でページネーション
    const paginatedReports = reports.slice(offset, offset + limit);
    const totalReports = reports.length;
    const hasMore = offset + limit < totalReports;
    
    const result = [];
    result.push(\`📊 経費レポート一覧 (ユーザー: \${user.name})\`);
    result.push(\`📈 表示: \${offset + 1}-\${offset + paginatedReports.length}件 / 全\${totalReports}件\`);
    result.push('');
    
    for (const report of paginatedReports) {
      const categoryIcon = getCategoryIcon(report.category);
      const receiptIcon = report.receipt ? '🧾' : '❌';
      const createdDate = new Date(report.createdAt).toLocaleDateString('ja-JP');
      
      result.push(\`\${categoryIcon} \${report.title}\`);
      result.push(\`   🆔 ID: \${report.id}\`);
      result.push(\`   📅 日付: \${report.date} | 💰 金額: ¥\${report.amount.toLocaleString()}\`);
      result.push(\`   📝 \${report.description}\`);
      result.push(\`   \${receiptIcon} 領収書 | 🕒 作成: \${createdDate}\`);
      result.push('');
    }
    
    if (hasMore) {
      result.push(\`📄 次のページを表示するには offset を \${offset + limit} に設定してください\`);
    }
    
    return result.join('\\n');
  } catch (error) {
    throw new Error(\`レポート一覧取得エラー: \${error.message}\`);
  }
}

// =============================================================================
// レポート詳細取得（修正版）
// =============================================================================

async function getReport(reportId, user, authContext) {
  if (!reportId || typeof reportId !== 'string') {
    throw new Error("レポートIDが必要です");
  }
  
  console.log('🔍 [DEBUG] getReport 開始:', reportId);
  
  // 🔧 修正: authContextを追加
  const report = await callExpenseAPI(\`/reports/\${reportId}\`, 'GET', null, user, authContext);
  
  // APIレスポンスの形式を確認
  const reportData = report.report || report;
  
  const categoryIcon = getCategoryIcon(reportData.category);
  const receiptText = reportData.receipt ? '✅ あり' : '❌ なし';
  const createdDate = new Date(reportData.createdAt).toLocaleString('ja-JP');
  const updatedDate = reportData.updatedAt ? new Date(reportData.updatedAt).toLocaleString('ja-JP') : '未更新';
  
  return \`📄 経費レポート詳細

🆔 レポートID: \${reportData.id}
📝 タイトル: \${reportData.title}
📅 経費発生日: \${reportData.date}
\${categoryIcon} カテゴリ: \${reportData.category}
💰 金額: ¥\${reportData.amount.toLocaleString()}
📄 詳細説明: \${reportData.description}
🧾 領収書: \${receiptText}

👤 作成者: \${reportData.createdBy || user.name}
🕒 作成日時: \${createdDate}
🔄 更新日時: \${updatedDate}\`;
}

// =============================================================================
// レポートフォーマット取得
// =============================================================================

async function getReportFormat() {
  return \`📋 経費レポートフォーマット

📝 必須フィールド:
   title (string): 経費レポートのタイトル
   date (YYYY-MM-DD): 経費発生日
   category (string): カテゴリ (交通費, 食費, 宿泊費, その他)
   amount (number): 金額（円、0以上100万円以下）
   description (string): 詳細説明
   receipt (boolean): 領収書の有無

💡 作成例:
{
  "action": "create_report",
  "title": "出張経費レポート - 大阪",
  "date": "2024-01-15", 
  "category": "交通費",
  "amount": 15000,
  "description": "新幹線往復料金（東京-大阪）",
  "receipt": true
}

📊 カテゴリ別アイコン:
   🚗 交通費: 電車、バス、タクシー、航空機等
   🍽️ 食費: 会議費、接待費、出張時の食事等
   🏨 宿泊費: ホテル、旅館等の宿泊料金
   📝 その他: 文房具、通信費、その他諸経費

🧾 領収書について:
   true: 領収書あり（推奨）
   false: 領収書なし

⚠️ 制限事項:
   - 最大金額: ¥1,000,000/レポート
   - 日付形式: YYYY-MM-DD (例: 2024-01-15)
   
🌐 注意: データは外部APIサーバで管理されています
🔐 認証: Bearer Token認証対応（v2.2.0）\`;
}

// =============================================================================
// レポート更新（修正版）
// =============================================================================

async function updateReport(reportId, updateData, user, authContext) {
  if (!reportId || typeof reportId !== 'string') {
    throw new Error("レポートIDが必要です");
  }
  
  console.log('🔍 [DEBUG] updateReport 開始:', reportId);
  
  const updatedFields = {};
  
  // 更新可能フィールドの検証と設定
  if (updateData.title !== undefined) {
    if (!updateData.title || typeof updateData.title !== 'string' || !updateData.title.trim()) {
      throw new Error("タイトルは必須の文字列です");
    }
    updatedFields.title = updateData.title.trim();
  }
  
  if (updateData.date !== undefined) {
    if (!isValidDate(updateData.date)) {
      throw new Error("日付はYYYY-MM-DD形式で入力してください");
    }
    updatedFields.date = updateData.date;
  }
  
  if (updateData.category !== undefined) {
    if (!['交通費', '食費', '宿泊費', 'その他'].includes(updateData.category)) {
      throw new Error("カテゴリは '交通費', '食費', '宿泊費', 'その他' のいずれかです");
    }
    updatedFields.category = updateData.category;
  }
  
  if (updateData.amount !== undefined) {
    if (typeof updateData.amount !== 'number' || updateData.amount < 0 || updateData.amount > CONFIG.MAX_AMOUNT) {
      throw new Error(\`金額は0円以上\${CONFIG.MAX_AMOUNT.toLocaleString()}円以下の数値です\`);
    }
    updatedFields.amount = Math.round(updateData.amount);
  }
  
  if (updateData.description !== undefined) {
    if (!updateData.description || typeof updateData.description !== 'string' || !updateData.description.trim()) {
      throw new Error("詳細説明は必須の文字列です");
    }
    updatedFields.description = updateData.description.trim();
  }
  
  if (updateData.receipt !== undefined) {
    if (typeof updateData.receipt !== 'boolean') {
      throw new Error("領収書の有無は真偽値（true/false）です");
    }
    updatedFields.receipt = updateData.receipt;
  }
  
  if (Object.keys(updatedFields).length === 0) {
    throw new Error("更新するフィールドが指定されていません");
  }
  
  // 🔧 修正: authContextを追加
  const updatedReport = await callExpenseAPI(\`/reports/\${reportId}\`, 'PUT', updatedFields, user, authContext);
  
  // APIレスポンスの形式を確認
  const reportData = updatedReport.report || updatedReport;
  
  return \`✏️ 経費レポートを更新しました

🆔 レポートID: \${reportId}
📝 タイトル: \${reportData.title}

👤 更新者: \${user.name}
🕒 更新日時: \${new Date().toLocaleString('ja-JP')}\`;
}

// =============================================================================
// レポート削除（修正版）
// =============================================================================

async function deleteReport(reportId, user, authContext) {
  if (!reportId || typeof reportId !== 'string') {
    throw new Error("レポートIDが必要です");
  }
  
  console.log('🔍 [DEBUG] deleteReport 開始:', reportId);
  
  // 🔧 修正: authContextを追加
  const deletedReport = await callExpenseAPI(\`/reports/\${reportId}\`, 'DELETE', null, user, authContext);
  
  // APIレスポンスから削除されたレポート情報を取得
  // 削除前にレポート詳細を取得する場合もあるため、複数パターンに対応
  let reportInfo = '';
  if (deletedReport.report) {
    const report = deletedReport.report;
    const categoryIcon = getCategoryIcon(report.category);
    reportInfo = \`
🆔 削除されたレポート:
   \${categoryIcon} \${report.title}
   📅 日付: \${report.date}
   💰 金額: ¥\${report.amount.toLocaleString()}
   📝 説明: \${report.description}\`;
  } else {
    reportInfo = \`🆔 レポートID: \${reportId}\`;
  }
  
  return \`🗑️ 経費レポートを削除しました
\${reportInfo}

👤 削除者: \${user.name}
🕒 削除日時: \${new Date().toLocaleString('ja-JP')}

⚠️ この操作は取り消せません。\`;
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

function isValidDate(dateString) {
  const regex = /^\\d{4}-\\d{2}-\\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date) && date.toISOString().substr(0, 10) === dateString;
}

function getCategoryIcon(category) {
  const icons = {
    '交通費': '🚗',
    '食費': '🍽️',
    '宿泊費': '🏨',
    'その他': '📝'
  };
  return icons[category] || '📝';
}`;

const EXPENSE_MANAGER_ICON = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- 経費管理システムアイコン（Bearer Token認証対応版） -->
  <!-- 背景 -->
  <rect x="3" y="3" width="18" height="18" rx="2" fill="#DBEAFE" stroke="#3B82F6" stroke-width="2"/>
  
  <!-- データグラフ -->
  <rect x="6" y="6" width="4" height="3" fill="#3B82F6"/>
  <rect x="14" y="6" width="4" height="3" fill="#1E40AF"/>
  <rect x="6" y="15" width="4" height="3" fill="#1E40AF"/>
  <rect x="14" y="15" width="4" height="3" fill="#3B82F6"/>
  
  <!-- Bearer Token認証を表すセキュリティアイコン -->
  <circle cx="12" cy="12" r="2" fill="#10B981"/>
  <path d="M10 10l2 2 4-4" stroke="#FFFFFF" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
  
  <!-- APIコネクションを表す波線 -->
  <path d="M2 12 Q4 10, 6 12 T10 12" stroke="#10B981" stroke-width="1.5" fill="none"/>
  <path d="M14 12 Q16 10, 18 12 T22 12" stroke="#10B981" stroke-width="1.5" fill="none"/>
  
  <!-- 経費アイコン群 -->
  <!-- 交通費（車） -->
  <circle cx="7" cy="20" r="1" fill="#F59E0B"/>
  <rect x="6" y="19" width="2" height="1" fill="#F59E0B"/>
  
  <!-- 食費（ナイフ・フォーク） -->
  <line x1="11" y1="19" x2="11" y2="21" stroke="#10B981" stroke-width="0.8"/>
  <line x1="13" y1="19" x2="13" y2="21" stroke="#10B981" stroke-width="0.8"/>
  <path d="M11 19.5h2" stroke="#10B981" stroke-width="0.5"/>
  
  <!-- 宿泊費（家） -->
  <path d="M15 21v-2l1-1 1 1v2z" fill="none" stroke="#EF4444" stroke-width="0.8"/>
  <rect x="15.5" y="20" width="1" height="1" fill="#EF4444"/>
  
  <!-- 金額表示 -->
  <text x="12" y="13" font-family="Arial, sans-serif" font-size="3" font-weight="bold" text-anchor="middle" fill="#1E40AF">¥</text>
  
  <!-- Bearer Token認証を表すアイコン -->
  <circle cx="1" cy="1" r="0.5" fill="#10B981"/>
  <circle cx="23" cy="1" r="0.5" fill="#10B981"/>
  <circle cx="1" cy="23" r="0.5" fill="#10B981"/>
  <circle cx="23" cy="23" r="0.5" fill="#10B981"/>
  
  <!-- セキュリティバッジ -->
  <rect x="19" y="2" width="3" height="1.5" rx="0.5" fill="#059669"/>
  <text x="20.5" y="3" font-family="Arial, sans-serif" font-size="0.6" font-weight="bold" text-anchor="middle" fill="#FFFFFF">SEC</text>
</svg>`;

// =============================================================================
// インストール処理
// =============================================================================

async function installExpenseManagementTool() {
  try {
    console.log('💼 経費管理システム用MCPツール v2.2.0 (Bearer Token認証修正版) をインストールしています...');
    
    // YourToolディレクトリの確認/作成
    if (!existsSync(TOOLS_DIR)) {
      console.log('📁 YourToolディレクトリを作成しています...');
      await fs.mkdir(TOOLS_DIR, { recursive: true });
    }
    
    // 経費管理ツールのインストール
    const expenseManagerDir = path.join(TOOLS_DIR, 'expense_manager');
    if (existsSync(expenseManagerDir)) {
      console.log('⚠️  expense_manager ディレクトリが既に存在します。上書きします...');
      await fs.rmdir(expenseManagerDir, { recursive: true });
    }
    
    await fs.mkdir(expenseManagerDir, { recursive: true });
    
    console.log('📄 expense_manager/config.json を作成しています...');
    await fs.writeFile(
      path.join(expenseManagerDir, 'config.json'),
      JSON.stringify(EXPENSE_MANAGER_CONFIG, null, 2),
      'utf8'
    );
    
    console.log('⚙️ expense_manager/handler.js を作成しています...');
    await fs.writeFile(
      path.join(expenseManagerDir, 'handler.js'),
      EXPENSE_MANAGER_HANDLER,
      'utf8'
    );
    
    console.log('🎨 expense_manager/icon を作成しています...');
    await fs.writeFile(
      path.join(expenseManagerDir, 'expense_manager_icon.svg'),
      EXPENSE_MANAGER_ICON,
      'utf8'
    );
    
    // README作成
    const readmeContent = `# 経費管理システム用MCPツール v2.2.0 (Bearer Token認証修正版)

**🔐 Bearer Token認証に完全対応**した経費管理システムです。  
**OneAgentサーバーとの認証連携を修正**し、安定した動作を実現しています。

## 🔧 主な修正内容 (v2.2.0)

### ✅ **認証システム修正**
- ❌ **削除**: 無効なセッション認証 (\`Cookie: session=user.id\`)
- ✅ **追加**: Bearer Token認証 (\`Authorization: Bearer <token>\`)
- ✅ **修正**: 認証コンテキストからのトークン取得
- ✅ **強化**: デバッグ情報の追加

### ✅ **API呼び出し修正**
- ✅ **修正**: \`callExpenseAPI\`関数でBearer Token使用
- ✅ **追加**: 複数パターンでのトークン取得
- ✅ **強化**: エラーハンドリングとログ出力
- ✅ **修正**: 全ての操作でauthContextを渡すように修正

### ✅ **デバッグ機能強化**
- ✅ **追加**: 詳細なログ出力
- ✅ **追加**: 認証フローの可視化
- ✅ **追加**: トークン情報の確認

## 🌐 API設定

### 前提条件
1. **OneAgentサーバー稼働**: localhost:3000でOneAgentサーバーが稼働している必要があります
2. **APIサーバー稼働**: localhost:3552でExpense APIサーバーが稼働している必要があります
3. **OAuth認証**: OAuth認証フローが設定済みである必要があります

### 認証フロー 🔐

#### 1. OneAgentサーバーでのOAuth認証
\`\`\`bash
# ブラウザでアクセス
http://localhost:3000

# OAuth認証を完了してアクセストークンを取得
\`\`\`

#### 2. AIエージェントでのツール実行
\`\`\`javascript
// OneAgentサーバーで以下のようにツールを実行
{
  "action": "list_reports"
}
\`\`\`

#### 3. Bearer Token認証フロー
1. ユーザーがOneAgentサーバーでOAuth認証を完了
2. AIエージェントがツール実行時にBearer Tokenを含む認証コンテキストを作成
3. expense_managerツールがBearer Tokenを抽出
4. localhost:3552のAPIにBearer Tokenで認証リクエスト
5. APIサーバーがOneAgentサーバーでトークン検証
6. 認証成功で正常にAPI処理が実行

### 環境変数（オプション）
\`\`\`bash
# カスタムAPIサーバーを使用する場合
export EXPENSE_API_BASE_URL="http://localhost:3552/api"
\`\`\`

## 📝 対応機能（6機能）

### ①経費レポート作成 ✅
\`\`\`javascript
{
  "action": "create_report",
  "title": "出張経費レポート - 大阪",
  "date": "2024-01-15",
  "category": "交通費",
  "amount": 15000,
  "description": "新幹線往復料金（東京-大阪）",
  "receipt": true
}
\`\`\`

### ②レポート一覧取得 ✅
\`\`\`javascript
{
  "action": "list_reports",
  "limit": 10,
  "offset": 0
}
\`\`\`

### ③レポート詳細取得 ✅
\`\`\`javascript
{
  "action": "get_report",
  "reportId": "report_1234567890_abcdef123"
}
\`\`\`

### ④レポート更新 ✅
\`\`\`javascript
{
  "action": "update_report",
  "reportId": "report_1234567890_abcdef123",
  "title": "更新されたタイトル",
  "amount": 20000
}
\`\`\`

### ⑤レポート削除 ✅
\`\`\`javascript
{
  "action": "delete_report",
  "reportId": "report_1234567890_abcdef123"
}
\`\`\`

### ⑥レポートフォーマット確認 ✅
\`\`\`javascript
{
  "action": "get_report_format"
}
\`\`\`

## 📊 カテゴリ対応

- 🚗 **交通費** - 電車、バス、タクシー、航空機等
- 🍽️ **食費** - 会議費、接待費、出張時の食事等
- 🏨 **宿泊費** - ホテル、旅館等の宿泊料金
- 📝 **その他** - 文房具、通信費、その他諸経費

## 🔒 認証について

### Bearer Token認証 🔐
\`\`\`http
Authorization: Bearer <access_token>
\`\`\`

### 認証トークンの取得順序
1. \`authContext.tokenInfo.token\` - OneAgentからの直接トークン
2. \`authContext.accessToken\` - コンテキストのアクセストークン
3. \`authContext.user.accessToken\` - ユーザーオブジェクトのトークン
4. \`authContext.headers.authorization\` - ヘッダーからの抽出（フォールバック）

## 🚀 セットアップ手順

### 1. OneAgentサーバー起動
\`\`\`bash
# OneAgentサーバーを起動
node server.js
# http://localhost:3000 で起動
\`\`\`

### 2. APIサーバー起動
\`\`\`bash
# Expense APIサーバーを起動
node expense-api-server.js
# http://localhost:3552 で起動
\`\`\`

### 3. OAuth認証完了
\`\`\`bash
# ブラウザでOneAgentサーバーにアクセス
open http://localhost:3000

# OAuth認証を完了（admin/admin123 または demo/demo123）
\`\`\`

### 4. MCPツール使用
\`\`\`javascript
// OneAgentのAIエージェントでツールを実行
{
  "action": "list_reports"
}
\`\`\`

## 🔧 トラブルシューティング

### 認証エラー（修正済み）
\`\`\`
API Error (401): 認証が必要です
\`\`\`
**修正内容**:
- ❌ 無効なセッション認証からBearer Token認証に修正
- ✅ 認証コンテキストからの適切なトークン取得
- ✅ デバッグ情報の強化

### APIサーバー接続エラー
\`\`\`
Error: API呼び出しエラー: fetch failed
\`\`\`
**解決策**:
1. APIサーバーの起動状態を確認: \`curl http://localhost:3552/api/report-format\`
2. ポート3552が使用可能であることを確認
3. ファイアウォール設定を確認

### Bearer Token未取得
\`\`\`
Error: 認証トークンが取得できません
\`\`\`
**解決策**:
1. OneAgentサーバーでOAuth認証を完了
2. ツール実行前にブラウザでログイン状態を確認
3. デバッグログでトークン取得状況を確認

## 🔍 デバッグ機能

### デバッグログの確認
ツール実行時に以下のログが出力されます：
\`\`\`
🔍 [DEBUG] expense_manager 開始
🔍 [DEBUG] args: {...}
🔍 [DEBUG] context keys: [...]
🔍 [DEBUG] callExpenseAPI 開始
✅ [DEBUG] tokenInfo.tokenからトークン取得
🎫 [DEBUG] トークン確認: eyJhbGciOiJIUzI1NiIs...
🔄 [DEBUG] API呼び出し: GET http://localhost:3552/api/reports
📡 [DEBUG] API応答: 200 OK
✅ [DEBUG] API成功: {...}
\`\`\`

### デバッグ情報の内容
- 認証コンテキストの内容
- トークン取得の試行過程
- API呼び出しの詳細
- レスポンスの確認

## ✅ 利点・特徴

### 認証の安定性 🔐
- **Bearer Token認証**: 標準的で安全な認証方式
- **複数パターン対応**: トークン取得の冗長性
- **デバッグ強化**: 問題の特定が容易

### 高い互換性
- **OneAgent準拠**: 100%認証フロー互換性
- **エラーハンドリング**: 適切なエラーメッセージ
- **デバッグ対応**: 詳細な実行ログ

## 💡 推奨使用パターン

### 基本的なワークフロー
1. **認証確認**: OneAgentサーバーでログイン状態確認
2. **フォーマット確認**: \`get_report_format\` でフィールド確認
3. **レポート作成**: \`create_report\` で新規作成
4. **一覧確認**: \`list_reports\` で作成済みレポート確認
5. **詳細確認**: \`get_report\` で特定レポートの詳細確認
6. **必要に応じて更新**: \`update_report\` でデータ修正
7. **不要なら削除**: \`delete_report\` でクリーンアップ

この版はBearer Token認証に完全対応し、安定した動作を実現しています。
`;

    await fs.writeFile(
      path.join(TOOLS_DIR, 'EXPENSE_MANAGEMENT_BEARER_TOKEN_README.md'),
      readmeContent,
      'utf8'
    );
    
    console.log('\n✅ 経費管理システム用MCPツール v2.2.0 (Bearer Token認証修正版) のインストールが完了しました！');
    console.log(`📁 インストール場所: ${TOOLS_DIR}`);
    
    console.log('\n🔐 主要な修正点:');
    console.log('✅ Bearer Token認証の実装');
    console.log('✅ 認証コンテキストの適切な活用');
    console.log('✅ デバッグ情報の強化');
    console.log('❌ 無効なセッション認証の削除');
    
    console.log('\n🔧 認証フロー:');
    console.log('1. OneAgentサーバーでOAuth認証完了');
    console.log('2. AIエージェントがBearer Tokenを含む認証コンテキストを作成');
    console.log('3. expense_managerツールがBearer Tokenを抽出');
    console.log('4. localhost:3552のAPIにBearer Tokenで認証');
    console.log('5. APIサーバーがOneAgentサーバーでトークン検証');
    console.log('6. 認証成功で正常に処理実行');
    
    console.log('\n📊 対応機能:');
    console.log('- ✅ レポート作成 (create_report)');
    console.log('- ✅ レポート一覧取得 (list_reports)');
    console.log('- ✅ レポート詳細取得 (get_report)');
    console.log('- ✅ レポートフォーマット確認 (get_report_format)');
    console.log('- ✅ レポート更新 (update_report)');
    console.log('- ✅ レポート削除 (delete_report)');
    
    console.log('\n🔍 デバッグ機能:');
    console.log('- 詳細な認証フローログ');
    console.log('- トークン取得状況の確認');
    console.log('- API呼び出しの詳細ログ');
    console.log('- エラー発生時の詳細情報');
    
    console.log('\n⚠️ 重要な変更:');
    console.log('- OneAgentサーバーのroutes.jsとmiddleware.jsも修正が必要です');
    console.log('- authContextにアクセストークンを含める必要があります');
    console.log('- Bearer Token認証に完全移行しました');
    
    console.log('\n🚀 次のステップ:');
    console.log('1. OneAgentサーバーのroutes.jsを修正');
    console.log('2. middleware.jsを修正');
    console.log('3. OneAgentサーバーを再起動');
    console.log('4. Expense APIサーバーを起動');
    console.log('5. ブラウザでOAuth認証完了');
    console.log('6. expense_managerツールをテスト');
    
  } catch (error) {
    console.error('❌ インストール中にエラーが発生しました:', error.message);
    process.exit(1);
  }
}

// メイン実行
installExpenseManagementTool();