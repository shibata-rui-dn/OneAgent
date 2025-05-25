/**
 * Python HTTP API呼び出し用ハンドラー - OneAgent Python連携
 * 
 * FastAPIサーバーが http://localhost:8001 で動作している前提
 * 各種Python機能をHTTP API経由で呼び出します
 */

const API_BASE_URL = process.env.PYTHON_API_URL || 'http://localhost:8001';

/**
 * HTTP APIを呼び出すヘルパー関数
 */
async function callPythonAPI(endpoint, data, timeout = 60000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`🌐 Python API呼び出し: ${API_BASE_URL}${endpoint}`);
    console.log(`📤 送信データ:`, JSON.stringify(data, null, 2));

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'OneAgent-PythonIntegration/1.0'
      },
      body: JSON.stringify(data),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText}\n詳細: ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Python API呼び出しでエラーが発生しました');
    }

    console.log(`✅ API呼び出し成功`);
    return result.data;

  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error(`API呼び出しがタイムアウトしました（${timeout}ms）`);
    }
    
    if (error.code === 'ECONNREFUSED' || error.message.includes('fetch')) {
      throw new Error(`Python APIサーバーに接続できません（${API_BASE_URL}）。サーバーが起動しているか確認してください。\n\n起動方法:\ncd python-integration\nuvicorn examples.fastapi_server:app --host 0.0.0.0 --port 8001`);
    }
    
    throw error;
  }
}

/**
 * APIサーバーのヘルスチェック
 */
async function checkAPIHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      timeout: 5000
    });
    
    if (response.ok) {
      const health = await response.json();
      return {
        available: true,
        status: health.status,
        dependencies: health.dependencies
      };
    } else {
      return { available: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    return { available: false, error: error.message };
  }
}

// ======================
// 天気情報ツール群
// ======================

/**
 * 天気情報取得ツール（HTTP API版）
 */
export async function weatherAPIChecker(args) {
  const { city, api_key, country_code } = args;
  
  if (typeof city !== 'string' || !city.trim()) {
    throw new Error("cityは必須の文字列です");
  }
  
  try {
    const requestData = {
      city: city.trim(),
      api_key: api_key || null,
      country_code: country_code || null
    };
    
    const result = await callPythonAPI('/weather', requestData);
    
    let responseText = `🌤️ ${result.city}の天気情報\n`;
    responseText += `📍 国: ${result.country}\n`;
    responseText += `☁️ 天気: ${result.weather}\n`;
    responseText += `🌡️ 気温: ${result.temperature}°C (体感: ${result.feels_like}°C)\n`;
    responseText += `💧 湿度: ${result.humidity}%\n`;
    responseText += `🔽 気圧: ${result.pressure}hPa\n`;
    responseText += `👁️ 視界: ${result.visibility}km\n`;
    responseText += `💨 風速: ${result.wind_speed}m/s (${result.wind_direction}°)\n`;
    responseText += `☁️ 雲量: ${result.cloudiness}%\n`;
    responseText += `🌅 日の出: ${result.sunrise} / 🌇 日の入り: ${result.sunset}\n`;
    responseText += `\n📊 データソース: ${result.source}`;
    
    return {
      content: [
        {
          type: "text",
          text: responseText
        }
      ]
    };
    
  } catch (error) {
    console.error(`天気情報取得エラー: ${error.message}`);
    throw new Error(`天気情報取得エラー: ${error.message}`);
  }
}

/**
 * 天気予報取得ツール（HTTP API版）
 */
export async function weatherForecastAPI(args) {
  const { city, api_key, days = 5 } = args;
  
  if (typeof city !== 'string' || !city.trim()) {
    throw new Error("cityは必須の文字列です");
  }
  
  try {
    const requestData = {
      city: city.trim(),
      api_key: api_key || null
    };
    
    const result = await callPythonAPI('/weather/forecast', requestData);
    
    let responseText = `📅 ${result.city}の${result.forecast_days}日間天気予報\n\n`;
    
    result.forecasts.forEach((forecast, index) => {
      responseText += `📆 ${forecast.date}\n`;
      responseText += `  ☁️ 天気: ${forecast.weather}\n`;
      responseText += `  🌡️ 気温: ${forecast.temperature_min}°C〜${forecast.temperature_max}°C\n`;
      responseText += `  💧 湿度: ${forecast.humidity}%\n`;
      responseText += `  💨 風速: ${forecast.wind_speed}m/s\n`;
      responseText += `  ☁️ 雲量: ${forecast.cloudiness}%\n\n`;
    });
    
    responseText += `📊 データソース: ${result.source}`;
    
    return {
      content: [
        {
          type: "text",
          text: responseText
        }
      ]
    };
    
  } catch (error) {
    throw new Error(`天気予報取得エラー: ${error.message}`);
  }
}

