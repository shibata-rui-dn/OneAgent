#!/usr/bin/env node

/**
 * 動的ツール管理MCP対応サーバー（HTTP版）+ AIエージェント機能 + アイコン対応 + ローカルLLM対応（LangChain.js Agent） + .env管理機能
 * 最新MCP SDK v1.12.0対応
*/

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// LangChain.js imports
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { pull } from "langchain/hub";
import { DynamicTool } from "@langchain/core/tools";
import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatPromptTemplate, MessagesPlaceholder, PromptTemplate } from "@langchain/core/prompts";

// 環境変数の読み込み（.envファイル）
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

const TOOLS_DIR = path.join(__dirname, 'YourTool');

// AI設定
const AI_CONFIG = {
  provider: process.env.AI_PROVIDER || 'openai',
  model: process.env.AI_MODEL || 'gpt-4o-mini',
  streaming: process.env.AI_STREAMING !== 'false',
  temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
  maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 2000,
  localLlmUrl: process.env.LOCAL_LLM_URL || 'http://localhost:8000',
  localLlmModel: process.env.LOCAL_LLM_MODEL || 'Qwen/Qwen3-4B'
};

// OpenAI/Azure OpenAI/ローカルLLM設定
let openai;
let langChainLLM; // LangChain用LLM

function initializeOpenAI() {
  const provider = AI_CONFIG.provider.toLowerCase();

  try {
    let config = {
      timeout: 60000,
      defaultHeaders: {
        'User-Agent': 'OneAgent/1.0.0'
      }
    };

    switch (provider) {
      case 'openai':
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
          console.warn('⚠️  OPENAI_API_KEY が設定されていません。');
          return null;
        }
        config.apiKey = openaiApiKey;
        break;

      case 'azureopenai':
        const azureApiKey = process.env.OPENAI_API_KEY;
        const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
        const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';

        if (!azureApiKey || !azureEndpoint) {
          console.error('❌ Azure OpenAI使用時は OPENAI_API_KEY と AZURE_OPENAI_ENDPOINT が必要です');
          return null;
        }

        config.apiKey = azureApiKey;
        config.baseURL = `${azureEndpoint}/openai/deployments/${AI_CONFIG.model}`;
        config.defaultQuery = { 'api-version': azureApiVersion };
        config.defaultHeaders = {
          ...config.defaultHeaders,
          'api-key': azureApiKey,
        };
        break;

      case 'localllm':
        // ローカルLLM（VLLM）設定 - LangChain用
        const localLlmUrl = AI_CONFIG.localLlmUrl;

        console.log(`🔄 ローカルLLM（LangChain）に接続中: ${localLlmUrl}`);

        // LangChain用のChatOpenAIインスタンスを作成
        langChainLLM = new ChatOpenAI({
          openAIApiKey: 'dummy-key', // VLLMではAPI keyは不要だが必須なのでダミーを設定
          modelName: AI_CONFIG.localLlmModel,
          temperature: AI_CONFIG.temperature,
          maxTokens: AI_CONFIG.maxTokens,
          configuration: {
            baseURL: localLlmUrl,
            timeout: 120000, // 2分
          },
          streaming: AI_CONFIG.streaming,
        });

        console.log(`✅ LangChain LLM クライアントを初期化しました`);
        console.log(`   モデル: ${AI_CONFIG.localLlmModel}`);
        console.log(`   エンドポイント: ${localLlmUrl}`);

        // OpenAIクライアントも一応作成（非ツール用途）
        config.baseURL = localLlmUrl;
        config.apiKey = 'dummy-key';
        config.timeout = 120000;
        break;

      default:
        console.error(`❌ 未対応のAIプロバイダー: ${provider}`);
        return null;
    }

    const client = new OpenAI(config);

    if (provider !== 'localllm') {
      console.log(`✅ ${provider.toUpperCase()} クライアントを初期化しました`);
      console.log(`   モデル: ${AI_CONFIG.model}`);
      console.log(`   ストリーミング: ${AI_CONFIG.streaming}`);
    }

    return client;
  } catch (error) {
    console.error(`❌ ${provider.toUpperCase()} クライアント初期化エラー:`, error.message);
    return null;
  }
}

/**
 * ツール管理クラス（アイコン対応版）
 */
class ToolManager {
  constructor() {
    this.tools = new Map();
    this.toolHandlers = new Map();
  }

  async loadTools() {
    try {
      await fs.access(TOOLS_DIR);
    } catch (error) {
      console.log(`ツールディレクトリ ${TOOLS_DIR} が存在しません。作成しています...`);
      await fs.mkdir(TOOLS_DIR, { recursive: true });
      await this.createSampleTools();
    }

    console.log(`🔍 ツールディレクトリをスキャンしています: ${TOOLS_DIR}`);

    const entries = await fs.readdir(TOOLS_DIR, { withFileTypes: true });
    const toolDirs = entries.filter(entry => entry.isDirectory());

    for (const toolDir of toolDirs) {
      const toolPath = path.join(TOOLS_DIR, toolDir.name);
      await this.loadTool(toolDir.name, toolPath);
    }

    console.log(`✅ ${this.tools.size} 個のツールを読み込みました`);
  }

