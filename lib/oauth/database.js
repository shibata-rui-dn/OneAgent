/**
 * OAuth 2.0 データベース管理 (デッドロック修正版)
 * 同期的なトークン検証メソッドを追加してブロッキングを回避
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config/config.js';

/**
 * OAuth 2.0 Database Manager（デッドロック修正版）
 */
export class OAuthDatabase {
  constructor() {
    this.users = new Map();
    this.tokens = new Map();
    this.authCodes = new Map();
    this.clients = new Map();
    this.refreshTokens = new Map();
    
    // デフォルトクライアント登録
    this.registerDefaultClient();
  }

  /**
   * 初期化とデータ読み込み
   */
  async initialize() {
    try {
      // データディレクトリの作成
      const dataDir = path.dirname(CONFIG.OAUTH.USERS_DB_PATH);
      if (!existsSync(dataDir)) {
        await fs.mkdir(dataDir, { recursive: true });
      }

      // データベースファイルの読み込み
      await this.loadUsers();
      await this.loadTokens();
      
      console.log('✅ OAuth データベースを初期化しました');
      console.log(`   ユーザー数: ${this.users.size}`);
      console.log(`   アクティブトークン数: ${this.tokens.size}`);
      
    } catch (error) {
      console.error('❌ OAuth データベース初期化エラー:', error);
      throw error;
    }
  }

  /**
   * デフォルトクライアントの登録
   */
  registerDefaultClient() {
    const client = {
      id: CONFIG.OAUTH.CLIENT_ID,
      secret: CONFIG.OAUTH.CLIENT_SECRET,
      name: 'OneAgent Default Client',
      redirectUris: CONFIG.OAUTH.REDIRECT_URIS,
      scopes: CONFIG.OAUTH.SUPPORTED_SCOPES,
      type: 'public',
      createdAt: new Date().toISOString()
    };

    this.clients.set(CONFIG.OAUTH.CLIENT_ID, client);
  }

  /**
   * ユーザーデータの読み込み
   */
  async loadUsers() {
    try {
      if (existsSync(CONFIG.OAUTH.USERS_DB_PATH)) {
        const usersData = await fs.readFile(CONFIG.OAUTH.USERS_DB_PATH, 'utf8');
        const users = JSON.parse(usersData);
        
        for (const [key, value] of Object.entries(users)) {
          this.users.set(key, value);
        }
        
        console.log(`📖 ${this.users.size}人のユーザーを読み込みました`);
      } else {
        // デフォルトユーザーを作成
        await this.createDefaultUsers();
      }
    } catch (error) {
      console.error('ユーザーデータ読み込みエラー:', error);
      await this.createDefaultUsers();
    }
  }

  /**
   * トークンデータの読み込み
   */
  async loadTokens() {
    try {
      if (existsSync(CONFIG.OAUTH.TOKENS_DB_PATH)) {
        const tokensData = await fs.readFile(CONFIG.OAUTH.TOKENS_DB_PATH, 'utf8');
        const tokens = JSON.parse(tokensData);
        
        // 期限切れトークンを除外
        const now = Date.now();
        for (const [key, value] of Object.entries(tokens)) {
          if (new Date(value.expiresAt).getTime() > now) {
            this.tokens.set(key, value);
          }
        }
        
        console.log(`📖 ${this.tokens.size}個のアクティブトークンを読み込みました`);
      }
    } catch (error) {
      console.error('トークンデータ読み込みエラー:', error);
    }
  }

  /**
   * ユーザーデータの保存（非同期処理を同期化）
   */
  async saveUsers() {
    try {
      const usersObj = Object.fromEntries(this.users);
      await fs.writeFile(
        CONFIG.OAUTH.USERS_DB_PATH, 
        JSON.stringify(usersObj, null, 2)
      );
    } catch (error) {
      console.error('ユーザーデータ保存エラー:', error);
      throw error;
    }
  }