// ======================
// テキスト分析ツール群
// ======================

/**
 * テキスト感情分析ツール（HTTP API版）
 */
export async function textSentimentAPI(args) {
  const { text, analysis_type = "sentiment" } = args;
  
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error("textは必須の文字列です");
  }
  
  try {
    const requestData = {
      text: text.trim(),
      analysis_type: analysis_type
    };
    
    const result = await callPythonAPI('/text/sentiment', requestData);
    
    let emoji = "😐";
    if (result.sentiment === "ポジティブ") emoji = "😊";
    else if (result.sentiment === "ネガティブ") emoji = "😢";
    
    const responseText = `${emoji} テキスト感情分析結果\n\n` +
                        `📝 分析テキスト: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"\n` +
                        `🎭 感情: ${result.sentiment}\n` +
                        `📊 信頼度: ${result.confidence}\n` +
                        `📈 極性値: ${result.polarity}\n` +
                        `📏 テキスト長: ${result.text_length}文字 (${result.word_count}単語)\n` +
                        `🟢 ポジティブワード: ${result.positive_word_count}個\n` +
                        `🔴 ネガティブワード: ${result.negative_word_count}個`;
    
    return {
      content: [
        {
          type: "text",
          text: responseText
        }
      ]
    };
    
  } catch (error) {
    throw new Error(`感情分析エラー: ${error.message}`);
  }
}

/**
 * テキストキーワード抽出ツール（HTTP API版）
 */
export async function textKeywordsAPI(args) {
  const { text, max_keywords = 10 } = args;
  
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error("textは必須の文字列です");
  }
  
  try {
    const requestData = {
      text: text.trim(),
      analysis_type: "keywords",
      max_keywords: max_keywords
    };
    
    const result = await callPythonAPI('/text/keywords', requestData);
    
    let responseText = `🔍 キーワード抽出結果\n\n`;
    responseText += `📝 分析テキスト: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"\n`;
    responseText += `📊 総単語数: ${result.total_words}\n`;
    responseText += `✨ ユニーク単語数: ${result.unique_words}\n\n`;
    
    responseText += `🏆 トップキーワード:\n`;
    result.top_keywords.forEach((keyword, index) => {
      const percentage = (keyword.frequency * 100).toFixed(1);
      responseText += `${index + 1}. ${keyword.word} (${keyword.count}回, ${percentage}%)\n`;
    });
    
    return {
      content: [
        {
          type: "text",
          text: responseText
        }
      ]
    };
    
  } catch (error) {
    throw new Error(`キーワード抽出エラー: ${error.message}`);
  }
}

/**
 * テキスト要約ツール（HTTP API版）
 */
export async function textSummaryAPI(args) {
  const { text, sentence_count = 3 } = args;
  
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error("textは必須の文字列です");
  }
  
  try {
    const requestData = {
      text: text.trim(),
      analysis_type: "summary",
      sentence_count: sentence_count
    };
    
    const result = await callPythonAPI('/text/summary', requestData);
    
    const responseText = `📋 テキスト要約結果\n\n` +
                        `📊 元の文章数: ${result.original_sentences}\n` +
                        `📝 要約文章数: ${result.summary_sentences}\n` +
                        `📉 圧縮率: ${(result.compression_ratio * 100).toFixed(1)}%\n\n` +
                        `📄 要約結果:\n${result.summary}`;
    
    return {
      content: [
        {
          type: "text",
          text: responseText
        }
      ]
    };
    
  } catch (error) {
    throw new Error(`テキスト要約エラー: ${error.message}`);
  }
}

/**
 * バッチ感情分析ツール（HTTP API版）
 */
