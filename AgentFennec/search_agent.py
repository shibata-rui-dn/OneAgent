import json
import requests
import logging
import tiktoken
#from datetime import datetime
from langchain.agents import initialize_agent, Tool, AgentType
from langchain.tools import StructuredTool
from langchain_openai import AzureChatOpenAI
from langchain_openai import ChatOpenAI, OpenAI

from langchain.callbacks.base import BaseCallbackHandler

from code_analyze_tools import analyze_file_details
from directory_search_utils import folder_summary, folder_structure, search_files
from config_manager import get_config
_config = get_config() 

# ログ設定：agent.log に出力
logging.basicConfig(
    level=logging.INFO,
    filename='agent.log',
    filemode='a',
    format='%(asctime)s - %(levelname)s - %(message)s',
    encoding='utf-8'
)
logging.info("Search Agent 起動")

# エージェントが使用した検索クエリとファイルパスをグローバル変数で全件保持（過去のすべての履歴）
agent_search_queries = []
agent_file_paths = []

domain = _config.get("domain", "http://localhost")  
npott = _config.get("app_port", "6546")
BASE_URL = f"{domain}:{npott}"
isOpenAIFunction = _config.get("isOpenAIFunction", False)
isAOAI = _config.get("isAOAI", False)
with open("./dict/system_prompt.txt", "r", encoding="utf-8") as f:
    systemPrompt = f.read()

# 各API呼び出し関数
def suggest_api(query: str) -> str:
    logging.info(f"suggest_api 呼び出し query: {query}")
    url = f"{BASE_URL}/suggest"
    params = {"q": query}
    try:
        response = requests.get(url, params=params)
    except Exception as e:
        err = f"検索エンジンへの接続に失敗しました: {e}"
        logging.error(err)
        return err
    if response.status_code != 200:
        err = f"エラー: {response.text}"
        logging.error(err)
        return err
    suggestions = response.json().get("suggestions", [])
    if not suggestions:
        logging.info("suggest_api: 検索候補は見つかりませんでした。")
        return "検索候補は見つかりませんでした。"
    result = ", ".join(suggestions)
    logging.info(f"suggest_api 戻り値: {result}")
    return result

def search_file(query: str, index_type: str = "docs") -> str:
    global agent_search_queries  # ファイルパスは記録しない
    logging.info(f"search_file 呼び出し query: {query} index_type: {index_type}")
    url = f"{BASE_URL}/search"
    params = {"q": query, "mode": "or", "limit": 5, "index_type": index_type}
    try:
        response = requests.get(url, params=params)
    except Exception as e:
        err = f"検索エンジンへの接続に失敗しました: {e}"
        logging.error(err)
        return err
    if response.status_code != 200:
        err = f"エラー: {response.text}"
        logging.error(err)
        return err
    data = response.json()
    if "results" not in data or not data["results"]:
        logging.info("search_file: 検索結果は見つかりませんでした。")
        agent_search_queries.append(query)
        return "検索結果は見つかりませんでした。"
    results = data["results"]
    agent_search_queries.append(query)
    
    output = "以下のファイルが見つかりました:\n"
    for res in results:
        output += f"- {res['path']} (スコア: {res.get('score', 0):.2f})\n"
        if "page" in res:
            output += f"  -> ページ: {res['page']}\n"
        if "sheet" in res:
            output += f"  -> シート: {res['sheet']}\n"
    logging.info(f"search_file 戻り値: {output}")
    return output

def search_file_with_retry(query: str, index_type: str = "docs", max_attempts: int = 3) -> str:
    logging.info(f"search_file_with_retry 開始 初期 query: {query} index_type: {index_type}")
    result = ""
    for attempt in range(max_attempts):
        logging.info(f"Attempt {attempt+1} query: {query}")
        result = search_file(query, index_type=index_type)
        if "検索結果は見つかりませんでした" not in result:
            logging.info("search_file_with_retry: 有効な結果を取得")
            return result
        new_query = suggest_api(query)
        if new_query and new_query != query:
            logging.info(f"リトライ {attempt+1}: 新クエリ '{new_query}' で再試行")
            query = new_query
        else:
            logging.info("search_file_with_retry: 新しいクエリ候補が得られなかったのでリトライ終了")
            break
    logging.info(f"search_file_with_retry 最終結果: {result}")
    
    # FileContentSearchで結果が０件の場合は、FilenameSearchで再検索する
    if "検索結果は見つかりませんでした" in result:
         logging.info("FileContentSearchの結果が0件のため、FilenameSearchを実行します")
         result = search_files_recorded(query, "./")
    return result

