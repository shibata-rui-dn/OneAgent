#!/bin/bash

# OneAgent Python連携 - ツール自動作成スクリプト
# このスクリプトはPython連携ツールを自動的にOneAgentのYourToolディレクトリに作成します

set -e  # エラー時に終了

echo "🛠️ OneAgent Python連携ツール自動作成"
echo "====================================="

# ディレクトリの設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_INTEGRATION_DIR="$(dirname "$SCRIPT_DIR")"
ONEAGENT_ROOT="$(dirname "$PYTHON_INTEGRATION_DIR")"
TOOLS_DIR="$ONEAGENT_ROOT/YourTool"

echo "📂 Python連携ディレクトリ: $PYTHON_INTEGRATION_DIR"
echo "📂 OneAgentルート: $ONEAGENT_ROOT"
echo "📂 ツールディレクトリ: $TOOLS_DIR"

# ツールズディレクトリの確認
if [ ! -d "$TOOLS_DIR" ]; then
    echo "❌ YourToolディレクトリが見つかりません: $TOOLS_DIR"
    echo "   OneAgentのルートディレクトリから実行してください"
    exit 1
fi

echo "✅ ツールディレクトリを確認しました"

# 利用可能なツール定義
declare -A TOOLS=(
    ["weather"]="天気情報取得ツール"
    ["text"]="テキスト分析ツール"
    ["ml"]="機械学習分析ツール"
    ["image"]="画像処理ツール"
    ["api"]="HTTP API統合ツール"
)

# ツール選択メニュー表示
show_tool_menu() {
    echo ""
    echo "🎯 作成するツールを選択してください:"
    echo "1) 天気情報取得ツール（直接実行）"
    echo "2) テキスト分析ツール（直接実行）"
    echo "3) 機械学習分析ツール（直接実行）"
    echo "4) 画像処理ツール（直接実行）"
    echo "5) HTTP API統合ツール（FastAPI連携）"
    echo "6) 全ツール作成（推奨）"
    echo "7) カスタム選択"
    echo "0) 終了"
}

# 個別ツール作成関数
create_weather_tool() {
    local method=$1  # "direct" or "api"
    local tool_name="python_weather_${method}"
    
    echo "🌤️ 天気情報ツール作成中（${method}方式）..."
    
    # ディレクトリ作成
    mkdir -p "$TOOLS_DIR/$tool_name"
    
    if [ "$method" = "direct" ]; then
        # 直接実行方式
        cp "$PYTHON_INTEGRATION_DIR/examples/weather_api.py" "$TOOLS_DIR/$tool_name/"
        cp "$PYTHON_INTEGRATION_DIR/handlers/python_direct_handler.js" "$TOOLS_DIR/$tool_name/handler.js"
        cp "$PYTHON_INTEGRATION_DIR/configs/weather_tool_config.json" "$TOOLS_DIR/$tool_name/config.json"
    else
        # HTTP API方式
        cp "$PYTHON_INTEGRATION_DIR/handlers/python_api_handler.js" "$TOOLS_DIR/$tool_name/handler.js"
        
        # API用設定ファイル生成
        cat > "$TOOLS_DIR/$tool_name/config.json" << EOF
{
  "name": "python_weather_api",
  "description": "HTTP API経由でPythonの天気情報取得機能を使用します。FastAPIサーバーが必要です。",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "city": {
        "type": "string",
        "description": "天気を確認したい都市名"
      },
      "api_key": {
        "type": "string",
        "description": "OpenWeatherMap API Key（オプション）"
      },
      "country_code": {
        "type": "string",
        "description": "国コード（オプション）"
      }
    },
    "required": ["city"],
    "additionalProperties": false
  },
  "icon": {
    "filename": "weather_api_icon.svg",
    "description": "天気API連携アイコン",
    "type": "3",
    "colorScheme": "blue"
  },
  "api_integration": {
    "server_url": "http://localhost:8001",
    "endpoint": "/weather",
    "method": "POST",
    "requires_server": true
  }
}
EOF
    fi
    
    # アイコンファイル作成
    create_weather_icon "$TOOLS_DIR/$tool_name"
    
    echo "✅ 天気情報ツール（${method}方式）を作成しました"
}

