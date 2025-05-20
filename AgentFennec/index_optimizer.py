import os
import pickle
import yaml
import shutil
from whoosh.analysis import StandardAnalyzer, Filter
from config_manager import get_config
config = get_config()  # 設定を取得

# YAMLファイルからバイナリ（または除外対象）の拡張子リストを取得
binary_extensions_file = config.get("binary_list_yaml_path", "./dict/binary_extensions.yml")
try:
    with open(binary_extensions_file, "r", encoding="utf-8") as f:
        yml_data = yaml.safe_load(f)
    # 拡張子は小文字で統一
    binary_extensions = [ext.lower() for ext in yml_data.get("binary_extensions", [])]
except Exception as e:
    print(f"バイナリ拡張子設定の読み込みエラー: {e}")
    binary_extensions = []

# カスタムフィルター：トークンの長さが2文字以上39文字以下の場合のみ通過
class LengthFilter(Filter):
    def __init__(self, min=2, max=39):
        self.min = min
        self.max = max

    def __call__(self, tokens):
        for token in tokens:
            if self.min <= len(token.text) <= self.max:
                yield token

# カスタムアナライザーの定義（標準アナライザーにLengthFilterを連結）
custom_analyzer = StandardAnalyzer() | LengthFilter(min=2, max=39)

def get_file_metadata(file_path):
    """ファイルのメタデータ（最終更新日時とサイズ）を取得"""
    stat = os.stat(file_path)
    return {
        'last_modified': stat.st_mtime,
        'size': stat.st_size
    }

def is_binary_file(file_path, sample_size=1024):
    """
    指定したファイルがバイナリかどうかを簡易的に判定する。
    - ファイル先頭の一部をバイナリモードで読み込み、NULバイト(\x00)が含まれていればバイナリとみなす。
    """
    try:
        with open(file_path, 'rb') as f:
            chunk = f.read(sample_size)
        if b'\x00' in chunk:
            return True
        return False
    except:
        return True

