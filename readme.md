# Dynamic Tool Management MCP Server + AI Agent (HTTP版)

AIエージェントが利用可能なツールを動的に管理し、OpenAI/Azure OpenAIを使用してユーザークエリに応答するMCP（Model Context Protocol）対応サーバーです。`./YourTool/`ディレクトリ内のツールを自動的に読み込み、WebUIでツールを選択してAIエージェントが適切なツールを実行してユーザーの質問に答えます。

## 📋 概要

このシステムは以下の機能を提供します：

### バックエンド（サーバー）
- 動的ツール読み込み（`./YourTool/`ディレクトリをスキャン）
- **🤖 AIエージェント機能**
  - OpenAI GPT-4o-mini または Azure OpenAI対応
  - ストリーミング・非ストリーミング両対応
  - 選択的ツール実行（フロントエンドで選択されたツールのみ使用）
  - Function Calling による高精度なツール呼び出し
- ツールのホットリロード機能
- RESTful APIエンドポイント
- MCPプロトコル対応（HTTP transport）
- **🎨 アイコン対応**（SVG形式、7種類のテーマ、6色のカラーパレット）

### フロントエンド（WebUI）
- **📱 モダンなチャットUI**（React + Tailwind CSS）
- **🎯 ツール選択インターフェース**（チェックボックスで選択）
- **🖼️ アイコン表示**（ツール一覧とメッセージでアイコン表示）
- **⚙️ 設定管理**（モデル、温度、ストリーミングモード）
- **📊 リアルタイム状態表示**（サーバー接続状態、ツール使用状況）

## 🏗️ プロジェクト構造

```
OneAgent/
├── server.js                 # メインサーバー
├── create-tool.js            # ツール作成ヘルパー（アイコン対応）
├── test.js                   # MCP機能テスト
├── test-agent.js             # AIエージェント機能テスト
├── package.json              # サーバー側依存関係
├── .env_sample               # 環境変数サンプル
├── ai-agent-chat/           # React WebUI
│   ├── src/
│   │   └── App.jsx          # メインチャットコンポーネント
│   ├── package.json         # フロントエンド依存関係
│   └── public/
└── YourTool/                # ツールディレクトリ
    ├── add_numbers/
    │   ├── config.json      # ツール設定
    │   ├── handler.js       # ツール実行ロジック
    │   └── add_numbers_icon.svg  # アイコンファイル（オプション）
    ├── multiply_numbers/
    └── process_string/
```

## 🚀 環境構築

### 1. リポジトリのクローン

```bash
git clone https://github.com/shibata-rui-dn/OneAgent.git
cd OneAgent
```

### 2. サーバー側の依存関係をインストール

```bash
# ルートディレクトリで実行
npm install
```

### 3. フロントエンド（WebUI）の依存関係をインストール

```bash
# ai-agent-chatディレクトリに移動してインストール
cd ai-agent-chat
npm install
cd ..
```

### 4. 環境変数の設定

```bash
# .env_sampleをコピーして.envファイルを作成
cp .env_sample .env

# .envファイルを編集してAPI Keyを設定
nano .env
```

**.env ファイルの設定例:**

```bash
# 必須: OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here

# AIプロバイダー設定
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
AI_STREAMING=true
AI_TEMPERATURE=0.7
AI_MAX_TOKENS=2000

# サーバー設定
PORT=3000
HOST=localhost

# Azure OpenAI を使用する場合は以下も設定
# AI_PROVIDER=azureopenai
# AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
# AZURE_OPENAI_API_VERSION=2024-02-15-preview
```

### 5. サーバーの起動

```bash
# サーバーを起動（ルートディレクトリで実行）
npm start

# または直接実行
node server.js
```

### 6. WebUIの起動

```bash
# 新しいターミナルでフロントエンドを起動
cd ai-agent-chat
npm start
```

### 7. アクセス

- **WebUI**: http://localhost:5173 （メインインターフェース）
- **API サーバー**: http://localhost:3000
- **ヘルスチェック**: http://localhost:3000/health

## 🖼️ ツールアイコン機能

### アイコン付きツールの作成

```bash
# 対話的にアイコン付きツールを作成
node create-tool.js --interactive

# 作成時にアイコンオプションが表示されます：
# 🎨 アイコンを作成しますか? (y/N): y
# アイコンの説明: 天気予報アイコン
# アイコンタイプを選択してください:
# 1. 🔧 ツール系 (レンチ、ハンマー、設定など)
# 2. 📊 データ系 (グラフ、チャート、データベースなど)
# 3. 🌐 ネットワーク系 (クラウド、API、ネットワークなど)
# ...
```

