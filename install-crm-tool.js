#!/usr/bin/env node

/**
 * CRM（顧客関係管理）システム用MCPツールのインストールスクリプト（Bearer Token認証対応版）
 * 
 * 機能:
 * ①顧客情報作成
 * ②顧客一覧取得
 * ③顧客詳細取得
 * ④顧客フォーマット確認
 * ⑤顧客情報更新
 * ⑥顧客削除
 * 
 * 特徴:
 * - Bearer Token認証の実装
 * - 認証コンテキストの適切な活用
 * - デバッグ情報の強化
 * - 顧客ステータス管理
 * - 商談履歴の追跡
 * 
 * 使用方法:
 * node install-crm-tool.js
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
// CRMツール (customer_manager) - Bearer Token認証対応版
// =============================================================================

const CRM_CONFIG = {
  "name": "customer_manager",
  "description": "OAuth認証を使用したCRM（顧客関係管理）システム。localhost:3553のAPIサーバーと連携して顧客情報の作成、一覧表示、詳細確認、更新、削除機能を提供。Bearer Token認証対応版。",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": [
          "create_customer", "list_customers", "get_customer", "get_customer_format", 
          "update_customer", "delete_customer"
        ],
        "description": "実行するアクション"
      },
      "name": {
        "type": "string",
        "description": "顧客名（create_customer、update_customerで使用）"
      },
      "company": {
        "type": "string",
        "description": "会社名（create_customer、update_customerで使用）"
      },
      "email": {
        "type": "string",
        "description": "メールアドレス（create_customer、update_customerで使用）"
      },
      "phone": {
        "type": "string",
        "description": "電話番号（create_customer、update_customerで使用）"
      },
      "category": {
        "type": "string",
        "enum": ["見込み客", "既存顧客", "VIP顧客", "休眠顧客"],
        "description": "顧客カテゴリ（create_customer、update_customerで使用）"
      },
      "status": {
        "type": "string",
        "enum": ["アクティブ", "非アクティブ", "要フォロー", "契約済み"],
        "description": "顧客ステータス（create_customer、update_customerで使用）"
      },
      "notes": {
        "type": "string",
        "description": "備考・メモ（create_customer、update_customerで使用）"
      },
      "lastContact": {
        "type": "string",
        "description": "最終連絡日（YYYY-MM-DD形式、create_customer、update_customerで使用）"
      },
      "nextAction": {
        "type": "string",
        "description": "次回アクション予定（create_customer、update_customerで使用）"
      },
      "customerId": {
        "type": "string",
        "description": "顧客ID（get_customer、update_customer、delete_customerで使用）"
      },
      "limit": {
        "type": "number",
        "description": "取得件数制限（list_customersで使用、デフォルト: 20）"
      },
      "offset": {
        "type": "number",
        "description": "取得開始位置（list_customersで使用、デフォルト: 0）"
      },
      "filterCategory": {
        "type": "string",
        "description": "カテゴリフィルター（list_customersで使用）"
      },
      "filterStatus": {
        "type": "string",
        "description": "ステータスフィルター（list_customersで使用）"
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
    "filename": "customer_manager_icon.svg",
    "description": "CRMシステムアイコン（Bearer Token対応）",
    "type": "2",
    "colorScheme": "green"
  }
};

const CRM_HANDLER = `// 設定
const CONFIG = {
  // 外部APIサーバの設定（localhost:3553のサーバーに対応）
  API_BASE_URL: process.env.CRM_API_BASE_URL || 'http://localhost:3553/api',
  API_TIMEOUT: 30000, // 30秒
  CUSTOMER_FORMAT: {
    name: 'string',
    company: 'string',
    email: 'string',
    phone: 'string',
    category: 'string',
    status: 'string',
    notes: 'string',
    lastContact: 'YYYY-MM-DD',
    nextAction: 'string'
  }
};

export default async function customerManager(args, context) {
  const { 
    action, name, company, email, phone, category, status, notes, lastContact, nextAction,
    customerId, limit = 20, offset = 0, filterCategory, filterStatus
  } = args;
  
  if (!action || typeof action !== 'string') {
    throw new Error("actionは必須の文字列です");
  }

  try {
    console.log('🔍 [DEBUG] customer_manager 開始');
    console.log('🔍 [DEBUG] args:', JSON.stringify(args, null, 2));
    console.log('🔍 [DEBUG] context keys:', Object.keys(context || {}));
    
    const user = await authenticateUser(context);
    console.log('🔍 [DEBUG] user:', JSON.stringify(user, null, 2));
    
    let result;
    switch (action) {
      case 'create_customer':
        result = await createCustomer({
          name, company, email, phone, category, status, notes, lastContact, nextAction
        }, user, context);
        break;
      case 'list_customers':
        result = await listCustomers(user, limit, offset, { filterCategory, filterStatus }, context);
        break;
      case 'get_customer':
        result = await getCustomer(customerId, user, context);
        break;
      case 'get_customer_format':
        result = await getCustomerFormat();
        break;
      case 'update_customer':
        result = await updateCustomer(customerId, {
          name, company, email, phone, category, status, notes, lastContact, nextAction
        }, user, context);
        break;
      case 'delete_customer':
        result = await deleteCustomer(customerId, user, context);
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
    console.error('❌ [DEBUG] customer_manager エラー:', error);
    throw new Error(\`CRMエラー: \${error.message}\`);
  }
}

// 🔧 認証コンテキストのデバッグ付き検証
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

async function callCrmAPI(endpoint, method = 'GET', data = null, user, authContext) {
  console.log('🔍 [DEBUG] callCrmAPI 開始');
  console.log('🔍 [DEBUG] endpoint:', endpoint);
  console.log('🔍 [DEBUG] method:', method);
  console.log('🔍 [DEBUG] authContext keys:', Object.keys(authContext || {}));
  
  const url = \`\${CONFIG.API_BASE_URL}\${endpoint}\`;
  
  // 🔧 認証トークンの取得（複数パターンを試行）
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
      // 🔧 Bearer Token認証を使用
      'Authorization': \`Bearer \${authToken}\`,
      'User-Agent': 'CRM-MCP/1.0.0-debug'
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
// 顧客作成
// =============================================================================

async function createCustomer(customerData, user, authContext) {
  const { name, company, email, phone, category, status, notes, lastContact, nextAction } = customerData;
  
  console.log('🔍 [DEBUG] createCustomer 開始');
  
  // バリデーション
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error("顧客名は必須の文字列です");
  }
  if (!company || typeof company !== 'string' || !company.trim()) {
    throw new Error("会社名は必須の文字列です");
  }
  if (!email || !isValidEmail(email)) {
    throw new Error("有効なメールアドレスが必要です");
  }
  if (!category || !['見込み客', '既存顧客', 'VIP顧客', '休眠顧客'].includes(category)) {
    throw new Error("カテゴリは '見込み客', '既存顧客', 'VIP顧客', '休眠顧客' のいずれかです");
  }
  if (!status || !['アクティブ', '非アクティブ', '要フォロー', '契約済み'].includes(status)) {
    throw new Error("ステータスは 'アクティブ', '非アクティブ', '要フォロー', '契約済み' のいずれかです");
  }
  if (lastContact && !isValidDate(lastContact)) {
    throw new Error("最終連絡日はYYYY-MM-DD形式で入力してください");
  }
  
  // APIに送信するデータ
  const apiData = {
    name: name.trim(),
    company: company.trim(),
    email: email.trim().toLowerCase(),
    phone: phone?.trim() || '',
    category: category,
    status: status,
    notes: notes?.trim() || '',
    lastContact: lastContact || new Date().toISOString().split('T')[0],
    nextAction: nextAction?.trim() || ''
  };
  
  const customer = await callCrmAPI('/customers', 'POST', apiData, user, authContext);
  
  const statusIcon = getStatusIcon(status);
  const categoryIcon = getCategoryIcon(category);
  
  return \`👤 顧客情報を作成しました

📋 顧客詳細:
   🆔 ID: \${customer.id || customer.customerId || 'N/A'}
   👤 名前: \${name}
   🏢 会社: \${company}
   📧 メール: \${email}
   📞 電話: \${phone || '未設定'}
   \${categoryIcon} カテゴリ: \${category}
   \${statusIcon} ステータス: \${status}
   📅 最終連絡: \${lastContact || '今日'}
   📝 備考: \${notes || '未設定'}
   ⏰ 次回アクション: \${nextAction || '未設定'}
   
👤 作成者: \${user.name}
🕒 作成日時: \${new Date().toLocaleString('ja-JP')}\`;
}

// =============================================================================
// 顧客一覧取得
// =============================================================================

async function listCustomers(user, limit, offset, filters, authContext) {
  try {
    console.log('🔍 [DEBUG] listCustomers 開始');
    
    // フィルター付きクエリパラメータを構築
    const queryParams = new URLSearchParams();
    if (filters.filterCategory) queryParams.append('category', filters.filterCategory);
    if (filters.filterStatus) queryParams.append('status', filters.filterStatus);
    if (limit) queryParams.append('limit', limit.toString());
    if (offset) queryParams.append('offset', offset.toString());
    
    const endpoint = '/customers' + (queryParams.toString() ? '?' + queryParams.toString() : '');
    const response = await callCrmAPI(endpoint, 'GET', null, user, authContext);
    
    // APIレスポンスの形式を確認して適切に処理
    let customers = [];
    if (response && response.success && response.customers) {
      customers = response.customers;
    } else if (Array.isArray(response)) {
      customers = response;
    } else {
      customers = [];
    }
    
    if (customers.length === 0) {
      return \`👥 顧客一覧 (ユーザー: \${user.name})

まだ顧客情報がありません。新しい顧客を登録してください。

💡 顧客作成例:
{
  "action": "create_customer",
  "name": "山田太郎",
  "company": "株式会社サンプル",
  "email": "yamada@sample.com",
  "phone": "03-1234-5678",
  "category": "見込み客",
  "status": "アクティブ",
  "notes": "展示会で名刺交換",
  "lastContact": "2024-01-15",
  "nextAction": "製品デモの提案"
}\`;
    }
    
    // 新しい順にソート
    customers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // クライアント側でページネーション
    const paginatedCustomers = customers.slice(offset, offset + limit);
    const totalCustomers = customers.length;
    const hasMore = offset + limit < totalCustomers;
    
    const result = [];
    result.push(\`👥 顧客一覧 (ユーザー: \${user.name})\`);
    result.push(\`📈 表示: \${offset + 1}-\${offset + paginatedCustomers.length}件 / 全\${totalCustomers}件\`);
    
    if (filters.filterCategory || filters.filterStatus) {
      result.push(\`🔍 フィルター: \${filters.filterCategory || 'すべて'} | \${filters.filterStatus || 'すべて'}\`);
    }
    result.push('');
    
    for (const customer of paginatedCustomers) {
      const categoryIcon = getCategoryIcon(customer.category);
      const statusIcon = getStatusIcon(customer.status);
      const createdDate = new Date(customer.createdAt).toLocaleDateString('ja-JP');
      const lastContactDate = customer.lastContact ? new Date(customer.lastContact).toLocaleDateString('ja-JP') : '未記録';
      
      result.push(\`\${categoryIcon} \${customer.name} (\${customer.company})\`);
      result.push(\`   🆔 ID: \${customer.id}\`);
      result.push(\`   📧 \${customer.email} | 📞 \${customer.phone || '未設定'}\`);
      result.push(\`   \${statusIcon} \${customer.status} | 📅 最終連絡: \${lastContactDate}\`);
      if (customer.nextAction) {
        result.push(\`   ⏰ 次回: \${customer.nextAction}\`);
      }
      result.push(\`   🕒 登録: \${createdDate}\`);
      result.push('');
    }
    
    if (hasMore) {
      result.push(\`📄 次のページを表示するには offset を \${offset + limit} に設定してください\`);
    }
    
    return result.join('\\n');
  } catch (error) {
    throw new Error(\`顧客一覧取得エラー: \${error.message}\`);
  }
}

// =============================================================================
// 顧客詳細取得
// =============================================================================

async function getCustomer(customerId, user, authContext) {
  if (!customerId || typeof customerId !== 'string') {
    throw new Error("顧客IDが必要です");
  }
  
  console.log('🔍 [DEBUG] getCustomer 開始:', customerId);
  
  const customer = await callCrmAPI(\`/customers/\${customerId}\`, 'GET', null, user, authContext);
  
  // APIレスポンスの形式を確認
  const customerData = customer.customer || customer;
  
  const categoryIcon = getCategoryIcon(customerData.category);
  const statusIcon = getStatusIcon(customerData.status);
  const createdDate = new Date(customerData.createdAt).toLocaleString('ja-JP');
  const updatedDate = customerData.updatedAt ? new Date(customerData.updatedAt).toLocaleString('ja-JP') : '未更新';
  const lastContactDate = customerData.lastContact ? new Date(customerData.lastContact).toLocaleDateString('ja-JP') : '未記録';
  
  return \`👤 顧客詳細情報

🆔 顧客ID: \${customerData.id}
👤 顧客名: \${customerData.name}
🏢 会社名: \${customerData.company}
📧 メールアドレス: \${customerData.email}
📞 電話番号: \${customerData.phone || '未設定'}
\${categoryIcon} カテゴリ: \${customerData.category}
\${statusIcon} ステータス: \${customerData.status}
📅 最終連絡日: \${lastContactDate}
⏰ 次回アクション: \${customerData.nextAction || '未設定'}
📝 備考: \${customerData.notes || '未設定'}

👤 登録者: \${customerData.createdBy || user.name}
🕒 登録日時: \${createdDate}
🔄 更新日時: \${updatedDate}\`;
}

// =============================================================================
// 顧客フォーマット取得
// =============================================================================

async function getCustomerFormat() {
  return \`📋 顧客情報フォーマット

📝 必須フィールド:
   name (string): 顧客名
   company (string): 会社名
   email (string): メールアドレス
   category (string): カテゴリ (見込み客, 既存顧客, VIP顧客, 休眠顧客)
   status (string): ステータス (アクティブ, 非アクティブ, 要フォロー, 契約済み)

📝 オプションフィールド:
   phone (string): 電話番号
   notes (string): 備考・メモ
   lastContact (YYYY-MM-DD): 最終連絡日
   nextAction (string): 次回アクション予定

💡 作成例:
{
  "action": "create_customer",
  "name": "山田太郎",
  "company": "株式会社サンプル",
  "email": "yamada@sample.com",
  "phone": "03-1234-5678",
  "category": "見込み客",
  "status": "アクティブ",
  "notes": "展示会で名刺交換。製品に興味を示している",
  "lastContact": "2024-01-15",
  "nextAction": "製品デモの提案を次週に実施"
}

📊 カテゴリ別アイコン:
   🎯 見込み客: 新規リード、商談検討中
   🤝 既存顧客: 取引実績あり、継続中
   ⭐ VIP顧客: 重要顧客、優先対応
   😴 休眠顧客: 長期間連絡なし、再活性化が必要

📈 ステータス別アイコン:
   ✅ アクティブ: 積極的に営業活動中
   ⏸️ 非アクティブ: 一時的に活動停止
   📞 要フォロー: フォローアップが必要
   ✍️ 契約済み: 契約締結完了

⚠️ 制限事項:
   - メールアドレスは有効な形式である必要があります
   - 日付形式: YYYY-MM-DD (例: 2024-01-15)
   
🌐 注意: データは外部APIサーバで管理されています
🔐 認証: Bearer Token認証対応（v1.0.0）\`;
}

// =============================================================================
// 顧客更新
// =============================================================================

async function updateCustomer(customerId, updateData, user, authContext) {
  if (!customerId || typeof customerId !== 'string') {
    throw new Error("顧客IDが必要です");
  }
  
  console.log('🔍 [DEBUG] updateCustomer 開始:', customerId);
  
  const updatedFields = {};
  
  // 更新可能フィールドの検証と設定
  if (updateData.name !== undefined) {
    if (!updateData.name || typeof updateData.name !== 'string' || !updateData.name.trim()) {
      throw new Error("顧客名は必須の文字列です");
    }
    updatedFields.name = updateData.name.trim();
  }
  
  if (updateData.company !== undefined) {
    if (!updateData.company || typeof updateData.company !== 'string' || !updateData.company.trim()) {
      throw new Error("会社名は必須の文字列です");
    }
    updatedFields.company = updateData.company.trim();
  }
  
  if (updateData.email !== undefined) {
    if (!isValidEmail(updateData.email)) {
      throw new Error("有効なメールアドレスが必要です");
    }
    updatedFields.email = updateData.email.trim().toLowerCase();
  }
  
  if (updateData.phone !== undefined) {
    updatedFields.phone = updateData.phone?.trim() || '';
  }
  
  if (updateData.category !== undefined) {
    if (!['見込み客', '既存顧客', 'VIP顧客', '休眠顧客'].includes(updateData.category)) {
      throw new Error("カテゴリは '見込み客', '既存顧客', 'VIP顧客', '休眠顧客' のいずれかです");
    }
    updatedFields.category = updateData.category;
  }
  
  if (updateData.status !== undefined) {
    if (!['アクティブ', '非アクティブ', '要フォロー', '契約済み'].includes(updateData.status)) {
      throw new Error("ステータスは 'アクティブ', '非アクティブ', '要フォロー', '契約済み' のいずれかです");
    }
    updatedFields.status = updateData.status;
  }
  
  if (updateData.notes !== undefined) {
    updatedFields.notes = updateData.notes?.trim() || '';
  }
  
  if (updateData.lastContact !== undefined) {
    if (updateData.lastContact && !isValidDate(updateData.lastContact)) {
      throw new Error("最終連絡日はYYYY-MM-DD形式で入力してください");
    }
    updatedFields.lastContact = updateData.lastContact;
  }
  
  if (updateData.nextAction !== undefined) {
    updatedFields.nextAction = updateData.nextAction?.trim() || '';
  }
  
  if (Object.keys(updatedFields).length === 0) {
    throw new Error("更新するフィールドが指定されていません");
  }
  
  const updatedCustomer = await callCrmAPI(\`/customers/\${customerId}\`, 'PUT', updatedFields, user, authContext);
  
  // APIレスポンスの形式を確認
  const customerData = updatedCustomer.customer || updatedCustomer;
  
  return \`✏️ 顧客情報を更新しました

🆔 顧客ID: \${customerId}
👤 顧客名: \${customerData.name}
🏢 会社名: \${customerData.company}

👤 更新者: \${user.name}
🕒 更新日時: \${new Date().toLocaleString('ja-JP')}\`;
}

// =============================================================================
// 顧客削除
// =============================================================================

async function deleteCustomer(customerId, user, authContext) {
  if (!customerId || typeof customerId !== 'string') {
    throw new Error("顧客IDが必要です");
  }
  
  console.log('🔍 [DEBUG] deleteCustomer 開始:', customerId);
  
  const deletedCustomer = await callCrmAPI(\`/customers/\${customerId}\`, 'DELETE', null, user, authContext);
  
  // APIレスポンスから削除された顧客情報を取得
  let customerInfo = '';
  if (deletedCustomer.customer) {
    const customer = deletedCustomer.customer;
    const categoryIcon = getCategoryIcon(customer.category);
    const statusIcon = getStatusIcon(customer.status);
    customerInfo = \`
🆔 削除された顧客:
   👤 \${customer.name} (\${customer.company})
   📧 \${customer.email}
   \${categoryIcon} \${customer.category}
   \${statusIcon} \${customer.status}\`;
  } else {
    customerInfo = \`🆔 顧客ID: \${customerId}\`;
  }
  
  return \`🗑️ 顧客情報を削除しました
\${customerInfo}

👤 削除者: \${user.name}
🕒 削除日時: \${new Date().toLocaleString('ja-JP')}

⚠️ この操作は取り消せません。\`;
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

function isValidEmail(email) {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
}

function isValidDate(dateString) {
  const regex = /^\\d{4}-\\d{2}-\\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date) && date.toISOString().substr(0, 10) === dateString;
}

function getCategoryIcon(category) {
  const icons = {
    '見込み客': '🎯',
    '既存顧客': '🤝',
    'VIP顧客': '⭐',
    '休眠顧客': '😴'
  };
  return icons[category] || '👤';
}

function getStatusIcon(status) {
  const icons = {
    'アクティブ': '✅',
    '非アクティブ': '⏸️',
    '要フォロー': '📞',
    '契約済み': '✍️'
  };
  return icons[status] || '❓';
}`;

const CRM_ICON = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- CRMシステムアイコン（Bearer Token認証対応版） -->
  <!-- 背景 -->
  <rect x="3" y="3" width="18" height="18" rx="2" fill="#D1FAE5" stroke="#10B981" stroke-width="2"/>
  
  <!-- 顧客グループ -->
  <circle cx="8" cy="8" r="2" fill="#10B981"/>
  <circle cx="16" cy="8" r="2" fill="#059669"/>
  <circle cx="12" cy="12" r="2" fill="#047857"/>
  
  <!-- 接続線（関係性を表す） -->
  <line x1="8" y1="8" x2="12" y2="12" stroke="#10B981" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="16" y1="8" x2="12" y2="12" stroke="#059669" stroke-width="1.5" stroke-linecap="round"/>
  
  <!-- セキュリティ認証マーク -->
  <circle cx="19" cy="5" r="2" fill="#059669"/>
  <path d="M18 4l1 1 2-2" stroke="#FFFFFF" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
  
  <!-- データベースアイコン -->
  <ellipse cx="12" cy="18" rx="5" ry="1.5" fill="#10B981" fill-opacity="0.6"/>
  <ellipse cx="12" cy="17" rx="5" ry="1.5" fill="#10B981"/>
  <path d="M7 17v1c0 0.8 2.2 1.5 5 1.5s5-0.7 5-1.5v-1" stroke="#059669" stroke-width="1" fill="none"/>
  
  <!-- 顧客情報カード -->
  <rect x="4" y="14" width="6" height="3" rx="0.5" fill="#F0FDF4" stroke="#10B981" stroke-width="0.8"/>
  <line x1="5" y1="15" x2="8" y2="15" stroke="#059669" stroke-width="0.6"/>
  <line x1="5" y1="16" x2="7" y2="16" stroke="#059669" stroke-width="0.6"/>
  
  <!-- 商談管理アイコン -->
  <rect x="14" y="14" width="6" height="3" rx="0.5" fill="#F0FDF4" stroke="#10B981" stroke-width="0.8"/>
  <circle cx="16" cy="15.5" r="0.5" fill="#10B981"/>
  <line x1="17" y1="15.5" x2="19" y2="15.5" stroke="#059669" stroke-width="0.6"/>
  <line x1="15" y1="16.3" x2="19" y2="16.3" stroke="#059669" stroke-width="0.4"/>
  
  <!-- 進行状況バー -->
  <rect x="4" y="20" width="16" height="1" rx="0.5" fill="#D1FAE5"/>
  <rect x="4" y="20" width="12" height="1" rx="0.5" fill="#10B981"/>
  
  <!-- Bearer Token認証を表すアイコン -->
  <circle cx="1" cy="1" r="0.5" fill="#059669"/>
  <circle cx="23" cy="1" r="0.5" fill="#059669"/>
  <circle cx="1" cy="23" r="0.5" fill="#059669"/>
  <circle cx="23" cy="23" r="0.5" fill="#059669"/>
  
  <!-- セキュリティバッジ -->
  <rect x="2" y="2" width="3" height="1.5" rx="0.5" fill="#047857"/>
  <text x="3.5" y="3" font-family="Arial, sans-serif" font-size="0.6" font-weight="bold" text-anchor="middle" fill="#FFFFFF">CRM</text>
</svg>`;

// =============================================================================
// インストール処理
// =============================================================================

async function installCrmTool() {
  try {
    console.log('👥 CRM（顧客関係管理）システム用MCPツール v1.0.0 (Bearer Token認証対応版) をインストールしています...');
    
    // YourToolディレクトリの確認/作成
    if (!existsSync(TOOLS_DIR)) {
      console.log('📁 YourToolディレクトリを作成しています...');
      await fs.mkdir(TOOLS_DIR, { recursive: true });
    }
    
    // CRMツールのインストール
    const crmDir = path.join(TOOLS_DIR, 'customer_manager');
    if (existsSync(crmDir)) {
      console.log('⚠️  customer_manager ディレクトリが既に存在します。上書きします...');
      await fs.rmdir(crmDir, { recursive: true });
    }
    
    await fs.mkdir(crmDir, { recursive: true });
    
    console.log('📄 customer_manager/config.json を作成しています...');
    await fs.writeFile(
      path.join(crmDir, 'config.json'),
      JSON.stringify(CRM_CONFIG, null, 2),
      'utf8'
    );
    
    console.log('⚙️ customer_manager/handler.js を作成しています...');
    await fs.writeFile(
      path.join(crmDir, 'handler.js'),
      CRM_HANDLER,
      'utf8'
    );
    
    console.log('🎨 customer_manager/icon を作成しています...');
    await fs.writeFile(
      path.join(crmDir, 'customer_manager_icon.svg'),
      CRM_ICON,
      'utf8'
    );
    
    // README作成
    const readmeContent = `# CRM（顧客関係管理）システム用MCPツール v1.0.0 (Bearer Token認証対応版)

**🔐 Bearer Token認証に完全対応**したCRM（Customer Relationship Management）システムです。  
**OneAgentサーバーとの認証連携**により、安定した顧客情報管理を実現しています。

## 🔧 主な機能 (v1.0.0)

### ✅ **認証システム**
- ✅ **追加**: Bearer Token認証 (\`Authorization: Bearer <token>\`)
- ✅ **実装**: 認証コンテキストからのトークン取得
- ✅ **強化**: デバッグ情報の追加

### ✅ **顧客管理機能**
- ✅ **実装**: \`callCrmAPI\`関数でBearer Token使用
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
2. **CRM APIサーバー稼働**: localhost:3553でCRM APIサーバーが稼働している必要があります
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
  "action": "list_customers"
}
\`\`\`

#### 3. Bearer Token認証フロー
1. ユーザーがOneAgentサーバーでOAuth認証を完了
2. AIエージェントがツール実行時にBearer Tokenを含む認証コンテキストを作成
3. customer_managerツールがBearer Tokenを抽出
4. localhost:3553のAPIにBearer Tokenで認証リクエスト
5. APIサーバーがOneAgentサーバーでトークン検証
6. 認証成功で正常にAPI処理が実行

### 環境変数（オプション）
\`\`\`bash
# カスタムAPIサーバーを使用する場合
export CRM_API_BASE_URL="http://localhost:3553/api"
\`\`\`

## 📝 対応機能（6機能）

### ①顧客情報作成 ✅
\`\`\`javascript
{
  "action": "create_customer",
  "name": "山田太郎",
  "company": "株式会社サンプル",
  "email": "yamada@sample.com",
  "phone": "03-1234-5678",
  "category": "見込み客",
  "status": "アクティブ",
  "notes": "展示会で名刺交換",
  "lastContact": "2024-01-15",
  "nextAction": "製品デモの提案"
}
\`\`\`

### ②顧客一覧取得 ✅
\`\`\`javascript
{
  "action": "list_customers",
  "limit": 10,
  "offset": 0,
  "filterCategory": "見込み客",
  "filterStatus": "アクティブ"
}
\`\`\`

### ③顧客詳細取得 ✅
\`\`\`javascript
{
  "action": "get_customer",
  "customerId": "customer_1234567890_abcdef123"
}
\`\`\`

### ④顧客更新 ✅
\`\`\`javascript
{
  "action": "update_customer",
  "customerId": "customer_1234567890_abcdef123",
  "status": "契約済み",
  "nextAction": "定期フォローアップ"
}
\`\`\`

### ⑤顧客削除 ✅
\`\`\`javascript
{
  "action": "delete_customer",
  "customerId": "customer_1234567890_abcdef123"
}
\`\`\`

### ⑥顧客フォーマット確認 ✅
\`\`\`javascript
{
  "action": "get_customer_format"
}
\`\`\`

## 📊 カテゴリ・ステータス対応

### 顧客カテゴリ
- 🎯 **見込み客** - 新規リード、商談検討中
- 🤝 **既存顧客** - 取引実績あり、継続中
- ⭐ **VIP顧客** - 重要顧客、優先対応
- 😴 **休眠顧客** - 長期間連絡なし、再活性化が必要

### 顧客ステータス
- ✅ **アクティブ** - 積極的に営業活動中
- ⏸️ **非アクティブ** - 一時的に活動停止
- 📞 **要フォロー** - フォローアップが必要
- ✍️ **契約済み** - 契約締結完了

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

### 2. CRM APIサーバー起動
\`\`\`bash
# CRM APIサーバーを起動
node crm-server.js
# http://localhost:3553 で起動
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
  "action": "list_customers"
}
\`\`\`

## 🔧 トラブルシューティング

### 認証エラー
\`\`\`
API Error (401): 認証が必要です
\`\`\`
**解決策**:
- ✅ Bearer Token認証の実装を確認
- ✅ 認証コンテキストからの適切なトークン取得
- ✅ デバッグ情報の確認

### APIサーバー接続エラー
\`\`\`
Error: API呼び出しエラー: fetch failed
\`\`\`
**解決策**:
1. APIサーバーの起動状態を確認: \`curl http://localhost:3553/api/customer-format\`
2. ポート3553が使用可能であることを確認
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
🔍 [DEBUG] customer_manager 開始
🔍 [DEBUG] args: {...}
🔍 [DEBUG] context keys: [...]
🔍 [DEBUG] callCrmAPI 開始
✅ [DEBUG] tokenInfo.tokenからトークン取得
🎫 [DEBUG] トークン確認: eyJhbGciOiJIUzI1NiIs...
🔄 [DEBUG] API呼び出し: GET http://localhost:3553/api/customers
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
2. **フォーマット確認**: \`get_customer_format\` でフィールド確認
3. **顧客登録**: \`create_customer\` で新規顧客作成
4. **一覧確認**: \`list_customers\` で登録済み顧客確認
5. **詳細確認**: \`get_customer\` で特定顧客の詳細確認
6. **必要に応じて更新**: \`update_customer\` で顧客情報修正
7. **不要なら削除**: \`delete_customer\` でクリーンアップ

この版はBearer Token認証に完全対応し、安定した顧客管理機能を実現しています。
`;

    await fs.writeFile(
      path.join(TOOLS_DIR, 'CRM_BEARER_TOKEN_README.md'),
      readmeContent,
      'utf8'
    );
    
    console.log('\n✅ CRM（顧客関係管理）システム用MCPツール v1.0.0 (Bearer Token認証対応版) のインストールが完了しました！');
    console.log(`📁 インストール場所: ${TOOLS_DIR}`);
    
    console.log('\n🔐 主要な機能:');
    console.log('✅ Bearer Token認証の実装');
    console.log('✅ 認証コンテキストの適切な活用');
    console.log('✅ デバッグ情報の強化');
    console.log('✅ 顧客情報の包括的な管理');
    
    console.log('\n🔧 認証フロー:');
    console.log('1. OneAgentサーバーでOAuth認証完了');
    console.log('2. AIエージェントがBearer Tokenを含む認証コンテキストを作成');
    console.log('3. customer_managerツールがBearer Tokenを抽出');
    console.log('4. localhost:3553のAPIにBearer Tokenで認証');
    console.log('5. APIサーバーがOneAgentサーバーでトークン検証');
    console.log('6. 認証成功で正常に処理実行');
    
    console.log('\n📊 対応機能:');
    console.log('- ✅ 顧客作成 (create_customer)');
    console.log('- ✅ 顧客一覧取得 (list_customers)');
    console.log('- ✅ 顧客詳細取得 (get_customer)');
    console.log('- ✅ 顧客フォーマット確認 (get_customer_format)');
    console.log('- ✅ 顧客更新 (update_customer)');
    console.log('- ✅ 顧客削除 (delete_customer)');
    
    console.log('\n🔍 CRM機能:');
    console.log('- 顧客カテゴリ管理 (見込み客、既存顧客、VIP顧客、休眠顧客)');
    console.log('- ステータス管理 (アクティブ、非アクティブ、要フォロー、契約済み)');
    console.log('- 連絡履歴の記録');
    console.log('- 次回アクションの管理');
    console.log('- フィルター機能付き一覧表示');
    
    console.log('\n🚀 次のステップ:');
    console.log('1. CRM APIサーバー (crm-server.js) をセットアップ');
    console.log('2. OneAgentサーバーを起動');
    console.log('3. CRM APIサーバーを起動');
    console.log('4. ブラウザでOAuth認証完了');
    console.log('5. customer_managerツールをテスト');
    
  } catch (error) {
    console.error('❌ インストール中にエラーが発生しました:', error.message);
    process.exit(1);
  }
}

// メイン実行
installCrmTool();