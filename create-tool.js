#!/usr/bin/env node

/**
 * ツール作成ヘルパースクリプト（アイコン対応版）
 * 
 * 使用方法:
 * node create-tool.js [tool-name]
 * 
 * 例:
 * node create-tool.js weather_checker
 * node create-tool.js --interactive
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOOLS_DIR = path.join(__dirname, 'YourTool');

class ToolCreator {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async close() {
    this.rl.close();
  }

  /**
   * 対話的ツール作成
   */
  async createInteractive() {
    console.log('🛠️  新しいツールを作成します\n');

    try {
      const toolName = await this.question('ツール名を入力してください (例: weather_checker): ');
      if (!toolName || !this.isValidToolName(toolName)) {
        throw new Error('有効なツール名を入力してください (英数字とアンダースコアのみ)');
      }

      const description = await this.question('ツールの説明を入力してください: ');
      if (!description) {
        throw new Error('説明は必須です');
      }

      // アイコン作成オプション
      const createIcon = await this.question('アイコンを作成しますか? (y/N): ');
      let iconConfig = null;
      
      if (createIcon.toLowerCase() === 'y') {
        iconConfig = await this.collectIconInfo(toolName);
      }

      console.log('\n📋 パラメータを定義します (完了するには空行を入力):');
      const parameters = await this.collectParameters();

      const version = await this.question('バージョン (デフォルト: 1.0.0): ') || '1.0.0';

      console.log('\n🎯 処理タイプを選択してください:');
      console.log('1. シンプル (引数を処理して文字列を返す)');
      console.log('2. 非同期 (外部APIを呼び出すなど)');
      console.log('3. カスタム (自分で実装)');
      
      const processingType = await this.question('選択 (1-3): ');

      const toolConfig = {
        name: toolName,
        description: description,
        version: version,
        inputSchema: this.generateInputSchema(parameters),
        ...(iconConfig && { icon: iconConfig })
      };

      const handlerCode = this.generateHandlerCode(toolName, parameters, processingType);

      await this.createTool(toolName, toolConfig, handlerCode, iconConfig);

      console.log(`\n✅ ツール「${toolName}」を作成しました!`);
      console.log(`📁 場所: ${path.join(TOOLS_DIR, toolName)}`);
      if (iconConfig) {
        console.log(`🎨 アイコン: ${iconConfig.filename}`);
      }
      console.log('\n💡 次のステップ:');
      console.log('1. handler.js の実装を確認・修正');
      console.log('2. サーバーでツールをリロード: POST /tools/reload');
      console.log('3. テストを実行');

    } catch (error) {
      console.error(`❌ エラー: ${error.message}`);
    } finally {
      await this.close();
    }
  }

  /**
   * アイコン情報の収集
   */
  async collectIconInfo(toolName) {
    console.log('\n🎨 アイコン設定:');
    
    const iconDescription = await this.question('アイコンの説明 (例: 天気予報アイコン): ') || `${toolName} アイコン`;
    
    console.log('\nアイコンタイプを選択してください:');
    console.log('1. 🔧 ツール系 (レンチ、ハンマー、設定など)');
    console.log('2. 📊 データ系 (グラフ、チャート、データベースなど)');
    console.log('3. 🌐 ネットワーク系 (クラウド、API、ネットワークなど)');
    console.log('4. 📁 ファイル系 (ファイル、フォルダ、ドキュメントなど)');
    console.log('5. 🎯 アクション系 (矢印、再生、停止など)');
    console.log('6. 🧮 計算系 (計算機、数学記号など)');
    console.log('7. 🎨 カスタム (独自のデザイン)');
    
    const iconType = await this.question('選択 (1-7): ') || '1';
    
    const colorScheme = await this.question('色のテーマ (blue/green/red/orange/purple/gray) [blue]: ') || 'blue';
    
    return {
      filename: `${toolName}_icon.svg`,
      description: iconDescription,
      type: iconType,
      colorScheme: colorScheme
    };
  }

  /**
   * SVGアイコンを生成
   */
  generateSVGIcon(toolName, iconConfig) {
    const colors = {
      blue: { primary: '#3B82F6', secondary: '#1E40AF', accent: '#93C5FD' },
      green: { primary: '#10B981', secondary: '#059669', accent: '#6EE7B7' },
      red: { primary: '#EF4444', secondary: '#DC2626', accent: '#FCA5A5' },
      orange: { primary: '#F97316', secondary: '#EA580C', accent: '#FDBA74' },
      purple: { primary: '#8B5CF6', secondary: '#7C3AED', accent: '#C4B5FD' },
      gray: { primary: '#6B7280', secondary: '#4B5563', accent: '#D1D5DB' }
    };
    
    const scheme = colors[iconConfig.colorScheme] || colors.blue;
    
    const iconTemplates = {
      '1': this.generateToolIcon(scheme),
      '2': this.generateDataIcon(scheme),
      '3': this.generateNetworkIcon(scheme),
      '4': this.generateFileIcon(scheme),
      '5': this.generateActionIcon(scheme),
      '6': this.generateCalculatorIcon(scheme),
      '7': this.generateCustomIcon(scheme, toolName)
    };
    
    const iconContent = iconTemplates[iconConfig.type] || iconTemplates['1'];
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Generated icon for ${toolName} -->
  <!-- Description: ${iconConfig.description} -->
  ${iconContent}
</svg>`;
  }

  generateToolIcon(colors) {
    return `
  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" fill="${colors.primary}"/>
  <path d="M14.7 6.3l1.6 1.6" stroke="${colors.secondary}" stroke-width="2" stroke-linecap="round"/>
`;
  }

  generateDataIcon(colors) {
    return `
  <rect x="3" y="3" width="18" height="18" rx="2" fill="${colors.accent}" stroke="${colors.primary}" stroke-width="2"/>
  <path d="M8 12l2 2 4-4" stroke="${colors.primary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="6" y="6" width="4" height="3" fill="${colors.primary}"/>
  <rect x="14" y="6" width="4" height="3" fill="${colors.secondary}"/>
  <rect x="6" y="15" width="4" height="3" fill="${colors.secondary}"/>
  <rect x="14" y="15" width="4" height="3" fill="${colors.primary}"/>
`;
  }

  generateNetworkIcon(colors) {
    return `
  <circle cx="12" cy="12" r="3" fill="${colors.primary}"/>
  <circle cx="6" cy="6" r="2" fill="${colors.secondary}"/>
  <circle cx="18" cy="6" r="2" fill="${colors.secondary}"/>
  <circle cx="6" cy="18" r="2" fill="${colors.secondary}"/>
  <circle cx="18" cy="18" r="2" fill="${colors.secondary}"/>
  <line x1="9" y1="9" x2="8" y2="8" stroke="${colors.primary}" stroke-width="2"/>
  <line x1="15" y1="9" x2="16" y2="8" stroke="${colors.primary}" stroke-width="2"/>
  <line x1="9" y1="15" x2="8" y2="16" stroke="${colors.primary}" stroke-width="2"/>
  <line x1="15" y1="15" x2="16" y2="16" stroke="${colors.primary}" stroke-width="2"/>
`;
  }

  generateFileIcon(colors) {
    return `
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="${colors.accent}" stroke="${colors.primary}" stroke-width="2"/>
  <polyline points="14,2 14,8 20,8" fill="${colors.primary}"/>
  <line x1="8" y1="13" x2="16" y2="13" stroke="${colors.primary}" stroke-width="2"/>
  <line x1="8" y1="17" x2="13" y2="17" stroke="${colors.primary}" stroke-width="2"/>
`;
  }

  generateActionIcon(colors) {
    return `
  <circle cx="12" cy="12" r="10" fill="${colors.accent}" stroke="${colors.primary}" stroke-width="2"/>
  <polygon points="10,8 16,12 10,16" fill="${colors.primary}"/>
`;
  }

  generateCalculatorIcon(colors) {
    return `
  <rect x="4" y="2" width="16" height="20" rx="2" fill="${colors.accent}" stroke="${colors.primary}" stroke-width="2"/>
  <rect x="6" y="4" width="12" height="3" fill="${colors.primary}" rx="1"/>
  <circle cx="8" cy="10" r="1" fill="${colors.primary}"/>
  <circle cx="12" cy="10" r="1" fill="${colors.primary}"/>
  <circle cx="16" cy="10" r="1" fill="${colors.primary}"/>
  <circle cx="8" cy="14" r="1" fill="${colors.primary}"/>
  <circle cx="12" cy="14" r="1" fill="${colors.primary}"/>
  <circle cx="16" cy="14" r="1" fill="${colors.primary}"/>
  <circle cx="8" cy="18" r="1" fill="${colors.primary}"/>
  <circle cx="12" cy="18" r="1" fill="${colors.primary}"/>
  <circle cx="16" cy="18" r="1" fill="${colors.primary}"/>
`;
  }

  generateCustomIcon(colors, toolName) {
    // ツール名の最初の文字を使ったカスタムアイコン
    const firstChar = toolName.charAt(0).toUpperCase();
    return `
  <circle cx="12" cy="12" r="10" fill="${colors.primary}" stroke="${colors.secondary}" stroke-width="2"/>
  <text x="12" y="16" font-family="Arial, sans-serif" font-size="12" font-weight="bold" text-anchor="middle" fill="white">${firstChar}</text>
  <circle cx="12" cy="12" r="6" fill="none" stroke="${colors.accent}" stroke-width="1" stroke-dasharray="2,2"/>
`;
  }

  /**
   * コマンドライン引数からツール作成
   */
  async createFromArgs(toolName) {
    try {
      if (!this.isValidToolName(toolName)) {
        throw new Error('有効なツール名を入力してください (英数字とアンダースコアのみ)');
      }

      // 基本的なテンプレートを作成
      const toolConfig = {
        name: toolName,
        description: `${toolName} ツール`,
        version: '1.0.0',
        inputSchema: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: '処理する入力データ'
            }
          },
          required: ['input'],
          additionalProperties: false
        }
      };

      const handlerCode = this.generateSimpleHandlerCode(toolName);

      await this.createTool(toolName, toolConfig, handlerCode);

      console.log(`✅ ツール「${toolName}」のテンプレートを作成しました!`);
      console.log(`📁 場所: ${path.join(TOOLS_DIR, toolName)}`);
      console.log('📝 config.json と handler.js を編集してカスタマイズしてください');

    } catch (error) {
      console.error(`❌ エラー: ${error.message}`);
    }
  }

  /**
   * パラメータ収集
   */
  async collectParameters() {
    const parameters = {};
    
    while (true) {
      const paramName = await this.question('パラメータ名 (空行で終了): ');
      if (!paramName.trim()) break;

      console.log('型を選択してください:');
      console.log('1. string (文字列)');
      console.log('2. number (数値)');
      console.log('3. boolean (真偽値)');
      console.log('4. array (配列)');
      
      const typeChoice = await this.question('選択 (1-4): ');
      const typeMap = { '1': 'string', '2': 'number', '3': 'boolean', '4': 'array' };
      const paramType = typeMap[typeChoice] || 'string';

      const paramDescription = await this.question('パラメータの説明: ');
      const isRequired = await this.question('必須パラメータですか? (y/N): ');

      parameters[paramName] = {
        type: paramType,
        description: paramDescription || `${paramName} パラメータ`,
        required: isRequired.toLowerCase() === 'y'
      };

      console.log(`✅ パラメータ「${paramName}」を追加しました\n`);
    }

    return parameters;
  }

  /**
   * 入力スキーマ生成
   */
  generateInputSchema(parameters) {
    const properties = {};
    const required = [];

    for (const [name, param] of Object.entries(parameters)) {
      properties[name] = {
        type: param.type,
        description: param.description
      };

      if (param.required) {
        required.push(name);
      }
    }

    return {
      type: 'object',
      properties: properties,
      required: required,
      additionalProperties: false
    };
  }

  /**
   * ハンドラーコード生成
   */
  generateHandlerCode(toolName, parameters, processingType) {
    const paramNames = Object.keys(parameters);
    const validationCode = this.generateValidationCode(parameters);
    const processingCode = this.generateProcessingCode(processingType, paramNames);

    return `export default ${processingType === '2' ? 'async ' : ''}function ${this.toCamelCase(toolName)}(args) {
  // 引数の取得
  const { ${paramNames.join(', ')} } = args;
  
  // 引数の検証
${validationCode}
  
  try {
    // メイン処理
${processingCode}
    
    // 結果を返す
    return {
      content: [
        {
          type: "text",
          text: \`${toolName} 結果: \${result}\`
        }
      ]
    };
  } catch (error) {
    throw new Error(\`${toolName} 処理エラー: \${error.message}\`);
  }
}`;
  }

  /**
   * シンプルなハンドラーコード生成
   */
  generateSimpleHandlerCode(toolName) {
    return `export default function ${this.toCamelCase(toolName)}(args) {
  const { input } = args;
  
  // 引数の検証
  if (typeof input !== 'string') {
    throw new Error("inputは文字列である必要があります");
  }
  
  try {
    // TODO: ここに${toolName}の処理ロジックを実装
    const result = \`処理結果: \${input}\`;
    
    // 結果を返す
    return {
      content: [
        {
          type: "text",
          text: result
        }
      ]
    };
  } catch (error) {
    throw new Error(\`${toolName} 処理エラー: \${error.message}\`);
  }
}`;
  }

  /**
   * バリデーションコード生成
   */
  generateValidationCode(parameters) {
    const validations = [];
    
    for (const [name, param] of Object.entries(parameters)) {
      if (param.required) {
        switch (param.type) {
          case 'string':
            validations.push(`  if (typeof ${name} !== 'string' || !${name}.trim()) {
    throw new Error("${name}は必須の文字列です");
  }`);
            break;
          case 'number':
            validations.push(`  if (typeof ${name} !== 'number' || isNaN(${name})) {
    throw new Error("${name}は必須の数値です");
  }`);
            break;
          case 'boolean':
            validations.push(`  if (typeof ${name} !== 'boolean') {
    throw new Error("${name}は必須の真偽値です");
  }`);
            break;
          case 'array':
            validations.push(`  if (!Array.isArray(${name})) {
    throw new Error("${name}は必須の配列です");
  }`);
            break;
        }
      }
    }
    
    return validations.join('\n  ');
  }

  /**
   * 処理コード生成
   */
  generateProcessingCode(processingType, paramNames) {
    switch (processingType) {
      case '1': // シンプル
        return `    const result = \`処理完了: \${${paramNames[0] || 'input'}}\`;`;
      
      case '2': // 非同期
        return `    // TODO: 非同期処理を実装
    const response = await fetch('https://api.example.com/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ${paramNames.join(', ')} })
    });
    const data = await response.json();
    const result = \`非同期処理結果: \${JSON.stringify(data)}\`;`;
      
      case '3': // カスタム
      default:
        return `    // TODO: カスタム処理を実装
    const result = "カスタム処理結果";`;
    }
  }

  /**
   * ツール作成
   */
  async createTool(toolName, config, handlerCode, iconConfig = null) {
    // ツールディレクトリ作成
    await fs.mkdir(TOOLS_DIR, { recursive: true });
    
    const toolDir = path.join(TOOLS_DIR, toolName);
    
    // ツールが既に存在するかチェック
    try {
      await fs.access(toolDir);
      throw new Error(`ツール「${toolName}」は既に存在します`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    // ツールディレクトリ作成
    await fs.mkdir(toolDir);
    
    // config.json 作成
    await fs.writeFile(
      path.join(toolDir, 'config.json'),
      JSON.stringify(config, null, 2)
    );
    
    // handler.js 作成
    await fs.writeFile(
      path.join(toolDir, 'handler.js'),
      handlerCode
    );

    // アイコンファイル作成
    if (iconConfig) {
      const svgContent = this.generateSVGIcon(toolName, iconConfig);
      await fs.writeFile(
        path.join(toolDir, iconConfig.filename),
        svgContent
      );
    }
  }

  /**
   * ツール名の有効性チェック
   */
  isValidToolName(name) {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
  }

  /**
   * キャメルケース変換
   */
  toCamelCase(str) {
    return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
  }

  /**
   * ツール一覧表示
   */
  async listTools() {
    try {
      await fs.access(TOOLS_DIR);
      const entries = await fs.readdir(TOOLS_DIR, { withFileTypes: true });
      const toolDirs = entries.filter(entry => entry.isDirectory());

      if (toolDirs.length === 0) {
        console.log('📦 作成されたツールはありません');
        return;
      }

      console.log('📦 作成済みツール一覧:');
      for (const toolDir of toolDirs) {
        try {
          const configPath = path.join(TOOLS_DIR, toolDir.name, 'config.json');
          const configData = await fs.readFile(configPath, 'utf8');
          const config = JSON.parse(configData);
          
          const iconInfo = config.icon ? ` 🎨` : '';
          console.log(`  - ${config.name}: ${config.description}${iconInfo}`);
          
          if (config.icon) {
            console.log(`    📂 アイコン: ${config.icon.filename} (${config.icon.description})`);
          }
        } catch (error) {
          console.log(`  - ${toolDir.name}: (設定読み込みエラー)`);
        }
      }
    } catch (error) {
      console.log('📦 ツールディレクトリが存在しません');
    }
  }
}

async function showHelp() {
  console.log(`
🛠️  ツール作成ヘルパー（アイコン対応版）

使用方法:
  node create-tool.js [options] [tool-name]

オプション:
  --interactive, -i    対話的にツールを作成（アイコン作成も可能）
  --list, -l          作成済みツールを一覧表示
  --help, -h          このヘルプを表示

例:
  node create-tool.js my_tool              # シンプルなツールテンプレートを作成
  node create-tool.js --interactive        # 対話的にツールを作成（推奨）
  node create-tool.js --list              # 作成済みツール一覧を表示

新機能:
  🎨 アイコン作成機能
  - SVGアイコンの自動生成
  - 7種類のアイコンタイプ（ツール系、データ系、ネットワーク系など）
  - 6色のカラーテーマ（blue, green, red, orange, purple, gray）
  - フロントエンドアプリでの自動表示

作成されるファイル:
  YourTool/[tool-name]/
  ├── config.json          # ツール設定（アイコン情報含む）
  ├── handler.js           # ツール実行ロジック
  └── [tool-name]_icon.svg # アイコンファイル（オプション）

アイコンタイプ:
  1. 🔧 ツール系     - レンチ、設定アイコン
  2. 📊 データ系     - グラフ、チャートアイコン
  3. 🌐 ネットワーク系 - クラウド、APIアイコン
  4. 📁 ファイル系    - ファイル、ドキュメントアイコン
  5. 🎯 アクション系   - 再生、実行アイコン
  6. 🧮 計算系      - 計算機、数学アイコン
  7. 🎨 カスタム     - ツール名ベースのアイコン
`);
}

async function main() {
  const args = process.argv.slice(2);
  const creator = new ToolCreator();

  try {
    if (args.includes('--help') || args.includes('-h')) {
      await showHelp();
      return;
    }

    if (args.includes('--list') || args.includes('-l')) {
      await creator.listTools();
      return;
    }

    if (args.includes('--interactive') || args.includes('-i')) {
      await creator.createInteractive();
      return;
    }

    // ツール名が指定された場合
    const toolName = args.find(arg => !arg.startsWith('--'));
    if (toolName) {
      await creator.createFromArgs(toolName);
      return;
    }

    // 引数なしの場合はヘルプを表示
    await showHelp();

  } catch (error) {
    console.error(`❌ エラー: ${error.message}`);
    process.exit(1);
  }
}

// メイン関数実行
main();