def get_file_contents_api(file_path: str) -> str:
    global agent_file_paths
    logging.info(f"get_file_contents_api 呼び出し file_path: {file_path}")
    url = f"{BASE_URL}/file"
    params = {"path": file_path}
    try:
        response = requests.get(url, params=params)
    except Exception as e:
        err = f"検索エンジンへの接続に失敗しました: {e}"
        logging.error(err)
        return err
    if response.status_code != 200:
        err = f"エラー: {response.text}"
        logging.error(err)
        return err
    data = response.json()
    content = data.get("content", "")
    if not content:
        logging.info("get_file_contents_api: ファイルの内容が取得できませんでした。")
        return "ファイルの内容が取得できませんでした。"
    logging.info(f"get_file_contents_api: 取得内容 長さ {len(content)}")
    
    # ファイル内容をチェックした場合のみファイルパスを記録する
    if file_path not in agent_file_paths:
        agent_file_paths.append(file_path)
    
    return content

def search_files_recorded(query: str, folder_path: str, ext_filter: str = None) -> str:
    global agent_search_queries  # ファイルパスの追加処理は削除
    logging.info(f"search_files_recorded 呼び出し query: {query}, folder_path: {folder_path}, ext_filter: {ext_filter}")
    
    # 初回検索を実行
    result = search_files(query, folder_path, ext_filter)
    
    # 結果が０件の場合、クエリからファイル名らしき部分を抽出して再検索を実施
    if "検索結果は見つかりませんでした" in result:
        import re
        pattern = r'\b[\w\-.]+\.\w+\b'
        matches = re.findall(pattern, query)
        if matches:
            file_name = matches[0]
            logging.info(f"検索結果が０件のため、クエリからファイル名 '{file_name}' を抽出して再検索を実施")
            result = search_files(file_name, folder_path, ext_filter)
            agent_search_queries.append(file_name)
        else:
            logging.info("検索結果は０件だが、クエリからファイル名らしき文字列が抽出できませんでした")
            agent_search_queries.append(query)
    else:
        agent_search_queries.append(query)
    
    # 検索結果からファイルパスを抽出して追加する処理は削除
    return result

# ツール定義（説明文をより分かりやすく修正）
suggest_tool = StructuredTool.from_function(
    name="KeywordSuggestion",
    func=suggest_api,
    description=(
        "検索キーワードに対する関連候補を提案します。"
        "使用方法: 検索キーワード\n"
        "- 引数: 候補を取得したいキーワード (例: 'config' や 'api')\n"
        "- このツールは単独で使うより、FileContentSearchで結果が見つからなかった場合に代替キーワードを探すのに役立ちます\n"
        "- 返された候補キーワードは、FileContentSearchに渡して検索することができます"
    )
)

search_tool = StructuredTool.from_function(
    name="FileContentSearch",
    func=search_file_with_retry,
    description=(
        "キーワードをもとにファイルの内容を全文検索し、マッチするファイルを見つけます。\n"
        "使用方法: 検索キーワード\n"
        "- 引数: ファイル内容を検索するキーワード (例: 'config load' や 'api_key')\n"
        "- 複数のキーワードは空白で区切って指定できます (例: 'import requests logging')\n"
        "特徴:\n"
        "- ファイル名ではなく、ファイルの中身（コード、テキスト）から検索します\n"
        "- コードや設定ファイルの場合は英語キーワードを推奨します\n"
        "- 検索結果が見つからない場合は自動的に検索候補を使って再試行します\n"
        "- 日本語検索でヒットしない場合は英語で試してください\n"
        "- このツールは、検索対象のオプションとして 'docs' または 'other' を利用可能です。"
        "  ソースコードに関する質問で対象が絞れる自信がある場合は 'other'、そうでない場合は 'docs' を指定してください。"
    )
)