### 利用可能なアイコンテーマ

| タイプ | 説明 | 用途例 |
|--------|------|--------|
| 🔧 ツール系 | レンチ、設定アイコン | システム管理、設定変更 |
| 📊 データ系 | グラフ、チャート | データ分析、統計処理 |
| 🌐 ネットワーク系 | クラウド、API | Web API、外部サービス連携 |
| 📁 ファイル系 | ファイル、ドキュメント | ファイル処理、文書操作 |
| 🎯 アクション系 | 再生、実行 | タスク実行、プロセス制御 |
| 🧮 計算系 | 計算機、数学記号 | 数値計算、数学処理 |
| 🎨 カスタム | ツール名ベース | 独自デザイン |

### カラーパレット

- **Blue** (デフォルト): #3B82F6
- **Green**: #10B981  
- **Red**: #EF4444
- **Orange**: #F97316
- **Purple**: #8B5CF6
- **Gray**: #6B7280

## 🎯 WebUIでのツール選択機能

### 基本的な使い方

1. **サイドバーのツール一覧**で使用したいツールを選択
2. **ツール選択状態**が表示される（選択数/総数）
3. **チャットで質問**すると、選択されたツールのみがAIエージェントで利用可能
4. **メッセージ内でツール使用履歴**とアイコンが表示される

### ツール選択オプション

- ✅ **すべて選択**: 全ツールを一括選択
- ❌ **すべて解除**: 全ツール選択を解除
- 🔄 **ツールを再読み込み**: サーバーからツール一覧を再取得

### 選択状態の表示

- 🟢 **すべて選択中**: 全ツールが利用可能
- 🔵 **部分選択中**: 一部ツールが選択済み
- 🔴 **未選択**: ツールが選択されていない（要注意）

## 🤖 AIエージェント機能

### WebUIでの基本的な使用

1. **ツールを選択**（サイドバー）
2. **質問を入力**（例："5と3を足してください"）
3. **送信**するとAIが適切なツールを選択・実行
4. **結果とツール使用履歴**が表示される

### 設定オプション（サイドバー）

- **モデル選択**: GPT-4o-mini, GPT-4o, GPT-3.5 Turbo
- **温度調整**: 0.0（決定論的）〜 1.0（創造的）
- **ストリーミングモード**: リアルタイム応答の有効/無効

### HTTP API での使用

#### 基本的なクエリ（ツール選択必須）

```bash
curl -X POST http://localhost:3000/agent \
  -H "Content-Type: application/json" \
  -d '{
    "query": "5と3を足してください",
    "tools": ["add_numbers"],
    "streaming": false
  }'
```

#### 複数ツール使用

```bash
curl -X POST http://localhost:3000/agent \
  -H "Content-Type: application/json" \
  -d '{
    "query": "計算してから文字列処理してください",
    "tools": ["add_numbers", "multiply_numbers", "process_string"],
    "streaming": false
  }'
```

#### ツール未使用（一般会話）

```bash
curl -X POST http://localhost:3000/agent \
  -H "Content-Type: application/json" \
  -d '{
    "query": "こんにちは、調子はどうですか？",
    "tools": [],
    "streaming": false
  }'
```

## 🛠️ カスタムツールの作成

### アイコン付きツールの対話的作成

```bash
node create-tool.js --interactive
```

**作成フロー:**
1. ツール名入力
2. 説明入力
3. **アイコン作成選択** (y/N)
4. アイコン設定（タイプ、色）
5. パラメータ定義
6. 処理タイプ選択

### 手動でのツール作成

#### 1. ディレクトリ作成

```bash
mkdir YourTool/weather_checker
```

#### 2. config.json（アイコン情報含む）

```json
{
  "name": "weather_checker",
  "description": "指定された都市の天気情報を取得します",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "city": {
        "type": "string",
        "description": "天気を確認したい都市名"
      }
    },
    "required": ["city"],
    "additionalProperties": false
  },
  "icon": {
    "filename": "weather_checker_icon.svg",
    "description": "天気チェックアイコン",
    "type": "3",
    "colorScheme": "blue"
  }
}
```

#### 3. handler.js

