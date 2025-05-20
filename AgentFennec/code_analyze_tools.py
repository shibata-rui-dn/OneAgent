#!/usr/bin/env python3
import os
import sys
import ast
import json
import networkx as nx
from collections import Counter

# --------------------------------------------------
# 設定値の読み込み（config.json）
# --------------------------------------------------
from config_manager import get_config
config = get_config()

# --------------------------------------------------
# 相対パス取得ヘルパー関数
# --------------------------------------------------
def get_relative_path(absolute_path, base=None):
    if base is None:
        base = config.get('app_dir', os.path.join(os.getcwd(), 'docs/root'))
    try:
        # パスが存在しなかった場合もチェック
        if not os.path.exists(absolute_path):
            return "-"
        return os.path.relpath(absolute_path, start=base)
    except Exception:
        return "-"

# --------------------------------------------------
# AST解析クラス: EnhancedCodeVisitor
# --------------------------------------------------
class EnhancedCodeVisitor(ast.NodeVisitor):
    def __init__(self):
        self.imports = []         # [{'module': モジュール名, 'alias': エイリアス}, ...]
        self.import_froms = []    # [{'module': モジュール名, 'names': [名前リスト], 'level': 相対インポートレベル}, ...]
        self.defined_functions = []  # [関数名, ...]
        self.calls = []           # [{'call': 呼び出し表現, 'is_module_call': bool, 'module': 呼び出し元モジュール名}, ...]
        
    def visit_Import(self, node):
        for alias in node.names:
            self.imports.append({
                'module': alias.name,
                'alias': alias.asname if alias.asname else alias.name
            })
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        module = node.module if node.module else ""
        names = [alias.name for alias in node.names]
        self.import_froms.append({
            'module': module,
            'names': names,
            'level': node.level
        })
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        self.defined_functions.append(node.name)
        self.generic_visit(node)

    def visit_Call(self, node):
        is_module_call = False
        module_name = None
        call_str = ""
        if isinstance(node.func, ast.Attribute):
            if isinstance(node.func.value, ast.Name):
                module_name = node.func.value.id
                call_str = f"{module_name}.{node.func.attr}"
                is_module_call = True
            else:
                call_str = ast.unparse(node.func) if hasattr(ast, "unparse") else ""
        elif isinstance(node.func, ast.Name):
            call_str = node.func.id
        else:
            call_str = ast.unparse(node.func) if hasattr(ast, "unparse") else ""
        self.calls.append({
            'call': call_str,
            'is_module_call': is_module_call,
            'module': module_name
        })
        self.generic_visit(node)

# --------------------------------------------------
# モジュール名決定・インポート解決のヘルパー関数
# --------------------------------------------------
def determine_module_name(file_path, base_dir):
    file_path = os.path.abspath(file_path)
    base_dir = os.path.abspath(base_dir)
    rel_path = os.path.relpath(file_path, base_dir)
    parts = rel_path.replace('\\', '/').split('/')
    filename = parts[-1]
    if filename.endswith('.py'):
        file_base = filename[:-3]
    else:
        file_base = filename
    dir_parts = parts[:-1]
    package_parts = []
    current_dir = base_dir
    for part in dir_parts:
        current_dir = os.path.join(current_dir, part)
        if os.path.exists(os.path.join(current_dir, '__init__.py')):
            package_parts.append(part)
        else:
            package_parts = []
    if file_base == '__init__':
        module_name = ".".join(package_parts)
    else:
        if package_parts:
            module_name = ".".join(package_parts + [file_base])
        else:
            module_name = file_base
    return module_name