  /**
   * トークンデータの保存（非同期処理を同期化）
   */
  async saveTokens() {
    try {
      const tokensObj = Object.fromEntries(this.tokens);
      await fs.writeFile(
        CONFIG.OAUTH.TOKENS_DB_PATH, 
        JSON.stringify(tokensObj, null, 2)
      );
    } catch (error) {
      console.error('トークンデータ保存エラー:', error);
      throw error;
    }
  }

  /**
   * デフォルトユーザーの作成（修正版）
   */
  async createDefaultUsers() {
    try {
      console.log('🔧 デフォルトユーザーを作成中...');

      const defaultUsers = [
        {
          id: 'admin',
          username: 'admin',
          email: 'admin@oneagent.local',
          password: await bcrypt.hash('admin123', 12),
          roles: ['admin', 'user'],
          scopes: ['read', 'write', 'admin'],
          profile: {
            displayName: '管理者',
            avatar: null,
            department: 'IT',
            position: 'Administrator'
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          active: true,
          emailVerified: true,
          lastLoginAt: null,
          loginCount: 0
        },
        {
          id: 'demo',
          username: 'demo',
          email: 'demo@oneagent.local', 
          password: await bcrypt.hash('demo123', 12),
          roles: ['user'],
          scopes: ['read', 'write'],
          profile: {
            displayName: 'デモユーザー',
            avatar: null,
            department: 'General',
            position: 'User'
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          active: true,
          emailVerified: true,
          lastLoginAt: null,
          loginCount: 0
        }
      ];

      // ユーザーを順次作成
      for (const user of defaultUsers) {
        this.users.set(user.id, user);
        console.log(`👤 ユーザー作成: ${user.username} (${user.id})`);
      }

      await this.saveUsers();
      
      console.log('✅ デフォルトユーザーを作成しました:');
      console.log('   👤 admin / admin123 (管理者)');
      console.log('   👤 demo / demo123 (一般ユーザー)');

    } catch (error) {
      console.error('❌ デフォルトユーザー作成エラー:', error);
      throw error;
    }
  }

  // ===== ユーザー管理 =====

  /**
   * 新規ユーザー作成
   */
  async createUser(userData) {
    const userId = userData.username;
    
    if (this.users.has(userId)) {
      throw new Error('ユーザーが既に存在します');
    }

    // メールアドレスの重複チェック
    const existingUser = Array.from(this.users.values())
      .find(u => u.email === userData.email);
    if (existingUser) {
      throw new Error('このメールアドレスは既に使用されています');
    }

    // パスワードの強度チェック
    if (userData.password.length < 8) {
      throw new Error('パスワードは8文字以上である必要があります');
    }

    const hashedPassword = await bcrypt.hash(userData.password, 12);
    const user = {
      id: userId,
      username: userData.username,
      email: userData.email,
      password: hashedPassword,
      roles: userData.roles || ['user'],
      scopes: userData.scopes || ['read', 'write'],
      profile: {
        displayName: userData.displayName || userData.username,
        avatar: userData.avatar || null,
        department: userData.department || 'General',
        position: userData.position || 'User'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      active: true,
      emailVerified: false,
      lastLoginAt: null,
      loginCount: 0
    };

    this.users.set(userId, user);
    await this.saveUsers();
    
    return this.sanitizeUser(user);
  }

  /**
   * ユーザー認証（修正・デバッグ強化版）
   */
  async authenticateUser(username, password) {
    console.log(`🔍 認証試行: "${username}" (パスワード長: ${password.length})`);
    
    // デバッグ: 全ユーザー一覧を表示
    console.log(`📋 登録済みユーザー: [${Array.from(this.users.keys()).join(', ')}]`);
    
    // ユーザー名またはメールアドレスでユーザーを検索
    const user = this.users.get(username) || 
                 Array.from(this.users.values()).find(u => u.email === username);
    
    if (!user) {
      console.log(`❌ ユーザーが見つかりません: "${username}"`);
      return null;
    }

    console.log(`👤 ユーザー発見: ${user.username} (ID: ${user.id}, アクティブ: ${user.active})`);

    if (!user.active) {
      console.log(`❌ 無効なユーザー: ${username}`);
      return null;
    }

    // パスワード検証（デバッグ情報付き）
    console.log(`🔑 パスワード検証中... (ハッシュ存在: ${!!user.password})`);
    
    try {
      const isValid = await bcrypt.compare(password, user.password);
      console.log(`🔑 パスワード検証結果: ${isValid}`);
      
      if (!isValid) {
        console.log(`❌ パスワードが正しくありません: ${username}`);
        return null;
      }
    } catch (bcryptError) {
      console.error(`❌ bcrypt検証エラー:`, bcryptError);
      return null;
    }

    console.log(`✅ 認証成功: ${username} (${user.profile?.displayName})`);

    // ログイン情報を更新（非同期処理を適切に処理）
    try {
      user.lastLoginAt = new Date().toISOString();
      user.loginCount = (user.loginCount || 0) + 1;
      user.updatedAt = new Date().toISOString();
      
      this.users.set(user.id, user);
      
      // 非同期保存（エラーログのみ）
      this.saveUsers().catch(error => {
        console.error('ユーザー情報更新保存エラー:', error);
      });

    } catch (updateError) {
      console.error('ユーザー情報更新エラー:', updateError);
      // 認証は成功とみなし、更新エラーは無視
    }

    return this.sanitizeUser(user);
  }

  /**
   * ユーザー情報取得
   */
  getUser(userId) {
    const user = this.users.get(userId);
    return user ? this.sanitizeUser(user) : null;
  }

  /**
   * ユーザー一覧取得
   */
  getAllUsers() {
    return Array.from(this.users.values()).map(user => this.sanitizeUser(user));
  }

  /**
   * ユーザー情報更新
   */
  async updateUser(userId, updates) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('ユーザーが見つかりません');
    }

    // 更新可能なフィールドのみ許可
    const allowedFields = ['email', 'profile', 'roles', 'scopes', 'active'];
    const sanitizedUpdates = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        sanitizedUpdates[key] = value;
      }
    }

