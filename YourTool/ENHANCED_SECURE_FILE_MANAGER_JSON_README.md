# 拡張セキュアファイル管理ツール v4.0.0 (JSON対応版)

## v4.0.0 の主要な改善点

### 🎯 JSON構造化レスポンス
- **統一されたAPI応答**: 全ての操作結果がJSON形式で返されます
- **構造化データ**: ファイル情報、メタデータ、エラー情報が明確に分離
- **一貫性の向上**: パース処理の簡素化とエラー削減

### 📊 強化されたデータ構造

#### ファイル一覧レスポンス例
```json
{
  "success": true,
  "action": "list",
  "data": {
    "currentPath": "",
    "area": "documents",
    "folders": [
      {
        "name": "projects",
        "path": "projects",
        "isDirectory": true,
        "size": 0,
        "modifiedDate": "2025-06-08T15:30:45.123Z",
        "isExecutable": false
      }
    ],
    "files": [
      {
        "name": "sample.txt",
        "path": "sample.txt",
        "isDirectory": false,
        "size": 2048,
        "sizeFormatted": "2.0 KB",
        "modifiedDate": "2025-06-08T15:30:45.123Z",
        "extension": ".txt",
        "isExecutable": false,
        "isTextFile": true
      }
    ],
    "totalItems": 2,
    "folderCount": 1,
    "fileCount": 1
  },
  "message": "ディレクトリ「(ルート)」を一覧表示しました（2件）",
  "timestamp": "2025-06-08T15:30:45.123Z"
}
```

#### クォータ情報レスポンス例
```json
{
  "success": true,
  "action": "get_quota",
  "data": {
    "used": "512.5 MB",
    "total": "1 GB",
    "remaining": "511.5 MB",
    "percentage": 51.25,
    "fileCount": 127,
    "maxFiles": 10000,
    "details": {
      "documentsSize": "480.2 MB",
      "trashSize": "32.3 MB",
      "recentUpdatesCount": 15,
      "favoritesCount": 8,
      "maxRecentUpdates": 100,
      "maxFavorites": 200
    },
    "limits": {
      "maxFileSize": "450 MB",
      "maxFolderDepth": 15,
      "totalCapacity": "1 GB"
    },
    "user": {
      "id": "user123",
      "name": "ユーザー123",
      "email": "user@example.com"
    }
  },
  "message": "容量使用状況：512.5 MB / 1 GB (51%)",
  "timestamp": "2025-06-08T15:30:45.123Z"
}
```

### 🔧 技術的改善点

#### 1. レスポンス構造の統一
- **成功レスポンス**: `success: true` + `data` + `message`
- **エラーレスポンス**: `success: false` + `error` + `details`
- **タイムスタンプ**: 全レスポンスにISO 8601形式の日時

#### 2. データ完全性の向上
- **ファイルサイズ**: バイト数 + フォーマット済み文字列
- **日時情報**: ISO 8601形式で統一
- **メタデータ**: 拡張子、実行可能性、ファイルタイプ

#### 3. エラーハンドリングの強化
- **詳細なエラー情報**: エラーメッセージ + 追加詳細
- **操作トレーサビリティ**: 全操作のログ記録
- **堅牢性向上**: 部分的失敗への対応

## 主要機能（JSON対応済み）

### ①ファイル管理サービス
- **CRUD操作**: 作成・読取・更新・削除（全てJSON形式）
- **メタデータ**: サイズ、日時、拡張子、権限情報
- **バイナリサポート**: Base64エンコーディング対応

### ②最近の更新
- **構造化履歴**: アクション、タイムスタンプ、ファイル情報
- **アイコン付き**: 操作タイプ別のビジュアル表示
- **フィルタリング**: 件数制限とページネーション

### ③お気に入り
- **詳細情報**: ファイルタイプ、追加日時、存在確認
- **管理機能**: 追加・削除・一覧（全てJSON形式）
- **統計情報**: 総数、存在数、欠損数

### ④ゴミ箱
- **メタデータ保持**: 元の場所、削除日時、ファイルサイズ
- **復元機能**: 詳細な復元情報をJSON形式で提供
- **容量回収**: 削除時の容量回収量を正確に計算

### ⑤クォータ管理
- **詳細分析**: エリア別使用量、制限情報、ユーザー情報
- **リアルタイム**: 正確な使用量計算と残容量
- **制限管理**: ファイル数、サイズ、階層制限

## 開発者向け情報

### API エンドポイント
全ての操作で統一されたJSON形式のレスポンスを提供：

- `list`: ディレクトリ一覧
- `get_quota`: 容量情報
- `get_recent_updates`: 最近の更新
- `get_favorites`: お気に入り一覧
- `list_trash`: ゴミ箱一覧

### レスポンス形式
```typescript
interface SuccessResponse {
  success: true;
  action: string;
  data: any;
  message: string;
  timestamp: string; // ISO 8601
}

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    details?: any;
  };
  timestamp: string; // ISO 8601
}
```

## 移行ガイド

### 従来版からの変更点
1. **レスポンス形式**: テキスト → JSON構造
2. **エラー処理**: 文字列 → 構造化オブジェクト
3. **メタデータ**: 基本情報 → 詳細情報
4. **パフォーマンス**: パース処理の高速化

### 推奨される実装
- JSON.parse() でのレスポンス解析
- success フィールドでの成功/失敗判定
- data フィールドからの情報取得
- timestamp フィールドでの操作時刻記録

## インストール後の確認

1. OneAgentサーバーでツールをリロード
2. JSON形式のレスポンス確認
3. 全機能の正常動作確認
4. Dashboard側の対応確認
