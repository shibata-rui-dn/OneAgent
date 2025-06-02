# OneDrive風ファイル管理デモアプリケーション

## 概要

OneAgentのsecure_user_file_managerツールを活用した、OneDrive風のファイル管理Webアプリケーションです。OAuth 2.0認証により、ユーザーごとに1GBの専用ファイル領域を提供し、安全なファイル操作を実現します。

## システム構成

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   OneAgent       │    │ File Storage    │
│   React App     │◄──►│   Backend        │◄──►│ User Files      │
│   Port: 3551    │    │   Port: 3000     │    │ 1GB/User       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### 技術スタック

**Frontend (./demo)**
- React 18 + javascript
- Vite (開発サーバー)
- Tailwind CSS (スタイリング)
- React Router (ルーティング)
- Axios (HTTP通信)
- React Query (状態管理)

**Backend (既存)**
- OneAgent サーバー (Port: 3000)
- secure_user_file_manager ツール
- OAuth 2.0認証システム

## 主要機能

### 🔐 認証機能
- OAuth 2.0 Authorization Code Flow
- ユーザーごとの完全分離
- セッション管理
- 自動ログアウト

### 📁 ファイル管理機能
- **基本操作**
  - ファイル/フォルダ一覧表示
  - ファイル作成・編集・削除
  - フォルダ作成・削除
  - ファイルダウンロード

- **高度な操作**
  - ファイル/フォルダの移動・コピー
  - ファイル検索（名前・内容）
  - 容量使用状況確認
  - ファイルプレビュー

- **制限事項**
  - 最大容量: 1GB/ユーザー
  - 最大ファイルサイズ: 50MB
  - 最大ファイル数: 10,000
  - 最大フォルダ階層: 15階層

### 🎨 ユーザーインターフェース
- **レスポンシブデザイン**
  - デスクトップ・タブレット・モバイル対応
  - OneDrive風のファイルリスト表示
  - ファイルアイコン・サムネイル

- **操作性**
  - ドラッグ&ドロップ対応
  - 右クリックコンテキストメニュー
  - キーボードショートカット
  - ファイル選択・一括操作

## プロジェクト構造

```
./demo/
├── public/
│   ├── index.html
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   ├── LoginButton.jsx
│   │   │   ├── LogoutButton.jsx
│   │   │   └── AuthCallback.jsx
│   │   ├── file/
│   │   │   ├── FileList.jsx
│   │   │   ├── FileItem.jsx
│   │   │   ├── FileUpload.jsx
│   │   │   ├── FileEditor.jsx
│   │   │   └── FilePreview.jsx
│   │   ├── layout/
│   │   │   ├── Header.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Breadcrumb.jsx
│   │   │   └── StatusBar.jsx
│   │   └── common/
│   │       ├── Loading.jsx
│   │       ├── ErrorBoundary.jsx
│   │       └── Modal.jsx
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useFileManager.js
│   │   └── useLocalStorage.js
│   ├── services/
│   │   ├── authService.js
│   │   ├── fileService.js
│   │   └── apiClient.js
│   ├── types/
│   │   ├── auth.js
│   │   ├── file.js
│   │   └── api.js
│   ├── utils/
│   │   ├── fileUtils.js
│   │   ├── formatUtils.js
│   │   └── constants.js
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── FilePage.jsx
│   │   └── SettingsPage.jsx
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .env_demo
├── package.json
├── vite.config.js
├── tailwind.config.js
├── jsconfig.json
└── README.md
```

## セットアップ手順

### 1. 前提条件

```bash
# OneAgentサーバーが稼働していることを確認
curl http://localhost:3000/health
```

### 2. 環境設定

**`.env_demo`ファイルの作成:**
```env
# デモアプリケーション設定
VITE_APP_TITLE="OneDrive風ファイル管理デモ"
VITE_APP_VERSION="1.0.0"

# OneAgentサーバー設定
VITE_BACKEND_URL="http://localhost:3000"
VITE_API_BASE_URL="http://localhost:3000"

# OAuth 2.0設定
VITE_OAUTH_CLIENT_ID="oneagent-default-client"
VITE_OAUTH_REDIRECT_URI="http://localhost:3551/auth/callback"
VITE_OAUTH_AUTHORIZE_URL="http://localhost:3000/oauth/authorize"
VITE_OAUTH_TOKEN_URL="http://localhost:3000/oauth/token"
VITE_OAUTH_SCOPES="read write"

# デモアプリケーション固有設定
VITE_DEMO_PORT=3551
VITE_MAX_FILE_SIZE=52428800
VITE_SUPPORTED_FILE_TYPES=".txt,.md,.json,.xml,.csv,.jsx,.js,.html,.css,.py,.java,.cpp,.c,.sh,.bat,.sql,.log,.ini,.conf"

# 開発用設定
VITE_DEBUG_MODE=true
VITE_LOG_LEVEL="info"
```

