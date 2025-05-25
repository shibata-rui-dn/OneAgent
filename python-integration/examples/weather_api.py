#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
天気情報取得ツール - OneAgent Python連携サンプル

機能:
- OpenWeatherMap APIを使った実際の天気情報取得
- デモ用のダミーデータ生成
- 複数都市の一括取得
- 天気予報（5日間）の取得

使用方法:
python3 weather_api.py --function weather --city Tokyo
python3 weather_api.py --function weather --city Tokyo --api_key YOUR_API_KEY
python3 weather_api.py --function forecast --city Tokyo --days 5
python3 weather_api.py --function multi_cities --cities "Tokyo,Osaka,Kyoto"
"""

import requests
import json
import sys
import argparse
from typing import Dict, Any, List
import random
from datetime import datetime, timedelta
import logging

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# OpenWeatherMap API設定
OPENWEATHER_BASE_URL = "http://api.openweathermap.org/data/2.5"
OPENWEATHER_FORECAST_URL = "http://api.openweathermap.org/data/2.5/forecast"

def get_current_weather(city: str, api_key: str = None, country_code: str = None) -> Dict[str, Any]:
    """
    現在の天気情報を取得
    
    Args:
        city: 都市名
        api_key: OpenWeatherMap API Key
        country_code: 国コード（例: JP, US）
    
    Returns:
        Dict: 天気情報
    """
    try:
        if api_key:
            # 実際のAPIを使用
            query = f"{city}"
            if country_code:
                query += f",{country_code}"
                
            url = f"{OPENWEATHER_BASE_URL}/weather"
            params = {
                "q": query,
                "appid": api_key,
                "units": "metric",
                "lang": "ja"
            }
            
            logger.info(f"OpenWeatherMap API呼び出し: {city}")
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            return {
                "success": True,
                "source": "OpenWeatherMap API",
                "city": data["name"],
                "country": data["sys"]["country"],
                "weather": data["weather"][0]["description"],
                "weather_main": data["weather"][0]["main"],
                "temperature": round(data["main"]["temp"], 1),
                "feels_like": round(data["main"]["feels_like"], 1),
                "humidity": data["main"]["humidity"],
                "pressure": data["main"]["pressure"],
                "visibility": data.get("visibility", 0) / 1000,  # km
                "uv_index": None,  # 別のAPI呼び出しが必要
                "wind_speed": data.get("wind", {}).get("speed", 0),
                "wind_direction": data.get("wind", {}).get("deg", 0),
                "cloudiness": data["clouds"]["all"],
                "sunrise": datetime.fromtimestamp(data["sys"]["sunrise"]).strftime("%H:%M"),
                "sunset": datetime.fromtimestamp(data["sys"]["sunset"]).strftime("%H:%M"),
                "timestamp": datetime.now().isoformat()
            }
        else:
            # デモ用のダミーデータ
            logger.info(f"ダミーデータ生成: {city}")
            weathers = [
                {"main": "Clear", "desc": "快晴"},
                {"main": "Clouds", "desc": "曇り"},
                {"main": "Rain", "desc": "雨"},
                {"main": "Snow", "desc": "雪"},
                {"main": "Thunderstorm", "desc": "雷雨"},
                {"main": "Drizzle", "desc": "霧雨"},
                {"main": "Mist", "desc": "霧"}
            ]
            
            weather = random.choice(weathers)
            base_temp = random.randint(-5, 35)
            
            return {
                "success": True,
                "source": "Demo Data",
                "city": city,
                "country": "JP",
                "weather": weather["desc"],
                "weather_main": weather["main"],
                "temperature": base_temp,
                "feels_like": base_temp + random.randint(-3, 3),
                "humidity": random.randint(30, 90),
                "pressure": random.randint(990, 1030),
                "visibility": round(random.uniform(5, 20), 1),
                "uv_index": random.randint(1, 10),
                "wind_speed": round(random.uniform(0, 15), 1),
                "wind_direction": random.randint(0, 360),
                "cloudiness": random.randint(0, 100),
                "sunrise": "06:00",
                "sunset": "18:00",
                "timestamp": datetime.now().isoformat()
            }
            
    except requests.RequestException as e:
        logger.error(f"API呼び出しエラー: {e}")
        return {
            "success": False,
            "error": f"天気情報取得エラー: {str(e)}"
        }
    except Exception as e:
        logger.error(f"処理エラー: {e}")
        return {
            "success": False,
            "error": f"処理エラー: {str(e)}"
        }

def get_weather_forecast(city: str, api_key: str = None, days: int = 5) -> Dict[str, Any]:
    """
    天気予報を取得（最大5日間）
    
    Args:
        city: 都市名
        api_key: OpenWeatherMap API Key
        days: 予報日数（1-5）
    
    Returns:
        Dict: 天気予報情報
    """
    try:
        days = min(max(days, 1), 5)  # 1-5日の範囲に制限
        
        if api_key:
            # 実際のAPIを使用
            url = f"{OPENWEATHER_FORECAST_URL}"
            params = {
                "q": city,
                "appid": api_key,
                "units": "metric",
                "lang": "ja"
            }
            
            logger.info(f"天気予報API呼び出し: {city}, {days}日間")
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            forecasts = []
            processed_dates = set()
            
            for item in data["list"][:days * 8]:  # 3時間毎のデータなので8個/日
                date = datetime.fromtimestamp(item["dt"]).date()
                if date not in processed_dates and len(forecasts) < days:
                    forecasts.append({
                        "date": date.isoformat(),
                        "weather": item["weather"][0]["description"],
                        "weather_main": item["weather"][0]["main"],
                        "temperature_max": round(item["main"]["temp_max"], 1),
                        "temperature_min": round(item["main"]["temp_min"], 1),
                        "humidity": item["main"]["humidity"],
                        "wind_speed": item.get("wind", {}).get("speed", 0),
                        "cloudiness": item["clouds"]["all"]
                    })
                    processed_dates.add(date)
            
            return {
                "success": True,
                "source": "OpenWeatherMap API",
                "city": data["city"]["name"],
                "country": data["city"]["country"],
                "forecast_days": len(forecasts),
                "forecasts": forecasts,
                "timestamp": datetime.now().isoformat()
            }
        else:
            # デモ用のダミーデータ
            logger.info(f"ダミー予報データ生成: {city}, {days}日間")
            forecasts = []
            
            for i in range(days):
                date = datetime.now() + timedelta(days=i+1)
                weather_options = ["晴れ", "曇り", "雨", "雪"]
                weather = random.choice(weather_options)
                
                base_temp = random.randint(0, 30)
                forecasts.append({
                    "date": date.date().isoformat(),
                    "weather": weather,
                    "weather_main": weather,
                    "temperature_max": base_temp + random.randint(0, 5),
                    "temperature_min": base_temp - random.randint(0, 8),
                    "humidity": random.randint(40, 80),
                    "wind_speed": round(random.uniform(0, 10), 1),
                    "cloudiness": random.randint(0, 100)
                })
            
            return {
                "success": True,
                "source": "Demo Data",
                "city": city,
                "country": "JP",
                "forecast_days": days,
                "forecasts": forecasts,
                "timestamp": datetime.now().isoformat()
            }
            
    except Exception as e:
        logger.error(f"天気予報取得エラー: {e}")
        return {
            "success": False,
            "error": f"天気予報取得エラー: {str(e)}"
        }

def get_multiple_cities_weather(cities: List[str], api_key: str = None) -> Dict[str, Any]:
    """
    複数都市の天気情報を一括取得
    
    Args:
        cities: 都市名のリスト
        api_key: OpenWeatherMap API Key
    
    Returns:
        Dict: 複数都市の天気情報
    """
    try:
        results = []
        errors = []
        
        for city in cities:
            logger.info(f"都市 {city} の天気情報を取得中...")
            weather_data = get_current_weather(city.strip(), api_key)
            
            if weather_data["success"]:
                results.append(weather_data)
            else:
                errors.append({
                    "city": city,
                    "error": weather_data["error"]
                })
        
        return {
            "success": True,
            "total_cities": len(cities),
            "successful_cities": len(results),
            "failed_cities": len(errors),
            "weather_data": results,
            "errors": errors,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"複数都市天気取得エラー: {e}")
        return {
            "success": False,
            "error": f"複数都市天気取得エラー: {str(e)}"
        }

def get_weather_alerts(city: str, api_key: str = None) -> Dict[str, Any]:
    """
    天気警報・注意報を取得（デモ実装）
    
    Args:
        city: 都市名
        api_key: API Key
    
    Returns:
        Dict: 警報情報
    """
    try:
        # 実際の実装では気象庁APIなどを使用
        # ここではデモ用のダミーデータ
        alert_types = [
            {"type": "大雨警報", "level": "警報", "description": "1時間に50mm以上の激しい雨が予想されます"},
            {"type": "強風注意報", "level": "注意報", "description": "風速15m/s以上の強い風が予想されます"},
            {"type": "高温注意報", "level": "注意報", "description": "35度以上の猛暑日が予想されます"},
            {"type": "雷注意報", "level": "注意報", "description": "落雷の可能性があります"}
        ]
        
        # ランダムに警報を生成（実際にはAPIから取得）
        active_alerts = []
        for alert in alert_types:
            if random.random() < 0.3:  # 30%の確率で警報発生
                active_alerts.append({
                    **alert,
                    "issued_time": datetime.now().isoformat(),
                    "valid_until": (datetime.now() + timedelta(hours=random.randint(6, 24))).isoformat()
                })
        
        return {
            "success": True,
            "city": city,
            "alert_count": len(active_alerts),
            "alerts": active_alerts,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"警報情報取得エラー: {e}")
        return {
            "success": False,
            "error": f"警報情報取得エラー: {str(e)}"
        }

def main():
    parser = argparse.ArgumentParser(description='天気情報取得ツール - OneAgent Python連携')
    parser.add_argument('--function', required=True, 
                        choices=['weather', 'forecast', 'multi_cities', 'alerts'],
                        help='実行する機能')
    parser.add_argument('--city', help='都市名（weather, forecast, alerts用）')
    parser.add_argument('--cities', help='都市名（カンマ区切り、multi_cities用）')
    parser.add_argument('--api_key', help='OpenWeatherMap API Key（オプション）')
    parser.add_argument('--country_code', help='国コード（例: JP, US）')
    parser.add_argument('--days', type=int, default=5, help='予報日数（forecast用、1-5）')
    
    args = parser.parse_args()
    
    result = None
    
    try:
        if args.function == 'weather':
            if not args.city:
                result = {"success": False, "error": "都市名が指定されていません"}
            else:
                result = get_current_weather(args.city, args.api_key, args.country_code)
        
        elif args.function == 'forecast':
            if not args.city:
                result = {"success": False, "error": "都市名が指定されていません"}
            else:
                result = get_weather_forecast(args.city, args.api_key, args.days)
        
        elif args.function == 'multi_cities':
            if not args.cities:
                result = {"success": False, "error": "都市名（カンマ区切り）が指定されていません"}
            else:
                cities_list = args.cities.split(',')
                result = get_multiple_cities_weather(cities_list, args.api_key)
        
        elif args.function == 'alerts':
            if not args.city:
                result = {"success": False, "error": "都市名が指定されていません"}
            else:
                result = get_weather_alerts(args.city, args.api_key)
        
        # 結果をJSONで出力（OneAgentが読み取ります）
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