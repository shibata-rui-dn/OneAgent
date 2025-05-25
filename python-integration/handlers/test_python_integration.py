#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OneAgent Python連携 包括テストスクリプト

このスクリプトはPython連携の各機能をテストし、
問題がないかを確認します。

使用方法:
python test_python_integration.py
python test_python_integration.py --verbose
python test_python_integration.py --test weather
"""

import os
import sys
import json
import subprocess
import tempfile
import argparse
import requests
from datetime import datetime
from pathlib import Path
import logging

# ログ設定
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class PythonIntegrationTester:
    def __init__(self, verbose=False):
        self.verbose = verbose
        self.test_results = []
        self.script_dir = Path(__file__).parent
        self.integration_dir = self.script_dir.parent
        
        # パス設定
        self.examples_dir = self.integration_dir / "examples"
        self.handlers_dir = self.integration_dir / "handlers"
        self.configs_dir = self.integration_dir / "configs"
        
        # OneAgentルート
        self.oneagent_root = self.integration_dir.parent
        self.tools_dir = self.oneagent_root / "YourTool"
        
        print(f"🐍 OneAgent Python連携テスト")
        print(f"📂 統合ディレクトリ: {self.integration_dir}")
        print(f"📂 OneAgentルート: {self.oneagent_root}")
        print("")
    
    def log_test_result(self, test_name, success, message="", details=None):
        """テスト結果をログに記録"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅" if success else "❌"
        print(f"{status} {test_name}: {message}")
        
        if self.verbose and details:
            print(f"   詳細: {details}")
    
    def test_environment(self):
        """Python環境とパッケージをテスト"""
        print("🔍 Python環境テスト")
        print("-" * 40)
        
        # Python バージョンチェック
        python_version = sys.version_info
        if python_version >= (3, 8):
            self.log_test_result(
                "Python バージョン",
                True,
                f"Python {python_version.major}.{python_version.minor}.{python_version.micro}"
            )
        else:
            self.log_test_result(
                "Python バージョン",
                False,
                f"Python 3.8以上が必要です（現在: {python_version.major}.{python_version.minor}）"
            )
        
        # 必須パッケージのテスト
        required_packages = {
            "requests": "HTTP リクエスト",
            "numpy": "数値計算",
            "pandas": "データ分析"
        }
        
        for package, description in required_packages.items():
            try:
                __import__(package)
                self.log_test_result(f"パッケージ {package}", True, f"{description} - インストール済み")
            except ImportError:
                self.log_test_result(f"パッケージ {package}", False, f"{description} - 未インストール")
        
        # オプションパッケージのテスト
        optional_packages = {
            "sklearn": "機械学習",
            "PIL": "画像処理",
            "cv2": "コンピュータビジョン",
            "nltk": "自然言語処理",
            "fastapi": "HTTP API サーバー"
        }
        
        for package, description in optional_packages.items():
            try:
                __import__(package)
                self.log_test_result(f"オプション {package}", True, f"{description} - 利用可能")
            except ImportError:
                self.log_test_result(f"オプション {package}", False, f"{description} - 未インストール（オプション）")
    
    def test_file_structure(self):
        """ファイル構造をテスト"""
        print("\n📁 ファイル構造テスト")
        print("-" * 40)
        
        # 必須ディレクトリのチェック
        required_dirs = [
            (self.examples_dir, "サンプルコード"),
            (self.handlers_dir, "ハンドラー"),
            (self.configs_dir, "設定ファイル")
        ]
        
        for dir_path, description in required_dirs:
            if dir_path.exists():
                self.log_test_result(f"ディレクトリ {dir_path.name}", True, f"{description} - 存在")
            else:
                self.log_test_result(f"ディレクトリ {dir_path.name}", False, f"{description} - 不足")
        
        # 必須ファイルのチェック
        required_files = [
            (self.integration_dir / "requirements.txt", "依存関係リスト"),
            (self.integration_dir / "README.md", "ドキュメント"),
            (self.examples_dir / "weather_api.py", "天気APIスクリプト"),
            (self.examples_dir / "text_analyzer.py", "テキスト分析スクリプト"),
            (self.examples_dir / "ml_analysis.py", "機械学習スクリプト"),
            (self.examples_dir / "image_processor.py", "画像処理スクリプト"),
            (self.examples_dir / "fastapi_server.py", "FastAPIサーバー"),
            (self.handlers_dir / "python_direct_handler.js", "直接実行ハンドラー"),
            (self.handlers_dir / "python_api_handler.js", "HTTP APIハンドラー")
        ]
        
        for file_path, description in required_files:
            if file_path.exists():
                self.log_test_result(f"ファイル {file_path.name}", True, f"{description} - 存在")
            else:
                self.log_test_result(f"ファイル {file_path.name}", False, f"{description} - 不足")
    
    def test_python_scripts(self):
        """Pythonスクリプトの動作テスト"""
        print("\n🐍 Pythonスクリプトテスト")
        print("-" * 40)
        
        # 天気APIスクリプトテスト
        self._test_weather_script()
        
        # テキスト分析スクリプトテスト
        self._test_text_analyzer()
        
        # 機械学習スクリプトテスト
        self._test_ml_analysis()
        
        # 画像処理スクリプトテスト
        self._test_image_processor()
    
    def _test_weather_script(self):
        """天気APIスクリプトテスト"""
        script_path = self.examples_dir / "weather_api.py"
        if not script_path.exists():
            self.log_test_result("天気APIスクリプト", False, "ファイルが見つかりません")
            return
        
        try:
            # 基本的な実行テスト
            result = subprocess.run([
                sys.executable, str(script_path),
                "--function", "weather",
                "--city", "Tokyo"
            ], capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                try:
                    output = json.loads(result.stdout)
                    if output.get("success"):
                        self.log_test_result("天気APIスクリプト", True, "正常実行（デモデータ）")
                    else:
                        self.log_test_result("天気APIスクリプト", False, f"実行エラー: {output.get('error')}")
                except json.JSONDecodeError:
                    self.log_test_result("天気APIスクリプト", False, "JSON出力エラー")
            else:
                self.log_test_result("天気APIスクリプト", False, f"実行失敗: {result.stderr}")
                
        except subprocess.TimeoutExpired:
            self.log_test_result("天気APIスクリプト", False, "実行タイムアウト")
        except Exception as e:
            self.log_test_result("天気APIスクリプト", False, f"例外エラー: {str(e)}")
    
    def _test_text_analyzer(self):
        """テキスト分析スクリプトテスト"""
        script_path = self.examples_dir / "text_analyzer.py"
        if not script_path.exists():
            self.log_test_result("テキスト分析スクリプト", False, "ファイルが見つかりません")
            return
        
        try:
            result = subprocess.run([
                sys.executable, str(script_path),
                "--function", "sentiment",
                "--text", "今日は素晴らしい天気です"
            ], capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                try:
                    output = json.loads(result.stdout)
                    if output.get("success"):
                        sentiment = output.get("sentiment", "不明")
                        self.log_test_result("テキスト分析スクリプト", True, f"感情分析成功: {sentiment}")
                    else:
                        self.log_test_result("テキスト分析スクリプト", False, f"実行エラー: {output.get('error')}")
                except json.JSONDecodeError:
                    self.log_test_result("テキスト分析スクリプト", False, "JSON出力エラー")
            else:
                self.log_test_result("テキスト分析スクリプト", False, f"実行失敗: {result.stderr}")
                
        except Exception as e:
            self.log_test_result("テキスト分析スクリプト", False, f"例外エラー: {str(e)}")
    
    def _test_ml_analysis(self):
        """機械学習スクリプトテスト"""
        script_path = self.examples_dir / "ml_analysis.py"
        if not script_path.exists():
            self.log_test_result("機械学習スクリプト", False, "ファイルが見つかりません")
            return
        
        # scikit-learnが必要
        try:
            import sklearn
        except ImportError:
            self.log_test_result("機械学習スクリプト", False, "scikit-learn未インストール（スキップ）")
            return
        
        try:
            test_data = json.dumps([
                {"x": 1, "y": 2},
                {"x": 2, "y": 4},
                {"x": 3, "y": 6},
                {"x": 4, "y": 8}
            ])
            
            result = subprocess.run([
                sys.executable, str(script_path),
                "--function", "predict",
                "--data", test_data
            ], capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                try:
                    output = json.loads(result.stdout)
                    if output.get("success"):
                        r2_score = output.get("metrics", {}).get("test_r2", 0)
                        self.log_test_result("機械学習スクリプト", True, f"予測分析成功: R²={r2_score:.3f}")
                    else:
                        self.log_test_result("機械学習スクリプト", False, f"実行エラー: {output.get('error')}")
                except json.JSONDecodeError:
                    self.log_test_result("機械学習スクリプト", False, "JSON出力エラー")
            else:
                self.log_test_result("機械学習スクリプト", False, f"実行失敗: {result.stderr}")
                
        except Exception as e:
            self.log_test_result("機械学習スクリプト", False, f"例外エラー: {str(e)}")
    
    def _test_image_processor(self):
        """画像処理スクリプトテスト"""
        script_path = self.examples_dir / "image_processor.py"
        if not script_path.exists():
            self.log_test_result("画像処理スクリプト", False, "ファイルが見つかりません")
            return
        
        # PILが必要
        try:
            from PIL import Image
        except ImportError:
            self.log_test_result("画像処理スクリプト", False, "Pillow未インストール（スキップ）")
            return
        
        # テスト用の小さな画像を作成
        try:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_file:
                # 100x100の赤い四角形を作成
                img = Image.new('RGB', (100, 100), color='red')
                img.save(tmp_file.name, 'PNG')
                test_image_path = tmp_file.name
            
            # 画像分析テスト
            result = subprocess.run([
                sys.executable, str(script_path),
                "--function", "analyze",
                "--input", test_image_path
            ], capture_output=True, text=True, timeout=30)
            
            # テストファイルを削除
            os.unlink(test_image_path)
            
            if result.returncode == 0:
                try:
                    output = json.loads(result.stdout)
                    if output.get("success"):
                        dimensions = output.get("basic_info", {}).get("dimensions", {})
                        self.log_test_result("画像処理スクリプト", True, f"画像分析成功: {dimensions.get('width')}x{dimensions.get('height')}")
                    else:
                        self.log_test_result("画像処理スクリプト", False, f"実行エラー: {output.get('error')}")
                except json.JSONDecodeError:
                    self.log_test_result("画像処理スクリプト", False, "JSON出力エラー")
            else:
                self.log_test_result("画像処理スクリプト", False, f"実行失敗: {result.stderr}")
                
        except Exception as e:
            self.log_test_result("画像処理スクリプト", False, f"例外エラー: {str(e)}")
    
    def test_fastapi_server(self):
        """FastAPIサーバーテスト"""
        print("\n🌐 FastAPIサーバーテスト")
        print("-" * 40)
        
        # FastAPIが必要
        try:
            import fastapi
            import uvicorn
        except ImportError:
            self.log_test_result("FastAPIサーバー", False, "FastAPI/uvicorn未インストール（スキップ）")
            return
        
        script_path = self.examples_dir / "fastapi_server.py"
        if not script_path.exists():
            self.log_test_result("FastAPIサーバー", False, "サーバーファイルが見つかりません")
            return
        
        # サーバーが既に起動しているかチェック
        try:
            response = requests.get("http://localhost:8001/health", timeout=5)
            if response.status_code == 200:
                health_data = response.json()
                self.log_test_result("FastAPIサーバー", True, f"サーバー起動中: {health_data.get('status')}")
                
                # 基本的なAPI呼び出しテスト
                self._test_api_endpoints()
            else:
                self.log_test_result("FastAPIサーバー", False, f"サーバー応答エラー: {response.status_code}")
                
        except requests.RequestException:
            self.log_test_result("FastAPIサーバー", False, "サーバー未起動（手動起動が必要）")
            print("   💡 サーバー起動方法:")
            print("      cd python-integration")
            print("      uvicorn examples.fastapi_server:app --host 0.0.0.0 --port 8001")
    
    def _test_api_endpoints(self):
        """API エンドポイントテスト"""
        base_url = "http://localhost:8001"
        
        # 天気APIテスト
        try:
            response = requests.post(f"{base_url}/weather", 
                                   json={"city": "Tokyo"}, 
                                   timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    self.log_test_result("天気API", True, f"天気取得成功: {data['data']['city']}")
                else:
                    self.log_test_result("天気API", False, f"API実行エラー: {data.get('error')}")
            else:
                self.log_test_result("天気API", False, f"HTTP エラー: {response.status_code}")
        except Exception as e:
            self.log_test_result("天気API", False, f"リクエストエラー: {str(e)}")
        
        # テキスト感情分析APIテスト
        try:
            response = requests.post(f"{base_url}/text/sentiment",
                                   json={"text": "今日は良い天気です"},
                                   timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    sentiment = data['data']['sentiment']
                    self.log_test_result("感情分析API", True, f"分析成功: {sentiment}")
                else:
                    self.log_test_result("感情分析API", False, f"API実行エラー: {data.get('error')}")
            else:
                self.log_test_result("感情分析API", False, f"HTTP エラー: {response.status_code}")
        except Exception as e:
            self.log_test_result("感情分析API", False, f"リクエストエラー: {str(e)}")
    
    def test_oneagent_integration(self):
        """OneAgent統合テスト"""
        print("\n🤖 OneAgent統合テスト")
        print("-" * 40)
        
        # OneAgentサーバーが起動しているかチェック
        try:
            response = requests.get("http://localhost:3000/health", timeout=5)
            if response.status_code == 200:
                self.log_test_result("OneAgentサーバー", True, "サーバー起動中")
                
                # ツール一覧取得テスト
                tools_response = requests.get("http://localhost:3000/tools", timeout=5)
                if tools_response.status_code == 200:
                    tools_data = tools_response.json()
                    python_tools = [tool for tool in tools_data.get('tools', []) 
                                  if 'python' in tool.get('name', '').lower()]
                    
                    if python_tools:
                        self.log_test_result("Pythonツール統合", True, f"{len(python_tools)}個のPythonツールを確認")
                        
                        if self.verbose:
                            for tool in python_tools:
                                print(f"     - {tool.get('name')}: {tool.get('description', '')[:50]}...")
                    else:
                        self.log_test_result("Pythonツール統合", False, "Pythonツールが見つかりません")
                else:
                    self.log_test_result("ツール一覧取得", False, f"HTTP エラー: {tools_response.status_code}")
            else:
                self.log_test_result("OneAgentサーバー", False, f"サーバー応答エラー: {response.status_code}")
                
        except requests.RequestException:
            self.log_test_result("OneAgentサーバー", False, "サーバー未起動")
            print("   💡 OneAgentサーバー起動方法:")
            print("      npm start")
    
    def generate_report(self):
        """テスト結果レポート生成"""
        print("\n📊 テスト結果サマリー")
        print("=" * 50)
        
        total_tests = len(self.test_results)
        successful_tests = len([r for r in self.test_results if r["success"]])
        failed_tests = total_tests - successful_tests
        
        print(f"総テスト数: {total_tests}")
        print(f"成功: {successful_tests} ✅")
        print(f"失敗: {failed_tests} ❌")
        print(f"成功率: {(successful_tests/total_tests*100):.1f}%")
        
        if failed_tests > 0:
            print(f"\n❌ 失敗したテスト:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   - {result['test']}: {result['message']}")
        
        print(f"\n📝 詳細レポート:")
        
        # カテゴリ別サマリー
        categories = {
            "環境": ["Python", "パッケージ"],
            "ファイル": ["ディレクトリ", "ファイル"],
            "スクリプト": ["スクリプト", "API"],
            "統合": ["OneAgent", "サーバー"]
        }
        
        for category, keywords in categories.items():
            category_tests = [r for r in self.test_results 
                            if any(keyword in r["test"] for keyword in keywords)]
            if category_tests:
                category_success = len([r for r in category_tests if r["success"]])
                print(f"   {category}: {category_success}/{len(category_tests)} 成功")
        
        # 推奨アクション
        print(f"\n💡 推奨アクション:")
        
        if failed_tests == 0:
            print("   🎉 すべてのテストが成功しました！")
            print("   - OneAgent WebUI でPythonツールを試してください")
            print("   - カスタムツールの作成を検討してください")
        else:
            print("   📋 失敗したテストの問題を解決してください:")
            
            # パッケージ不足のチェック
            missing_packages = [r for r in self.test_results 
                              if not r["success"] and "未インストール" in r["message"]]
            if missing_packages:
                print("   - 不足パッケージのインストール:")
                print("     pip install -r requirements.txt")
            
            # サーバー未起動のチェック
            server_issues = [r for r in self.test_results 
                           if not r["success"] and "未起動" in r["message"]]
            if server_issues:
                print("   - 必要なサーバーの起動:")
                print("     OneAgent: npm start")
                print("     FastAPI: uvicorn examples.fastapi_server:app --port 8001")
        
        # レポートファイル保存
        report_file = self.integration_dir / f"test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump({
                "summary": {
                    "total_tests": total_tests,
                    "successful_tests": successful_tests,
                    "failed_tests": failed_tests,
                    "success_rate": successful_tests/total_tests*100
                },
                "test_results": self.test_results,
                "timestamp": datetime.now().isoformat()
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n📄 詳細レポートを保存しました: {report_file}")

def main():
    parser = argparse.ArgumentParser(description='OneAgent Python連携テストスクリプト')
    parser.add_argument('--verbose', '-v', action='store_true', help='詳細出力')
    parser.add_argument('--test', choices=['env', 'files', 'scripts', 'api', 'integration', 'all'], 
                       default='all', help='実行するテストの種類')
    
    args = parser.parse_args()
    
    tester = PythonIntegrationTester(verbose=args.verbose)
    
    if args.test in ['env', 'all']:
        tester.test_environment()
    
    if args.test in ['files', 'all']:
        tester.test_file_structure()
    
    if args.test in ['scripts', 'all']:
        tester.test_python_scripts()
    
    if args.test in ['api', 'all']:
        tester.test_fastapi_server()
    
    if args.test in ['integration', 'all']:
        tester.test_oneagent_integration()
    
    tester.generate_report()

if __name__ == "__main__":
    main()