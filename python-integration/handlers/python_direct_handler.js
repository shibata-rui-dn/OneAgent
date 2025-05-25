/**
 * Python直接実行ハンドラー - OneAgent Python連携
 * 
 * このハンドラーはPythonスクリプトを直接実行してOneAgentツールとして提供します
 * 各ツールディレクトリにコピーして使用してください
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Pythonスクリプトを実行するヘルパー関数
 * @param {string} scriptPath - Pythonスクリプトのパス
 * @param {string[]} args - 引数の配列
 * @param {number} timeout - タイムアウト時間（ミリ秒）
 * @returns {Promise<Object>} - 実行結果
 */
function executePython(scriptPath, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    console.log(`🐍 Python実行開始: ${scriptPath}`);
    console.log(`📋 引数: ${args.join(' ')}`);
    
    const startTime = Date.now();
    
    // Python実行（python3を優先、なければpython）
    const pythonCommands = ['python3', 'python'];
    let pythonProcess = null;
    let commandIndex = 0;
    
    function tryNextPythonCommand() {
      if (commandIndex >= pythonCommands.length) {
        reject(new Error('Python実行環境が見つかりません。python3またはpythonがインストールされているか確認してください。'));
        return;
      }
      
      const pythonCmd = pythonCommands[commandIndex];
      console.log(`🔄 Pythonコマンド試行: ${pythonCmd}`);
      
      pythonProcess = spawn(pythonCmd, [scriptPath, ...args], {
        cwd: __dirname,
        stdio: 'pipe',
        encoding: 'utf8'
      });
      
      let stdout = '';
      let stderr = '';
      let isResolved = false;

      // タイムアウト設定
      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          console.log(`⏰ Python実行タイムアウト（${timeout}ms）`);
          pythonProcess.kill('SIGTERM');
          reject(new Error(`Python実行がタイムアウトしました（${timeout}ms）`));
          isResolved = true;
        }
      }, timeout);

      // 標準出力の取得
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // エラー出力の取得
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // プロセス終了時の処理
      pythonProcess.on('close', (code) => {
        if (!isResolved) {
          clearTimeout(timeoutId);
          isResolved = true;
          
          const executionTime = Date.now() - startTime;
          console.log(`⏱️ Python実行時間: ${executionTime}ms`);

          if (code === 0) {
            try {
              console.log(`✅ Python実行成功`);
              console.log(`📤 出力サイズ: ${stdout.length} bytes`);
              
              // JSONパース
              const result = JSON.parse(stdout.trim());
              resolve(result);
            } catch (parseError) {
              console.error(`❌ JSON解析エラー: ${parseError.message}`);
              console.error(`📋 Raw出力: ${stdout.substring(0, 500)}...`);
              reject(new Error(`JSON解析エラー: ${parseError.message}\n出力: ${stdout.substring(0, 200)}...`));
            }
          } else {
            console.error(`❌ Python実行エラー (終了コード: ${code})`);
            console.error(`📋 エラー出力: ${stderr}`);
            reject(new Error(`Python実行エラー (終了コード: ${code})\nエラー出力: ${stderr}`));
          }
        }
      });

      // プロセス起動エラー
      pythonProcess.on('error', (error) => {
        if (!isResolved) {
          clearTimeout(timeoutId);
          
          if (error.code === 'ENOENT') {
            // このPythonコマンドが見つからない場合、次を試す
            commandIndex++;
            tryNextPythonCommand();
          } else {
            isResolved = true;
            console.error(`❌ Pythonプロセス起動エラー: ${error.message}`);
            reject(new Error(`Pythonプロセス起動エラー: ${error.message}`));
          }
        }
      });
    }
    
    tryNextPythonCommand();
  });
}

/**
 * 天気情報取得ツール
 */
export async function weatherChecker(args) {
  const { city, api_key, country_code, days } = args;
  
  // 引数の検証
  if (typeof city !== 'string' || !city.trim()) {
    throw new Error("cityは必須の文字列です");
  }
  
  try {
    const scriptPath = path.join(__dirname, 'weather_api.py');
    const pythonArgs = [
      '--function', 'weather',
      '--city', city.trim()
    ];
    
    // オプション引数の追加
    if (api_key && typeof api_key === 'string') {
      pythonArgs.push('--api_key', api_key);
    }
    if (country_code && typeof country_code === 'string') {
      pythonArgs.push('--country_code', country_code);
    }
    
    const result = await executePython(scriptPath, pythonArgs);
    
    if (result.success) {
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
    } else {
      throw new Error(result.error || 'Python実行でエラーが発生しました');
    }
    
  } catch (error) {
    console.error(`天気情報取得エラー: ${error.message}`);
    throw new Error(`天気情報取得エラー: ${error.message}`);
  }
}

/**
 * 天気予報取得ツール
 */
