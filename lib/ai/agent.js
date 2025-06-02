/**
 * AIエージェント（ユーザー設定対応強化版）
 * OpenAI/Azure OpenAI/ローカルLLM対応 + ユーザー固有設定
 * 認証統合 + ツール管理システム連携 + 高度な設定機能
 */

import OpenAI from 'openai';
import { CONFIG } from '../config/config.js';

/**
 * AIエージェントクラス（ユーザー設定対応強化版）
 */
export class AIAgent {
  constructor(toolManager, userConfig = null) {
    this.toolManager = toolManager;
    this.userConfig = userConfig;
    this.openaiClient = null;
    this.isInitialized = false;
    this.requestCount = 0;
    this.totalTokens = 0;
    this.errorCount = 0;
    this.lastError = null;
    this.currentConfig = this.buildEffectiveConfig(userConfig);
    this.configHistory = [];
    this.performanceMetrics = {
      averageResponseTime: 0,
      totalResponseTime: 0,
      successfulRequests: 0,
      failedRequests: 0
    };
    this.initializeClient();
  }

  /**
   * 有効な設定を構築（システム設定 + ユーザー設定のマージ）強化版
   */
  buildEffectiveConfig(userConfig = null) {
    const effectiveConfig = {
      provider: CONFIG.AI.PROVIDER,
      model: CONFIG.AI.MODEL,
      streaming: CONFIG.AI.STREAMING,
      temperature: CONFIG.AI.TEMPERATURE,
      maxTokens: CONFIG.AI.MAX_TOKENS,
      timeout: CONFIG.AI.TIMEOUT,
      openaiApiKey: CONFIG.AI.OPENAI_API_KEY,
      azureEndpoint: CONFIG.AI.AZURE_OPENAI_ENDPOINT,
      azureApiVersion: CONFIG.AI.AZURE_OPENAI_API_VERSION,
      localLlmUrl: CONFIG.AI.LOCAL_LLM_URL,
      localLlmModel: CONFIG.AI.LOCAL_LLM_MODEL,

      // 強化版の新しい設定項目
      systemPrompt: '',
      responseFormat: 'markdown',
      safetyEnabled: true,
      retryAttempts: 3,
      retryDelay: 1000,
      customHeaders: {},
      rateLimitConfig: {
        requestsPerMinute: 60,
        requestsPerHour: 1000
      }
    };

    // ユーザー設定で上書き
    if (userConfig) {
      if (userConfig.AI_PROVIDER) effectiveConfig.provider = userConfig.AI_PROVIDER;
      if (userConfig.AI_MODEL) effectiveConfig.model = userConfig.AI_MODEL;
      if (userConfig.AI_STREAMING !== undefined) effectiveConfig.streaming = userConfig.AI_STREAMING;
      if (userConfig.AI_TEMPERATURE !== undefined) effectiveConfig.temperature = parseFloat(userConfig.AI_TEMPERATURE);
      if (userConfig.AI_MAX_TOKENS !== undefined) effectiveConfig.maxTokens = parseInt(userConfig.AI_MAX_TOKENS);
      if (userConfig.AI_TIMEOUT !== undefined) effectiveConfig.timeout = parseInt(userConfig.AI_TIMEOUT);

      // 機密情報の処理（ユーザー設定が優先）
      if (userConfig.OPENAI_API_KEY) effectiveConfig.openaiApiKey = userConfig.OPENAI_API_KEY;
      if (userConfig.AZURE_OPENAI_ENDPOINT) effectiveConfig.azureEndpoint = userConfig.AZURE_OPENAI_ENDPOINT;
      if (userConfig.AZURE_OPENAI_API_VERSION) effectiveConfig.azureApiVersion = userConfig.AZURE_OPENAI_API_VERSION;
      if (userConfig.LOCAL_LLM_URL) effectiveConfig.localLlmUrl = userConfig.LOCAL_LLM_URL;
      if (userConfig.LOCAL_LLM_MODEL) effectiveConfig.localLlmModel = userConfig.LOCAL_LLM_MODEL;

      // 強化版の新しい設定項目
      if (userConfig.AI_SYSTEM_PROMPT) effectiveConfig.systemPrompt = userConfig.AI_SYSTEM_PROMPT;
      if (userConfig.AI_RESPONSE_FORMAT) effectiveConfig.responseFormat = userConfig.AI_RESPONSE_FORMAT;
      if (userConfig.AI_SAFETY_ENABLED !== undefined) effectiveConfig.safetyEnabled = userConfig.AI_SAFETY_ENABLED;

      // カスタムヘッダーやレート制限設定
      if (userConfig.AI_CUSTOM_HEADERS) {
        try {
          effectiveConfig.customHeaders = JSON.parse(userConfig.AI_CUSTOM_HEADERS);
        } catch (error) {
          console.warn('カスタムヘッダーの解析に失敗:', error);
        }
      }
    }

    return effectiveConfig;
  }