def resolve_dotted_import(import_path, current_file_path):
    current_dir = os.path.dirname(os.path.abspath(current_file_path))
    parts = import_path.split('.')
    first_part = parts[0]
    first_part_dir = os.path.join(current_dir, first_part)
    if not os.path.isdir(first_part_dir):
        first_part_file = os.path.join(current_dir, f"{first_part}.py")
        if os.path.isfile(first_part_file) and len(parts) == 1:
            return {
                'found': True, 
                'path': first_part_file, 
                'type': 'file', 
                'reason': None
            }
        return {
            'found': False, 
            'path': None, 
            'type': None, 
            'reason': f"ディレクトリまたはファイル '{first_part}' が見つかりません"
        }
    init_file = os.path.join(first_part_dir, '__init__.py')
    package_type = 'directory'
    if not os.path.exists(init_file):
        package_type = 'namespace'
        init_file = first_part_dir
    if len(parts) == 1:
        return {'found': True, 'path': init_file, 'type': package_type, 'reason': None}
    current_path = first_part_dir
    for i, part in enumerate(parts[1:], 1):
        if i == len(parts) - 1:
            file_path = os.path.join(current_path, f"{part}.py")
            if os.path.exists(file_path):
                return {'found': True, 'path': file_path, 'type': 'file', 'reason': None}
            dir_path = os.path.join(current_path, part)
            if os.path.isdir(dir_path):
                init_file = os.path.join(dir_path, '__init__.py')
                if os.path.exists(init_file):
                    return {'found': True, 'path': init_file, 'type': 'directory', 'reason': None}
                else:
                    return {'found': True, 'path': dir_path, 'type': 'namespace', 'reason': None}
            return {
                'found': False, 
                'path': None, 
                'type': None, 
                'reason': f"'{part}' がファイルまたはディレクトリとして見つかりません"
            }
        else:
            subdir_path = os.path.join(current_path, part)
            if os.path.isdir(subdir_path):
                init_file = os.path.join(subdir_path, '__init__.py')
                current_path = subdir_path
            else:
                module_file = os.path.join(current_path, f"{part}.py")
                if os.path.isfile(module_file) and i == len(parts) - 1:
                    return {'found': True, 'path': module_file, 'type': 'file', 'reason': None}
                return {
                    'found': False, 
                    'path': None, 
                    'type': None, 
                    'reason': f"中間パス '{part}' が見つかりません"
                }
    return {
        'found': False, 
        'path': None, 
        'type': None, 
        'reason': "予期しない解決エラー"
    }

def resolve_imported_file_path(module_name, current_file, level=0):
    current_file = os.path.abspath(current_file)
    current_dir = os.path.dirname(current_file)
    if '.' in module_name and level == 0:
        result = resolve_dotted_import(module_name, current_file)
        if result['found']:
            return os.path.abspath(result['path'])
        return None
    if level == 0:
        candidate = os.path.join(current_dir, module_name + ".py")
        if os.path.exists(candidate):
            return os.path.abspath(candidate)
        candidate_dir = os.path.join(current_dir, module_name)
        init_file = os.path.join(candidate_dir, "__init__.py")
        if os.path.isdir(candidate_dir):
            if os.path.exists(init_file):
                return os.path.abspath(init_file)
            if '.' not in module_name:
                return os.path.abspath(candidate_dir)
        parent_dir = os.path.dirname(current_dir)
        parent_candidate = os.path.join(parent_dir, module_name + ".py")
        if os.path.exists(parent_candidate):
            return os.path.abspath(parent_candidate)
        parent_pkg_dir = os.path.join(parent_dir, module_name)
        parent_init = os.path.join(parent_pkg_dir, "__init__.py")
        if os.path.isdir(parent_pkg_dir) and os.path.exists(parent_init):
            return os.path.abspath(parent_init)
        return None
    else:
        parent_dir = current_dir
        for i in range(level - 1):
            parent_dir = os.path.dirname(parent_dir)
            if not parent_dir:
                return None
        if not module_name:
            init_file = os.path.join(parent_dir, "__init__.py")
            if os.path.exists(init_file):
                return os.path.abspath(init_file)
            return os.path.abspath(parent_dir)
        parts = module_name.split('.')
        resolved_path = parent_dir
        for i, part in enumerate(parts):
            if i == len(parts) - 1:
                file_candidate = os.path.join(resolved_path, f"{part}.py")
                if os.path.exists(file_candidate):
                    return os.path.abspath(file_candidate)
            pkg_candidate = os.path.join(resolved_path, part)
            if not os.path.isdir(pkg_candidate):
                file_candidate = os.path.join(resolved_path, f"{part}.py")
                if os.path.exists(file_candidate) and i == len(parts) - 1:
                    return os.path.abspath(file_candidate)
                return None
            init_file = os.path.join(pkg_candidate, "__init__.py")
            if os.path.exists(init_file):
                if i == len(parts) - 1:
                    return os.path.abspath(init_file)
                resolved_path = pkg_candidate
            else:
                if i == len(parts) - 1:
                    return os.path.abspath(pkg_candidate)
                resolved_path = pkg_candidate
        return None

