# 経費管理システム用MCPツール v2.2.0 (Bearer Token認証修正版)

**🔐 Bearer Token認証に完全対応**した経費管理システムです。  
**OneAgentサーバーとの認証連携を修正**し、安定した動作を実現しています。

## 🔧 主な修正内容 (v2.2.0)

### ✅ **認証システム修正**
- ❌ **削除**: 無効なセッション認証 (`Cookie: session=user.id`)
- ✅ **追加**: Bearer Token認証 (`Authorization: Bearer <token>`)
- ✅ **修正**: 認証コンテキストからのトークン取得
- ✅ **強化**: デバッグ情報の追加

### ✅ **API呼び出し修正**
- ✅ **修正**: `callExpenseAPI`関数でBearer Token使用
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
```bash
# ブラウザでアクセス
http://localhost:3000

# OAuth認証を完了してアクセストークンを取得
```

#### 2. AIエージェントでのツール実行
```javascript
// OneAgentサーバーで以下のようにツールを実行
{
  "action": "list_reports"
}
```

#### 3. Bearer Token認証フロー
1. ユーザーがOneAgentサーバーでOAuth認証を完了
2. AIエージェントがツール実行時にBearer Tokenを含む認証コンテキストを作成
3. expense_managerツールがBearer Tokenを抽出
4. localhost:3552のAPIにBearer Tokenで認証リクエスト
5. APIサーバーがOneAgentサーバーでトークン検証
6. 認証成功で正常にAPI処理が実行

### 環境変数（オプション）
```bash
# カスタムAPIサーバーを使用する場合
export EXPENSE_API_BASE_URL="http://localhost:3552/api"
```

## 📝 対応機能（6機能）

### ①経費レポート作成 ✅
```javascript
{
  "action": "create_report",
  "title": "出張経費レポート - 大阪",
  "date": "2024-01-15",
  "category": "交通費",
  "amount": 15000,
  "description": "新幹線往復料金（東京-大阪）",
  "receipt": true
}
```

### ②レポート一覧取得 ✅
```javascript
{
  "action": "list_reports",
  "limit": 10,
  "offset": 0
}
```

### ③レポート詳細取得 ✅
```javascript
{
  "action": "get_report",
  "reportId": "report_1234567890_abcdef123"
}
```

### ④レポート更新 ✅
```javascript
{
  "action": "update_report",
  "reportId": "report_1234567890_abcdef123",
  "title": "更新されたタイトル",
  "amount": 20000
}
```

### ⑤レポート削除 ✅
```javascript
{
  "action": "delete_report",
  "reportId": "report_1234567890_abcdef123"
}
```

### ⑥レポートフォーマット確認 ✅
```javascript
{
  "action": "get_report_format"
}
```

## 📊 カテゴリ対応

- 🚗 **交通費** - 電車、バス、タクシー、航空機等
- 🍽️ **食費** - 会議費、接待費、出張時の食事等
- 🏨 **宿泊費** - ホテル、旅館等の宿泊料金
- 📝 **その他** - 文房具、通信費、その他諸経費

## 🔒 認証について

### Bearer Token認証 🔐
```http
Authorization: Bearer <access_token>
```

### 認証トークンの取得順序
1. `authContext.tokenInfo.token` - OneAgentからの直接トークン
2. `authContext.accessToken` - コンテキストのアクセストークン
3. `authContext.user.accessToken` - ユーザーオブジェクトのトークン
4. `authContext.headers.authorization` - ヘッダーからの抽出（フォールバック）

## 🚀 セットアップ手順

### 1. OneAgentサーバー起動
```bash
# OneAgentサーバーを起動
node server.js
# http://localhost:3000 で起動
```

### 2. APIサーバー起動
```bash
# Expense APIサーバーを起動
node expense-api-server.js
# http://localhost:3552 で起動
```

### 3. OAuth認証完了
```bash
# ブラウザでOneAgentサーバーにアクセス
open http://localhost:3000

# OAuth認証を完了（admin/admin123 または demo/demo123）
```

### 4. MCPツール使用
```javascript
// OneAgentのAIエージェントでツールを実行
{
  "action": "list_reports"
}
```

## 🔧 トラブルシューティング

### 認証エラー（修正済み）
```
API Error (401): 認証が必要です
```
**修正内容**:
- ❌ 無効なセッション認証からBearer Token認証に修正
- ✅ 認証コンテキストからの適切なトークン取得
- ✅ デバッグ情報の強化

### APIサーバー接続エラー
```
Error: API呼び出しエラー: fetch failed
```
**解決策**:
1. APIサーバーの起動状態を確認: `curl http://localhost:3552/api/report-format`
2. ポート3552が使用可能であることを確認
3. ファイアウォール設定を確認

### Bearer Token未取得
```
Error: 認証トークンが取得できません
```
**解決策**:
1. OneAgentサーバーでOAuth認証を完了
2. ツール実行前にブラウザでログイン状態を確認
3. デバッグログでトークン取得状況を確認

## 🔍 デバッグ機能

### デバッグログの確認
ツール実行時に以下のログが出力されます：
```
🔍 [DEBUG] expense_manager 開始
🔍 [DEBUG] args: {...}
🔍 [DEBUG] context keys: [...]
🔍 [DEBUG] callExpenseAPI 開始
✅ [DEBUG] tokenInfo.tokenからトークン取得
🎫 [DEBUG] トークン確認: eyJhbGciOiJIUzI1NiIs...
🔄 [DEBUG] API呼び出し: GET http://localhost:3552/api/reports
📡 [DEBUG] API応答: 200 OK
✅ [DEBUG] API成功: {...}
```

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
2. **フォーマット確認**: `get_report_format` でフィールド確認
3. **レポート作成**: `create_report` で新規作成
4. **一覧確認**: `list_reports` で作成済みレポート確認
5. **詳細確認**: `get_report` で特定レポートの詳細確認
6. **必要に応じて更新**: `update_report` でデータ修正
7. **不要なら削除**: `delete_report` でクリーンアップ

この版はBearer Token認証に完全対応し、安定した動作を実現しています。