  /**
   * ユーザー設定の動的適用（強化版）
   */
  applyUserConfig(userConfig) {
    const previousConfig = { ...this.currentConfig };
    this.userConfig = userConfig;
    this.currentConfig = this.buildEffectiveConfig(userConfig);

    // 設定履歴を記録
    this.configHistory.push({
      timestamp: new Date().toISOString(),
      action: 'apply_user_config',
      previousConfig: {
        provider: previousConfig.provider,
        model: previousConfig.model,
        temperature: previousConfig.temperature
      },
      newConfig: {
        provider: this.currentConfig.provider,
        model: this.currentConfig.model,
        temperature: this.currentConfig.temperature
      },
      userConfigSource: userConfig._meta?.hasUserOverrides ? 'user' : 'system'
    });

    // プロバイダーまたは重要な設定が変わった場合はクライアントを再初期化
    const needsReinit =
      previousConfig.provider !== this.currentConfig.provider ||
      previousConfig.openaiApiKey !== this.currentConfig.openaiApiKey ||
      previousConfig.azureEndpoint !== this.currentConfig.azureEndpoint ||
      previousConfig.localLlmUrl !== this.currentConfig.localLlmUrl ||
      JSON.stringify(previousConfig.customHeaders) !== JSON.stringify(this.currentConfig.customHeaders);

    if (needsReinit) {
      console.log(`🔄 設定変更によりAIクライアントを再初期化: ${previousConfig.provider} → ${this.currentConfig.provider}`);
      this.initializeClient();
    } else {
      console.log(`⚙️ AI設定を更新（再初期化不要）`);
    }

    return this.currentConfig;
  }

  /**
   * OpenAI/Azure OpenAI/ローカルLLMクライアントの初期化（強化版）
   */
  initializeClient() {
    try {
      const config = this.currentConfig;
      console.log(`🤖 AIクライアントを初期化中... (${config.provider.toUpperCase()})`);

      let clientConfig = {
        timeout: config.timeout,
        defaultHeaders: {
          'User-Agent': 'OneAgent/2.0.0',
          ...config.customHeaders
        },
        maxRetries: config.retryAttempts || 3,
        dangerouslyAllowBrowser: false
      };

      switch (config.provider.toLowerCase()) {
        case 'openai':
          if (!config.openaiApiKey) {
            console.warn('⚠️ OPENAI_API_KEY が設定されていません。AIエージェント機能は無効です。');
            this.isInitialized = false;
            this.lastError = 'OPENAI_API_KEY not configured';
            return;
          }
          clientConfig.apiKey = config.openaiApiKey;
          break;

        case 'azureopenai':
          if (!config.openaiApiKey || !config.azureEndpoint) {
            console.warn('⚠️ Azure OpenAI設定が不完全です。AIエージェント機能は無効です。');
            this.isInitialized = false;
            this.lastError = 'Azure OpenAI configuration incomplete';
            return;
          }
          clientConfig.apiKey = config.openaiApiKey;
          clientConfig.baseURL = `${config.azureEndpoint}/openai/deployments/${config.model}`;
          clientConfig.defaultQuery = { 'api-version': config.azureApiVersion };
          clientConfig.defaultHeaders = {
            ...clientConfig.defaultHeaders,
            'api-key': config.openaiApiKey,
          };
          break;

        case 'localllm':
          console.log(`🏠 ローカルLLMに接続中: ${config.localLlmUrl}`);
          clientConfig.baseURL = config.localLlmUrl;
          clientConfig.apiKey = 'dummy-key'; // VLLMではAPI keyは不要だが必須なのでダミーを設定
          clientConfig.timeout = Math.max(config.timeout, 120000); // 最低2分
          break;

        default:
          console.error(`❌ 未対応のAIプロバイダー: ${config.provider}`);
          this.isInitialized = false;
          this.lastError = `Unsupported provider: ${config.provider}`;
          return;
      }

      this.openaiClient = new OpenAI(clientConfig);
      this.isInitialized = true;
      this.lastError = null;

      console.log('✅ AIクライアントを初期化しました');
      console.log(`   プロバイダー: ${config.provider.toUpperCase()}`);
      console.log(`   モデル: ${config.model}`);
      console.log(`   ストリーミング: ${config.streaming}`);
      console.log(`   カスタムヘッダー: ${Object.keys(config.customHeaders).length}個`);
      console.log(`   設定ソース: ${this.userConfig?._meta?.hasUserOverrides ? 'ユーザー設定' : 'システム設定'}`);

    } catch (error) {
      console.error('❌ AIクライアント初期化エラー:', error.message);
      this.isInitialized = false;
      this.lastError = error.message;
    }
  }