create_text_tool() {
    local method=$1
    local tool_name="python_text_${method}"
    
    echo "📝 テキスト分析ツール作成中（${method}方式）..."
    
    mkdir -p "$TOOLS_DIR/$tool_name"
    
    if [ "$method" = "direct" ]; then
        cp "$PYTHON_INTEGRATION_DIR/examples/text_analyzer.py" "$TOOLS_DIR/$tool_name/"
        cp "$PYTHON_INTEGRATION_DIR/handlers/python_direct_handler.js" "$TOOLS_DIR/$tool_name/handler.js"
        cp "$PYTHON_INTEGRATION_DIR/configs/text_tool_config.json" "$TOOLS_DIR/$tool_name/config.json"
    else
        cp "$PYTHON_INTEGRATION_DIR/handlers/python_api_handler.js" "$TOOLS_DIR/$tool_name/handler.js"
        
        cat > "$TOOLS_DIR/$tool_name/config.json" << EOF
{
  "name": "python_text_api",
  "description": "HTTP API経由でPythonのテキスト分析機能を使用します。感情分析、キーワード抽出、要約などが可能です。",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": {
        "type": "string",
        "description": "分析対象のテキスト"
      },
      "analysis_type": {
        "type": "string",
        "enum": ["sentiment", "keywords", "summary"],
        "description": "分析タイプ",
        "default": "sentiment"
      },
      "max_keywords": {
        "type": "integer",
        "description": "キーワード抽出数",
        "default": 10
      },
      "sentence_count": {
        "type": "integer",
        "description": "要約文章数",
        "default": 3
      }
    },
    "required": ["text"],
    "additionalProperties": false
  },
  "api_integration": {
    "server_url": "http://localhost:8001",
    "endpoints": {
      "sentiment": "/text/sentiment",
      "keywords": "/text/keywords",
      "summary": "/text/summary"
    },
    "requires_server": true
  }
}
EOF
    fi
    
    create_text_icon "$TOOLS_DIR/$tool_name"
    echo "✅ テキスト分析ツール（${method}方式）を作成しました"
}

create_ml_tool() {
    local method=$1
    local tool_name="python_ml_${method}"
    
    echo "🤖 機械学習ツール作成中（${method}方式）..."
    
    mkdir -p "$TOOLS_DIR/$tool_name"
    
    if [ "$method" = "direct" ]; then
        cp "$PYTHON_INTEGRATION_DIR/examples/ml_analysis.py" "$TOOLS_DIR/$tool_name/"
        cp "$PYTHON_INTEGRATION_DIR/handlers/python_direct_handler.js" "$TOOLS_DIR/$tool_name/handler.js"
        cp "$PYTHON_INTEGRATION_DIR/configs/ml_tool_config.json" "$TOOLS_DIR/$tool_name/config.json"
    else
        cp "$PYTHON_INTEGRATION_DIR/handlers/python_api_handler.js" "$TOOLS_DIR/$tool_name/handler.js"
        
        cat > "$TOOLS_DIR/$tool_name/config.json" << EOF
{
  "name": "python_ml_api",
  "description": "HTTP API経由でPythonの機械学習分析機能を使用します。予測、クラスタリング、時系列分析、異常検知が可能です。",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "data": {
        "type": "array",
        "description": "分析対象データ（JSON配列）"
      },
      "analysis_type": {
        "type": "string",
        "enum": ["predict", "cluster", "timeseries", "anomaly"],
        "description": "分析タイプ",
        "default": "predict"
      },
      "target_column": {
        "type": "string",
        "description": "予測対象列名"
      },
      "n_clusters": {
        "type": "integer",
        "description": "クラスター数",
        "default": 3
      }
    },
    "required": ["data", "analysis_type"],
    "additionalProperties": false
  },
  "api_integration": {
    "server_url": "http://localhost:8001",
    "endpoints": {
      "predict": "/ml/predict",
      "cluster": "/ml/cluster"
    },
    "requires_server": true
  }
}
EOF
    fi
    
    create_ml_icon "$TOOLS_DIR/$tool_name"
    echo "✅ 機械学習ツール（${method}方式）を作成しました"
}