export async function weatherForecast(args) {
  const { city, api_key, days = 5 } = args;
  
  if (typeof city !== 'string' || !city.trim()) {
    throw new Error("cityは必須の文字列です");
  }
  
  try {
    const scriptPath = path.join(__dirname, 'weather_api.py');
    const pythonArgs = [
      '--function', 'forecast',
      '--city', city.trim(),
      '--days', days.toString()
    ];
    
    if (api_key && typeof api_key === 'string') {
      pythonArgs.push('--api_key', api_key);
    }
    
    const result = await executePython(scriptPath, pythonArgs);
    
    if (result.success) {
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
    } else {
      throw new Error(result.error || 'Python実行でエラーが発生しました');
    }
    
  } catch (error) {
    throw new Error(`天気予報取得エラー: ${error.message}`);
  }
}

/**
 * テキスト感情分析ツール
 */
export async function textSentimentAnalyzer(args) {
  const { text } = args;
  
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error("textは必須の文字列です");
  }
  
  try {
    const scriptPath = path.join(__dirname, 'text_analyzer.py');
    const pythonArgs = [
      '--function', 'sentiment',
      '--text', text.trim()
    ];
    
    const result = await executePython(scriptPath, pythonArgs);
    
    if (result.success) {
      let emoji = "😐";
      if (result.sentiment === "ポジティブ") emoji = "😊";
      else if (result.sentiment === "ネガティブ") emoji = "😢";
      
      const responseText = `${emoji} テキスト感情分析結果\n\n` +
                          `📝 分析テキスト: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"\n` +
                          `🎭 感情: ${result.sentiment}\n` +
                          `📊 信頼度: ${result.confidence}\n` +
                          `📈 極性値: ${result.polarity}\n` +
                          `🎨 主観性: ${result.subjectivity}\n` +
                          `🌐 言語: ${result.language}\n` +
                          `🔧 分析手法: ${result.analysis_method}`;
      
      return {
        content: [
          {
            type: "text",
            text: responseText
          }
        ]
      };
    } else {
      throw new Error(result.error || 'Python実行でエラーが発生しました');
    }
    
  } catch (error) {
    throw new Error(`感情分析エラー: ${error.message}`);
  }
}

/**
 * テキストキーワード抽出ツール
 */
export async function textKeywordExtractor(args) {
  const { text, max_keywords = 10 } = args;
  
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error("textは必須の文字列です");
  }
  
  try {
    const scriptPath = path.join(__dirname, 'text_analyzer.py');
    const pythonArgs = [
      '--function', 'keywords',
      '--text', text.trim(),
      '--max_keywords', max_keywords.toString()
    ];
    
    const result = await executePython(scriptPath, pythonArgs);
    
    if (result.success) {
      let responseText = `🔍 キーワード抽出結果\n\n`;
      responseText += `📝 分析テキスト: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"\n`;
      responseText += `🌐 言語: ${result.language}\n`;
      responseText += `📊 総単語数: ${result.total_words}\n`;
      responseText += `✨ ユニーク単語数: ${result.unique_words}\n`;
      responseText += `🔧 分析手法: ${result.analysis_method}\n\n`;
      
      responseText += `🏆 トップキーワード:\n`;
      result.top_keywords.forEach((keyword, index) => {
        const percentage = (keyword.frequency * 100).toFixed(1);
        responseText += `${index + 1}. ${keyword.word} (${keyword.count}回, ${percentage}%)\n`;
      });
      
      // カテゴリ別表示
      const categories = result.categories;
      if (categories.noun.length > 0) {
        responseText += `\n🏷️ 名詞: ${categories.noun.map(n => n.word).join(', ')}\n`;
      }
      if (categories.verb.length > 0) {
        responseText += `⚡ 動詞: ${categories.verb.map(v => v.word).join(', ')}\n`;
      }
      if (categories.adjective.length > 0) {
        responseText += `🎨 形容詞: ${categories.adjective.map(a => a.word).join(', ')}\n`;
      }
      
      return {
        content: [
          {
            type: "text",
            text: responseText
          }
        ]
      };
    } else {
      throw new Error(result.error || 'Python実行でエラーが発生しました');
    }
    
  } catch (error) {
    throw new Error(`キーワード抽出エラー: ${error.message}`);
  }
}

/**
 * テキスト要約ツール
 */
export async function textSummarizer(args) {
  const { text, sentence_count = 3 } = args;
  
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error("textは必須の文字列です");
  }
  
  try {
    const scriptPath = path.join(__dirname, 'text_analyzer.py');
    const pythonArgs = [
      '--function', 'summary',
      '--text', text.trim(),
      '--sentence_count', sentence_count.toString()
    ];
    
    const result = await executePython(scriptPath, pythonArgs);
    
    if (result.success) {
      const responseText = `📋 テキスト要約結果\n\n` +
                          `📊 元の文章数: ${result.original_sentences}\n` +
                          `📝 要約文章数: ${result.summary_sentences}\n` +
                          `📉 圧縮率: ${(result.compression_ratio * 100).toFixed(1)}%\n` +
                          `🌐 言語: ${result.language}\n` +
                          `🔧 手法: ${result.method}\n\n` +
                          `📄 要約結果:\n${result.summary}`;
      
      return {
        content: [
          {
            type: "text",
            text: responseText
          }
        ]
      };
    } else {
      throw new Error(result.error || 'Python実行でエラーが発生しました');
    }
    
  } catch (error) {
    throw new Error(`テキスト要約エラー: ${error.message}`);
  }
}

