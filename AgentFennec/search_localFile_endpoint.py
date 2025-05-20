import sys
sys.stdout.reconfigure(encoding='utf-8')

import json
import time
from datetime import datetime
from threading import Thread
from queue import Queue, Empty
from pathlib import Path

from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import tiktoken  # model_name="gpt-3.5-turbo"

from config_manager import get_config, update_config, set_doc_lake_dir
from init import init
from gpt_interaction import call_gpt
from index_optimizer import update_index, get_index, get_file_metadata, delete_index
from search_enhancer import (
    perform_advanced_search,
    perform_search_with_mode,
    parse_query_into_terms,
    highlight_search_results,
    get_multi_keyword_suggestions
)
from search_agent import run_search_agent, MyCustomCallbackHandler

# -------------------------------

# app_dir を動的に取得するヘルパー関数
def get_app_dir():
    config = get_config()
    default_app_dir = Path.cwd() / "docs" / "root"
    return Path(config.get("app_dir", str(default_app_dir)))

# docs_lake_dir は app_dir と config の "docs_lake_dir"（存在しなければ既定値 "__docs__"）を結合して表現
def get_docs_lake_dir():
    config = get_config()
    docs_dir = config.get("docs_dir")
    if not docs_dir:
        docs_dir = "__docs__"
    return get_app_dir() / docs_dir

# その他の定数（INDEX_DIR 等）
config = get_config()
INDEX_DIR = Path(config.get("index_dir", "indexdir"))
FORCE_REBUILD_ON_START = config.get("force_rebuild_on_start", False)
AUTO_UPDATE_INDEX = config.get("auto_update_index", True)
APP_PORT = config.get("app_port", 6546)

# テキスト化済みファイルの内容取得
def get_text_converted_content(original_path: Path) -> str:
    try:
        relative_path = original_path.relative_to(get_app_dir())
    except ValueError:
        return None
    converted_file = get_docs_lake_dir() / relative_path.with_suffix(".txt")
    if converted_file.exists():
        return converted_file.read_text(encoding="utf-8")
    return None

app = Flask(__name__)
CORS(
    app,
    resources={r"/*": {"origins": "null"}},
    methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"]
)

# 初期化（init と index更新）の状態を管理するグローバル変数
initialization_status = {"completed": False}

# --------------------------------
# /update エンドポイント
# --------------------------------
@app.route("/update", methods=["POST"])
def update_index_route():
    # 進捗報告用のキューとコールバック関数を定義（update_index の進捗用）
    progress_queue = Queue()

    def progress_callback(step, percentage):
        progress_message = json.dumps({
            "status": "progress",
            "step": step,
            "progress": percentage
        })
        progress_queue.put(progress_message)

    def event_stream():
        app_dir = get_app_dir()
        if not app_dir.exists() or not app_dir.is_dir():
            yield "data: " + json.dumps({
                "status": "error",
                "message": f"エラー: 指定されたアプリケーションディレクトリ '{app_dir}' が存在しません。"
            }) + "\n\n"
            return
        if not any(app_dir.iterdir()):
            yield "data: " + json.dumps({
                "status": "error",
                "message": f"エラー: アプリケーションディレクトリ '{app_dir}' が空です。"
            }) + "\n\n"
            return

        yield "data: " + json.dumps({
            "status": "info",
            "message": "情報: アプリケーションディレクトリの検証が完了しました。"
        }) + "\n\n"

        try:
            dir_count = sum(1 for entry in app_dir.iterdir() if entry.is_dir())
            yield "data: " + json.dumps({
                "status": "info",
                "message": f"情報: アプリケーションディレクトリ内に {dir_count} 個のディレクトリが見つかりました。",
                "dir_count": dir_count
            }) + "\n\n"
        except Exception as e:
            yield "data: " + json.dumps({
                "status": "error",
                "message": f"エラー: ディレクトリの数を数える際に問題が発生しました: {str(e)}"
            }) + "\n\n"
            return

        # 初期化プロセス開始（ジェネレーターから逐次送信）
        yield "data: " + json.dumps({
            "status": "info",
            "message": "初期化プロセスを開始します。"
        }) + "\n\n"
        # init()はジェネレーターになっているので、yield from でその進捗を送信
        init_result = yield from init()
        if init_result.get("state") != "success":
            yield "data: " + json.dumps({
                "status": "error",
                "message": f"エラー: 初期化処理に失敗しました: {init_result.get('message')}"
            }) + "\n\n"
            return
        yield "data: " + json.dumps({
            "status": "info",
            "message": "初期化処理が正常に完了しました。"
        }) + "\n\n"

        # 更新処理開始（update_index を progress_callback 付きで実行）
        yield "data: " + json.dumps({
            "status": "info",
            "message": "更新処理を開始します。"
        }) + "\n\n"
        force = request.args.get("force", "false").lower() == "true"
        update_exception = None

        def run_update():
            nonlocal update_exception
            try:
                update_index(str(INDEX_DIR), str(get_app_dir()), force_rebuild=force, progress_callback=progress_callback)
            except Exception as e:
                update_exception = e

        update_thread = Thread(target=run_update)
        update_thread.start()

        while update_thread.is_alive() or not progress_queue.empty():
            try:
                while not progress_queue.empty():
                    msg = progress_queue.get_nowait()
                    yield "data: " + msg + "\n\n"
            except Exception:
                pass
            time.sleep(0.2)
        update_thread.join()

        if update_exception:
            yield "data: " + json.dumps({
                "status": "error",
                "message": f"エラー: 更新処理中に例外が発生しました: {str(update_exception)}"
            }) + "\n\n"
            return

        initialization_status["completed"] = True
        yield "data: " + json.dumps({
            "status": "success",
            "message": "エージェントを起動します..."
        }) + "\n\n"

    return Response(stream_with_context(event_stream()), mimetype="text/event-stream")

