import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

// .env_demoファイルを読み込み
dotenv.config({ path: '.env_demo' });

const app = express();
const PORT = process.env.PORT || 3552;

// JSONファイルのパス
const DATA_FILE_PATH = path.join(process.cwd(), 'expense_reports.json');

// ミドルウェア設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OAuth設定（.env_demoから読み込み）
const OAUTH_CONFIG = {
  baseUrl: process.env.OAUTH_BASE_URL || 'http://localhost:3000',
  clientId: process.env.OAUTH_CLIENT_ID || 'oneagent-default-client',
  clientSecret: process.env.OAUTH_CLIENT_SECRET || 'demo-secret-key',
  redirectUri: process.env.OAUTH_REDIRECT_URI || 'http://localhost:3552/oauth/callback',
  scope: process.env.OAUTH_SCOPE || 'read write',
  userInfoEndpoint: process.env.OAUTH_USER_INFO_ENDPOINT || '/oauth/userinfo'
};

// メモリ内データストア（デモ用）
const dataStore = {
  users: new Map(),
  reports: new Map(),
  sessions: new Map()
};

// レポートフォーマット定義
const REPORT_FORMAT = {
  title: 'string',
  date: 'YYYY-MM-DD',
  category: 'string',
  amount: 'number',
  description: 'string',
  receipt: 'boolean'
};