/**
 * テキスト類似度計算ツール
 */
export async function textSimilarityCalculator(args) {
  const { text1, text2 } = args;
  
  if (typeof text1 !== 'string' || !text1.trim() || typeof text2 !== 'string' || !text2.trim()) {
    throw new Error("text1とtext2は必須の文字列です");
  }
  
  try {
    const scriptPath = path.join(__dirname, 'text_analyzer.py');
    const pythonArgs = [
      '--function', 'similarity',
      '--text1', text1.trim(),
      '--text2', text2.trim()
    ];
    
    const result = await executePython(scriptPath, pythonArgs);
    
    if (result.success) {
      const responseText = `🔍 テキスト類似度分析結果\n\n` +
                          `📝 テキスト1: "${text1.substring(0, 50)}${text1.length > 50 ? '...' : ''}"\n` +
                          `📝 テキスト2: "${text2.substring(0, 50)}${text2.length > 50 ? '...' : ''}"\n\n` +
                          `📊 類似度スコア:\n` +
                          `🎯 Jaccard類似度: ${result.jaccard_similarity}\n` +
                          `📐 コサイン類似度: ${result.cosine_similarity}\n` +
                          `🔤 文字類似度: ${result.character_similarity}\n` +
                          `📈 総合類似度: ${result.overall_similarity}\n\n` +
                          `🤝 共通単語 (${result.common_word_count}個): ${result.common_words.join(', ')}\n` +
                          `📋 テキスト1固有単語: ${result.text1_unique_words}個\n` +
                          `📋 テキスト2固有単語: ${result.text2_unique_words}個`;
      
      return {
        content: [
          {
            type: "text",
            text: responseText
          }
        ]
      };
    } else {
      throw new Error(result.error || 'Python実行でエラーが発生しました');
    }
    
  } catch (error) {
    throw new Error(`類似度計算エラー: ${error.message}`);
  }
}

/**
 * テキスト統計分析ツール
 */
export async function textStatisticsAnalyzer(args) {
  const { text } = args;
  
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error("textは必須の文字列です");
  }
  
  try {
    const scriptPath = path.join(__dirname, 'text_analyzer.py');
    const pythonArgs = [
      '--function', 'statistics',
      '--text', text.trim()
    ];
    
    const result = await executePython(scriptPath, pythonArgs);
    
    if (result.success) {
      const stats = result.basic_stats;
      const avg = result.averages;
      const chars = result.character_types;
      const vocab = result.vocabulary_analysis;
      
      let responseText = `📊 テキスト詳細統計分析\n\n`;
      responseText += `📏 基本統計:\n`;
      responseText += `  文字数: ${stats.character_count} (空白除く: ${stats.character_count_no_spaces})\n`;
      responseText += `  単語数: ${stats.word_count}\n`;
      responseText += `  文章数: ${stats.sentence_count}\n`;
      responseText += `  段落数: ${stats.paragraph_count}\n`;
      responseText += `  ユニーク単語数: ${stats.unique_words}\n\n`;
      
      responseText += `📐 平均値:\n`;
      responseText += `  平均単語長: ${avg.avg_word_length}文字\n`;
      responseText += `  平均文章長: ${avg.avg_sentence_length}単語\n`;
      responseText += `  平均段落長: ${avg.avg_paragraph_length}文章\n\n`;
      
      if (result.language === 'ja') {
        responseText += `🈳 文字種構成:\n`;
        responseText += `  ひらがな: ${chars.hiragana}文字\n`;
        responseText += `  カタカナ: ${chars.katakana}文字\n`;
        responseText += `  漢字: ${chars.kanji}文字\n`;
        responseText += `  英数字: ${chars.ascii}文字\n\n`;
      }
      
      responseText += `📚 語彙分析:\n`;
      responseText += `  語彙豊富度: ${vocab.vocabulary_richness}\n`;
      responseText += `  読みやすさ: ${vocab.readability_level} (スコア: ${vocab.readability_score}/5)\n`;
      responseText += `  言語: ${result.language}`;
      
      return {
        content: [
          {
            type: "text",
            text: responseText
          }
        ]
      };
    } else {
      throw new Error(result.error || 'Python実行でエラーが発生しました');
    }
    
  } catch (error) {
    throw new Error(`テキスト統計分析エラー: ${error.message}`);
  }
}

// デフォルトエクスポート（最も一般的な機能）
export default weatherChecker;