  async loadTool(toolName, toolPath) {
    try {
      const configPath = path.join(toolPath, 'config.json');
      const handlerPath = path.join(toolPath, 'handler.js');

      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);

      await fs.access(handlerPath);

      // アイコンファイルの存在チェック
      let iconPath = null;
      if (config.icon && config.icon.filename) {
        const potentialIconPath = path.join(toolPath, config.icon.filename);
        try {
          await fs.access(potentialIconPath);
          iconPath = potentialIconPath;
        } catch (error) {
          console.warn(`  ⚠️  アイコンファイルが見つかりません: ${config.icon.filename}`);
        }
      }

      this.tools.set(toolName, {
        name: config.name || toolName,
        description: config.description || `${toolName} ツール`,
        inputSchema: config.inputSchema || { type: "object", properties: {} },
        version: config.version || "1.0.0",
        handlerPath: handlerPath,
        icon: config.icon || null,
        iconPath: iconPath
      });

      const iconInfo = config.icon ? ' 🎨' : '';
      console.log(`  📦 ツール「${toolName}」を読み込みました${iconInfo}`);
    } catch (error) {
      console.warn(`  ⚠️  ツール「${toolName}」の読み込みに失敗: ${error.message}`);
    }
  }

  async executeToolHandler(toolName, args) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`ツール「${toolName}」が見つかりません`);
    }

    try {
      if (!this.toolHandlers.has(toolName)) {
        const handlerModule = await import(`file://${tool.handlerPath}?t=${Date.now()}`);
        this.toolHandlers.set(toolName, handlerModule.default || handlerModule);
      }

      const handler = this.toolHandlers.get(toolName);

      if (typeof handler !== 'function') {
        throw new Error(`ツール「${toolName}」のハンドラーが正しく定義されていません`);
      }

      return await handler(args);
    } catch (error) {
      throw new Error(`ツール「${toolName}」の実行エラー: ${error.message}`);
    }
  }

  getToolsList() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      version: tool.version,
      icon: tool.icon,
      hasIcon: !!tool.iconPath
    }));
  }

  getOpenAITools() {
    return Array.from(this.tools.values()).map(tool => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));
  }

  // 修正: 選択されたツールのみのOpenAI tools定義を取得
  getSelectedOpenAITools(selectedToolNames) {
    if (!selectedToolNames || selectedToolNames.length === 0) {
      return [];
    }

    const selectedTools = [];
    const notFoundTools = [];

    for (const toolName of selectedToolNames) {
      const tool = this.tools.get(toolName);
      if (tool) {
        selectedTools.push({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
          }
        });
      } else {
        notFoundTools.push(toolName);
      }
    }

    if (notFoundTools.length > 0) {
      console.warn(`⚠️ 以下のツールが見つかりません: ${notFoundTools.join(', ')}`);
    }

    return selectedTools;
  }

  // 新規追加: LangChain用のツール定義を取得
  getLangChainTools(selectedToolNames) {
    if (!selectedToolNames || selectedToolNames.length === 0) {
      return [];
    }

    const langChainTools = [];
    const notFoundTools = [];

    for (const toolName of selectedToolNames) {
      const tool = this.tools.get(toolName);
      if (tool) {
        const langChainTool = new DynamicTool({
          name: tool.name,
          description: tool.description,
          func: async (input) => {
            try {
              console.log(`🔧 ツール ${tool.name} 実行開始`);
              console.log(`📝 入力:`, input);

              let args = {};

              // 入力を適切にパース
              if (typeof input === 'string') {
                if (tool.name === 'add_numbers' || tool.name === 'multiply_numbers') {
                  const numbers = input.match(/\d+/g);
                  if (numbers && numbers.length >= 2) {
                    args = {
                      a: parseInt(numbers[0]),
                      b: parseInt(numbers[1])
                    };
                  } else {
                    throw new Error(`数値を2つ検出できませんでした: ${input}`);
                  }
                } else if (tool.name === 'process_string') {
                  const parts = input.split(',').map(p => p.trim());
                  if (parts.length >= 2) {
                    args = {
                      text: parts[0],
                      operation: parts[1]
                    };
                  } else {
                    args = { text: input, operation: 'length' };
                  }
                } else {
                  try {
                    args = JSON.parse(input);
                  } catch (parseError) {
                    args = { input: input };
                  }
                }
              } else {
                args = input;
              }

              console.log(`⚙️ ツール ${tool.name} 引数:`, args);

              const result = await this.executeToolHandler(tool.name, args);
              const resultText = result.content?.map(c => c.text).join('\n') || 'ツール実行完了';

              console.log(`✅ ツール ${tool.name} 結果:`, resultText);

              return resultText;
            } catch (error) {
              const errorMsg = `エラー: ${error.message}`;
              console.error(`❌ ツール ${tool.name} 実行エラー:`, error);
              return errorMsg;
            }
          },
          schema: tool.inputSchema
        });

        langChainTools.push(langChainTool);
      } else {
        notFoundTools.push(toolName);
      }
    }

    if (notFoundTools.length > 0) {
      console.warn(`⚠️ 以下のツールが見つかりません: ${notFoundTools.join(', ')}`);
    }

    return langChainTools;
  }

  // 修正: 選択されたツールが実行可能かチェック
  validateSelectedTools(selectedToolNames) {
    if (!selectedToolNames || selectedToolNames.length === 0) {
      return { valid: true, notFound: [] };
    }

    const notFound = [];
    for (const toolName of selectedToolNames) {
      if (!this.tools.has(toolName)) {
        notFound.push(toolName);
      }
    }

    return {
      valid: notFound.length === 0,
      notFound: notFound
    };
  }

  // アイコンファイルを取得
  async getToolIcon(toolName) {
    const tool = this.tools.get(toolName);
    if (!tool || !tool.iconPath) {
      return null;
    }

    try {
      const iconData = await fs.readFile(tool.iconPath, 'utf8');
      return {
        filename: tool.icon.filename,
        contentType: 'image/svg+xml',
        data: iconData
      };
    } catch (error) {
      console.error(`アイコン読み込みエラー ${toolName}:`, error.message);
      return null;
    }
  }

  async createSampleTools() {
    console.log("📝 サンプルツールを作成しています...");

    // 加算ツール（アイコン付き）
    const addToolDir = path.join(TOOLS_DIR, 'add_numbers');
    await fs.mkdir(addToolDir, { recursive: true });

    await fs.writeFile(
      path.join(addToolDir, 'config.json'),
      JSON.stringify({
        name: "add_numbers",
        description: "2つの数値を受け取って、その和を返します",
        version: "1.0.0",
        inputSchema: {
          type: "object",
          properties: {
            a: { type: "number", description: "最初の数値" },
            b: { type: "number", description: "2番目の数値" }
          },
          required: ["a", "b"],
          additionalProperties: false
        },
        icon: {
          filename: "add_numbers_icon.svg",
          description: "加算計算アイコン",
          type: "6",
          colorScheme: "blue"
        }
      }, null, 2)
    );

    await fs.writeFile(
      path.join(addToolDir, 'handler.js'),
      `export default function addNumbers(args) {
  if (typeof args.a !== 'number' || typeof args.b !== 'number') {
    throw new Error("引数a, bは数値である必要があります");
  }
  
  const result = args.a + args.b;
  
  return {
    content: [
      {
        type: "text",
        text: \`計算結果: \${args.a} + \${args.b} = \${result}\`
      }
    ]
  };
}`
    );

    // 加算ツール用アイコンSVG
    await fs.writeFile(
      path.join(addToolDir, 'add_numbers_icon.svg'),
      `<?xml version="1.0" encoding="UTF-8"?>
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Generated icon for add_numbers -->
  <!-- Description: 加算計算アイコン -->
  <rect x="4" y="2" width="16" height="20" rx="2" fill="#93C5FD" stroke="#3B82F6" stroke-width="2"/>
  <rect x="6" y="4" width="12" height="3" fill="#3B82F6" rx="1"/>
  <line x1="12" y1="10" x2="12" y2="18" stroke="#3B82F6" stroke-width="2"/>
  <line x1="8" y1="14" x2="16" y2="14" stroke="#3B82F6" stroke-width="2"/>
</svg>`
    );

    // 乗算ツール（アイコン付き）
    const multiplyToolDir = path.join(TOOLS_DIR, 'multiply_numbers');
    await fs.mkdir(multiplyToolDir, { recursive: true });

    await fs.writeFile(
      path.join(multiplyToolDir, 'config.json'),
      JSON.stringify({
        name: "multiply_numbers",
        description: "2つの数値を受け取って、その積を返します",
        version: "1.0.0",
        inputSchema: {
          type: "object",
          properties: {
            a: { type: "number", description: "最初の数値" },
            b: { type: "number", description: "2番目の数値" }
          },
          required: ["a", "b"],
          additionalProperties: false
        },
        icon: {
          filename: "multiply_numbers_icon.svg",
          description: "乗算計算アイコン",
          type: "6",
          colorScheme: "green"
        }
      }, null, 2)
    );

    await fs.writeFile(
      path.join(multiplyToolDir, 'handler.js'),
      `export default function multiplyNumbers(args) {
  if (typeof args.a !== 'number' || typeof args.b !== 'number') {
    throw new Error("引数a, bは数値である必要があります");
  }
  
  const result = args.a * args.b;
  
  return {
    content: [
      {
        type: "text",
        text: \`計算結果: \${args.a} × \${args.b} = \${result}\`
      }
    ]
  };
}`
    );

    // 乗算ツール用アイコンSVG
    await fs.writeFile(
      path.join(multiplyToolDir, 'multiply_numbers_icon.svg'),
      `<?xml version="1.0" encoding="UTF-8"?>
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Generated icon for multiply_numbers -->
  <!-- Description: 乗算計算アイコン -->
  <rect x="4" y="2" width="16" height="20" rx="2" fill="#6EE7B7" stroke="#10B981" stroke-width="2"/>
  <rect x="6" y="4" width="12" height="3" fill="#10B981" rx="1"/>
  <line x1="9" y1="11" x2="15" y2="17" stroke="#10B981" stroke-width="2"/>
  <line x1="15" y1="11" x2="9" y2="17" stroke="#10B981" stroke-width="2"/>
</svg>`
    );

    // 文字列処理ツール（アイコン付き）
    const stringToolDir = path.join(TOOLS_DIR, 'process_string');
    await fs.mkdir(stringToolDir, { recursive: true });

    await fs.writeFile(
      path.join(stringToolDir, 'config.json'),
      JSON.stringify({
        name: "process_string",
        description: "文字列を処理して、長さや大文字変換などの情報を返します",
        version: "1.0.0",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "処理対象の文字列" },
            operation: {
              type: "string",
              enum: ["length", "uppercase", "lowercase", "reverse"],
              description: "実行する操作"
            }
          },
          required: ["text", "operation"],
          additionalProperties: false
        },
        icon: {
          filename: "process_string_icon.svg",
          description: "文字列処理アイコン",
          type: "4",
          colorScheme: "orange"
        }
      }, null, 2)
    );

    await fs.writeFile(
      path.join(stringToolDir, 'handler.js'),
      `export default function processString(args) {
  const { text, operation } = args;
  
  if (typeof text !== 'string') {
    throw new Error("引数textは文字列である必要があります");
  }
  
  let result;
  let description;
  
  switch (operation) {
    case 'length':
      result = text.length;
      description = \`文字列の長さ: \${result}\`;
      break;
    case 'uppercase':
      result = text.toUpperCase();
      description = \`大文字変換: \${result}\`;
      break;
    case 'lowercase':
      result = text.toLowerCase();
      description = \`小文字変換: \${result}\`;
      break;
    case 'reverse':
      result = text.split('').reverse().join('');
      description = \`逆順変換: \${result}\`;
      break;
    default:
      throw new Error(\`未対応の操作: \${operation}\`);
  }
  
  return {
    content: [
      {
        type: "text",
        text: description
      }
    ]
  };
}`
    );

    // 文字列処理ツール用アイコンSVG
    await fs.writeFile(
      path.join(stringToolDir, 'process_string_icon.svg'),
      `<?xml version="1.0" encoding="UTF-8"?>
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Generated icon for process_string -->
  <!-- Description: 文字列処理アイコン -->
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="#FDBA74" stroke="#F97316" stroke-width="2"/>
  <polyline points="14,2 14,8 20,8" fill="#F97316"/>
  <line x1="8" y1="13" x2="16" y2="13" stroke="#F97316" stroke-width="2"/>
  <line x1="8" y1="17" x2="13" y2="17" stroke="#F97316" stroke-width="2"/>
</svg>`
    );

    console.log("✅ サンプルツール（アイコン付き）を作成しました");
  }

  async reloadTools() {
    console.log("🔄 ツールをリロードしています...");
    this.tools.clear();
    this.toolHandlers.clear();
    await this.loadTools();
  }
}

