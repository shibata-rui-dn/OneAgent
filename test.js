#!/usr/bin/env node

/**
 * Dynamic Tool MCP サーバー（HTTP版）の包括的テスト
 * 
 * 使用方法:
 * 1. 別のターミナルで `node server.js` を実行してMCPサーバーを起動
 * 2. このスクリプトを実行: `node test.js`
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fetch from 'node-fetch';

import dotenv from 'dotenv';

// 環境変数の読み込み（.envファイル）
dotenv.config();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

const SERVER_URL = `http://${HOST}:${PORT}` || 'http://localhost:3000';
const MCP_ENDPOINT = `${SERVER_URL}/mcp`;

/**
 * MCP クライアントクラス
 */
class MCPTestClient {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.client = null;
    this.transport = null;
  }
  
  async connect() {
    try {
      this.client = new Client(
        {
          name: "dynamic-test-client",
          version: "1.0.0"
        },
        {
          capabilities: {}
        }
      );
      
      this.transport = new StreamableHTTPClientTransport(new URL(this.endpoint));
      await this.client.connect(this.transport);
      
      console.log('✅ MCPサーバーに接続しました (Streamable HTTP)');
      return true;
    } catch (error) {
      console.error('❌ MCP接続エラー:', error.message);
      return false;
    }
  }
  
  async listTools() {
    try {
      const result = await this.client.listTools();
      return result;
    } catch (error) {
      throw new Error(`ツール一覧取得エラー: ${error.message}`);
    }
  }
  
  async callTool(name, args) {
    try {
      const result = await this.client.callTool({
        name: name,
        arguments: args
      });
      return result;
    } catch (error) {
      throw new Error(`ツール実行エラー: ${error.message}`);
    }
  }
  
  async disconnect() {
    if (this.client) {
      await this.client.close();
      console.log('🔌 MCP接続を切断しました');
    }
  }
}

async function testHealthCheck() {
  console.log("🔍 ヘルスチェック:");
  
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log(`  ✅ サーバー状態: ${data.status}`);
    console.log(`  📋 サーバー名: ${data.name}`);
    console.log(`  🔖 バージョン: ${data.version}`);
    console.log(`  📦 読み込み済みツール数: ${data.loadedTools}`);
    return true;
  } catch (error) {
    console.log(`  ❌ ヘルスチェック失敗: ${error.message}`);
    return false;
  }
}

