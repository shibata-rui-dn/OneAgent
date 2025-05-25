#!/bin/bash

# OneAgent Python連携 - 依存関係インストールスクリプト
# このスクリプトはPython環境とOneAgent Python連携に必要なパッケージをインストールします

set -e  # エラー時に終了

echo "🐍 OneAgent Python連携セットアップ開始"
echo "======================================"

# 現在のディレクトリを確認
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_INTEGRATION_DIR="$(dirname "$SCRIPT_DIR")"
ONEAGENT_ROOT="$(dirname "$PYTHON_INTEGRATION_DIR")"

echo "📂 作業ディレクトリ: $PYTHON_INTEGRATION_DIR"
echo "📂 OneAgentルート: $ONEAGENT_ROOT"

# Python バージョンチェック
echo ""
echo "🔍 Python環境チェック"
echo "-------------------"

if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo "✅ Python3が見つかりました: $PYTHON_VERSION"
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_VERSION=$(python --version)
    echo "✅ Pythonが見つかりました: $PYTHON_VERSION"
    PYTHON_CMD="python"
else
    echo "❌ Pythonが見つかりません"
    echo "   Python 3.8以上をインストールしてから再実行してください"
    echo "   https://www.python.org/downloads/"
    exit 1
fi

# pip チェック
if ! command -v pip &> /dev/null && ! command -v pip3 &> /dev/null; then
    echo "❌ pipが見つかりません"
    echo "   pipをインストールしてから再実行してください"
    exit 1
fi

PIP_CMD="pip3"
if ! command -v pip3 &> /dev/null; then
    PIP_CMD="pip"
fi

echo "✅ パッケージマネージャー: $PIP_CMD"

# 仮想環境の作成・確認
echo ""
echo "🏠 仮想環境セットアップ"
echo "--------------------"

cd "$PYTHON_INTEGRATION_DIR"

if [ -d "venv" ]; then
    echo "✅ 仮想環境が既に存在します"
else
    echo "🔄 仮想環境を作成中..."
    $PYTHON_CMD -m venv venv
    echo "✅ 仮想環境を作成しました"
fi

# 仮想環境のアクティベート
echo "🔄 仮想環境をアクティベート中..."
source venv/bin/activate || source venv/Scripts/activate

# pip のアップグレード
echo "🔄 pipをアップグレード中..."
python -m pip install --upgrade pip

# 基本パッケージのインストール
echo ""
echo "📦 基本パッケージインストール"
echo "---------------------------"

echo "🔄 基本パッケージをインストール中..."
pip install -r requirements.txt

# オプションパッケージのインストール（エラーがあっても続行）
echo ""
echo "📦 オプションパッケージインストール"
echo "---------------------------------"

echo "🔄 NLTK データダウンロード..."
python -c "
import nltk
try:
    nltk.download('punkt', quiet=True)
    nltk.download('stopwords', quiet=True)
    nltk.download('averaged_perceptron_tagger', quiet=True)
    print('✅ NLTKデータダウンロード完了')
except Exception as e:
    print(f'⚠️ NLTKデータダウンロード中にエラー: {e}')
"

# MeCab のインストール（日本語形態素解析）
echo "🔄 MeCab（日本語解析）のインストールを試行..."
pip install mecab-python3 2>/dev/null && echo "✅ MeCabインストール成功" || echo "⚠️ MeCabインストールをスキップ（オプション）"

# インストール確認
echo ""
echo "🧪 インストール確認テスト"
echo "----------------------"

python -c "
import sys
print(f'✅ Python: {sys.version}')

# 基本パッケージ
packages = ['requests', 'numpy', 'pandas', 'scikit-learn']
for pkg in packages:
    try:
        __import__(pkg)
        print(f'✅ {pkg}: インストール済み')
    except ImportError:
        print(f'❌ {pkg}: インストール失敗')