// JSONファイル操作関数（同期機能強化）
async function loadDataFromFile() {
  try {
    const data = await fs.readFile(DATA_FILE_PATH, 'utf8');
    const jsonData = JSON.parse(data);
    
    // Mapをクリア
    dataStore.users.clear();
    dataStore.reports.clear();
    
    // Mapに変換
    if (jsonData.users) {
      Object.entries(jsonData.users).forEach(([key, value]) => {
        dataStore.users.set(key, value);
      });
    }
    
    if (jsonData.reports) {
      Object.entries(jsonData.reports).forEach(([key, value]) => {
        dataStore.reports.set(key, value);
      });
    }
    
    return jsonData;
  } catch (error) {
    if (error.code === 'ENOENT') {
      await saveDataToFile();
      return { users: {}, reports: {}, metadata: { totalUsers: 0, totalReports: 0 } };
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
      reports: Object.fromEntries(dataStore.reports),
      lastUpdated: new Date().toISOString(),
      metadata: {
        totalUsers: dataStore.users.size,
        totalReports: dataStore.reports.size,
        version: '1.0.0'
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
    dataStore.reports.clear();
    
    if (jsonData.users) {
      Object.entries(jsonData.users).forEach(([key, value]) => {
        dataStore.users.set(key, value);
      });
    }
    
    if (jsonData.reports) {
      Object.entries(jsonData.reports).forEach(([key, value]) => {
        dataStore.reports.set(key, value);
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
    return { users: {}, reports: {}, metadata: { totalUsers: 0, totalReports: 0 } };
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
        'User-Agent': 'ExpenseAPI/1.0.0'
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
            reports: []
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
        reports: []
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

// メイン画面（レポート一覧）- JSONから動的生成
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
    let allUserReports = [];
    
    // 1. ユーザー名で検索（最優先）
    if (session.user.username && session.user.username !== 'undefined') {
      userData = Object.values(jsonData.users).find(user => 
        user.username === session.user.username && user.id !== 'undefined'
      );
      if (userData) {
        // メインユーザーのレポートを取得
        allUserReports = userData.reports
          .map(reportId => jsonData.reports[reportId])
          .filter(Boolean);
      }
    }
    
    // 2. IDで検索（IDが有効な場合）
    if (!userData && session.user.id && session.user.id !== 'undefined') {
      userData = jsonData.users[session.user.id];
      if (userData) {
        allUserReports = userData.reports
          .map(reportId => jsonData.reports[reportId])
          .filter(Boolean);
      }
    }
    
    // 3. 同じユーザー名の全てのレポートを統合（undefinedユーザー含む）
    if (userData && session.user.username) {
      Object.values(jsonData.users).forEach(user => {
        if (user.username === session.user.username && user !== userData) {
          const additionalReports = user.reports
            .map(reportId => jsonData.reports[reportId])
            .filter(Boolean);
          allUserReports = [...allUserReports, ...additionalReports];
          
          // undefinedユーザーのレポートを正しいユーザーに移動
          if (user.id === 'undefined' && additionalReports.length > 0) {
            userData.reports = [...userData.reports, ...user.reports];
            user.reports = []; // undefinedユーザーからレポートを削除
            
            // レポートのuserIdを修正
            additionalReports.forEach(report => {
              if (jsonData.reports[report.id]) {
                jsonData.reports[report.id].userId = userData.id;
                dataStore.reports.set(report.id, jsonData.reports[report.id]);
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
        reports: []
      };
      
      dataStore.users.set(correctUserId, userData);
    }
    
    // 5. データクリーンアップとJSONファイル保存
    if (jsonData.users['undefined'] && jsonData.users['undefined'].reports.length === 0) {
      delete jsonData.users['undefined'];
      dataStore.users.delete('undefined');
      await saveDataToFile();
    } else if (userData && allUserReports.some(r => r.userId !== userData.id)) {
      await saveDataToFile();
    }
    
    // ユーザーのレポートを取得（統合されたレポート一覧を使用）
    const userReports = allUserReports
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  const html = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>経費管理システム</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; margin: -20px -20px 20px -20px; }
        .header h1 { margin: 0; }
        .user-info { float: right; }
        .container { max-width: 1200px; margin: 0 auto; }
        .actions { margin-bottom: 20px; }
        .btn { background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px; border: none; cursor: pointer; }
        .btn:hover { background: #5a67d8; }
        .btn-secondary { background: #718096; }
        .btn-secondary:hover { background: #4a5568; }
        .btn-success { background: #38a169; }
        .btn-success:hover { background: #2f855a; }
        .btn-warning { background: #d69e2e; }
        .btn-warning:hover { background: #b7791f; }
        .btn-danger { background: #e53e3e; }
        .btn-danger:hover { background: #c53030; }
        .report-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .report-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .report-card h3 { margin-top: 0; color: #2d3748; }
        .report-meta { color: #718096; font-size: 14px; margin-bottom: 10px; }
        .amount { font-size: 18px; font-weight: bold; color: #38a169; }
        .category { background: #edf2f7; padding: 4px 8px; border-radius: 4px; font-size: 12px; display: inline-block; }
        .no-reports { text-align: center; padding: 40px; color: #718096; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat-card { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; color: #667eea; }
        .stat-label { color: #718096; font-size: 14px; margin-top: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="container">
          <div class="user-info">
            ようこそ、${session.user.username}さん | <a href="/logout" style="color: white;">ログアウト</a>
          </div>
          <h1>💼 経費管理システム</h1>
        </div>
      </div>
      
      <div class="container">
        <div class="actions">
          <a href="/create" class="btn">📝 新しいレポートを作成</a>
          <a href="/api/report-format" class="btn btn-secondary">📋 レポートフォーマット</a>
          <a href="/json-data" class="btn btn-success">📄 JSON データ表示</a>
          <a href="/api/json-export" class="btn btn-secondary">💾 JSON エクスポート</a>
        </div>
        
        <div class="stats">
          <div class="stat-card">
            <div class="stat-value">${userReports.length}</div>
            <div class="stat-label">総レポート数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">¥${userReports.reduce((sum, r) => sum + r.amount, 0).toLocaleString()}</div>
            <div class="stat-label">総金額</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${userReports.filter(r => r.receipt).length}</div>
            <div class="stat-label">領収書あり</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${jsonData.metadata?.totalReports || 0}</div>
            <div class="stat-label">システム全体</div>
          </div>
        </div>
        
        <h2>📊 経費レポート一覧 (${userReports.length}件)</h2>
        
        ${userReports.length === 0 ? `
          <div class="no-reports">
            <h3>まだレポートがありません</h3>
            <p>新しいレポートを作成してください</p>
          </div>
        ` : `
          <div class="report-grid">
            ${userReports.map(report => `
              <div class="report-card">
                <h3><a href="/report/${report.id}" style="text-decoration: none; color: #2d3748;">${report.title}</a></h3>
                <div class="report-meta">
                  📅 ${report.date} | 👤 ${report.createdBy} | 🆔 ${report.id.split('_')[1]}
                </div>
                <div class="category">${report.category}</div>
                <div class="amount">¥${report.amount.toLocaleString()}</div>
                <p style="color: #4a5568; margin: 10px 0;">${report.description}</p>
                <div style="margin-top: 15px;">
                  <a href="/report/${report.id}" class="btn" style="font-size: 12px; padding: 6px 12px;">詳細を見る</a>
                  <a href="/edit/${report.id}" class="btn btn-warning" style="font-size: 12px; padding: 6px 12px;">編集</a>
                  <button onclick="deleteReport('${report.id}')" class="btn btn-danger" style="font-size: 12px; padding: 6px 12px;">削除</button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
      
      <script>
        async function deleteReport(reportId) {
          if (!confirm('このレポートを削除しますか？')) return;
          
          try {
            const response = await fetch('/api/reports/' + reportId, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
              alert('レポートを削除しました');
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
        <title>JSON データ表示 - 経費管理システム</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; margin: -20px -20px 20px -20px; }
          .header h1 { margin: 0; }
          .container { max-width: 1200px; margin: 0 auto; }
          .btn { background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px; border: none; cursor: pointer; }
          .btn:hover { background: #5a67d8; }
          .btn-secondary { background: #718096; }
          .btn-secondary:hover { background: #4a5568; }
          .json-container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
          .json-code { background: #2d3748; color: #e2e8f0; padding: 20px; border-radius: 8px; overflow-x: auto; font-family: 'Courier New', monospace; white-space: pre-wrap; max-height: 600px; overflow-y: auto; }
          .metadata { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
          .metadata-card { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
          .metadata-value { font-size: 24px; font-weight: bold; color: #667eea; }
          .metadata-label { color: #718096; font-size: 14px; margin-top: 5px; }
          .download-section { background: #edf2f7; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
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
            <a href="/api/json-export" class="btn" download="expense_reports.json">💾 JSONファイルをダウンロード</a>
            <button onclick="refreshData()" class="btn">🔄 データ更新</button>
          </div>
          
          <div class="metadata">
            <div class="metadata-card">
              <div class="metadata-value">${jsonData.metadata?.totalUsers || 0}</div>
              <div class="metadata-label">総ユーザー数</div>
            </div>
            <div class="metadata-card">
              <div class="metadata-value">${jsonData.metadata?.totalReports || 0}</div>
              <div class="metadata-label">総レポート数</div>
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

// レポート作成画面
app.get('/create', requireAuth, (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>新しいレポートを作成 - 経費管理システム</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; margin: -20px -20px 20px -20px; }
        .header h1 { margin: 0; }
        .container { max-width: 800px; margin: 0 auto; }
        .form-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #2d3748; }
        input, select, textarea { width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 4px; box-sizing: border-box; }
        textarea { height: 100px; resize: vertical; }
        .btn { background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px; border: none; cursor: pointer; }
        .btn:hover { background: #5a67d8; }
        .btn-secondary { background: #718096; }
        .btn-secondary:hover { background: #4a5568; }
        .checkbox-group { display: flex; align-items: center; }
        .checkbox-group input { width: auto; margin-right: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="container">
          <h1>📝 新しいレポートを作成</h1>
        </div>
      </div>
      
      <div class="container">
        <div class="form-container">
          <form action="/api/reports" method="POST">
            <div class="form-group">
              <label for="title">タイトル *</label>
              <input type="text" id="title" name="title" required placeholder="例：出張経費レポート - 東京">
            </div>
            
            <div class="form-group">
              <label for="date">経費発生日 *</label>
              <input type="date" id="date" name="date" required>
            </div>
            
            <div class="form-group">
              <label for="category">カテゴリ *</label>
              <select id="category" name="category" required>
                <option value="">選択してください</option>
                <option value="交通費">🚗 交通費</option>
                <option value="食費">🍽️ 食費</option>
                <option value="宿泊費">🏨 宿泊費</option>
                <option value="その他">📝 その他</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="amount">金額 (円) *</label>
              <input type="number" id="amount" name="amount" required min="0" placeholder="例：5000">
            </div>
            
            <div class="form-group">
              <label for="description">詳細説明 *</label>
              <textarea id="description" name="description" required placeholder="経費の詳細を記入してください"></textarea>
            </div>
            
            <div class="form-group">
              <div class="checkbox-group">
                <input type="checkbox" id="receipt" name="receipt" value="true">
                <label for="receipt">領収書あり</label>
              </div>
            </div>
            
            <div style="margin-top: 30px;">
              <button type="submit" class="btn">💾 レポートを作成</button>
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

// レポート編集画面 - JSONから動的生成
app.get('/edit/:id', requireAuth, async (req, res) => {
  try {
    const reportId = req.params.id;
    
    // 最新データを同期
    await syncFromFile();
    const jsonData = await getFreshData();
    const report = jsonData.reports[reportId];
    const correctUserId = req.user.username || req.user.id || 'unknown';
    
    if (!report || (report.userId !== req.user.id && report.userId !== correctUserId && report.createdBy !== req.user.username)) {
      return res.status(404).send('レポートが見つかりません');
    }
    
    const html = `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>レポート編集 - ${report.title}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; margin: -20px -20px 20px -20px; }
          .header h1 { margin: 0; }
          .container { max-width: 800px; margin: 0 auto; }
          .form-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .form-group { margin-bottom: 20px; }
          label { display: block; margin-bottom: 5px; font-weight: bold; color: #2d3748; }
          input, select, textarea { width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 4px; box-sizing: border-box; }
          textarea { height: 100px; resize: vertical; }
          .btn { background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px; border: none; cursor: pointer; }
          .btn:hover { background: #5a67d8; }
          .btn-secondary { background: #718096; }
          .btn-secondary:hover { background: #4a5568; }
          .checkbox-group { display: flex; align-items: center; }
          .checkbox-group input { width: auto; margin-right: 10px; }
          .report-info { background: #edf2f7; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="container">
            <h1>✏️ レポート編集</h1>
          </div>
        </div>
        
        <div class="container">
          <div style="margin-bottom: 20px;">
            <a href="/" class="btn btn-secondary">← 一覧に戻る</a>
            <a href="/report/${report.id}" class="btn btn-secondary">👀 詳細を見る</a>
          </div>
          
          <div class="report-info">
            <h3>📋 編集対象レポート</h3>
            <p><strong>ID:</strong> ${report.id}</p>
            <p><strong>作成日:</strong> ${new Date(report.createdAt).toLocaleString('ja-JP')}</p>
            <p><strong>作成者:</strong> ${report.createdBy}</p>
          </div>
          
          <div class="form-container">
            <form onsubmit="updateReport(event)">
              <div class="form-group">
                <label for="title">タイトル *</label>
                <input type="text" id="title" name="title" required value="${report.title}">
              </div>
              
              <div class="form-group">
                <label for="date">経費発生日 *</label>
                <input type="date" id="date" name="date" required value="${report.date}">
              </div>
              
              <div class="form-group">
                <label for="category">カテゴリ *</label>
                <select id="category" name="category" required>
                  <option value="">選択してください</option>
                  <option value="交通費" ${report.category === '交通費' ? 'selected' : ''}>🚗 交通費</option>
                  <option value="食費" ${report.category === '食費' ? 'selected' : ''}>🍽️ 食費</option>
                  <option value="宿泊費" ${report.category === '宿泊費' ? 'selected' : ''}>🏨 宿泊費</option>
                  <option value="その他" ${report.category === 'その他' ? 'selected' : ''}>📝 その他</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="amount">金額 (円) *</label>
                <input type="number" id="amount" name="amount" required min="0" value="${report.amount}">
              </div>
              
              <div class="form-group">
                <label for="description">詳細説明 *</label>
                <textarea id="description" name="description" required>${report.description}</textarea>
              </div>
              
              <div class="form-group">
                <div class="checkbox-group">
                  <input type="checkbox" id="receipt" name="receipt" value="true" ${report.receipt ? 'checked' : ''}>
                  <label for="receipt">領収書あり</label>
                </div>
              </div>
              
              <div style="margin-top: 30px;">
                <button type="submit" class="btn">💾 更新を保存</button>
                <a href="/report/${report.id}" class="btn btn-secondary">❌ キャンセル</a>
              </div>
            </form>
          </div>
        </div>
        
        <script>
          async function updateReport(event) {
            event.preventDefault();
            
            const formData = new FormData(event.target);
            const data = {
              title: formData.get('title'),
              date: formData.get('date'),
              category: formData.get('category'),
              amount: parseInt(formData.get('amount')),
              description: formData.get('description'),
              receipt: formData.get('receipt') === 'true'
            };
            
            try {
              const response = await fetch('/api/reports/${report.id}', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              });
              
              if (response.ok) {
                alert('レポートを更新しました');
                window.location.href = '/report/${report.id}';
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

// レポート詳細画面 - JSONから動的生成
app.get('/report/:id', requireAuth, async (req, res) => {
  try {
    const reportId = req.params.id;
    
    // 最新データを同期
    await syncFromFile();
    const jsonData = await getFreshData();
    const report = jsonData.reports[reportId];
    const correctUserId = req.user.username || req.user.id || 'unknown';
    
    if (!report || (report.userId !== req.user.id && report.userId !== correctUserId && report.createdBy !== req.user.username)) {
      return res.status(404).send('レポートが見つかりません');
    }
    
    const html = `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${report.title} - 経費管理システム</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; margin: -20px -20px 20px -20px; }
          .header h1 { margin: 0; }
          .container { max-width: 800px; margin: 0 auto; }
          .report-detail { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .field { margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #edf2f7; }
          .field:last-child { border-bottom: none; }
          .field-label { font-weight: bold; color: #4a5568; margin-bottom: 5px; }
          .field-value { color: #2d3748; font-size: 16px; }
          .amount { font-size: 24px; font-weight: bold; color: #38a169; }
          .category { background: #edf2f7; padding: 8px 16px; border-radius: 20px; display: inline-block; }
          .btn { background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px; }
          .btn:hover { background: #5a67d8; }
          .btn-secondary { background: #718096; }
          .btn-secondary:hover { background: #4a5568; }
          .btn-warning { background: #d69e2e; }
          .btn-warning:hover { background: #b7791f; }
          .receipt-status { padding: 6px 12px; border-radius: 4px; font-size: 14px; display: inline-block; }
          .receipt-yes { background: #c6f6d5; color: #22543d; }
          .receipt-no { background: #fed7d7; color: #742a2a; }
          .json-source { background: #f7fafc; padding: 10px; border-radius: 4px; margin-top: 10px; font-size: 12px; color: #718096; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="container">
            <h1>📄 レポート詳細</h1>
          </div>
        </div>
        
        <div class="container">
          <div style="margin-bottom: 20px;">
            <a href="/" class="btn btn-secondary">← 一覧に戻る</a>
            <a href="/edit/${report.id}" class="btn btn-warning">✏️ 編集</a>
          </div>
          
          <div class="report-detail">
            <div class="field">
              <div class="field-label">📝 タイトル</div>
              <div class="field-value">${report.title}</div>
            </div>
            
            <div class="field">
              <div class="field-label">📅 経費発生日</div>
              <div class="field-value">${report.date}</div>
            </div>
            
            <div class="field">
              <div class="field-label">📂 カテゴリ</div>
              <div class="field-value">
                <span class="category">${report.category}</span>
              </div>
            </div>
            
            <div class="field">
              <div class="field-label">💰 金額</div>
              <div class="field-value amount">¥${report.amount.toLocaleString()}</div>
            </div>
            
            <div class="field">
              <div class="field-label">📋 詳細説明</div>
              <div class="field-value">${report.description}</div>
            </div>
            
            <div class="field">
              <div class="field-label">🧾 領収書</div>
              <div class="field-value">
                <span class="receipt-status ${report.receipt ? 'receipt-yes' : 'receipt-no'}">
                  ${report.receipt ? '✅ あり' : '❌ なし'}
                </span>
              </div>
            </div>
            
            <div class="field">
              <div class="field-label">👤 作成者</div>
              <div class="field-value">${report.createdBy}</div>
            </div>
            
            <div class="field">
              <div class="field-label">🕒 作成日時</div>
              <div class="field-value">${new Date(report.createdAt).toLocaleString('ja-JP')}</div>
            </div>
            
            <div class="field">
              <div class="field-label">🔄 最終更新</div>
              <div class="field-value">${report.updatedAt ? new Date(report.updatedAt).toLocaleString('ja-JP') : '未更新'}</div>
            </div>
            
            <div class="field">
              <div class="field-label">🆔 レポートID</div>
              <div class="field-value" style="font-family: monospace; background: #f7fafc; padding: 4px 8px; border-radius: 4px;">${report.id}</div>
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

// API: レポートフォーマット取得
app.get('/api/report-format', (req, res) => {
  res.json({
    success: true,
    format: REPORT_FORMAT,
    description: '経費レポートの作成に必要なフィールド一覧',
    example: {
      title: '出張経費レポート - 大阪',
      date: '2024-01-15',
      category: '交通費',
      amount: 15000,
      description: '新幹線往復料金（東京-大阪）',
      receipt: true
    }
  });
});

// API: JSON エクスポート
app.get('/api/json-export', async (req, res) => {
  try {
    const rawData = await fs.readFile(DATA_FILE_PATH, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="expense_reports.json"');
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

// API: レポート一覧取得
app.get('/api/reports', requireAuth, async (req, res) => {
  try {
    // 最新データを同期
    await syncFromFile();
    const jsonData = await getFreshData();
    
    // 改善されたユーザー照合ロジック
    let userData = null;
    let allUserReports = [];
    
    // 1. ユーザー名で検索（最優先）
    if (req.user.username && req.user.username !== 'undefined') {
      userData = Object.values(jsonData.users).find(user => 
        user.username === req.user.username && user.id !== 'undefined'
      );
      if (userData) {
        // メインユーザーのレポートを取得
        allUserReports = userData.reports
          .map(reportId => jsonData.reports[reportId])
          .filter(Boolean);
      }
    }
    
    // 2. IDで検索（IDが有効な場合）
    if (!userData && req.user.id && req.user.id !== 'undefined') {
      userData = jsonData.users[req.user.id];
      if (userData) {
        allUserReports = userData.reports
          .map(reportId => jsonData.reports[reportId])
          .filter(Boolean);
      }
    }
    
    // 3. 同じユーザー名の全てのレポートを統合（undefinedユーザー含む）
    if (userData && req.user.username) {
      Object.values(jsonData.users).forEach(user => {
        if (user.username === req.user.username && user !== userData) {
          const additionalReports = user.reports
            .map(reportId => jsonData.reports[reportId])
            .filter(Boolean);
          allUserReports = [...allUserReports, ...additionalReports];
          
          // undefinedユーザーのレポートを正しいユーザーに移動
          if (user.id === 'undefined' && additionalReports.length > 0) {
            userData.reports = [...userData.reports, ...user.reports];
            user.reports = []; // undefinedユーザーからレポートを削除
            
            // レポートのuserIdを修正
            additionalReports.forEach(report => {
              if (jsonData.reports[report.id]) {
                jsonData.reports[report.id].userId = userData.id;
                dataStore.reports.set(report.id, jsonData.reports[report.id]);
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
        reports: [],
        user: req.user.username
      });
    }
    
    const userReports = allUserReports
      .map(report => ({
        id: report.id,
        title: report.title,
        date: report.date,
        category: report.category,
        amount: report.amount,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt
      }));
    
    res.json({
      success: true,
      reports: userReports,
      user: req.user.username
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'レポート一覧の取得中にエラーが発生しました'
      }
    });
  }
});

// API: レポート詳細取得
app.get('/api/reports/:id', requireAuth, async (req, res) => {
  try {
    const reportId = req.params.id;
    
    // 最新データを同期
    await syncFromFile();
    const jsonData = await getFreshData();
    const report = jsonData.reports[reportId];
    const correctUserId = req.user.username || req.user.id || 'unknown';
    
    if (!report || (report.userId !== req.user.id && report.userId !== correctUserId && report.createdBy !== req.user.username)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REPORT_NOT_FOUND',
          message: '指定されたレポートが見つかりません'
        }
      });
    }
    
    res.json({
      success: true,
      report: report,
      user: req.user.username
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'レポート詳細の取得中にエラーが発生しました'
      }
    });
  }
});

// API: レポート作成
app.post('/api/reports', requireAuth, async (req, res) => {
  try {
    const { title, date, category, amount, description, receipt } = req.body;
    
    // バリデーション
    if (!title || !date || !category || !amount || !description) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: '必須フィールドが不足しています'
        }
      });
    }
    
    // レポート作成
    const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const correctUserId = req.user.username || req.user.id || 'unknown';
    
    const report = {
      id: reportId,
      title: title,
      date: date,
      category: category,
      amount: parseInt(amount),
      description: description,
      receipt: receipt === 'true' || receipt === true,
      userId: correctUserId, // 確実にuserIdを設定
      createdBy: req.user.username,
      createdAt: new Date().toISOString(),
      updatedAt: null
    };
    
    // メモリ内データ更新
    dataStore.reports.set(reportId, report);
    
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
          reports: []
        };
        dataStore.users.set(correctUserId, user);
      }
    }
    
    user.reports.push(reportId);
    
    // JSONファイルに保存
    const saveSuccess = await saveDataToFile();
    
    // HTMLフォームからの送信の場合はリダイレクト
    if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      return res.redirect('/');
    }
    
    // APIレスポンス
    res.status(201).json({
      success: true,
      reportId: reportId,
      report: report,
      message: 'レポートが作成されました',
      user: req.user.username
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'レポート作成中にエラーが発生しました'
      }
    });
  }
});

// API: レポート更新
app.put('/api/reports/:id', requireAuth, async (req, res) => {
  try {
    const reportId = req.params.id;
    const { title, date, category, amount, description, receipt } = req.body;
    
    // 現在のレポートを取得
    let report = dataStore.reports.get(reportId);
    const correctUserId = req.user.username || req.user.id || 'unknown';
    
    if (!report || (report.userId !== req.user.id && report.userId !== correctUserId && report.createdBy !== req.user.username)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REPORT_NOT_FOUND',
          message: '指定されたレポートが見つかりません'
        }
      });
    }
    
    // バリデーション
    if (!title || !date || !category || !amount || !description) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: '必須フィールドが不足しています'
        }
      });
    }
    
    // レポート更新
    const updatedReport = {
      ...report,
      title: title,
      date: date,
      category: category,
      amount: parseInt(amount),
      description: description,
      receipt: receipt === true || receipt === 'true',
      updatedAt: new Date().toISOString()
    };
    
    // メモリ内データ更新
    dataStore.reports.set(reportId, updatedReport);
    
    // JSONファイルに保存
    await saveDataToFile();
    
    res.json({
      success: true,
      report: updatedReport,
      message: 'レポートが更新されました',
      user: req.user.username
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'レポート更新中にエラーが発生しました'
      }
    });
  }
});

// API: レポート削除
app.delete('/api/reports/:id', requireAuth, async (req, res) => {
  try {
    const reportId = req.params.id;
    
    // レポートの存在確認
    const report = dataStore.reports.get(reportId);
    const correctUserId = req.user.username || req.user.id || 'unknown';
    
    if (!report || (report.userId !== req.user.id && report.userId !== correctUserId && report.createdBy !== req.user.username)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REPORT_NOT_FOUND',
          message: '指定されたレポートが見つかりません'
        }
      });
    }
    
    // メモリ内データから削除
    dataStore.reports.delete(reportId);
    
    // 複数のユーザーIDパターンから削除を試行
    [req.user.id, correctUserId].forEach(userId => {
      if (userId) {
        const user = dataStore.users.get(userId);
        if (user) {
          user.reports = user.reports.filter(id => id !== reportId);
        }
      }
    });
    
    // JSONファイルに保存
    await saveDataToFile();
    
    res.json({
      success: true,
      reportId: reportId,
      message: 'レポートが削除されました',
      user: req.user.username
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'レポート削除中にエラーが発生しました'
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
    console.log(`🚀 経費管理システムが起動しました: http://localhost:${PORT}`);
    console.log(`📋 OAuth認証: ${OAUTH_CONFIG.baseUrl}/oauth/...`);
    console.log(`📁 JSONファイル: ${DATA_FILE_PATH}`);
    console.log(`🔐 認証方式: Session Cookie認証 + Bearer Token認証`);
  });
}

// サーバー初期化実行
initializeServer().catch(error => {
  console.error('❌ サーバー初期化エラー:', error);
  process.exit(1);
});