async function testServerInfo() {
  console.log("\n📋 サーバー情報取得:");
  
  try {
    const response = await fetch(`${SERVER_URL}/info`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log(`  📦 名前: ${data.name}`);
    console.log(`  🚀 トランスポート: ${data.transport}`);
    console.log(`  📂 ツールディレクトリ: ${data.toolsDirectory}`);
    console.log(`  📊 読み込み済みツール数: ${data.loadedTools}`);
    console.log(`  🔗 エンドポイント:`);
    Object.entries(data.endpoints).forEach(([key, value]) => {
      console.log(`    ${key}: ${value}`);
    });
    return true;
  } catch (error) {
    console.log(`  ❌ サーバー情報取得失敗: ${error.message}`);
    return false;
  }
}

async function testToolsList() {
  console.log("\n📋 ツール一覧取得 (REST):");
  
  try {
    const response = await fetch(`${SERVER_URL}/tools`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log(`  📊 ツール数: ${data.count}`);
    console.log("  📦 利用可能なツール:");
    data.tools.forEach(tool => {
      console.log(`    - ${tool.name}: ${tool.description}`);
    });
    return data.tools;
  } catch (error) {
    console.log(`  ❌ ツール一覧取得失敗: ${error.message}`);
    return [];
  }
}

async function testToolsReload() {
  console.log("\n🔄 ツールリロードテスト:");
  
  try {
    const response = await fetch(`${SERVER_URL}/tools/reload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log(`  ✅ ${data.message}`);
    console.log(`  📊 読み込み済みツール数: ${data.loadedTools}`);
    return true;
  } catch (error) {
    console.log(`  ❌ ツールリロード失敗: ${error.message}`);
    return false;
  }
}

async function testMCPFunctionality() {
  console.log("\n🧪 MCP機能テスト:");
  
  const client = new MCPTestClient(MCP_ENDPOINT);
  
  try {
    // MCP接続
    const connected = await client.connect();
    if (!connected) {
      return false;
    }
    
    // ツール一覧の取得テスト
    console.log("\n📋 ツール一覧の取得 (MCP):");
    const toolsResult = await client.listTools();
    console.log("利用可能なツール:");
    toolsResult.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    
    // 各ツールのテストケース
    await testAllTools(client, toolsResult.tools);
    
    // 接続を切断
    await client.disconnect();
    
  } catch (error) {
    console.error("❌ MCP機能テストエラー:", error.message);
    await client.disconnect();
    return false;
  }
  
  return true;
}

async function testAllTools(client, tools) {
  console.log("\n🧮 各ツールのテスト:");
  
  for (const tool of tools) {
    console.log(`\n  📦 ツール: ${tool.name}`);
    
    try {
      let testResult;
      
      switch (tool.name) {
        case 'add_numbers':
          testResult = await client.callTool('add_numbers', { a: 5, b: 3 });
          console.log(`    結果: ${testResult.content[0].text}`);
          break;
          
        case 'multiply_numbers':
          testResult = await client.callTool('multiply_numbers', { a: 4, b: 6 });
          console.log(`    結果: ${testResult.content[0].text}`);
          break;
          
        case 'process_string':
          // 複数の操作をテスト
          const operations = ['length', 'uppercase', 'lowercase', 'reverse'];
          for (const op of operations) {
            testResult = await client.callTool('process_string', { 
              text: 'Hello World', 
              operation: op 
            });
            console.log(`    ${op}: ${testResult.content[0].text}`);
          }
          break;
          
        default:
          console.log(`    ⚠️  未知のツール型: ${tool.name} - スキップします`);
          continue;
      }
      
      console.log(`    ✅ ${tool.name} テスト成功`);
      
    } catch (error) {
      console.log(`    ❌ ${tool.name} テスト失敗: ${error.message}`);
    }
  }
}

async function testErrorHandling() {
  console.log("\n🚨 エラーハンドリングテスト:");
  
  const client = new MCPTestClient(MCP_ENDPOINT);
  
  try {
    await client.connect();
    
    // 存在しないツールを呼び出し
    console.log("  🔍 存在しないツールの呼び出し:");
    try {
      await client.callTool('non_existent_tool', {});
      console.log("    ❌ エラーが発生するべきでした");
    } catch (error) {
      console.log(`    ✅ 期待通りエラー: ${error.message}`);
    }
    
    // 不正な引数でツールを呼び出し
    console.log("  🔍 不正な引数でのツール呼び出し:");
    try {
      const result = await client.callTool('add_numbers', { a: "not_a_number", b: 3 });
      if (result.isError) {
        console.log(`    ✅ エラーが正しく処理されました: ${result.content[0].text}`);
      } else {
        console.log("    ❌ エラーが発生するべきでした");
      }
    } catch (error) {
      console.log(`    ✅ 期待通りエラー: ${error.message}`);
    }
    
    await client.disconnect();
    
  } catch (error) {
    console.error("❌ エラーハンドリングテストエラー:", error.message);
    await client.disconnect();
    return false;
  }
  
  return true;
}

function showManualTestInstructions() {
  console.log(`
📖 手動テスト方法:

1. MCPサーバーを起動:
   node server.js

2. ブラウザまたはcurlでテスト:

ヘルスチェック:
curl ${SERVER_URL}/health

サーバー情報取得:
curl ${SERVER_URL}/info

ツール一覧取得:
curl ${SERVER_URL}/tools

ツールリロード:
curl -X POST ${SERVER_URL}/tools/reload

3. MCP プロトコル経由でのテスト:

初期化:
curl -X POST ${SERVER_URL}/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{"tools":{}},"clientInfo":{"name":"test-client","version":"1.0.0"}}}'

ツール実行 (セッションID必要):
curl -X POST ${SERVER_URL}/mcp \\
  -H "Content-Type: application/json" \\
  -H "mcp-session-id: [RETURNED_SESSION_ID]" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"add_numbers","arguments":{"a":5,"b":3}}}'

4. 新しいツールの作成テスト:

mkdir YourTool/test_tool
echo '{"name":"test_tool","description":"テストツール","version":"1.0.0","inputSchema":{"type":"object","properties":{"message":{"type":"string"}},"required":["message"]}}' > YourTool/test_tool/config.json
echo 'export default function(args) { return { content: [{ type: "text", text: \`テスト: \${args.message}\` }] }; }' > YourTool/test_tool/handler.js
curl -X POST ${SERVER_URL}/tools/reload

5. Claude Desktop での使用:
   ~/.claude_desktop_config.json に以下を追加:
   {
     "mcpServers": {
       "dynamic-tools": {
         "url": "${SERVER_URL}/mcp"
       }
     }
   }
`);
}

async function runPerformanceTest() {
  console.log("\n⚡ パフォーマンステスト:");
  
  const client = new MCPTestClient(MCP_ENDPOINT);
  
  try {
    await client.connect();
    
    const startTime = Date.now();
    const iterations = 10;
    
    console.log(`  🔄 ${iterations}回の連続ツール実行テスト...`);
    
    for (let i = 0; i < iterations; i++) {
      await client.callTool('add_numbers', { a: i, b: i + 1 });
    }
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;
    
    console.log(`  ✅ 完了: 合計時間 ${totalTime}ms, 平均時間 ${avgTime.toFixed(2)}ms/回`);
    
    await client.disconnect();
    return true;
    
  } catch (error) {
    console.error("❌ パフォーマンステストエラー:", error.message);
    await client.disconnect();
    return false;
  }
}

async function main() {
  console.log("🚀 Dynamic Tool MCP Server (HTTP版) 包括テスト開始");
  console.log(`   サーバーURL: ${SERVER_URL}`);
  console.log(`   MCPエンドポイント: ${MCP_ENDPOINT}`);
  
  // コマンドライン引数をチェック
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showManualTestInstructions();
    return;
  }
  
  if (process.argv.includes('--manual')) {
    showManualTestInstructions();
    return;
  }
  
  // 自動テスト実行
  let allTestsPassed = true;
  
  try {
    // サーバーが起動しているかチェック
    const healthOk = await testHealthCheck();
    if (!healthOk) {
      console.log("\n❌ サーバーが起動していないか、アクセスできません");
      console.log("   別のターミナルで 'node server.js' を実行してサーバーを起動してください");
      return;
    }
    
    // 各種テストを実行
    const testResults = await Promise.allSettled([
      testServerInfo(),
      testToolsList(),
      testToolsReload(),
      testMCPFunctionality(),
      testErrorHandling(),
      runPerformanceTest()
    ]);
    
    // テスト結果を集計
    testResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`\n❌ テスト ${index + 1} でエラー:`, result.reason);
        allTestsPassed = false;
      }
    });
    
    // 最終結果
    if (allTestsPassed) {
      console.log("\n🎉 すべてのテストが成功しました!");
      console.log("\n💡 次のステップ:");
      console.log("   - 新しいカスタムツールを YourTool/ ディレクトリに作成");
      console.log("   - Claude Desktop でMCPサーバーを使用");
      console.log("   - 本番環境へのデプロイを検討");
    } else {
      console.log("\n❌ 一部のテストが失敗しました");
      console.log("   ログを確認して問題を修正してください");
    }
    
  } catch (error) {
    console.error("\n❌ テスト実行中にエラーが発生しました:", error.message);
  }
}

// メイン関数実行
main();