# --------------------------------------------------
# プロジェクト解析プロセス
# --------------------------------------------------
def analyze_code_with_enhancements(project_dir):
    analysis_results = {}
    for root, dirs, files in os.walk(project_dir):
        for file in files:
            if file.endswith('.py'):
                file_path = os.path.join(root, file)
                module_name = determine_module_name(file_path, project_dir)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        code = f.read()
                    tree = ast.parse(code, filename=file_path)
                    visitor = EnhancedCodeVisitor()
                    visitor.visit(tree)
                    entry = {
                        # 内部では絶対パスとして保持（後で出力前に相対パスへ変換）
                        'file_path': os.path.abspath(file_path),
                        'imports': visitor.imports,
                        'import_froms': visitor.import_froms,
                        'defined_functions': visitor.defined_functions,
                        'calls': visitor.calls,
                        'referenced_by': []
                    }
                    if module_name in analysis_results:
                        analysis_results[module_name].append(entry)
                    else:
                        analysis_results[module_name] = [entry]
                except Exception as e:
                    print(f"Error parsing {file_path}: {e}", file=sys.stderr)
    # 参照情報の付与
    file_to_module = {}
    for module_name, entries in analysis_results.items():
        for entry in entries:
            file_to_module[os.path.abspath(entry['file_path'])] = module_name
    for source_module, entries in analysis_results.items():
        for source_entry in entries:
            current_file_path = os.path.abspath(source_entry['file_path'])
            for imp in source_entry.get('imports', []):
                target_module = imp['module']
                if '.' in target_module:
                    dotted_result = resolve_dotted_import(target_module, current_file_path)
                    if dotted_result['found']:
                        abs_path = os.path.abspath(dotted_result['path'])
                        if abs_path in file_to_module:
                            target_module = file_to_module[abs_path]
                            if target_module in analysis_results:
                                for target_entry in analysis_results[target_module]:
                                    target_entry['referenced_by'].append({
                                        'module': source_module,
                                        'type': 'import'
                                    })
                    continue
                resolved_path = resolve_imported_file_path(target_module, current_file_path, level=0)
                if resolved_path:
                    abs_resolved_path = os.path.abspath(resolved_path)
                    if abs_resolved_path in file_to_module:
                        target_module = file_to_module[abs_resolved_path]
                        if target_module in analysis_results:
                            for target_entry in analysis_results[target_module]:
                                target_entry['referenced_by'].append({
                                    'module': source_module,
                                    'type': 'import'
                                })
                elif target_module in analysis_results:
                    for target_entry in analysis_results[target_module]:
                        target_entry['referenced_by'].append({
                            'module': source_module,
                            'type': 'import'
                        })
            for imp in source_entry.get('import_froms', []):
                level = imp.get('level', 0)
                target = imp.get('module', '')
                if level == 0 and '.' in target:
                    dotted_result = resolve_dotted_import(target, current_file_path)
                    if dotted_result['found']:
                        abs_path = os.path.abspath(dotted_result['path'])
                        if abs_path in file_to_module:
                            target_module = file_to_module[abs_path]
                            if target_module in analysis_results:
                                for target_entry in analysis_results[target_module]:
                                    target_entry['referenced_by'].append({
                                        'module': source_module,
                                        'type': 'import'
                                    })
                    continue
                resolved_path = resolve_imported_file_path(target, current_file_path, level=level)
                if resolved_path:
                    abs_resolved_path = os.path.abspath(resolved_path)
                    if abs_resolved_path in file_to_module:
                        target_module = file_to_module[abs_resolved_path]
                        if target_module in analysis_results:
                            for target_entry in analysis_results[target_module]:
                                target_entry['referenced_by'].append({
                                    'module': source_module,
                                    'type': 'import'
                                })
                elif target in analysis_results:
                    for target_entry in analysis_results[target]:
                        target_entry['referenced_by'].append({
                            'module': source_module,
                            'type': 'import'
                        })
            for call in source_entry.get('calls', []):
                if call.get('is_module_call'):
                    target = call.get('module')
                    if target in analysis_results:
                        for target_entry in analysis_results[target]:
                            target_entry['referenced_by'].append({
                                'module': source_module,
                                'type': 'call'
                            })
    # 重複参照の除去
    for module_name, entries in analysis_results.items():
        for entry in entries:
            unique_refs = {}
            for ref in entry['referenced_by']:
                key = f"{ref['module']}:{ref['type']}"
                if key not in unique_refs:
                    unique_refs[key] = ref
            entry['referenced_by'] = list(unique_refs.values())
    return analysis_results

