#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
機械学習分析ツール - OneAgent Python連携サンプル

機能:
- 線形回帰による予測
- クラスター分析（K-means）
- 時系列分析と予測
- 異常値検出
- 分類モデル（決定木、ランダムフォレスト）
- データ前処理と特徴量エンジニアリング

使用方法:
python3 ml_analysis.py --function predict --data '[{"x":1,"y":2},{"x":2,"y":4}]'
python3 ml_analysis.py --function cluster --data '[{"x":1,"y":2},{"x":5,"y":6}]'
python3 ml_analysis.py --function timeseries --data '[{"date":"2024-01","value":100}]'
python3 ml_analysis.py --function anomaly --data '[1,2,3,100,5,6,7]' --threshold 2.5
"""

import json
import argparse
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import logging
import warnings
warnings.filterwarnings('ignore')

# 機械学習ライブラリ
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.cluster import KMeans, DBSCAN
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import mean_squared_error, r2_score, accuracy_score, classification_report
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.decomposition import PCA
from sklearn.tree import DecisionTreeClassifier

# 統計・数学ライブラリ
from scipy import stats
from scipy.signal import find_peaks

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def preprocess_data(data, target_column=None):
    """
    データの前処理
    """
    try:
        df = pd.DataFrame(data)
        
        # 基本情報
        info = {
            "original_shape": df.shape,
            "columns": list(df.columns),
            "dtypes": df.dtypes.to_dict(),
            "missing_values": df.isnull().sum().to_dict(),
            "duplicate_rows": df.duplicated().sum()
        }
        
        # 欠損値の処理
        numeric_columns = df.select_dtypes(include=[np.number]).columns
        categorical_columns = df.select_dtypes(include=[object]).columns
        
        # 数値列の欠損値を平均で埋める
        for col in numeric_columns:
            if df[col].isnull().any():
                df[col].fillna(df[col].mean(), inplace=True)
        
        # カテゴリ列の欠損値を最頻値で埋める
        for col in categorical_columns:
            if df[col].isnull().any():
                df[col].fillna(df[col].mode()[0] if not df[col].mode().empty else 'Unknown', inplace=True)
        
        # 重複行の削除
        df.drop_duplicates(inplace=True)
        
        # ターゲット変数の分離
        X, y = None, None
        if target_column and target_column in df.columns:
            X = df.drop(columns=[target_column])
            y = df[target_column]
        elif len(df.columns) > 1:
            X = df.iloc[:, :-1]
            y = df.iloc[:, -1]
        else:
            X = df
            y = None
        
        info["processed_shape"] = df.shape
        info["features_count"] = X.shape[1] if X is not None else 0
        info["target_type"] = str(y.dtype) if y is not None else None
        
        return X, y, info
        
    except Exception as e:
        raise Exception(f"データ前処理エラー: {str(e)}")

def linear_regression_analysis(data, target_column=None):
    """
    線形回帰分析
    """
    try:
        logger.info("線形回帰分析実行")
        
        X, y, info = preprocess_data(data, target_column)
        
        if X is None or y is None:
            raise ValueError("特徴量またはターゲット変数が不足しています")
        
        if len(X) < 2:
            raise ValueError("データが不足しています（最低2行必要）")
        
        # 数値列のみを使用
        numeric_X = X.select_dtypes(include=[np.number])
        if numeric_X.empty:
            raise ValueError("数値列が見つかりません")
        
        # データ分割
        if len(numeric_X) > 4:
            X_train, X_test, y_train, y_test = train_test_split(
                numeric_X, y, test_size=0.2, random_state=42
            )
        else:
            X_train = X_test = numeric_X
            y_train = y_test = y
        
        # モデル訓練
        model = LinearRegression()
        model.fit(X_train, y_train)
        
        # 予測
        y_pred_train = model.predict(X_train)
        y_pred_test = model.predict(X_test)
        
        # 評価指標
        train_mse = mean_squared_error(y_train, y_pred_train)
        test_mse = mean_squared_error(y_test, y_pred_test)
        train_r2 = r2_score(y_train, y_pred_train)
        test_r2 = r2_score(y_test, y_pred_test)
        
        # 特徴量重要度
        feature_importance = {}
        for i, col in enumerate(numeric_X.columns):
            feature_importance[col] = float(model.coef_[i]) if hasattr(model.coef_, '__len__') else float(model.coef_)
        
        # 次の値を予測
        if len(numeric_X) > 0:
            latest_features = numeric_X.iloc[-1:].values
            next_prediction = model.predict(latest_features)[0]
        else:
            next_prediction = 0
        
        # 信頼区間の計算（簡易版）
        residuals = y_test - y_pred_test
        prediction_std = np.std(residuals)
        confidence_interval = {
            "lower": float(next_prediction - 1.96 * prediction_std),
            "upper": float(next_prediction + 1.96 * prediction_std)
        }
        
        return {
            "success": True,
            "model_type": "linear_regression",
            "data_info": info,
            "metrics": {
                "train_mse": float(train_mse),
                "test_mse": float(test_mse),
                "train_r2": float(train_r2),
                "test_r2": float(test_r2)
            },
            "predictions": {
                "train_predictions": y_pred_train.tolist()[:10],  # 最初の10個
                "test_predictions": y_pred_test.tolist(),
                "next_prediction": float(next_prediction),
                "confidence_interval": confidence_interval
            },
            "feature_importance": feature_importance,
            "model_parameters": {
                "intercept": float(model.intercept_),
                "coefficients": model.coef_.tolist() if hasattr(model.coef_, '__len__') else [float(model.coef_)]
            }
        }
        
    except Exception as e:
        logger.error(f"線形回帰分析エラー: {e}")
        return {
            "success": False,
            "error": f"線形回帰分析エラー: {str(e)}"
        }

def clustering_analysis(data, n_clusters=None, algorithm='kmeans'):
    """
    クラスタリング分析
    """
    try:
        logger.info(f"クラスタリング分析実行: {algorithm}")
        
        df = pd.DataFrame(data)
        
        # 数値列のみを選択
        numeric_df = df.select_dtypes(include=[np.number])
        if numeric_df.empty:
            raise ValueError("数値列が見つかりません")
        
        X = numeric_df.values
        
        # データの標準化
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        if algorithm == 'kmeans':
            # 最適クラスター数の推定（エルボー法）
            if n_clusters is None:
                inertias = []
                k_range = range(1, min(len(X), 10))
                for k in k_range:
                    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
                    kmeans.fit(X_scaled)
                    inertias.append(kmeans.inertia_)
                
                # エルボーポイントの推定
                if len(inertias) > 2:
                    diffs = np.diff(inertias)
                    n_clusters = np.argmax(diffs) + 2  # 差分が最大の点の次
                else:
                    n_clusters = 3
            
            n_clusters = min(n_clusters, len(X))
            
            # K-means クラスタリング
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            cluster_labels = kmeans.fit_predict(X_scaled)
            cluster_centers = scaler.inverse_transform(kmeans.cluster_centers_)
            
            clustering_info = {
                "algorithm": "K-means",
                "n_clusters": n_clusters,
                "inertia": float(kmeans.inertia_),
                "cluster_centers": cluster_centers.tolist()
            }
            
        elif algorithm == 'dbscan':
            # DBSCAN クラスタリング
            dbscan = DBSCAN(eps=0.5, min_samples=2)
            cluster_labels = dbscan.fit_predict(X_scaled)
            n_clusters = len(set(cluster_labels)) - (1 if -1 in cluster_labels else 0)
            
            clustering_info = {
                "algorithm": "DBSCAN",
                "n_clusters": n_clusters,
                "noise_points": int(np.sum(cluster_labels == -1)),
                "eps": 0.5,
                "min_samples": 2
            }
        
        # クラスター統計の計算
        cluster_stats = {}
        for cluster_id in set(cluster_labels):
            if cluster_id == -1:  # ノイズポイント（DBSCAN）
                continue
                
            mask = cluster_labels == cluster_id
            cluster_data = numeric_df[mask]
            
            cluster_stats[f"cluster_{cluster_id}"] = {
                "size": int(np.sum(mask)),
                "percentage": float(np.sum(mask) / len(X) * 100),
                "mean_values": cluster_data.mean().to_dict(),
                "std_values": cluster_data.std().to_dict()
            }
        
        # 主成分分析による可視化準備
        if X_scaled.shape[1] > 2:
            pca = PCA(n_components=2)
            X_pca = pca.fit_transform(X_scaled)
            pca_info = {
                "explained_variance_ratio": pca.explained_variance_ratio_.tolist(),
                "total_variance_explained": float(np.sum(pca.explained_variance_ratio_))
            }
        else:
            X_pca = X_scaled
            pca_info = {"note": "2D data, PCA not needed"}
        
        return {
            "success": True,
            "clustering_info": clustering_info,
            "cluster_labels": cluster_labels.tolist(),
            "cluster_statistics": cluster_stats,
            "data_info": {
                "original_features": list(numeric_df.columns),
                "data_points": len(X),
                "features": X.shape[1]
            },
            "pca_info": pca_info,
            "visualization_data": {
                "x_coords": X_pca[:, 0].tolist(),
                "y_coords": X_pca[:, 1].tolist(),
                "cluster_labels": cluster_labels.tolist()
            }
        }
        
    except Exception as e:
        logger.error(f"クラスタリング分析エラー: {e}")
        return {
            "success": False,
            "error": f"クラスタリング分析エラー: {str(e)}"
        }

def time_series_analysis(data, date_column=None, value_column=None, forecast_periods=5):
    """
    時系列分析と予測
    """
    try:
        logger.info("時系列分析実行")
        
        df = pd.DataFrame(data)
        
        # 日付列と値列の特定
        if date_column and date_column in df.columns:
            dates = pd.to_datetime(df[date_column])
        else:
            # 日付列を自動検出
            date_cols = df.select_dtypes(include=['datetime64', 'object']).columns
            if len(date_cols) > 0:
                try:
                    dates = pd.to_datetime(df[date_cols[0]])
                except:
                    # 日付列がない場合は連番で作成
                    dates = pd.date_range(start='2024-01-01', periods=len(df), freq='D')
            else:
                dates = pd.date_range(start='2024-01-01', periods=len(df), freq='D')
        
        if value_column and value_column in df.columns:
            values = df[value_column].values
        else:
            # 数値列を自動選択
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            if len(numeric_cols) == 0:
                raise ValueError("数値列が見つかりません")
            values = df[numeric_cols[0]].values
        
        # 時系列データの作成
        ts_df = pd.DataFrame({'date': dates, 'value': values})
        ts_df = ts_df.sort_values('date').reset_index(drop=True)
        
        # 基本統計
        basic_stats = {
            "mean": float(np.mean(values)),
            "std": float(np.std(values)),
            "min": float(np.min(values)),
            "max": float(np.max(values)),
            "trend": float(np.polyfit(range(len(values)), values, 1)[0])
        }
        
        # 移動平均の計算
        window_size = min(7, len(values) // 3) if len(values) > 3 else 1
        if window_size > 1:
            ts_df['moving_avg'] = ts_df['value'].rolling(window=window_size, center=True).mean()
        else:
            ts_df['moving_avg'] = ts_df['value']
        
        # 季節性の検出（簡易版）
        seasonality_info = {}
        if len(values) >= 12:
            # 12期間での自己相関を計算
            autocorr_12 = np.corrcoef(values[:-12], values[12:])[0, 1]
            seasonality_info["annual_autocorr"] = float(autocorr_12) if not np.isnan(autocorr_12) else 0
            
            # 週間パターンの検出
            if len(values) >= 7:
                autocorr_7 = np.corrcoef(values[:-7], values[7:])[0, 1]
                seasonality_info["weekly_autocorr"] = float(autocorr_7) if not np.isnan(autocorr_7) else 0
        
        # 異常値の検出
        z_scores = np.abs(stats.zscore(values))
        anomalies = []
        for i, z_score in enumerate(z_scores):
            if z_score > 2.5:  # 2.5σを超える値
                anomalies.append({
                    "index": i,
                    "date": ts_df.iloc[i]['date'].isoformat(),
                    "value": float(values[i]),
                    "z_score": float(z_score)
                })
        
        # トレンド分析
        trend_analysis = {
            "trend_direction": "上昇" if basic_stats["trend"] > 0.01 else "下降" if basic_stats["trend"] < -0.01 else "横ばい",
            "trend_strength": abs(basic_stats["trend"]),
            "volatility": float(np.std(np.diff(values))) if len(values) > 1 else 0
        }
        
        # 簡易予測（線形トレンド + 移動平均）
        forecast_data = []
        last_date = ts_df['date'].iloc[-1]
        last_value = values[-1]
        trend_slope = basic_stats["trend"]
        
        # 季節調整（簡易版）
        recent_avg = np.mean(values[-min(7, len(values)):])
        seasonal_adjustment = recent_avg - basic_stats["mean"]
        
        for i in range(1, forecast_periods + 1):
            forecast_date = last_date + timedelta(days=i)
            trend_component = last_value + trend_slope * i
            seasonal_component = seasonal_adjustment * 0.5  # 季節効果を半減
            
            forecast_value = trend_component + seasonal_component
            
            # 予測の不確実性を考慮
            uncertainty = trend_analysis["volatility"] * np.sqrt(i)  # 時間とともに増加
            
            forecast_data.append({
                "date": forecast_date.isoformat(),
                "predicted_value": float(forecast_value),
                "lower_bound": float(forecast_value - 1.96 * uncertainty),
                "upper_bound": float(forecast_value + 1.96 * uncertainty),
                "confidence": float(max(0.5, 1 - i * 0.1))  # 時間とともに信頼度低下
            })
        
        return {
            "success": True,
            "analysis_type": "time_series",
            "data_info": {
                "data_points": len(values),
                "date_range": {
                    "start": ts_df['date'].min().isoformat(),
                    "end": ts_df['date'].max().isoformat()
                },
                "missing_dates": int(ts_df['value'].isnull().sum())
            },
            "basic_statistics": basic_stats,
            "trend_analysis": trend_analysis,
            "seasonality": seasonality_info,
            "anomalies": {
                "count": len(anomalies),
                "anomalies": anomalies[:10]  # 最初の10個
            },
            "moving_average": {
                "window_size": window_size,
                "values": ts_df['moving_avg'].dropna().tolist()
            },
            "forecast": {
                "periods": forecast_periods,
                "method": "Linear trend + seasonal adjustment",
                "predictions": forecast_data
            },
            "historical_data": [
                {
                    "date": row['date'].isoformat(),
                    "value": float(row['value']),
                    "moving_avg": float(row['moving_avg']) if not pd.isna(row['moving_avg']) else None
                }
                for _, row in ts_df.tail(20).iterrows()  # 最新20データポイント
            ]
        }
        
    except Exception as e:
        logger.error(f"時系列分析エラー: {e}")
        return {
            "success": False,
            "error": f"時系列分析エラー: {str(e)}"
        }

def anomaly_detection(data, method='zscore', threshold=2.5):
    """
    異常値検出
    """
    try:
        logger.info(f"異常値検出実行: {method}")
        
        if isinstance(data, list) and all(isinstance(x, (int, float)) for x in data):
            # 数値のリストの場合
            values = np.array(data)
            df = pd.DataFrame({'value': values})
            target_column = 'value'
        else:
            # データフレーム形式の場合
            df = pd.DataFrame(data)
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            if len(numeric_cols) == 0:
                raise ValueError("数値列が見つかりません")
            target_column = numeric_cols[0]
            values = df[target_column].values
        
        anomalies = []
        normal_indices = []
        
        if method == 'zscore':
            # Z-scoreによる異常値検出
            z_scores = np.abs(stats.zscore(values))
            
            for i, (value, z_score) in enumerate(zip(values, z_scores)):
                if z_score > threshold:
                    anomalies.append({
                        "index": i,
                        "value": float(value),
                        "z_score": float(z_score),
                        "severity": "high" if z_score > threshold * 1.5 else "medium"
                    })
                else:
                    normal_indices.append(i)
        
        elif method == 'iqr':
            # IQR(四分位範囲)による異常値検出
            Q1 = np.percentile(values, 25)
            Q3 = np.percentile(values, 75)
            IQR = Q3 - Q1
            lower_bound = Q1 - threshold * IQR
            upper_bound = Q3 + threshold * IQR
            
            for i, value in enumerate(values):
                if value < lower_bound or value > upper_bound:
                    distance = min(abs(value - lower_bound), abs(value - upper_bound))
                    anomalies.append({
                        "index": i,
                        "value": float(value),
                        "distance_from_bound": float(distance),
                        "bounds": {"lower": float(lower_bound), "upper": float(upper_bound)},
                        "severity": "high" if distance > IQR else "medium"
                    })
                else:
                    normal_indices.append(i)
        
        elif method == 'isolation':
            # Isolation Forest（簡易版）
            from sklearn.ensemble import IsolationForest
            
            iso_forest = IsolationForest(contamination=0.1, random_state=42)
            outlier_labels = iso_forest.fit_predict(values.reshape(-1, 1))
            
            for i, (value, label) in enumerate(zip(values, outlier_labels)):
                if label == -1:  # 異常値
                    score = iso_forest.decision_function([[value]])[0]
                    anomalies.append({
                        "index": i,
                        "value": float(value),
                        "isolation_score": float(score),
                        "severity": "high" if score < -0.1 else "medium"
                    })
                else:
                    normal_indices.append(i)
        
        # 統計サマリー
        normal_values = values[normal_indices] if normal_indices else values
        statistics = {
            "total_points": len(values),
            "anomaly_count": len(anomalies),
            "anomaly_percentage": round(len(anomalies) / len(values) * 100, 2),
            "normal_stats": {
                "mean": float(np.mean(normal_values)),
                "std": float(np.std(normal_values)),
                "min": float(np.min(normal_values)),
                "max": float(np.max(normal_values))
            } if len(normal_values) > 0 else None
        }
        
        # 異常値の分析
        if anomalies:
            anomaly_values = [a["value"] for a in anomalies]
            anomaly_analysis = {
                "mean_anomaly_value": float(np.mean(anomaly_values)),
                "max_anomaly_value": float(np.max(anomaly_values)),
                "min_anomaly_value": float(np.min(anomaly_values)),
                "anomaly_distribution": {
                    "high_severity": len([a for a in anomalies if a.get("severity") == "high"]),
                    "medium_severity": len([a for a in anomalies if a.get("severity") == "medium"])
                }
            }
        else:
            anomaly_analysis = {"note": "異常値は検出されませんでした"}
        
        # 時系列での異常値パターン
        if len(anomalies) > 1:
            anomaly_indices = [a["index"] for a in anomalies]
            consecutive_groups = []
            current_group = [anomaly_indices[0]]
            
            for i in range(1, len(anomaly_indices)):
                if anomaly_indices[i] - anomaly_indices[i-1] == 1:
                    current_group.append(anomaly_indices[i])
                else:
                    if len(current_group) > 1:
                        consecutive_groups.append(current_group)
                    current_group = [anomaly_indices[i]]
            
            if len(current_group) > 1:
                consecutive_groups.append(current_group)
            
            pattern_analysis = {
                "consecutive_anomaly_groups": len(consecutive_groups),
                "largest_consecutive_group": max([len(g) for g in consecutive_groups]) if consecutive_groups else 0
            }
        else:
            pattern_analysis = {"note": "パターン分析には複数の異常値が必要です"}
        
        return {
            "success": True,
            "method": method,
            "threshold": threshold,
            "statistics": statistics,
            "anomalies": anomalies,
            "anomaly_analysis": anomaly_analysis,
            "pattern_analysis": pattern_analysis,
            "recommendations": generate_anomaly_recommendations(anomalies, statistics)
        }
        
    except Exception as e:
        logger.error(f"異常値検出エラー: {e}")
        return {
            "success": False,
            "error": f"異常値検出エラー: {str(e)}"
        }

def generate_anomaly_recommendations(anomalies, statistics):
    """
    異常値検出結果に基づく推奨事項を生成
    """
    recommendations = []
    
    anomaly_percentage = statistics["anomaly_percentage"]
    
    if anomaly_percentage > 20:
        recommendations.append("異常値が20%を超えています。データ収集プロセスやモデルのパラメータを見直してください。")
    elif anomaly_percentage > 10:
        recommendations.append("異常値が10%を超えています。データの品質を確認し、前処理の改善を検討してください。")
    elif anomaly_percentage > 5:
        recommendations.append("異常値が5%を超えています。一部のデータポイントに注意が必要です。")
    else:
        recommendations.append("異常値の割合は正常範囲内です。")
    
    if len(anomalies) > 0:
        high_severity = len([a for a in anomalies if a.get("severity") == "high"])
        if high_severity > 0:
            recommendations.append(f"高重要度の異常値が{high_severity}個検出されました。詳細な調査が推奨されます。")
    
    return recommendations

def main():
    parser = argparse.ArgumentParser(description='機械学習分析ツール - OneAgent Python連携')
    parser.add_argument('--function', required=True,
                        choices=['predict', 'cluster', 'timeseries', 'anomaly'],
                        help='実行する分析タイプ')
    parser.add_argument('--data', required=True, help='JSON形式のデータ')
    parser.add_argument('--target_column', help='予測対象の列名')
    parser.add_argument('--date_column', help='日付列名（時系列分析用）')
    parser.add_argument('--value_column', help='値列名（時系列分析用）')
    parser.add_argument('--n_clusters', type=int, help='クラスター数')
    parser.add_argument('--algorithm', default='kmeans', choices=['kmeans', 'dbscan'],
                        help='クラスタリングアルゴリズム')
    parser.add_argument('--method', default='zscore', choices=['zscore', 'iqr', 'isolation'],
                        help='異常値検出手法')
    parser.add_argument('--threshold', type=float, default=2.5, help='異常値検出閾値')
    parser.add_argument('--forecast_periods', type=int, default=5, help='予測期間数')
    
    args = parser.parse_args()
    
    try:
        # JSONデータの解析
        data = json.loads(args.data)
        
        result = None
        
        if args.function == 'predict':
            result = linear_regression_analysis(data, args.target_column)
        elif args.function == 'cluster':
            result = clustering_analysis(data, args.n_clusters, args.algorithm)
        elif args.function == 'timeseries':
            result = time_series_analysis(data, args.date_column, args.value_column, args.forecast_periods)
        elif args.function == 'anomaly':
            result = anomaly_detection(data, args.method, args.threshold)
        
        # 実行時刻を追加
        result["timestamp"] = datetime.now().isoformat()
        result["analysis_function"] = args.function
        
        print(json.dumps(result, ensure_ascii=False, indent=2))
        
    except json.JSONDecodeError as e:
        error_result = {
            "success": False,
            "error": f"JSONデータの解析エラー: {str(e)}",
            "timestamp": datetime.now().isoformat()
        }
        print(json.dumps(error_result, ensure_ascii=False, indent=2))
    except Exception as e:
        error_result = {
            "success": False,
            "error": f"実行エラー: {str(e)}",
            "timestamp": datetime.now().isoformat()
        }
        print(json.dumps(error_result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()