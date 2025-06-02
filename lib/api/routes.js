/**
 * APIルート定義（完全版 + ツール直接実行機能追加）
 * 管理者エンドポイントの安全化とパフォーマンス最適化
 * ツール直接実行エンドポイント追加
 */

import { CONFIG } from '../config/config.js';
import { userConfigManager } from '../config/user-config-manager.js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

/**
 * APIルートの設定
 */
export function setupRoutes(app, services) {
  const { toolManager, aiAgent, oauthSystem } = services;

  console.log('🛣️ APIルートを設定中...');

  // OAuth 2.0 エンドポイント
  setupOAuthRoutes(app, oauthSystem);

  // ツール管理エンドポイント
  setupToolRoutes(app, toolManager, oauthSystem);

  // 管理者用ツールエンドポイント
  setupAdminToolEndpoints(app, toolManager, oauthSystem);

  // AIエージェントエンドポイント
  setupAgentRoutes(app, aiAgent, toolManager, oauthSystem);

  // システム情報エンドポイント
  setupSystemRoutes(app, { toolManager, aiAgent, oauthSystem });

  // 管理者エンドポイント（安全版）
  setupAdminEndpoints(app, oauthSystem);

  // ユーザー設定管理エンドポイント
  setupUserConfigRoutes(app, oauthSystem);

  // 設定テンプレート管理エンドポイント
  setupConfigTemplateRoutes(app, oauthSystem);

  console.log('✅ APIルート設定完了');
}

/**
 * OAuth 2.0 エンドポイント
 */
function setupOAuthRoutes(app, oauthSystem) {
  const { server } = oauthSystem;

  // 認証エンドポイント
  app.get('/oauth/authorize', (req, res) => server.handleAuthorize(req, res));
  app.post('/oauth/token', (req, res) => server.handleToken(req, res));
  app.get('/oauth/userinfo', (req, res) => server.handleUserInfo(req, res));
  app.post('/oauth/revoke', (req, res) => server.handleRevoke(req, res));

  // ログインフォーム
  app.get('/oauth/login', (req, res) => server.handleLogin(req, res));
  app.post('/oauth/authenticate', (req, res) => server.handleAuthenticate(req, res));

  // コールバックエンドポイント
  app.get('/oauth/callback', (req, res) => {
    try {
      const { code, state, error, error_description } = req.query;

      console.log('🔄 OAuth コールバック受信:', { code: !!code, state, error });

      if (error) {
        console.error('❌ OAuth エラー:', error, error_description);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(error_description || 'Unknown error')}`);
      }

      if (!code || !state) {
        console.error('❌ 必要なパラメータが不足:', { code: !!code, state });
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/?error=invalid_request&error_description=${encodeURIComponent('Missing required parameters')}`);
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const redirectUrl = `${frontendUrl}/?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;

      console.log('↩️ フロントエンドにリダイレクト:', redirectUrl);

      res.redirect(redirectUrl);

    } catch (error) {
      console.error('❌ コールバック処理エラー:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/?error=server_error&error_description=${encodeURIComponent('Authentication processing error')}`);
    }
  });

  console.log('🔐 OAuth エンドポイントを設定しました');
}

/**
 * 🆕 ツール直接実行エンドポイント
 */