export async function batchSentimentAPI(args) {
  const { texts } = args;
  
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error("textsは必須の文字列配列です");
  }
  
  try {
    const result = await callPythonAPI('/batch/text/sentiment', texts);
    
    let responseText = `📊 バッチ感情分析結果\n\n`;
    responseText += `📋 総テキスト数: ${result.summary.total_texts}\n`;
    responseText += `✅ 成功分析数: ${result.summary.successful_analyses}\n`;
    
    if (result.summary.sentiment_distribution) {
      responseText += `📈 感情分布:\n`;
      Object.entries(result.summary.sentiment_distribution).forEach(([sentiment, count]) => {
        responseText += `  ${sentiment}: ${count}件\n`;
      });
      responseText += `📊 平均信頼度: ${result.summary.average_confidence}\n\n`;
    }
    
    responseText += `📝 詳細結果:\n`;
    result.detailed_results.slice(0, 10).forEach((item, index) => {
      if (item.analysis) {
        responseText += `${index + 1}. "${item.text}" → ${item.analysis.sentiment} (${item.analysis.confidence})\n`;
      } else {
        responseText += `${index + 1}. "${item.text}" → エラー: ${item.error}\n`;
      }
    });
    
    if (result.detailed_results.length > 10) {
      responseText += `... 他${result.detailed_results.length - 10}件`;
    }
    
    return {
      content: [
        {
          type: "text",
          text: responseText
        }
      ]
    };
    
  } catch (error) {
    throw new Error(`バッチ感情分析エラー: ${error.message}`);
  }
}

// ======================
// 機械学習ツール群
// ======================

/**
 * 機械学習予測ツール（HTTP API版）
 */
export async function mlPredictAPI(args) {
  const { data, target_column, function: mlFunction = "predict" } = args;
  
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("dataは必須の配列です");
  }
  
  try {
    const requestData = {
      data: data,
      target_column: target_column || null,
      function: mlFunction
    };
    
    const result = await callPythonAPI('/ml/predict', requestData);
    
    let responseText = `🤖 機械学習予測結果\n\n`;
    responseText += `📊 モデル: ${result.model_type}\n`;
    responseText += `📋 データ数: ${result.data_points}\n`;
    responseText += `🔢 特徴量: ${result.features.join(', ')}\n`;
    responseText += `📈 R²スコア: ${result.r2_score.toFixed(3)}\n`;
    responseText += `📉 平均二乗誤差: ${result.mse.toFixed(3)}\n`;
    responseText += `🔮 次回予測値: ${result.next_prediction.toFixed(3)}\n\n`;
    
    responseText += `📐 モデルパラメータ:\n`;
    responseText += `  切片: ${result.intercept.toFixed(3)}\n`;
    responseText += `  係数: [${result.coefficients.map(c => c.toFixed(3)).join(', ')}]\n\n`;
    
    if (result.predictions.length > 0) {
      responseText += `🎯 予測値サンプル: [${result.predictions.slice(0, 5).map(p => p.toFixed(2)).join(', ')}...]`;
    }
    
    return {
      content: [
        {
          type: "text",
          text: responseText
        }
      ]
    };
    
  } catch (error) {
    throw new Error(`機械学習予測エラー: ${error.message}`);
  }
}

/**
 * クラスタリング分析ツール（HTTP API版）
 */
export async function mlClusterAPI(args) {
  const { data, n_clusters = 3, algorithm = "kmeans" } = args;
  
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("dataは必須の配列です");
  }
  
  try {
    const requestData = {
      data: data,
      function: "cluster",
      n_clusters: n_clusters,
      algorithm: algorithm
    };
    
    const result = await callPythonAPI('/ml/cluster', requestData);
    
    let responseText = `🎯 クラスタリング分析結果\n\n`;
    responseText += `🤖 アルゴリズム: ${result.algorithm}\n`;
    responseText += `📊 クラスター数: ${result.n_clusters}\n`;
    responseText += `📋 データ数: ${result.data_points}\n`;
    responseText += `🔢 特徴量: ${result.features.join(', ')}\n`;
    responseText += `📈 慣性: ${result.inertia.toFixed(3)}\n\n`;
    
    responseText += `📊 クラスター統計:\n`;
    Object.entries(result.cluster_statistics).forEach(([cluster, stats]) => {
      responseText += `${cluster}: ${stats.size}件 (${stats.percentage.toFixed(1)}%)\n`;
      responseText += `  平均値: {${Object.entries(stats.mean_values).map(([key, val]) => `${key}: ${val.toFixed(2)}`).join(', ')}}\n`;
    });
    
    return {
      content: [
        {
          type: "text",
          text: responseText
        }
      ]
    };
    
  } catch (error) {
    throw new Error(`クラスタリング分析エラー: ${error.message}`);
  }
}

// ======================
// 画像処理ツール群
// ======================

/**
 * 画像分析ツール（HTTP API版）
 */