/**
 * AIエージェントクラス（LangChain.js対応版）
 */
class AIAgent {
  constructor(toolManager, openaiClient) {
    this.toolManager = toolManager;
    this.openai = openaiClient;
    this.langChainLLM = langChainLLM;
  }

  // 修正: localllmの場合はLangChain Agentを使用
  processQuery(query, options = {}) {
    const provider = AI_CONFIG.provider.toLowerCase();

    if (provider === 'localllm' && this.langChainLLM) {
      return this.processQueryWithLangChain(query, options);
    } else if (this.openai) {
      return this.processQueryWithOpenAI(query, options);
    } else {
      throw new Error('AIクライアントが初期化されていません');
    }
  }

  // 新規追加: LangChain Agent を使用した処理
  processQueryWithLangChain(query, options = {}) {
    const streaming = options.streaming !== undefined ? options.streaming : AI_CONFIG.streaming;
    const selectedTools = options.tools || [];

    // 選択されたツールを検証
    const validation = this.toolManager.validateSelectedTools(selectedTools);
    if (!validation.valid) {
      throw new Error(`以下のツールが見つかりません: ${validation.notFound.join(', ')}`);
    }

    // LangChainツールを取得
    const langChainTools = this.toolManager.getLangChainTools(selectedTools);

    console.log(`LangChain Agent処理開始 (${AI_CONFIG.provider.toUpperCase()})`);
    console.log(`使用可能ツール数: ${langChainTools.length}`);
    console.log(`モデル: ${AI_CONFIG.localLlmModel}`);

    if (streaming) {
      // ストリーミングの場合は直接async generatorを返す
      return this.handleLangChainStreamingResponse(query, langChainTools);
    } else {
      // 非ストリーミングの場合はPromiseを返す
      return this.handleLangChainNonStreamingResponse(query, langChainTools);
    }
  }

  // 新規追加: LangChain ストリーミング処理（改良版）
  async *handleLangChainStreamingResponse(query, langChainTools) {
    try {
      console.log(`🦜 LangChain処理開始`);
      console.log(`📝 クエリ: "${query}"`);
      console.log(`🔧 ツール数: ${langChainTools.length}`);

      if (langChainTools.length > 0) {
        // 最初に利用可能なツールを表示
        yield {
          type: 'text',
          content: `🔧 **利用可能なツール**: ${langChainTools.length}個\n`
        };

        const toolList = langChainTools.map(tool => `• ${tool.name}`).join('\n');
        yield {
          type: 'text',
          content: `${toolList}\n\n`
        };

        // ReActプロンプトテンプレートを作成（改良版）
        const prompt = PromptTemplate.fromTemplate(`
あなたは質問に答えるための推論と行動を実行するアシスタントです。以下のツールにアクセスできます:

{tools}

以下の形式を使用してください:

Question: 答える必要がある入力質問
Thought: 何をすべきかを常に考える必要があります
Action: 実行するアクション、[{tool_names}]のいずれかである必要があります
Action Input: アクションへの入力
Observation: アクションの結果
... (この Thought/Action/Action Input/Observation は繰り返すことができます)
Thought: 最終的な答えがわかりました
Final Answer: 元の入力質問に対する最終的な答え

重要な注意事項:
- add_numbers を使う場合: Action Input に数字1, 数字2 の形式
- multiply_numbers を使う場合: Action Input に数字1, 数字2 の形式
- process_string を使う場合: Action Input に 文字列, 操作 の形式

開始!

Question: {input}
Thought: {agent_scratchpad}
`);

        try {
          console.log(`🤖 ReActAgent作成中...`);

          // ReActAgentを作成
          const agent = await createReactAgent({
            llm: this.langChainLLM,
            tools: langChainTools,
            prompt: prompt,
          });

          const agentExecutor = new AgentExecutor({
            agent,
            tools: langChainTools,
            verbose: true,
            maxIterations: 10,
            handleParsingErrors: true,
          });

          console.log(`⚙️ AgentExecutor実行中...`);

          // AgentExecutorをストリーミングで実行
          yield { type: 'text', content: `🤖 **AI Agent** が分析を開始します...\n\n` };

          try {
            const stream = await agentExecutor.streamEvents(
              { input: query },
              { 
                version: "v1",
                includeNames: ["ReactAgent", "ChatOpenAI"],
                includeTags: ["tool"]
              }
            );

            let stepNumber = 1;
            let currentThought = '';
            let isProcessingThought = false;
            let finalAnswer = '';

            for await (const event of stream) {
              console.log(`📡 Event:`, event.event, event.name, event.data);

              // LLMの出力（Thought部分）をストリーミング
              if (event.event === 'on_llm_stream' && event.name === 'ChatOpenAI') {
                const content = event.data?.chunk?.content || '';
                if (content) {
                  // Thoughtの開始を検出
                  if (content.includes('Thought:') && !isProcessingThought) {
                    isProcessingThought = true;
                    yield { type: 'text', content: `💭 **思考${stepNumber}**: ` };
                    currentThought = '';
                  }
                  
                  // Action:が含まれている場合、Thoughtの終了
                  if (content.includes('Action:') && isProcessingThought) {
                    isProcessingThought = false;
                    if (currentThought.trim()) {
                      yield { type: 'text', content: `\n\n` };
                    }
                    
                    // Actionの開始
                    yield { type: 'text', content: `⚡ **アクション${stepNumber}**: ` };
                    const actionMatch = content.match(/Action:\s*(\w+)/);
                    if (actionMatch) {
                      yield { type: 'text', content: `${actionMatch[1]} ツールを実行\n` };
                    }
                  }
                  
                  // Final Answer:が含まれている場合
                  if (content.includes('Final Answer:')) {
                    yield { type: 'text', content: `\n📋 **最終回答**:\n` };
                    finalAnswer = content.replace(/.*Final Answer:\s*/, '');
                    if (finalAnswer) {
                      yield { type: 'text', content: finalAnswer };
                    }
                  }
                  
                  // 通常のthought内容をストリーミング
                  if (isProcessingThought && !content.includes('Thought:') && !content.includes('Action:')) {
                    currentThought += content;
                    yield { type: 'text', content: content };
                  }
                }
              }

              // ツール実行の開始
              if (event.event === 'on_tool_start') {
                const toolName = event.name;
                const toolInput = event.data?.input;
                
                yield { type: 'tool_call_start', tool_name: toolName, tool_args: JSON.stringify(toolInput) };
                yield { type: 'text', content: `🔧 **${toolName}** 実行中...\n` };
              }

              // ツール実行の終了
              if (event.event === 'on_tool_end') {
                const toolName = event.name;
                const toolOutput = event.data?.output;
                
                yield { type: 'tool_call_result', tool_name: toolName, result: toolOutput };
                yield { type: 'text', content: `✅ **観察${stepNumber}**: ${toolOutput}\n\n` };
                stepNumber++;
              }

              // エラーハンドリング
              if (event.event === 'on_tool_error') {
                const toolName = event.name;
                const error = event.data?.error;
                
                yield { type: 'tool_call_error', tool_name: toolName, error: error };
                yield { type: 'text', content: `❌ **ツールエラー**: ${error}\n\n` };
              }
            }

            console.log(`✅ Agent実行完了`);
            
            // 最終結果がまだ表示されていない場合の処理
            if (!finalAnswer) {
              yield { type: 'text', content: `\n🎯 **処理完了**: 計算が完了しました。\n` };
            }

          } catch (streamError) {
            console.error('⚠️ AgentExecutor ストリーミングエラー:', streamError);
            
            // フォールバック: 従来の方法で実行
            yield { type: 'text', content: `⚠️ ストリーミング処理でエラーが発生、代替処理で実行中...\n\n` };
            
            const result = await agentExecutor.invoke({ input: query });
            const content = result.output || '結果を取得できませんでした';
            
            yield { type: 'text', content: `📋 **最終結果**:\n` };
            
            const chunkSize = 8;
            for (let i = 0; i < content.length; i += chunkSize) {
              const chunk = content.slice(i, i + chunkSize);
              yield { type: 'text', content: chunk };
              await new Promise(resolve => setTimeout(resolve, 40));
            }
          }

        } catch (reactError) {
          console.warn('⚠️ ReActAgent エラー、フォールバック処理に移行:', reactError.message);

          yield {
            type: 'text',
            content: `⚠️ **高度な推論でエラーが発生**、代替処理に切り替えます...\n\n`
          };

          // フォールバック: 単純なプロンプトベースのツール呼び出し
          yield* this.handleSimpleToolCalling(query, langChainTools);
        }
      } else {
        // ツールなしの場合は直接LLMを使用
        console.log(`💬 ツールなし、直接LLM処理`);

        const systemMessage = `あなたは親切なAIアシスタントです。現在利用可能なツールはありません。一般的な知識と会話能力を活用して、ユーザーの質問に答えてください。`;

        const messages = [
          new SystemMessage(systemMessage),
          new HumanMessage(query)
        ];

        const stream = await this.langChainLLM.stream(messages);

        for await (const chunk of stream) {
          if (chunk.content) {
            yield { type: 'text', content: chunk.content };
          }
        }
      }

    } catch (error) {
      console.error('❌ LangChain ストリーミング処理エラー:', error);
      yield { type: 'error', content: `LangChain エラー: ${error.message}` };
    }
  }

  // 新規追加: 単純なプロンプトベースのツール呼び出し
  async *handleSimpleToolCalling(query, langChainTools) {
    try {
      // ツールの説明を生成
      const toolDescriptions = langChainTools.map(tool =>
        `- ${tool.name}: ${tool.description}`
      ).join('\n');

      // 数式検出の強化
      const mathPattern = /(\d+)\s*[\+\-\*\/×÷]\s*(\d+)/;
      const mathMatch = query.match(mathPattern);

      console.log(`📝 クエリ分析: "${query}"`);
      console.log(`🔧 利用可能ツール: ${langChainTools.length}個`);

      if (mathMatch && langChainTools.some(tool => tool.name === 'add_numbers' || tool.name === 'multiply_numbers')) {
        const numbers = query.match(/\d+/g);
        if (numbers && numbers.length >= 2) {
          const a = parseInt(numbers[0]);
          const b = parseInt(numbers[1]);

          // 演算子を判定
          let toolName = 'add_numbers';
          let operation = '+';
          if (query.includes('×') || query.includes('*') || query.includes('掛け') || query.includes('かけ')) {
            toolName = 'multiply_numbers';
            operation = '×';
          }

          const targetTool = langChainTools.find(t => t.name === toolName);
          if (targetTool) {
            console.log(`🔧 ツール実行開始: ${toolName}`);

            // ツール実行開始を通知
            yield {
              type: 'tool_call_start',
              tool_name: toolName,
              tool_args: JSON.stringify({ a, b })
            };

            // プロセス表示用のテキスト
            yield {
              type: 'text',
              content: `\n🔧 **${toolName}** ツールを使用しています...\n`
            };
            yield {
              type: 'text',
              content: `📝 引数: a=${a}, b=${b}\n`
            };

            try {
              const toolResult = await targetTool.func(JSON.stringify({ a, b }));

              console.log(`✅ ツール実行結果: ${toolResult}`);

              // ツール実行結果を通知
              yield {
                type: 'tool_call_result',
                tool_name: toolName,
                result: toolResult
              };

              // 結果表示
              yield {
                type: 'text',
                content: `✅ **実行結果**: ${toolResult}\n\n`
              };

              // 最終回答を生成
              const finalAnswer = `**答え**: ${a} ${operation} ${b} = ${toolName === 'add_numbers' ? a + b : a * b}`;

              // 最終答えを少しずつ表示
              const chunkSize = 5;
              for (let i = 0; i < finalAnswer.length; i += chunkSize) {
                const chunk = finalAnswer.slice(i, i + chunkSize);
                yield { type: 'text', content: chunk };
                await new Promise(resolve => setTimeout(resolve, 30));
              }

              return;
            } catch (toolError) {
              console.error(`❌ ツール実行エラー: ${toolError.message}`);

              yield {
                type: 'tool_call_error',
                tool_name: toolName,
                error: toolError.message
              };

              yield {
                type: 'text',
                content: `❌ **エラー**: ${toolError.message}\n`
              };
            }
          }
        }
      }

      // ツールを使用しない場合、または失敗した場合の処理
      console.log(`💬 通常の会話として処理`);

      const systemMessage = langChainTools.length > 0
        ? `あなたは親切なAIアシスタントです。利用可能なツールを使って、ユーザーの質問に適切に答えてください。

利用可能なツール:
${toolDescriptions}

数式の計算が含まれる場合は、適切なツールを使用してください。`
        : `あなたは親切なAIアシスタントです。現在利用可能なツールはありません。一般的な知識と会話能力を活用して、ユーザーの質問に答えてください。`;

      const messages = [
        new SystemMessage(systemMessage),
        new HumanMessage(query)
      ];

      const response = await this.langChainLLM.invoke(messages);
      let content = response.content;

      // 結果を小さなチャンクに分割して表示
      const chunkSize = 8;
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize);
        yield { type: 'text', content: chunk };
        await new Promise(resolve => setTimeout(resolve, 40));
      }

    } catch (error) {
      console.error('単純ツール呼び出しエラー:', error);
      yield { type: 'error', content: `ツール呼び出しエラー: ${error.message}` };
    }
  }

  // 新規追加: LangChain 非ストリーミング処理
  async handleLangChainNonStreamingResponse(query, langChainTools) {
    try {
      const systemMessage = langChainTools.length > 0
        ? `あなたは親切なAIアシスタントです。利用可能なツールを使って、ユーザーの質問に適切に答えてください。

利用可能なツール:
${langChainTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

ツールを使用する際は、適切な引数を渡してください。`
        : `あなたは親切なAIアシスタントです。現在利用可能なツールはありません。一般的な知識と会話能力を活用して、ユーザーの質問に答えてください。`;

      if (langChainTools.length > 0) {
        // ツールありの場合はReActAgentを使用
        const prompt = PromptTemplate.fromTemplate(`
あなたは質問に答えるための推論と行動を実行するアシスタントです。以下のツールにアクセスできます:

{tools}

以下の形式を使用してください:

Question: 答える必要がある入力質問
Thought: 何をすべきかを常に考える必要があります
Action: 実行するアクション、[{tool_names}]のいずれかである必要があります
Action Input: アクションへの入力
Observation: アクションの結果
... (この Thought/Action/Action Input/Observation は繰り返すことができます)
Thought: 最終的な答えがわかりました
Final Answer: 元の入力質問に対する最終的な答え

開始!

Question: {input}
Thought: {agent_scratchpad}
`);

        const agent = await createReactAgent({
          llm: this.langChainLLM,
          tools: langChainTools,
          prompt,
        });

        const agentExecutor = new AgentExecutor({
          agent,
          tools: langChainTools,
          verbose: true,
        });

        const result = await agentExecutor.invoke({ input: query });

        return {
          type: 'response',
          content: result.output,
          tool_calls: [] // LangChainの場合、ツール呼び出し詳細は含まれない
        };
      } else {
        // ツールなしの場合は直接LLMを使用
        const messages = [
          new SystemMessage(systemMessage),
          new HumanMessage(query)
        ];

        const response = await this.langChainLLM.invoke(messages);

        return {
          type: 'response',
          content: response.content,
          tool_calls: []
        };
      }

    } catch (error) {
      console.error('LangChain 処理エラー:', error);
      return {
        type: 'error',
        content: `LangChain エラー: ${error.message}`
      };
    }
  }

  // 既存: OpenAI用の処理（そのまま）
  processQueryWithOpenAI(query, options = {}) {
    // ローカルLLMの場合はモデル名を適切に設定
    let model = options.model || AI_CONFIG.model;
    if (AI_CONFIG.provider === 'localllm') {
      model = AI_CONFIG.localLlmModel;
    }

    const streaming = options.streaming !== undefined ? options.streaming : AI_CONFIG.streaming;
    const temperature = options.temperature !== undefined ? options.temperature : AI_CONFIG.temperature;
    const maxTokens = options.maxTokens !== undefined ? options.maxTokens : AI_CONFIG.maxTokens;
    const selectedTools = options.tools || [];

    // 選択されたツールを検証
    const validation = this.toolManager.validateSelectedTools(selectedTools);
    if (!validation.valid) {
      throw new Error(`以下のツールが見つかりません: ${validation.notFound.join(', ')}`);
    }

    // 選択されたツールのOpenAI定義を取得
    const availableTools = this.toolManager.getSelectedOpenAITools(selectedTools);

    // システムプロンプトを動的に生成
    let systemPrompt = `あなたは親切なAIアシスタントです。`;

    if (availableTools.length > 0) {
      systemPrompt += `利用可能なツールを使って、ユーザーの質問に適切に答えてください。

利用可能なツール:
${availableTools.map(tool => `- ${tool.function.name}: ${tool.function.description}`).join('\n')}

ツールを使用する際は、適切な引数を渡してください。`;
    } else {
      systemPrompt += `現在利用可能なツールはありません。一般的な知識と会話能力を活用して、ユーザーの質問に答えてください。`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ];

    const requestParams = {
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens,
      stream: streaming
    };

    // ツールが選択されている場合のみtools設定を追加
    if (availableTools.length > 0) {
      requestParams.tools = availableTools;
      requestParams.tool_choice = 'auto';
    }

    if (streaming) {
      return this.handleStreamingResponse(requestParams);
    } else {
      return this.handleNonStreamingResponse(requestParams);
    }
  }

  async *handleStreamingResponse(requestParams) {
    try {
      console.log(`ストリーミングリクエスト開始 (${AI_CONFIG.provider.toUpperCase()})`);
      console.log(`使用可能ツール数: ${requestParams.tools ? requestParams.tools.length : 0}`);
      console.log(`モデル: ${requestParams.model}`);

      const completion = await this.openai.chat.completions.create(requestParams);

      let toolCalls = [];
      let hasContent = false;

      for await (const chunk of completion) {
        const delta = chunk.choices?.[0]?.delta;
        const finishReason = chunk.choices?.[0]?.finish_reason;

        if (!delta) continue;

        if (delta.content) {
          hasContent = true;
          yield { type: 'text', content: delta.content };
        }

        if (delta.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;

            if (index !== undefined) {
              if (!toolCalls[index]) {
                toolCalls[index] = {
                  id: toolCallDelta.id || '',
                  type: 'function',
                  function: { name: '', arguments: '' }
                };
              }

              const currentToolCall = toolCalls[index];

              if (toolCallDelta.id) {
                currentToolCall.id = toolCallDelta.id;
              }

              if (toolCallDelta.function) {
                if (toolCallDelta.function.name) {
                  currentToolCall.function.name += toolCallDelta.function.name;
                }
                if (toolCallDelta.function.arguments) {
                  currentToolCall.function.arguments += toolCallDelta.function.arguments;
                }
              }
            }
          }
        }

        if (finishReason === 'tool_calls' && toolCalls.length > 0) {
          yield { type: 'tool_calls_start' };

          const toolMessages = [];

          for (const toolCall of toolCalls) {
            if (!toolCall.function.name) continue;

            try {
              yield {
                type: 'tool_call_start',
                tool_name: toolCall.function.name,
                tool_args: toolCall.function.arguments
              };

              let args = {};
              try {
                args = JSON.parse(toolCall.function.arguments || '{}');
              } catch (parseError) {
                throw new Error(`引数のJSONパースエラー: ${parseError.message}`);
              }

              const result = await this.toolManager.executeToolHandler(toolCall.function.name, args);
              const resultText = result.content?.map(c => c.text).join('\n') || 'ツール実行完了';

              yield {
                type: 'tool_call_result',
                tool_name: toolCall.function.name,
                result: resultText
              };

              toolMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: resultText
              });

            } catch (error) {
              console.error(`ツール実行エラー ${toolCall.function.name}:`, error);

              const errorMessage = `エラー: ${error.message}`;

              yield {
                type: 'tool_call_error',
                tool_name: toolCall.function.name,
                error: errorMessage
              };

              toolMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: errorMessage
              });
            }
          }

          yield { type: 'tool_calls_end' };

          if (toolMessages.length > 0) {
            try {
              const followUpMessages = [
                ...requestParams.messages,
                {
                  role: 'assistant',
                  content: null,
                  tool_calls: toolCalls.map(tc => ({
                    id: tc.id,
                    type: tc.type,
                    function: {
                      name: tc.function.name,
                      arguments: tc.function.arguments
                    }
                  }))
                },
                ...toolMessages
              ];

              const followUpParams = {
                model: requestParams.model,
                messages: followUpMessages,
                temperature: requestParams.temperature,
                max_tokens: requestParams.max_tokens,
                stream: true
              };

              // フォローアップにもツール設定を引き継ぎ
              if (requestParams.tools) {
                followUpParams.tools = requestParams.tools;
                followUpParams.tool_choice = 'auto';
              }

              const followUpCompletion = await this.openai.chat.completions.create(followUpParams);

              for await (const followUpChunk of followUpCompletion) {
                const followUpDelta = followUpChunk.choices?.[0]?.delta;
                if (followUpDelta?.content) {
                  yield { type: 'text', content: followUpDelta.content };
                }
              }

            } catch (followUpError) {
              console.error('フォローアップリクエストエラー:', followUpError);
              yield {
                type: 'text',
                content: `\n\n[ツール実行は完了しましたが、最終応答の生成でエラーが発生しました: ${followUpError.message}]`
              };
            }
          }
        }
      }

      if (!hasContent && toolCalls.length === 0) {
        yield { type: 'text', content: 'すみません、適切な回答を生成できませんでした。' };
      }

    } catch (error) {
      console.error('ストリーミング処理エラー:', error);
      yield { type: 'error', content: `ストリーミングエラー: ${error.message}` };
    }
  }

  async handleNonStreamingResponse(requestParams) {
    try {
      console.log(`非ストリーミングリクエスト (${AI_CONFIG.provider.toUpperCase()}) - 使用可能ツール数: ${requestParams.tools ? requestParams.tools.length : 0}`);
      console.log(`モデル: ${requestParams.model}`);

      const response = await this.openai.chat.completions.create(requestParams);
      const message = response.choices[0].message;

      let result = {
        type: 'response',
        content: message.content || '',
        tool_calls: []
      };

      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const toolResult = await this.toolManager.executeToolHandler(toolCall.function.name, args);

            result.tool_calls.push({
              name: toolCall.function.name,
              arguments: args,
              result: toolResult.content.map(c => c.text).join('\n')
            });

          } catch (error) {
            result.tool_calls.push({
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
              error: error.message
            });
          }
        }

        const followUpMessages = [
          ...requestParams.messages,
          message,
          ...message.tool_calls.map((toolCall, index) => ({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result.tool_calls[index].result || result.tool_calls[index].error
          }))
        ];

        const followUpParams = {
          ...requestParams,
          messages: followUpMessages,
          stream: false
        };

        const followUpResponse = await this.openai.chat.completions.create(followUpParams);

        result.content = followUpResponse.choices[0].message.content || '';
      }

      return result;

    } catch (error) {
      return {
        type: 'error',
        content: error.message
      };
    }
  }
}