  /**
   * クエリ処理のメインエントリーポイント（強化版）
   */
  processQuery(query, options = {}) {
    if (!this.isInitialized) {
      throw new Error(`AIエージェントが初期化されていません: ${this.lastError || '原因不明'}`);
    }

    if (!query || typeof query !== 'string') {
      throw new Error('クエリは必須の文字列です');
    }

    // 有効な設定を使用してオプションを構築
    const config = this.currentConfig;
    const processOptions = {
      streaming: options.streaming !== undefined ? options.streaming : config.streaming,
      model: options.model || config.model,
      temperature: options.temperature !== undefined ? options.temperature : config.temperature,
      maxTokens: options.maxTokens !== undefined ? options.maxTokens : config.maxTokens,
      timeout: options.timeout !== undefined ? options.timeout : config.timeout,
      tools: options.tools || [],
      authContext: options.authContext || null,

      // 強化版の新しいオプション
      systemPrompt: options.systemPrompt || config.systemPrompt,
      responseFormat: options.responseFormat || config.responseFormat,
      safetyEnabled: options.safetyEnabled !== undefined ? options.safetyEnabled : config.safetyEnabled,
      retryAttempts: options.retryAttempts !== undefined ? options.retryAttempts : config.retryAttempts
    };

    // ツール選択の検証
    const toolValidation = this.toolManager.validateSelectedTools(processOptions.tools);
    if (!toolValidation.valid) {
      throw new Error(`以下のツールが見つかりません: ${toolValidation.notFound.join(', ')}`);
    }

    // 統計情報更新
    this.requestCount++;
    const startTime = Date.now();

    console.log(`🔄 AI処理開始 (${this.userConfig?._meta?.hasUserOverrides ? 'ユーザー設定' : 'システム設定'}):`, {
      provider: config.provider,
      model: processOptions.model,
      streaming: processOptions.streaming,
      toolCount: processOptions.tools.length,
      temperature: processOptions.temperature,
      maxTokens: processOptions.maxTokens,
      safetyEnabled: processOptions.safetyEnabled
    });

    // パフォーマンス測定を含むPromiseラッパー
    const measurePerformance = async (processFunc) => {
      try {
        const result = await processFunc();
        const responseTime = Date.now() - startTime;
        this.updatePerformanceMetrics(responseTime, true);
        return result;
      } catch (error) {
        const responseTime = Date.now() - startTime;
        this.updatePerformanceMetrics(responseTime, false);
        this.errorCount++;
        this.lastError = error.message;
        throw error;
      }
    };

    if (processOptions.streaming) {
      // ストリーミング処理：async generator を直接呼び出し
      console.log('🔄 Creating streaming generator');
      return this._createStreamingGenerator(query, processOptions);
    } else {
      // 非ストリーミング処理
      console.log('🔄 Processing non-streaming query');
      return measurePerformance(() => this.processNonStreamingQuery(query, processOptions));
    }
  }

  /**
   * パフォーマンス指標の更新（新機能）
   */
  updatePerformanceMetrics(responseTime, success) {
    this.performanceMetrics.totalResponseTime += responseTime;

    if (success) {
      this.performanceMetrics.successfulRequests++;
    } else {
      this.performanceMetrics.failedRequests++;
    }

    const totalRequests = this.performanceMetrics.successfulRequests + this.performanceMetrics.failedRequests;
    this.performanceMetrics.averageResponseTime = this.performanceMetrics.totalResponseTime / totalRequests;
  }

  /**
   * ストリーミング用のasync generatorを作成（強化版）
   */
  async *_createStreamingGenerator(query, options) {
    const startTime = Date.now();
    let success = false;

    try {
      const config = this.currentConfig;
      console.log(`📡 ストリーミング処理開始: ${options.model} (${config.provider})`);
      console.log(`🔧 使用可能ツール: ${options.tools.length}個`);

      // 初期化完了を通知
      yield {
        type: 'init',
        content: `ストリーミング開始 (${config.provider}/${options.model})`,
        userConfig: this.userConfig?._meta?.hasUserOverrides ? '個人設定' : 'システム設定',
        configInfo: {
          provider: config.provider,
          model: options.model,
          temperature: options.temperature,
          safetyEnabled: options.safetyEnabled
        }
      };

      // メッセージとツール設定の準備
      const { messages, tools } = this.prepareRequest(query, options);

      // OpenAI API リクエストパラメータ
      const requestParams = {
        model: options.model,
        messages: messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: true
      };

      // ツールが選択されている場合のみtools設定を追加
      if (tools.length > 0) {
        requestParams.tools = tools;
        requestParams.tool_choice = 'auto';
      }

      // レスポンス形式の設定
      if (options.responseFormat && options.responseFormat !== 'markdown') {
        requestParams.response_format = { type: options.responseFormat };
      }

      // セーフティ設定
      if (!options.safetyEnabled) {
        // プロバイダー固有のセーフティ無効化設定
        if (config.provider === 'openai') {
          requestParams.moderation = false;
        }
      }

      console.log('🚀 OpenAI API call starting...', {
        provider: config.provider,
        model: requestParams.model,
        temperature: requestParams.temperature,
        max_tokens: requestParams.max_tokens,
        toolCount: tools.length,
        messageCount: messages.length,
        configSource: this.userConfig?._meta?.hasUserOverrides ? 'user' : 'system',
        safetyEnabled: options.safetyEnabled
      });

      // ストリーミング開始（リトライ機能付き）
      let completion;
      let retryCount = 0;
      const maxRetries = options.retryAttempts || 3;

      while (retryCount <= maxRetries) {
        try {
          completion = await this.openaiClient.chat.completions.create(requestParams);
          console.log('✅ OpenAI API stream created successfully');
          break;
        } catch (apiError) {
          retryCount++;
          console.error(`❌ OpenAI API call failed (attempt ${retryCount}/${maxRetries + 1}):`, apiError);

          if (retryCount > maxRetries) {
            yield {
              type: 'error',
              content: `OpenAI API エラー (${config.provider}): ${apiError.message}`,
              retryAttempts: retryCount - 1
            };
            return;
          }

          // リトライ前の待機
          const retryDelay = config.retryDelay || 1000;
          await new Promise(resolve => setTimeout(resolve, retryDelay * retryCount));

          yield {
            type: 'retry',
            content: `リトライ中... (${retryCount}/${maxRetries})`
          };
        }
      }

      // ストリーミングレスポンスを処理
      yield* this._handleStreamingResponse(completion, options);

      success = true;
      console.log('🏁 Streaming query completed successfully');

    } catch (error) {
      console.error('❌ ストリーミング処理エラー:', error);
      yield {
        type: 'error',
        content: `ストリーミングエラー: ${error.message}`,
        errorDetails: {
          name: error.name,
          stack: CONFIG.DEBUG.ENABLED ? error.stack : undefined
        }
      };
    } finally {
      const responseTime = Date.now() - startTime;
      this.updatePerformanceMetrics(responseTime, success);
    }
  }

