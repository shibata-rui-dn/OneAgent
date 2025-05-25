#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OneAgent Python連携 FastAPI サーバー

このサーバーはHTTP API方式でPython機能をOneAgentに提供します
天気情報、テキスト分析、機械学習、画像処理などの機能をRESTful APIで公開

起動方法:
pip install fastapi uvicorn numpy pandas scikit-learn pillow opencv-python
uvicorn fastapi_server:app --host 0.0.0.0 --port 8001 --reload

使用例:
curl -X POST http://localhost:8001/weather -H "Content-Type: application/json" -d '{"city": "Tokyo"}'
curl -X POST http://localhost:8001/text/sentiment -H "Content-Type: application/json" -d '{"text": "今日は良い天気です"}'
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Union
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import logging
import json
import base64
import tempfile
import os
from io import BytesIO
import asyncio

# 各種ライブラリのインポート
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

try:
    from sklearn.linear_model import LinearRegression
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import mean_squared_error, r2_score
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

try:
    from PIL import Image, ImageFilter, ImageEnhance
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPIアプリケーション作成
app = FastAPI(
    title="OneAgent Python Tools API",
    description="OneAgent用のPython処理ツールAPI",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ====================
# データモデル定義
# ====================

class APIResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())

class WeatherRequest(BaseModel):
    city: str = Field(..., description="都市名")
    api_key: Optional[str] = Field(None, description="OpenWeatherMap API Key")
    country_code: Optional[str] = Field(None, description="国コード (例: JP, US)")

class TextAnalysisRequest(BaseModel):
    text: str = Field(..., description="分析対象テキスト")
    analysis_type: str = Field("sentiment", description="分析タイプ")
    max_keywords: Optional[int] = Field(10, description="キーワード数上限")
    sentence_count: Optional[int] = Field(3, description="要約文章数")

class MLRequest(BaseModel):
    data: List[Dict[str, Any]] = Field(..., description="学習データ")
    target_column: Optional[str] = Field(None, description="予測対象列")
    function: str = Field(..., description="実行する機械学習機能")
    n_clusters: Optional[int] = Field(3, description="クラスター数")
    algorithm: Optional[str] = Field("kmeans", description="アルゴリズム")

class ImageProcessRequest(BaseModel):
    image_data: str = Field(..., description="Base64エンコードされた画像データ")
    function: str = Field(..., description="実行する画像処理機能")
    width: Optional[int] = Field(None, description="リサイズ幅")
    height: Optional[int] = Field(None, description="リサイズ高さ")
    filter_type: Optional[str] = Field(None, description="フィルタータイプ")
    intensity: Optional[float] = Field(1.0, description="フィルター強度")
    target_format: Optional[str] = Field(None, description="変換先フォーマット")

# ====================
# ヘルスチェック・情報
# ====================

@app.get("/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    dependencies = {
        "requests": REQUESTS_AVAILABLE,
        "sklearn": SKLEARN_AVAILABLE,
        "PIL": PIL_AVAILABLE,
        "opencv": CV2_AVAILABLE
    }
    
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "dependencies": dependencies,
        "available_endpoints": [
            "/weather", "/weather/forecast", "/weather/multiple",
            "/text/sentiment", "/text/keywords", "/text/summary", "/text/similarity",
            "/ml/predict", "/ml/cluster", "/ml/timeseries", "/ml/anomaly",
            "/image/resize", "/image/filter", "/image/analyze", "/image/convert"
        ]
    }

@app.get("/info")
async def get_info():
    """API情報エンドポイント"""
    return {
        "name": "OneAgent Python Tools API",
        "version": "1.0.0",
        "description": "OneAgentと連携するPython処理ツールのHTTP APIサーバー",
        "features": [
            "天気情報取得（OpenWeatherMap API対応）",
            "テキスト分析（感情分析、キーワード抽出、要約）",
            "機械学習（予測、クラスタリング、時系列分析、異常検知）",
            "画像処理（リサイズ、フィルター、分析、フォーマット変換）"
        ],
        "dependencies": {
            "required": ["fastapi", "uvicorn", "pandas", "numpy"],
            "optional": ["requests", "scikit-learn", "pillow", "opencv-python", "nltk"]
        }
    }