# --------------------------------------------------
# 依存関係グラフの構築（デバッグ出力や循環検出処理は含まない）
# --------------------------------------------------
def build_enhanced_graph(analysis_results):
    G = nx.DiGraph()
    for module in analysis_results:
        G.add_node(module)
    file_to_module = {}
    for module_name, entries in analysis_results.items():
        for entry in entries:
            file_to_module[os.path.abspath(entry['file_path'])] = module_name
    resolved_paths_cache = {}
    for module, entries in analysis_results.items():
        for entry in entries:
            for ref in entry.get('referenced_by', []):
                ref_module = ref['module']
                ref_type = ref['type']
                if not G.has_edge(ref_module, module):
                    G.add_edge(ref_module, module, type=ref_type, imported_file_path=entry['file_path'])
    for module, entries in analysis_results.items():
        for data in entries:
            current_file_path = os.path.abspath(data['file_path'])
            for imp in data.get('imports', []):
                target = imp['module']
                if G.has_edge(module, target):
                    continue
                if '.' in target:
                    cache_key = f"{current_file_path}:{target}"
                    if cache_key in resolved_paths_cache:
                        result = resolved_paths_cache[cache_key]
                    else:
                        result = resolve_dotted_import(target, current_file_path)
                        resolved_paths_cache[cache_key] = result
                    if result['found']:
                        abs_path = os.path.abspath(result['path'])
                        if abs_path in file_to_module:
                            target_module = file_to_module[abs_path]
                            if not G.has_edge(module, target_module):
                                G.add_edge(module, target_module, type='import', imported_file_path=abs_path)
                    continue
                cache_key = f"{current_file_path}:{target}:0"
                if cache_key in resolved_paths_cache:
                    local_path = resolved_paths_cache[cache_key]
                else:
                    local_path = resolve_imported_file_path(target, current_file_path, level=0)
                    resolved_paths_cache[cache_key] = local_path
                if local_path:
                    abs_local_path = os.path.abspath(local_path)
                    if abs_local_path in file_to_module:
                        target_module = file_to_module[abs_local_path]
                        if not G.has_edge(module, target_module):
                            G.add_edge(module, target_module, type='import', imported_file_path=abs_local_path)
                elif target in analysis_results and not G.has_edge(module, target):
                    target_file_path = analysis_results[target][0]['file_path']
                    G.add_edge(module, target, type='import', imported_file_path=target_file_path)
    return G