get_file_tool = StructuredTool.from_function(
    name="FileContentRetrieval",
    func=get_file_contents_api,
    description=(
        "指定されたファイルパスのファイル内容を取得します。\n"
        "使用方法: ファイルパス\n"
        "- 引数: FileContentSearchなどで見つけたファイルの完全なパス (例: ./src/utils/config.py)\n"
        "注意: ファイルパスは正確に指定してください。フォルダではなく必ず具体的なファイルを指定する必要があります"
    )
)

code_analyze_tool = StructuredTool.from_function(
    name="CodeStructureAnalysis",
    func=analyze_file_details,
    description=(
        "Pythonファイルの構造分析を行い、インポート、定義された関数、外部からの参照などの詳細情報を提供します。\n"
        "使用方法: ファイルパス\n"
        "- 引数: 分析したいPythonファイルの相対パス (例: ./src/main.py)\n"
        "注意: 必ずファイルへのパスを指定してください。ディレクトリではなくファイルを指定する必要があります"
    )
)

folder_summary_tool = StructuredTool.from_function(
    name="ProjectOverview",
    func=folder_summary,
    description=(
        "プロジェクト全体の概要を表示します。ファイル拡張子の分布や基本的なフォルダ構造などプロジェクトの全体像を把握できます。\n"
        "使用方法: [モード] [表示件数]\n"
        "- 第1引数(オプション): 表示モード - 'top'(最も多い拡張子)または'worst'(最も少ない拡張子) (デフォルト: 'top')\n"
        "- 第2引数(オプション): 表示する拡張子の件数 (例: 15) - 数値で指定\n"
        "例: 'ProjectOverview: top 15' または引数なしで単に 'ProjectOverview'"
    )
)

folder_structure_tool = StructuredTool.from_function(
    name="DirectoryExplorer",
    func=folder_structure,
    description=(
        "特定のディレクトリ構造を詳細に表示します。サブフォルダやファイル一覧を階層的に確認できます。\n"
        "使用方法: フォルダパス 拡張子フィルタ [最大深度]\n"
        "- 第1引数: フォルダの相対パス (例: ./src や src) - これはフォルダを指定するものです\n"
        "- 第2引数: 表示するファイルの拡張子フィルタ (例: .py や .json) - ファイル拡張子の前にドットを付けてください, *で全ての拡張子を検索可能です\n"
        "- 第3引数(オプション): 表示する階層の最大深度 (例: 3) - 数値を指定してください\n"
    )
)

search_files_tool = StructuredTool.from_function(
    name="FilenameSearch",
    func=search_files_recorded,
    description=(
        "ファイル名をキーワードで検索します。FileContentSearchとは異なり、ファイル内容ではなくファイル名のみを対象とします。\n"
        "使用方法: 検索クエリ フォルダパス [拡張子フィルタ]\n"
        "- 第1引数: 検索したいファイル名のキーワード (例: config や agent)\n"
        "- 第2引数: 検索対象のフォルダパス (例: ./src)\n"
        "- 第3引数(オプション): ファイル拡張子フィルタ (例: .py) - ドットを含めて指定してください, 指定を推奨"
    )
)

# カスタムコールバックハンドラ（エージェント終了時に入出力トークンの合計を送信）
class MyCustomCallbackHandler(BaseCallbackHandler):
    def __init__(self, send_func, model_name="gpt-3.5-turbo"):
        self.send_func = send_func
        self.tokenizer = tiktoken.encoding_for_model(model_name)
        self.total_input_tokens = 0
        self.total_output_tokens = 0

    def on_llm_start(self, serialized, prompts, **kwargs):
        total_input_tokens = 0
        for prompt in prompts:
            tokens = self.tokenizer.encode(prompt)
            total_input_tokens += len(tokens)
        self.total_input_tokens += total_input_tokens
        logging.info(f"LLM実行開始: 入力トークン数 = {total_input_tokens}")
        self.send_func(json.dumps({
            "event": "llm_start",
            "message": "LLM の実行を開始しました"
        }))

    def on_llm_new_token(self, token, **kwargs):
        if token == "":
            return
        self.total_output_tokens += 1
        self.send_func(json.dumps({
            "event": "new_token",
            "message": token
        }))

    def on_llm_end(self, response, **kwargs):
        self.send_func(json.dumps({
            "event": "llm_end",
            "message": "LLM の実行が完了しました"
        }))

    def on_agent_action(self, action, **kwargs):
        message = {
            "event": "agent_action",
            "message": f"Agent Action: {action.tool}"
        }
        if hasattr(action, "tool_input"):
            message["tool_input"] = action.tool_input
        if hasattr(action, "log") and action.log:
            message["log"] = action.log
        self.send_func(json.dumps(message))
        
        if action.tool == "GetFileContents" and hasattr(action, "tool_input"):
            file_event = {
                "event": "file_reference",
                "message": f"ファイルが参照されました: {action.tool_input}"
            }
            self.send_func(json.dumps(file_event))

    def on_agent_finish(self, finish, **kwargs):
        message = {
            "event": "agent_finish",
            "message": "エージェント処理が完了しました",
            "result": finish.return_values,
            "nToken": {
                "input": self.total_input_tokens,
                "output": self.total_output_tokens
            }
        }
        if hasattr(finish, "log") and finish.log:
            message["log"] = finish.log
        self.send_func(json.dumps(message))
        
    def on_chain_end(self, outputs, **kwargs):
        self.send_func(json.dumps({
            "event": "chain_end",
            "message": "チェーン実行完了",
            "outputs": outputs
        }))