create_image_tool() {
    local method=$1
    local tool_name="python_image_${method}"
    
    echo "🖼️ 画像処理ツール作成中（${method}方式）..."
    
    mkdir -p "$TOOLS_DIR/$tool_name"
    
    if [ "$method" = "direct" ]; then
        cp "$PYTHON_INTEGRATION_DIR/examples/image_processor.py" "$TOOLS_DIR/$tool_name/"
        cp "$PYTHON_INTEGRATION_DIR/handlers/python_direct_handler.js" "$TOOLS_DIR/$tool_name/handler.js"
        cp "$PYTHON_INTEGRATION_DIR/configs/image_tool_config.json" "$TOOLS_DIR/$tool_name/config.json"
    else
        cp "$PYTHON_INTEGRATION_DIR/handlers/python_api_handler.js" "$TOOLS_DIR/$tool_name/handler.js"
        
        cat > "$TOOLS_DIR/$tool_name/config.json" << EOF
{
  "name": "python_image_api",
  "description": "HTTP API経由でPythonの画像処理機能を使用します。リサイズ、フィルター、分析、フォーマット変換が可能です。",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "image_data": {
        "type": "string",
        "description": "Base64エンコードされた画像データ"
      },
      "function": {
        "type": "string",
        "enum": ["resize", "filter", "analyze", "convert"],
        "description": "実行する処理"
      },
      "width": {
        "type": "integer",
        "description": "リサイズ幅"
      },
      "height": {
        "type": "integer",
        "description": "リサイズ高さ"
      },
      "filter_type": {
        "type": "string",
        "description": "フィルタータイプ"
      }
    },
    "required": ["image_data", "function"],
    "additionalProperties": false
  },
  "api_integration": {
    "server_url": "http://localhost:8001",
    "endpoints": {
      "resize": "/image/resize",
      "analyze": "/image/analyze"
    },
    "requires_server": true
  }
}
EOF
    fi
    
    create_image_icon "$TOOLS_DIR/$tool_name"
    echo "✅ 画像処理ツール（${method}方式）を作成しました"
}

# アイコン作成関数群
create_weather_icon() {
    local tool_dir=$1
    cat > "$tool_dir/weather_icon.svg" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- 天気アイコン -->
  <circle cx="12" cy="12" r="4" fill="#3B82F6" stroke="#1E40AF" stroke-width="2"/>
  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="#3B82F6" stroke-width="2" stroke-linecap="round"/>
  <path d="M16 16c1.5 0 3-1 3-2.5S17.5 11 16 11c-.5-2-2-3-4-3s-3.5 1-4 3c-1.5 0-3 1-3 2.5S6.5 16 8 16h8z" fill="#93C5FD" stroke="#3B82F6" stroke-width="1"/>
</svg>
EOF
}

create_text_icon() {
    local tool_dir=$1
    cat > "$tool_dir/text_icon.svg" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- テキスト分析アイコン -->
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="#6EE7B7" stroke="#10B981" stroke-width="2"/>
  <polyline points="14,2 14,8 20,8" fill="#10B981"/>
  <line x1="8" y1="13" x2="16" y2="13" stroke="#10B981" stroke-width="2"/>
  <line x1="8" y1="17" x2="13" y2="17" stroke="#10B981" stroke-width="2"/>
  <circle cx="18" cy="18" r="3" fill="#059669" stroke="#10B981" stroke-width="1"/>
  <path d="M16.5 18L17.5 19L19.5 17" stroke="white" stroke-width="1.5" fill="none"/>
</svg>
EOF
}

create_ml_icon() {
    local tool_dir=$1
    cat > "$tool_dir/ml_icon.svg" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- 機械学習アイコン -->
  <circle cx="12" cy="12" r="3" fill="#8B5CF6"/>
  <circle cx="6" cy="6" r="2" fill="#C4B5FD"/>
  <circle cx="18" cy="6" r="2" fill="#C4B5FD"/>
  <circle cx="6" cy="18" r="2" fill="#C4B5FD"/>
  <circle cx="18" cy="18" r="2" fill="#C4B5FD"/>
  <line x1="9" y1="9" x2="8" y2="8" stroke="#8B5CF6" stroke-width="2"/>
  <line x1="15" y1="9" x2="16" y2="8" stroke="#8B5CF6" stroke-width="2"/>
  <line x1="9" y1="15" x2="8" y2="16" stroke="#8B5CF6" stroke-width="2"/>
  <line x1="15" y1="15" x2="16" y2="16" stroke="#8B5CF6" stroke-width="2"/>
  <circle cx="12" cy="12" r="1" fill="white"/>
</svg>
EOF
}