### 3. インストール

```bash
# プロジェクトディレクトリ作成
mkdir -p ./demo
cd ./demo

# 依存関係インストール（パッケージ作成後）
npm install

# 開発サーバー起動
npm run dev
```

### 4. 利用可能なアカウント

```
管理者アカウント: admin / admin123
一般ユーザー: demo / demo123
```

## API連携

### 認証フロー

```sequence
User -> React App: ログインボタンクリック
React App -> OneAgent: /oauth/authorize (redirect)
OneAgent -> User: ログイン画面表示
User -> OneAgent: 認証情報入力
OneAgent -> React App: /auth/callback (code)
React App -> OneAgent: /oauth/token (code exchange)
OneAgent -> React App: access_token
React App -> User: ダッシュボード表示
```

### ファイル操作API

```javascript
// ファイル一覧取得
GET /agent
Body: {
  "query": "ファイル一覧を表示してください",
  "tools": ["secure_user_file_manager"],
  "streaming": false
}

// ファイル作成
POST /agent
Body: {
  "query": "新しいファイルを作成してください",
  "tools": ["secure_user_file_manager"],
  "streaming": false
}

// 容量確認
POST /agent
Body: {
  "query": "現在の容量使用状況を確認してください",
  "tools": ["secure_user_file_manager"],
  "streaming": false
}
```

## 画面設計

### 1. ログイン画面
- OneAgent OAuth認証
- 企業ロゴ・ブランディング
- セキュリティ情報表示

### 2. ダッシュボード
- ファイル/フォルダ一覧（グリッド・リスト表示）
- サイドバー（フォルダツリー）
- ヘッダー（検索・ユーザー情報）
- ステータスバー（容量表示）

### 3. ファイルエディタ
- テキストファイル編集
- シンタックスハイライト
- 自動保存機能

### 4. 設定画面
- ユーザー情報表示
- 容量使用状況
- ログアウト

## セキュリティ対策

### 🔒 認証・認可
- OAuth 2.0による認証
- JWT トークンベース認可
- CSRF攻撃対策
- XSS攻撃対策

### 📁 ファイルセキュリティ
- ユーザーごとの完全分離
- ファイル拡張子検証
- ファイルサイズ制限
- パストラバーサル攻撃防止

### 🌐 通信セキュリティ
- HTTPS通信（本番環境）
- セキュアなCookie設定
- CORS設定

## 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# ビルド
npm run build

# プレビュー
npm run preview

# 型チェック
npm run type-check

# Lint
npm run lint

# テスト
npm run test
```

## デプロイメント

### 開発環境
```bash
# OneAgentサーバー起動
cd /path/to/oneagent
npm start

# デモアプリ起動
cd ./demo
npm run dev
```

### 本番環境
```bash
# ビルド
npm run build

# 静的ファイルサーバー
npm run preview
# または
serve -s dist -l 3551
```

## トラブルシューティング

### よくある問題

1. **認証エラー**
   ```bash
   # OneAgentサーバーの状態確認
   curl http://localhost:3000/health
   curl http://localhost:3000/oauth/authorize
   ```

2. **ファイル操作エラー**
   ```bash
   # ツールの状態確認
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        http://localhost:3000/tools
   ```

3. **CORS エラー**
   - OneAgentの CORS 設定確認
   - `.env_demo` のURL設定確認

### ログ確認

```bash
# OneAgentサーバーログ
tail -f logs/oneagent.log

# ブラウザ開発者ツール
# Console、Network タブを確認
```

## 今後の拡張予定

### 🚀 機能拡張
- [ ] ファイル共有機能
- [ ] バージョン管理
- [ ] ファイル履歴
- [ ] フォルダ同期
- [ ] オフライン対応

### 🎨 UI/UX改善
- [ ] ファイルプレビュー拡張
- [ ] ドラッグ&ドロップ改善
- [ ] ショートカットキー
- [ ] テーマ切り替え

### 🔧 技術改善
- [ ] PWA対応
- [ ] WebSocket通信
- [ ] キャッシュ最適化
- [ ] パフォーマンス向上

## ライセンス

このデモアプリケーションはOneAgentプロジェクトの一部として開発されています。

---

**次のステップ**: この設計書に基づいて、React + javascript + Tailwind CSSを使用したデモアプリケーションを実装します。