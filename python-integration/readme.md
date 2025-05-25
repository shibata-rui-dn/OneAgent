# OneAgent Python連携ガイド 🐍

このディレクトリには、OneAgentとPythonコードを連携するためのサンプルコード、設定ファイル、および詳細な手順が含まれています。

## 📋 概要

OneAgentでPythonの機能を活用する方法は2つあります：

1. **直接実行方式** (推奨): Node.jsからPythonスクリプトを直接実行
2. **HTTP API方式**: FastAPIサーバーを構築してHTTP経由で呼び出し

## 🏗️ ディレクトリ構成

```
python-integration/
├── README.md                    # このファイル
├── requirements.txt             # Python依存関係
├── examples/                    # Pythonサンプルコード
│   ├── weather_api.py          # 天気情報取得
│   ├── ml_analysis.py          # 機械学習分析
│   ├── text_analyzer.py        # テキスト分析
│   ├── image_processor.py      # 画像処理
│   └── fastapi_server.py       # HTTP APIサーバー
├── handlers/                    # JavaScript連携ハンドラー
│   ├── python_direct_handler.js # 直接実行用
│   └── python_api_handler.js   # HTTP API用
├── configs/                     # ツール設定ファイル
│   ├── weather_tool_config.json
│   ├── ml_tool_config.json
│   └── text_tool_config.json
└── setup/                       # セットアップスクリプト
    ├── install_dependencies.sh
    └── create_tools.sh
```

## 🚀 クイックスタート

### 1. Python環境のセットアップ

```bash
# OneAgentのルートディレクトリから実行
cd python-integration

# 仮想環境を作成（推奨）
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# または venv\Scripts\activate  # Windows

# 依存関係をインストール
pip install -r requirements.txt
```

### 2. 方法1: 直接実行方式（推奨）

#### サンプルツールの作成

```bash
# 天気情報ツール
cd ../YourTool
mkdir python_weather_tool
cd python_weather_tool

# ファイルをコピー
cp ../../python-integration/examples/weather_api.py .
cp ../../python-integration/handlers/python_direct_handler.js ./handler.js
cp ../../python-integration/configs/weather_tool_config.json ./config.json

# テスト実行
python3 weather_api.py --function weather --city Tokyo

# OneAgentでツールをリロード
curl -X POST http://localhost:3000/tools/reload
```

#### 機械学習ツールの作成

```bash
# MLツール
mkdir ../python_ml_tool
cd ../python_ml_tool

cp ../../python-integration/examples/ml_analysis.py .
cp ../../python-integration/handlers/python_direct_handler.js ./handler.js
cp ../../python-integration/configs/ml_tool_config.json ./config.json

# scikit-learnが必要
pip install scikit-learn

# ツールをリロード
curl -X POST http://localhost:3000/tools/reload
```

### 3. 方法2: HTTP API方式

#### FastAPIサーバーの起動

```bash
cd python-integration

# FastAPI依存関係をインストール
pip install fastapi uvicorn

# APIサーバーを起動
uvicorn examples.fastapi_server:app --host 0.0.0.0 --port 8001 --reload
```

#### HTTP API連携ツールの作成

```bash
cd ../YourTool
mkdir python_api_tools
cd python_api_tools

cp ../../python-integration/handlers/python_api_handler.js ./handler.js
cp ../../python-integration/configs/api_tool_config.json ./config.json

# ツールをリロード
curl -X POST http://localhost:3000/tools/reload
```

## 🛠️ サンプルツールの詳細

### 1. 天気情報取得ツール

**機能**: 指定された都市の天気情報を取得
**使用例**: "東京の天気を教えて"

```python
# 基本的な使用方法
python3 weather_api.py --function weather --city Tokyo

# API Key付き（実際のOpenWeatherMap API使用）
python3 weather_api.py --function weather --city Tokyo --api_key YOUR_API_KEY
```

### 2. 機械学習分析ツール

**機能**: 線形回帰、クラスタリング、時系列分析、異常値検出
**使用例**: "この売上データを予測して"

```python
# 線形回帰予測
python3 ml_analysis.py --function predict --data '[{"x":1,"y":2},{"x":2,"y":4}]'

# クラスタリング
python3 ml_analysis.py --function cluster --data '[{"x":1,"y":2},{"x":5,"y":6}]'

# 時系列分析
python3 ml_analysis.py --function timeseries --data '[{"value":100},{"value":110}]'
```

### 3. テキスト分析ツール

**機能**: 感情分析、キーワード抽出、要約
**使用例**: "このテキストの感情を分析して"

```python
# 感情分析
python3 text_analyzer.py --function sentiment --text "今日は素晴らしい天気です"

# キーワード抽出
python3 text_analyzer.py --function keywords --text "機械学習は人工知能の一分野です"
```

### 4. 画像処理ツール

**機能**: 画像のリサイズ、フィルター適用、メタデータ抽出
**使用例**: "この画像をリサイズして"

```python
# 画像リサイズ
python3 image_processor.py --function resize --input image.jpg --width 300 --height 200
```

## ⚙️ カスタムツールの作成

### Step 1: Pythonスクリプトの作成