def run_search_agent(issue: str, trace_log: str = "", search_keywords: str = "", callback_handler=None) -> dict:
    global agent_search_queries, agent_file_paths
    # リクエスト毎に状態を初期化
    agent_search_queries = []
    agent_file_paths = []
    
    # 最新の設定を取得
    config = get_config()
    api_key = config.get("api_key")
    end_point = config.get("end_point")
    api_version = config.get("api_version")
    if not api_key or not end_point or not api_version:
        error_msg = "configから最新のapi_key, end_point, api_versionを取得できませんでした。"
        logging.error(error_msg)
        raise ValueError(error_msg)
    
    # llmとagentを最新設定で再初期化
    if isAOAI:
        logging.info("Azure OpenAI モデルを使用します")
        llm = AzureChatOpenAI(
            api_key=api_key,
            azure_endpoint=end_point,
            openai_api_version=api_version,
            request_timeout=85,
            max_retries=28,
            temperature=0.2,
            streaming=True
        )
        
    else:
        if isOpenAIFunction:
            logging.info("OpenAI モデルを使用します")
            llm = ChatOpenAI(
                api_key=api_key,
                model="gpt-4o",
                temperature=0.2,
                streaming=True
            )
        else:
            logging.info("Qwen3 4b モデルを使用します")
            llm = ChatOpenAI(
                model_name="Qwen/Qwen3-4B",
                api_key="dummy",
                extra_body={"chat_template_kwargs": {"enable_thinking": False}},
                base_url=end_point,
                temperature=0.2,
                streaming=True,
            )

    
    agent = initialize_agent(
        tools=[
            suggest_tool, 
            search_tool, 
            get_file_tool, 
            code_analyze_tool,
            folder_summary_tool,
            folder_structure_tool,
            search_files_tool
        ],
        llm=llm,
        agent='openai-functions' if isOpenAIFunction else AgentType.STRUCTURED_CHAT_ZERO_SHOT_REACT_DESCRIPTION,
        verbose=True
    )
    
    # index_type の選択: search_keywords がある場合はソースコードに絞り込める自信があるとみなし "other" を、
    # そうでない場合は "docs" を使用する
    index_type = "other" if search_keywords.strip() else "docs"
    
    combined_query = f"Request: {issue}\n"
    if trace_log:
        combined_query += f"Hint(Log): {trace_log}\n"
    if search_keywords:
        combined_query += f"Hint(Keyword): {search_keywords}\n"
    combined_query += f"\n{systemPrompt}\n"

    combined_query += f"ルートフォルダの構成:\n {folder_summary()}"

    logging.info(f"run_search_agent 入力クエリ:\n{combined_query}")
    if callback_handler:
        agent_response = agent.run(combined_query, callbacks=[callback_handler])
    else:
        agent_response = agent.run(combined_query)
    logging.info(f"Agent 応答: {agent_response}")
    
    token_info = {
        "input": callback_handler.total_input_tokens if callback_handler else 0,
        "output": callback_handler.total_output_tokens if callback_handler else 0
    }
    
    return {
        "agent_response": agent_response,
        "search_queries": agent_search_queries,
        "file_paths": agent_file_paths,
        "nToken": token_info
    }