# --------------------------------
# /suggest エンドポイント
# --------------------------------
@app.route("/suggest", methods=["GET"])
def suggest():
    query = request.args.get("q", "")
    if not query:
        return jsonify({"suggestions": []})
    indices = get_index(str(INDEX_DIR), str(get_app_dir()))
    index_type = request.args.get("index_type", "other")
    ix = indices.get(index_type, indices["other"])
    multiword_mode = request.args.get("multiword", "true").lower() == "true"
    max_suggestions = int(request.args.get("limit", "10"))
    compat_mode = request.args.get("compat", "true").lower() == "true"
    if multiword_mode and " " in query:
        suggestion_objects = get_multi_keyword_suggestions(ix, query, max_suggestions)
        if compat_mode:
            suggestions = [item["full"] for item in suggestion_objects]
            return jsonify({"suggestions": suggestions})
        else:
            return jsonify({
                "suggestions": suggestion_objects,
                "mode": "multiword"
            })
    else:
        simple_suggestions = []
        with ix.reader() as reader:
            lexicon = reader.lexicon("content")
            count = 0
            query_lower = query.lower()
            for term in lexicon:
                term_str = term.decode("utf-8") if isinstance(term, bytes) else term
                if term_str.lower().startswith(query_lower):
                    suggested_term = term_str if not (query and query[0].isupper()) else term_str[0].upper() + term_str[1:]
                    simple_suggestions.append(suggested_term)
                    count += 1
                    if count >= max_suggestions:
                        break
        return jsonify({"suggestions": simple_suggestions})

# --------------------------------
# /search エンドポイント
# --------------------------------
@app.route("/search", methods=["GET"])
def search():
    query = request.args.get("q", "")
    if not query:
        return jsonify({"error": "No query provided"}), 400
    mode = request.args.get("mode", "or").lower()
    limit = int(request.args.get("limit", "10"))
    indices = get_index(str(INDEX_DIR), str(get_app_dir()))
    index_type = request.args.get("index_type", "other")
    ix = indices.get(index_type, indices["other"])
    results_list = perform_search_with_mode(ix, query, mode=mode, limit=limit)

    # mapping.json は docs_lake_dir 内に存在する（docs index のみ有効）
    mapping = {}
    mapping_file = get_docs_lake_dir() / "mapping.json"
    if mapping_file.exists():
        try:
            with mapping_file.open("r", encoding="utf-8") as f:
                mapping = json.load(f)
        except Exception as e:
            print(f"Mapping 読み込みエラー: {e}")
    else:
        print(f"Mapping ファイルが存在しません: {mapping_file}")

    for result in results_list:
        raw_path = result.get("path")
        file_path = Path(raw_path)
        if index_type == "docs":
            # docs index: 非絶対パスの場合、docs_lake_dir を基準とする
            if not file_path.is_absolute():
                file_path = get_docs_lake_dir() / file_path
            try:
                file_path.relative_to(get_docs_lake_dir())
                file_id = file_path.stem
                mapping_entry = mapping.get("id_to_file", {}).get(file_id, {})
                if mapping_entry:
                    original_file = mapping_entry.get("original_file")
                    if original_file:
                        original_file_path = Path(original_file)
                        try:
                            relative_path = original_file_path.relative_to(get_app_dir())
                            result["path"] = str(relative_path)
                        except ValueError:
                            result["path"] = str(original_file_path)
                    if "page" in mapping_entry:
                        result["page"] = mapping_entry["page"]
                    elif "sheet" in mapping_entry:
                        result["sheet"] = mapping_entry["sheet"]
                else:
                    try:
                        relative_path = file_path.relative_to(get_app_dir())
                        result["path"] = str(relative_path)
                    except ValueError:
                        result["path"] = str(file_path)
            except ValueError:
                pass
        else:
            # other index: ファイルパスは app_dir を基準に変換する
            if not file_path.is_absolute():
                file_path = get_app_dir() / file_path
            try:
                relative_path = file_path.relative_to(get_app_dir())
                result["path"] = str(relative_path)
            except ValueError:
                result["path"] = str(file_path)
    return jsonify({"results": results_list})