```python
#!/usr/bin/env python3
"""
カスタムPythonツールのテンプレート
"""
import json
import argparse

def your_custom_function(param1, param2):
    """あなたの処理ロジック"""
    try:
        # 処理を実装
        result = f"処理結果: {param1} + {param2}"
        
        return {
            "success": True,
            "data": result
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--function', required=True)
    parser.add_argument('--param1', required=True)
    parser.add_argument('--param2', required=True)
    
    args = parser.parse_args()
    
    if args.function == 'custom':
        result = your_custom_function(args.param1, args.param2)
    else:
        result = {"success": False, "error": "Unknown function"}
    
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
```

### Step 2: JavaScriptハンドラーの作成

```javascript
import { spawn } from 'child_process';
import path from 'path';

export default async function yourCustomTool(args) {
  const { param1, param2 } = args;
  
  // バリデーション
  if (!param1 || !param2) {
    throw new Error("param1とparam2は必須です");
  }
  
  try {
    const scriptPath = path.join(__dirname, 'your_script.py');
    const pythonArgs = [
      '--function', 'custom',
      '--param1', param1,
      '--param2', param2
    ];
    
    const result = await executePython(scriptPath, pythonArgs);
    
    if (result.success) {
      return {
        content: [{
          type: "text",
          text: result.data
        }]
      };
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    throw new Error(`処理エラー: ${error.message}`);
  }
}
```

### Step 3: 設定ファイルの作成

```json
{
  "name": "your_custom_tool",
  "description": "あなたのカスタムツールの説明",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "param1": {
        "type": "string",
        "description": "パラメータ1の説明"
      },
      "param2": {
        "type": "string", 
        "description": "パラメータ2の説明"
      }
    },
    "required": ["param1", "param2"],
    "additionalProperties": false
  },
  "icon": {
    "filename": "sample_icon.svg(別途作成してください)",
    "description": "説明を追加してください",
  }
}
```

## 🧪 テストとデバッグ

### Python単体テスト

```bash
# スクリプトが正常に動作するかテスト
python3 examples/weather_api.py --function weather --city Tokyo

# 出力がJSONとして正しいかチェック
python3 examples/weather_api.py --function weather --city Tokyo | jq .
```

### OneAgent統合テスト

```bash
# ツールがロードされているか確認
curl http://localhost:3000/tools

# AIエージェントでテスト
curl -X POST http://localhost:3000/agent \
  -H "Content-Type: application/json" \
  -d '{
    "query": "東京の天気を教えて",
    "tools": ["python_weather_tool"],
    "streaming": false
  }'
```

### デバッグ方法

1. **Pythonスクリプトのデバッグ**:
   ```python
   import logging
   logging.basicConfig(level=logging.DEBUG)
   logger = logging.getLogger(__name__)
   logger.debug("デバッグメッセージ")
   ```

2. **JavaScriptハンドラーのデバッグ**:
   ```javascript
   console.log(`Python実行: ${scriptPath} ${args.join(' ')}`);
   console.log(`実行結果:`, result);
   ```

3. **エラーログの確認**:
   ```bash
   # OneAgentサーバーのログを確認
   tail -f server.log
   ```

## 🎯 実用的な使用例

### 1. データ分析ワークフロー

```
ユーザー: "このCSVデータを分析して予測モデルを作って"
↓
AI: CSVを読み込み → データクリーニング → 機械学習モデル訓練 → 予測結果を返す
```

### 2. 自然言語処理パイプライン

```
ユーザー: "このドキュメントを要約して感情分析もして"
↓ 
AI: テキスト前処理 → 要約生成 → 感情分析 → 結果をまとめて返す
```

### 3. 画像処理ワークフロー

```
ユーザー: "この画像をリサイズしてフィルターをかけて"
↓
AI: 画像読み込み → リサイズ処理 → フィルター適用 → 結果画像を保存
```

## 🔧 トラブルシューティング

### よくある問題と解決方法

#### 1. Python実行エラー
```bash
# Python実行パスの確認
which python3
# 仮想環境の確認
echo $VIRTUAL_ENV
# パッケージの確認
pip list
```

#### 2. 文字化け問題
```python
# Pythonスクリプトの先頭に追加
# -*- coding: utf-8 -*-
import sys
import locale
sys.stdout.reconfigure(encoding='utf-8')
```

#### 3. タイムアウト問題
```javascript
// JavaScriptハンドラーでタイムアウト時間を調整
const result = await executePython(scriptPath, args, 60000); // 60秒
```

#### 4. メモリ不足
```python
# 大量データ処理時はチャンク処理を使用
def process_large_data(data, chunk_size=1000):
    for i in range(0, len(data), chunk_size):
        chunk = data[i:i+chunk_size]
        yield process_chunk(chunk)
```

## 📚 参考資料

- [Python公式ドキュメント](https://docs.python.org/)
- [FastAPI公式ドキュメント](https://fastapi.tiangolo.com/)
- [scikit-learn公式ドキュメント](https://scikit-learn.org/)
- [Pandas公式ドキュメント](https://pandas.pydata.org/)
- [NumPy公式ドキュメント](https://numpy.org/)

## 🤝 コントリビューション

新しいPythonツールのサンプルや改善案があれば、ぜひPull Requestをお送りください！

1. 新しいPythonスクリプトを`examples/`に追加
2. 対応するJavaScriptハンドラーを`handlers/`に追加
3. 設定ファイルを`configs/`に追加
4. このREADMEを更新

## 📄 ライセンス

MIT License - OneAgentプロジェクトと同じライセンスを適用