# --------------------------------------------------
# 依存関係レポートの生成（循環検出機能は削除済み）
# --------------------------------------------------
def generate_report(analysis_results, dependency_graph):
    report_lines = []
    report_lines.append("# 依存関係解析レポート")
    report_lines.append("")
    total_files = sum(len(entries) for entries in analysis_results.values())
    report_lines.append("## 概要")
    report_lines.append(f"- 解析対象ファイル数: {total_files}")
    report_lines.append(f"- モジュール数: {len(analysis_results)}")
    report_lines.append(f"- 依存関係（エッジ）数: {len(dependency_graph.edges())}")
    import_counter = Counter()
    for entries in analysis_results.values():
        for data in entries:
            for imp in data.get('imports', []):
                import_counter[imp['module']] += 1
            for imp in data.get('import_froms', []):
                module_name = imp.get('module', '')
                if module_name:
                    import_counter[module_name] += len(imp.get('names', []))
    most_common = import_counter.most_common(5)
    report_lines.append("### 最も多くインポートされるモジュールランキング")
    for mod, count in most_common:
        report_lines.append(f"- {mod}: {count} 回")
    report_lines.append("")
    report_lines.append("## モジュール詳細")
    def get_module_importance(module_data):
        entries = module_data[1]
        ref_count = sum(len(entry.get('referenced_by', [])) for entry in entries)
        import_count = import_counter.get(module_data[0], 0)
        return (ref_count, import_count)
    sorted_modules = sorted(analysis_results.items(), key=get_module_importance, reverse=True)
    top_modules = sorted_modules[:10]
    for module, entries in top_modules:
        report_lines.append(f"### モジュール: {module}")
        if len(entries) == 1:
            entry = entries[0]
            report_lines.append(f"- パス: {get_relative_path(entry['file_path'], config.get('app_dir', os.path.join(os.getcwd(), 'docs/root')))}")
            imports_list = [imp['module'] for imp in entry.get('imports', [])[:10]]
            report_lines.append(f"- インポート: {', '.join(imports_list) if imports_list else 'なし'}")
            if len(entry.get('imports', [])) > 10:
                report_lines.append(f"  (他 {len(entry.get('imports', [])) - 10} 個)")
            import_from_list = []
            for imp in entry.get('import_froms', [])[:10]:
                mod = imp.get('module', '')
                names = imp.get('names', [])
                if len(names) > 5:
                    names_str = f"{', '.join(names[:5])} (他 {len(names) - 5} 個)"
                else:
                    names_str = ', '.join(names)
                if mod:
                    import_from_list.append(f"{mod} ({names_str})")
                else:
                    import_from_list.append(names_str)
            report_lines.append(f"- from インポート: {', '.join(import_from_list) if import_from_list else 'なし'}")
            if len(entry.get('import_froms', [])) > 10:
                report_lines.append(f"  (他 {len(entry.get('import_froms', [])) - 10} 個)")
            calls_list = [call['call'] for call in entry.get('calls', [])[:10]]
            report_lines.append(f"- 関数呼び出し: {', '.join(calls_list) if calls_list else 'なし'}")
            if len(entry.get('calls', [])) > 10:
                report_lines.append(f"  (他 {len(entry.get('calls', [])) - 10} 個)")
            referenced_by = entry.get('referenced_by', [])
            if referenced_by:
                ref_by_type = {}
                for ref in referenced_by:
                    ref_type = ref.get('type', 'unknown')
                    ref_by_type.setdefault(ref_type, []).append(ref.get('module', 'unknown'))
                report_lines.append("- 参照元:")
                for ref_type, modules in ref_by_type.items():
                    if len(modules) > 5:
                        report_lines.append(f"  - {ref_type}による参照: {', '.join(modules[:5])} (他 {len(modules) - 5} 個)")
                    else:
                        report_lines.append(f"  - {ref_type}による参照: {', '.join(modules)}")
        else:
            file_paths = [get_relative_path(entry['file_path'], config.get('app_dir', os.path.join(os.getcwd(), 'docs/root'))) for entry in entries]
            if len(file_paths) > 3:
                report_lines.append(f"- パス: {', '.join(file_paths[:3])} (他 {len(file_paths) - 3} 個)")
            else:
                report_lines.append(f"- パス: {', '.join(file_paths)}")
            report_lines.append(f"- 複数のインスタンス ({len(entries)}個) が見つかりました。詳細は省略します。")
        report_lines.append("")
    if len(sorted_modules) > 10:
        report_lines.append(f"注: 合計 {len(sorted_modules)} モジュールのうち、上位10個のみ表示しています。")
        report_lines.append("")
    report_lines.append("## 改善推奨事項")
    report_lines.append("- 循環依存検出機能は削除されています。")
    report_lines.append("- 同一ディレクトリ内のモジュール解決の強化")
    report_lines.append("- 階層的モジュール解決のアルゴリズム改善")
    report_lines.append("- インポート解決の優先順位の見直し")
    report_lines.append("- ドット記法のインポート解決の正確性向上")
    return "\n".join(report_lines)