  /**
   * ストリーミングレスポンスの処理（強化版）
   */
  async *_handleStreamingResponse(completion, options) {
    let toolCalls = [];
    let hasContent = false;
    let chunkCount = 0;
    let totalTokens = 0;

    try {
      console.log('📦 Starting to process streaming chunks...');

      for await (const chunk of completion) {
        chunkCount++;

        if (chunkCount % 50 === 0) {
          console.log(`📦 Processed ${chunkCount} chunks`);
        }

        const delta = chunk.choices?.[0]?.delta;
        const finishReason = chunk.choices?.[0]?.finish_reason;
        const usage = chunk.usage;

        if (usage) {
          totalTokens = usage.total_tokens;
        }

        if (!delta) continue;

        // テキストコンテンツの処理
        if (delta.content) {
          hasContent = true;
          yield {
            type: 'text',
            content: delta.content,
            metadata: {
              chunkIndex: chunkCount,
              hasToolCalls: toolCalls.length > 0
            }
          };
        }

        // ツール呼び出しの処理
        if (delta.tool_calls) {
          toolCalls = this.processToolCallsDelta(delta.tool_calls, toolCalls);
        }

        // 完了理由の処理
        if (finishReason === 'tool_calls' && toolCalls.length > 0) {
          console.log(`🔧 Processing ${toolCalls.length} tool calls`);
          yield {
            type: 'tool_calls_start',
            toolCount: toolCalls.length,
            tools: toolCalls.map(tc => tc.function?.name).filter(Boolean)
          };

          try {
            const toolResults = await this.executeToolCalls(toolCalls, options);

            // ツール結果をストリーミング出力
            for (const result of toolResults) {
              yield result;
            }

            yield {
              type: 'tool_calls_end',
              successCount: toolResults.filter(r => r.type === 'tool_call_result').length,
              errorCount: toolResults.filter(r => r.type === 'tool_call_error').length
            };

            // フォローアップレスポンスの処理
            if (toolResults.some(r => r.type === 'tool_call_result')) {
              console.log('🔄 Processing follow-up response');
              yield* this._handleFollowUpResponse(toolCalls, toolResults, options);
            }
          } catch (toolError) {
            console.error('❌ Tool execution error:', toolError);
            yield {
              type: 'error',
              content: `ツール実行エラー: ${toolError.message}`,
              toolError: true
            };
          }
        }

        // 自然な完了
        if (finishReason === 'stop') {
          console.log('🏁 Natural completion detected');
          break;
        }

        // レート制限やその他の完了理由
        if (finishReason === 'length') {
          yield {
            type: 'warning',
            content: 'レスポンスが最大トークン数に達したため切り詰められました'
          };
          break;
        }

        // 安全装置
        if (chunkCount > 2000) {
          console.warn('⚠️ Too many chunks, terminating');
          yield {
            type: 'error',
            content: 'ストリーミングが長すぎるため中断されました',
            chunkCount
          };
          break;
        }
      }

      console.log(`✅ Completed processing ${chunkCount} chunks`);

      // 使用トークン数の更新
      if (totalTokens > 0) {
        this.totalTokens += totalTokens;
        yield {
          type: 'usage',
          content: `使用トークン数: ${totalTokens}`,
          tokens: totalTokens,
          totalTokens: this.totalTokens
        };
      }

      // コンテンツもツール呼び出しもない場合
      if (!hasContent && toolCalls.length === 0) {
        yield {
          type: 'text',
          content: 'すみません、適切な回答を生成できませんでした。設定を確認してください。',
          fallback: true
        };
      }

    } catch (error) {
      console.error('❌ ストリーミングレスポンス処理エラー:', error);
      yield {
        type: 'error',
        content: `ストリーミング処理エラー: ${error.message}`,
        chunkCount
      };
    }
  }

