import json
import threading
from pathlib import Path

# threading.Lock() を threading.RLock() に変更
_config_lock = threading.RLock()
_config_file = "config.json"

def normalize_path(path_str):
    # ユーザーのホームディレクトリ展開と絶対パスへの変換
    return str(Path(path_str).expanduser().resolve())

def load_config():
    with _config_lock:
        with open(_config_file, 'r', encoding='utf-8') as f:
            config = json.load(f)
    return config

def get_config():
    # 常に最新のconfigをファイルから読み込む
    return load_config()

def update_config(new_data):
    allowed_keys = {"end_point", "api_key", "app_dir"}
    with _config_lock:
        config = load_config()
        for key in allowed_keys:
            if key in new_data:
                # app_dirの場合は正規化する
                if key == "app_dir":
                    config[key] = normalize_path(new_data[key])
                else:
                    config[key] = new_data[key]
        with open(_config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
    return config

def set_doc_lake_dir(new_dir):
    with _config_lock:
        config = load_config()
        config["docs_lake_dir"] = normalize_path(new_dir)
        with open(_config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
    return config