function setupDirectToolExecution(app, toolManager, oauthSystem) {
  // 汎用ツール実行エンドポイント（リクエストボディでツール名を指定）
  app.post('/tools/execute',
    oauthSystem.middleware.auth,
    async (req, res) => {
      try {
        const { tool: toolName, arguments: args, options } = req.body;

        if (!toolName) {
          return res.status(400).json({
            success: false,
            error: 'missing_tool_name',
            message: 'リクエストボディにtoolフィールドが必要です'
          });
        }

        console.log(`🔧 ツール直接実行: ${toolName} (ユーザー: ${req.user.username})`);

        // ツールの存在確認
        const tool = toolManager.tools.get(toolName);
        if (!tool) {
          return res.status(404).json({
            success: false,
            error: 'tool_not_found',
            message: `ツール「${toolName}」が見つかりません`,
            availableTools: Array.from(toolManager.tools.keys())
          });
        }

        // 認証コンテキストの作成
        const authContext = {
          user: req.user,
          scopes: req.scopes,
          tokenInfo: req.tokenInfo
        };

        // ツール実行
        const startTime = Date.now();
        const result = await toolManager.executeToolHandler(
          toolName,
          args || {},
          authContext
        );
        const executionTime = Date.now() - startTime;

        console.log(`✅ ツール実行完了: ${toolName} (${executionTime}ms)`);

        res.json({
          success: true,
          tool: toolName,
          result: result,
          executedBy: req.user.username,
          executedAt: new Date().toISOString(),
          executionTime: executionTime,
          args: args,
          options: options
        });

      } catch (error) {
        console.error(`❌ ツール実行エラー [${req.body?.tool}]:`, error);

        res.status(500).json({
          success: false,
          error: 'tool_execution_error',
          message: error.message,
          tool: req.body?.tool,
          executedBy: req.user?.username,
          executedAt: new Date().toISOString(),
          args: req.body?.arguments
        });
      }
    }
  );

  // ツール直接実行エンドポイント（パスパラメータ版）
  app.post('/tools/execute/:toolName',
    oauthSystem.middleware.auth,
    async (req, res) => {
      try {
        const { toolName } = req.params;
        const { args } = req.body;

        console.log(`🔧 ツール直接実行: ${toolName} (ユーザー: ${req.user.username})`);

        // ツールの存在確認
        const tool = toolManager.tools.get(toolName);
        if (!tool) {
          return res.status(404).json({
            error: 'tool_not_found',
            message: `ツール「${toolName}」が見つかりません`,
            availableTools: Array.from(toolManager.tools.keys())
          });
        }

        // 認証コンテキストの作成
        const authContext = {
          user: req.user,
          scopes: req.scopes,
          tokenInfo: req.tokenInfo
        };

        // ツール実行
        const startTime = Date.now();
        const result = await toolManager.executeToolHandler(
          toolName,
          args || {},
          authContext
        );
        const executionTime = Date.now() - startTime;

        console.log(`✅ ツール実行完了: ${toolName} (${executionTime}ms)`);

        res.json({
          success: true,
          tool: toolName,
          result: result,
          executedBy: req.user.username,
          executedAt: new Date().toISOString(),
          executionTime: executionTime,
          args: args
        });

      } catch (error) {
        console.error(`❌ ツール実行エラー [${req.params.toolName}]:`, error);

        res.status(500).json({
          success: false,
          error: 'tool_execution_error',
          message: error.message,
          tool: req.params.toolName,
          executedBy: req.user?.username,
          executedAt: new Date().toISOString(),
          args: req.body?.args
        });
      }
    }
  );

  // ツール直接実行のバッチ処理（複数ツールの連続実行）
  app.post('/tools/execute/batch',
    oauthSystem.middleware.auth,
    async (req, res) => {
      try {
        const { toolCalls } = req.body;

        if (!Array.isArray(toolCalls)) {
          return res.status(400).json({
            error: 'invalid_request',
            message: 'toolCallsは配列である必要があります'
          });
        }

        console.log(`🔧 ツールバッチ実行: ${toolCalls.length}個 (ユーザー: ${req.user.username})`);

        const results = [];
        const authContext = {
          user: req.user,
          scopes: req.scopes,
          tokenInfo: req.tokenInfo
        };

        for (let i = 0; i < toolCalls.length; i++) {
          const { toolName, args } = toolCalls[i];

          try {
            const startTime = Date.now();
            const result = await toolManager.executeToolHandler(
              toolName,
              args || {},
              authContext
            );
            const executionTime = Date.now() - startTime;

            results.push({
              index: i,
              success: true,
              toolName,
              result,
              executionTime,
              args
            });

          } catch (error) {
            results.push({
              index: i,
              success: false,
              toolName,
              error: error.message,
              args
            });
          }
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`✅ ツールバッチ実行完了: ${successCount}/${toolCalls.length}成功`);

        res.json({
          success: true,
          results,
          summary: {
            total: toolCalls.length,
            successful: successCount,
            failed: toolCalls.length - successCount
          },
          executedBy: req.user.username,
          executedAt: new Date().toISOString()
        });

      } catch (error) {
        console.error(`❌ ツールバッチ実行エラー:`, error);

        res.status(500).json({
          success: false,
          error: 'batch_execution_error',
          message: error.message,
          executedBy: req.user?.username,
          executedAt: new Date().toISOString()
        });
      }
    }
  );

  console.log('🔧 ツール直接実行エンドポイントを設定しました');
  console.log('   POST /tools/execute - 汎用ツール実行（リクエストボディでツール指定）');
  console.log('   POST /tools/execute/:toolName - 単一ツール実行（パスパラメータ）');
  console.log('   POST /tools/execute/batch - バッチ実行');
}

/**
 * ツール管理エンドポイント
 */
