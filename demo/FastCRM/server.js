import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

// .env_demoファイルを読み込み
dotenv.config({ path: '.env_demo' });

const app = express();
const PORT = process.env.CRM_PORT || 3553;

// JSONファイルのパス
const DATA_FILE_PATH = path.join(process.cwd(), 'customer_data.json');

// ミドルウェア設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OAuth設定（.env_demoから読み込み）
const OAUTH_CONFIG = {
  baseUrl: process.env.OAUTH_BASE_URL || 'http://localhost:3000',
  clientId: process.env.OAUTH_CLIENT_ID || 'oneagent-default-client',
  clientSecret: process.env.OAUTH_CLIENT_SECRET || 'demo-secret-key',
  redirectUri: process.env.CRM_OAUTH_REDIRECT_URI || 'http://localhost:3553/oauth/callback',
  scope: process.env.OAUTH_SCOPE || 'read write',
  userInfoEndpoint: process.env.OAUTH_USER_INFO_ENDPOINT || '/oauth/userinfo'
};

// メモリ内データストア（デモ用）
const dataStore = {
  users: new Map(),
  customers: new Map(),
  sessions: new Map()
};

// 顧客フォーマット定義
const CUSTOMER_FORMAT = {
  name: 'string',
  company: 'string',
  email: 'string',
  phone: 'string',
  category: 'string',
  status: 'string',
  notes: 'string',
  lastContact: 'YYYY-MM-DD',
  nextAction: 'string'
};

// 顧客カテゴリとステータスの定義
const CUSTOMER_CATEGORIES = ['見込み客', '既存顧客', 'VIP顧客', '休眠顧客'];
const CUSTOMER_STATUSES = ['アクティブ', '非アクティブ', '要フォロー', '契約済み'];

// JSONファイル操作関数（同期機能強化）
async function loadDataFromFile() {
  try {
    const data = await fs.readFile(DATA_FILE_PATH, 'utf8');
    const jsonData = JSON.parse(data);
    
    // Mapをクリア
    dataStore.users.clear();
    dataStore.customers.clear();
    
    // Mapに変換
    if (jsonData.users) {
      Object.entries(jsonData.users).forEach(([key, value]) => {
        dataStore.users.set(key, value);
      });
    }
    
    if (jsonData.customers) {
      Object.entries(jsonData.customers).forEach(([key, value]) => {
        dataStore.customers.set(key, value);
      });
    }
    
    return jsonData;
  } catch (error) {
    if (error.code === 'ENOENT') {
      await saveDataToFile();
      return { users: {}, customers: {}, metadata: { totalUsers: 0, totalCustomers: 0 } };
    } else {
      console.error('JSONファイル読み込みエラー:', error.message);
      return null;
    }
  }
}

async function saveDataToFile() {
  try {
    const jsonData = {
      users: Object.fromEntries(dataStore.users),
      customers: Object.fromEntries(dataStore.customers),
      lastUpdated: new Date().toISOString(),
      metadata: {
        totalUsers: dataStore.users.size,
        totalCustomers: dataStore.customers.size,
        version: '1.0.0',
        categories: CUSTOMER_CATEGORIES,
        statuses: CUSTOMER_STATUSES
      }
    };
    
    await fs.writeFile(DATA_FILE_PATH, JSON.stringify(jsonData, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('JSONファイル保存エラー:', error.message);
    return false;
  }
}

// 同期機能: JSONファイルから最新データを取得
async function syncFromFile() {
  try {
    const data = await fs.readFile(DATA_FILE_PATH, 'utf8');
    const jsonData = JSON.parse(data);
    
    // メモリ内データストアを更新
    dataStore.users.clear();
    dataStore.customers.clear();
    
    if (jsonData.users) {
      Object.entries(jsonData.users).forEach(([key, value]) => {
        dataStore.users.set(key, value);
      });
    }
    
    if (jsonData.customers) {
      Object.entries(jsonData.customers).forEach(([key, value]) => {
        dataStore.customers.set(key, value);
      });
    }
    
    return jsonData;
  } catch (error) {
    console.error('同期エラー:', error.message);
    return null;
  }
}

// 定期同期: 30秒ごとにJSONファイルから同期
setInterval(async () => {
  await syncFromFile();
}, 30000);

// 最新のJSONデータを取得
async function getFreshData() {
  try {
    const data = await fs.readFile(DATA_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { users: {}, customers: {}, metadata: { totalUsers: 0, totalCustomers: 0 } };
  }
}

// セッション管理
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

function setSession(sessionId, data) {
  dataStore.sessions.set(sessionId, {
    ...data,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24時間
  });
}

function getSession(sessionId) {
  const session = dataStore.sessions.get(sessionId);
  if (!session) {
    return null;
  }
  if (session.expiresAt < new Date()) {
    dataStore.sessions.delete(sessionId);
    return null;
  }
  return session;
}

// OneAgentサーバーでのトークン検証関数
async function verifyTokenFromOneAgent(token) {
  try {
    const response = await axios.get(`${OAUTH_CONFIG.baseUrl}${OAUTH_CONFIG.userInfoEndpoint}`, {
      headers: { 
        Authorization: `Bearer ${token}`,
        'User-Agent': 'CRM-API/1.0.0'
      },
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    return null;
  }
}

// 認証ミドルウェア（Bearer Token対応版）
async function requireAuth(req, res, next) {
  // 1. セッション認証を試行（ブラウザ用）
  const sessionId = req.headers.cookie?.match(/session=([^;]+)/)?.[1];
  const session = sessionId ? getSession(sessionId) : null;
  
  if (session) {
    req.user = session.user;
    req.accessToken = session.accessToken;
    req.authMethod = 'session';
    return next();
  }
  
  // 2. Bearer Token認証を試行（MCPツール/API用）
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    
    try {
      const tokenUser = await verifyTokenFromOneAgent(token);
      if (tokenUser) {
        req.user = {
          id: tokenUser.sub || tokenUser.id,
          username: tokenUser.username || tokenUser.preferred_username,
          email: tokenUser.email,
          roles: tokenUser.roles || ['user'],
          profile: tokenUser.profile || {}
        };
        req.accessToken = token;
        req.authMethod = 'bearer_token';
        
        // ユーザー初期化（初回APIアクセス時）
        const correctUserId = req.user.username || req.user.id || 'unknown';
        if (!dataStore.users.has(correctUserId)) {
          dataStore.users.set(correctUserId, {
            id: correctUserId,
            username: req.user.username,
            customers: []
          });
          await saveDataToFile();
        }
        
        return next();
      }
    } catch (error) {
      // トークン検証エラー
    }
  }
  
  // APIエンドポイントの場合はJSONエラーを返す
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: '認証が必要です',
        details: {
          supportedMethods: ['Session Cookie', 'Bearer Token'],
          oauthEndpoint: `${OAUTH_CONFIG.baseUrl}/oauth/authorize`
        }
      }
    });
  }
  
  // ブラウザアクセスの場合はリダイレクト
  return res.redirect('/login');
}

