# OneAgent OAuth 2.0 API エンドポイント仕様

## 概要

OneAgentはOAuth 2.0標準に準拠した認証システムを提供しています。このドキュメントでは、利用可能なエンドポイントとデータ形式について説明します。

## 基本情報

- **ベースURL**: `http://localhost:3000` (デフォルト)
- **プロトコル**: OAuth 2.0 + PKCE
- **サポートフロー**: Authorization Code Grant
- **トークン形式**: JWT (JSON Web Token)

---

## エンドポイント一覧

### 1. 認可エンドポイント

**エンドポイント**: `GET /oauth/authorize`

OAuth 2.0認証フローの開始点。ユーザーを認証し、認可コードを発行します。

#### リクエストパラメータ

| パラメータ | 必須 | 説明 |
|---|---|---|
| `response_type` | ✅ | `code` (固定値) |
| `client_id` | ✅ | クライアントID |
| `redirect_uri` | ✅ | リダイレクトURI |
| `scope` | ❌ | 要求するスコープ (デフォルト: `read`) |
| `state` | 推奨 | CSRF攻撃防止用のランダム文字列 |
| `code_challenge` | ❌ | PKCE用チャレンジコード |
| `code_challenge_method` | ❌ | `S256` (PKCEを使用する場合) |

#### レスポンス

**成功時**: 認可コードとstateパラメータを含むリダイレクト
```
{redirect_uri}?code={authorization_code}&state={state}
```

**エラー時**: エラー情報を含むリダイレクト
```
{redirect_uri}?error={error_code}&error_description={description}&state={state}
```

---

### 2. トークンエンドポイント

**エンドポイント**: `POST /oauth/token`

認可コードをアクセストークンと交換します。

#### リクエストボディ

##### Authorization Code Grant
```json
{
  "grant_type": "authorization_code",
  "code": "認可コード",
  "redirect_uri": "リダイレクトURI",
  "client_id": "クライアントID",
  "client_secret": "クライアントシークレット",
  "code_verifier": "PKCEコード検証値 (オプション)"
}
```

##### Refresh Token Grant
```json
{
  "grant_type": "refresh_token",
  "refresh_token": "リフレッシュトークン",
  "client_id": "クライアントID",
  "client_secret": "クライアントシークレット"
}
```

#### レスポンス