# オプションパッケージ
optional_packages = ['nltk', 'textblob', 'PIL', 'cv2']
for pkg in optional_packages:
    try:
        if pkg == 'PIL':
            from PIL import Image
        elif pkg == 'cv2':
            import cv2
        else:
            __import__(pkg)
        print(f'✅ {pkg}: インストール済み')
    except ImportError:
        print(f'⚠️ {pkg}: インストールされていません（オプション）')
"

# サンプルスクリプトのテスト
echo ""
echo "🧪 サンプルスクリプトテスト"
echo "------------------------"

if [ -f "examples/weather_api.py" ]; then
    echo "🔄 天気APIスクリプトテスト..."
    if python examples/weather_api.py --function weather --city Tokyo > /dev/null 2>&1; then
        echo "✅ 天気APIスクリプト: 正常動作"
    else
        echo "⚠️ 天気APIスクリプト: エラーあり（要確認）"
    fi
else
    echo "⚠️ weather_api.py が見つかりません"
fi

if [ -f "examples/text_analyzer.py" ]; then
    echo "🔄 テキスト分析スクリプトテスト..."
    if python examples/text_analyzer.py --function sentiment --text "テスト" > /dev/null 2>&1; then
        echo "✅ テキスト分析スクリプト: 正常動作"
    else
        echo "⚠️ テキスト分析スクリプト: エラーあり（要確認）"
    fi
else
    echo "⚠️ text_analyzer.py が見つかりません"
fi

# OneAgentツールディレクトリの作成
echo ""
echo "🛠️ OneAgentツール統合"
echo "-------------------"

TOOLS_DIR="$ONEAGENT_ROOT/YourTool"
if [ ! -d "$TOOLS_DIR" ]; then
    echo "⚠️ YourToolディレクトリが見つかりません: $TOOLS_DIR"
    echo "   OneAgentのルートディレクトリから実行してください"
else
    echo "✅ YourToolディレクトリを確認しました: $TOOLS_DIR"
    
    # サンプルツールのセットアップオプション
    echo ""
    echo "🎯 サンプルツールの作成"
    echo "-------------------"
    echo "サンプルツールを自動作成しますか？"
    echo "1) 天気情報ツール"
    echo "2) テキスト分析ツール"
    echo "3) 両方"
    echo "4) スキップ"
    read -p "選択してください (1-4): " choice
    
    case $choice in
        1|3)
            echo "🔄 天気情報ツールを作成中..."
            mkdir -p "$TOOLS_DIR/python_weather_tool"
            cp examples/weather_api.py "$TOOLS_DIR/python_weather_tool/"
            cp handlers/python_direct_handler.js "$TOOLS_DIR/python_weather_tool/handler.js"
            cp configs/weather_tool_config.json "$TOOLS_DIR/python_weather_tool/config.json"
            echo "✅ 天気情報ツールを作成しました"
            ;;
    esac
    
    case $choice in
        2|3)
            echo "🔄 テキスト分析ツールを作成中..."
            mkdir -p "$TOOLS_DIR/python_text_analyzer"
            cp examples/text_analyzer.py "$TOOLS_DIR/python_text_analyzer/"
            cp handlers/python_direct_handler.js "$TOOLS_DIR/python_text_analyzer/handler.js"
            cp configs/text_tool_config.json "$TOOLS_DIR/python_text_analyzer/config.json"
            echo "✅ テキスト分析ツールを作成しました"
            ;;
    esac
fi

echo ""
echo "🎉 セットアップ完了！"
echo "=================="
echo ""
echo "次のステップ:"
echo "1. OneAgentサーバーを起動: npm start"
echo "2. ツールをリロード: curl -X POST http://localhost:3000/tools/reload"
echo "3. WebUIでツールを確認: http://localhost:5173"
echo ""
echo "仮想環境の使用方法:"
echo "  アクティベート: source python-integration/venv/bin/activate"
echo "  非アクティベート: deactivate"
echo ""
echo "トラブルシューティング:"
echo "  ログ確認: python examples/weather_api.py --function weather --city Tokyo"
echo "  設定確認: cat configs/weather_tool_config.json"
echo ""
echo "ドキュメント: python-integration/README.md"