# --------------------------------
# /files エンドポイント
# --------------------------------
@app.route("/files", methods=["GET"])
def files_list():
    indices = get_index(str(INDEX_DIR), str(get_app_dir()))
    ix = indices["other"]
    files = []
    with ix.searcher() as searcher:
        for doc in searcher.all_stored_fields():
            file_path = Path(doc["path"])
            try:
                file_path.relative_to(get_docs_lake_dir())
                continue
            except ValueError:
                pass
            files.append(doc["path"])
    return jsonify({"files": files})

# --------------------------------
# /file エンドポイント
# --------------------------------
@app.route("/file", methods=["GET"])
def get_file_contents():
    file_path_param = request.args.get("path")
    if not file_path_param:
        return jsonify({"error": "ファイルパスが指定されていません"}), 400
    abs_app_dir = get_app_dir().resolve()
    full_path = (abs_app_dir / file_path_param).resolve()
    try:
        full_path.relative_to(abs_app_dir)
    except ValueError:
        return jsonify({"error": "許可されていないファイルパスです"}), 403
    try:
        full_path.relative_to(get_docs_lake_dir())
        return jsonify({"error": "docs_lake_dir内のファイルは直接返却できません"}), 403
    except ValueError:
        pass
    if not full_path.exists():
        return jsonify({"error": "ファイルが存在しません"}), 404
    try:
        allowed_extensions = {".xlsx", ".pdf", ".doc", ".docx", ".ppt", ".pptx"}
        if full_path.suffix.lower() in allowed_extensions:
            mapping = {}
            mapping_file = get_docs_lake_dir() / "mapping.json"
            if mapping_file.exists():
                try:
                    with mapping_file.open("r", encoding="utf-8") as f:
                        mapping = json.load(f)
                except Exception as e:
                    print(f"Mapping 読み込みエラー: {e}")
            matched_entries = []
            for id_str, info in mapping.get("id_to_file", {}).items():
                try:
                    if Path(info.get("original_file")).resolve() == full_path:
                        matched_entries.append((int(id_str), id_str, info))
                except Exception:
                    pass
            if matched_entries:
                matched_entries.sort(key=lambda x: x[0])
                combined_text = ""
                for _, id_str, _ in matched_entries:
                    txt_file = get_docs_lake_dir() / f"{id_str}.txt"
                    if txt_file.exists():
                        combined_text += txt_file.read_text(encoding="utf-8") + "\n"
                content = combined_text.strip()
            else:
                converted_content = get_text_converted_content(full_path)
                if converted_content:
                    content = converted_content
                else:
                    content = "ファイルの内容をテキストとして読み込めません。"
        else:
            with full_path.open("r", encoding="utf-8") as f:
                content = f.read()
        
        # コンテンツが30KBを超える場合は、先頭9000トークンのみ返却する
        encoding = tiktoken.encoding_for_model("gpt-3.5-turbo")
        tokens = encoding.encode(content)
        if len(tokens) > 9000:
            content = encoding.decode(tokens[:9000]) + "\n...長いため省略"

        highlight = request.args.get("highlight", "")
        if highlight:
            terms = parse_query_into_terms(highlight)
            highlighted_content = highlight_search_results(content, terms)
        else:
            highlighted_content = None
        metadata = get_file_metadata(str(full_path))
        last_modified = metadata.get('last_modified', '')
        
        response = {
            "path": file_path_param,
            "content": content,
            "last_modified": last_modified
        }
        if highlighted_content:
            response["highlighted_excerpt"] = highlighted_content
        return jsonify(response)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --------------------------------
# /gptResponse エンドポイント
# --------------------------------
@app.route("/gptResponse", methods=["POST"])
def openai_request():
    data = request.get_json()
    if not data or "prompt" not in data:
        return jsonify({"error": "No prompt provided"}), 400
    prompt = data["prompt"]
    temperature = data.get("temperature", 0.0)
    return call_gpt(prompt, temperature)

