# 拡張セキュアファイル管理ツール v3.1.0

## 更新内容 (v3.1.0)
- **表示改善**: documents/ や trash/ プレフィックスを非表示化
- **UI改善**: よりクリーンなパス表示を実現

## 新機能

### ①ファイル管理サービス
- **保存場所**: メインエリア（以前のdocumentsフォルダ）
- **機能**: ファイル・フォルダの作成、編集、移動、コピー
- **容量**: 1GB/ユーザー、50MB/ファイル、10,000ファイル制限
- **ファイル形式**: テキスト・バイナリ両方対応
- **拡張子**: 必須（任意の拡張子使用可能）

### ②最近の更新
- **機能**: 最近更新されたファイルの履歴を自動記録
- **保存件数**: 最大100件の更新履歴
- **表示**: タイムスタンプ付きで最新順表示
- **追跡対象**: create, update, move, copy, restore アクション

### ③お気に入り
- **機能**: 重要なファイル・フォルダをお気に入りに登録
- **保存件数**: 最大200件
- **管理**: 追加・削除・一覧表示
- **存在チェック**: ファイルの存在確認付き

### ④ゴミ箱
- **機能**: 削除したファイル・フォルダを安全に一時保存
- **復元**: 元の場所への復元機能
- **完全削除**: 個別削除またはゴミ箱を空にする
- **メタデータ**: 削除日時と元の場所を記録

## ディレクトリ構造

```
/{userId}/
├── documents/          # メインエリア（ユーザー操作可能）
│   ├── (ユーザーファイル・フォルダ)
│   └── sample.md       # サンプルファイル
├── trash/             # ゴミ箱（削除されたファイル・フォルダ）
│   ├── (削除されたファイル)
│   └── (メタデータファイル .meta)
├── .recent_updates.json  # 最近の更新履歴
├── .favorites.json      # お気に入り
└── README.md           # 使用説明書
```

## 表示改善

### パス表示の変更
- **以前**: documents/project/file.txt, trash/old_file.txt
- **現在**: project/file.txt, old_file.txt

### 改善点
- より直感的でクリーンなパス表示
- 不要なプレフィックスを削除
- ユーザーエクスペリエンスの向上

## アクション一覧

### 基本ファイル操作（メインエリア内）
- **create_folder** - フォルダ作成
- **create_file** - ファイル作成
- **read_file** - ファイル内容読み取り
- **update_file** - ファイル内容更新
- **delete** - ファイル・フォルダをゴミ箱に移動
- **list** - ディレクトリ一覧表示
- **search** - ファイル検索
- **move** - ファイル・フォルダ移動
- **copy** - ファイル・フォルダコピー
- **get_quota** - 容量使用状況確認

### 新機能
- **get_recent_updates** - 最近の更新一覧取得
- **add_to_favorites** - お気に入りに追加
- **remove_from_favorites** - お気に入りから削除
- **get_favorites** - お気に入り一覧取得
- **move_to_trash** - ゴミ箱に移動（deleteと同じ）
- **restore_from_trash** - ゴミ箱から復元
- **list_trash** - ゴミ箱一覧表示
- **empty_trash** - ゴミ箱を空にする
- **permanently_delete** - 完全削除

## 使用例

### ①ファイル管理サービス

#### ファイル作成（メインエリア内）
```javascript
{
  "action": "create_file",
  "path": "my_document.txt",
  "content": "Hello World!"
}
```

#### フォルダ作成
```javascript
{
  "action": "create_folder",
  "path": "projects/web_app"
}
```

#### ファイル一覧表示
```javascript
{
  "action": "list",
  "path": ""  // メインエリア全体
}
```

### ②最近の更新

#### 最近の更新を取得
```javascript
{
  "action": "get_recent_updates",
  "limit": 10
}
```

### ③お気に入り

#### お気に入りに追加
```javascript
{
  "action": "add_to_favorites",
  "path": "important_document.pdf"
}
```

#### お気に入り一覧取得
```javascript
{
  "action": "get_favorites"
}
```

#### お気に入りから削除
```javascript
{
  "action": "remove_from_favorites",
  "path": "old_document.txt"
}
```

### ④ゴミ箱

#### ファイルをゴミ箱に移動
```javascript
{
  "action": "delete",
  "path": "old_file.txt"
}
```

#### ゴミ箱一覧表示
```javascript
{
  "action": "list_trash"
}
```

#### ゴミ箱から復元
```javascript
{
  "action": "restore_from_trash",
  "path": "old_file.txt"
}
```

#### ゴミ箱を空にする
```javascript
{
  "action": "empty_trash"
}
```

#### 完全削除（復元不可）
```javascript
{
  "action": "permanently_delete",
  "path": "unwanted_file.txt"
}
```

## セキュリティ・制限

### アクセス制限
- **ユーザーアクセス可能エリア**: メインエリアとゴミ箱のみ
- **他ユーザーデータ**: 完全分離、アクセス不可
- **システムファイル**: .recent_updates.json, .favorites.json は自動管理

### ファイル制限
- **最大容量**: 1GB/ユーザー
- **最大ファイルサイズ**: 50MB/ファイル
- **最大ファイル数**: 10,000ファイル/ユーザー
- **最大フォルダ階層**: 15階層
- **拡張子**: 必須（任意の拡張子使用可能）

### 機能制限
- **最近の更新**: 最大100件
- **お気に入り**: 最大200件
- **実行可能ファイル**: 作成可能、実行権限制限

## バイナリファイル対応

### 作成・更新時の形式
- **テキスト**: 通常の文字列
- **Base64**: "base64:エンコードデータ"
- **Data URL**: "data:mime-type;base64,エンコードデータ"

### 読み取り時の形式
- **テキストファイル**: そのまま文字列で返却
- **バイナリファイル**: "base64:エンコードデータ" 形式で返却

### 対応ファイル
- 画像、音声、動画、アーカイブ、実行ファイルなど全形式対応