  /**
   * システムプロンプトの生成（強化版）
   */
  generateSystemPrompt(options) {
    const config = this.currentConfig;
    let systemPrompt = '';

    // カスタムシステムプロンプトがある場合はそれを優先
    if (options.systemPrompt || config.systemPrompt) {
      systemPrompt = options.systemPrompt || config.systemPrompt;
    } else {
      // デフォルトのシステムプロンプト
      systemPrompt = `あなたは親切で知識豊富なAIアシスタントです。`;
    }

    // 認証情報がある場合
    if (options.authContext && options.authContext.user) {
      const user = options.authContext.user;
      systemPrompt += `\n\n現在のユーザー: ${user.username} (${user.profile?.displayName || user.username})`;

      if (user.roles && user.roles.includes('admin')) {
        systemPrompt += `\nユーザー権限: 管理者`;
      }

      // ユーザー設定情報を追加
      if (options.authContext.userConfig?._meta?.hasUserOverrides) {
        systemPrompt += `\n設定: カスタム設定を使用中 (${config.provider}/${config.model})`;
      } else {
        systemPrompt += `\n設定: システムデフォルト (${config.provider}/${config.model})`;
      }
    }

    // セーフティ設定の情報
    if (options.safetyEnabled !== undefined) {
      systemPrompt += options.safetyEnabled
        ? `\nセーフティフィルター: 有効（有害なコンテンツの生成を避けてください）`
        : `\nセーフティフィルター: 無効`;
    }

    // レスポンス形式の指定
    if (options.responseFormat && options.responseFormat !== 'markdown') {
      systemPrompt += `\nレスポンス形式: ${options.responseFormat}`;
    }

    // 利用可能なツールの情報
    if (options.tools.length > 0) {
      const toolDescriptions = options.tools.map(toolName => {
        const tool = this.toolManager.tools.get(toolName);
        return tool ? `- ${tool.name}: ${tool.description}` : null;
      }).filter(Boolean);

      if (toolDescriptions.length > 0) {
        systemPrompt += `\n\n利用可能なツール:\n${toolDescriptions.join('\n')}`;
        systemPrompt += `\n\nツールを使用する際は、適切な引数を渡してください。`;
        systemPrompt += `\nセキュリティが重要なため、ユーザーが認証されている場合のみファイル操作などの機能を使用してください。`;
      }
    } else {
      systemPrompt += `\n\n現在利用可能なツールはありません。一般的な知識で質問にお答えします。`;
    }

    return systemPrompt;
  }

  /**
   * リクエストの準備（強化版）
   */
  prepareRequest(query, options) {
    // システムプロンプトの生成
    const systemPrompt = this.generateSystemPrompt(options);

    // メッセージの構築
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ];

    // 選択されたツールのOpenAI定義を取得
    const tools = this.toolManager.getSelectedOpenAITools(options.tools);

