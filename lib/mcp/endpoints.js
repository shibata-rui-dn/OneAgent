/**
 * MCP (Model Context Protocol) エンドポイント
 * HTTP transport 対応 + セッション管理
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { CONFIG } from '../config/config.js';

/**
 * MCP サーバーの作成
 */
function createMcpServer(toolManager) {
  const server = new McpServer(
    {
      name: "oneagent-mcp-server",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // 動的にツールを登録
  for (const [toolName, tool] of toolManager.tools) {
    server.tool(
      tool.name,
      tool.inputSchema,
      async (args) => {
        try {
          console.log(`🔧 MCP ツール実行: ${tool.name}`);
          
          // MCPでは認証コンテキストがないため、セキュリティチェックを調整
          if (tool.security?.requiresAuth) {
            return {
              content: [
                {
                  type: "text",
                  text: `エラー: ツール「${tool.name}」は認証が必要ですが、MCPプロトコル経由では認証情報が提供されていません。`
                }
              ],
              isError: true
            };
          }

          // ツール実行（認証コンテキストなし）
          return await toolManager.executeToolHandler(tool.name, args, null);
        } catch (error) {
          console.error(`❌ MCP ツール実行エラー [${tool.name}]:`, error);
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

/**
 * MCP エンドポイントの設定
 */
export function createMcpEndpoints(app, toolManager) {
  console.log('🔗 MCPエンドポイントを設定中...');

  // セッション管理用マップ
  const transports = new Map();
  const sessions = new Map();

  // セッションクリーンアップ（30分で自動削除）
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30分
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, sessionData] of sessions.entries()) {
      if (now - sessionData.lastAccess > SESSION_TIMEOUT) {
        console.log(`🧹 MCPセッション期限切れで削除: ${sessionId}`);
        
        // セッションのクリーンアップ
        if (transports.has(sessionId)) {
          const { transport, server } = transports.get(sessionId);
          try {
            transport.close();
            server.close();
          } catch (error) {
            console.error(`MCPセッションクリーンアップエラー [${sessionId}]:`, error);
          }
          transports.delete(sessionId);
        }
        sessions.delete(sessionId);
      }
    }
  }, 5 * 60 * 1000); // 5分間隔でチェック

  // MCP HTTP エンドポイント（POST）
  app.post('/mcp', async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'];
      let transport;
      let server;

      // 既存セッションの使用
      if (sessionId && transports.has(sessionId)) {
        const session = transports.get(sessionId);
        transport = session.transport;
        server = session.server;
        
        // セッションの最終アクセス時刻を更新
        if (sessions.has(sessionId)) {
          sessions.get(sessionId).lastAccess = Date.now();
        }

        console.log(`🔄 既存MCPセッション使用: ${sessionId}`);
      } 
      // 新規セッションの作成
      else if (!sessionId && isInitializeRequest(req.body)) {
        const newSessionId = randomUUID();
        
        console.log(`🆕 新規MCPセッション作成: ${newSessionId}`);
        
        // トランスポートの作成
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
        });

        // MCPサーバーの作成
        server = createMcpServer(toolManager);

        // セッション情報の保存
        transports.set(newSessionId, { transport, server });
        sessions.set(newSessionId, {
          id: newSessionId,
          createdAt: Date.now(),
          lastAccess: Date.now(),
          requestCount: 0
        });

        // サーバーとトランスポートの接続
        await server.connect(transport);
        
        console.log(`✅ MCPセッション初期化完了: ${newSessionId}`);
      } 
      // 無効なリクエスト
      else {
        console.warn('❌ 無効なMCPリクエスト: セッションIDがないか、初期化リクエストではありません');
        return res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided or not an initialization request',
          },
          id: null,
        });
      }

      // リクエストカウントの更新
      if (sessions.has(sessionId || transport.sessionId)) {
        sessions.get(sessionId || transport.sessionId).requestCount++;
      }

      // リクエスト処理
      await transport.handleRequest(req, res, req.body);

    } catch (error) {
      console.error('❌ MCP リクエスト処理エラー:', error);
      
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
            data: CONFIG.DEBUG.ENABLED ? error.message : undefined
          },
          id: null,
        });
      }
    }
  });

  // MCP HTTP エンドポイント（GET）- サーバーからクライアントへの通信用
  app.get('/mcp', async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'];

      if (!sessionId || !transports.has(sessionId)) {
        console.warn(`❌ 無効なMCPセッションID: ${sessionId}`);
        return res.status(400).send('Invalid or missing session ID');
      }

      const { transport } = transports.get(sessionId);
      
      // セッションの最終アクセス時刻を更新
      if (sessions.has(sessionId)) {
        sessions.get(sessionId).lastAccess = Date.now();
      }

      await transport.handleRequest(req, res);

    } catch (error) {
      console.error('❌ MCP GET リクエストエラー:', error);
      
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  });

  // MCP セッション削除
  app.delete('/mcp', async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'];

      if (sessionId && transports.has(sessionId)) {
        console.log(`🗑️ MCPセッション削除: ${sessionId}`);
        
        const { transport, server } = transports.get(sessionId);
        
        // リソースのクリーンアップ
        try {
          await transport.close();
          await server.close();
        } catch (error) {
          console.error(`MCPセッション削除エラー [${sessionId}]:`, error);
        }
        
        transports.delete(sessionId);
        sessions.delete(sessionId);
      }

      res.status(200).send('Session deleted');

    } catch (error) {
      console.error('❌ MCP セッション削除エラー:', error);
      res.status(500).send('Internal server error');
    }
  });

  // MCP セッション一覧取得（管理者用）
  app.get('/mcp/sessions', (req, res) => {
    try {
      const sessionList = Array.from(sessions.values()).map(session => ({
        id: session.id,
        createdAt: new Date(session.createdAt).toISOString(),
        lastAccess: new Date(session.lastAccess).toISOString(),
        requestCount: session.requestCount,
        active: transports.has(session.id)
      }));

      res.json({
        sessions: sessionList,
        totalSessions: sessionList.length,
        activeSessions: sessionList.filter(s => s.active).length,
        availableTools: toolManager.tools.size
      });

    } catch (error) {
      console.error('❌ MCPセッション一覧取得エラー:', error);
      res.status(500).json({
        error: 'session_list_error',
        message: error.message
      });
    }
  });

  // MCP 統計情報取得
  app.get('/mcp/stats', (req, res) => {
    try {
      const now = Date.now();
      const sessionStats = Array.from(sessions.values());
      
      const stats = {
        timestamp: new Date().toISOString(),
        sessions: {
          total: sessionStats.length,
          active: sessionStats.filter(s => transports.has(s.id)).length,
          expired: sessionStats.filter(s => !transports.has(s.id)).length
        },
        tools: {
          total: toolManager.tools.size,
          authRequired: Array.from(toolManager.tools.values())
            .filter(tool => tool.security?.requiresAuth).length,
          public: Array.from(toolManager.tools.values())
            .filter(tool => !tool.security?.requiresAuth).length
        },
        activity: {
          totalRequests: sessionStats.reduce((sum, s) => sum + s.requestCount, 0),
          averageRequestsPerSession: sessionStats.length > 0 
            ? Math.round(sessionStats.reduce((sum, s) => sum + s.requestCount, 0) / sessionStats.length)
            : 0,
          oldestSession: sessionStats.length > 0 
            ? new Date(Math.min(...sessionStats.map(s => s.createdAt))).toISOString()
            : null,
          newestSession: sessionStats.length > 0 
            ? new Date(Math.max(...sessionStats.map(s => s.createdAt))).toISOString()
            : null
        },
        config: {
          sessionTimeout: SESSION_TIMEOUT / 1000 / 60, // 分単位
          maxSessions: CONFIG.DEBUG.ENABLED ? 100 : 10 // 開発環境では多めに
        }
      };

      res.json(stats);

    } catch (error) {
      console.error('❌ MCP統計情報取得エラー:', error);
      res.status(500).json({
        error: 'mcp_stats_error',
        message: error.message
      });
    }
  });

  // MCP ツール一覧取得（MCP互換形式）
  app.get('/mcp/tools', (req, res) => {
    try {
      const mcpTools = Array.from(toolManager.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        requiresAuth: tool.security?.requiresAuth || false,
        scopes: tool.security?.scopes || [],
        version: tool.version,
        icon: tool.icon ? {
          filename: tool.icon.filename,
          description: tool.icon.description
        } : null
      }));

      res.json({
        tools: mcpTools,
        count: mcpTools.length,
        publicTools: mcpTools.filter(t => !t.requiresAuth).length,
        authRequiredTools: mcpTools.filter(t => t.requiresAuth).length,
        serverInfo: {
          name: "oneagent-mcp-server",
          version: "1.0.0",
          capabilities: ["tools"]
        }
      });

    } catch (error) {
      console.error('❌ MCPツール一覧取得エラー:', error);
      res.status(500).json({
        error: 'mcp_tools_error',
        message: error.message
      });
    }
  });

  // MCP ヘルスチェック
  app.get('/mcp/health', (req, res) => {
    try {
      const activeSessions = sessions.size;
      const activeTransports = transports.size;
      const availableTools = toolManager.tools.size;

      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        mcp: {
          activeSessions,
          activeTransports,
          availableTools,
          healthy: activeSessions >= 0 && availableTools >= 0
        },
        uptime: process.uptime(),
        memory: process.memoryUsage()
      };

      // 異常状態のチェック
      if (activeSessions !== activeTransports) {
        health.status = 'warning';
        health.warnings = [`セッション数(${activeSessions})とトランスポート数(${activeTransports})が一致しません`];
      }

      if (availableTools === 0) {
        health.status = 'warning';
        health.warnings = health.warnings || [];
        health.warnings.push('利用可能なツールがありません');
      }

      const statusCode = health.status === 'healthy' ? 200 : 200; // warningでも200を返す
      res.status(statusCode).json(health);

    } catch (error) {
      console.error('❌ MCPヘルスチェックエラー:', error);
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  console.log('✅ MCPエンドポイントを設定しました');
  console.log(`   エンドポイント: /mcp`);
  console.log(`   セッション管理: 有効`);
  console.log(`   利用可能ツール: ${toolManager.tools.size}個`);
  console.log(`   セッションタイムアウト: ${SESSION_TIMEOUT / 1000 / 60}分`);

  // クリーンアップ関数を返す
  return {
    cleanup: async () => {
      console.log('🧹 MCPセッションをクリーンアップ中...');
      
      for (const [sessionId, session] of transports.entries()) {
        try {
          await session.transport.close();
          await session.server.close();
        } catch (error) {
          console.error(`MCPセッションクリーンアップエラー [${sessionId}]:`, error);
        }
      }
      
      transports.clear();
      sessions.clear();
      
      console.log('✅ MCPセッションクリーンアップ完了');
    },
    
    getStats: () => ({
      sessions: sessions.size,
      transports: transports.size,
      tools: toolManager.tools.size
    })
  };
}