export async function imageAnalyzeAPI(args) {
  const { image_data } = args;
  
  if (typeof image_data !== 'string' || !image_data.trim()) {
    throw new Error("image_dataは必須のBase64文字列です");
  }
  
  try {
    const requestData = {
      image_data: image_data.trim(),
      function: "analyze"
    };
    
    const result = await callPythonAPI('/image/analyze', requestData);
    
    let responseText = `🖼️ 画像分析結果\n\n`;
    responseText += `📏 サイズ: ${result.dimensions.width} x ${result.dimensions.height}\n`;
    responseText += `📊 総ピクセル数: ${result.total_pixels.toLocaleString()}\n`;
    responseText += `📺 解像度品質: ${result.resolution_quality}\n`;
    responseText += `📐 アスペクト比: ${result.aspect_ratio}\n`;
    responseText += `🎨 カラーモード: ${result.image_mode}\n`;
    responseText += `✨ 透明度: ${result.has_transparency ? 'あり' : 'なし'}\n\n`;
    
    responseText += `🌈 色彩分析:\n`;
    responseText += `  平均RGB: [${result.color_analysis.mean_rgb.join(', ')}]\n`;
    responseText += `  中央値RGB: [${result.color_analysis.median_rgb.join(', ')}]\n`;
    responseText += `  標準偏差RGB: [${result.color_analysis.stddev_rgb.join(', ')}]`;
    
    return {
      content: [
        {
          type: "text",
          text: responseText
        }
      ]
    };
    
  } catch (error) {
    throw new Error(`画像分析エラー: ${error.message}`);
  }
}

/**
 * 画像リサイズツール（HTTP API版）
 */
export async function imageResizeAPI(args) {
  const { image_data, width, height } = args;
  
  if (typeof image_data !== 'string' || !image_data.trim()) {
    throw new Error("image_dataは必須のBase64文字列です");
  }
  
  if (!width && !height) {
    throw new Error("widthまたはheightの少なくとも一方は必須です");
  }
  
  try {
    const requestData = {
      image_data: image_data.trim(),
      function: "resize",
      width: width || null,
      height: height || null
    };
    
    const result = await callPythonAPI('/image/resize', requestData);
    
    const responseText = `🖼️ 画像リサイズ完了\n\n` +
                        `📏 元のサイズ: ${result.original_size.width} x ${result.original_size.height}\n` +
                        `📏 新しいサイズ: ${result.new_size.width} x ${result.new_size.height}\n` +
                        `✅ リサイズされた画像をBase64形式で出力しました`;
    
    return {
      content: [
        {
          type: "text",
          text: responseText
        },
        {
          type: "text",
          text: `Base64画像データ:\ndata:image/jpeg;base64,${result.resized_image}`
        }
      ]
    };
    
  } catch (error) {
    throw new Error(`画像リサイズエラー: ${error.message}`);
  }
}

// ======================
// ユーティリティ関数
// ======================

/**
 * APIサーバー接続テスト
 */
export async function testAPIConnection(args) {
  try {
    const health = await checkAPIHealth();
    
    let responseText = `🔗 Python APIサーバー接続テスト\n\n`;
    responseText += `📡 サーバーURL: ${API_BASE_URL}\n`;
    responseText += `✅ 接続状況: ${health.available ? '成功' : '失敗'}\n`;
    
    if (health.available) {
      responseText += `📊 ステータス: ${health.status}\n\n`;
      responseText += `🔧 依存関係:\n`;
      Object.entries(health.dependencies).forEach(([dep, available]) => {
        responseText += `  ${dep}: ${available ? '✅' : '❌'}\n`;
      });
    } else {
      responseText += `❌ エラー: ${health.error}\n\n`;
      responseText += `💡 解決方法:\n`;
      responseText += `1. Python APIサーバーを起動してください:\n`;
      responseText += `   cd python-integration\n`;
      responseText += `   uvicorn examples.fastapi_server:app --host 0.0.0.0 --port 8001\n\n`;
      responseText += `2. 必要な依存関係をインストールしてください:\n`;
      responseText += `   pip install fastapi uvicorn numpy pandas scikit-learn pillow`;
    }
    
    return {
      content: [
        {
          type: "text",
          text: responseText
        }
      ]
    };
    
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `❌ 接続テストエラー: ${error.message}`
        }
      ]
    };
  }
}

// デフォルトエクスポート（最も一般的な機能）
export default weatherAPIChecker;