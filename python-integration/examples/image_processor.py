#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
画像処理ツール - OneAgent Python連携サンプル

機能:
- 画像のリサイズ・回転・反転
- フィルター適用（ぼかし、シャープ、エッジ検出）
- 画像フォーマット変換
- メタデータ抽出
- 色彩分析・ヒストグラム
- 画像品質評価

使用方法:
python3 image_processor.py --function resize --input image.jpg --width 300 --height 200
python3 image_processor.py --function filter --input image.jpg --filter blur --intensity 2
python3 image_processor.py --function analyze --input image.jpg
python3 image_processor.py --function convert --input image.jpg --format png
"""

import json
import argparse
import os
import sys
from datetime import datetime
import logging
import base64
from io import BytesIO

# 画像処理ライブラリ
try:
    from PIL import Image, ImageFilter, ImageEnhance, ImageStat, ExifTags
    from PIL.ExifTags import TAGS
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_dependencies():
    """
    必要な依存関係をチェック
    """
    if not PIL_AVAILABLE:
        raise ImportError("PIL (Pillow) が必要です: pip install Pillow")
    
    return {
        "PIL": PIL_AVAILABLE,
        "OpenCV": CV2_AVAILABLE
    }

def load_image(image_path):
    """
    画像を読み込む
    """
    try:
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"画像ファイルが見つかりません: {image_path}")
        
        image = Image.open(image_path)
        
        # RGBA画像をRGBに変換（必要に応じて）
        if image.mode == 'RGBA':
            background = Image.new('RGB', image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[-1])
            image = background
        elif image.mode not in ['RGB', 'L']:
            image = image.convert('RGB')
        
        return image
        
    except Exception as e:
        raise Exception(f"画像読み込みエラー: {str(e)}")

def save_image(image, output_path, format=None, quality=95):
    """
    画像を保存する
    """
    try:
        if format:
            format = format.upper()
            if format == 'JPG':
                format = 'JPEG'
        else:
            # 拡張子から判定
            ext = os.path.splitext(output_path)[1].lower()
            format_map = {
                '.jpg': 'JPEG',
                '.jpeg': 'JPEG',
                '.png': 'PNG',
                '.bmp': 'BMP',
                '.tiff': 'TIFF',
                '.webp': 'WEBP'
            }
            format = format_map.get(ext, 'JPEG')
        
        save_kwargs = {}
        if format == 'JPEG':
            save_kwargs['quality'] = quality
            save_kwargs['optimize'] = True
        elif format == 'PNG':
            save_kwargs['optimize'] = True
        
        image.save(output_path, format=format, **save_kwargs)
        
        return {
            "success": True,
            "output_path": output_path,
            "format": format,
            "file_size": os.path.getsize(output_path)
        }
        
    except Exception as e:
        raise Exception(f"画像保存エラー: {str(e)}")

def resize_image(image_path, width=None, height=None, maintain_aspect=True, output_path=None):
    """
    画像のリサイズ
    """
    try:
        logger.info(f"画像リサイズ: {image_path}")
        
        image = load_image(image_path)
        original_size = image.size
        
        if width is None and height is None:
            raise ValueError("幅または高さの少なくとも一方を指定してください")
        
        if maintain_aspect:
            # アスペクト比を維持してリサイズ
            if width and height:
                # 両方指定されている場合、小さい方に合わせる
                ratio = min(width / original_size[0], height / original_size[1])
            elif width:
                ratio = width / original_size[0]
            else:
                ratio = height / original_size[1]
            
            new_width = int(original_size[0] * ratio)
            new_height = int(original_size[1] * ratio)
        else:
            # アスペクト比を無視してリサイズ
            new_width = width or original_size[0]
            new_height = height or original_size[1]
        
        resized_image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # 出力パスの生成
        if not output_path:
            name, ext = os.path.splitext(image_path)
            output_path = f"{name}_resized_{new_width}x{new_height}{ext}"
        
        save_result = save_image(resized_image, output_path)
        
        return {
            "success": True,
            "function": "resize",
            "original_size": {"width": original_size[0], "height": original_size[1]},
            "new_size": {"width": new_width, "height": new_height},
            "aspect_ratio_maintained": maintain_aspect,
            "compression_ratio": round((save_result["file_size"] / os.path.getsize(image_path)), 3),
            **save_result
        }
        
    except Exception as e:
        logger.error(f"リサイズエラー: {e}")
        return {
            "success": False,
            "error": f"リサイズエラー: {str(e)}"
        }

def apply_filter(image_path, filter_type, intensity=1.0, output_path=None):
    """
    画像フィルターの適用
    """
    try:
        logger.info(f"フィルター適用: {filter_type}")
        
        image = load_image(image_path)
        filtered_image = None
        filter_info = {"type": filter_type, "intensity": intensity}
        
        if filter_type == 'blur':
            # ぼかしフィルター
            filtered_image = image.filter(ImageFilter.GaussianBlur(radius=intensity))
            
        elif filter_type == 'sharpen':
            # シャープフィルター
            enhancer = ImageEnhance.Sharpness(image)
            filtered_image = enhancer.enhance(1 + intensity)
            
        elif filter_type == 'edge':
            # エッジ検出
            if CV2_AVAILABLE:
                # OpenCVを使用したより高度なエッジ検出
                cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
                gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
                edges = cv2.Canny(gray, int(50 * intensity), int(150 * intensity))
                filtered_image = Image.fromarray(cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB))
            else:
                # PILを使用した基本的なエッジ検出
                filtered_image = image.filter(ImageFilter.FIND_EDGES)
                
        elif filter_type == 'emboss':
            # エンボスフィルター
            filtered_image = image.filter(ImageFilter.EMBOSS)
            
        elif filter_type == 'smooth':
            # スムージングフィルター
            filtered_image = image.filter(ImageFilter.SMOOTH_MORE)
            
        elif filter_type == 'contrast':
            # コントラスト調整
            enhancer = ImageEnhance.Contrast(image)
            filtered_image = enhancer.enhance(intensity)
            
        elif filter_type == 'brightness':
            # 明度調整
            enhancer = ImageEnhance.Brightness(image)
            filtered_image = enhancer.enhance(intensity)
            
        elif filter_type == 'color':
            # 彩度調整
            enhancer = ImageEnhance.Color(image)
            filtered_image = enhancer.enhance(intensity)
            
        else:
            raise ValueError(f"未対応のフィルタータイプ: {filter_type}")
        
        # 出力パスの生成
        if not output_path:
            name, ext = os.path.splitext(image_path)
            output_path = f"{name}_{filter_type}{ext}"
        
        save_result = save_image(filtered_image, output_path)
        
        return {
            "success": True,
            "function": "filter",
            "filter_info": filter_info,
            "opencv_used": CV2_AVAILABLE and filter_type == 'edge',
            **save_result
        }
        
    except Exception as e:
        logger.error(f"フィルター適用エラー: {e}")
        return {
            "success": False,
            "error": f"フィルター適用エラー: {str(e)}"
        }

def analyze_image(image_path):
    """
    画像の詳細分析
    """
    try:
        logger.info(f"画像分析: {image_path}")
        
        image = load_image(image_path)
        
        # 基本情報
        basic_info = {
            "filename": os.path.basename(image_path),
            "file_size": os.path.getsize(image_path),
            "dimensions": {"width": image.size[0], "height": image.size[1]},
            "format": image.format,
            "mode": image.mode,
            "has_transparency": image.mode in ['RGBA', 'LA'] or 'transparency' in image.info
        }
        
        # メタデータ（EXIF）の抽出
        metadata = {}
        try:
            exif_data = image._getexif()
            if exif_data:
                for tag_id, value in exif_data.items():
                    tag = TAGS.get(tag_id, tag_id)
                    if isinstance(tag, str):
                        metadata[tag] = str(value)
        except:
            metadata = {"note": "EXIFデータなし"}
        
        # 色彩分析
        color_analysis = {}
        if image.mode == 'RGB':
            # RGB画像の色彩統計
            stat = ImageStat.Stat(image)
            color_analysis = {
                "mean_rgb": [round(x, 2) for x in stat.mean],
                "median_rgb": [round(x, 2) for x in stat.median],
                "stddev_rgb": [round(x, 2) for x in stat.stddev],
                "dominant_color": get_dominant_color(image),
                "color_palette": get_color_palette(image)
            }
        
        # ヒストグラム分析
        histogram_data = {}
        if image.mode == 'RGB':
            histogram_data = calculate_histogram(image)
        
        # 画像品質評価
        quality_metrics = evaluate_image_quality(image)
        
        # OpenCVを使用した追加分析
        opencv_analysis = {}
        if CV2_AVAILABLE:
            opencv_analysis = analyze_with_opencv(image_path)
        
        return {
            "success": True,
            "function": "analyze",
            "basic_info": basic_info,
            "metadata": metadata,
            "color_analysis": color_analysis,
            "histogram": histogram_data,
            "quality_metrics": quality_metrics,
            "opencv_analysis": opencv_analysis if opencv_analysis else {"note": "OpenCV未使用"}
        }
        
    except Exception as e:
        logger.error(f"画像分析エラー: {e}")
        return {
            "success": False,
            "error": f"画像分析エラー: {str(e)}"
        }

def get_dominant_color(image, k=5):
    """
    画像の主要色を抽出
    """
    try:
        # 画像をリサイズしてパフォーマンス向上
        small_image = image.resize((150, 150))
        
        # K-meansクラスタリングで主要色を抽出
        data = np.array(small_image)
        data = data.reshape((-1, 3))
        
        if CV2_AVAILABLE:
            # OpenCVを使用したK-means
            criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2)
            _, labels, centers = cv2.kmeans(data.astype(np.float32), k, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)
            
            # 各クラスターのサイズを計算
            unique, counts = np.unique(labels, return_counts=True)
            dominant_color = centers[counts.argmax()]
            
            return {
                "rgb": [int(x) for x in dominant_color],
                "hex": "#{:02x}{:02x}{:02x}".format(int(dominant_color[0]), int(dominant_color[1]), int(dominant_color[2]))
            }
        else:
            # シンプルな平均色計算
            avg_color = data.mean(axis=0)
            return {
                "rgb": [int(x) for x in avg_color],
                "hex": "#{:02x}{:02x}{:02x}".format(int(avg_color[0]), int(avg_color[1]), int(avg_color[2]))
            }
    except:
        return {"note": "主要色抽出に失敗"}

def get_color_palette(image, colors=5):
    """
    画像のカラーパレットを生成
    """
    try:
        # 画像をリサイズ
        small_image = image.resize((150, 150))
        
        # 色数を減らしてパレット生成
        paletted = small_image.quantize(colors=colors)
        palette = paletted.getpalette()
        
        # RGB値のリストに変換
        color_palette = []
        for i in range(colors):
            r = palette[i * 3]
            g = palette[i * 3 + 1]
            b = palette[i * 3 + 2]
            color_palette.append({
                "rgb": [r, g, b],
                "hex": "#{:02x}{:02x}{:02x}".format(r, g, b)
            })
        
        return color_palette
    except:
        return []

def calculate_histogram(image):
    """
    RGBヒストグラムを計算
    """
    try:
        histogram = {
            "red": image.histogram()[0:256],
            "green": image.histogram()[256:512],
            "blue": image.histogram()[512:768]
        }
        
        # 統計情報を追加
        for color in ['red', 'green', 'blue']:
            hist = histogram[color]
            total_pixels = sum(hist)
            if total_pixels > 0:
                # ピーク値（最頻値）
                peak_value = hist.index(max(hist))
                histogram[f"{color}_peak"] = peak_value
                histogram[f"{color}_peak_percentage"] = round(max(hist) / total_pixels * 100, 2)
        
        return histogram
    except:
        return {"note": "ヒストグラム計算に失敗"}

def evaluate_image_quality(image):
    """
    画像品質の評価
    """
    try:
        metrics = {}
        
        # 解像度による品質評価
        width, height = image.size
        total_pixels = width * height
        
        if total_pixels >= 2073600:  # 1920x1080以上
            resolution_quality = "高解像度"
        elif total_pixels >= 921600:  # 1280x720以上
            resolution_quality = "中解像度"
        else:
            resolution_quality = "低解像度"
        
        metrics["resolution_quality"] = resolution_quality
        metrics["total_pixels"] = total_pixels
        
        # アスペクト比
        aspect_ratio = round(width / height, 2)
        metrics["aspect_ratio"] = aspect_ratio
        
        # 一般的なアスペクト比の判定
        common_ratios = {
            1.33: "4:3",
            1.78: "16:9",
            1.6: "16:10",
            1.0: "1:1",
            0.75: "3:4"
        }
        
        closest_ratio = min(common_ratios.keys(), key=lambda x: abs(x - aspect_ratio))
        if abs(closest_ratio - aspect_ratio) < 0.1:
            metrics["standard_ratio"] = common_ratios[closest_ratio]
        else:
            metrics["standard_ratio"] = "カスタム"
        
        # 色彩の豊富さ
        if image.mode == 'RGB':
            # ユニークな色数を概算
            small_image = image.resize((100, 100))
            colors = small_image.convert('RGB').getcolors(maxcolors=10000)
            unique_colors = len(colors) if colors else 0
            
            if unique_colors > 5000:
                color_richness = "豊富"
            elif unique_colors > 1000:
                color_richness = "中程度"
            else:
                color_richness = "少ない"
            
            metrics["color_richness"] = color_richness
            metrics["unique_colors_estimated"] = unique_colors
        
        return metrics
    except:
        return {"note": "品質評価に失敗"}

def analyze_with_opencv(image_path):
    """
    OpenCVを使用した追加分析
    """
    try:
        # 画像読み込み
        cv_image = cv2.imread(image_path)
        if cv_image is None:
            return {"error": "OpenCVで画像を読み込めませんでした"}
        
        # グレースケール変換
        gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
        
        # 画像のシャープネス評価（ラプラシアン分散）
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        
        if laplacian_var > 500:
            sharpness = "鮮明"
        elif laplacian_var > 100:
            sharpness = "普通"
        else:
            sharpness = "ぼやけている"
        
        # エッジの数を概算
        edges = cv2.Canny(gray, 50, 150)
        edge_count = np.sum(edges > 0)
        edge_density = edge_count / (edges.shape[0] * edges.shape[1])
        
        # コーナー検出
        corners = cv2.goodFeaturesToTrack(gray, maxCorners=100, qualityLevel=0.01, minDistance=10)
        corner_count = len(corners) if corners is not None else 0
        
        return {
            "sharpness": {
                "laplacian_variance": round(laplacian_var, 2),
                "assessment": sharpness
            },
            "edge_analysis": {
                "edge_count": int(edge_count),
                "edge_density": round(edge_density, 4),
                "complexity": "高" if edge_density > 0.1 else "中" if edge_density > 0.05 else "低"
            },
            "corner_count": corner_count,
            "opencv_version": cv2.__version__
        }
    except Exception as e:
        return {"error": f"OpenCV分析エラー: {str(e)}"}

def convert_format(image_path, target_format, output_path=None, quality=95):
    """
    画像フォーマット変換
    """
    try:
        logger.info(f"フォーマット変換: {target_format}")
        
        image = load_image(image_path)
        
        # 出力パスの生成
        if not output_path:
            name = os.path.splitext(image_path)[0]
            ext_map = {
                'JPEG': '.jpg',
                'PNG': '.png',
                'BMP': '.bmp',
                'TIFF': '.tiff',
                'WEBP': '.webp'
            }
            output_path = f"{name}{ext_map.get(target_format.upper(), '.jpg')}"
        
        # 特定フォーマットの処理
        if target_format.upper() == 'JPEG' and image.mode == 'RGBA':
            # JPEGは透明度をサポートしないため、白背景で合成
            background = Image.new('RGB', image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[-1])
            image = background
        
        save_result = save_image(image, output_path, target_format, quality)
        
        # 変換前後のファイルサイズ比較
        original_size = os.path.getsize(image_path)
        size_change = ((save_result["file_size"] - original_size) / original_size) * 100
        
        return {
            "success": True,
            "function": "convert",
            "original_format": Image.open(image_path).format,
            "target_format": target_format.upper(),
            "original_file_size": original_size,
            "size_change_percentage": round(size_change, 2),
            "quality": quality,
            **save_result
        }
        
    except Exception as e:
        logger.error(f"フォーマット変換エラー: {e}")
        return {
            "success": False,
            "error": f"フォーマット変換エラー: {str(e)}"
        }

def main():
    parser = argparse.ArgumentParser(description='画像処理ツール - OneAgent Python連携')
    parser.add_argument('--function', required=True,
                        choices=['resize', 'filter', 'analyze', 'convert'],
                        help='実行する処理タイプ')
    parser.add_argument('--input', required=True, help='入力画像ファイルパス')
    parser.add_argument('--output', help='出力ファイルパス')
    
    # リサイズ用パラメータ
    parser.add_argument('--width', type=int, help='リサイズ後の幅')
    parser.add_argument('--height', type=int, help='リサイズ後の高さ')
    parser.add_argument('--maintain_aspect', type=bool, default=True, help='アスペクト比を維持')
    
    # フィルター用パラメータ
    parser.add_argument('--filter', choices=['blur', 'sharpen', 'edge', 'emboss', 'smooth', 'contrast', 'brightness', 'color'],
                        help='適用するフィルタータイプ')
    parser.add_argument('--intensity', type=float, default=1.0, help='フィルター強度')
    
    # 変換用パラメータ
    parser.add_argument('--format', choices=['JPEG', 'PNG', 'BMP', 'TIFF', 'WEBP'],
                        help='変換先フォーマット')
    parser.add_argument('--quality', type=int, default=95, help='JPEG品質 (1-100)')
    
    args = parser.parse_args()
    
    try:
        # 依存関係チェック
        deps = check_dependencies()
        
        result = None
        
        if args.function == 'resize':
            result = resize_image(args.input, args.width, args.height, args.maintain_aspect, args.output)
        elif args.function == 'filter':
            if not args.filter:
                result = {"success": False, "error": "フィルタータイプ（--filter）が必要です"}
            else:
                result = apply_filter(args.input, args.filter, args.intensity, args.output)
        elif args.function == 'analyze':
            result = analyze_image(args.input)
        elif args.function == 'convert':
            if not args.format:
                result = {"success": False, "error": "変換先フォーマット（--format）が必要です"}
            else:
                result = convert_format(args.input, args.format, args.output, args.quality)
        
        # 依存関係情報を追加
        result["dependencies"] = deps
        result["timestamp"] = datetime.now().isoformat()
        
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