**成功時**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "read write"
}
```

**エラー時**:
```json
{
  "error": "invalid_grant",
  "error_description": "Invalid authorization code"
}
```

---

### 3. ユーザー情報エンドポイント ⭐

**エンドポイント**: `GET /oauth/userinfo`

アクセストークンを使用して認証済みユーザーの情報を取得します。

#### 認証

```http
Authorization: Bearer {access_token}
```

#### レスポンス

取得される情報はスコープに応じて変わります：

##### 基本情報（常に含まれる）
```json
{
  "sub": "user001",
  "username": "demo",
  "preferred_username": "demo"
}
```

##### `read` または `profile` スコープ
```json
{
  "sub": "user001",
  "username": "demo",
  "preferred_username": "demo",
  "name": "デモユーザー",
  "profile": {
    "displayName": "デモユーザー",
    "avatar": null,
    "department": "General",
    "position": "User"
  }
}
```

##### `read` または `email` スコープ
```json
{
  "sub": "user001",
  "username": "demo", 
  "preferred_username": "demo",
  "email": "demo@oneagent.local",
  "email_verified": true
}
```

##### `admin` スコープ（管理者のみ）
```json
{
  "sub": "admin",
  "username": "admin",
  "preferred_username": "admin",
  "name": "管理者",
  "email": "admin@oneagent.local",
  "email_verified": true,
  "roles": ["admin", "user"],
  "scopes": ["read", "write", "admin"],
  "profile": {
    "displayName": "管理者",
    "avatar": null,
    "department": "IT",
    "position": "Administrator"
  }
}
```

#### エラーレスポンス

```json
{
  "error": "invalid_token",
  "error_description": "Token is expired or invalid"
}
```

---

### 4. トークン取り消しエンドポイント

**エンドポイント**: `POST /oauth/revoke`

アクセストークンまたはリフレッシュトークンを無効化します。

#### リクエストボディ

```json
{
  "token": "取り消すトークン",
  "token_type_hint": "access_token" // または "refresh_token"
}
```

#### レスポンス

**成功時** (RFC 7009準拠):
```json
{
  "success": true
}
```

---

### 5. ログインページ

**エンドポイント**: `GET /oauth/login`

ユーザー認証用のログインフォームを表示します。

#### クエリパラメータ

OAuth認可フローのパラメータがそのまま渡されます。

#### レスポンス

HTMLログインフォーム（デモアカウント情報付き）

---

### 6. 認証処理

**エンドポイント**: `POST /oauth/authenticate`

ログインフォームからの認証リクエストを処理します。

#### リクエストボディ

```json
{
  "username": "ユーザー名またはメールアドレス",
  "password": "パスワード",
  // OAuth パラメータも含む
  "response_type": "code",
  "client_id": "client_id",
  "redirect_uri": "redirect_uri",
  "scope": "read write",
  "state": "state_value"
}
```

#### レスポンス

**成功時**: 認可コードを含むリダイレクト
**失敗時**: エラーパラメータを含むログインページへのリダイレクト

---

### 7. コールバックエンドポイント

**エンドポイント**: `GET /oauth/callback`

OAuth認証完了後のコールバック処理を行います。

#### クエリパラメータ

```
?code={authorization_code}&state={state}
```

#### レスポンス

フロントエンドアプリケーションへのリダイレクト

---

### 8. OAuth統計情報（管理者用）

**エンドポイント**: `GET /oauth/stats`

**認証**: Bearer token + 管理者権限必須

#### レスポンス

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "memory": {
    "rss": 50331648,
    "heapTotal": 20971520,
    "heapUsed": 15728640,
    "external": 1048576
  },
  "requestedBy": "admin",
  "note": "デバッグ版"
}
```

---

## サポートされるスコープ

| スコープ | 説明 |
|---|---|
| `read` | 基本的な読み取り権限 |
| `write` | 書き込み権限 |
| `admin` | 管理者権限 |

---

## デフォルトユーザーアカウント

| ユーザー名 | パスワード | 権限 | 説明 |
|---|---|---|---|
| `admin` | `admin123` | admin, user | 管理者アカウント |
| `demo` | `demo123` | user | 一般ユーザーアカウント |

---

## エラーコード

| エラーコード | 説明 |
|---|---|
| `invalid_request` | リクエストパラメータが不正 |
| `unauthorized_client` | クライアントが認証されていない |
| `access_denied` | ユーザーがアクセスを拒否 |
| `unsupported_response_type` | サポートされていないresponse_type |
| `invalid_scope` | 無効なスコープ |
| `server_error` | サーバー内部エラー |
| `invalid_grant` | 無効な認可コード |
| `invalid_token` | 無効または期限切れのトークン |

---

## 使用例

### 完全な認証フロー

1. **認可リクエスト**
```
GET /oauth/authorize?response_type=code&client_id=oneagent-default-client&redirect_uri=http://localhost:5173/oauth/callback&scope=read%20write&state=random_state
```

2. **トークン取得**
```bash
curl -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "認可コード",
    "redirect_uri": "http://localhost:5173/oauth/callback",
    "client_id": "oneagent-default-client",
    "client_secret": "クライアントシークレット"
  }'
```

3. **ユーザー情報取得**
```bash
curl -H "Authorization: Bearer アクセストークン" \
     http://localhost:3000/oauth/userinfo
```

---

## セキュリティ考慮事項

- ✅ PKCE (Proof Key for Code Exchange) サポート
- ✅ State パラメータによるCSRF攻撃防止
- ✅ JWT トークンの署名検証
- ✅ トークンの自動期限切れ (15分)
- ✅ セキュアなセッション管理
- ✅ HTTPS推奨（本番環境では必須）