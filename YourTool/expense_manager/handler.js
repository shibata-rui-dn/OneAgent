// 設定
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
        throw new Error(`未対応のアクション: ${action}`);
    }
    
    return {
      content: [
        {
          type: "text",
          text: `✅ ${action} 操作完了 (ユーザー: ${user.name})\n\n${result}`
        }
      ]
    };
    
  } catch (error) {
    console.error('❌ [DEBUG] expense_manager エラー:', error);
    throw new Error(`経費管理エラー: ${error.message}`);
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
    throw new Error(`必要な権限がありません。必要なスコープ: ${requiredScopes.join(', ')}`);
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
  
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;
  
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
  
  console.log(`🎫 [DEBUG] トークン確認: ${authToken.substring(0, 20)}...`);
  
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      // 🔧 修正: Bearer Token認証を使用
      'Authorization': `Bearer ${authToken}`,
      'User-Agent': 'ExpenseManager-MCP/2.2.0-debug'
    },
    timeout: CONFIG.API_TIMEOUT
  };
  
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }
  
  console.log(`🔄 [DEBUG] API呼び出し: ${method} ${url}`);
  console.log(`📋 [DEBUG] リクエストヘッダー:`, options.headers);
  
  try {
    const response = await fetch(url, options);
    
    console.log(`📡 [DEBUG] API応答: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.text();
        console.error(`❌ [DEBUG] APIエラー詳細:`, errorData);
      } catch (e) {
        errorData = `HTTP ${response.status} ${response.statusText}`;
      }
      throw new Error(`API Error (${response.status}): ${errorData}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const result = await response.json();
      console.log(`✅ [DEBUG] API成功:`, result);
      return result;
    } else {
      const result = await response.text();
      console.log(`✅ [DEBUG] API成功 (text):`, result);
      return result;
    }
  } catch (error) {
    console.error(`❌ [DEBUG] API呼び出し失敗:`, error);
    if (error.name === 'AbortError') {
      throw new Error('API呼び出しがタイムアウトしました');
    }
    throw new Error(`API呼び出しエラー: ${error.message}`);
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
    throw new Error(`金額は0円以上${CONFIG.MAX_AMOUNT.toLocaleString()}円以下の数値です`);
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
  
  return `💼 経費レポートを作成しました

📋 レポート詳細:
   🆔 ID: ${report.id || report.reportId || 'N/A'}
   📝 タイトル: ${title}
   📅 日付: ${date}
   ${categoryIcon} カテゴリ: ${category}
   💰 金額: ¥${amount.toLocaleString()}
   📄 説明: ${description}
   🧾 領収書: ${receiptText}
   
👤 作成者: ${user.name}
🕒 作成日時: ${new Date().toLocaleString('ja-JP')}`;
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
      return `📊 経費レポート一覧 (ユーザー: ${user.name})

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
}`;
    }
    
    // 新しい順にソート
    reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // クライアント側でページネーション
    const paginatedReports = reports.slice(offset, offset + limit);
    const totalReports = reports.length;
    const hasMore = offset + limit < totalReports;
    
    const result = [];
    result.push(`📊 経費レポート一覧 (ユーザー: ${user.name})`);
    result.push(`📈 表示: ${offset + 1}-${offset + paginatedReports.length}件 / 全${totalReports}件`);
    result.push('');
    
    for (const report of paginatedReports) {
      const categoryIcon = getCategoryIcon(report.category);
      const receiptIcon = report.receipt ? '🧾' : '❌';
      const createdDate = new Date(report.createdAt).toLocaleDateString('ja-JP');
      
      result.push(`${categoryIcon} ${report.title}`);
      result.push(`   🆔 ID: ${report.id}`);
      result.push(`   📅 日付: ${report.date} | 💰 金額: ¥${report.amount.toLocaleString()}`);
      result.push(`   📝 ${report.description}`);
      result.push(`   ${receiptIcon} 領収書 | 🕒 作成: ${createdDate}`);
      result.push('');
    }
    
    if (hasMore) {
      result.push(`📄 次のページを表示するには offset を ${offset + limit} に設定してください`);
    }
    
    return result.join('\n');
  } catch (error) {
    throw new Error(`レポート一覧取得エラー: ${error.message}`);
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
  const report = await callExpenseAPI(`/reports/${reportId}`, 'GET', null, user, authContext);
  
  // APIレスポンスの形式を確認
  const reportData = report.report || report;
  
  const categoryIcon = getCategoryIcon(reportData.category);
  const receiptText = reportData.receipt ? '✅ あり' : '❌ なし';
  const createdDate = new Date(reportData.createdAt).toLocaleString('ja-JP');
  const updatedDate = reportData.updatedAt ? new Date(reportData.updatedAt).toLocaleString('ja-JP') : '未更新';
  
  return `📄 経費レポート詳細

🆔 レポートID: ${reportData.id}
📝 タイトル: ${reportData.title}
📅 経費発生日: ${reportData.date}
${categoryIcon} カテゴリ: ${reportData.category}
💰 金額: ¥${reportData.amount.toLocaleString()}
📄 詳細説明: ${reportData.description}
🧾 領収書: ${receiptText}

👤 作成者: ${reportData.createdBy || user.name}
🕒 作成日時: ${createdDate}
🔄 更新日時: ${updatedDate}`;
}

// =============================================================================
// レポートフォーマット取得
// =============================================================================

async function getReportFormat() {
  return `📋 経費レポートフォーマット

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
🔐 認証: Bearer Token認証対応（v2.2.0）`;
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
      throw new Error(`金額は0円以上${CONFIG.MAX_AMOUNT.toLocaleString()}円以下の数値です`);
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
  const updatedReport = await callExpenseAPI(`/reports/${reportId}`, 'PUT', updatedFields, user, authContext);
  
  // APIレスポンスの形式を確認
  const reportData = updatedReport.report || updatedReport;
  
  return `✏️ 経費レポートを更新しました

🆔 レポートID: ${reportId}
📝 タイトル: ${reportData.title}

👤 更新者: ${user.name}
🕒 更新日時: ${new Date().toLocaleString('ja-JP')}`;
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
  const deletedReport = await callExpenseAPI(`/reports/${reportId}`, 'DELETE', null, user, authContext);
  
  // APIレスポンスから削除されたレポート情報を取得
  // 削除前にレポート詳細を取得する場合もあるため、複数パターンに対応
  let reportInfo = '';
  if (deletedReport.report) {
    const report = deletedReport.report;
    const categoryIcon = getCategoryIcon(report.category);
    reportInfo = `
🆔 削除されたレポート:
   ${categoryIcon} ${report.title}
   📅 日付: ${report.date}
   💰 金額: ¥${report.amount.toLocaleString()}
   📝 説明: ${report.description}`;
  } else {
    reportInfo = `🆔 レポートID: ${reportId}`;
  }
  
  return `🗑️ 経費レポートを削除しました
${reportInfo}

👤 削除者: ${user.name}
🕒 削除日時: ${new Date().toLocaleString('ja-JP')}

⚠️ この操作は取り消せません。`;
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
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
}