def update_index(index_dir, app_dir, force_rebuild=False, progress_callback=None):
    """
    app_dir 内のファイルを走査し、docs_lake_dir 内のファイルとそれ以外で分け、  
    index_dir 内に「docs」と「other」の2つのサブフォルダにインデックスデータを作成します。
    ※force_rebuildがTrueの場合は全ファイルを再インデックス化します。
    progress_callback(step, percentage) が指定されていれば各ステップで進捗を報告します。
    """
    # index_dir にサブフォルダ「docs」と「other」を作成
    if not os.path.exists(index_dir):
        os.mkdir(index_dir)
        force_rebuild = True  # インデックスディレクトリが存在しない場合は強制再構築
    docs_index_dir = os.path.join(index_dir, "docs")
    other_index_dir = os.path.join(index_dir, "other")
    if not os.path.exists(docs_index_dir):
        os.mkdir(docs_index_dir)
        force_rebuild = True
    if not os.path.exists(other_index_dir):
        os.mkdir(other_index_dir)
        force_rebuild = True

    # configからdocs_lake_dirの相対パスを取得し、絶対パスを構築
    doc_lake_relative = config.get("doc_lake_dir", "__docs__")
    docs_lake_abs = os.path.abspath(os.path.join(app_dir, doc_lake_relative))

    from whoosh.index import create_in, open_dir, exists_in
    from whoosh.fields import Schema, TEXT, ID

    # カスタムアナライザーを利用したスキーマ定義
    schema = Schema(
        path=ID(stored=True, unique=True),
        filename=TEXT(stored=True, analyzer=custom_analyzer),
        content=TEXT(analyzer=custom_analyzer)
    )

    # それぞれのインデックスの前回のメタデータを読み込む
    docs_metadata_file = os.path.join(docs_index_dir, "file_metadata.pkl")
    other_metadata_file = os.path.join(other_index_dir, "file_metadata.pkl")
    docs_previous_metadata = {}
    other_previous_metadata = {}
    if os.path.exists(docs_metadata_file) and not force_rebuild:
        try:
            with open(docs_metadata_file, 'rb') as f:
                docs_previous_metadata = pickle.load(f)
        except Exception as e:
            print(f"Docs メタデータ読み込みエラー: {e}")
            force_rebuild = True
    if os.path.exists(other_metadata_file) and not force_rebuild:
        try:
            with open(other_metadata_file, 'rb') as f:
                other_previous_metadata = pickle.load(f)
        except Exception as e:
            print(f"Other メタデータ読み込みエラー: {e}")
            force_rebuild = True

    # インデックスの作成またはオープン
    if force_rebuild or not exists_in(docs_index_dir):
        docs_ix = create_in(docs_index_dir, schema)
    else:
        docs_ix = open_dir(docs_index_dir)
    if force_rebuild or not exists_in(other_index_dir):
        other_ix = create_in(other_index_dir, schema)
    else:
        other_ix = open_dir(other_index_dir)

    docs_current_metadata = {}
    other_current_metadata = {}
    docs_files_to_update = []
    other_files_to_update = []

    abs_app_dir = os.path.abspath(app_dir)
    for root, dirs, files in os.walk(app_dir):
        for file in files:
            file_path = os.path.join(root, file)
            abs_file_path = os.path.abspath(file_path)
            relative_path = os.path.relpath(abs_file_path, abs_app_dir)
            ext = os.path.splitext(file)[1].lower()
            if ext in binary_extensions:
                #print(f"指定拡張子のためスキップ: {relative_path}")
                continue
            try:
                metadata = get_file_metadata(abs_file_path)
            except Exception as e:
                print(f"メタデータ取得エラー: {file_path} -> {e}")
                continue
            # docs_lake_dir 内のファイルは docs インデックス対象
            if abs_file_path.startswith(docs_lake_abs):
                if ext != ".txt":
                    print(f"docsフォルダのindex対象外ファイル (txt以外): {relative_path}")
                    continue
                docs_current_metadata[relative_path] = metadata
                if force_rebuild or (relative_path not in docs_previous_metadata or
                                     docs_previous_metadata[relative_path]['last_modified'] != metadata['last_modified'] or
                                     docs_previous_metadata[relative_path]['size'] != metadata['size']):
                    docs_files_to_update.append((relative_path, abs_file_path))
            else:
                other_current_metadata[relative_path] = metadata
                if force_rebuild or (relative_path not in other_previous_metadata or
                                     other_previous_metadata[relative_path]['last_modified'] != metadata['last_modified'] or
                                     other_previous_metadata[relative_path]['size'] != metadata['size']):
                    other_files_to_update.append((relative_path, abs_file_path))
    
    # docs インデックスの更新
    if docs_files_to_update or force_rebuild:
        if progress_callback:
            progress_callback("検索インデックス作成開始（文書）", 0)
        docs_writer = docs_ix.writer()
        if not force_rebuild:
            for old_path in docs_previous_metadata:
                if old_path not in docs_current_metadata:
                    #print(f"削除されたファイル (docs): {old_path}")
                    docs_writer.delete_by_term('path', old_path)
        for idx, (relative_path, abs_file_path) in enumerate(docs_files_to_update, start=1):
            if is_binary_file(abs_file_path):
                #print(f"バイナリファイルをスキップ (docs): {relative_path}")
                continue
            try:
                with open(abs_file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                docs_writer.update_document(
                    path=relative_path,
                    filename=os.path.basename(relative_path),
                    content=content
                )
                print(f"更新 (docs): {relative_path}")
            except Exception as e:
                print(f"読み込みエラー (docs): {abs_file_path} -> {e}")
            if progress_callback and idx % 5 == 0:
                progress_callback("検索インデックス作成中（文書）", int((idx / len(docs_files_to_update)) * 100))
        docs_writer.commit()
        with open(docs_metadata_file, 'wb') as f:
            pickle.dump(docs_current_metadata, f)
        if progress_callback:
            progress_callback("検索インデックス作成完了", 100)
    else:
        print("更新が必要な docs ファイルはありません。")

    # other インデックスの更新
    if other_files_to_update or force_rebuild:
        if progress_callback:
            progress_callback("検索インデックス作成開始（コード）", 0)
        other_writer = other_ix.writer()
        if not force_rebuild:
            for old_path in other_previous_metadata:
                if old_path not in other_current_metadata:
                    #print(f"削除されたファイル (other): {old_path}")
                    other_writer.delete_by_term('path', old_path)
        for idx, (relative_path, abs_file_path) in enumerate(other_files_to_update, start=1):
            if is_binary_file(abs_file_path):
                #print(f"バイナリファイルをスキップ (other): {relative_path}")
                continue
            try:
                with open(abs_file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                other_writer.update_document(
                    path=relative_path,
                    filename=os.path.basename(relative_path),
                    content=content
                )
                #print(f"更新 (other): {relative_path}")
            except Exception as e:
                print(f"読み込みエラー (other): {abs_file_path} -> {e}")
            if progress_callback and idx % 5 == 0:
                progress_callback("検索インデックス作成中（コード）", int((idx / len(other_files_to_update)) * 100))
        other_writer.commit()
        with open(other_metadata_file, 'wb') as f:
            pickle.dump(other_current_metadata, f)
        if progress_callback:
            progress_callback("検索インデックス作成完了（文書）", 100)
    else:
        print("更新が必要な other ファイルはありません。")

    total_updated = len(docs_files_to_update) + len(other_files_to_update)
    print(f"インデックス更新完了: {total_updated} ファイルを更新")
    return {"docs": docs_ix, "other": other_ix}

def get_index(index_dir, app_dir, auto_update=False, force_rebuild=False):
    from whoosh.index import exists_in, open_dir
    docs_index_dir = os.path.join(index_dir, "docs")
    other_index_dir = os.path.join(index_dir, "other")
    if force_rebuild or not (exists_in(docs_index_dir) and exists_in(other_index_dir)):
        return update_index(index_dir, app_dir, force_rebuild)
    elif auto_update:
        return update_index(index_dir, app_dir, False)
    else:
        return {"docs": open_dir(docs_index_dir), "other": open_dir(other_index_dir)}

def delete_index(index_dir):
    if '*' in index_dir  or '__' not in index_dir or not index_dir.endswith('__'):
        return {'status': 'error', 'message': f"インデックスディレクトリ '{index_dir}' は削除できません。"}
    elif os.path.exists(index_dir):
        shutil.rmtree(index_dir)
        return {'status': 'success', 'message': f"インデックスディレクトリ '{index_dir}' を削除しました。"}
    else:
        return {'status': 'success', 'message': f"(Skip) インデックスディレクトリ '{index_dir}' は存在しません。"}
