import os
import json
import yaml
import functools
import concurrent.futures
from collections import defaultdict

from config_manager import get_config

# --- グローバル変数 ---
global_config = None
file_index = None
file_index_needs_update = True
binary_extensions_cache = {}

@functools.lru_cache(maxsize=10)
def load_binary_extensions(binary_list_yaml_path: str) -> set:
    """
    Load known binary extensions from YAML file and return as a set (lowercase).
    結果をキャッシュして繰り返しの読み込みを避ける
    """
    global binary_extensions_cache
    
    if binary_list_yaml_path in binary_extensions_cache:
        return binary_extensions_cache[binary_list_yaml_path]
        
    try:
        with open(binary_list_yaml_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
        extensions = data.get("binary_extensions", [])
        result = set(ext.lower() for ext in extensions)
        
        # キャッシュに保存
        binary_extensions_cache[binary_list_yaml_path] = result
        return result
    except Exception:
        return set()

def is_binary_file(file_path: str, binary_extensions: set = None) -> bool:
    """
    拡張子を先にチェックし、その後コンテンツをチェックする最適化版
    """
    # 拡張子でまず判断
    if binary_extensions:
        _, ext = os.path.splitext(file_path)
        ext_lower = ext.lower()
        if ext_lower in binary_extensions:
            return True
    
    # 拡張子で判断できない場合のみコンテンツで判断
    try:
        with open(file_path, 'rb') as f:
            CHUNK_SIZE = 1024
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                return False
            return b'\0' in chunk
    except Exception:
        return True

def build_folder_tree_json(directory: str, non_binary_only: bool = False, binary_extensions: set = None, 
                          max_depth: int = 100, current_depth: int = 0) -> dict:
    """
    Build a folder tree from the specified directory.
    Record extension occurrences for each folder.
    最大深度制限とパフォーマンス最適化を追加
    """
    # 深さ制限チェック
    if current_depth > max_depth:
        return {"folder": os.path.basename(directory), "extensions": {}, "children": []}
    
    tree = {}
    tree['folder'] = os.path.basename(directory) if os.path.basename(directory) else directory
    tree['extensions'] = defaultdict(int)
    tree['children'] = []
    
    try:
        entries = os.listdir(directory)
    except Exception:
        entries = []
    
    # ファイル処理
    for entry in entries:
        full_path = os.path.join(directory, entry)
        if os.path.isfile(full_path):
            _, ext = os.path.splitext(entry)
            ext_lower = ext.lower()
            
            # 非バイナリファイルのみのオプションが有効な場合
            if non_binary_only:
                # 既知のバイナリ拡張子の場合はスキップ
                if binary_extensions and ext_lower in binary_extensions:
                    continue
                    
                # バイナリファイルの場合はスキップ
                if is_binary_file(full_path, binary_extensions):
                    continue
                    
                # 拡張子が長すぎる場合はスキップ
                if ext_lower and len(ext_lower) > 10:
                    continue
            
            # 拡張子の出現回数をカウント
            if ext_lower:
                tree['extensions'][ext_lower] += 1
            else:
                # 拡張子なしのファイルをカウント
                tree['extensions'][""] += 1
    
    # ディレクトリ処理
    dir_entries = [entry for entry in entries if os.path.isdir(os.path.join(directory, entry))]
    
    # 深さが一定以上の場合は並列処理を使用
    if current_depth < 2 and len(dir_entries) > 5:
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = []
            for entry in dir_entries:
                full_path = os.path.join(directory, entry)
                # 並列処理でサブディレクトリのツリーを構築
                futures.append(executor.submit(
                    build_folder_tree_json, 
                    full_path, 
                    non_binary_only, 
                    binary_extensions,
                    max_depth,
                    current_depth + 1
                ))
            
            # 結果を収集
            for future in concurrent.futures.as_completed(futures):
                try:
                    child_tree = future.result()
                    tree['children'].append(child_tree)
                    # 子ディレクトリの拡張子カウントを親に合算
                    for ext, count in child_tree['extensions'].items():
                        tree['extensions'][ext] += count
                except Exception as e:
                    print(f"Error processing directory: {e}")
    else:
        # 通常の逐次処理
        for entry in dir_entries:
            full_path = os.path.join(directory, entry)
            child_tree = build_folder_tree_json(
                full_path, 
                non_binary_only, 
                binary_extensions,
                max_depth,
                current_depth + 1
            )
            tree['children'].append(child_tree)
            # 子ディレクトリの拡張子カウントを親に合算
            for ext, count in child_tree['extensions'].items():
                tree['extensions'][ext] += count
    
    # defaultdictから通常のdictに変換
    tree['extensions'] = dict(tree['extensions'])
    return tree

def normalize_folder_relative_path(frp: str, app_dir: str) -> str:
    # 空文字列の場合は空を返す（ルートディレクトリを意味する）
    if not frp or frp == "./" or frp == ".":
        return ""
        
    # Normalize to remove extra slashes
    frp = os.path.normpath(frp)
    # Remove "./" at the beginning
    if frp.startswith("." + os.sep):
        frp = frp[2:]
        
    # Get base name of app_dir (e.g., "root")
    base_name = os.path.basename(os.path.normpath(app_dir))
    
    # base_name のみの場合も処理（完全一致）
    if frp == base_name:
        return ""
        
    # Remove base_name if frp starts with it
    if frp.startswith(base_name + os.sep):
        frp = frp[len(base_name)+1:]
        
    return frp

# --- Folder Structure Display Helpers ---

@functools.lru_cache(maxsize=100)
def list_files_in_folder(folder_path: str, extension: str):
    """
    Return a list of filenames with the specified extension in the folder.
    If extension is "*" or empty, return all files.
    Automatically add "." at the beginning of extension if missing.
    結果をキャッシュして繰り返しの読み込みを避ける
    """
    try:
        files = os.listdir(folder_path)
        # No filtering if extension is "*" or empty
        if extension in ["*", ""]:
            file_list = [f for f in files if os.path.isfile(os.path.join(folder_path, f))]
        else:
            if not extension.startswith("."):
                extension = "." + extension
            file_list = [f for f in files if os.path.isfile(os.path.join(folder_path, f)) and f.lower().endswith(extension.lower())]
        return file_list
    except Exception:
        return []

def get_folder_tree_str(tree: dict, extension: str, indent: int = 0, debug: bool = False, 
                         base_path: str = None, file_count_threshold: int = None, show_file_names: bool = None,
                         max_depth: int = 100) -> str:
    """
    フォルダツリーを文字列で返す際、以下の仕様を適用する:
      1. 親フォルダと子フォルダが1対1かつファイル数が同じ場合は、名前を「親/子」としてマージして表示する
      2. ファイル数が0のフォルダは出力しない
    """
    # 最大深度に達した場合は、単一行で返す
    if indent >= max_depth:
        if extension in ["*", ""]:
            current_count = sum(tree.get('extensions', {}).values())
        else:
            current_count = tree.get('extensions', {}).get(extension, 0)
        return "" if current_count == 0 else "  " * indent + f"{tree.get('folder', '')} ({current_count})"

    # 拡張子に応じたファイル数を算出
    if extension in ["*", ""]:
        current_count = sum(tree.get('extensions', {}).values())
    else:
        current_count = tree.get('extensions', {}).get(extension, 0)

    # ファイル数が0の場合は表示しない
    if current_count == 0:
        return ""

    # show_file_names の初期化（トップレベルの場合はファイル数閾値で判定）
    if show_file_names is None:
        if file_count_threshold is not None and indent == 0:
            show_file_names = (current_count <= file_count_threshold)
        else:
            show_file_names = False

    folder_name = tree.get('folder', '')
    merged_name = folder_name
    current_node = tree

    # 子が1件のみ、かつそのファイル数が親と同じなら名前をマージする
    while len(current_node.get('children', [])) == 1:
        child = current_node['children'][0]
        if extension in ["*", ""]:
            child_count = sum(child.get('extensions', {}).values())
        else:
            child_count = child.get('extensions', {}).get(extension, 0)
        # 子のファイル数が0の場合はマージせずループ終了
        if child_count == 0:
            break
        # 親と子のファイル数が一致していればマージ
        if current_count == child_count:
            merged_name = merged_name + "/" + child.get('folder', '')
            current_node = child
        else:
            break

    lines = []
    lines.append("  " * indent + f"{merged_name} ({current_count})")

    # オプションでファイル一覧を表示する場合
    if show_file_names and base_path:
        files = list_files_in_folder(base_path, extension)
        for f in files:
            lines.append("  " * (indent + 1) + f"- {f}")

    # マージ後のノードの子を再帰的に処理
    for child in current_node.get('children', []):
        child_base_path = os.path.join(base_path, child.get('folder', '')) if base_path else None
        subtree_str = get_folder_tree_str(child, extension, indent + 1, debug, child_base_path, file_count_threshold, show_file_names, max_depth)
        if subtree_str:
            lines.append(subtree_str)

    return "\n".join(lines)


def get_folder_tree(tree: dict, extension: str, debug: bool = False, file_count_threshold: int = None, 
                    base_path: str = None, max_depth: int = 100) -> str:
    """
    Return the folder tree as a string with a header.
    base_path should be the absolute path used to generate the tree.
    max_depth limits the displayed depth.
    """
    if extension in ["*", ""]:
        header = "```folder tree(file)"
    else:
        header = f"```folder tree({extension})"
    body = get_folder_tree_str(tree, extension, indent=0, debug=debug, base_path=base_path, 
                               file_count_threshold=file_count_threshold, max_depth=max_depth)
    return header + "\n" + body + "\n```"

# --- 検索インデックス機能 ---

def build_search_index(root_dir):
    """
    検索インデックスを構築する
    ファイル名と拡張子をインデックス化して高速な検索を可能にする
    完全一致と部分一致の両方をサポート
    """
    # 完全一致用インデックス
    exact_index = {}
    # 部分一致用インデックス (すべてのファイルパスを格納)
    files_list = []
    
    for root, _, files in os.walk(root_dir):
        for file in files:
            file_lower = file.lower()
            rel_path = os.path.relpath(os.path.join(root, file), root_dir)
            
            # 部分一致用のリストに追加
            files_list.append((rel_path, file_lower))
            
            # ファイル名と拡張子を分割
            name, ext = os.path.splitext(file_lower)
            
            # ファイル名と拡張子でインデックス化
            if file_lower not in exact_index:
                exact_index[file_lower] = []
            exact_index[file_lower].append(rel_path)
            
            # ファイル名のみでもインデックス化
            if name not in exact_index:
                exact_index[name] = []
            exact_index[name].append(rel_path)
            
            # 拡張子のみでもインデックス化
            if ext and ext not in exact_index:
                exact_index[ext] = []
            if ext:
                exact_index[ext].append(rel_path)
    
    return {
        'exact': exact_index,
        'files': files_list
    }

def refresh_search_index():
    """
    検索インデックスを更新する
    """
    global file_index, file_index_needs_update
    config = get_config()
    app_dir = config.get("app_dir", os.path.join(os.getcwd(), 'docs/root'))
    file_index = build_search_index(app_dir)
    file_index_needs_update = False
    print(f"検索インデックスを更新しました。ファイル数: {len(file_index['files'])}")

# --------------------------------------------------
# Setup Tools
# --------------------------------------------------
def setup():
    """
    ディレクトリ検索のセットアップを行い、フォルダツリーの作成と検索インデックスの更新を実施します。
    progress_callback(step, percentage) を利用して各処理段階で進捗を報告します。
    """
    import os, json
    try:
        yield "data: " + json.dumps({
            "status": "progress",
            "step": "ディレクトリの確認中",
            "progress": 0
        })+ "\n\n"
        config = get_config()
        folder_path = config.get("app_dir", os.path.join(os.getcwd(), "docs", "root"))
        
        non_binary_only_option = config.get("non_binary_only_option", True)
        binary_list_yaml_path = config.get("binary_list_yaml_path", "./dict/binary_extensions.yml")
        folder_tree_output_path = config.get("folder_tree_output_path", "./dict/folder_tree.json")
        folder_tree_only_non_binary_output_path = config.get("folder_tree_only_non_binary_output_path", "./dict/folder_tree_only_non_binary.json")
        
        binary_ext_set = load_binary_extensions(binary_list_yaml_path) if non_binary_only_option else None
        yield "data: " + json.dumps({
            "status": "progress",
            "step": "バイナリ一覧の取得中",
            "progress": 10
        })+ "\n\n"
        
        os.makedirs(os.path.dirname(folder_tree_output_path), exist_ok=True)
        os.makedirs(os.path.dirname(folder_tree_only_non_binary_output_path), exist_ok=True)
        
        # ステップ1: フォルダツリー（全ファイル）の作成
        tree = build_folder_tree_json(folder_path, non_binary_only=False, binary_extensions=binary_ext_set)
        with open(folder_tree_output_path, 'w', encoding='utf-8') as f:
            json.dump(tree, f, ensure_ascii=False, indent=2)
        yield "data: " + json.dumps({
            "status": "progress",
            "step": "フォルダツリーの作成中",
            "progress": 20
        })+ "\n\n"
        
        # ステップ2: フォルダツリー（非バイナリファイル）の作成
        tree_non_binary = build_folder_tree_json(folder_path, non_binary_only=non_binary_only_option, binary_extensions=binary_ext_set)
        with open(folder_tree_only_non_binary_output_path, 'w', encoding='utf-8') as f:
            json.dump(tree_non_binary, f, ensure_ascii=False, indent=2)
        yield "data: " + json.dumps({
            "status": "progress",
            "step": "フォルダツリー（非バイナリ）の作成中",
            "progress": 40
        })+ "\n\n"
        
        # ステップ3: 検索インデックスの更新
        refresh_search_index()
        yield "data: " + json.dumps({
            "status": "progress",
            "step": "ディレクトリセットアップ完了",
            "progress": 100
        })+ "\n\n"
        return "Setup successful."
    except Exception as e:
        yield "data: " + json.dumps({
            "status": "progress",
            "step": "ディレクトリセットアップ失敗",
            "progress": 100
        })+ "\n\n"
        return f"Setup failed: {str(e)}"


# --------------------------------------------------
# LangChain Tool definitions
# --------------------------------------------------
#from langchain.agents import Tool

#@Tool
def folder_summary(mode: str = "top", n: int = None) -> str:
    print("folder_summary:", mode, n)
    """
    Return a folder summary including code files.
    Counts files by extension from "folder_tree_only_non_binary.json",
    showing the top N extensions by count if mode is "top", or least frequent if "worst".
    Also displays a folder tree with all files (*) up to depth 2.
    
    Note: For folder summary, folder_relative_path is assumed to be root ("./").
    """
    config = get_config()
    n = n or config.get("folder_summary_top_n", 10)
    json_path = config.get("folder_tree_only_non_binary_output_path", "./dict/folder_tree_only_non_binary.json")
    if not os.path.exists(json_path):
        return f"Error: JSON file {json_path} does not exist. Please run setup."
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            tree = json.load(f)
        extensions = tree.get("extensions", {})
        if not extensions:
            summary_lines = ["No extensions found in the folder tree."]
        else:
            if mode == "top":
                sorted_ext = sorted(extensions.items(), key=lambda x: x[1], reverse=True)
            else:
                sorted_ext = sorted(extensions.items(), key=lambda x: x[1])
            result = sorted_ext[:n]
            summary_lines = [f"{ext if ext else '[no ext]'}: {count}" for ext, count in result]
        # Add folder tree (extension "*", depth 2)  
        # Use "./" as folder_relative_path with app_dir as base path
        app_dir = config.get("app_dir", os.path.join(os.getcwd(), 'docs/root'))
        folder_tree_display = get_folder_tree(tree, "*", debug=False, 
                                              file_count_threshold=config.get("file_count_threshold", 30), 
                                              base_path=app_dir, max_depth=2)
        summary_lines.append("\nFolder Tree:")
        summary_lines.append(folder_tree_display)
        return "\n".join(summary_lines)
    except Exception as e:
        return f"Error processing folder summary: {str(e)}"

#@Tool
def folder_structure(folder_relative_path: str, extension:str, max_depth: int = 100) -> str:
    print("folder_structure:", folder_relative_path, extension, max_depth)
    """
    Return the folder structure for the specified folder (relative path).
    - If extension is "*" or empty, show all files (non-binary with extension ≤ 10 chars).
    - Otherwise, show files with the specified extension ("." is added automatically if missing).
    - max_depth limits the displayed folder depth (default is 100).
    - folder_relative_path is interpreted relative to config(app_dir).
      Example: if app_dir = ./docs/root, then "./root/xxx", "root/xxx", "./xxx", and "xxx"
      all resolve to "xxx", and "./root/xxx/yyy" or "xxx/yyy" resolve to "xxx/yyy".
    """
    config = get_config()
    file_count_threshold = config.get("file_count_threshold", 30)
    app_dir = config.get("app_dir", os.path.join(os.getcwd(), 'docs/root'))
    # Normalize folder_relative_path
    frp = normalize_folder_relative_path(folder_relative_path, app_dir)
    folder_path = os.path.join(app_dir, frp) if frp else app_dir
    folder_path = os.path.abspath(folder_path)
    if not os.path.exists(folder_path) or not os.path.isdir(folder_path):
        return f"Error: Folder {folder_relative_path} does not exist."

    # Process extension: "*" or empty means build tree based on folder_relative_path
    if extension in ["*", ""]:
        # Use existing JSON if folder_relative_path is root
        if frp == "":
            json_path = config.get("folder_tree_only_non_binary_output_path", "./dict/folder_tree_only_non_binary.json")
            if os.path.exists(json_path):
                with open(json_path, 'r', encoding='utf-8') as f:
                    tree = json.load(f)
            else:
                binary_list_yaml_path = config.get("binary_list_yaml_path", "./dict/binary_extensions.yml")
                non_binary_only_option = True
                binary_ext_set = load_binary_extensions(binary_list_yaml_path) if non_binary_only_option else None
                tree = build_folder_tree_json(folder_path, non_binary_only=non_binary_only_option, binary_extensions=binary_ext_set)
        else:
            # Always build tree from the subfolder if folder_relative_path is not root
            binary_list_yaml_path = config.get("binary_list_yaml_path", "./dict/binary_extensions.yml")
            non_binary_only_option = True
            binary_ext_set = load_binary_extensions(binary_list_yaml_path) if non_binary_only_option else None
            tree = build_folder_tree_json(folder_path, non_binary_only=non_binary_only_option, binary_extensions=binary_ext_set)
        return get_folder_tree(tree, "*", debug=False, file_count_threshold=file_count_threshold, base_path=folder_path, max_depth=max_depth)
    else:
        # For specific extensions, add "." if missing
        if not extension.startswith("."):
            extension = "." + extension
        # Build tree for all files (no filtering)
        tree = build_folder_tree_json(folder_path, non_binary_only=False, binary_extensions=None)
        return get_folder_tree(tree, extension, debug=False, file_count_threshold=file_count_threshold, base_path=folder_path, max_depth=max_depth)

#@Tool
def search_files(query: str, folder_relative_path: str, extension: str = "") -> str:
    print("search_files:", query, folder_relative_path, extension)
    """
    Search for files matching the query and return results.
    Search is performed on filenames only (folder names are ignored).
    検索インデックスを使用して高速化、部分一致検索にも対応
    
    Parameters:
    - query: Search keywords (multiple keywords separated by spaces for AND search)
    - folder_relative_path: Relative path to limit search scope (default is root)
    - extension: File extension to filter by ("." added automatically, empty for all extensions)
    - max_results: Maximum number of results to display (default from config.json)
    
    Returns:
    - String with search results. If no matches, suggests broader search or OR search.
    """
    global file_index, file_index_needs_update
    
    config = get_config()
    app_dir = config.get("app_dir", os.path.join(os.getcwd(), 'docs/root'))
    max_results = config.get("search_max_results", 10)
    
    # インデックスが存在しない場合は構築
    if file_index is None or file_index_needs_update:
        refresh_search_index()
    
    # Normalize folder_relative_path
    frp = normalize_folder_relative_path(folder_relative_path, app_dir)
    folder_path = os.path.join(app_dir, frp) if frp else app_dir
    folder_path = os.path.abspath(folder_path)
    
    if not os.path.exists(folder_path) or not os.path.isdir(folder_path):
        return f"Error: Folder {folder_relative_path} does not exist."
    
    # Process extension
    if extension and not extension.startswith("."):
        extension = "." + extension
    
    # Split query keywords
    keywords = [k.lower() for k in query.split()]
    if not keywords:
        return "Error: Please enter search keywords."

    # 検索結果（完全一致と部分一致を組み合わせる）
    matches = []
    
    # 1. 完全一致検索
    exact_matches = []
    for keyword in keywords:
        if keyword in file_index['exact']:
            # キーワードに完全一致するパスを取得
            paths = file_index['exact'][keyword]
            # 指定フォルダ内のパスのみをフィルタリング
            filtered_paths = [p for p in paths if (frp and p.startswith(frp)) or not frp]
            
            # 拡張子でフィルタリング
            if extension:
                filtered_paths = [p for p in filtered_paths if p.lower().endswith(extension.lower())]
            
            # 最初のキーワードの場合は結果をセット
            if not exact_matches:
                exact_matches = filtered_paths
            # AND検索なので、以前の結果と交差
            else:
                exact_matches = [p for p in exact_matches if p in filtered_paths]
                
            # 一致するものがなくなったら終了
            if not exact_matches:
                break
    
    # 完全一致の結果を追加
    matches.extend(exact_matches)
    
    # 2. 部分一致検索（完全一致で十分な結果が得られない場合）
    if len(matches) < max_results:
        # 部分一致検索
        partial_matches = []
        
        # 各ファイルに対して、すべてのキーワードで部分一致検索
        for rel_path, filename in file_index['files']:
            # パスフィルタリング（指定フォルダ内のみ）
            if (frp and not rel_path.startswith(frp)) and frp:
                continue
                
            # 拡張子フィルタリング
            if extension and not rel_path.lower().endswith(extension.lower()):
                continue
                
            # すべてのキーワードが部分一致するか確認（AND検索）
            if all(keyword in filename for keyword in keywords):
                # 完全一致結果に含まれていなければ追加
                if rel_path not in matches:
                    partial_matches.append(rel_path)
        
        # 部分一致の結果を追加（最大件数を超えない範囲で）
        remaining = max_results - len(matches)
        matches.extend(partial_matches[:remaining])
    
    # 結果を整形
    result_lines = []
    
    # 検索結果
    if matches:
        # 重複を削除
        all_unique_matches = sorted(set(matches))
        # 総数を保存
        total_matches = len(all_unique_matches)
        # 表示用に制限
        unique_matches = all_unique_matches[:max_results]
        
        result_lines.append(f"Search results ({total_matches} found):")
        for i, match in enumerate(unique_matches):
            result_lines.append(f"{i+1}. {match}")
        if total_matches > max_results:
            result_lines.append(f"Note: Displaying {max_results} of {total_matches} results.")
    else:
        result_lines.append("Search results: 0 found")
        
        # OR検索を試す（部分一致も含む）
        or_matches = []
        
        # 1. 完全一致でOR検索
        for keyword in keywords:
            if keyword in file_index['exact']:
                paths = file_index['exact'][keyword]
                # 指定フォルダ内のパスのみをフィルタリング
                filtered_paths = [p for p in paths if (frp and p.startswith(frp)) or not frp]
                
                # 拡張子でフィルタリング
                if extension:
                    filtered_paths = [p for p in filtered_paths if p.lower().endswith(extension.lower())]
                
                or_matches.extend(filtered_paths)
                
        # 2. 部分一致でOR検索（結果が少ない場合）
        if len(or_matches) < max_results:
            for rel_path, filename in file_index['files']:
                # パスフィルタリング（指定フォルダ内のみ）
                if (frp and not rel_path.startswith(frp)) and frp:
                    continue
                    
                # 拡張子フィルタリング
                if extension and not rel_path.lower().endswith(extension.lower()):
                    continue
                    
                # いずれかのキーワードが部分一致するか確認（OR検索）
                if any(keyword in filename for keyword in keywords):
                    # 既存の結果に含まれていなければ追加
                    if rel_path not in or_matches:
                        or_matches.append(rel_path)
        
        if or_matches:
            # 重複を削除
            all_unique_or_matches = sorted(set(or_matches))
            # 総数を保存
            total_or_matches = len(all_unique_or_matches)
            # 表示用に制限
            unique_or_matches = all_unique_or_matches[:max_results]
            
            result_lines.append(f"\nSuggested results (OR search): {total_or_matches} found")
            for i, match in enumerate(unique_or_matches):
                result_lines.append(f"{i+1}. {match}")
            if total_or_matches > max_results:
                result_lines.append(f"Note: Displaying {max_results} of {total_or_matches} results.")
        else:
            result_lines.append("\nNo suggestions found. Try changing extensions or keywords.")
    
    return "\n".join(result_lines)