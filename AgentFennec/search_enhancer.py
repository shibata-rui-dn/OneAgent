import sys
sys.stdout.reconfigure(encoding='utf-8')

import os
from whoosh.qparser import MultifieldParser, OrGroup, AndGroup
#from whoosh.query import And, Or, Term
#from whoosh.sorting import FieldFacet
from whoosh.analysis import StandardAnalyzer, Filter

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

def perform_advanced_search(ix, query_string, limit=10):
    """
    Whooshの高度な検索機能を利用して複数キーワードの検索を実装します。
    
    パラメータ:
    - ix: Whooshインデックス
    - query_string: 検索クエリ文字列（スペース区切りで複数キーワード可能）
    - limit: 返す結果の最大数
    
    返り値:
    - 検索結果のリスト（パスとスコアを含む）
    """
    results_list = []
    query_string = query_string.strip()
    if not query_string:
        return results_list
    with ix.searcher() as searcher:
        # "content"に加え"filename"も検索対象に含める
        qp = MultifieldParser(["content", "filename"], schema=ix.schema, group=AndGroup)
        q = qp.parse(query_string)
        results = searcher.search(q, limit=limit)
        for hit in results:
            results_list.append({
                "path": hit["path"],
                "score": hit.score
            })
    return results_list

def perform_search_with_mode(ix, query_string, mode="or", limit=10):
    """
    検索モードを指定できる検索関数。
    
    パラメータ:
    - ix: Whooshインデックス
    - query_string: 検索クエリ文字列
    - mode: 検索モード ("and" または "or")
    - limit: 返す結果の最大数
    
    返り値:
    - 検索結果のリスト
    """
    results_list = []
    query_string = query_string.strip()
    if not query_string:
        return results_list
    with ix.searcher() as searcher:
        if mode.lower() == "or":
            qp = MultifieldParser(["content", "filename"], schema=ix.schema, group=OrGroup)
        else:
            qp = MultifieldParser(["content", "filename"], schema=ix.schema, group=AndGroup)
        q = qp.parse(query_string)
        results = searcher.search(q, limit=limit)
        for hit in results:
            results_list.append({
                "path": hit["path"],
                "score": hit.score
            })
    return results_list

def parse_query_into_terms(query_string):
    """
    クエリ文字列をWhooshのカスタムアナライザーでトークンに分解して返します。
    
    パラメータ:
    - query_string: 検索クエリ文字列
    
    返り値:
    - トークン（キーワード）のリスト
    """
    return [token.text for token in custom_analyzer(query_string)]

def get_multi_keyword_suggestions(ix, query_string, max_suggestions=10):
    """
    複数キーワード入力に対応したサジェスト機能。
    最後の単語に対してサジェストを行い、前の単語はそのまま保持します。
    大文字小文字を区別しません。
    
    パラメータ:
    - ix: Whooshインデックス
    - query_string: 検索クエリ文字列
    - max_suggestions: 返す候補の最大数
    
    返り値:
    - サジェスト候補のリスト
    """
    if not query_string.strip():
        return []
    terms = parse_query_into_terms(query_string)
    if not terms:
        return []
    last_term = terms[-1]
    prefix_terms = terms[:-1]
    last_term_lower = last_term.lower()
    suggestions = []
    with ix.reader() as reader:
        lexicon = reader.lexicon("content")
        count = 0
        for term in lexicon:
            term_str = term.decode("utf-8") if isinstance(term, bytes) else term
            if term_str.lower().startswith(last_term_lower):
                if len(last_term) > 0 and last_term[0].isupper():
                    suggested_term = term_str[0].upper() + term_str[1:]
                else:
                    suggested_term = term_str
                if prefix_terms:
                    full_suggestion = " ".join(prefix_terms) + " " + suggested_term
                else:
                    full_suggestion = suggested_term
                suggestions.append({
                    "full": full_suggestion,
                    "completion": suggested_term,
                    "prefix": " ".join(prefix_terms) if prefix_terms else ""
                })
                count += 1
                if count >= max_suggestions:
                    break
    return suggestions

def highlight_search_results(content, terms, pre_tag="<mark>", post_tag="</mark>", max_length=200):
    """
    検索結果内の検索キーワードをハイライトするユーティリティ関数。
    
    パラメータ:
    - content: 検索対象テキスト
    - terms: ハイライトする検索語のリスト
    - pre_tag: ハイライト開始タグ
    - post_tag: ハイライト終了タグ
    - max_length: 抜粋の最大長
    
    返り値:
    - ハイライト付きのテキスト抜粋
    """
    if len(content) > max_length:
        content_excerpt = content[:max_length] + "..."
    else:
        content_excerpt = content
    for term in terms:
        if term:
            pattern = term
            replacement = f"{pre_tag}{term}{post_tag}"
            content_excerpt = content_excerpt.replace(pattern, replacement)
    return content_excerpt