# --------------------------------
# /agent エンドポイント
# --------------------------------
@app.route("/agent", methods=["POST"])
def agent_endpoint():
    data = request.get_json()
    if not data or "issue" not in data:
        return jsonify({"error": "障害内容 (issue) は必須です"}), 400
    issue = data["issue"]
    trace_log = data.get("trace_log", "")
    search_keywords = data.get("search_keywords", "")
    request_id = "req_" + datetime.now().strftime("%Y%m%d%H%M%S%f")
    result = run_search_agent(issue, trace_log, search_keywords)
    log_dir = Path("agent_log")
    if not log_dir.exists():
        log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"{request_id}.log"
    log_content = {
        "request_id": request_id,
        "input": {
            "issue": issue,
            "trace_log": trace_log,
            "search_keywords": search_keywords
        },
        "result": result
    }
    with log_file.open("w", encoding="utf-8") as f:
        json.dump(log_content, f, ensure_ascii=False, indent=2)
    response = {
        "agent_response": result.get("agent_response"),
        "search_query": result.get("search_query"),
        "file_path": result.get("file_path"),
        "request_id": request_id
    }
    return jsonify(response)

# --------------------------------
# /agent_stream エンドポイント
# --------------------------------
@app.route("/agent_stream", methods=["GET"])
def agent_stream_endpoint():
    issue = request.args.get("issue")
    if not issue:
        return jsonify({"error": "Requestは必須です"}), 400
    trace_log = request.args.get("trace_log", "")
    search_keywords = request.args.get("search_keywords", "")
    request_id = "req_" + datetime.now().strftime("%Y%m%d%H%M%S%f")
    sse_queue = Queue()
    def send_func(message):
        sse_queue.put(message)
    callback_handler = MyCustomCallbackHandler(send_func)
    result_container = {}
    def run_agent():
        result_container['result'] = run_search_agent(issue, trace_log, search_keywords, callback_handler=callback_handler)
    thread = Thread(target=run_agent)
    thread.start()
    def event_stream():
        yield "data: " + json.dumps({
            "event": "start",
            "message": "エージェント処理を開始します",
            "request_id": request_id
        }) + "\n\n"
        yield "data: " + json.dumps({
            "event": "progress",
            "message": "入力データを受け取りました",
            "request_id": request_id
        }) + "\n\n"
        while thread.is_alive() or not sse_queue.empty():
            try:
                msg = sse_queue.get(timeout=0.5)
                yield "data: " + msg + "\n\n"
            except Empty:
                continue
        while not sse_queue.empty():
            msg = sse_queue.get()
            yield "data: " + msg + "\n\n"
        final_result = result_container.get('result', {})
        yield "data: " + json.dumps({
            "event": "result",
            "message": "エージェント処理が完了しました",
            "result": final_result,
            "request_id": request_id
        }) + "\n\n"
    return Response(stream_with_context(event_stream()), mimetype="text/event-stream")

# --------------------------------
# /config エンドポイント
# --------------------------------
@app.route("/config", methods=["GET"])
def get_config_endpoint():
    config = get_config()
    return jsonify({
        "end_point": config.get("end_point"),
        "api_key": config.get("api_key"),
        "app_dir": config.get("app_dir")
    })

@app.route("/config", methods=["POST"])
def update_config_endpoint():
    print("Updating config")
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400
    allowed_keys = {"end_point", "api_key", "app_dir"}
    update_data = {k: v for k, v in data.items() if k in allowed_keys}
    if not update_data:
        return jsonify({"error": "No valid keys provided for update"}), 400
    if "app_dir" in update_data:
        app_dir_value = update_data["app_dir"]
        if not app_dir_value:
            return jsonify({"error": "app_dir is empty"}), 400
        if not Path(app_dir_value).exists() or not Path(app_dir_value).is_dir():
            return jsonify({"error": f"app_dir '{app_dir_value}' does not exist or is not a directory"}), 400
    updated_config = update_config(update_data)
    # app_dir が更新された場合、新しい app_dir に合わせて docs_lake_dir を更新
    if "app_dir" in update_data:
        new_app_dir = Path(updated_config["app_dir"]).resolve()
        default_docs_lake_folder = updated_config.get("docs_lake_dir")
        if not default_docs_lake_folder:
            default_docs_lake_folder = "__docs__"
        new_docs_lake_dir = new_app_dir / default_docs_lake_folder
        updated_config = set_doc_lake_dir(str(new_docs_lake_dir))
    return jsonify({
        "message": "Config updated successfully",
        "updated": {k: updated_config.get(k) for k in allowed_keys.union({"docs_lake_dir"})}
    })

# --------------------------------
# /init_status エンドポイント
# --------------------------------
@app.route("/init_status", methods=["GET"])
def init_status_endpoint():
    return jsonify({"initialization_completed": initialization_status["completed"]})

if __name__ == "__main__":
    # 起動時にも docs_lake_dir を正しく更新する
    docs_lake_dir = get_docs_lake_dir()
    if not docs_lake_dir.exists():
        docs_lake_dir.mkdir(parents=True)
    set_doc_lake_dir(str(docs_lake_dir))
    app.run(host="127.0.0.1", debug=False, port=APP_PORT)