function setupToolRoutes(app, toolManager, oauthSystem) {
  // ツール一覧取得（認証不要）
  app.get('/tools', (req, res) => {
    try {
      const tools = toolManager.getToolsList();
      res.json({
        tools: tools,
        count: tools.length,
        lastReloadTime: toolManager.lastReloadTime
      });
    } catch (error) {
      res.status(500).json({
        error: 'tools_list_error',
        message: error.message
      });
    }
  });

  // ツールアイコン取得
  app.get('/tools/:toolName/icon', async (req, res) => {
    try {
      const { toolName } = req.params;
      const iconData = await toolManager.getToolIcon(toolName);

      if (!iconData) {
        return res.status(404).json({
          error: 'icon_not_found',
          message: 'アイコンが見つかりません'
        });
      }

      res.setHeader('Content-Type', iconData.contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(iconData.data);
    } catch (error) {
      console.error('アイコン取得エラー:', error);
      res.status(500).json({
        error: 'icon_error',
        message: error.message
      });
    }
  });

  // ツール統計情報（認証必要）
  app.get('/tools/stats',
    oauthSystem.middleware.auth,
    (req, res) => {
      try {
        const stats = toolManager.getStatistics();
        res.json(stats);
      } catch (error) {
        res.status(500).json({
          error: 'tool_stats_error',
          message: error.message
        });
      }
    }
  );

  // 🆕 ツール直接実行エンドポイントを追加
  setupDirectToolExecution(app, toolManager, oauthSystem);

  console.log('🛠️ ツール管理エンドポイントを設定しました');
}

/**
 * ユーザー固有のAIエージェントを作成（.envフォールバック対応版）
 */
async function createUserSpecificAiAgentWithFallback(userConfig, toolManager) {
  try {
    // AIAgent クラスのインポート（動的）
    const { AIAgent } = await import('../ai/agent.js');

    // .envからのフォールバック設定を準備
    const fallbackConfig = {
      AI_PROVIDER: userConfig.AI_PROVIDER || CONFIG.AI.PROVIDER,
      AI_MODEL: userConfig.AI_MODEL || CONFIG.AI.MODEL,
      AI_TEMPERATURE: userConfig.AI_TEMPERATURE !== undefined ? userConfig.AI_TEMPERATURE : CONFIG.AI.TEMPERATURE,
      AI_STREAMING: userConfig.AI_STREAMING !== undefined ? userConfig.AI_STREAMING : CONFIG.AI.STREAMING,
      AI_MAX_TOKENS: userConfig.AI_MAX_TOKENS !== undefined ? userConfig.AI_MAX_TOKENS : CONFIG.AI.MAX_TOKENS,
      AI_TIMEOUT: userConfig.AI_TIMEOUT !== undefined ? userConfig.AI_TIMEOUT : CONFIG.AI.TIMEOUT,

      // APIキーは.envをフォールバックとして使用
      OPENAI_API_KEY: userConfig.OPENAI_API_KEY || CONFIG.AI.OPENAI_API_KEY,
      AZURE_OPENAI_ENDPOINT: userConfig.AZURE_OPENAI_ENDPOINT || CONFIG.AI.AZURE_OPENAI_ENDPOINT,
      AZURE_OPENAI_API_VERSION: userConfig.AZURE_OPENAI_API_VERSION || CONFIG.AI.AZURE_OPENAI_API_VERSION,
      LOCAL_LLM_URL: userConfig.LOCAL_LLM_URL || CONFIG.AI.LOCAL_LLM_URL,
      LOCAL_LLM_MODEL: userConfig.LOCAL_LLM_MODEL || CONFIG.AI.LOCAL_LLM_MODEL,

      // 追加設定
      AI_SYSTEM_PROMPT: userConfig.AI_SYSTEM_PROMPT || '',
      AI_RESPONSE_FORMAT: userConfig.AI_RESPONSE_FORMAT || 'markdown',
      AI_SAFETY_ENABLED: userConfig.AI_SAFETY_ENABLED !== undefined ? userConfig.AI_SAFETY_ENABLED : true,

      // メタ情報を追加
      _meta: {
        ...userConfig._meta,
        fallbackApplied: {
          openaiApiKey: !userConfig.OPENAI_API_KEY && !!CONFIG.AI.OPENAI_API_KEY,
          azureEndpoint: !userConfig.AZURE_OPENAI_ENDPOINT && !!CONFIG.AI.AZURE_OPENAI_ENDPOINT,
          localLlmUrl: !userConfig.LOCAL_LLM_URL && !!CONFIG.AI.LOCAL_LLM_URL
        }
      }
    };

    // ユーザー設定用の一時的なAIエージェントを作成
    const userAiAgent = new AIAgent(toolManager);

    // フォールバック設定をAIエージェントに適用
    userAiAgent.applyUserConfig(fallbackConfig);

    console.log(`🤖 AIエージェント作成: プロバイダー=${fallbackConfig.AI_PROVIDER}, APIキーソース=${fallbackConfig._meta.fallbackApplied.openaiApiKey ? 'システム(.env)' : 'ユーザー設定'}`);

    return userAiAgent;
  } catch (error) {
    console.error('ユーザー固有AIエージェント作成エラー:', error);
    return null;
  }
}

/**
 * AIエージェントエンドポイント
 */
function setupAgentRoutes(app, aiAgent, toolManager, oauthSystem) {
  // 共通のasync iterable処理関数
  async function processAsyncIterable(asyncIterable, res) {
    try {
      console.log('📦 ストリーミング処理開始...');
      let chunkCount = 0;
      let hasData = false;

      for await (const chunk of asyncIterable) {
        chunkCount++;
        hasData = true;

        if (chunk && typeof chunk === 'object') {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        } else {
          console.warn('⚠️ 無効なチャンクを受信:', chunk);
        }

        if (chunkCount > 1000) {
          console.warn('⚠️ チャンク数が多すぎるため、ストリーミングを中断');
          res.write(`data: ${JSON.stringify({
            type: 'error',
            content: 'ストリーミングが長すぎるため中断されました'
          })}\n\n`);
          break;
        }
      }

      if (!hasData) {
        console.warn('⚠️ ストリーミング処理からデータを受信できませんでした');
        res.write(`data: ${JSON.stringify({
          type: 'text',
          content: 'ストリーミング処理からデータを受信できませんでした。'
        })}\n\n`);
      }

      res.write('data: {"type": "end"}\n\n');
      res.end();

    } catch (iterationError) {
      console.error('❌ ストリーミング反復処理エラー:', iterationError);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        content: `ストリーミング反復処理エラー: ${iterationError.message}`
      })}\n\n`);
      res.write('data: {"type": "end"}\n\n');
      res.end();
    }
  }

  // AIエージェント（認証必須、.envフォールバック対応）
  app.post('/agent',
    oauthSystem.middleware.auth,
    async (req, res) => {
      try {
        // ユーザー固有の設定を取得（.envフォールバック対応）
        const userConfig = await userConfigManager.getUserMergedConfig(req.user.id);
        console.log(`🤖 AIエージェント処理開始: ${req.user.username} (設定: ${userConfig._meta?.hasUserOverrides ? 'カスタム' : 'システム'})`);

        // .envフォールバック対応のAIエージェントを作成
        const userAiAgent = await createUserSpecificAiAgentWithFallback(userConfig, toolManager);

        if (!userAiAgent || !userAiAgent.isInitialized) {
          return res.status(503).json({
            error: 'agent_unavailable',
            message: `AIエージェントが利用できません。設定を確認してください。(プロバイダー: ${userConfig.AI_PROVIDER || CONFIG.AI.PROVIDER})`,
            configInfo: {
              provider: userConfig.AI_PROVIDER || CONFIG.AI.PROVIDER,
            }
          });
        }

        const { query, streaming, model, temperature, maxTokens, tools } = req.body;

        // 必須パラメータの検証
        if (!query) {
          return res.status(400).json({
            error: 'invalid_request',
            message: 'queryフィールドは必須です'
          });
        }

        if (tools === undefined) {
          return res.status(400).json({
            error: 'invalid_request',
            message: 'toolsフィールドは必須です（空配列も可）'
          });
        }

        if (!Array.isArray(tools)) {
          return res.status(400).json({
            error: 'invalid_request',
            message: 'toolsフィールドは配列である必要があります'
          });
        }

        // 認証コンテキストの作成（強化版）
        const authContext = {
          user: req.user,
          scopes: req.scopes,
          tokenInfo: req.tokenInfo,
          userConfig: userConfig,
          configSource: userConfig._meta?.hasUserOverrides ? 'user' : 'system',
          effectiveProvider: userConfig.AI_PROVIDER || CONFIG.AI.PROVIDER,
          effectiveModel: userConfig.AI_MODEL || CONFIG.AI.MODEL,
          fallbackUsed: !userConfig.OPENAI_API_KEY && !!CONFIG.AI.OPENAI_API_KEY
        };

        // ユーザー設定を優先した処理オプション
        const options = {
          streaming: streaming !== undefined ? streaming : (userConfig.AI_STREAMING !== undefined ? userConfig.AI_STREAMING : true),
          model: model || userConfig.AI_MODEL || CONFIG.AI.MODEL,
          temperature: temperature !== undefined ? temperature : (userConfig.AI_TEMPERATURE !== undefined ? parseFloat(userConfig.AI_TEMPERATURE) : 0.7),
          maxTokens: maxTokens !== undefined ? maxTokens : (userConfig.AI_MAX_TOKENS !== undefined ? parseInt(userConfig.AI_MAX_TOKENS) : 2000),
          timeout: userConfig.AI_TIMEOUT !== undefined ? parseInt(userConfig.AI_TIMEOUT) : CONFIG.AI.TIMEOUT,
          tools: tools,
          authContext: authContext,
          systemPrompt: userConfig.AI_SYSTEM_PROMPT || '',
          responseFormat: userConfig.AI_RESPONSE_FORMAT || 'markdown',
          safetyEnabled: userConfig.AI_SAFETY_ENABLED !== undefined ? userConfig.AI_SAFETY_ENABLED : true
        };

        // ツール選択の検証
        const toolValidation = toolManager.validateSelectedTools(options.tools);
        if (!toolValidation.valid) {
          throw new Error(`以下のツールが見つかりません: ${toolValidation.notFound.join(', ')}`);
        }

        console.log(`📝 処理オプション: streaming=${options.streaming}, model=${options.model}, fallback=${authContext.fallbackUsed}`);

        if (options.streaming) {
          // ストリーミングレスポンス
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');

          try {
            const streamResult = userAiAgent.processQuery(query, options);

            if (streamResult instanceof Promise) {
              const resolvedResult = await streamResult;
              if (resolvedResult && typeof resolvedResult[Symbol.asyncIterator] === 'function') {
                await processAsyncIterable(resolvedResult, res);
              } else {
                throw new Error('Resolved result is not async iterable');
              }
            } else if (streamResult && typeof streamResult[Symbol.asyncIterator] === 'function') {
              await processAsyncIterable(streamResult, res);
            } else {
              res.write(`data: ${JSON.stringify({
                type: 'error',
                content: 'ストリーミング処理の初期化に失敗しました'
              })}\n\n`);
              res.write('data: {"type": "end"}\n\n');
              res.end();
              return;
            }

          } catch (streamingError) {
            console.error('❌ ストリーミングエラー:', streamingError);

            if (!res.headersSent) {
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            }

            res.write(`data: ${JSON.stringify({
              type: 'error',
              content: `ストリーミングエラー: ${streamingError.message}`
            })}\n\n`);
            res.write('data: {"type": "end"}\n\n');
            res.end();
          }

        } else {
          // 非ストリーミングレスポンス
          const result = await userAiAgent.processQuery(query, options);

          // 処理結果に設定情報を追加
          result.configInfo = {
            provider: authContext.effectiveProvider,
            model: authContext.effectiveModel,
            configSource: authContext.configSource,
            hasCustomSettings: userConfig._meta?.hasUserOverrides || false,
            fallbackUsed: authContext.fallbackUsed
          };

          res.json(result);
        }

      } catch (error) {
        console.error(`❌ AIエージェントエラー [${req.user.username}]:`, error);

        if (req.body.streaming) {
          if (!res.headersSent) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          }
          res.write(`data: ${JSON.stringify({
            type: 'error',
            content: error.message
          })}\n\n`);
          res.write('data: {"type": "end"}\n\n');
          res.end();
        } else {
          res.status(500).json({
            error: 'agent_error',
            message: error.message
          });
        }
      }
    }
  );

  // AIエージェント設定取得（.envフォールバック情報追加）
  app.get('/agent/config',
    oauthSystem.middleware.auth,
    async (req, res) => {
      try {
        const userConfig = await userConfigManager.getUserMergedConfig(req.user.id);

        const config = {
          available: true,
          provider: userConfig.AI_PROVIDER || CONFIG.AI.PROVIDER,
          model: userConfig.AI_MODEL || CONFIG.AI.MODEL,
          streaming: userConfig.AI_STREAMING !== undefined ? userConfig.AI_STREAMING : CONFIG.AI.STREAMING,
          temperature: userConfig.AI_TEMPERATURE !== undefined ? parseFloat(userConfig.AI_TEMPERATURE) : CONFIG.AI.TEMPERATURE,
          maxTokens: userConfig.AI_MAX_TOKENS !== undefined ? parseInt(userConfig.AI_MAX_TOKENS) : CONFIG.AI.MAX_TOKENS,
          timeout: userConfig.AI_TIMEOUT !== undefined ? parseInt(userConfig.AI_TIMEOUT) : CONFIG.AI.TIMEOUT,

          // 高度な設定
          systemPrompt: userConfig.AI_SYSTEM_PROMPT || '',
          responseFormat: userConfig.AI_RESPONSE_FORMAT || 'markdown',
          safetyEnabled: userConfig.AI_SAFETY_ENABLED !== undefined ? userConfig.AI_SAFETY_ENABLED : true,

          // ユーザー設定情報（強化版）
          userConfig: {
            hasCustomSettings: userConfig._meta?.hasUserOverrides || false,
            customKeys: userConfig._meta?.userKeys || [],
            systemKeys: userConfig._meta?.systemKeys || [],
            configSource: userConfig._meta?.configSource || {},
            lastUpdated: userConfig._meta?.mergedAt
          },

          // API接続情報（.envフォールバック情報追加）
          apiStatus: {
            hasOpenAIKey: !!(userConfig.OPENAI_API_KEY || CONFIG.AI.OPENAI_API_KEY),
            hasAzureEndpoint: !!(userConfig.AZURE_OPENAI_ENDPOINT || CONFIG.AI.AZURE_OPENAI_ENDPOINT),
            localLlmUrl: userConfig.LOCAL_LLM_URL || CONFIG.AI.LOCAL_LLM_URL || 'http://localhost:8000',
            fallbackInfo: {
              usingSystemApiKey: !userConfig.OPENAI_API_KEY && !!CONFIG.AI.OPENAI_API_KEY,
              usingSystemEndpoint: (!userConfig.AZURE_OPENAI_ENDPOINT && !!CONFIG.AI.AZURE_OPENAI_ENDPOINT) || (!userConfig.LOCAL_LLM_URL && !!CONFIG.AI.LOCAL_LLM_URL)
            }
          },

          tools: toolManager.getOpenAITools().map(tool => ({
            name: tool.function.name,
            description: tool.function.description
          }))
        };

        res.json(config);
      } catch (error) {
        console.error('AI設定取得エラー:', error);
        res.status(500).json({
          error: 'config_error',
          message: error.message
        });
      }
    }
  );

  // AIエージェント健全性チェック（.envフォールバック対応強化版）
  app.get('/agent/health',
    oauthSystem.middleware.auth,
    async (req, res) => {
      try {
        const userConfig = await userConfigManager.getUserMergedConfig(req.user.id);
        const userAiAgent = await createUserSpecificAiAgentWithFallback(userConfig, toolManager);

        if (!userAiAgent) {
          return res.status(503).json({
            status: 'unavailable',
            message: 'AIエージェントが初期化できません',
            userConfig: {
              provider: userConfig.AI_PROVIDER || CONFIG.AI.PROVIDER,
              hasApiKey: !!(userConfig.OPENAI_API_KEY || CONFIG.AI.OPENAI_API_KEY),
              hasEndpoint: !!(userConfig.AZURE_OPENAI_ENDPOINT || userConfig.LOCAL_LLM_URL || CONFIG.AI.AZURE_OPENAI_ENDPOINT || CONFIG.AI.LOCAL_LLM_URL),
              configSource: userConfig._meta?.hasUserOverrides ? 'user' : 'system',
              fallbackInfo: {
                usingSystemApiKey: !userConfig.OPENAI_API_KEY && !!CONFIG.AI.OPENAI_API_KEY,
                usingSystemEndpoint: (!userConfig.AZURE_OPENAI_ENDPOINT && !!CONFIG.AI.AZURE_OPENAI_ENDPOINT) || (!userConfig.LOCAL_LLM_URL && !!CONFIG.AI.LOCAL_LLM_URL)
              }
            }
          });
        }

        const healthStatus = await userAiAgent.healthCheck();

        // フォールバック情報を健全性チェック結果に追加
        healthStatus.userConfig = {
          provider: userConfig.AI_PROVIDER || CONFIG.AI.PROVIDER,
          model: userConfig.AI_MODEL || CONFIG.AI.MODEL,
          hasCustomSettings: userConfig._meta?.hasUserOverrides || false,
          configSource: userConfig._meta?.hasUserOverrides ? 'user' : 'system',
          lastConfigUpdate: userConfig._meta?.mergedAt,
          fallbackInfo: {
            apiKeySource: userConfig.OPENAI_API_KEY ? 'user' : 'system(.env)',
            endpointSource: userConfig.AZURE_OPENAI_ENDPOINT || userConfig.LOCAL_LLM_URL ? 'user' : 'system(.env)',
            usingSystemApiKey: !userConfig.OPENAI_API_KEY && !!CONFIG.AI.OPENAI_API_KEY,
            usingSystemEndpoint: (!userConfig.AZURE_OPENAI_ENDPOINT && !!CONFIG.AI.AZURE_OPENAI_ENDPOINT) || (!userConfig.LOCAL_LLM_URL && !!CONFIG.AI.LOCAL_LLM_URL)
          }
        };

        const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(healthStatus);
      } catch (error) {
        res.status(500).json({
          status: 'error',
          message: error.message,
          fallbackInfo: {
            systemApiKeyAvailable: !!CONFIG.AI.OPENAI_API_KEY,
            systemEndpointAvailable: !!(CONFIG.AI.AZURE_OPENAI_ENDPOINT || CONFIG.AI.LOCAL_LLM_URL)
          }
        });
      }
    }
  );

  console.log('🤖 AIエージェントエンドポイント（.envフォールバック対応強化版）を設定しました');
}

/**
 * システム情報エンドポイント
 */
function setupSystemRoutes(app, services) {
  const { toolManager, aiAgent, oauthSystem } = services;

  // ヘルスチェックエンドポイント
  app.get('/health', (req, res) => {
    try {
      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        nodeVersion: process.version,
        services: {
          oauth: !!oauthSystem,
          aiAgent: aiAgent && aiAgent.isInitialized,
          toolManager: !!toolManager && toolManager.tools.size > 0,
          userConfigManager: userConfigManager.initialized
        }
      };

      res.json(healthStatus);
    } catch (error) {
      console.error('ヘルスチェックエラー:', error);
      res.status(500).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });

  // システム情報取得
  app.get('/info', (req, res) => {
    try {
      const systemInfo = {
        name: "OneAgent",
        version: process.env.npm_package_version || '2.0.0',
        description: "動的ツール管理MCP対応サーバー + OAuth 2.0認証 + AIエージェント + ユーザー設定管理",
        environment: CONFIG.NODE_ENV,
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),

        features: {
          oauth: !!oauthSystem,
          aiAgent: aiAgent && aiAgent.isInitialized,
          toolManager: !!toolManager,
          mcp: true,
          userConfigManagement: userConfigManager.initialized,
          perUserSettings: true,
          configTemplates: true,
          envFallback: true,
          directToolExecution: true // 🆕 追加
        },

        config: {
          ai: {
            provider: CONFIG.AI.PROVIDER,
            model: CONFIG.AI.MODEL,
            streaming: CONFIG.AI.STREAMING,
            hasSystemApiKey: !!CONFIG.AI.OPENAI_API_KEY
          },
          tools: {
            directory: CONFIG.TOOLS.DIRECTORY,
            loadedCount: toolManager.tools.size
          },
          oauth: {
            supportedScopes: CONFIG.OAUTH.SUPPORTED_SCOPES,
            clientId: CONFIG.OAUTH.CLIENT_ID
          },
          userConfig: {
            initialized: userConfigManager.initialized,
            configurableKeys: userConfigManager.CONFIGURABLE_KEYS?.length || 0
          }
        },

        endpoints: {
          oauth: {
            authorize: '/oauth/authorize',
            token: '/oauth/token',
            userinfo: '/oauth/userinfo',
            revoke: '/oauth/revoke'
          },
          api: {
            agent: '/agent',
            tools: '/tools',
            health: '/health',
            info: '/info',
            userConfig: '/config/user',
            configTemplates: '/config/templates',
            directToolExecution: '/tools/execute/:toolName', // 🆕 追加
            batchToolExecution: '/tools/execute/batch' // 🆕 追加
          },
          mcp: '/mcp'
        }
      };

      res.json(systemInfo);
    } catch (error) {
      res.status(500).json({
        error: 'system_info_error',
        message: error.message
      });
    }
  });

  console.log('📊 システム情報エンドポイントを設定しました');
}

/**
 * 管理者エンドポイント（安全版）
 */
function setupAdminEndpoints(app, oauthSystem) {
  console.log('🔒 管理者エンドポイント（安全版）を設定中...');

  // 🔧 完全安全版
  app.get('/oauth/stats',
    oauthSystem.middleware.auth,
    oauthSystem.middleware.requireAdmin,
    (req, res) => {
      console.log(`🔍 [HANDLER] OAuth統計ハンドラー開始`);

      try {
        const basicStats = {
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          requestedBy: req.user.username,
          note: 'デバッグ版'
        };

        console.log(`🔍 [HANDLER] レスポンス準備完了`);
        res.json(basicStats);
        console.log(`🔍 [HANDLER] レスポンス送信完了`);

      } catch (error) {
        console.error(`🔍 [HANDLER] エラー:`, error);
        res.status(500).json({
          error: error.message,
          note: 'ハンドラーエラー'
        });
      }
    }
  );

  app.get('/config/stats',
    oauthSystem.middleware.auth,
    oauthSystem.middleware.requireAdmin,
    (req, res) => {
      try {
        // ✅ キャッシュ統計のみ（ファイルアクセスなし）
        const basicStats = {
          timestamp: new Date().toISOString(),
          initialized: userConfigManager?.initialized || false,
          note: '完全安全版 - ファイルI/O完全無効化',
          cache: {
            size: userConfigManager?.userConfigCache?.cache?.size || 0,
            // getStats()を呼ばない（内部でファイルアクセスの可能性）
          }
        };

        res.json(basicStats);
      } catch (error) {
        res.status(200).json({
          error: error.message,
          note: '安全版フォールバック'
        });
      }
    }
  );


  // 設定使用統計（安全版）
  app.get('/config/usage-stats',
    oauthSystem.middleware.auth,
    oauthSystem.middleware.requireAdmin,
    (req, res) => {
      try {
        console.log(`📊 設定使用統計取得: ${req.user.username}`);

        // 基本情報のみ（ファイル読み込み無し）
        const basicStats = {
          timestamp: new Date().toISOString(),
          note: '安全版 - 詳細統計無効化（ファイルI/O無し）',
          totalUsers: 'ファイルI/O無効化により取得不可',
          usersWithCustomSettings: 'ファイルI/O無効化により取得不可',
          requestedBy: req.user.username,
          alternative: '個別ユーザー設定は /config/user エンドポイントで確認可能'
        };

        res.json(basicStats);

      } catch (error) {
        console.error(`設定使用統計取得エラー [${req.user.username}]:`, error);
        res.status(200).json({
          error: error.message,
          timestamp: new Date().toISOString(),
          requestedBy: req.user.username,
          note: '安全版フォールバック'
        });
      }
    }
  );

  // 全ユーザー設定一覧（安全版）
  app.get('/config/users',
    oauthSystem.middleware.auth,
    oauthSystem.middleware.requireAdmin,
    (req, res) => {
      try {
        console.log(`📊 全ユーザー設定取得: ${req.user.username}`);

        // ファイルI/O無効化のため、基本情報のみ
        const response = {
          users: [],
          count: 0,
          retrievedAt: new Date().toISOString(),
          retrievedBy: req.user.username,
          note: '安全版 - ファイルI/O無効化により詳細データ取得不可',
          alternative: [
            '個別ユーザー設定確認: GET /config/user',
            'システム設定確認: GET /env/system',
            'OAuth統計確認: GET /oauth/stats'
          ]
        };

        res.json(response);

      } catch (error) {
        console.error(`全ユーザー設定取得エラー [${req.user.username}]:`, error);
        res.status(200).json({
          users: [],
          count: 0,
          error: error.message,
          retrievedAt: new Date().toISOString(),
          retrievedBy: req.user.username,
          note: '安全版フォールバック'
        });
      }
    }
  );

  // システム環境変数（安全版）
  app.get('/env/system',
    oauthSystem.middleware.auth,
    oauthSystem.middleware.requireAdmin,
    (req, res) => {
      try {
        console.log(`📊 システム環境変数取得: ${req.user.username}`);

        // 環境変数のみ（.envファイル読み込み無し）
        const envVars = {
          // AI設定
          AI_PROVIDER: process.env.AI_PROVIDER || CONFIG.AI.PROVIDER,
          AI_MODEL: process.env.AI_MODEL || CONFIG.AI.MODEL,
          AI_TEMPERATURE: process.env.AI_TEMPERATURE || CONFIG.AI.TEMPERATURE,
          AI_STREAMING: process.env.AI_STREAMING || CONFIG.AI.STREAMING,
          AI_MAX_TOKENS: process.env.AI_MAX_TOKENS || CONFIG.AI.MAX_TOKENS,

          // 接続情報（機密情報はマスク）
          hasOpenAIKey: !!(process.env.OPENAI_API_KEY || CONFIG.AI.OPENAI_API_KEY),
          hasAzureEndpoint: !!(process.env.AZURE_OPENAI_ENDPOINT || CONFIG.AI.AZURE_OPENAI_ENDPOINT),
          hasLocalLLM: !!(process.env.LOCAL_LLM_URL || CONFIG.AI.LOCAL_LLM_URL),

          // サーバー設定
          NODE_ENV: process.env.NODE_ENV,
          PORT: process.env.PORT,
          HOST: process.env.HOST
        };

        const response = {
          exists: true,
          variables: envVars,
          currentConfig: {
            provider: CONFIG.AI.PROVIDER,
            model: CONFIG.AI.MODEL,
            temperature: CONFIG.AI.TEMPERATURE,
            streaming: CONFIG.AI.STREAMING
          },
          note: '安全版 - 環境変数のみ（.envファイル読み込み無し）',
          requestedBy: req.user.username,
          retrievedAt: new Date().toISOString()
        };

        res.json(response);

      } catch (error) {
        console.error(`システム環境変数取得エラー [${req.user.username}]:`, error);
        res.status(200).json({
          exists: false,
          error: error.message,
          requestedBy: req.user.username,
          retrievedAt: new Date().toISOString(),
          note: '安全版フォールバック'
        });
      }
    }
  );

  console.log('✅ 管理者エンドポイント（安全版）設定完了');
  console.log('   ⚠️ ファイルI/O機能は無効化されています');
  console.log('   ⚠️ 詳細統計は制限されています');
  console.log('   ✅ 基本的な管理機能は利用可能です');
}

/**
 * 管理者用ツールエンドポイント
 */
function setupAdminToolEndpoints(app, toolManager, oauthSystem) {
  // ツールリロード
  app.post('/tools/reload',
    oauthSystem.middleware.auth,
    oauthSystem.middleware.requireAdmin,
    async (req, res) => {
      try {
        console.log(`🔄 ツールリロード実行: ${req.user.username}`);

        const result = await toolManager.reloadTools();
        const tools = toolManager.getToolsList();

        res.json({
          status: 'success',
          message: 'ツールをリロードしました',
          loadedTools: tools.length,
          tools: tools,
          reloadedAt: new Date().toISOString(),
          reloadedBy: req.user.username
        });

      } catch (error) {
        console.error(`❌ ツールリロードエラー: ${error.message}`);

        res.status(500).json({
          status: 'error',
          message: error.message,
          reloadedAt: new Date().toISOString(),
          reloadedBy: req.user.username
        });
      }
    }
  );

  console.log('🛠️ 管理者用ツールエンドポイントを設定しました');
}

/**
 * ユーザー設定管理エンドポイント
 */
function setupUserConfigRoutes(app, oauthSystem) {
  // ユーザー設定取得
  app.get('/config/user',
    oauthSystem.middleware.auth,
    async (req, res) => {
      try {
        const userId = req.user.id;
        const mergedConfig = await userConfigManager.getUserMergedConfig(userId);

        // 機密情報をマスク
        const safeConfig = { ...mergedConfig };
        const sensitiveKeys = [
          'OPENAI_API_KEY', 'JWT_SECRET', 'CLIENT_SECRET', 'SESSION_SECRET',
          'AZURE_OPENAI_ENDPOINT', 'LOCAL_LLM_URL', 'API_KEY'
        ];

        sensitiveKeys.forEach(key => {
          if (safeConfig[key] && safeConfig[key] !== '') {
            if (safeConfig[key] === CONFIG.AI.OPENAI_API_KEY) {
              safeConfig[key] = '***SYSTEM(.env)***';
            } else {
              safeConfig[key] = '***USER***';
            }
          }
        });

        res.json({
          config: safeConfig,
          meta: mergedConfig._meta
        });

      } catch (error) {
        console.error(`ユーザー設定取得エラー [${req.user.id}]:`, error);
        res.status(500).json({
          error: 'user_config_error',
          message: error.message
        });
      }
    }
  );

  // ユーザー設定更新
  app.post('/config/user',
    oauthSystem.middleware.auth,
    async (req, res) => {
      try {
        const userId = req.user.id;
        const { config } = req.body;

        if (!config || typeof config !== 'object') {
          return res.status(400).json({
            error: 'invalid_request',
            message: 'configオブジェクトが必要です'
          });
        }

        // 設定の検証
        const validation = userConfigManager.validateUserConfig(config);
        if (!validation.valid) {
          return res.status(400).json({
            error: 'invalid_config',
            message: 'Invalid configuration',
            errors: validation.errors,
            warnings: validation.warnings
          });
        }

        const updatedConfig = await userConfigManager.updateUserConfig(userId, config);

        console.log(`⚙️ ユーザー設定更新: ${req.user.username}`);

        res.json({
          status: 'success',
          message: 'ユーザー設定を更新しました',
          config: updatedConfig,
          updatedBy: req.user.username,
          updatedAt: new Date().toISOString(),
          validation: validation
        });

      } catch (error) {
        console.error(`ユーザー設定更新エラー [${req.user.id}]:`, error);
        res.status(500).json({
          error: 'user_config_update_error',
          message: error.message
        });
      }
    }
  );

  // ユーザー設定項目削除
  app.delete('/config/user/:key',
    oauthSystem.middleware.auth,
    async (req, res) => {
      try {
        const userId = req.user.id;
        const { key } = req.params;

        const removed = await userConfigManager.removeUserConfigKey(userId, key);

        if (removed) {
          console.log(`🗑️ ユーザー設定項目削除: ${req.user.username}.${key}`);
          res.json({
            status: 'success',
            message: `設定項目「${key}」を削除しました`,
            removedKey: key,
            removedBy: req.user.username,
            removedAt: new Date().toISOString()
          });
        } else {
          res.status(404).json({
            error: 'key_not_found',
            message: `設定項目「${key}」が見つかりません`
          });
        }

      } catch (error) {
        console.error(`ユーザー設定項目削除エラー [${req.user.id}.${req.params.key}]:`, error);
        res.status(500).json({
          error: 'user_config_delete_error',
          message: error.message
        });
      }
    }
  );

  // ユーザー設定リセット
  app.post('/config/user/reset',
    oauthSystem.middleware.auth,
    async (req, res) => {
      try {
        const userId = req.user.id;

        await userConfigManager.resetUserConfig(userId);

        console.log(`🔄 ユーザー設定リセット: ${req.user.username}`);

        res.json({
          status: 'success',
          message: 'ユーザー設定をシステムデフォルトにリセットしました',
          resetBy: req.user.username,
          resetAt: new Date().toISOString()
        });

      } catch (error) {
        console.error(`ユーザー設定リセットエラー [${req.user.id}]:`, error);
        res.status(500).json({
          error: 'user_config_reset_error',
          message: error.message
        });
      }
    }
  );

  // ユーザー設定の検証
  app.post('/config/user/validate',
    oauthSystem.middleware.auth,
    async (req, res) => {
      try {
        const { config } = req.body;

        if (!config || typeof config !== 'object') {
          return res.status(400).json({
            error: 'invalid_request',
            message: 'configオブジェクトが必要です'
          });
        }

        const validation = userConfigManager.validateUserConfig(config);

        res.json({
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
          configurableKeys: validation.configurableKeys
        });

      } catch (error) {
        console.error(`設定検証エラー [${req.user.id}]:`, error);
        res.status(500).json({
          error: 'config_validation_error',
          message: error.message
        });
      }
    }
  );

  console.log('👤 ユーザー設定管理エンドポイントを設定しました');
}

/**
 * 設定テンプレート管理エンドポイント
 */
function setupConfigTemplateRoutes(app, oauthSystem) {
  // 利用可能なテンプレート一覧
  const CONFIG_TEMPLATES = {
    openai_standard: {
      name: 'OpenAI 標準',
      description: 'OpenAI APIを使用した標準的な設定',
      category: 'openai',
      config: {
        AI_PROVIDER: 'openai',
        AI_MODEL: 'gpt-4o-mini',
        AI_TEMPERATURE: 0.7,
        AI_STREAMING: true,
        AI_MAX_TOKENS: 2000,
        AI_TIMEOUT: 60000,
        AI_SAFETY_ENABLED: true
      }
    },
    openai_creative: {
      name: 'OpenAI 創造的',
      description: '創造性を重視したOpenAI設定（高いTemperature）',
      category: 'openai',
      config: {
        AI_PROVIDER: 'openai',
        AI_MODEL: 'gpt-4o',
        AI_TEMPERATURE: 1.2,
        AI_STREAMING: true,
        AI_MAX_TOKENS: 4000,
        AI_TIMEOUT: 90000,
        AI_SAFETY_ENABLED: true
      }
    },
    localllm_coder: {
      name: 'ローカルLLM コーディング',
      description: 'コーディングに特化したローカルLLM設定',
      category: 'local',
      config: {
        AI_PROVIDER: 'localllm',
        AI_MODEL: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        AI_TEMPERATURE: 0.8,
        AI_STREAMING: true,
        AI_MAX_TOKENS: 4000,
        AI_TIMEOUT: 120000,
        LOCAL_LLM_URL: 'http://localhost:8000',
        LOCAL_LLM_MODEL: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        AI_SAFETY_ENABLED: false
      }
    }
  };

  // テンプレート一覧取得
  app.get('/config/templates',
    oauthSystem.middleware.auth,
    (req, res) => {
      try {
        const { category } = req.query;

        let templates = CONFIG_TEMPLATES;

        // カテゴリーフィルター
        if (category) {
          templates = Object.fromEntries(
            Object.entries(CONFIG_TEMPLATES).filter(([_, template]) =>
              template.category === category
            )
          );
        }

        res.json({
          templates,
          categories: [...new Set(Object.values(CONFIG_TEMPLATES).map(t => t.category))],
          count: Object.keys(templates).length
        });

      } catch (error) {
        console.error('テンプレート一覧取得エラー:', error);
        res.status(500).json({
          error: 'template_list_error',
          message: error.message
        });
      }
    }
  );

  // 特定のテンプレート取得
  app.get('/config/templates/:templateId',
    oauthSystem.middleware.auth,
    (req, res) => {
      try {
        const { templateId } = req.params;
        const template = CONFIG_TEMPLATES[templateId];

        if (!template) {
          return res.status(404).json({
            error: 'template_not_found',
            message: `テンプレート「${templateId}」が見つかりません`
          });
        }

        res.json(template);

      } catch (error) {
        console.error('テンプレート取得エラー:', error);
        res.status(500).json({
          error: 'template_error',
          message: error.message
        });
      }
    }
  );

  // テンプレートを適用
  app.post('/config/templates/:templateId/apply',
    oauthSystem.middleware.auth,
    async (req, res) => {
      try {
        const userId = req.user.id;
        const { templateId } = req.params;
        const { merge = false } = req.body;

        const template = CONFIG_TEMPLATES[templateId];

        if (!template) {
          return res.status(404).json({
            error: 'template_not_found',
            message: `テンプレート「${templateId}」が見つかりません`
          });
        }

        let configToApply = template.config;

        // マージモードの場合、既存設定と統合
        if (merge) {
          const currentConfig = await userConfigManager.getUserMergedConfig(userId);
          configToApply = {
            ...currentConfig,
            ...template.config
          };
        }

        // 設定を適用
        const updatedConfig = await userConfigManager.updateUserConfig(userId, configToApply);

        console.log(`📋 テンプレート適用: ${req.user.username} -> ${templateId}`);

        res.json({
          status: 'success',
          message: `テンプレート「${template.name}」を適用しました`,
          templateId,
          templateName: template.name,
          appliedConfig: updatedConfig,
          merge: merge,
          appliedBy: req.user.username,
          appliedAt: new Date().toISOString()
        });

      } catch (error) {
        console.error(`テンプレート適用エラー [${req.user.id}]:`, error);
        res.status(500).json({
          error: 'template_apply_error',
          message: error.message
        });
      }
    }
  );

  console.log('📋 設定テンプレート管理エンドポイントを設定しました');
}