# --------------------------------------------------
# ファイル単体解析（指定ファイルの詳細解析）
# --------------------------------------------------
def analyze_file(file_path, analysis_results=None):
    result = {}
    # 基準は常にカレントディレクトリ
    base = config.get('app_dir', os.path.join(os.getcwd(), 'docs/root'))
    if file_path.startswith("./") or file_path.startswith(".\\"):
        file_path = file_path[2:]
    file_path = os.path.join(base, file_path)
    # 閾値はconfig.jsonから参照
    module_threshold = config.get("module_threshold", 15)
    function_threshold = config.get("function_threshold", 30)
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            code = f.read()
        tree = ast.parse(code, filename=file_path)
        visitor = EnhancedCodeVisitor()
        visitor.visit(tree)
    except Exception as e:
        return {"error": f"Error parsing file: {str(e)}"}
    result["file"] = get_relative_path(os.path.abspath(file_path), base)
    imports_info = []
    for imp in visitor.imports:
        module_name = imp['module']
        alias = imp['alias']
        if '.' in module_name:
            res = resolve_dotted_import(module_name, file_path)
            if res['found']:
                path_info = get_relative_path(os.path.abspath(res['path']), base)
            else:
                path_info = "-"
        else:
            path_val = resolve_imported_file_path(module_name, file_path, level=0)
            if path_val:
                path_info = get_relative_path(os.path.abspath(path_val), base)
            else:
                path_info = "-"
        if path_info == "-":
            imports_info.append({
                "module": module_name,
            })
        else:
            imports_info.append({
                "module": module_name,
                "path": path_info
            })
    result["imports"] = imports_info[:module_threshold] if len(imports_info) > module_threshold else imports_info
    from_imports_info = []
    for imp in visitor.import_froms:
        mod = imp.get('module', '')
        names = imp.get('names', [])
        level = imp.get('level', 0)
        if level == 0 and '.' in mod:
            res = resolve_dotted_import(mod, file_path)
            if res['found']:
                path_info = get_relative_path(os.path.abspath(res['path']), base)
            else:
                path_info = "-"
        else:
            path_val = resolve_imported_file_path(mod, file_path, level=level)
            if path_val:
                path_info = get_relative_path(os.path.abspath(path_val), base)
            else:
                path_info = "-"
        if path_info == "-":
            from_imports_info.append({
                "module": mod,
                "names": names,
            })
        else:
            from_imports_info.append({
                "module": mod,
                "names": names,
                "path": path_info
            })
    result["from_imports"] = from_imports_info[:module_threshold] if len(from_imports_info) > module_threshold else from_imports_info
    defined_funcs = list(set(visitor.defined_functions))
    if len(defined_funcs) > function_threshold:
        result["defined_functions"] = defined_funcs[:function_threshold]
        result["defined_functions_note"] = f"(他 {len(defined_funcs) - function_threshold} 個省略)"
    else:
        result["defined_functions"] = defined_funcs
    referenced_by_info = []
    if analysis_results:
        abs_file_path = file_path
        found_module = None
        for module_name, entries in analysis_results.items():
            for entry in entries:
                if os.path.join(base, entry['file_path']) == abs_file_path:
                    found_module = module_name
                    refs = entry.get("referenced_by", [])
                    for ref in refs:
                        if ref['module'] in analysis_results:
                            ref_path = os.path.join(base, analysis_results[ref['module']][0]['file_path'])
                            rel_ref_path = get_relative_path(ref_path, base)
                        else:
                            rel_ref_path = "-"
                        if rel_ref_path == "-":
                            referenced_by_info.append({
                                "module": ref['module'],
                            })
                        else:
                            referenced_by_info.append({
                                "module": ref['module'],
                                "path": rel_ref_path,
                            })
                    break
            if found_module:
                break
    result["referenced_by"] = referenced_by_info[:module_threshold] if len(referenced_by_info) > module_threshold else referenced_by_info
    return result