# ====================
# 天気情報API
# ====================

@app.post("/weather", response_model=APIResponse)
async def get_weather(request: WeatherRequest):
    """現在の天気情報を取得"""
    try:
        logger.info(f"天気情報リクエスト: {request.city}")
        
        if request.api_key and REQUESTS_AVAILABLE:
            # 実際のOpenWeatherMap API呼び出し
            url = "http://api.openweathermap.org/data/2.5/weather"
            params = {
                "q": f"{request.city},{request.country_code}" if request.country_code else request.city,
                "appid": request.api_key,
                "units": "metric",
                "lang": "ja"
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            result = {
                "source": "OpenWeatherMap API",
                "city": data["name"],
                "country": data["sys"]["country"],
                "weather": data["weather"][0]["description"],
                "weather_main": data["weather"][0]["main"],
                "temperature": round(data["main"]["temp"], 1),
                "feels_like": round(data["main"]["feels_like"], 1),
                "humidity": data["main"]["humidity"],
                "pressure": data["main"]["pressure"],
                "visibility": data.get("visibility", 0) / 1000,
                "wind_speed": data.get("wind", {}).get("speed", 0),
                "wind_direction": data.get("wind", {}).get("deg", 0),
                "cloudiness": data["clouds"]["all"],
                "sunrise": datetime.fromtimestamp(data["sys"]["sunrise"]).strftime("%H:%M"),
                "sunset": datetime.fromtimestamp(data["sys"]["sunset"]).strftime("%H:%M")
            }
        else:
            # デモデータ生成
            import random
            weathers = [
                {"main": "Clear", "desc": "快晴"},
                {"main": "Clouds", "desc": "曇り"},
                {"main": "Rain", "desc": "雨"},
                {"main": "Snow", "desc": "雪"}
            ]
            
            weather = random.choice(weathers)
            base_temp = random.randint(-5, 35)
            
            result = {
                "source": "Demo Data",
                "city": request.city,
                "country": "JP",
                "weather": weather["desc"],
                "weather_main": weather["main"],
                "temperature": base_temp,
                "feels_like": base_temp + random.randint(-3, 3),
                "humidity": random.randint(30, 90),
                "pressure": random.randint(990, 1030),
                "visibility": round(random.uniform(5, 20), 1),
                "wind_speed": round(random.uniform(0, 15), 1),
                "wind_direction": random.randint(0, 360),
                "cloudiness": random.randint(0, 100),
                "sunrise": "06:00",
                "sunset": "18:00"
            }
        
        return APIResponse(success=True, data=result)
        
    except requests.RequestException as e:
        logger.error(f"天気API呼び出しエラー: {e}")
        raise HTTPException(status_code=503, detail=f"天気API呼び出しエラー: {str(e)}")
    except Exception as e:
        logger.error(f"天気情報取得エラー: {e}")
        raise HTTPException(status_code=500, detail=f"天気情報取得エラー: {str(e)}")

@app.post("/weather/forecast", response_model=APIResponse)
async def get_weather_forecast(request: WeatherRequest):
    """天気予報を取得（5日間）"""
    try:
        logger.info(f"天気予報リクエスト: {request.city}")
        
        # デモ用予報データ生成
        import random
        forecasts = []
        
        for i in range(1, 6):  # 5日間
            date = datetime.now() + timedelta(days=i)
            weather_options = ["晴れ", "曇り", "雨", "雪"]
            weather = random.choice(weather_options)
            
            base_temp = random.randint(0, 30)
            forecasts.append({
                "date": date.date().isoformat(),
                "weather": weather,
                "temperature_max": base_temp + random.randint(0, 5),
                "temperature_min": base_temp - random.randint(0, 8),
                "humidity": random.randint(40, 80),
                "wind_speed": round(random.uniform(0, 10), 1),
                "cloudiness": random.randint(0, 100)
            })
        
        result = {
            "source": "Demo Data",
            "city": request.city,
            "country": "JP",
            "forecast_days": 5,
            "forecasts": forecasts
        }
        
        return APIResponse(success=True, data=result)
        
    except Exception as e:
        logger.error(f"天気予報取得エラー: {e}")
        raise HTTPException(status_code=500, detail=f"天気予報取得エラー: {str(e)}")

# ====================
# テキスト分析API
# ====================

@app.post("/text/sentiment", response_model=APIResponse)
async def analyze_sentiment(request: TextAnalysisRequest):
    """感情分析を実行"""
    try:
        logger.info("感情分析実行")
        
        text = request.text
        
        # 簡易感情分析
        positive_words = ['良い', '嬉しい', '素晴らしい', '最高', 'good', 'great', 'excellent', 'amazing']
        negative_words = ['悪い', '悲しい', 'terrible', 'awful', 'bad', 'horrible']
        
        text_lower = text.lower()
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
        
        result = {
            "sentiment": sentiment,
            "confidence": round(confidence, 3),
            "polarity": round(polarity, 3),
            "positive_word_count": positive_count,
            "negative_word_count": negative_count,
            "text_length": len(text),
            "word_count": len(text.split())
        }
        
        return APIResponse(success=True, data=result)
        
    except Exception as e:
        logger.error(f"感情分析エラー: {e}")
        raise HTTPException(status_code=500, detail=f"感情分析エラー: {str(e)}")

@app.post("/text/keywords", response_model=APIResponse)
async def extract_keywords(request: TextAnalysisRequest):
    """キーワード抽出を実行"""
    try:
        logger.info("キーワード抽出実行")
        
        from collections import Counter
        import re
        
        text = request.text.lower()
        # 基本的な前処理
        text_clean = re.sub(r'[^\w\s]', '', text)
        words = text_clean.split()
        
        # ストップワードを除去（簡易版）
        stop_words = ['は', 'が', 'を', 'に', 'で', 'と', 'の', 'も', 'から', 'まで', 
                     'より', 'など', 'として', 'について', 'による', 'によって',
                     'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']
        
        words = [word for word in words if word not in stop_words and len(word) > 2]
        
        # 頻度計算
        word_freq = Counter(words)
        top_keywords = word_freq.most_common(request.max_keywords)
        
        result = {
            "total_words": len(words),
            "unique_words": len(word_freq),
            "top_keywords": [
                {
                    "word": word,
                    "count": count,
                    "frequency": round(count / len(words), 3)
                }
                for word, count in top_keywords
            ]
        }
        
        return APIResponse(success=True, data=result)
        
    except Exception as e:
        logger.error(f"キーワード抽出エラー: {e}")
        raise HTTPException(status_code=500, detail=f"キーワード抽出エラー: {str(e)}")

@app.post("/text/summary", response_model=APIResponse)
async def summarize_text(request: TextAnalysisRequest):
    """テキスト要約を実行"""
    try:
        logger.info("テキスト要約実行")
        
        import re
        
        text = request.text
        sentences = re.split(r'[。！？\.\!\?]', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        if len(sentences) <= request.sentence_count:
            summary = text
            compression_ratio = 1.0
        else:
            # 簡易スコアリング（文章の長さと位置を考慮）
            sentence_scores = []
            
            for i, sentence in enumerate(sentences):
                score = 0
                
                # 文章の長さスコア
                word_count = len(sentence.split())
                if 5 <= word_count <= 30:
                    score += word_count * 0.1
                
                # 位置スコア（最初と最後を重視）
                if i < len(sentences) * 0.3:
                    score += 2
                elif i > len(sentences) * 0.7:
                    score += 1
                
                sentence_scores.append((score, i, sentence))
            
            # スコア順にソートして上位を選択
            sentence_scores.sort(reverse=True)
            selected_sentences = sorted(sentence_scores[:request.sentence_count], key=lambda x: x[1])
            summary = '。'.join([s[2] for s in selected_sentences])
            compression_ratio = len(summary) / len(text)
        
        result = {
            "original_sentences": len(sentences),
            "summary_sentences": min(request.sentence_count, len(sentences)),
            "summary": summary,
            "compression_ratio": round(compression_ratio, 3)
        }
        
        return APIResponse(success=True, data=result)
        
    except Exception as e:
        logger.error(f"テキスト要約エラー: {e}")
        raise HTTPException(status_code=500, detail=f"テキスト要約エラー: {str(e)}")

# ====================
# 機械学習API
# ====================

@app.post("/ml/predict", response_model=APIResponse)
async def ml_predict(request: MLRequest):
    """線形回帰予測を実行"""
    try:
        if not SKLEARN_AVAILABLE:
            raise HTTPException(status_code=503, detail="scikit-learnが必要です")
        
        logger.info("機械学習予測実行")
        
        df = pd.DataFrame(request.data)
        
        # ターゲット変数の分離
        if request.target_column and request.target_column in df.columns:
            X = df.drop(columns=[request.target_column])
            y = df[request.target_column]
        else:
            X = df.iloc[:, :-1]
            y = df.iloc[:, -1]
        
        # 数値列のみを使用
        X_numeric = X.select_dtypes(include=[np.number])
        if X_numeric.empty:
            raise ValueError("数値列が見つかりません")
        
        # モデル訓練
        model = LinearRegression()
        model.fit(X_numeric, y)
        
        # 予測
        y_pred = model.predict(X_numeric)
        
        # 評価指標
        mse = mean_squared_error(y, y_pred)
        r2 = r2_score(y, y_pred)
        
        # 次の値を予測
        if len(X_numeric) > 0:
            latest_features = X_numeric.iloc[-1:].values
            next_prediction = model.predict(latest_features)[0]
        else:
            next_prediction = 0
        
        result = {
            "model_type": "linear_regression",
            "data_points": len(df),
            "features": list(X_numeric.columns),
            "mse": float(mse),
            "r2_score": float(r2),
            "predictions": y_pred.tolist()[:10],  # 最初の10個
            "next_prediction": float(next_prediction),
            "coefficients": model.coef_.tolist(),
            "intercept": float(model.intercept_)
        }
        
        return APIResponse(success=True, data=result)
        
    except Exception as e:
        logger.error(f"機械学習予測エラー: {e}")
        raise HTTPException(status_code=500, detail=f"機械学習予測エラー: {str(e)}")

@app.post("/ml/cluster", response_model=APIResponse)
async def ml_cluster(request: MLRequest):
    """クラスタリング分析を実行"""
    try:
        if not SKLEARN_AVAILABLE:
            raise HTTPException(status_code=503, detail="scikit-learnが必要です")
        
        logger.info("クラスタリング分析実行")
        
        df = pd.DataFrame(request.data)
        
        # 数値列のみを選択
        numeric_df = df.select_dtypes(include=[np.number])
        if numeric_df.empty:
            raise ValueError("数値列が見つかりません")
        
        X = numeric_df.values
        
        # データの標準化
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # K-meansクラスタリング
        n_clusters = min(request.n_clusters, len(X))
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        cluster_labels = kmeans.fit_predict(X_scaled)
        
        # クラスター統計
        cluster_stats = {}
        for cluster_id in range(n_clusters):
            mask = cluster_labels == cluster_id
            cluster_data = numeric_df[mask]
            
            cluster_stats[f"cluster_{cluster_id}"] = {
                "size": int(np.sum(mask)),
                "percentage": float(np.sum(mask) / len(X) * 100),
                "mean_values": cluster_data.mean().to_dict()
            }
        
        result = {
            "algorithm": "K-means",
            "n_clusters": n_clusters,
            "data_points": len(X),
            "features": list(numeric_df.columns),
            "cluster_labels": cluster_labels.tolist(),
            "cluster_centers": scaler.inverse_transform(kmeans.cluster_centers_).tolist(),
            "inertia": float(kmeans.inertia_),
            "cluster_statistics": cluster_stats
        }
        
        return APIResponse(success=True, data=result)
        
    except Exception as e:
        logger.error(f"クラスタリング分析エラー: {e}")
        raise HTTPException(status_code=500, detail=f"クラスタリング分析エラー: {str(e)}")

# ====================
# 画像処理API
# ====================

@app.post("/image/analyze", response_model=APIResponse)
async def analyze_image(request: ImageProcessRequest):
    """画像分析を実行"""
    try:
        if not PIL_AVAILABLE:
            raise HTTPException(status_code=503, detail="Pillowが必要です")
        
        logger.info("画像分析実行")
        
        # Base64デコード
        try:
            image_data = base64.b64decode(request.image_data)
            image = Image.open(BytesIO(image_data))
        except Exception as e:
            raise ValueError(f"画像データのデコードに失敗しました: {str(e)}")
        
        # RGBに変換
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # 基本情報
        width, height = image.size
        total_pixels = width * height
        
        # 解像度品質評価
        if total_pixels >= 2073600:  # 1920x1080以上
            resolution_quality = "高解像度"
        elif total_pixels >= 921600:  # 1280x720以上
            resolution_quality = "中解像度"
        else:
            resolution_quality = "低解像度"
        
        # アスペクト比
        aspect_ratio = round(width / height, 2)
        
        # 色彩分析（簡易版）
        from PIL import ImageStat
        stat = ImageStat.Stat(image)
        
        result = {
            "dimensions": {"width": width, "height": height},
            "total_pixels": total_pixels,
            "resolution_quality": resolution_quality,
            "aspect_ratio": aspect_ratio,
            "color_analysis": {
                "mean_rgb": [round(x, 2) for x in stat.mean],
                "median_rgb": [round(x, 2) for x in stat.median],
                "stddev_rgb": [round(x, 2) for x in stat.stddev]
            },
            "image_mode": image.mode,
            "has_transparency": image.mode in ['RGBA', 'LA']
        }
        
        return APIResponse(success=True, data=result)
        
    except Exception as e:
        logger.error(f"画像分析エラー: {e}")
        raise HTTPException(status_code=500, detail=f"画像分析エラー: {str(e)}")

@app.post("/image/resize", response_model=APIResponse)
async def resize_image(request: ImageProcessRequest):
    """画像リサイズを実行"""
    try:
        if not PIL_AVAILABLE:
            raise HTTPException(status_code=503, detail="Pillowが必要です")
        
        logger.info("画像リサイズ実行")
        
        # Base64デコード
        image_data = base64.b64decode(request.image_data)
        image = Image.open(BytesIO(image_data))
        
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        original_size = image.size
        
        # リサイズ
        if request.width and request.height:
            new_size = (request.width, request.height)
        elif request.width:
            ratio = request.width / original_size[0]
            new_size = (request.width, int(original_size[1] * ratio))
        elif request.height:
            ratio = request.height / original_size[1]
            new_size = (int(original_size[0] * ratio), request.height)
        else:
            raise ValueError("幅または高さを指定してください")
        
        resized_image = image.resize(new_size, Image.Resampling.LANCZOS)
        
        # Base64エンコード
        output_buffer = BytesIO()
        resized_image.save(output_buffer, format="JPEG", quality=95)
        output_base64 = base64.b64encode(output_buffer.getvalue()).decode()
        
        result = {
            "original_size": {"width": original_size[0], "height": original_size[1]},
            "new_size": {"width": new_size[0], "height": new_size[1]},
            "resized_image": output_base64
        }
        
        return APIResponse(success=True, data=result)
        
    except Exception as e:
        logger.error(f"画像リサイズエラー: {e}")
        raise HTTPException(status_code=500, detail=f"画像リサイズエラー: {str(e)}")

# ====================
# ファイルアップロード対応
# ====================

@app.post("/upload/image/analyze")
async def analyze_uploaded_image(file: UploadFile = File(...)):
    """アップロードされた画像を分析"""
    try:
        if not PIL_AVAILABLE:
            raise HTTPException(status_code=503, detail="Pillowが必要です")
        
        logger.info(f"アップロード画像分析: {file.filename}")
        
        # ファイル内容を読み込み
        contents = await file.read()
        image = Image.open(BytesIO(contents))
        
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # 分析実行（analyze_imageと同様）
        width, height = image.size
        total_pixels = width * height
        
        if total_pixels >= 2073600:
            resolution_quality = "高解像度"
        elif total_pixels >= 921600:
            resolution_quality = "中解像度"
        else:
            resolution_quality = "低解像度"
        
        aspect_ratio = round(width / height, 2)
        
        from PIL import ImageStat
        stat = ImageStat.Stat(image)
        
        result = {
            "filename": file.filename,
            "file_size": len(contents),
            "dimensions": {"width": width, "height": height},
            "total_pixels": total_pixels,
            "resolution_quality": resolution_quality,
            "aspect_ratio": aspect_ratio,
            "color_analysis": {
                "mean_rgb": [round(x, 2) for x in stat.mean],
                "median_rgb": [round(x, 2) for x in stat.median],
                "stddev_rgb": [round(x, 2) for x in stat.stddev]
            }
        }
        
        return APIResponse(success=True, data=result)
        
    except Exception as e:
        logger.error(f"アップロード画像分析エラー: {e}")
        raise HTTPException(status_code=500, detail=f"アップロード画像分析エラー: {str(e)}")

# ====================
# バッチ処理API
# ====================

@app.post("/batch/text/sentiment", response_model=APIResponse)
async def batch_sentiment_analysis(texts: List[str]):
    """複数テキストの感情分析を一括実行"""
    try:
        logger.info(f"バッチ感情分析: {len(texts)}件")
        
        results = []
        for i, text in enumerate(texts):
            try:
                # 個別の感情分析を実行
                request = TextAnalysisRequest(text=text)
                response = await analyze_sentiment(request)
                results.append({
                    "index": i,
                    "text": text[:50] + "..." if len(text) > 50 else text,
                    "analysis": response.data
                })
            except Exception as e:
                results.append({
                    "index": i,
                    "text": text[:50] + "..." if len(text) > 50 else text,
                    "error": str(e)
                })
        
        # 集計統計
        successful_analyses = [r for r in results if 'analysis' in r]
        if successful_analyses:
            sentiments = [r['analysis']['sentiment'] for r in successful_analyses]
            sentiment_counts = {}
            for sentiment in sentiments:
                sentiment_counts[sentiment] = sentiment_counts.get(sentiment, 0) + 1
            
            summary = {
                "total_texts": len(texts),
                "successful_analyses": len(successful_analyses),
                "sentiment_distribution": sentiment_counts,
                "average_confidence": round(
                    sum(r['analysis']['confidence'] for r in successful_analyses) / len(successful_analyses), 3
                ) if successful_analyses else 0
            }
        else:
            summary = {"total_texts": len(texts), "successful_analyses": 0}
        
        result = {
            "summary": summary,
            "detailed_results": results
        }
        
        return APIResponse(success=True, data=result)
        
    except Exception as e:
        logger.error(f"バッチ感情分析エラー: {e}")
        raise HTTPException(status_code=500, detail=f"バッチ感情分析エラー: {str(e)}")

# ====================
# サーバー起動設定
# ====================

if __name__ == "__main__":
    import uvicorn
    
    print("🚀 OneAgent Python Tools API サーバー起動中...")
    print("📊 利用可能な機能:")
    print("   🌤️  天気情報取得")
    print("   📝 テキスト分析")
    print("   🤖 機械学習")
    print("   🖼️  画像処理")
    print("")
    print("📖 API ドキュメント: http://localhost:8001/docs")
    print("🔍 ヘルスチェック: http://localhost:8001/health")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )