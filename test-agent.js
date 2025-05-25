#!/usr/bin/env node

/**
 * AI Agent 機能の包括的テスト（選択ツール対応版 + ローカルLLM対応）
 * 
 * 使用方法:
 * 1. 環境変数を設定
 *    - OpenAI: OPENAI_API_KEY
 *    - Azure OpenAI: OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT
 *    - ローカルLLM: LOCAL_LLM_URL, LOCAL_LLM_MODEL
 * 2. 別のターミナルで `node server.js` を実行してサーバーを起動
 * 3. このスクリプトを実行: `node test-agent.js`
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

// 環境変数の読み込み（.envファイル）
dotenv.config();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

const SERVER_URL = `http://${HOST}:${PORT}` || 'http://localhost:3000';
const AGENT_ENDPOINT = `${SERVER_URL}/agent`;

/**
 * AIエージェントテストクライアント
 */
class AgentTestClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  /**
   * 非ストリーミング方式でエージェントに質問
   */
  async query(query, options = {}) {
    const response = await fetch(`${this.baseUrl}/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: query,
        streaming: false,
        ...options
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  }

  /**
   * ストリーミング方式でエージェントに質問
   */
  async queryStreamAsArray(query, options = {}) {
    const response = await fetch(`${this.baseUrl}/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: query,
        streaming: true,
        ...options
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    // レスポンス全体をテキストとして読み取り
    const text = await response.text();
    const chunks = [];
    
    // Server-Sent Events形式をパース
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data) {
          try {
            const parsed = JSON.parse(data);
            chunks.push(parsed);
          } catch (error) {
            // JSON parse error, skip
            console.warn('JSON parse error:', data);
          }
        }
      }
    }
    
    return chunks;
  }

  /**
   * エージェント設定を取得
   */
  async getConfig() {
    const response = await fetch(`${this.baseUrl}/agent/config`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return await response.json();
  }

  /**
   * エージェント設定を更新
   */
  async updateConfig(config) {
    const response = await fetch(`${this.baseUrl}/agent/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return await response.json();
  }

  /**
   * 利用可能ツール一覧を取得
   */
  async getTools() {
    const response = await fetch(`${this.baseUrl}/tools`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return await response.json();
  }
}

async function testAgentAvailability() {
  console.log("🔍 AIエージェント利用可能性チェック:");
  
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    const health = await response.json();
    
    console.log(`  📊 サーバー状態: ${health.status}`);
    console.log(`  🤖 AIエージェント: ${health.aiAgent ? '✅ 有効' : '❌ 無効'}`);
    
    if (health.aiAgent && health.aiConfig) {
      console.log(`  🔧 設定:`);
      console.log(`    プロバイダー: ${health.aiConfig.provider}`);
      
      if (health.aiConfig.provider === 'localllm') {
        console.log(`    ローカルLLM URL: ${health.aiConfig.localLlmUrl}`);
        console.log(`    モデル: ${health.aiConfig.localLlmModel}`);
      } else {
        console.log(`    モデル: ${health.aiConfig.model}`);
      }
      
      console.log(`    ストリーミング: ${health.aiConfig.streaming}`);
    }
    
    return health.aiAgent;
  } catch (error) {
    console.log(`  ❌ ヘルスチェック失敗: ${error.message}`);
    return false;
  }
}

async function testAgentConfig() {
  console.log("\n⚙️ エージェント設定テスト:");
  
  const client = new AgentTestClient(SERVER_URL);
  
  try {
    const config = await client.getConfig();
    
    console.log(`  ✅ 設定取得成功`);
    console.log(`  📋 利用可能: ${config.available}`);
    console.log(`  🔧 プロバイダー: ${config.config.provider}`);
    
    if (config.config.provider === 'localllm') {
      console.log(`  🔗 ローカルLLM URL: ${config.config.localLlmUrl}`);
      console.log(`  🤖 モデル: ${config.config.localLlmModel}`);
    } else {
      console.log(`  🤖 モデル: ${config.config.model}`);
    }
    
    console.log(`  📡 ストリーミング: ${config.config.streaming}`);
    console.log(`  📦 利用可能ツール数: ${config.tools.length}`);
    
    console.log("  🛠️ 利用可能ツール:");
    config.tools.forEach(tool => {
      console.log(`    - ${tool.name}: ${tool.description}`);
    });
    
    return config.tools;
  } catch (error) {
    console.log(`  ❌ 設定取得失敗: ${error.message}`);
    return [];
  }
}

async function testParameterValidation() {
  console.log("\n🔍 パラメータバリデーションテスト:");
  
  const client = new AgentTestClient(SERVER_URL);
  
  // toolsパラメータなしのテスト
  console.log("  📝 toolsパラメータなしテスト:");
  try {
    await client.query("こんにちは");
    console.log("    ❌ エラーが発生するべきでした");
  } catch (error) {
    console.log(`    ✅ 期待通りエラー: ${error.message}`);
  }
  
  // toolsパラメータが配列でない場合のテスト
  console.log("\n  📝 toolsパラメータが非配列テスト:");
  try {
    await client.query("こんにちは", { tools: "invalid" });
    console.log("    ❌ エラーが発生するべきでした");
  } catch (error) {
    console.log(`    ✅ 期待通りエラー: ${error.message}`);
  }
  
  // 存在しないツールを指定した場合のテスト
  console.log("\n  📝 存在しないツール指定テスト:");
  try {
    const response = await client.query("こんにちは", { tools: ["non_existent_tool"] });
    console.log("    ❌ エラーが発生するべきでした");
  } catch (error) {
    console.log(`    ✅ 期待通りエラー: ${error.message}`);
  }
}

async function testSimpleQueries() {
  console.log("\n💬 シンプル質問テスト:");
  
  const client = new AgentTestClient(SERVER_URL);
  
  const testQueries = [
    {
      query: "こんにちは",
      tools: [],
      expectTools: false
    },
    {
      query: "あなたは何ができますか？",
      tools: [],
      expectTools: false
    },
    {
      query: "今日の天気はどうですか？",
      tools: [],
      expectTools: false
    }
  ];
  
  for (let i = 0; i < testQueries.length; i++) {
    const testCase = testQueries[i];
    console.log(`\n  📝 質問${i + 1}: "${testCase.query}"`);
    console.log(`  🛠️ 使用ツール: [${testCase.tools.join(', ')}]`);
    
    try {
      const response = await client.query(testCase.query, { tools: testCase.tools });
      
      if (response.type === 'response') {
        console.log(`  ✅ 回答: ${response.content.substring(0, 100)}${response.content.length > 100 ? '...' : ''}`);
        
        if (response.tool_calls && response.tool_calls.length > 0) {
          console.log(`  🛠️ ツール使用: ${response.tool_calls.length}個`);
          response.tool_calls.forEach(call => {
            console.log(`    - ${call.name}: ${call.result || call.error}`);
          });
        } else if (testCase.expectTools) {
          console.log(`  ⚠️ 期待されたツールが使用されませんでした`);
        }
      } else {
        console.log(`  ❌ エラー: ${response.content}`);
      }
    } catch (error) {
      console.log(`  ❌ 質問失敗: ${error.message}`);
    }
  }
}

async function testToolUsage() {
  console.log("\n🛠️ ツール使用テスト:");
  
  const client = new AgentTestClient(SERVER_URL);
  
  const toolQueries = [
    {
      query: "5と3を足してください",
      tools: ["add_numbers"],
      expectTools: true
    },
    {
      query: "12と8を掛け算してください", 
      tools: ["multiply_numbers"],
      expectTools: true
    },
    {
      query: "「Hello World」を大文字にしてください",
      tools: ["process_string"],
      expectTools: true
    },
    {
      query: "「JavaScript」の文字数を教えてください",
      tools: ["process_string"],
      expectTools: true
    },
    {
      query: "10と5の足し算の結果に、2を掛けてください", // 複数ツール使用
      tools: ["add_numbers", "multiply_numbers"],
      expectTools: true
    }
  ];
  
  for (let i = 0; i < toolQueries.length; i++) {
    const testCase = toolQueries[i];
    console.log(`\n  📝 ツール質問${i + 1}: "${testCase.query}"`);
    console.log(`  🛠️ 使用可能ツール: [${testCase.tools.join(', ')}]`);
    
    try {
      const response = await client.query(testCase.query, { tools: testCase.tools });
      
      if (response.type === 'response') {
        console.log(`  ✅ 回答: ${response.content}`);
        
        if (response.tool_calls && response.tool_calls.length > 0) {
          console.log(`  🛠️ 使用されたツール: ${response.tool_calls.length}個`);
          response.tool_calls.forEach((call, idx) => {
            console.log(`    ${idx + 1}. ${call.name}(${JSON.stringify(call.arguments)})`);
            console.log(`       結果: ${call.result || call.error}`);
          });
        } else if (testCase.expectTools) {
          console.log(`  ⚠️ 期待されたツールが使用されませんでした`);
        }
      } else {
        console.log(`  ❌ エラー: ${response.content}`);
      }
    } catch (error) {
      console.log(`  ❌ 質問失敗: ${error.message}`);
    }
  }
}

async function testToolSelection() {
  console.log("\n🎯 ツール選択テスト:");
  
  const client = new AgentTestClient(SERVER_URL);
  
  // 同じ質問で異なるツール選択をテスト
  const query = "数値の計算をしてください: 6と4を処理してください";
  const testCases = [
    {
      name: "足し算ツールのみ",
      tools: ["add_numbers"],
      description: "足し算のみ利用可能"
    },
    {
      name: "掛け算ツールのみ", 
      tools: ["multiply_numbers"],
      description: "掛け算のみ利用可能"
    },
    {
      name: "両方のツール",
      tools: ["add_numbers", "multiply_numbers"],
      description: "両方のツールが利用可能"
    },
    {
      name: "ツール無し",
      tools: [],
      description: "計算ツールなし"
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n  📝 ${testCase.name}: "${query}"`);
    console.log(`  🛠️ ${testCase.description}: [${testCase.tools.join(', ')}]`);
    
    try {
      const response = await client.query(query, { tools: testCase.tools });
      
      if (response.type === 'response') {
        console.log(`  ✅ 回答: ${response.content.substring(0, 150)}${response.content.length > 150 ? '...' : ''}`);
        
        if (response.tool_calls && response.tool_calls.length > 0) {
          console.log(`  🛠️ 実際に使用されたツール:`);
          response.tool_calls.forEach(call => {
            console.log(`    - ${call.name}: ${call.result || call.error}`);
          });
          
          // 選択外のツールが使用されていないかチェック
          const usedTools = response.tool_calls.map(call => call.name);
          const unauthorizedTools = usedTools.filter(tool => !testCase.tools.includes(tool));
          if (unauthorizedTools.length > 0) {
            console.log(`    ⚠️ 選択外のツールが使用されました: ${unauthorizedTools.join(', ')}`);
          }
        } else {
          console.log(`  📋 ツール未使用（一般的な回答）`);
        }
      } else {
        console.log(`  ❌ エラー: ${response.content}`);
      }
    } catch (error) {
      console.log(`  ❌ 質問失敗: ${error.message}`);
    }
  }
}

async function testStreamingMode() {
  console.log("\n📡 ストリーミングモードテスト:");
  
  const client = new AgentTestClient(SERVER_URL);
  const query = "15と27を足してから、結果を大文字の文字列として表示してください";
  const tools = ["add_numbers", "process_string"];
  
  console.log(`  📝 質問: "${query}"`);
  console.log(`  🛠️ 使用可能ツール: [${tools.join(', ')}]`);
  console.log("  📡 ストリーミング開始...\n");
  
  try {
    const chunks = await client.queryStreamAsArray(query, { tools });
    
    let fullResponse = '';
    let toolCalls = [];
    
    for (const chunk of chunks) {
      switch (chunk.type) {
        case 'text':
          process.stdout.write(chunk.content);
          fullResponse += chunk.content;
          break;
          
        case 'tool_calls_start':
          console.log('\n\n  🛠️ ツール呼び出し開始');
          break;
          
        case 'tool_call_start':
          console.log(`    🔧 ${chunk.tool_name} 実行中...`);
          break;
          
        case 'tool_call_result':
          console.log(`    ✅ ${chunk.tool_name}: ${chunk.result}`);
          toolCalls.push({ name: chunk.tool_name, result: chunk.result });
          break;
          
        case 'tool_call_error':
          console.log(`    ❌ ${chunk.tool_name}: ${chunk.error}`);
          break;
          
        case 'tool_calls_end':
          console.log('  🛠️ ツール呼び出し完了\n');
          break;
          
        case 'error':
          console.log(`\n  ❌ エラー: ${chunk.content}`);
          break;
          
        case 'end':
          console.log('\n\n  📡 ストリーミング完了');
          break;
      }
    }
    
    console.log(`\n  ✅ 完全な回答: ${fullResponse}`);
    console.log(`  🛠️ 使用ツール数: ${toolCalls.length}`);
    
    if (toolCalls.length === 0) {
      console.log("  ⚠️ ツールが使用されませんでした。質問を見直すか、AIの応答を確認してください。");
    }
    
    // 選択外のツールが使用されていないかチェック
    const usedTools = toolCalls.map(call => call.name);
    const unauthorizedTools = usedTools.filter(tool => !tools.includes(tool));
    if (unauthorizedTools.length > 0) {
      console.log(`  ⚠️ 選択外のツールが使用されました: ${unauthorizedTools.join(', ')}`);
    }
    
  } catch (error) {
    console.log(`\n  ❌ ストリーミング失敗: ${error.message}`);
  }
}

async function testErrorHandling() {
  console.log("\n🚨 エラーハンドリングテスト:");
  
  const client = new AgentTestClient(SERVER_URL);
  
  // 空のクエリ
  console.log("  🔍 空のクエリテスト:");
  try {
    await client.query("", { tools: [] });
    console.log("    ❌ エラーが発生するべきでした");
  } catch (error) {
    console.log(`    ✅ 期待通りエラー: ${error.message}`);
  }
  
  // ツール選択なしで計算を要求
  console.log("\n  🔍 ツール未選択で計算要求テスト:");
  try {
    const response = await client.query("5と3を足してください", { tools: [] });
    console.log(`    ✅ 適切な回答: ${response.content.substring(0, 100)}...`);
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log("    ⚠️ ツールが選択されていないのにツールが使用されました");
    }
  } catch (error) {
    console.log(`    ❌ 想定外のエラー: ${error.message}`);
  }
  
  // 無効な引数でツール使用
  console.log("\n  🔍 無効な引数でのツール呼び出しテスト:");
  try {
    const response = await client.query("「abc」と「def」を足し算してください", { 
      tools: ["add_numbers"] 
    });
    
    if (response.tool_calls && response.tool_calls.some(call => call.error)) {
      console.log("    ✅ ツールエラーが適切に処理されました");
    } else {
      console.log("    ✅ AIが適切に対応しました");
    }
    console.log(`    回答: ${response.content}`);
  } catch (error) {
    console.log(`    ❌ 想定外のエラー: ${error.message}`);
  }
  
  // 部分的に無効なツール指定
  console.log("\n  🔍 部分的に無効なツール指定テスト:");
  try {
    const response = await client.query("計算してください", { 
      tools: ["add_numbers", "invalid_tool", "multiply_numbers"] 
    });
    console.log("    ❌ エラーが発生するべきでした");
  } catch (error) {
    console.log(`    ✅ 期待通りエラー: ${error.message}`);
  }
}

async function testLocalLlmSpecific() {
  console.log("\n🏠 ローカルLLM固有テスト:");
  
  const client = new AgentTestClient(SERVER_URL);
  
  try {
    const config = await client.getConfig();
    
    if (config.config.provider !== 'localllm') {
      console.log("  ⏭️ ローカルLLM使用時のみ実行されるテスト - スキップ");
      return;
    }
    
    console.log("  🔗 接続テスト:");
    console.log(`    URL: ${config.config.localLlmUrl}`);
    console.log(`    モデル: ${config.config.localLlmModel}`);
    
    // ローカルLLM固有のテスト項目
    const testQueries = [
      {
        name: "遅延テスト",
        query: "簡単な計算をしてお手いください: 2 + 2",
        tools: ["add_numbers"],
        description: "ローカルLLMの応答時間をテスト"
      },
      {
        name: "複雑なツール組み合わせ",
        query: "プログラミングについて教えてください。そして3と7を足し算、5と4を掛け算してください。",
        tools: ["add_numbers", "multiply_numbers"],
        description: "複雑な処理でのローカルLLMのパフォーマンステスト"
      },
      {
        name: "日本語処理",
        query: "「こんにちは世界」を英語に翻訳して、さらに大文字にしてください",
        tools: ["process_string"],
        description: "日本語処理能力のテスト"
      }
    ];
    
    for (const testCase of testQueries) {
      console.log(`\n  📝 ${testCase.name}:`);
      console.log(`    ${testCase.description}`);
      console.log(`    質問: "${testCase.query}"`);
      
      const startTime = Date.now();
      
      try {
        const response = await client.query(testCase.query, { tools: testCase.tools });
        const responseTime = Date.now() - startTime;
        
        console.log(`    ⏱️  応答時間: ${responseTime}ms`);
        console.log(`    ✅ 回答: ${response.content.substring(0, 100)}${response.content.length > 100 ? '...' : ''}`);
        
        if (response.tool_calls && response.tool_calls.length > 0) {
          console.log(`    🛠️ ツール使用: ${response.tool_calls.length}個`);
        }
        
        // 長時間の場合は警告
        if (responseTime > 30000) { // 30秒
          console.log(`    ⚠️ 応答が遅い可能性があります（${responseTime}ms）`);
        }
        
      } catch (error) {
        console.log(`    ❌ エラー: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.log(`  ❌ ローカルLLMテスト失敗: ${error.message}`);
  }
}

async function testPerformance() {
  console.log("\n⚡ パフォーマンステスト:");
  
  const client = new AgentTestClient(SERVER_URL);
  const iterations = 3; // ローカルLLMを考慮して回数を減らす
  const tools = ["add_numbers"];
  
  console.log(`  🔄 ${iterations}回の連続質問テスト（ツール選択: [${tools.join(', ')}]）...`);
  
  const startTime = Date.now();
  const results = [];
  
  for (let i = 0; i < iterations; i++) {
    const query = `${i + 1}と${i + 2}を足してください`;
    
    try {
      const iterationStart = Date.now();
      const response = await client.query(query, { tools });
      const iterationTime = Date.now() - iterationStart;
      
      results.push({
        iteration: i + 1,
        time: iterationTime,
        success: response.type === 'response',
        toolsUsed: response.tool_calls ? response.tool_calls.length : 0
      });
      
      console.log(`    ${i + 1}/${iterations}: ${iterationTime}ms (ツール: ${results[i].toolsUsed}個)`);
      
    } catch (error) {
      results.push({
        iteration: i + 1,
        time: -1,
        success: false,
        error: error.message
      });
      console.log(`    ${i + 1}/${iterations}: エラー - ${error.message}`);
    }
  }
  
  const totalTime = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  const avgTime = results
    .filter(r => r.success && r.time > 0)
    .reduce((sum, r) => sum + r.time, 0) / successCount;
  
  console.log(`\n  📊 結果:`);
  console.log(`    合計時間: ${totalTime}ms`);
  console.log(`    成功率: ${successCount}/${iterations} (${(successCount/iterations*100).toFixed(1)}%)`);
  console.log(`    平均レスポンス時間: ${avgTime.toFixed(2)}ms`);
  
  // プロバイダー別のパフォーマンス情報
  try {
    const config = await client.getConfig();
    console.log(`    AIプロバイダー: ${config.config.provider}`);
    
    if (config.config.provider === 'localllm') {
      console.log(`    💡 ローカルLLMのヒント:`);
      console.log(`       - 通常OpenAI APIより応答が遅くなります`);
      console.log(`       - VLLMサーバーのスペックが影響します`);
      console.log(`       - 初回リクエストは特に時間がかかる可能性があります`);
    }
  } catch (error) {
    // 設定取得失敗は無視
  }
}

function showUsageExamples() {
  console.log(`
📖 AIエージェント使用例（選択ツール対応版 + ローカルLLM対応）:

1. curlでの基本的な使用:

非ストリーミング（必須：toolsパラメータ）:
curl -X POST ${SERVER_URL}/agent \\
  -H "Content-Type: application/json" \\
  -d '{"query": "5と3を足してください", "tools": ["add_numbers"], "streaming": false}'

ストリーミング:
curl -N -X POST ${SERVER_URL}/agent \\
  -H "Content-Type: application/json" \\
  -d '{"query": "10と20を足してください", "tools": ["add_numbers"], "streaming": true}'

2. 複数ツール使用:
curl -X POST ${SERVER_URL}/agent \\
  -H "Content-Type: application/json" \\
  -d '{"query": "計算してください", "tools": ["add_numbers", "multiply_numbers"]}'

3. ツール未使用（一般会話）:
curl -X POST ${SERVER_URL}/agent \\
  -H "Content-Type: application/json" \\
  -d '{"query": "こんにちは", "tools": []}'

4. JavaScriptでの使用例:

const response = await fetch('${SERVER_URL}/agent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '15と27を掛け算してください',
    tools: ['multiply_numbers'],
    streaming: false,
    temperature: 0.7
  })
});

const result = await response.json();
console.log(result.content);

5. ローカルLLM設定例:

環境変数設定:
AI_PROVIDER=localllm
LOCAL_LLM_URL=http://localhost:8000
LOCAL_LLM_MODEL=Qwen/Qwen2.5-Coder-32B-Instruct

VLLMサーバー起動コマンド例:
python -m vllm.entrypoints.openai.api_server \\
  --model Qwen/Qwen2.5-Coder-32B-Instruct \\
  --host 0.0.0.0 \\
  --port 8000

6. 選択的ツール使用例:
- 計算のみ: {"tools": ["add_numbers", "multiply_numbers"]}
- 文字列処理のみ: {"tools": ["process_string"]}  
- すべて: {"tools": ["add_numbers", "multiply_numbers", "process_string"]}
- なし: {"tools": []}

⚠️ 重要: 
- toolsパラメータは必須です（空配列も可）
- ローカルLLM使用時は応答時間が長くなる可能性があります
- VLLMサーバーが起動している必要があります
`);
}

async function main() {
  console.log("🤖 AI Agent 機能包括テスト開始（選択ツール + ローカルLLM対応版）");
  console.log(`   サーバーURL: ${SERVER_URL}`);
  console.log(`   エージェントエンドポイント: ${AGENT_ENDPOINT}`);
  console.log(`   ⚠️  注意: toolsパラメータが必須になりました`);
  
  // コマンドライン引数をチェック
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showUsageExamples();
    return;
  }
  
  if (process.argv.includes('--examples')) {
    showUsageExamples();
    return;
  }
  
  // 自動テスト実行
  try {
    // AIエージェントが利用可能かチェック
    const agentAvailable = await testAgentAvailability();
    if (!agentAvailable) {
      console.log("\n❌ AIエージェントが利用できません");
      console.log("   設定を確認してサーバーを再起動してください:");
      console.log("   - OpenAI: OPENAI_API_KEY 環境変数を設定");
      console.log("   - Azure OpenAI: OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT を設定");
      console.log("   - ローカルLLM: AI_PROVIDER=localllm, LOCAL_LLM_URL を設定してVLLMサーバーを起動");
      return;
    }
    
    // 各種テストを実行
    const availableTools = await testAgentConfig();
    await testParameterValidation();
    await testSimpleQueries();
    await testToolUsage();
    await testToolSelection();
    await testStreamingMode();
    await testLocalLlmSpecific(); // ローカルLLM固有テスト
    await testErrorHandling();
    await testPerformance();
    
    console.log("\n🎉 すべてのAIエージェントテストが完了しました!");
    console.log("\n💡 次のステップ:");
    console.log("   - 独自のツールを作成してエージェントの能力を拡張");
    console.log("   - フロントエンドアプリケーションと統合");
    console.log("   - プロダクション環境でのデプロイを検討");
    console.log("   - ツール選択機能を活用したより細かい制御");
    console.log("   - ローカルLLMでのカスタマイズされたAI体験");
    
    console.log("\n📝 重要な変更点:");
    console.log("   - /agentエンドポイントでtoolsパラメータが必須になりました");
    console.log("   - 選択されたツールのみがAIエージェントで利用可能です");
    console.log("   - 空配列を指定することで一般会話のみも可能です");
    console.log("   - ローカルLLM（VLLM）対応でオンプレミスでの運用が可能です");
    
  } catch (error) {
    console.error("\n❌ テスト実行中にエラーが発生しました:", error.message);
  }
}

// メイン関数実行
main();