// 初期化
const toolManager = new ToolManager();
openai = initializeOpenAI();
const aiAgent = (openai || langChainLLM) ? new AIAgent(toolManager, openai) : null;

// MCP サーバー作成 - 最新API
function createMcpServer() {
  const server = new McpServer(
    {
      name: "dynamic-tool-mcp-http",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // ツール定義を動的に追加
  for (const [toolName, tool] of toolManager.tools) {
    server.tool(
      tool.name,
      tool.inputSchema,
      async (args) => {
        try {
          return await toolManager.executeToolHandler(tool.name, args);
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `エラー: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
    );
  }

  return server;
}

// HTTPサーバー起動処理
async function main() {
  await toolManager.loadTools();

  const app = express();

  app.use(cors({
    origin: true,
    credentials: true
  }));

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // ヘルスチェックエンドポイント
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      name: 'dynamic-tool-mcp-http',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      loadedTools: toolManager.tools.size,
      aiAgent: !!aiAgent,
      aiConfig: aiAgent ? {
        provider: AI_CONFIG.provider,
        model: AI_CONFIG.model,
        streaming: AI_CONFIG.streaming,
        localLlmUrl: AI_CONFIG.provider === 'localllm' ? AI_CONFIG.localLlmUrl : undefined,
        localLlmModel: AI_CONFIG.provider === 'localllm' ? AI_CONFIG.localLlmModel : undefined,
        langChainEnabled: AI_CONFIG.provider === 'localllm' && !!langChainLLM
      } : null
    });
  });

  // ツール一覧エンドポイント（アイコン情報含む）
  app.get('/tools', (req, res) => {
    res.json({
      tools: toolManager.getToolsList(),
      count: toolManager.tools.size
    });
  });

  // ツールアイコン取得エンドポイント
  app.get('/tools/:toolName/icon', async (req, res) => {
    try {
      const { toolName } = req.params;
      const iconData = await toolManager.getToolIcon(toolName);

      if (!iconData) {
        return res.status(404).json({
          error: 'アイコンが見つかりません'
        });
      }

      res.setHeader('Content-Type', iconData.contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1時間キャッシュ
      res.send(iconData.data);
    } catch (error) {
      console.error('アイコン取得エラー:', error);
      res.status(500).json({
        error: 'アイコン取得エラー',
        message: error.message
      });
    }
  });

  // ツールリロードエンドポイント
  app.post('/tools/reload', async (req, res) => {
    try {
      await toolManager.reloadTools();
      res.json({
        status: 'success',
        message: 'ツールをリロードしました',
        loadedTools: toolManager.tools.size,
        tools: toolManager.getToolsList()
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // AIエージェントエンドポイント（修正版）
  app.post('/agent', async (req, res) => {
    if (!aiAgent) {
      return res.status(503).json({
        error: 'AIエージェントが利用できません',
        message: `${AI_CONFIG.provider.toUpperCase()} の設定を確認してサーバーを再起動してください`
      });
    }

    const { query, streaming, model, temperature, maxTokens, tools } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'query フィールドは必須です'
      });
    }

    // ツール選択が必須に（空配列は許可）
    if (tools === undefined) {
      return res.status(400).json({
        error: 'tools フィールドは必須です（空配列も可）',
        message: '使用するツールの名前を配列で指定してください。例: {"tools": ["add_numbers", "multiply_numbers"]}'
      });
    }

    if (!Array.isArray(tools)) {
      return res.status(400).json({
        error: 'tools フィールドは配列である必要があります',
        message: '例: {"tools": ["add_numbers", "multiply_numbers"]}'
      });
    }

    const options = {
      streaming: streaming !== undefined ? streaming : AI_CONFIG.streaming,
      model: model || AI_CONFIG.model,
      temperature: temperature !== undefined ? temperature : AI_CONFIG.temperature,
      maxTokens: maxTokens !== undefined ? maxTokens : AI_CONFIG.maxTokens,
      tools: tools // 選択されたツールを追加
    };

    try {
      if (options.streaming) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const stream = aiAgent.processQuery(query, options);

        for await (const chunk of stream) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        res.write('data: {"type": "end"}\n\n');
        res.end();

      } else {
        const result = await aiAgent.processQuery(query, options);
        res.json(result);
      }

    } catch (error) {
      console.error('Agent error:', error);
      if (options.streaming) {
        res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({
          error: 'AIエージェント処理エラー',
          message: error.message
        });
      }
    }
  });

  // AI設定取得エンドポイント
  app.get('/agent/config', (req, res) => {
    res.json({
      available: !!aiAgent,
      config: AI_CONFIG,
      langChainEnabled: AI_CONFIG.provider === 'localllm' && !!langChainLLM,
      tools: toolManager.getOpenAITools().map(tool => ({
        name: tool.function.name,
        description: tool.function.description
      }))
    });
  });

  // AI設定更新エンドポイント
  app.post('/agent/config', (req, res) => {
    const { provider, model, streaming, temperature, maxTokens, localLlmUrl, localLlmModel } = req.body;

    if (provider && ['openai', 'azureopenai', 'localllm'].includes(provider)) {
      AI_CONFIG.provider = provider;
    }
    if (model) AI_CONFIG.model = model;
    if (streaming !== undefined) AI_CONFIG.streaming = streaming;
    if (temperature !== undefined) AI_CONFIG.temperature = temperature;
    if (maxTokens !== undefined) AI_CONFIG.maxTokens = maxTokens;
    if (localLlmUrl) AI_CONFIG.localLlmUrl = localLlmUrl;
    if (localLlmModel) AI_CONFIG.localLlmModel = localLlmModel;

    res.json({
      status: 'success',
      message: 'AI設定を更新しました',
      config: AI_CONFIG,
      note: 'プロバイダーを変更した場合はサーバーの再起動が必要です'
    });
  });

  // .env管理エンドポイント

  // 現在の.env内容を取得
  app.get('/env', (req, res) => {
    try {
      const envPath = path.join(__dirname, '.env');

      // .envファイルが存在するかチェック
      if (!existsSync(envPath)) {
        return res.json({
          exists: false,
          content: '',
          variables: {}
        });
      }

      const envContent = readFileSync(envPath, 'utf8');

      // 環境変数をパースして返す（機密情報をマスク）
      const variables = {};
      const lines = envContent.split('\n');

      lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=');

            // API キーなどの機密情報をマスク
            if (key.includes('API_KEY') || key.includes('KEY')) {
              variables[key] = value ? '***MASKED***' : '';
            } else {
              variables[key] = value;
            }
          }
        }
      });

      res.json({
        exists: true,
        content: envContent,
        variables: variables,
        currentConfig: {
          AI_PROVIDER: process.env.AI_PROVIDER,
          AI_MODEL: process.env.AI_MODEL,
          AI_TEMPERATURE: process.env.AI_TEMPERATURE,
          AI_STREAMING: process.env.AI_STREAMING,
          LOCAL_LLM_URL: process.env.LOCAL_LLM_URL,
          LOCAL_LLM_MODEL: process.env.LOCAL_LLM_MODEL,
          AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
          AZURE_OPENAI_API_VERSION: process.env.AZURE_OPENAI_API_VERSION,
          PORT: process.env.PORT,
          HOST: process.env.HOST
        }
      });

    } catch (error) {
      console.error('.env読み取りエラー:', error);
      res.status(500).json({
        error: '.env読み取りエラー',
        message: error.message
      });
    }
  });

  // .envファイルを更新
  app.post('/env', async (req, res) => {
    try {
      const { envContent, variables } = req.body;

      if (!envContent && !variables) {
        return res.status(400).json({
          error: 'envContent または variables が必要です'
        });
      }

      const envPath = path.join(__dirname, '.env');
      let finalContent = '';

      if (envContent) {
        // 直接的な内容更新
        finalContent = envContent;
      } else if (variables) {
        // 変数ベースの更新
        const existingContent = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
        const existingVars = new Map();
        const comments = [];

        // 既存の.envファイルをパースして、コメントと変数を分離
        existingContent.split('\n').forEach(line => {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('#') || trimmedLine === '') {
            comments.push(line);
          } else if (trimmedLine.includes('=')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key) {
              existingVars.set(key.trim(), valueParts.join('='));
            }
          }
        });

        // 新しい変数で既存の変数を更新
        Object.entries(variables).forEach(([key, value]) => {
          existingVars.set(key, value);
        });

        // 最終的な内容を構築
        const lines = [];

        // コメントセクションを追加
        if (comments.length > 0) {
          lines.push('# AI Agent Configuration');
          lines.push('# Updated: ' + new Date().toISOString());
          lines.push('');
        }

        // 変数を追加（順序を保持）
        const orderedKeys = [
          'AI_PROVIDER', 'AI_MODEL', 'AI_TEMPERATURE', 'AI_STREAMING', 'AI_MAX_TOKENS',
          'OPENAI_API_KEY',
          'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_VERSION',
          'LOCAL_LLM_URL', 'LOCAL_LLM_MODEL',
          'PORT', 'HOST'
        ];

        orderedKeys.forEach(key => {
          if (existingVars.has(key)) {
            lines.push(`${key}=${existingVars.get(key)}`);
            existingVars.delete(key);
          }
        });

        // 残りの変数を追加
        existingVars.forEach((value, key) => {
          lines.push(`${key}=${value}`);
        });

        finalContent = lines.join('\n');
      }

      // バックアップを作成
      const backupPath = path.join(__dirname, `.env.backup.${Date.now()}`);
      if (existsSync(envPath)) {
        copyFileSync(envPath, backupPath);
      }

      // .envファイルを更新
      writeFileSync(envPath, finalContent, 'utf8');

      res.json({
        status: 'success',
        message: '.envファイルを更新しました',
        backupPath: backupPath,
        note: '変更を反映するには /env/reload を呼び出すか、サーバーを再起動してください'
      });

    } catch (error) {
      console.error('.env更新エラー:', error);
      res.status(500).json({
        error: '.env更新エラー',
        message: error.message
      });
    }
  });

  // .env内容を再読み込み（プロセス再起動なし）
  app.post('/env/reload', async (req, res) => {
    try {
      const envPath = path.join(__dirname, '.env');

      if (!existsSync(envPath)) {
        return res.status(404).json({
          error: '.envファイルが見つかりません'
        });
      }

      // 現在の環境変数をバックアップ
      const originalEnv = { ...process.env };

      // .envファイルを再読み込み
      const envContent = readFileSync(envPath, 'utf8');
      const envVars = {};

      envContent.split('\n').forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=');
            envVars[key] = value;
            process.env[key] = value;
          }
        }
      });

      // AI設定を更新
      if (envVars.AI_PROVIDER) AI_CONFIG.provider = envVars.AI_PROVIDER;
      if (envVars.AI_MODEL) AI_CONFIG.model = envVars.AI_MODEL;
      if (envVars.AI_TEMPERATURE) AI_CONFIG.temperature = parseFloat(envVars.AI_TEMPERATURE);
      if (envVars.AI_STREAMING !== undefined) AI_CONFIG.streaming = envVars.AI_STREAMING !== 'false';
      if (envVars.AI_MAX_TOKENS) AI_CONFIG.maxTokens = parseInt(envVars.AI_MAX_TOKENS);
      if (envVars.LOCAL_LLM_URL) AI_CONFIG.localLlmUrl = envVars.LOCAL_LLM_URL;
      if (envVars.LOCAL_LLM_MODEL) AI_CONFIG.localLlmModel = envVars.LOCAL_LLM_MODEL;

      // OpenAIクライアントを再初期化
      const oldProvider = AI_CONFIG.provider;
      const newOpenAI = initializeOpenAI();

      if (newOpenAI || langChainLLM) {
        openai = newOpenAI;
        // AIエージェントを再初期化
        if (aiAgent) {
          Object.setPrototypeOf(aiAgent, AIAgent.prototype);
          aiAgent.openai = newOpenAI;
          aiAgent.langChainLLM = langChainLLM;
        } else {
          global.aiAgent = new AIAgent(toolManager, newOpenAI);
        }
      }

      res.json({
        status: 'success',
        message: '.env設定を再読み込みしました',
        reloadedVars: Object.keys(envVars),
        oldProvider: oldProvider,
        newProvider: AI_CONFIG.provider,
        aiClientReinitialized: !!(newOpenAI || langChainLLM),
        langChainEnabled: AI_CONFIG.provider === 'localllm' && !!langChainLLM,
        currentConfig: AI_CONFIG
      });

    } catch (error) {
      console.error('.env再読み込みエラー:', error);
      res.status(500).json({
        error: '.env再読み込みエラー',
        message: error.message
      });
    }
  });

  // MCP情報エンドポイント
  app.get('/info', (req, res) => {
    res.json({
      name: "dynamic-tool-mcp-http",
      version: "1.0.0",
      description: "動的ツール管理MCP対応サーバー（HTTP版）+ AIエージェント + アイコン対応 + ローカルLLM対応（LangChain.js Agent） + .env管理機能",
      transport: "streamable-http",
      loadedTools: toolManager.tools.size,
      toolsDirectory: TOOLS_DIR,
      aiAgent: !!aiAgent,
      aiConfig: aiAgent ? AI_CONFIG : null,
      langChainEnabled: AI_CONFIG.provider === 'localllm' && !!langChainLLM,
      endpoints: {
        mcp: `/mcp`,
        health: `/health`,
        info: `/info`,
        tools: `/tools`,
        toolIcon: `/tools/:toolName/icon`,
        reload: `/tools/reload`,
        agent: `/agent`,
        agentConfig: `/agent/config`,
        env: `/env`,
        envReload: `/env/reload`
      }
    });
  });

  // セッション管理用マップ
  const transports = new Map();

  // MCP Streamable HTTP エンドポイント（セッション管理付き）
  app.post('/mcp', async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'];
      let transport;
      let server;

      if (sessionId && transports.has(sessionId)) {
        const session = transports.get(sessionId);
        transport = session.transport;
        server = session.server;
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const newSessionId = randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
        });
        server = createMcpServer();

        transports.set(newSessionId, { transport, server });
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);

    } catch (error) {
      console.error('MCP request handling error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // GET リクエスト（サーバーからクライアントへの通信用）
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];

    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const { transport } = transports.get(sessionId);
    await transport.handleRequest(req, res);
  });

  // セッション削除
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];

    if (sessionId && transports.has(sessionId)) {
      const { transport, server } = transports.get(sessionId);
      await transport.close();
      await server.close();
      transports.delete(sessionId);
    }

    res.status(200).send('Session deleted');
  });

  // HTTPサーバー起動
  const httpServer = app.listen(PORT, HOST, () => {
    console.log(`🚀 Dynamic Tool MCP Server + AI Agent（LangChain.js対応版）が起動しました`);
    console.log(`   URL: http://${HOST}:${PORT}`);
    console.log(`   MCP Endpoint: http://${HOST}:${PORT}/mcp`);
    console.log(`   AI Agent: http://${HOST}:${PORT}/agent`);
    console.log(`   Health Check: http://${HOST}:${PORT}/health`);
    console.log(`   Tools List: http://${HOST}:${PORT}/tools`);
    console.log(`   Tool Icons: http://${HOST}:${PORT}/tools/:toolName/icon`);
    console.log(`   Tools Reload: POST http://${HOST}:${PORT}/tools/reload`);
    console.log(`   Env Management: GET/POST http://${HOST}:${PORT}/env`);
    console.log(`   Env Reload: POST http://${HOST}:${PORT}/env/reload`);
    console.log(`   Info: http://${HOST}:${PORT}/info`);
    console.log(`   Tools Directory: ${TOOLS_DIR}`);

    if (aiAgent) {
      console.log(`   🤖 AIエージェント有効: ${AI_CONFIG.provider.toUpperCase()}`);
      if (AI_CONFIG.provider === 'localllm') {
        console.log(`   🔗 ローカルLLM: ${AI_CONFIG.localLlmUrl}`);
        console.log(`   📦 モデル: ${AI_CONFIG.localLlmModel}`);
        console.log(`   🦜 LangChain.js: ${!!langChainLLM ? '有効' : '無効'}`);
      } else {
        console.log(`   📦 モデル: ${AI_CONFIG.model}`);
      }
    } else {
      console.log(`   ⚠️  AIエージェント無効: 設定を確認してください`);
    }
  });

  // グレースフルシャットダウン
  const shutdown = async (signal) => {
    console.log(`\n${signal} 受信: サーバーを終了しています...`);

    for (const [sessionId, session] of transports) {
      try {
        await session.transport.close();
        await session.server.close();
      } catch (error) {
        console.error(`セッション ${sessionId} の終了エラー:`, error);
      }
    }

    httpServer.close(() => {
      console.log("サーバーが正常に終了しました");
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// メイン関数実行
main().catch((error) => {
  console.error("サーバー起動エラー:", error);
  process.exit(1);
});