create_image_icon() {
    local tool_dir=$1
    cat > "$tool_dir/image_icon.svg" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- 画像処理アイコン -->
  <rect x="3" y="3" width="18" height="18" rx="2" fill="#FCA5A5" stroke="#EF4444" stroke-width="2"/>
  <circle cx="8.5" cy="8.5" r="1.5" fill="#EF4444"/>
  <polyline points="21,15 16,10 5,21" stroke="#EF4444" stroke-width="2" fill="none"/>
  <rect x="14" y="14" width="6" height="6" fill="#DC2626" opacity="0.7"/>
  <path d="M16 16l2 2M20 16l-2 2" stroke="white" stroke-width="1.5"/>
</svg>
EOF
}

# メイン処理
main() {
    echo ""
    echo "🚀 ツール作成を開始します"
    
    while true; do
        show_tool_menu
        read -p "選択してください (0-7): " choice
        
        case $choice in
            1)
                create_weather_tool "direct"
                ;;
            2)
                create_text_tool "direct"
                ;;
            3)
                create_ml_tool "direct"
                ;;
            4)
                create_image_tool "direct"
                ;;
            5)
                echo "🌐 HTTP API統合ツール作成中..."
                create_weather_tool "api"
                create_text_tool "api"
                create_ml_tool "api"
                create_image_tool "api"
                echo "✅ HTTP API統合ツール群を作成しました"
                ;;
            6)
                echo "🎯 全ツール作成中..."
                create_weather_tool "direct"
                create_text_tool "direct"
                create_ml_tool "direct"
                create_image_tool "direct"
                echo ""
                echo "🌐 HTTP API版も作成しますか？ (y/N)"
                read -p "選択: " create_api
                if [[ $create_api =~ ^[Yy]$ ]]; then
                    create_weather_tool "api"
                    create_text_tool "api" 
                    create_ml_tool "api"
                    create_image_tool "api"
                fi
                echo "✅ 全ツールの作成が完了しました"
                ;;
            7)
                echo "カスタム選択（未実装）"
                ;;
            0)
                echo "👋 ツール作成を終了します"
                break
                ;;
            *)
                echo "❌ 無効な選択です"
                ;;
        esac
        
        echo ""
        echo "🔄 続けて他のツールを作成しますか？"
        read -p "続行 (y/N): " continue_choice
        if [[ ! $continue_choice =~ ^[Yy]$ ]]; then
            break
        fi
    done
    
    # 最終確認とOneAgentリロード
    echo ""
    echo "🎉 ツール作成が完了しました！"
    echo ""
    echo "📋 作成されたツール一覧:"
    ls -la "$TOOLS_DIR" | grep "python_" | while read line; do
        echo "  📦 $(echo $line | awk '{print $9}')"
    done
    
    echo ""
    echo "🔄 次のステップ:"
    echo "1. OneAgentサーバーでツールをリロード:"
    echo "   curl -X POST http://localhost:3000/tools/reload"
    echo ""
    echo "2. WebUIでツールを確認:"
    echo "   http://localhost:5173"
    echo ""
    echo "3. HTTP API方式のツールを作成した場合、Python APIサーバーを起動:"
    echo "   cd python-integration"
    echo "   uvicorn examples.fastapi_server:app --host 0.0.0.0 --port 8001"
    
    # 自動リロードオプション
    echo ""
    read -p "OneAgentサーバーのツールを自動リロードしますか？ (y/N): " auto_reload
    if [[ $auto_reload =~ ^[Yy]$ ]]; then
        echo "🔄 ツールリロード中..."
        if curl -X POST http://localhost:3000/tools/reload 2>/dev/null; then
            echo "✅ ツールリロード完了"
        else
            echo "⚠️ ツールリロードに失敗しました（OneAgentサーバーが起動していない可能性があります）"
        fi
    fi
}

# スクリプト実行
main "$@"