```javascript
export default async function weatherChecker(args) {
  const { city } = args;
  
  if (typeof city !== 'string' || !city.trim()) {
    throw new Error("cityは必須の文字列です");
  }
  
  try {
    // 天気API呼び出し（例）
    const response = await fetch(`https://api.weather.com/v1/current?city=${city}`);
    const data = await response.json();
    
    return {
      content: [
        {
          type: "text",
          text: `${city}の天気: ${data.weather}, 気温: ${data.temperature}°C`
        }
      ]
    };
  } catch (error) {
    throw new Error(`天気情報の取得に失敗しました: ${error.message}`);
  }
}
```

#### 4. アイコンファイル（オプション）

create-tool.jsで自動生成するか、手動で作成：

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- カスタムアイコンデザイン -->
  <circle cx="12" cy="12" r="4" fill="#3B82F6" stroke="#1E40AF" stroke-width="2"/>
  <path d="M8 12l-2-2M16 12l2-2M12 8V6M12 16v2" stroke="#3B82F6" stroke-width="2"/>
</svg>
```

#### 5. ツールの読み込み

```bash
# サーバーでツールをリロード
curl -X POST http://localhost:3000/tools/reload

# WebUIで「ツールを再読み込み」ボタンをクリック
```

## 📝 付属のサンプルツール

### add_numbers 🧮
- **説明**: 2つの数値の和を計算
- **引数**: `a` (number), `b` (number)
- **アイコン**: 青い計算機アイコン
- **使用例**: "5と3を足してください"

### multiply_numbers 🧮
- **説明**: 2つの数値の積を計算
- **引数**: `a` (number), `b` (number)
- **アイコン**: 緑の計算機アイコン
- **使用例**: "12と8を掛けてください"

### process_string 📁
- **説明**: 文字列処理（長さ、大文字変換など）
- **引数**: `text` (string), `operation` (enum)
- **アイコン**: オレンジのファイルアイコン
- **使用例**: "「Hello World」を大文字にしてください"

## 🔧 API リファレンス

### ツール関連エンドポイント

#### ツール一覧取得（アイコン情報含む）
```bash
GET /tools

# レスポンス例
{
  "tools": [
    {
      "name": "add_numbers",
      "description": "2つの数値を受け取って、その和を返します",
      "version": "1.0.0",
      "inputSchema": { ... },
      "icon": {
        "filename": "add_numbers_icon.svg",
        "description": "加算計算アイコン",
        "type": "6",
        "colorScheme": "blue"
      },
      "hasIcon": true
    }
  ],
  "count": 3
}
```

#### ツールアイコン取得
```bash
GET /tools/:toolName/icon

# レスポンス: SVGファイル
Content-Type: image/svg+xml
Cache-Control: public, max-age=3600
```

#### AIエージェント（ツール選択必須）
```bash
POST /agent
Content-Type: application/json

{
  "query": "ユーザーの質問",
  "tools": ["tool1", "tool2"],  // 必須: 使用するツールの配列
  "streaming": false,           // オプション
  "temperature": 0.7,           // オプション
  "model": "gpt-4o-mini"       // オプション
}
```

## 🧪 テスト

### 基本テスト

```bash
# MCP機能テスト
npm test

# または
node test.js
```

### AIエージェント機能テスト

```bash
# 基本テスト
npm run test:agent

# または
node test-agent.js

# 使用例表示
node test-agent.js --examples
```

### 手動テスト

```bash
# ヘルスチェック
curl http://localhost:3000/health

# ツール一覧
curl http://localhost:3000/tools

# AIエージェントテスト（ツール選択必須）
curl -X POST http://localhost:3000/agent \
  -H "Content-Type: application/json" \
  -d '{"query": "テスト", "tools": ["add_numbers"]}'
```

## 🌐 環境変数リファレンス

| 変数名 | デフォルト値 | 説明 |
|--------|-------------|------|
| `PORT` | `3000` | サーバーのポート番号 |
| `HOST` | `localhost` | サーバーのホストアドレス |
| `OPENAI_API_KEY` | - | **必須**: OpenAI または Azure OpenAI API Key |
| `AI_PROVIDER` | `openai` | AIプロバイダー (`openai` または `azureopenai`) |
| `AI_MODEL` | `gpt-4o-mini` | 使用するモデル名 |
| `AI_STREAMING` | `true` | ストリーミング有効/無効 |
| `AI_TEMPERATURE` | `0.7` | 生成の創造性 (0.0-2.0) |
| `AI_MAX_TOKENS` | `2000` | 最大トークン数 |
| `AZURE_OPENAI_ENDPOINT` | - | Azure OpenAI使用時のエンドポイント |
| `AZURE_OPENAI_API_VERSION` | `2024-02-15-preview` | Azure OpenAI APIバージョン |

## 🎨 WebUI カスタマイズ