# --------------------------------------------------
# setup用ツール定義
# --------------------------------------------------
def setup():
    """
    コード解析のセットアップを行う関数。
    progress_callback(step, percentage) が指定されていれば、処理の各段階で進捗状況を報告します。
    """

    config = get_config()
    project_dir = config.get('app_dir', os.path.join(os.getcwd(), "docs", "root"))

    yield "data: " + json.dumps({
        "status": "progress",
        "step": "コード解析中",
        "progress": 0
    })+ "\n\n"

    try:
        # 1. コード解析の実行
        analysis_results = analyze_code_with_enhancements(project_dir)
        yield "data: " + json.dumps({
            "status": "progress",
            "step": "依存関係の確認中",
            "progress": 50
        })+ "\n\n"
        
        # 2. 依存関係グラフの構築
        dependency_graph = build_enhanced_graph(analysis_results)
        yield "data: " + json.dumps({
            "status": "progress",
            "step": "レポートの生成中",
            "progress": 80
        })+ "\n\n"
        
        # 3. レポート生成
        report = generate_report(analysis_results, dependency_graph)
        yield "data: " + json.dumps({
            "status": "progress",
            "step": "コード解析完了",
            "progress": 100
        })+ "\n\n"
        
        return report
    except Exception as e:
        yield "data: " + json.dumps({
            "status": "progress",
            "step": "コード解析に失敗しました",
            "progress": 100
        })+ "\n\n"
        return f"Code analysis setup failed: {str(e)}"
    
# --------------------------------------------------
# LangChain用ツール定義
# --------------------------------------------------
#from langchain.agents import Tool

#@Tool(name="analyze_file_details", 
#      description="指定したファイルに関する情報（importしているモジュール、fromインポート、参照元モジュール、定義された関数一覧）を返すツール。結果のモジュール数が15個、関数数が30個を超える場合は省略されます。パスはすべて相対パスで表示されます。")
def analyze_file_details(file_path: str) -> str:
    print(f"analyze_file_details: {file_path}")
    try:
        analysis_json = os.path.join(os.getcwd(), config.get("json_output_path", "dependency_analysis.json"))
        analysis_results = None
        if analysis_json and os.path.exists(analysis_json):
            with open(analysis_json, 'r', encoding='utf-8') as jf:
                analysis_results = json.load(jf)
        result = analyze_file(file_path, analysis_results)
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"異常終了: {str(e)}"

if __name__ == "__main__":
    analyze_code_with_enhancements("./test")