// OAuth認証フロー開始
app.get('/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = `${OAUTH_CONFIG.baseUrl}/oauth/authorize?` + 
    `client_id=${OAUTH_CONFIG.clientId}&` +
    `redirect_uri=${encodeURIComponent(OAUTH_CONFIG.redirectUri)}&` +
    `scope=${encodeURIComponent(OAUTH_CONFIG.scope)}&` +
    `state=${state}&` +
    `response_type=code`;
  
  res.cookie('oauth_state', state, { httpOnly: true });
  res.redirect(authUrl);
});

// OAuth認証コールバック
app.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const storedState = req.headers.cookie?.match(/oauth_state=([^;]+)/)?.[1];
    
    if (!code || !state || state !== storedState) {
      return res.status(400).send('認証エラー: 無効なパラメータ');
    }
    
    // アクセストークン取得
    const tokenResponse = await axios.post(`${OAUTH_CONFIG.baseUrl}/oauth/token`, {
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: OAUTH_CONFIG.redirectUri,
      client_id: OAUTH_CONFIG.clientId,
      client_secret: OAUTH_CONFIG.clientSecret
    });
    
    const { access_token, token_type } = tokenResponse.data;
    
    // ユーザー情報取得
    const userResponse = await axios.get(`${OAUTH_CONFIG.baseUrl}${OAUTH_CONFIG.userInfoEndpoint}`, {
      headers: { Authorization: `${token_type} ${access_token}` }
    });
    
    const rawUser = userResponse.data;
    
    // ユーザーIDの正規化（undefinedの場合はusernameを使用）
    const user = {
      id: rawUser.id || rawUser.sub || rawUser.username || rawUser.preferred_username,
      username: rawUser.username || rawUser.preferred_username || rawUser.id,
      email: rawUser.email,
      roles: rawUser.roles || ['user'],
      profile: rawUser.profile || {}
    };
    
    // セッション作成
    const sessionId = generateSessionId();
    setSession(sessionId, {
      user: user,
      accessToken: access_token,
      tokenType: token_type
    });
    
    // ユーザー初期化
    if (!dataStore.users.has(user.id)) {
      dataStore.users.set(user.id, {
        id: user.id,
        username: user.username,
        customers: []
      });
      await saveDataToFile();
    }
    
    res.cookie('session', sessionId, { httpOnly: true });
    res.redirect('/');
    
  } catch (error) {
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h1>認証エラー</h1>
          <p>認証処理中にエラーが発生しました。</p>
          <p><strong>エラー:</strong> ${error.message}</p>
          <p><a href="/login">再度ログインを試行</a></p>
        </body>
      </html>
    `);
  }
});

// ログアウト
app.get('/logout', (req, res) => {
  const sessionId = req.headers.cookie?.match(/session=([^;]+)/)?.[1];
  if (sessionId) {
    dataStore.sessions.delete(sessionId);
  }
  res.clearCookie('session');
  res.redirect('/login');
});

// メイン画面（顧客一覧）- JSONから動的生成
app.get('/', async (req, res) => {
  try {
    // 認証状態をチェック
    const sessionId = req.headers.cookie?.match(/session=([^;]+)/)?.[1];
    const session = sessionId ? getSession(sessionId) : null;
    
    // 未認証の場合はOAuth認証フローを開始
    if (!session) {
      const state = crypto.randomBytes(16).toString('hex');
      const authUrl = `${OAUTH_CONFIG.baseUrl}/oauth/authorize?` + 
        `client_id=${OAUTH_CONFIG.clientId}&` +
        `redirect_uri=${encodeURIComponent(OAUTH_CONFIG.redirectUri)}&` +
        `scope=${encodeURIComponent(OAUTH_CONFIG.scope)}&` +
        `state=${state}&` +
        `response_type=code`;
      
      res.cookie('oauth_state', state, { httpOnly: true });
      return res.redirect(authUrl);
    }
    
    // 最新のJSONデータを同期
    await syncFromFile();
    const jsonData = await getFreshData();
    
    // 改善されたユーザー照合ロジック
    let userData = null;
    let allUserCustomers = [];
    
    // 1. ユーザー名で検索（最優先）
    if (session.user.username && session.user.username !== 'undefined') {
      userData = Object.values(jsonData.users).find(user => 
        user.username === session.user.username && user.id !== 'undefined'
      );
      if (userData) {
        // メインユーザーの顧客を取得
        allUserCustomers = userData.customers
          .map(customerId => jsonData.customers[customerId])
          .filter(Boolean);
      }
    }
    
    // 2. IDで検索（IDが有効な場合）
    if (!userData && session.user.id && session.user.id !== 'undefined') {
      userData = jsonData.users[session.user.id];
      if (userData) {
        allUserCustomers = userData.customers
          .map(customerId => jsonData.customers[customerId])
          .filter(Boolean);
      }
    }
    
    // 3. 同じユーザー名の全ての顧客を統合（undefinedユーザー含む）
    if (userData && session.user.username) {
      Object.values(jsonData.users).forEach(user => {
        if (user.username === session.user.username && user !== userData) {
          const additionalCustomers = user.customers
            .map(customerId => jsonData.customers[customerId])
            .filter(Boolean);
          allUserCustomers = [...allUserCustomers, ...additionalCustomers];
          
          // undefinedユーザーの顧客を正しいユーザーに移動
          if (user.id === 'undefined' && additionalCustomers.length > 0) {
            userData.customers = [...userData.customers, ...user.customers];
            user.customers = []; // undefinedユーザーから顧客を削除
            
            // 顧客のuserIdを修正
            additionalCustomers.forEach(customer => {
              if (jsonData.customers[customer.id]) {
                jsonData.customers[customer.id].userId = userData.id;
                dataStore.customers.set(customer.id, jsonData.customers[customer.id]);
              }
            });
          }
        }
      });
    }
    
    // 4. 特別処理：undefinedユーザーをクリーンアップして再作成
    if (!userData) {
      // 正しいIDでユーザーを作成
      const correctUserId = session.user.username || session.user.id || 'demo';
      userData = {
        id: correctUserId,
        username: session.user.username,
        customers: []
      };
      
      dataStore.users.set(correctUserId, userData);
    }
    
    // 5. データクリーンアップとJSONファイル保存
    if (jsonData.users['undefined'] && jsonData.users['undefined'].customers.length === 0) {
      delete jsonData.users['undefined'];
      dataStore.users.delete('undefined');
      await saveDataToFile();
    } else if (userData && allUserCustomers.some(c => c.userId !== userData.id)) {
      await saveDataToFile();
    }
    
    // ユーザーの顧客を取得（統合された顧客一覧を使用）
    const userCustomers = allUserCustomers
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // カテゴリ別統計を計算
    const categoryStats = CUSTOMER_CATEGORIES.map(category => ({
      category,
      count: userCustomers.filter(c => c.category === category).length
    }));

    // ステータス別統計を計算
    const statusStats = CUSTOMER_STATUSES.map(status => ({
      status,
      count: userCustomers.filter(c => c.status === status).length
    }));
  
  const html = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CRM（顧客関係管理）システム</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f0fdf4; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; margin: -20px -20px 20px -20px; }
        .header h1 { margin: 0; }
        .user-info { float: right; }
        .container { max-width: 1200px; margin: 0 auto; }
        .actions { margin-bottom: 20px; }
        .btn { background: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px; border: none; cursor: pointer; }
        .btn:hover { background: #059669; }
        .btn-secondary { background: #6b7280; }
        .btn-secondary:hover { background: #4b5563; }
        .btn-success { background: #059669; }
        .btn-success:hover { background: #047857; }
        .btn-warning { background: #d97706; }
        .btn-warning:hover { background: #b45309; }
        .btn-danger { background: #dc2626; }
        .btn-danger:hover { background: #b91c1c; }
        .customer-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
        .customer-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #10b981; }
        .customer-card h3 { margin-top: 0; color: #1f2937; }
        .customer-meta { color: #6b7280; font-size: 14px; margin-bottom: 10px; }
        .company { font-size: 16px; font-weight: bold; color: #059669; }
        .category { background: #d1fae5; padding: 4px 8px; border-radius: 4px; font-size: 12px; display: inline-block; color: #047857; }
        .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; display: inline-block; margin-left: 5px; }
        .status-active { background: #d1fae5; color: #047857; }
        .status-inactive { background: #f3f4f6; color: #6b7280; }
        .status-follow { background: #fef3c7; color: #d97706; }
        .status-contract { background: #dbeafe; color: #1d4ed8; }
        .no-customers { text-align: center; padding: 40px; color: #6b7280; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat-card { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; color: #10b981; }
        .stat-label { color: #6b7280; font-size: 14px; margin-top: 5px; }
        .filters { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .filter-group { display: inline-block; margin-right: 15px; }
        .filter-group select { padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="container">
          <div class="user-info">
            ようこそ、${session.user.username}さん | <a href="/logout" style="color: white;">ログアウト</a>
          </div>
          <h1>👥 CRM（顧客関係管理）システム</h1>
        </div>
      </div>
      
      <div class="container">
        <div class="actions">
          <a href="/create" class="btn">👤 新しい顧客を登録</a>
          <a href="/api/customer-format" class="btn btn-secondary">📋 顧客フォーマット</a>
          <a href="/json-data" class="btn btn-success">📄 JSON データ表示</a>
          <a href="/api/json-export" class="btn btn-secondary">💾 JSON エクスポート</a>
        </div>
        
        <div class="stats">
          <div class="stat-card">
            <div class="stat-value">${userCustomers.length}</div>
            <div class="stat-label">総顧客数</div>
          </div>
          ${categoryStats.map(stat => `
            <div class="stat-card">
              <div class="stat-value">${stat.count}</div>
              <div class="stat-label">${stat.category}</div>
            </div>
          `).join('')}
          <div class="stat-card">
            <div class="stat-value">${jsonData.metadata?.totalCustomers || 0}</div>
            <div class="stat-label">システム全体</div>
          </div>
        </div>
        
        <div class="filters">
          <div class="filter-group">
            <label>カテゴリ: </label>
            <select id="categoryFilter" onchange="filterCustomers()">
              <option value="">すべて</option>
              ${CUSTOMER_CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
          </div>
          <div class="filter-group">
            <label>ステータス: </label>
            <select id="statusFilter" onchange="filterCustomers()">
              <option value="">すべて</option>
              ${CUSTOMER_STATUSES.map(status => `<option value="${status}">${status}</option>`).join('')}
            </select>
          </div>
          <button onclick="clearFilters()" class="btn btn-secondary" style="padding: 8px 16px;">フィルタークリア</button>
        </div>
        
        <h2>👥 顧客一覧 (${userCustomers.length}件)</h2>
        
        ${userCustomers.length === 0 ? `
          <div class="no-customers">
            <h3>まだ顧客が登録されていません</h3>
            <p>新しい顧客を登録してください</p>
          </div>
        ` : `
          <div class="customer-grid" id="customerGrid">
            ${userCustomers.map(customer => {
              const statusClass = {
                'アクティブ': 'status-active',
                '非アクティブ': 'status-inactive',
                '要フォロー': 'status-follow',
                '契約済み': 'status-contract'
              }[customer.status] || 'status-inactive';
              
              const lastContactDate = customer.lastContact ? new Date(customer.lastContact).toLocaleDateString('ja-JP') : '未記録';
              
              return `
                <div class="customer-card" data-category="${customer.category}" data-status="${customer.status}">
                  <h3><a href="/customer/${customer.id}" style="text-decoration: none; color: #1f2937;">${customer.name}</a></h3>
                  <div class="company">${customer.company}</div>
                  <div class="customer-meta">
                    📧 ${customer.email} | 📞 ${customer.phone || '未設定'}
                  </div>
                  <div class="customer-meta">
                    📅 最終連絡: ${lastContactDate} | 🆔 ${customer.id.split('_')[1]}
                  </div>
                  <div style="margin: 10px 0;">
                    <span class="category">${customer.category}</span>
                    <span class="status ${statusClass}">${customer.status}</span>
                  </div>
                  ${customer.nextAction ? `<p style="color: #6b7280; margin: 10px 0;">⏰ ${customer.nextAction}</p>` : ''}
                  ${customer.notes ? `<p style="color: #4b5563; margin: 10px 0;">${customer.notes}</p>` : ''}
                  <div style="margin-top: 15px;">
                    <a href="/customer/${customer.id}" class="btn" style="font-size: 12px; padding: 6px 12px;">詳細を見る</a>
                    <a href="/edit/${customer.id}" class="btn btn-warning" style="font-size: 12px; padding: 6px 12px;">編集</a>
                    <button onclick="deleteCustomer('${customer.id}')" class="btn btn-danger" style="font-size: 12px; padding: 6px 12px;">削除</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
      
      <script>
        function filterCustomers() {
          const categoryFilter = document.getElementById('categoryFilter').value;
          const statusFilter = document.getElementById('statusFilter').value;
          const cards = document.querySelectorAll('.customer-card');
          
          cards.forEach(card => {
            const category = card.getAttribute('data-category');
            const status = card.getAttribute('data-status');
            
            const categoryMatch = !categoryFilter || category === categoryFilter;
            const statusMatch = !statusFilter || status === statusFilter;
            
            if (categoryMatch && statusMatch) {
              card.style.display = 'block';
            } else {
              card.style.display = 'none';
            }
          });
        }
        
        function clearFilters() {
          document.getElementById('categoryFilter').value = '';
          document.getElementById('statusFilter').value = '';
          filterCustomers();
        }
        
        async function deleteCustomer(customerId) {
          if (!confirm('この顧客を削除しますか？')) return;
          
          try {
            const response = await fetch('/api/customers/' + customerId, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
              alert('顧客を削除しました');
              window.location.reload();
            } else {
              const error = await response.json();
              alert('削除に失敗しました: ' + error.error.message);
            }
          } catch (error) {
            alert('削除中にエラーが発生しました: ' + error.message);
          }
        }
      </script>
    </body>
    </html>
  `;
  
  res.send(html);
  
  } catch (error) {
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h1>エラーが発生しました</h1>
          <p>申し訳ありませんが、システムエラーが発生しました。</p>
          <p><a href="/logout">ログアウトして再試行</a></p>
        </body>
      </html>
    `);
  }
});

// JSONデータ表示画面 - JSONから動的生成
app.get('/json-data', requireAuth, async (req, res) => {
  try {
    // 最新データを同期
    await syncFromFile();
    const rawData = await fs.readFile(DATA_FILE_PATH, 'utf8');
    const jsonData = JSON.parse(rawData);
    
    const html = `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>JSON データ表示 - CRMシステム</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f0fdf4; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; margin: -20px -20px 20px -20px; }
          .header h1 { margin: 0; }
          .container { max-width: 1200px; margin: 0 auto; }
          .btn { background: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px; border: none; cursor: pointer; }
          .btn:hover { background: #059669; }
          .btn-secondary { background: #6b7280; }
          .btn-secondary:hover { background: #4b5563; }
          .json-container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
          .json-code { background: #1f2937; color: #f9fafb; padding: 20px; border-radius: 8px; overflow-x: auto; font-family: 'Courier New', monospace; white-space: pre-wrap; max-height: 600px; overflow-y: auto; }
          .metadata { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
          .metadata-card { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
          .metadata-value { font-size: 24px; font-weight: bold; color: #10b981; }
          .metadata-label { color: #6b7280; font-size: 14px; margin-top: 5px; }
          .download-section { background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="container">
            <h1>📄 JSON データ表示</h1>
          </div>
        </div>
        
        <div class="container">
          <div style="margin-bottom: 20px;">
            <a href="/" class="btn btn-secondary">← メイン画面に戻る</a>
            <a href="/api/json-export" class="btn" download="customer_data.json">💾 JSONファイルをダウンロード</a>
            <button onclick="refreshData()" class="btn">🔄 データ更新</button>
          </div>
          
          <div class="metadata">
            <div class="metadata-card">
              <div class="metadata-value">${jsonData.metadata?.totalUsers || 0}</div>
              <div class="metadata-label">総ユーザー数</div>
            </div>
            <div class="metadata-card">
              <div class="metadata-value">${jsonData.metadata?.totalCustomers || 0}</div>
              <div class="metadata-label">総顧客数</div>
            </div>
            <div class="metadata-card">
              <div class="metadata-value">${jsonData.lastUpdated ? new Date(jsonData.lastUpdated).toLocaleDateString('ja-JP') : 'N/A'}</div>
              <div class="metadata-label">最終更新日</div>
            </div>
            <div class="metadata-card">
              <div class="metadata-value">${jsonData.metadata?.version || 'N/A'}</div>
              <div class="metadata-label">データ版本</div>
            </div>
          </div>
          
          <div class="download-section">
            <h3>💾 ファイル情報</h3>
            <p>JSONファイルパス: <code>${DATA_FILE_PATH}</code></p>
            <p>ファイルサイズ: ${Buffer.byteLength(rawData, 'utf8')} バイト</p>
            <p>最終更新: ${jsonData.lastUpdated ? new Date(jsonData.lastUpdated).toLocaleString('ja-JP') : 'N/A'}</p>
            <p>対応カテゴリ: ${CUSTOMER_CATEGORIES.join(', ')}</p>
            <p>対応ステータス: ${CUSTOMER_STATUSES.join(', ')}</p>
          </div>
          
          <div class="json-container">
            <h3>📋 JSON データ内容</h3>
            <div class="json-code">${JSON.stringify(jsonData, null, 2)}</div>
          </div>
        </div>
        
        <script>
          function refreshData() {
            window.location.reload();
          }
        </script>
      </body>
      </html>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h1>エラーが発生しました</h1>
          <p>JSONデータの読み込み中にエラーが発生しました。</p>
          <p><a href="/">メイン画面に戻る</a></p>
        </body>
      </html>
    `);
  }
});

// 顧客作成画面
app.get('/create', requireAuth, (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>新しい顧客を登録 - CRMシステム</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f0fdf4; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; margin: -20px -20px 20px -20px; }
        .header h1 { margin: 0; }
        .container { max-width: 800px; margin: 0 auto; }
        .form-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #1f2937; }
        input, select, textarea { width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 4px; box-sizing: border-box; }
        textarea { height: 100px; resize: vertical; }
        .btn { background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px; border: none; cursor: pointer; }
        .btn:hover { background: #059669; }
        .btn-secondary { background: #6b7280; }
        .btn-secondary:hover { background: #4b5563; }
        .required { color: #dc2626; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="container">
          <h1>👤 新しい顧客を登録</h1>
        </div>
      </div>
      
      <div class="container">
        <div class="form-container">
          <form action="/api/customers" method="POST">
            <div class="form-group">
              <label for="name">顧客名 <span class="required">*</span></label>
              <input type="text" id="name" name="name" required placeholder="例：山田太郎">
            </div>
            
            <div class="form-group">
              <label for="company">会社名 <span class="required">*</span></label>
              <input type="text" id="company" name="company" required placeholder="例：株式会社サンプル">
            </div>
            
            <div class="form-group">
              <label for="email">メールアドレス <span class="required">*</span></label>
              <input type="email" id="email" name="email" required placeholder="例：yamada@sample.com">
            </div>
            
            <div class="form-group">
              <label for="phone">電話番号</label>
              <input type="tel" id="phone" name="phone" placeholder="例：03-1234-5678">
            </div>
            
            <div class="form-group">
              <label for="category">カテゴリ <span class="required">*</span></label>
              <select id="category" name="category" required>
                <option value="">選択してください</option>
                <option value="見込み客">🎯 見込み客</option>
                <option value="既存顧客">🤝 既存顧客</option>
                <option value="VIP顧客">⭐ VIP顧客</option>
                <option value="休眠顧客">😴 休眠顧客</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="status">ステータス <span class="required">*</span></label>
              <select id="status" name="status" required>
                <option value="">選択してください</option>
                <option value="アクティブ">✅ アクティブ</option>
                <option value="非アクティブ">⏸️ 非アクティブ</option>
                <option value="要フォロー">📞 要フォロー</option>
                <option value="契約済み">✍️ 契約済み</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="lastContact">最終連絡日</label>
              <input type="date" id="lastContact" name="lastContact">
            </div>
            
            <div class="form-group">
              <label for="nextAction">次回アクション予定</label>
              <input type="text" id="nextAction" name="nextAction" placeholder="例：製品デモの提案">
            </div>
            
            <div class="form-group">
              <label for="notes">備考・メモ</label>
              <textarea id="notes" name="notes" placeholder="顧客の詳細情報やメモを記入してください"></textarea>
            </div>
            
            <div style="margin-top: 30px;">
              <button type="submit" class="btn">💾 顧客を登録</button>
              <a href="/" class="btn btn-secondary">❌ キャンセル</a>
            </div>
          </form>
        </div>
      </div>
    </body>
    </html>
  `;
  
  res.send(html);
});

// 顧客編集画面 - JSONから動的生成
app.get('/edit/:id', requireAuth, async (req, res) => {
  try {
    const customerId = req.params.id;
    
    // 最新データを同期
    await syncFromFile();
    const jsonData = await getFreshData();
    const customer = jsonData.customers[customerId];
    const correctUserId = req.user.username || req.user.id || 'unknown';
    
    if (!customer || (customer.userId !== req.user.id && customer.userId !== correctUserId && customer.createdBy !== req.user.username)) {
      return res.status(404).send('顧客が見つかりません');
    }
    
    const html = `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>顧客編集 - ${customer.name}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f0fdf4; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; margin: -20px -20px 20px -20px; }
          .header h1 { margin: 0; }
          .container { max-width: 800px; margin: 0 auto; }
          .form-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .form-group { margin-bottom: 20px; }
          label { display: block; margin-bottom: 5px; font-weight: bold; color: #1f2937; }
          input, select, textarea { width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 4px; box-sizing: border-box; }
          textarea { height: 100px; resize: vertical; }
          .btn { background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px; border: none; cursor: pointer; }
          .btn:hover { background: #059669; }
          .btn-secondary { background: #6b7280; }
          .btn-secondary:hover { background: #4b5563; }
          .customer-info { background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
          .required { color: #dc2626; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="container">
            <h1>✏️ 顧客編集</h1>
          </div>
        </div>
        
        <div class="container">
          <div style="margin-bottom: 20px;">
            <a href="/" class="btn btn-secondary">← 一覧に戻る</a>
            <a href="/customer/${customer.id}" class="btn btn-secondary">👀 詳細を見る</a>
          </div>
          
          <div class="customer-info">
            <h3>📋 編集対象顧客</h3>
            <p><strong>ID:</strong> ${customer.id}</p>
            <p><strong>登録日:</strong> ${new Date(customer.createdAt).toLocaleString('ja-JP')}</p>
            <p><strong>登録者:</strong> ${customer.createdBy}</p>
          </div>
          
          <div class="form-container">
            <form onsubmit="updateCustomer(event)">
              <div class="form-group">
                <label for="name">顧客名 <span class="required">*</span></label>
                <input type="text" id="name" name="name" required value="${customer.name}">
              </div>
              
              <div class="form-group">
                <label for="company">会社名 <span class="required">*</span></label>
                <input type="text" id="company" name="company" required value="${customer.company}">
              </div>
              
              <div class="form-group">
                <label for="email">メールアドレス <span class="required">*</span></label>
                <input type="email" id="email" name="email" required value="${customer.email}">
              </div>
              
              <div class="form-group">
                <label for="phone">電話番号</label>
                <input type="tel" id="phone" name="phone" value="${customer.phone || ''}">
              </div>
              
              <div class="form-group">
                <label for="category">カテゴリ <span class="required">*</span></label>
                <select id="category" name="category" required>
                  <option value="">選択してください</option>
                  <option value="見込み客" ${customer.category === '見込み客' ? 'selected' : ''}>🎯 見込み客</option>
                  <option value="既存顧客" ${customer.category === '既存顧客' ? 'selected' : ''}>🤝 既存顧客</option>
                  <option value="VIP顧客" ${customer.category === 'VIP顧客' ? 'selected' : ''}>⭐ VIP顧客</option>
                  <option value="休眠顧客" ${customer.category === '休眠顧客' ? 'selected' : ''}>😴 休眠顧客</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="status">ステータス <span class="required">*</span></label>
                <select id="status" name="status" required>
                  <option value="">選択してください</option>
                  <option value="アクティブ" ${customer.status === 'アクティブ' ? 'selected' : ''}>✅ アクティブ</option>
                  <option value="非アクティブ" ${customer.status === '非アクティブ' ? 'selected' : ''}>⏸️ 非アクティブ</option>
                  <option value="要フォロー" ${customer.status === '要フォロー' ? 'selected' : ''}>📞 要フォロー</option>
                  <option value="契約済み" ${customer.status === '契約済み' ? 'selected' : ''}>✍️ 契約済み</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="lastContact">最終連絡日</label>
                <input type="date" id="lastContact" name="lastContact" value="${customer.lastContact || ''}">
              </div>
              
              <div class="form-group">
                <label for="nextAction">次回アクション予定</label>
                <input type="text" id="nextAction" name="nextAction" value="${customer.nextAction || ''}">
              </div>
              
              <div class="form-group">
                <label for="notes">備考・メモ</label>
                <textarea id="notes" name="notes">${customer.notes || ''}</textarea>
              </div>
              
              <div style="margin-top: 30px;">
                <button type="submit" class="btn">💾 更新を保存</button>
                <a href="/customer/${customer.id}" class="btn btn-secondary">❌ キャンセル</a>
              </div>
            </form>
          </div>
        </div>
        
        <script>
          async function updateCustomer(event) {
            event.preventDefault();
            
            const formData = new FormData(event.target);
            const data = {
              name: formData.get('name'),
              company: formData.get('company'),
              email: formData.get('email'),
              phone: formData.get('phone'),
              category: formData.get('category'),
              status: formData.get('status'),
              lastContact: formData.get('lastContact'),
              nextAction: formData.get('nextAction'),
              notes: formData.get('notes')
            };
            
            try {
              const response = await fetch('/api/customers/${customer.id}', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              });
              
              if (response.ok) {
                alert('顧客情報を更新しました');
                window.location.href = '/customer/${customer.id}';
              } else {
                const error = await response.json();
                alert('更新に失敗しました: ' + error.error.message);
              }
            } catch (error) {
              alert('更新中にエラーが発生しました: ' + error.message);
            }
          }
        </script>
      </body>
      </html>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).send('エラーが発生しました');
  }
});

// 顧客詳細画面 - JSONから動的生成
app.get('/customer/:id', requireAuth, async (req, res) => {
  try {
    const customerId = req.params.id;
    
    // 最新データを同期
    await syncFromFile();
    const jsonData = await getFreshData();
    const customer = jsonData.customers[customerId];
    const correctUserId = req.user.username || req.user.id || 'unknown';
    
    if (!customer || (customer.userId !== req.user.id && customer.userId !== correctUserId && customer.createdBy !== req.user.username)) {
      return res.status(404).send('顧客が見つかりません');
    }
    
    const html = `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${customer.name} - CRMシステム</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f0fdf4; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; margin: -20px -20px 20px -20px; }
          .header h1 { margin: 0; }
          .container { max-width: 800px; margin: 0 auto; }
          .customer-detail { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .field { margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #f3f4f6; }
          .field:last-child { border-bottom: none; }
          .field-label { font-weight: bold; color: #374151; margin-bottom: 5px; }
          .field-value { color: #1f2937; font-size: 16px; }
          .company { font-size: 20px; font-weight: bold; color: #059669; }
          .category, .status { padding: 8px 16px; border-radius: 20px; display: inline-block; }
          .category { background: #d1fae5; color: #047857; }
          .status-active { background: #d1fae5; color: #047857; }
          .status-inactive { background: #f3f4f6; color: #6b7280; }
          .status-follow { background: #fef3c7; color: #d97706; }
          .status-contract { background: #dbeafe; color: #1d4ed8; }
          .btn { background: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px; }
          .btn:hover { background: #059669; }
          .btn-secondary { background: #6b7280; }
          .btn-secondary:hover { background: #4b5563; }
          .btn-warning { background: #d97706; }
          .btn-warning:hover { background: #b45309; }
          .json-source { background: #f9fafb; padding: 10px; border-radius: 4px; margin-top: 10px; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="container">
            <h1>👤 顧客詳細</h1>
          </div>
        </div>
        
        <div class="container">
          <div style="margin-bottom: 20px;">
            <a href="/" class="btn btn-secondary">← 一覧に戻る</a>
            <a href="/edit/${customer.id}" class="btn btn-warning">✏️ 編集</a>
          </div>
          
          <div class="customer-detail">
            <div class="field">
              <div class="field-label">👤 顧客名</div>
              <div class="field-value">${customer.name}</div>
            </div>
            
            <div class="field">
              <div class="field-label">🏢 会社名</div>
              <div class="field-value company">${customer.company}</div>
            </div>
            
            <div class="field">
              <div class="field-label">📧 メールアドレス</div>
              <div class="field-value">
                <a href="mailto:${customer.email}" style="color: #10b981; text-decoration: none;">${customer.email}</a>
              </div>
            </div>
            
            <div class="field">
              <div class="field-label">📞 電話番号</div>
              <div class="field-value">${customer.phone || '未設定'}</div>
            </div>
            
            <div class="field">
              <div class="field-label">📂 カテゴリ</div>
              <div class="field-value">
                <span class="category">${customer.category}</span>
              </div>
            </div>
            
            <div class="field">
              <div class="field-label">📊 ステータス</div>
              <div class="field-value">
                <span class="status ${
                  customer.status === 'アクティブ' ? 'status-active' :
                  customer.status === '非アクティブ' ? 'status-inactive' :
                  customer.status === '要フォロー' ? 'status-follow' :
                  customer.status === '契約済み' ? 'status-contract' : 'status-inactive'
                }">
                  ${customer.status}
                </span>
              </div>
            </div>
            
            <div class="field">
              <div class="field-label">📅 最終連絡日</div>
              <div class="field-value">${customer.lastContact ? new Date(customer.lastContact).toLocaleDateString('ja-JP') : '未記録'}</div>
            </div>
            
            <div class="field">
              <div class="field-label">⏰ 次回アクション予定</div>
              <div class="field-value">${customer.nextAction || '未設定'}</div>
            </div>
            
            <div class="field">
              <div class="field-label">📝 備考・メモ</div>
              <div class="field-value" style="white-space: pre-wrap;">${customer.notes || '未設定'}</div>
            </div>
            
            <div class="field">
              <div class="field-label">👤 登録者</div>
              <div class="field-value">${customer.createdBy}</div>
            </div>
            
            <div class="field">
              <div class="field-label">🕒 登録日時</div>
              <div class="field-value">${new Date(customer.createdAt).toLocaleString('ja-JP')}</div>
            </div>
            
            <div class="field">
              <div class="field-label">🔄 最終更新</div>
              <div class="field-value">${customer.updatedAt ? new Date(customer.updatedAt).toLocaleString('ja-JP') : '未更新'}</div>
            </div>
            
            <div class="field">
              <div class="field-label">🆔 顧客ID</div>
              <div class="field-value" style="font-family: monospace; background: #f9fafb; padding: 4px 8px; border-radius: 4px;">${customer.id}</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).send('エラーが発生しました');
  }
});

// API: 顧客フォーマット取得
app.get('/api/customer-format', (req, res) => {
  res.json({
    success: true,
    format: CUSTOMER_FORMAT,
    categories: CUSTOMER_CATEGORIES,
    statuses: CUSTOMER_STATUSES,
    description: '顧客情報の作成に必要なフィールド一覧',
    example: {
      name: '山田太郎',
      company: '株式会社サンプル',
      email: 'yamada@sample.com',
      phone: '03-1234-5678',
      category: '見込み客',
      status: 'アクティブ',
      notes: '展示会で名刺交換。製品に興味を示している',
      lastContact: '2024-01-15',
      nextAction: '製品デモの提案を次週に実施'
    }
  });
});

// API: JSON エクスポート
app.get('/api/json-export', async (req, res) => {
  try {
    const rawData = await fs.readFile(DATA_FILE_PATH, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="customer_data.json"');
    res.send(rawData);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'EXPORT_ERROR',
        message: 'JSONファイルのエクスポート中にエラーが発生しました'
      }
    });
  }
});

// API: 顧客一覧取得
app.get('/api/customers', requireAuth, async (req, res) => {
  try {
    const { category, status, limit = 20, offset = 0 } = req.query;
    
    // 最新データを同期
    await syncFromFile();
    const jsonData = await getFreshData();
    
    // 改善されたユーザー照合ロジック
    let userData = null;
    let allUserCustomers = [];
    
    // 1. ユーザー名で検索（最優先）
    if (req.user.username && req.user.username !== 'undefined') {
      userData = Object.values(jsonData.users).find(user => 
        user.username === req.user.username && user.id !== 'undefined'
      );
      if (userData) {
        // メインユーザーの顧客を取得
        allUserCustomers = userData.customers
          .map(customerId => jsonData.customers[customerId])
          .filter(Boolean);
      }
    }
    
    // 2. IDで検索（IDが有効な場合）
    if (!userData && req.user.id && req.user.id !== 'undefined') {
      userData = jsonData.users[req.user.id];
      if (userData) {
        allUserCustomers = userData.customers
          .map(customerId => jsonData.customers[customerId])
          .filter(Boolean);
      }
    }
    
    // 3. 同じユーザー名の全ての顧客を統合（undefinedユーザー含む）
    if (userData && req.user.username) {
      Object.values(jsonData.users).forEach(user => {
        if (user.username === req.user.username && user !== userData) {
          const additionalCustomers = user.customers
            .map(customerId => jsonData.customers[customerId])
            .filter(Boolean);
          allUserCustomers = [...allUserCustomers, ...additionalCustomers];
          
          // undefinedユーザーの顧客を正しいユーザーに移動
          if (user.id === 'undefined' && additionalCustomers.length > 0) {
            userData.customers = [...userData.customers, ...user.customers];
            user.customers = []; // undefinedユーザーから顧客を削除
            
            // 顧客のuserIdを修正
            additionalCustomers.forEach(customer => {
              if (jsonData.customers[customer.id]) {
                jsonData.customers[customer.id].userId = userData.id;
                dataStore.customers.set(customer.id, jsonData.customers[customer.id]);
              }
            });
            
            // データ保存
            saveDataToFile();
          }
        }
      });
    }
    
    if (!userData) {
      return res.json({ 
        success: true, 
        customers: [],
        user: req.user.username
      });
    }
    
    // フィルター適用
    let filteredCustomers = allUserCustomers;
    if (category) {
      filteredCustomers = filteredCustomers.filter(c => c.category === category);
    }
    if (status) {
      filteredCustomers = filteredCustomers.filter(c => c.status === status);
    }
    
    const userCustomers = filteredCustomers
      .map(customer => ({
        id: customer.id,
        name: customer.name,
        company: customer.company,
        email: customer.email,
        phone: customer.phone,
        category: customer.category,
        status: customer.status,
        lastContact: customer.lastContact,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt
      }));
    
    res.json({
      success: true,
      customers: userCustomers,
      user: req.user.username,
      filters: { category, status },
      total: userCustomers.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: '顧客一覧の取得中にエラーが発生しました'
      }
    });
  }
});

// API: 顧客詳細取得
app.get('/api/customers/:id', requireAuth, async (req, res) => {
  try {
    const customerId = req.params.id;
    
    // 最新データを同期
    await syncFromFile();
    const jsonData = await getFreshData();
    const customer = jsonData.customers[customerId];
    const correctUserId = req.user.username || req.user.id || 'unknown';
    
    if (!customer || (customer.userId !== req.user.id && customer.userId !== correctUserId && customer.createdBy !== req.user.username)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CUSTOMER_NOT_FOUND',
          message: '指定された顧客が見つかりません'
        }
      });
    }
    
    res.json({
      success: true,
      customer: customer,
      user: req.user.username
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: '顧客詳細の取得中にエラーが発生しました'
      }
    });
  }
});

// API: 顧客作成
app.post('/api/customers', requireAuth, async (req, res) => {
  try {
    const { name, company, email, phone, category, status, notes, lastContact, nextAction } = req.body;
    
    // バリデーション
    if (!name || !company || !email || !category || !status) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: '必須フィールド（name, company, email, category, status）が不足しています'
        }
      });
    }
    
    // メールアドレスの検証
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EMAIL',
          message: '有効なメールアドレスを入力してください'
        }
      });
    }
    
    // カテゴリとステータスの検証
    if (!CUSTOMER_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CATEGORY',
          message: `カテゴリは次のいずれかである必要があります: ${CUSTOMER_CATEGORIES.join(', ')}`
        }
      });
    }
    
    if (!CUSTOMER_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `ステータスは次のいずれかである必要があります: ${CUSTOMER_STATUSES.join(', ')}`
        }
      });
    }
    
    // 顧客作成
    const customerId = `customer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const correctUserId = req.user.username || req.user.id || 'unknown';
    
    const customer = {
      id: customerId,
      name: name.trim(),
      company: company.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || '',
      category: category,
      status: status,
      notes: notes?.trim() || '',
      lastContact: lastContact || new Date().toISOString().split('T')[0],
      nextAction: nextAction?.trim() || '',
      userId: correctUserId, // 確実にuserIdを設定
      createdBy: req.user.username,
      createdAt: new Date().toISOString(),
      updatedAt: null
    };
    
    // メモリ内データ更新
    dataStore.customers.set(customerId, customer);
    
    // ユーザーデータの取得・作成（正しいIDを使用）
    let user = dataStore.users.get(correctUserId);
    if (!user) {
      // ユーザー名で検索してみる
      const existingUser = Array.from(dataStore.users.values()).find(u => 
        u.username === req.user.username && u.id !== 'undefined'
      );
      
      if (existingUser) {
        user = existingUser;
      } else {
        user = {
          id: correctUserId,
          username: req.user.username,
          customers: []
        };
        dataStore.users.set(correctUserId, user);
      }
    }
    
    user.customers.push(customerId);
    
    // JSONファイルに保存
    const saveSuccess = await saveDataToFile();
    
    // HTMLフォームからの送信の場合はリダイレクト
    if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      return res.redirect('/');
    }
    
    // APIレスポンス
    res.status(201).json({
      success: true,
      customerId: customerId,
      customer: customer,
      message: '顧客が登録されました',
      user: req.user.username
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: '顧客登録中にエラーが発生しました'
      }
    });
  }
});

// API: 顧客更新
app.put('/api/customers/:id', requireAuth, async (req, res) => {
  try {
    const customerId = req.params.id;
    const { name, company, email, phone, category, status, notes, lastContact, nextAction } = req.body;
    
    // 現在の顧客を取得
    let customer = dataStore.customers.get(customerId);
    const correctUserId = req.user.username || req.user.id || 'unknown';
    
    if (!customer || (customer.userId !== req.user.id && customer.userId !== correctUserId && customer.createdBy !== req.user.username)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CUSTOMER_NOT_FOUND',
          message: '指定された顧客が見つかりません'
        }
      });
    }
    
    // 更新するフィールドの検証
    const updatedFields = {};
    
    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_NAME', message: '顧客名は必須です' }
        });
      }
      updatedFields.name = name.trim();
    }
    
    if (company !== undefined) {
      if (!company || !company.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_COMPANY', message: '会社名は必須です' }
        });
      }
      updatedFields.company = company.trim();
    }
    
    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_EMAIL', message: '有効なメールアドレスを入力してください' }
        });
      }
      updatedFields.email = email.trim().toLowerCase();
    }
    
    if (phone !== undefined) {
      updatedFields.phone = phone?.trim() || '';
    }
    
    if (category !== undefined) {
      if (!CUSTOMER_CATEGORIES.includes(category)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CATEGORY',
            message: `カテゴリは次のいずれかである必要があります: ${CUSTOMER_CATEGORIES.join(', ')}`
          }
        });
      }
      updatedFields.category = category;
    }
    
    if (status !== undefined) {
      if (!CUSTOMER_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: `ステータスは次のいずれかである必要があります: ${CUSTOMER_STATUSES.join(', ')}`
          }
        });
      }
      updatedFields.status = status;
    }
    
    if (notes !== undefined) {
      updatedFields.notes = notes?.trim() || '';
    }
    
    if (lastContact !== undefined) {
      if (lastContact) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(lastContact)) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_DATE', message: '日付はYYYY-MM-DD形式で入力してください' }
          });
        }
      }
      updatedFields.lastContact = lastContact || null;
    }
    
    if (nextAction !== undefined) {
      updatedFields.nextAction = nextAction?.trim() || '';
    }
    
    // 顧客更新
    const updatedCustomer = {
      ...customer,
      ...updatedFields,
      updatedAt: new Date().toISOString()
    };
    
    // メモリ内データ更新
    dataStore.customers.set(customerId, updatedCustomer);
    
    // JSONファイルに保存
    await saveDataToFile();
    
    res.json({
      success: true,
      customer: updatedCustomer,
      message: '顧客情報が更新されました',
      user: req.user.username
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: '顧客更新中にエラーが発生しました'
      }
    });
  }
});

// API: 顧客削除
app.delete('/api/customers/:id', requireAuth, async (req, res) => {
  try {
    const customerId = req.params.id;
    
    // 顧客の存在確認
    const customer = dataStore.customers.get(customerId);
    const correctUserId = req.user.username || req.user.id || 'unknown';
    
    if (!customer || (customer.userId !== req.user.id && customer.userId !== correctUserId && customer.createdBy !== req.user.username)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CUSTOMER_NOT_FOUND',
          message: '指定された顧客が見つかりません'
        }
      });
    }
    
    // メモリ内データから削除
    dataStore.customers.delete(customerId);
    
    // 複数のユーザーIDパターンから削除を試行
    [req.user.id, correctUserId].forEach(userId => {
      if (userId) {
        const user = dataStore.users.get(userId);
        if (user) {
          user.customers = user.customers.filter(id => id !== customerId);
        }
      }
    });
    
    // JSONファイルに保存
    await saveDataToFile();
    
    res.json({
      success: true,
      customerId: customerId,
      customer: customer,
      message: '顧客が削除されました',
      user: req.user.username
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: '顧客削除中にエラーが発生しました'
      }
    });
  }
});

// エラーハンドリング
app.use((err, req, res, next) => {
  console.error('エラー:', err.message);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'サーバー内部エラーが発生しました'
    }
  });
});

// 404ハンドリング
app.use((req, res) => {
  res.status(404).send(`
    <html>
      <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px;">
        <h1>404 - ページが見つかりません</h1>
        <p><a href="/">ホームに戻る</a></p>
      </body>
    </html>
  `);
});

// サーバー起動時の初期化
async function initializeServer() {
  // JSONファイルからデータを読み込み
  const loadResult = await loadDataFromFile();
  
  // サーバー起動
  app.listen(PORT, () => {
    console.log(`🚀 CRM（顧客関係管理）システムが起動しました: http://localhost:${PORT}`);
    console.log(`📋 OAuth認証: ${OAUTH_CONFIG.baseUrl}/oauth/...`);
    console.log(`📁 JSONファイル: ${DATA_FILE_PATH}`);
    console.log(`🔐 認証方式: Session Cookie認証 + Bearer Token認証`);
    console.log(`📊 対応カテゴリ: ${CUSTOMER_CATEGORIES.join(', ')}`);
    console.log(`📈 対応ステータス: ${CUSTOMER_STATUSES.join(', ')}`);
  });
}

// サーバー初期化実行
initializeServer().catch(error => {
  console.error('❌ サーバー初期化エラー:', error);
  process.exit(1);
});