    return { messages, tools };
  }

  /**
   * 非ストリーミングクエリ処理（強化版）
   */
  async processNonStreamingQuery(query, options) {
    try {
      const config = this.currentConfig;
      console.log(`🤖 非ストリーミング処理開始: ${options.model} (${config.provider})`);
      console.log(`🔧 使用可能ツール: ${options.tools.length}個`);

      // メッセージとツール設定の準備
      const { messages, tools } = this.prepareRequest(query, options);

      // OpenAI API リクエストパラメータ
      const requestParams = {
        model: options.model,
        messages: messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: false
      };

      // ツールが選択されている場合のみtools設定を追加
      if (tools.length > 0) {
        requestParams.tools = tools;
        requestParams.tool_choice = 'auto';
      }

      // レスポンス形式の設定
      if (options.responseFormat && options.responseFormat !== 'markdown') {
        requestParams.response_format = { type: options.responseFormat };
      }

      // セーフティ設定
      if (!options.safetyEnabled) {
        if (config.provider === 'openai') {
          requestParams.moderation = false;
        }
      }

      // API呼び出し（リトライ機能付き）
      let response;
      let retryCount = 0;
      const maxRetries = options.retryAttempts || 3;

      while (retryCount <= maxRetries) {
        try {
          response = await this.openaiClient.chat.completions.create(requestParams);
          break;
        } catch (apiError) {
          retryCount++;
          console.error(`❌ API call failed (attempt ${retryCount}/${maxRetries + 1}):`, apiError);

          if (retryCount > maxRetries) {
            throw new Error(`API呼び出しが${maxRetries}回失敗しました: ${apiError.message}`);
          }

          // リトライ前の待機
          const retryDelay = config.retryDelay || 1000;
          await new Promise(resolve => setTimeout(resolve, retryDelay * retryCount));
        }
      }

      const result = await this.handleNonStreamingResponse(response, requestParams, options);

      // 設定情報を結果に追加
      result.configInfo = {
        provider: config.provider,
        model: options.model,
        configSource: this.userConfig?._meta?.hasUserOverrides ? 'user' : 'system',
        retryCount: retryCount,
        safetyEnabled: options.safetyEnabled
      };

      return result;

    } catch (error) {
      console.error('❌ 非ストリーミング処理エラー:', error);
      return {
        type: 'error',
        content: `処理エラー (${this.currentConfig.provider}): ${error.message}`,
        configInfo: {
          provider: this.currentConfig.provider,
          model: options.model,
          configSource: this.userConfig?._meta?.hasUserOverrides ? 'user' : 'system'
        }
      };
    }
  }

  /**
   * 統計情報取得（強化版）
   */
  getStatistics() {
    const config = this.currentConfig;
    return {
      initialized: this.isInitialized,
      provider: config.provider,
      model: config.model,
      requestCount: this.requestCount,
      totalTokens: this.totalTokens,
      errorCount: this.errorCount,
      lastError: this.lastError,
      averageTokensPerRequest: this.requestCount > 0 ? Math.round(this.totalTokens / this.requestCount) : 0,

      // パフォーマンス指標
      performance: {
        ...this.performanceMetrics,
        successRate: this.requestCount > 0
          ? Math.round((this.performanceMetrics.successfulRequests / this.requestCount) * 100)
          : 0
      },

      config: {
        streaming: config.streaming,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeout: config.timeout,
        systemPrompt: !!config.systemPrompt,
        responseFormat: config.responseFormat,
        safetyEnabled: config.safetyEnabled,
        customHeaders: Object.keys(config.customHeaders).length,
        configSource: this.userConfig?._meta?.hasUserOverrides ? 'user' : 'system'
      },

      userConfig: this.userConfig?._meta?.hasUserOverrides ? 'enabled' : 'disabled',

      // 設定履歴
      configHistory: this.configHistory.slice(-10), // 最新10件

      capabilities: {
        supportsStreaming: true,
        supportsTools: true,
        supportsCustomPrompts: true,
        supportsRetry: true,
        supportsCustomHeaders: true
      }
    };
  }

  /**
   * 健全性チェック（強化版）
   */
  async healthCheck() {
    if (!this.isInitialized) {
      return {
        status: 'unhealthy',
        message: 'AIクライアントが初期化されていません',
        config: {
          provider: this.currentConfig.provider,
          model: this.currentConfig.model,
          hasApiKey: !!this.currentConfig.openaiApiKey,
          hasEndpoint: !!this.currentConfig.azureEndpoint
        },
        configSource: this.userConfig?._meta?.hasUserOverrides ? 'user' : 'system'
      };
    }

    try {
      // 簡単なテストリクエスト
      const testResponse = await this.openaiClient.chat.completions.create({
        model: this.currentConfig.model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5,
        temperature: 0
      });

      if (testResponse.choices && testResponse.choices.length > 0) {
        return {
          status: 'healthy',
          message: 'AIクライアントは正常に動作しています',
          provider: this.currentConfig.provider,
          model: this.currentConfig.model,
          configSource: this.userConfig?._meta?.hasUserOverrides ? 'user' : 'system',
          testResponse: {
            content: testResponse.choices[0].message?.content,
            usage: testResponse.usage
          },
          lastSuccessfulRequest: new Date().toISOString()
        };
      } else {
        return {
          status: 'unhealthy',
          message: '有効なレスポンスが得られませんでした',
          config: this.currentConfig
        };
      }

    } catch (error) {
      return {
        status: 'unhealthy',
        message: `AIクライアントテスト失敗: ${error.message}`,
        config: this.currentConfig,
        configSource: this.userConfig?._meta?.hasUserOverrides ? 'user' : 'system',
        error: {
          name: error.name,
          message: error.message,
          stack: CONFIG.DEBUG.ENABLED ? error.stack : undefined
        }
      };
    }
  }

  /**
   * 設定の更新（従来の機能との互換性維持、強化版）
   */
  updateConfig(newConfig) {
    const oldConfig = { ...this.currentConfig };

    // 従来の更新方法をサポート
    if (newConfig.provider) this.currentConfig.provider = newConfig.provider;
    if (newConfig.model) this.currentConfig.model = newConfig.model;
    if (newConfig.streaming !== undefined) this.currentConfig.streaming = newConfig.streaming;
    if (newConfig.temperature !== undefined) this.currentConfig.temperature = newConfig.temperature;
    if (newConfig.maxTokens !== undefined) this.currentConfig.maxTokens = newConfig.maxTokens;
    if (newConfig.timeout !== undefined) this.currentConfig.timeout = newConfig.timeout;

    // 強化版の新しい設定項目
    if (newConfig.systemPrompt !== undefined) this.currentConfig.systemPrompt = newConfig.systemPrompt;
    if (newConfig.responseFormat) this.currentConfig.responseFormat = newConfig.responseFormat;
    if (newConfig.safetyEnabled !== undefined) this.currentConfig.safetyEnabled = newConfig.safetyEnabled;
    if (newConfig.customHeaders) this.currentConfig.customHeaders = { ...newConfig.customHeaders };

    // 設定履歴を記録
    this.configHistory.push({
      timestamp: new Date().toISOString(),
      action: 'update_config',
      changes: this.calculateConfigDiff(oldConfig, this.currentConfig)
    });

    // プロバイダーが変更された場合はクライアントを再初期化
    if (newConfig.provider && newConfig.provider !== oldConfig.provider) {
      console.log(`🔄 AIプロバイダーが変更されました: ${oldConfig.provider} → ${newConfig.provider}`);
      this.initializeClient();
    }

    return {
      status: 'success',
      message: 'AI設定を更新しました',
      oldConfig,
      newConfig: this.currentConfig,
      requiresReinitialization: newConfig.provider && newConfig.provider !== oldConfig.provider
    };
  }

  /**
   * 設定差分の計算（新機能）
   */
  calculateConfigDiff(oldConfig, newConfig) {
    const changes = {};

    for (const key of Object.keys(newConfig)) {
      if (oldConfig[key] !== newConfig[key]) {
        changes[key] = {
          old: oldConfig[key],
          new: newConfig[key]
        };
      }
    }

    return changes;
  }

  /**
   * 非ストリーミングレスポンスの処理（従来の実装を維持）
   */
  async handleNonStreamingResponse(response, requestParams, options) {
    const message = response.choices[0].message;

    let result = {
      type: 'response',
      content: message.content || '',
      tool_calls: []
    };

    // ツール呼び出しの処理
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolResults = await this.executeToolCalls(message.tool_calls, options);

      // ツール結果をまとめる
      for (const toolResult of toolResults) {
        if (toolResult.type === 'tool_call_result') {
          result.tool_calls.push({
            name: toolResult.tool_name,
            arguments: toolResult.tool_args,
            result: toolResult.result
          });
        } else if (toolResult.type === 'tool_call_error') {
          result.tool_calls.push({
            name: toolResult.tool_name,
            arguments: toolResult.tool_args,
            error: toolResult.error
          });
        }
      }

      // フォローアップリクエストの処理
      if (result.tool_calls.some(call => call.result)) {
        const followUpContent = await this.getFollowUpResponse(message.tool_calls, toolResults, requestParams);
        if (followUpContent) {
          result.content = followUpContent;
        }
      }
    }

    // トークン使用量の記録
    if (response.usage) {
      this.totalTokens += response.usage.total_tokens;
      result.usage = response.usage;
    }

    return result;
  }

  /**
   * ツール呼び出しデルタの処理（従来と同じ）
   */
  processToolCallsDelta(toolCallsDeltas, existingToolCalls) {
    for (const toolCallDelta of toolCallsDeltas) {
      const index = toolCallDelta.index;

      if (index !== undefined) {
        if (!existingToolCalls[index]) {
          existingToolCalls[index] = {
            id: toolCallDelta.id || '',
            type: 'function',
            function: { name: '', arguments: '' }
          };
        }

        const currentToolCall = existingToolCalls[index];

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

    return existingToolCalls;
  }

  /**
   * ツール呼び出しの実行（従来と同じ）
   */
  async executeToolCalls(toolCalls, options) {
    const results = [];

    for (let i = 0; i < toolCalls.length; i++) {
      const toolCall = toolCalls[i];

      if (!toolCall.function?.name) continue;

      try {
        // ツール呼び出し開始の通知（IDとインデックスを含む）
        results.push({
          type: 'tool_call_start',
          tool_name: toolCall.function.name,
          tool_args: toolCall.function.arguments,
          tool_call_id: toolCall.id,  // 🔧 追加: IDを保持
          tool_call_index: i          // 🔧 追加: インデックスを保持
        });

        // 引数のパース
        let args = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch (parseError) {
          throw new Error(`引数のJSONパースエラー: ${parseError.message}`);
        }

        // ツール実行
        const result = await this.toolManager.executeToolHandler(
          toolCall.function.name,
          args,
          options.authContext
        );

        const resultText = result.content?.map(c => c.text).join('\n') || 'ツール実行完了';

        // ツール呼び出し成功の通知（IDとインデックスを含む）
        results.push({
          type: 'tool_call_result',
          tool_name: toolCall.function.name,
          tool_args: toolCall.function.arguments,
          tool_call_id: toolCall.id,  // 🔧 追加: IDを保持
          tool_call_index: i,         // 🔧 追加: インデックスを保持
          result: resultText
        });

      } catch (error) {
        console.error(`ツール実行エラー ${toolCall.function.name}:`, error);

        // ツール呼び出しエラーの通知（IDとインデックスを含む）
        results.push({
          type: 'tool_call_error',
          tool_name: toolCall.function.name,
          tool_args: toolCall.function.arguments,
          tool_call_id: toolCall.id,  // 🔧 追加: IDを保持
          tool_call_index: i,         // 🔧 追加: インデックスを保持
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * フォローアップレスポンスの処理（従来と同じ）
   */
  async *_handleFollowUpResponse(toolCalls, toolResults, options) {
    try {
      console.log('🔄 Follow-up response processing...');

      // ツール結果を含むメッセージの構築
      const followUpMessages = this.buildFollowUpMessages(toolCalls, toolResults, options);

      const requestParams = {
        model: options.model,
        messages: followUpMessages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: true
      };

      const followUpCompletion = await this.openaiClient.chat.completions.create(requestParams);

      let followUpChunkCount = 0;
      for await (const followUpChunk of followUpCompletion) {
        followUpChunkCount++;
        const followUpDelta = followUpChunk.choices?.[0]?.delta;
        if (followUpDelta?.content) {
          yield { type: 'text', content: followUpDelta.content };
        }

        // フォローアップの安全装置
        if (followUpChunkCount > 500) {
          console.warn('⚠️ Too many follow-up chunks, terminating');
          yield {
            type: 'error',
            content: 'フォローアップレスポンスが長すぎるため中断されました'
          };
          break;
        }
      }

      console.log(`✅ Follow-up completed with ${followUpChunkCount} chunks`);

    } catch (followUpError) {
      console.error('❌ フォローアップリクエストエラー:', followUpError);
      yield {
        type: 'text',
        content: `\n\n[ツール実行は完了しましたが、最終応答の生成でエラーが発生しました: ${followUpError.message}]`
      };
    }
  }

  /**
   * フォローアップレスポンスの取得（非ストリーミング、従来と同じ）
   */
  async getFollowUpResponse(toolCalls, toolResults, originalRequestParams) {
    try {
      const followUpMessages = this.buildFollowUpMessages(toolCalls, toolResults, originalRequestParams);

      const followUpParams = {
        ...originalRequestParams,
        messages: followUpMessages,
        stream: false
      };

      const followUpResponse = await this.openaiClient.chat.completions.create(followUpParams);

      // トークン使用量の記録
      if (followUpResponse.usage) {
        this.totalTokens += followUpResponse.usage.total_tokens;
      }

      return followUpResponse.choices[0].message.content || '';

    } catch (error) {
      console.error('フォローアップレスポンス取得エラー:', error);
      return `\n\n[ツール実行は完了しましたが、最終応答の生成でエラーが発生しました: ${error.message}]`;
    }
  }

  /**
   * フォローアップメッセージの構築（従来と同じ）
   */
  buildFollowUpMessages(toolCalls, toolResults, options) {
    const originalMessages = this.prepareRequest('', options).messages;

    // アシスタントのメッセージ（ツール呼び出し）
    const assistantMessage = {
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
    };

    // ツール結果のメッセージ（修正版 - 正確なIDマッピング）
    const toolMessages = toolResults
      .filter(result => result.type === 'tool_call_result' || result.type === 'tool_call_error')
      .map(result => {
        // 🔧 修正: IDが直接含まれている場合はそれを使用
        let toolCallId = result.tool_call_id;

        // IDが含まれていない場合は、インデックスまたは名前でマッチング
        if (!toolCallId && result.tool_call_index !== undefined) {
          toolCallId = toolCalls[result.tool_call_index]?.id;
        }

        // それでも見つからない場合は、名前での検索（非推奨だが後方互換性のため）
        if (!toolCallId) {
          console.warn(`⚠️ tool_call_idが見つかりません: ${result.tool_name}, 名前での検索を試行`);
          toolCallId = toolCalls.find(tc => tc.function.name === result.tool_name)?.id || 'unknown';
        }

        return {
          role: 'tool',
          tool_call_id: toolCallId,
          content: result.result || result.error || 'No result'
        };
      });

    // 🔧 デバッグ: 重複チェック
    const toolCallIds = toolMessages.map(msg => msg.tool_call_id);
    const duplicateIds = toolCallIds.filter((id, index) => toolCallIds.indexOf(id) !== index);

    if (duplicateIds.length > 0) {
      console.error('❌ tool_call_id重複検出:', duplicateIds);
      console.error('toolMessages:', toolMessages);
      console.error('toolCalls:', toolCalls);
      console.error('toolResults:', toolResults);

      // 重複を解決するため、重複するIDに連番を付ける
      const idCounts = {};
      const resolvedToolMessages = toolMessages.map(msg => {
        if (!idCounts[msg.tool_call_id]) {
          idCounts[msg.tool_call_id] = 0;
        }

        if (idCounts[msg.tool_call_id] > 0) {
          // 重複の場合は新しいIDを生成
          const newId = `${msg.tool_call_id}_duplicate_${idCounts[msg.tool_call_id]}`;
          console.warn(`⚠️ tool_call_id重複解決: ${msg.tool_call_id} → ${newId}`);
          msg.tool_call_id = newId;
        }

        idCounts[msg.tool_call_id]++;
        return msg;
      });

      return [
        ...originalMessages,
        assistantMessage,
        ...resolvedToolMessages
      ];
    }

    return [
      ...originalMessages,
      assistantMessage,
      ...toolMessages
    ];
  }
}