### Tailwind CSSクラス

WebUIはTailwind CSSを使用しており、`ai-agent-chat/src/App.jsx`でカスタマイズ可能：

```jsx
// カラーテーマの変更例
const primaryColor = 'blue'; // blue, green, red, orange, purple, gray

// アイコンサイズの調整
<ToolIcon toolName={toolName} className="w-6 h-6" /> // サイズ変更
```

### レスポンシブデザイン

- **デスクトップ**: サイドバー常時表示
- **タブレット/モバイル**: ハンバーガーメニューで切り替え
- **ツール選択**: スクロール可能なリスト表示

## 🐛 トラブルシューティング

### よくある問題と解決方法

#### 1. 環境構築関連

**Q: `npm install` でエラーが発生する**
```bash
# Node.js バージョン確認（22以上が必要）
node --version

# キャッシュクリア後に再インストール
npm cache clean --force
npm install
```

**Q: フロントエンドが起動しない**
```bash
# ai-agent-chatディレクトリで依存関係を確認
cd ai-agent-chat
npm install
npm start
```

#### 2. API Key 関連

**Q: AIエージェントが利用できない**
```bash
# .envファイルの確認
cat .env

# API Keyが設定されているか確認
echo $OPENAI_API_KEY

# サーバーの健康状態を確認
curl http://localhost:3000/health
```

#### 3. ツール関連

**Q: 作成したツールが表示されない**
```bash
# ツールをリロード
curl -X POST http://localhost:3000/tools/reload

# またはWebUIで「ツールを再読み込み」をクリック
```

**Q: ツールが呼び出されない**
- WebUIでツールが選択されているか確認
- ツールの説明文を明確にする
- AIに対してより具体的な指示を出す

#### 4. WebUI 関連

**Q: WebUIでツールアイコンが表示されない**
```bash
# アイコンファイルの存在確認
ls YourTool/your_tool_name/*.svg

# アイコンエンドポイントの確認
curl http://localhost:3000/tools/your_tool_name/icon
```

**Q: ツール選択が反映されない**
- ブラウザをリフレッシュ
- サーバーとの接続状態を確認（ヘッダーの接続状態インジケーター）

#### 5. Azure OpenAI 関連

**Q: Azure OpenAI接続エラー**
```bash
# 必要な環境変数を.envに設定
AI_PROVIDER=azureopenai
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
OPENAI_API_KEY=your_azure_key
AZURE_OPENAI_API_VERSION=2024-02-15-preview
```

## 💡 開発のヒント

### 効果的なツール設計

1. **明確な説明**: AIが適切にツールを選択できるよう詳細に記載
2. **適切なスキーマ**: 引数の型と説明を正確に定義
3. **エラーハンドリング**: 想定外の入力に対する適切なエラーメッセージ
4. **アイコンデザイン**: ツールの機能を視覚的に表現

### WebUIの効果的な使用

1. **ツール選択**: 必要最小限のツールを選択してノイズを減らす
2. **具体的な質問**: "計算してください" より "5と3を足してください"
3. **複合タスク**: 複数のツールを組み合わせた質問も可能
4. **設定調整**: 創造的な回答には高い温度、正確な計算には低い値

### 開発フロー

1. **ツール作成**: `node create-tool.js --interactive`
2. **実装**: handler.jsにロジックを実装
3. **テスト**: WebUIで動作確認
4. **リロード**: 変更後は「ツールを再読み込み」
5. **デプロイ**: サーバー再起動で本番反映

## 📚 参考資料

- [Model Context Protocol 公式ドキュメント](https://modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Azure OpenAI Service Documentation](https://docs.microsoft.com/en-us/azure/cognitive-services/openai/)
- [React Documentation](https://react.dev/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [Vite Documentation](https://vitejs.dev/)

## 📄 ライセンス

MIT License

---

## 🚀 クイックスタート

```bash
# 1. リポジトリクローン
git clone https://github.com/shibata-rui-dn/OneAgent.git
cd OneAgent

# 2. 依存関係インストール
npm install
cd ai-agent-chat && npm install && cd ..

# 3. 環境設定
cp .env_sample .env
# .envファイルを編集してOPENAI_API_KEYを設定

# 4. サーバー起動
npm start

# 5. WebUI起動（新しいターミナル）
cd ai-agent-chat && npm start

# 6. アクセス
# WebUI: http://localhost:5173
# API: http://localhost:3000
```

これで準備完了です！WebUIでツールを選択してAIエージェントと会話を始めましょう！🎉