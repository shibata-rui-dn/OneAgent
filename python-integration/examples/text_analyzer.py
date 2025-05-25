#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
テキスト分析ツール - OneAgent Python連携サンプル

機能:
- 感情分析（ポジティブ/ネガティブ/中性）
- キーワード抽出・頻度分析
- テキスト要約
- 言語検出
- テキスト統計情報
- 類似度計算

使用方法:
python3 text_analyzer.py --function sentiment --text "今日は素晴らしい天気です"
python3 text_analyzer.py --function keywords --text "機械学習は人工知能の重要な分野です"
python3 text_analyzer.py --function summary --text "長いテキスト..."
python3 text_analyzer.py --function similarity --text1 "テキスト1" --text2 "テキスト2"
"""

import json
import argparse
import re
import sys
from typing import Dict, Any, List, Tuple
from collections import Counter
from datetime import datetime
import logging

# 外部ライブラリのインポート（インストールされている場合）
try:
    import nltk
    from nltk.corpus import stopwords
    from nltk.tokenize import word_tokenize, sent_tokenize
    from nltk.stem import PorterStemmer
    from nltk.tag import pos_tag
    NLTK_AVAILABLE = True
except ImportError:
    NLTK_AVAILABLE = False

try:
    from textblob import TextBlob
    TEXTBLOB_AVAILABLE = True
except ImportError:
    TEXTBLOB_AVAILABLE = False

try:
    import MeCab
    MECAB_AVAILABLE = True
except ImportError:
    MECAB_AVAILABLE = False

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 日本語の感情分析用キーワード
POSITIVE_WORDS_JP = [
    '良い', '素晴らしい', '最高', '嬉しい', '楽しい', '幸せ', '満足', '快適', '安心',
    '美しい', '綺麗', 'すごい', '感動', '成功', '勝利', '栄光', '希望', '愛',
    'すばらしい', 'よい', 'たのしい', 'うれしい', 'しあわせ', 'あんしん'
]

NEGATIVE_WORDS_JP = [
    '悪い', 'ひどい', '最悪', '悲しい', '辛い', '苦しい', '不安', '心配', '困る',
    '失敗', '敗北', '絶望', '怒り', '憎い', '嫌い', 'だめ', 'いや', 'つらい',
    'わるい', 'さびしい', 'かなしい', 'しんぱい', 'ふあん'
]

POSITIVE_WORDS_EN = [
    'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome',
    'beautiful', 'perfect', 'happy', 'joy', 'love', 'success', 'brilliant',
    'outstanding', 'marvelous', 'superb', 'delightful', 'pleased', 'satisfied'
]

NEGATIVE_WORDS_EN = [
    'bad', 'terrible', 'awful', 'horrible', 'disgusting', 'hate', 'sad',
    'angry', 'depressed', 'worried', 'anxious', 'frustrated', 'disappointed',
    'upset', 'miserable', 'unhappy', 'furious', 'annoyed', 'stressed'
]

def detect_language(text: str) -> str:
    """
    テキストの言語を簡易検出
    """
    # 日本語文字（ひらがな、カタカナ、漢字）の存在をチェック
    japanese_chars = re.findall(r'[ひらがなカタカナ漢字]', text)
    if len(japanese_chars) > len(text) * 0.1:  # 10%以上日本語文字
        return 'ja'
    else:
        return 'en'

def analyze_sentiment(text: str) -> Dict[str, Any]:
    """
    感情分析を実行
    """
    try:
        language = detect_language(text)
        logger.info(f"感情分析実行: 言語={language}")
        
        # TextBlobを使用した分析（英語）
        if TEXTBLOB_AVAILABLE and language == 'en':
            blob = TextBlob(text)
            polarity = blob.sentiment.polarity  # -1 (negative) to 1 (positive)
            subjectivity = blob.sentiment.subjectivity  # 0 (objective) to 1 (subjective)
            
            if polarity > 0.1:
                sentiment = "ポジティブ"
            elif polarity < -0.1:
                sentiment = "ネガティブ"
            else:
                sentiment = "中性"
            
            confidence = abs(polarity)
            
        else:
            # キーワードベースの分析
            text_lower = text.lower()
            
            if language == 'ja':
                positive_words = POSITIVE_WORDS_JP
                negative_words = NEGATIVE_WORDS_JP
            else:
                positive_words = POSITIVE_WORDS_EN
                negative_words = NEGATIVE_WORDS_EN
            
            positive_count = sum(1 for word in positive_words if word in text_lower)
            negative_count = sum(1 for word in negative_words if word in text_lower)
            
            if positive_count > negative_count:
                sentiment = "ポジティブ"
                confidence = min(0.9, 0.5 + (positive_count - negative_count) * 0.1)
            elif negative_count > positive_count:
                sentiment = "ネガティブ"
                confidence = min(0.9, 0.5 + (negative_count - positive_count) * 0.1)
            else:
                sentiment = "中性"
                confidence = 0.5
            
            polarity = (positive_count - negative_count) / max(len(text.split()), 1)
            subjectivity = (positive_count + negative_count) / max(len(text.split()), 1)
        
        return {
            "success": True,
            "sentiment": sentiment,
            "confidence": round(confidence, 3),
            "polarity": round(polarity, 3),
            "subjectivity": round(subjectivity, 3),
            "language": language,
            "analysis_method": "TextBlob" if TEXTBLOB_AVAILABLE and language == 'en' else "Keyword-based"
        }
        
    except Exception as e:
        logger.error(f"感情分析エラー: {e}")
        return {
            "success": False,
            "error": f"感情分析エラー: {str(e)}"
        }

def extract_keywords(text: str, max_keywords: int = 10) -> Dict[str, Any]:
    """
    キーワード抽出と頻度分析
    """
    try:
        language = detect_language(text)
        logger.info(f"キーワード抽出実行: 言語={language}")
        
        # 基本的な前処理
        text_clean = re.sub(r'[^\w\s]', '', text.lower())
        
        if MECAB_AVAILABLE and language == 'ja':
            # MeCabを使用した日本語形態素解析
            mecab = MeCab.Tagger('-Owakati')
            words = mecab.parse(text_clean).strip().split()
        elif NLTK_AVAILABLE:
            # NLTKを使用した英語トークン化
            words = word_tokenize(text_clean)
            
            # ストップワードの除去
            try:
                stop_words = set(stopwords.words('english' if language == 'en' else 'english'))
                words = [word for word in words if word not in stop_words and len(word) > 2]
            except:
                words = [word for word in words if len(word) > 2]
        else:
            # シンプルな分割
            words = text_clean.split()
            words = [word for word in words if len(word) > 2]
        
        # 日本語ストップワードの除去
        if language == 'ja':
            jp_stopwords = ['です', 'ます', 'である', 'ある', 'いる', 'する', 'なる', 'れる', 'られる', 'この', 'その', 'あの', 'どの']
            words = [word for word in words if word not in jp_stopwords]
        
        # 頻度カウント
        word_freq = Counter(words)
        top_keywords = word_freq.most_common(max_keywords)
        
        # キーワードの分類（簡易版）
        categories = {
            'noun': [],
            'verb': [],
            'adjective': [],
            'other': []
        }
        
        if NLTK_AVAILABLE and language == 'en':
            try:
                pos_tags = pos_tag(words)
                for word, count in top_keywords:
                    word_pos = next((pos for w, pos in pos_tags if w == word), 'OTHER')
                    
                    if word_pos.startswith('NN'):
                        categories['noun'].append({"word": word, "count": count})
                    elif word_pos.startswith('VB'):
                        categories['verb'].append({"word": word, "count": count})
                    elif word_pos.startswith('JJ'):
                        categories['adjective'].append({"word": word, "count": count})
                    else:
                        categories['other'].append({"word": word, "count": count})
            except:
                # POS taggingが失敗した場合
                for word, count in top_keywords:
                    categories['other'].append({"word": word, "count": count})
        else:
            # 品詞分類なしの場合
            for word, count in top_keywords:
                categories['other'].append({"word": word, "count": count})
        
        return {
            "success": True,
            "language": language,
            "total_words": len(words),
            "unique_words": len(word_freq),
            "top_keywords": [{"word": word, "count": count, "frequency": count/len(words)} for word, count in top_keywords],
            "categories": categories,
            "analysis_method": "MeCab" if MECAB_AVAILABLE and language == 'ja' else "NLTK" if NLTK_AVAILABLE else "Simple"
        }
        
    except Exception as e:
        logger.error(f"キーワード抽出エラー: {e}")
        return {
            "success": False,
            "error": f"キーワード抽出エラー: {str(e)}"
        }

def summarize_text(text: str, sentence_count: int = 3) -> Dict[str, Any]:
    """
    テキスト要約（簡易版）
    """
    try:
        language = detect_language(text)
        logger.info(f"テキスト要約実行: 言語={language}")
        
        # 文章の分割
        if NLTK_AVAILABLE:
            sentences = sent_tokenize(text)
        else:
            # 簡易文章分割
            sentences = re.split(r'[。！？\.\!\?]', text)
            sentences = [s.strip() for s in sentences if s.strip()]
        
        if len(sentences) <= sentence_count:
            return {
                "success": True,
                "original_sentences": len(sentences),
                "summary_sentences": len(sentences),
                "summary": text,
                "compression_ratio": 1.0,
                "language": language
            }
        
        # 簡易スコアリング（文章の長さと位置を考慮）
        sentence_scores = []
        
        for i, sentence in enumerate(sentences):
            score = 0
            
            # 文章の長さスコア
            word_count = len(sentence.split())
            if 5 <= word_count <= 30:  # 適度な長さの文章を優先
                score += word_count * 0.1
            
            # 位置スコア（最初と最後の文章を重視）
            if i < len(sentences) * 0.3:  # 前半30%
                score += 2
            elif i > len(sentences) * 0.7:  # 後半30%
                score += 1
            
            # キーワードスコア（簡易版）
            keywords = extract_keywords(text, 5)
            if keywords["success"]:
                top_words = [kw["word"] for kw in keywords["top_keywords"]]
                for word in top_words:
                    if word in sentence.lower():
                        score += 1
            
            sentence_scores.append((score, i, sentence))
        
        # スコア順にソート
        sentence_scores.sort(reverse=True)
        
        # 上位の文章を選択し、元の順序で並び替え
        selected_sentences = sorted(sentence_scores[:sentence_count], key=lambda x: x[1])
        summary = '。'.join([s[2] for s in selected_sentences])
        
        return {
            "success": True,
            "original_sentences": len(sentences),
            "summary_sentences": sentence_count,
            "summary": summary,
            "compression_ratio": round(len(summary) / len(text), 3),
            "language": language,
            "method": "Score-based selection"
        }
        
    except Exception as e:
        logger.error(f"テキスト要約エラー: {e}")
        return {
            "success": False,
            "error": f"テキスト要約エラー: {str(e)}"
        }

def calculate_similarity(text1: str, text2: str) -> Dict[str, Any]:
    """
    テキスト間の類似度計算
    """
    try:
        logger.info("テキスト類似度計算実行")
        
        # 基本的な前処理
        def preprocess_text(text):
            text = re.sub(r'[^\w\s]', '', text.lower())
            return set(text.split())
        
        words1 = preprocess_text(text1)
        words2 = preprocess_text(text2)
        
        # Jaccard係数による類似度
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        jaccard_similarity = len(intersection) / len(union) if union else 0
        
        # コサイン類似度（簡易版）
        all_words = list(union)
        
        def text_to_vector(text_words, all_words):
            return [1 if word in text_words else 0 for word in all_words]
        
        vector1 = text_to_vector(words1, all_words)
        vector2 = text_to_vector(words2, all_words)
        
        # コサイン類似度の計算
        dot_product = sum(a * b for a, b in zip(vector1, vector2))
        magnitude1 = sum(a * a for a in vector1) ** 0.5
        magnitude2 = sum(a * a for a in vector2) ** 0.5
        
        cosine_similarity = dot_product / (magnitude1 * magnitude2) if magnitude1 * magnitude2 > 0 else 0
        
        # 文字レベルの類似度
        char_set1 = set(text1.lower())
        char_set2 = set(text2.lower())
        char_similarity = len(char_set1.intersection(char_set2)) / len(char_set1.union(char_set2))
        
        return {
            "success": True,
            "jaccard_similarity": round(jaccard_similarity, 3),
            "cosine_similarity": round(cosine_similarity, 3),
            "character_similarity": round(char_similarity, 3),
            "common_words": list(intersection),
            "common_word_count": len(intersection),
            "text1_unique_words": len(words1 - words2),
            "text2_unique_words": len(words2 - words1),
            "overall_similarity": round((jaccard_similarity + cosine_similarity + char_similarity) / 3, 3)
        }
        
    except Exception as e:
        logger.error(f"類似度計算エラー: {e}")
        return {
            "success": False,
            "error": f"類似度計算エラー: {str(e)}"
        }

def analyze_text_statistics(text: str) -> Dict[str, Any]:
    """
    テキストの詳細統計情報
    """
    try:
        logger.info("テキスト統計分析実行")
        
        # 基本統計
        char_count = len(text)
        char_count_no_spaces = len(text.replace(' ', ''))
        word_count = len(text.split())
        
        # 文章数
        sentences = re.split(r'[。！？\.\!\?]', text)
        sentence_count = len([s for s in sentences if s.strip()])
        
        # 段落数
        paragraphs = text.split('\n')
        paragraph_count = len([p for p in paragraphs if p.strip()])
        
        # 平均値計算
        avg_word_length = sum(len(word) for word in text.split()) / word_count if word_count > 0 else 0
        avg_sentence_length = word_count / sentence_count if sentence_count > 0 else 0
        avg_paragraph_length = sentence_count / paragraph_count if paragraph_count > 0 else 0
        
        # 語彙の豊富さ
        unique_words = len(set(text.lower().split()))
        vocabulary_richness = unique_words / word_count if word_count > 0 else 0
        
        # 文字種分析（日本語）
        hiragana_count = len(re.findall(r'[あ-ん]', text))
        katakana_count = len(re.findall(r'[ア-ン]', text))
        kanji_count = len(re.findall(r'[一-龯]', text))
        ascii_count = len(re.findall(r'[a-zA-Z0-9]', text))
        
        # 読みやすさスコア（簡易版）
        readability_score = 0
        if avg_sentence_length < 20:  # 短い文章
            readability_score += 2
        elif avg_sentence_length < 30:  # 中程度
            readability_score += 1
        
        if avg_word_length < 6:  # 短い単語
            readability_score += 2
        elif avg_word_length < 8:  # 中程度
            readability_score += 1
        
        if vocabulary_richness > 0.6:  # 豊富な語彙
            readability_score += 1
        
        readability_level = "易しい" if readability_score >= 4 else "普通" if readability_score >= 2 else "難しい"
        
        return {
            "success": True,
            "basic_stats": {
                "character_count": char_count,
                "character_count_no_spaces": char_count_no_spaces,
                "word_count": word_count,
                "sentence_count": sentence_count,
                "paragraph_count": paragraph_count,
                "unique_words": unique_words
            },
            "averages": {
                "avg_word_length": round(avg_word_length, 2),
                "avg_sentence_length": round(avg_sentence_length, 2),
                "avg_paragraph_length": round(avg_paragraph_length, 2)
            },
            "character_types": {
                "hiragana": hiragana_count,
                "katakana": katakana_count,
                "kanji": kanji_count,
                "ascii": ascii_count
            },
            "vocabulary_analysis": {
                "vocabulary_richness": round(vocabulary_richness, 3),
                "readability_score": readability_score,
                "readability_level": readability_level
            },
            "language": detect_language(text)
        }
        
    except Exception as e:
        logger.error(f"テキスト統計分析エラー: {e}")
        return {
            "success": False,
            "error": f"テキスト統計分析エラー: {str(e)}"
        }

def main():
    parser = argparse.ArgumentParser(description='テキスト分析ツール - OneAgent Python連携')
    parser.add_argument('--function', required=True,
                        choices=['sentiment', 'keywords', 'summary', 'similarity', 'statistics'],
                        help='実行する分析タイプ')
    parser.add_argument('--text', help='分析対象のテキスト')
    parser.add_argument('--text1', help='類似度計算用テキスト1')
    parser.add_argument('--text2', help='類似度計算用テキスト2')
    parser.add_argument('--max_keywords', type=int, default=10, help='抽出するキーワード数')
    parser.add_argument('--sentence_count', type=int, default=3, help='要約文章数')
    
    args = parser.parse_args()
    
    result = None
    
    try:
        if args.function == 'sentiment':
            if not args.text:
                result = {"success": False, "error": "textパラメータが必要です"}
            else:
                result = analyze_sentiment(args.text)
        
        elif args.function == 'keywords':
            if not args.text:
                result = {"success": False, "error": "textパラメータが必要です"}
            else:
                result = extract_keywords(args.text, args.max_keywords)
        
        elif args.function == 'summary':
            if not args.text:
                result = {"success": False, "error": "textパラメータが必要です"}
            else:
                result = summarize_text(args.text, args.sentence_count)
        
        elif args.function == 'similarity':
            if not args.text1 or not args.text2:
                result = {"success": False, "error": "text1とtext2パラメータが必要です"}
            else:
                result = calculate_similarity(args.text1, args.text2)
        
        elif args.function == 'statistics':
            if not args.text:
                result = {"success": False, "error": "textパラメータが必要です"}
            else:
                result = analyze_text_statistics(args.text)
        
        # 結果をJSONで出力
        print(json.dumps(result, ensure_ascii=False, indent=2))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": f"実行エラー: {str(e)}",
            "timestamp": datetime.now().isoformat()
        }
        print(json.dumps(error_result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()