    // パスワード更新は別途処理
    if (updates.password) {
      if (updates.password.length < 8) {
        throw new Error('パスワードは8文字以上である必要があります');
      }
      sanitizedUpdates.password = await bcrypt.hash(updates.password, 12);
    }

    // ユーザー情報を更新
    Object.assign(user, sanitizedUpdates, {
      updatedAt: new Date().toISOString()
    });

    this.users.set(userId, user);
    await this.saveUsers();
    
    return this.sanitizeUser(user);
  }

  /**
   * ユーザー削除
   */
  async deleteUser(userId) {
    if (!this.users.has(userId)) {
      throw new Error('ユーザーが見つかりません');
    }

    // 関連するトークンも削除
    for (const [token, data] of this.tokens.entries()) {
      if (data.userId === userId) {
        this.tokens.delete(token);
      }
    }

    this.users.delete(userId);
    await this.saveUsers();
    await this.saveTokens();
  }

  /**
   * ユーザー情報のサニタイズ（パスワード除去）
   */
  sanitizeUser(user) {
    const { password, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  // ===== クライアント管理 =====

  /**
   * クライアント取得
   */
  getClient(clientId) {
    return this.clients.get(clientId);
  }

  /**
   * リダイレクトURI検証
   */
  validateRedirectUri(clientId, redirectUri) {
    const client = this.clients.get(clientId);
    return client && client.redirectUris.includes(redirectUri);
  }

  // ===== 認可コード管理 =====

  /**
   * 認可コード生成
   */
  createAuthCode(userId, clientId, redirectUri, scopes, codeChallenge = null) {
    const code = crypto.randomBytes(32).toString('hex');
    const authCode = {
      code,
      userId,
      clientId,
      redirectUri,
      scopes,
      codeChallenge,
      createdAt: Date.now(),
      expiresAt: Date.now() + (CONFIG.OAUTH.AUTH_CODE_EXPIRY * 1000)
    };

    this.authCodes.set(code, authCode);
    
    // 期限切れコードの自動削除
    setTimeout(() => {
      this.authCodes.delete(code);
    }, CONFIG.OAUTH.AUTH_CODE_EXPIRY * 1000);

    console.log(`🎫 認可コード生成: ${code.substring(0, 10)}... (ユーザー: ${userId})`);
    return code;
  }

  /**
   * 認可コード検証
   */
  validateAuthCode(code, clientId, redirectUri, codeVerifier = null) {
    const authCode = this.authCodes.get(code);
    
    if (!authCode || 
        authCode.clientId !== clientId || 
        authCode.redirectUri !== redirectUri ||
        Date.now() > authCode.expiresAt) {
      console.log(`❌ 認可コード検証失敗: ${code ? code.substring(0, 10) + '...' : 'null'}`);
      return null;
    }

    // PKCE検証
    if (authCode.codeChallenge && codeVerifier) {
      const hash = crypto.createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
      if (hash !== authCode.codeChallenge) {
        console.log(`❌ PKCE検証失敗`);
        return null;
      }
    }

    // 使用済みコードを削除
    this.authCodes.delete(code);
    console.log(`✅ 認可コード検証成功: ${code.substring(0, 10)}...`);
    return authCode;
  }

  // ===== トークン管理 =====

  /**
   * トークン生成
   */
  createTokens(userId, clientId, scopes) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('ユーザーが見つかりません');
    }

    const tokenId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (15 * 60 * 1000)); // 15分

    const payload = {
      sub: userId,
      jti: tokenId,
      client_id: clientId,
      scope: scopes.join(' '),
      user: this.sanitizeUser(user),
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000)
    };

    const accessToken = jwt.sign(payload, CONFIG.OAUTH.JWT_SECRET, {
      issuer: 'OneAgent OAuth Server',
      audience: clientId
    });

    const refreshToken = jwt.sign(
      { 
        sub: userId, 
        jti: crypto.randomUUID(),
        client_id: clientId, 
        type: 'refresh' 
      },
      CONFIG.OAUTH.JWT_SECRET,
      { 
        expiresIn: CONFIG.OAUTH.REFRESH_TOKEN_EXPIRY,
        issuer: 'OneAgent OAuth Server'
      }
    );

    // トークンをデータベースに保存
    const tokenData = {
      id: tokenId,
      accessToken,
      refreshToken,
      userId,
      clientId,
      scopes,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastUsedAt: now.toISOString()
    };

    this.tokens.set(accessToken, tokenData);
    this.refreshTokens.set(refreshToken, tokenData);
    
    // 非同期保存（エラーログのみ）
    this.saveTokens().catch(error => {
      console.error('トークン保存エラー:', error);
    });

    console.log(`🎉 アクセストークン生成: ${userId} (有効期限: 15分)`);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 900, // 15分 = 900秒
      scope: scopes.join(' ')
    };
  }

  /**
   * 🔧 新規追加: 同期的なトークン検証（デッドロック回避版）
   */
  // 🔧 修正版
