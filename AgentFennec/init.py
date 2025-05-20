import sys
sys.stdout.reconfigure(encoding='utf-8')

from pathlib import Path
import zipfile
import json
from code_analyze_tools import setup as setup1
from directory_search_utils import setup as setup2
from config_manager import get_config, set_doc_lake_dir
from index_optimizer import delete_index
from docs_lake_initializer import clear_docs_lake_dir, convert_all_files, save_mapping

def add_sock(message):
    return "data: " + message + "\n\n"

def init():
    config = get_config()
    # app_dir, docs_lake_dir, index_dir を Pathlib で扱う
    app_dir = Path(config.get("app_dir", Path.cwd() / "docs" / "root"))
    docs_lake_dir = app_dir / config.get("docs_dir", "__docs__")
    index_dir = app_dir / config.get("index_dir", "index")

    # 1. Index の削除
    yield add_sock(json.dumps({"status": "progress", "step": "Index削除開始", "progress": 0}))
    delete_result = delete_index(str(index_dir))
    print(f"Index deletion result: {delete_result}")
    if delete_result.get("status") != "success":
        error_message = f"Index deletion failed: {delete_result.get('message')}"
        print(error_message)
        yield add_sock(json.dumps({"status": "progress", "step": "Index削除失敗", "progress": 100}))
        return {"state": "error", "step": error_message}
    print("Index deletion successful.")
    yield add_sock(json.dumps({"status": "progress", "step": "Index削除完了", "progress": 100}))

    # 2. ZIP ファイルの展開と削除（app_dir 内の *.zip） ※必要に応じて有効化
    if False:
        print(f"Extracting zip files in: {app_dir}")
        zip_files = list(app_dir.glob("*.zip"))
        total_zip = len(zip_files)
        for i, zip_file in enumerate(zip_files, start=1):
            try:
                with zipfile.ZipFile(str(zip_file), 'r') as z:
                    z.extractall(str(app_dir))
            except zipfile.BadZipFile:
                print(f"Skipping invalid zip file: {zip_file}")
                continue
            zip_file.unlink()
            print(f"Extracted and removed: {zip_file}")
            yield json.dumps({
                "status": "progress",
                "step": "ZIP展開",
                "progress": int((i / total_zip) * 100)
            })
    
    # 3. docs_lake_dir の存在チェック（存在しなければ作成）
    if docs_lake_dir.exists():
        print(f"docs_lake_dir already exists: {docs_lake_dir}")
    else:
        docs_lake_dir.mkdir(parents=True)
        print(f"Created docs_lake_dir: {docs_lake_dir}")
    set_doc_lake_dir(str(docs_lake_dir))
    yield add_sock(json.dumps({
        "status": "progress",
        "step": f"docsLakeの設定完了: {docs_lake_dir}",
        "progress": 100
    }))

    # 4. docs_lake_dir 内の既存の txt/json ファイルを削除（update 用）
    print("Clearing existing files in docs_lake_dir...")
    clear_docs_lake_dir(docs_lake_dir)
    yield add_sock(json.dumps({"status": "progress", "step": "docsLakeの初期化完了", "progress": 100}))

    # 5. setup1 の実行
    yield add_sock(json.dumps({"status": "progress", "step": "ツリー作成開始", "progress": 0}))
    # ※ progress_callback 内での進捗は convert_all_files 等と同様、yield で送信するためここはシンプルに実行
    result_setup1 = yield from setup1()
    #print("setup1:", result_setup1)
    yield add_sock(json.dumps({"status": "progress", "step": "ツリー作成完了", "progress": 100}))

    # 6. setup2 の実行
    yield add_sock(json.dumps({"status": "progress", "step": "コード解析開始", "progress": 0}))
    result_setup2 = yield from setup2()
    #print("setup2:", result_setup2)
    yield add_sock(json.dumps({"status": "progress", "step": "コード解析完了", "progress": 100}))

    yield add_sock(json.dumps({"status": "progress", "step": "初期設定完了", "progress": 100}))

    # 7. app_dir 内の対象ファイルをテキスト化して docs_lake_dir に保存（進捗付き）
    print("Starting file conversion...")
    # convert_all_files はジェネレーターになっており、yield from で進捗メッセージをそのまま送信
    mapping = yield from convert_all_files(app_dir, docs_lake_dir)
    yield add_sock(json.dumps({"status": "progress", "step": "マッピング開始", "progress": 0}))
    # 8. mapping を JSON 形式で保存
    save_mapping(mapping, docs_lake_dir)
    print("File conversion completed.")
    yield json.dumps({"status": "progress", "step": "マッピング完了", "progress": 100})
    
    return {"state": "success", "step": "Initialization and file conversion completed successfully."}

if __name__ == "__main__":
    gen = init()
    final_result = None
    try:
        while True:
            progress = next(gen)
            print(progress)
    except StopIteration as e:
        final_result = e.value
    print(final_result)