// 🔧 完全同期版（setImmediate削除）
validateTokenSync(token) {
  try {
    const decoded = jwt.verify(token, CONFIG.OAUTH.JWT_SECRET);
    const tokenData = this.tokens.get(token);
    
    if (!tokenData || !this.users.has(decoded.sub)) {
      return null;
    }

    // ✅ setImmediateを完全削除
    // 最終アクセス時刻の更新もしない（完全に読み取り専用）
    
    return decoded;
  } catch (error) {
    return null;
  }
}

  /**
   * トークン検証（従来の非同期版も維持）
   */
  validateToken(token) {
    try {
      const decoded = jwt.verify(token, CONFIG.OAUTH.JWT_SECRET);
      const tokenData = this.tokens.get(token);
      
      if (!tokenData || !this.users.has(decoded.sub)) {
        return null;
      }

      // 最終使用時刻を更新（非同期）
      tokenData.lastUsedAt = new Date().toISOString();
      this.tokens.set(token, tokenData);
      
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * リフレッシュトークンでアクセストークンを更新
   */
  refreshAccessToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, CONFIG.OAUTH.JWT_SECRET);
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token type');
      }

      const tokenData = this.refreshTokens.get(refreshToken);
      if (!tokenData) {
        throw new Error('Refresh token not found');
      }

      const user = this.users.get(decoded.sub);
      if (!user || !user.active) {
        throw new Error('User not found or inactive');
      }

      // 既存のトークンを無効化
      this.tokens.delete(tokenData.accessToken);
      this.refreshTokens.delete(refreshToken);

      // 新しいトークンを生成
      const newTokens = this.createTokens(
        decoded.sub, 
        decoded.client_id, 
        tokenData.scopes
      );

      return newTokens;
    } catch (error) {
      throw new Error(`Invalid refresh token: ${error.message}`);
    }
  }

  /**
   * トークン取り消し
   */
  revokeToken(token) {
    const tokenData = this.tokens.get(token);
    if (tokenData) {
      this.tokens.delete(token);
      if (tokenData.refreshToken) {
        this.refreshTokens.delete(tokenData.refreshToken);
      }
      // 非同期保存
      this.saveTokens().catch(error => {
        console.error('トークン削除保存エラー:', error);
      });
      return true;
    }
    return false;
  }

  /**
   * ユーザーの全トークンを取り消し
   */
  revokeAllUserTokens(userId) {
    let revokedCount = 0;
    
    for (const [token, data] of this.tokens.entries()) {
      if (data.userId === userId) {
        this.tokens.delete(token);
        if (data.refreshToken) {
          this.refreshTokens.delete(data.refreshToken);
        }
        revokedCount++;
      }
    }
    
    if (revokedCount > 0) {
      // 非同期保存
      this.saveTokens().catch(error => {
        console.error('全トークン削除保存エラー:', error);
      });
    }
    
    return revokedCount;
  }

  /**
   * 期限切れトークンのクリーンアップ
   */
  async cleanupExpiredTokens() {
    const now = new Date();
    let cleanedCount = 0;
    
    for (const [token, data] of this.tokens.entries()) {
      if (new Date(data.expiresAt) <= now) {
        this.tokens.delete(token);
        if (data.refreshToken) {
          this.refreshTokens.delete(data.refreshToken);
        }
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 ${cleanedCount}個の期限切れトークンをクリーンアップしました`);
      await this.saveTokens();
    }
    
    return cleanedCount;
  }

  /**
   * 統計情報取得（高速化版）
   */
  getStatistics() {
    try {
      const now = new Date();
      
      // 🔧 修正: 高速化のため簡略化
      const stats = {
        users: {
          total: this.users.size,
          active: 0 // 詳細計算をスキップ
        },
        tokens: {
          total: this.tokens.size,
          active: this.tokens.size, // 簡略化
          expired: 0
        },
        clients: {
          total: this.clients.size
        },
        authCodes: {
          pending: this.authCodes.size
        },
        timestamp: new Date().toISOString(),
        optimized: true // 最適化フラグ
      };

      // デバッグモードでのみ詳細計算
      if (CONFIG.DEBUG.VERBOSE_LOGGING) {
        const activeUsers = Array.from(this.users.values()).filter(u => u.active).length;
        stats.users.active = activeUsers;
        
        const activeTokens = Array.from(this.tokens.values())
          .filter(token => new Date(token.expiresAt) > now);
        stats.tokens.active = activeTokens.length;
        stats.tokens.expired = this.tokens.size - activeTokens.length;
      }

      return stats;
    } catch (error) {
      console.error('統計情報取得エラー:', error);
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
        optimized: true
      };
    }
  }

  /**
   * クリーンアップ
   */
  async cleanup() {
    try {
      await this.cleanupExpiredTokens();
      await this.saveUsers();
      await this.saveTokens();
      console.log('✅ OAuth データベースクリーンアップ完了');
    } catch (error) {
      console.error('OAuth データベースクリーンアップエラー:', error);
    }
  }
}