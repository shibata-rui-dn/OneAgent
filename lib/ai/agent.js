/**
 * AIエージェント（ユーザー設定対応強化版 + 会話履歴対応 + ツールエラー回復機能）
 * OpenAI/Azure OpenAI/ローカルLLM対応 + ユーザー固有設定
 * 認証統合 + ツール管理システム連携 + 高度な設定機能 + 会話履歴処理 + エラー回復機能
 */

import OpenAI from 'openai';
import { CONFIG } from '../config/config.js';

/**
 * AIエージェントクラス（ユーザー設定対応強化版 + 会話履歴対応 + ツールエラー回復機能）
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
   * クエリ処理のメインエントリーポイント（強化版 + 会話履歴対応）
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
      retryAttempts: options.retryAttempts !== undefined ? options.retryAttempts : config.retryAttempts,

      // ✅ 会話履歴を追加
      conversationHistory: options.conversationHistory || []
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
      safetyEnabled: processOptions.safetyEnabled,
      conversationHistoryCount: processOptions.conversationHistory.length // ✅ 追加
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
      console.log('🔄 Creating streaming generator with conversation history');
      return this._createStreamingGenerator(query, processOptions);
    } else {
      // 非ストリーミング処理
      console.log('🔄 Processing non-streaming query with conversation history');
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
   * ストリーミング用のasync generatorを作成（強化版 + 会話履歴対応）
   */
  async *_createStreamingGenerator(query, options) {
    const startTime = Date.now();
    let success = false;

    try {
      const config = this.currentConfig;
      console.log(`📡 ストリーミング処理開始: ${options.model} (${config.provider}) - 会話履歴: ${options.conversationHistory.length}件`);
      console.log(`🔧 使用可能ツール: ${options.tools.length}個`);

      // 初期化完了を通知
      yield {
        type: 'init',
        content: `ストリーミング開始 (${config.provider}/${options.model}) - 会話履歴: ${options.conversationHistory.length}件`,
        userConfig: this.userConfig?._meta?.hasUserOverrides ? '個人設定' : 'システム設定',
        configInfo: {
          provider: config.provider,
          model: options.model,
          temperature: options.temperature,
          safetyEnabled: options.safetyEnabled,
          conversationHistoryCount: options.conversationHistory.length
        }
      };

      // メッセージとツール設定の準備（会話履歴対応）
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
        safetyEnabled: options.safetyEnabled,
        conversationHistoryCount: options.conversationHistory.length
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
      console.log('🏁 Streaming query completed successfully with conversation history');

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
   * ストリーミングレスポンスの処理（エラー回復対応強化版）
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

            // 🔧 改善: エラーと成功を分けて処理
            const successResults = toolResults.filter(r => r.type === 'tool_call_result');
            const errorResults = toolResults.filter(r => r.type === 'tool_call_error');

            // ツール結果をストリーミング出力
            for (const result of toolResults) {
              yield result;
            }

            yield {
              type: 'tool_calls_end',
              successCount: successResults.length,
              errorCount: errorResults.length,
              hasRecoverableErrors: errorResults.some(r => r.recovery_possible),
              errorSummary: errorResults.length > 0 ? {
                errors: errorResults.map(r => ({
                  tool: r.tool_name,
                  type: r.error_type,
                  recoverable: r.recovery_possible
                }))
              } : null
            };

            // 🔧 改善: エラーがあってもフォローアップレスポンスを処理
            // エラー情報もAIモデルに伝えて適切な対応を求める
            if (successResults.length > 0 || errorResults.length > 0) {
              console.log('🔄 Processing follow-up response with error recovery');
              yield* this._handleFollowUpResponse(toolCalls, toolResults, options);
            }
          } catch (toolError) {
            console.error('❌ Tool execution error:', toolError);
            yield {
              type: 'error',
              content: `ツール実行エラー: ${toolError.message}`,
              toolError: true,
              recovery_suggestion: 'システムエラーが発生しました。少し時間をおいて再試行するか、管理者に連絡してください。'
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
        chunkCount,
        recovery_suggestion: 'ストリーミング処理でエラーが発生しました。非ストリーミングモードを試すか、少し時間をおいて再試行してください。'
      };
    }
  }

  /**
   * システムプロンプトの生成（エラー回復機能追加版）
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

      if (options.authContext.userConfig?._meta?.hasUserOverrides) {
        systemPrompt += `\n設定: カスタム設定を使用中 (${config.provider}/${config.model})`;
      } else {
        systemPrompt += `\n設定: システムデフォルト (${config.provider}/${config.model})`;
      }
    }

    // 会話履歴の情報をシステムプロンプトに追加
    if (options.conversationHistory && options.conversationHistory.length > 0) {
      systemPrompt += `\n\n会話履歴: 過去の${options.conversationHistory.length}件のメッセージを含む継続的な会話です。文脈を考慮して回答してください。`;
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
    
    // 🔧 改善: エラー回復に関する指示を追加
    systemPrompt += `

## ツール実行とエラー処理について

ツールの実行中にエラーが発生した場合、以下の手順で対応してください：

1. **エラー分析**: エラーメッセージとerror_typeを確認する
2. **回復可能性判断**: recovery_possibleがtrueの場合は修正を試みる
3. **代替案検討**: alternative_toolsがある場合は代替手段を提案する
4. **ユーザー確認**: required_infoがある場合は追加情報を求める
5. **再試行または説明**: 適切な対応を実行する

エラーが発生しても諦めず、以下のアプローチを試してください：
- 引数の確認と修正（missing_required_argument、invalid_argumentの場合）
- 代替ツールの使用（alternative_toolsが提案されている場合）
- ユーザーへの追加情報の要求（required_infoがある場合）
- 処理の分割（timeout_errorの場合）
- 別のアプローチの提案

例えば：
- 「ファイルが見つかりません」→ パスを確認し、利用可能なファイル一覧を表示
- 「引数が不足しています」→ 必要な引数を説明し、ユーザーに入力を求める
- 「権限がありません」→ 代替の公開ツールを提案
- 「無効な形式です」→ 正しい形式を説明し、例を示す

常に建設的で解決志向の対応を心がけ、ユーザーが目的を達成できるよう支援してください。`;

    return systemPrompt;
  }

  /**
   * リクエストの準備（強化版 + 会話履歴対応）
   */
  prepareRequest(query, options) {
    // システムプロンプトの生成
    const systemPrompt = this.generateSystemPrompt(options);

    // ✅ 会話履歴を考慮したメッセージ構築
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // 会話履歴がある場合は追加（システムプロンプトの後に）
    if (options.conversationHistory && Array.isArray(options.conversationHistory)) {
      // 過去のメッセージを追加（systemプロンプト以外、最新のユーザーメッセージ以外）
      const historyMessages = options.conversationHistory
        .filter(msg => msg.role !== 'system') // システムメッセージは除外
        .filter((msg, index, arr) => {
          // 最後のメッセージが現在のクエリと同じ場合は除外（重複防止）
          if (index === arr.length - 1 && 
              msg.role === 'user' && 
              msg.content && msg.content.trim() === query.trim()) {
            console.log('🔍 重複メッセージを除外:', msg.content.substring(0, 50));
            return false;
          }
          return true;
        })
        .map(msg => ({
          role: msg.role,
          content: msg.content
          // timestampは除外（OpenAI APIに送信しない）
        }));
      
      messages.push(...historyMessages);
      
      console.log(`📚 会話履歴を含む: ${historyMessages.length}件のメッセージ`);
    }

    // 新しいユーザーメッセージを追加
    messages.push({ role: 'user', content: query });

    // 選択されたツールのOpenAI定義を取得
    const tools = this.toolManager.getSelectedOpenAITools(options.tools);

    console.log(`📤 OpenAI API送信メッセージ数: ${messages.length}件 (システム:1, 履歴:${messages.length - 2}, 新規:1)`);

    // ✅ デバッグ: メッセージ構造をログ出力
    if (CONFIG.DEBUG.ENABLED) {
      messages.forEach((msg, index) => {
        console.log(`📝 Message ${index}: ${msg.role} - ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
      });
    }

    return { messages, tools };
  }

  /**
   * 非ストリーミングクエリ処理（強化版 + 会話履歴対応）
   */
  async processNonStreamingQuery(query, options) {
    try {
      const config = this.currentConfig;
      console.log(`🤖 非ストリーミング処理開始: ${options.model} (${config.provider}) - 会話履歴: ${options.conversationHistory.length}件`);
      console.log(`🔧 使用可能ツール: ${options.tools.length}個`);

      // メッセージとツール設定の準備（会話履歴対応）
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
        safetyEnabled: options.safetyEnabled,
        conversationHistoryCount: options.conversationHistory.length // ✅ 追加
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
          configSource: this.userConfig?._meta?.hasUserOverrides ? 'user' : 'system',
          conversationHistoryCount: options.conversationHistory.length
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
        supportsCustomHeaders: true,
        supportsConversationHistory: true, // ✅ 追加
        supportsErrorRecovery: true // 🔧 追加
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
   * 非ストリーミングレスポンスの処理（エラー回復対応強化版）
   */
  async handleNonStreamingResponse(response, requestParams, options) {
    const message = response.choices[0].message;

    let result = {
      type: 'response',
      content: message.content || '',
      tool_calls: [],
      errors: [],
      recovery_info: {}
    };

    // ツール呼び出しの処理
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolResults = await this.executeToolCalls(message.tool_calls, options);

      const successResults = toolResults.filter(r => r.type === 'tool_call_result');
      const errorResults = toolResults.filter(r => r.type === 'tool_call_error');

      // 成功したツール結果をまとめる
      for (const toolResult of successResults) {
        result.tool_calls.push({
          name: toolResult.tool_name,
          arguments: toolResult.tool_args,
          result: toolResult.result,
          success: true
        });
      }

      // 🔧 改善: エラーが発生したツール結果も詳細情報付きで記録
      for (const toolResult of errorResults) {
        result.tool_calls.push({
          name: toolResult.tool_name,
          arguments: toolResult.tool_args,
          error: toolResult.error,
          error_type: toolResult.error_type,
          success: false,
          recovery_possible: toolResult.recovery_possible,
          suggestion: toolResult.suggestion,
          alternative_tools: toolResult.alternative_tools
        });

        result.errors.push({
          tool_name: toolResult.tool_name,
          error_type: toolResult.error_type,
          error_message: toolResult.error,
          recovery_possible: toolResult.recovery_possible,
          suggestion: toolResult.suggestion
        });
      }

      // 🔧 改善: エラー回復情報をまとめる
      if (errorResults.length > 0) {
        result.recovery_info = {
          hasErrors: true,
          totalErrors: errorResults.length,
          recoverableErrors: errorResults.filter(r => r.recovery_possible).length,
          generalSuggestions: [
            '引数の形式を確認してください',
            '必要な権限があることを確認してください',
            '代替手段を検討してください'
          ],
          alternativeApproaches: this.generateAlternativeApproaches(errorResults)
        };
      }

      // フォローアップリクエストの処理（エラー情報も含める）
      if (result.tool_calls.some(call => call.result || call.error)) {
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
   * 🆕 代替アプローチの生成
   */
  generateAlternativeApproaches(errorResults) {
    const approaches = [];
    
    for (const error of errorResults) {
      switch (error.error_type) {
        case 'missing_required_argument':
          approaches.push({
            approach: 'argument_completion',
            description: `${error.tool_name}の必須引数を確認し、不足している情報をユーザーに尋ねる`,
            next_steps: ['ツールの引数定義を表示', 'ユーザーに不足情報を質問']
          });
          break;
          
        case 'invalid_argument':
          approaches.push({
            approach: 'argument_correction',
            description: `${error.tool_name}の引数形式を修正して再試行`,
            next_steps: ['正しい引数形式を説明', '例を示して再入力を促す']
          });
          break;
          
        case 'permission_error':
          if (error.alternative_tools && error.alternative_tools.length > 0) {
            approaches.push({
              approach: 'alternative_tool',
              description: '認証不要の代替ツールを使用',
              next_steps: error.alternative_tools.map(tool => `${tool.name}を試す`)
            });
          }
          break;
          
        case 'resource_not_found':
          approaches.push({
            approach: 'resource_discovery',
            description: '利用可能なリソースを探索してから再試行',
            next_steps: ['リソース一覧を取得', '正しいパスやIDを確認']
          });
          break;
      }
    }
    
    return approaches;
  }

  /**
   * ツール呼び出しの実行（エラー回復機能強化版）
   */
  async executeToolCalls(toolCalls, options) {
    const results = [];

    for (let i = 0; i < toolCalls.length; i++) {
      const toolCall = toolCalls[i];

      if (!toolCall.function?.name) continue;

      try {
        // ツール呼び出し開始の通知
        results.push({
          type: 'tool_call_start',
          tool_name: toolCall.function.name,
          tool_args: toolCall.function.arguments,
          tool_call_id: toolCall.id,
          tool_call_index: i
        });

        // 引数のパース
        let args = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch (parseError) {
          // 🔧 改善: JSON パースエラーの場合、AIに詳細情報を提供
          results.push({
            type: 'tool_call_error',
            tool_name: toolCall.function.name,
            tool_args: toolCall.function.arguments,
            tool_call_id: toolCall.id,
            tool_call_index: i,
            error: `引数のJSONパースエラー: ${parseError.message}`,
            error_type: 'json_parse_error',
            raw_arguments: toolCall.function.arguments,
            suggestion: 'ツールの引数は有効なJSON形式である必要があります。引数の形式を確認して再試行してください。',
            recovery_possible: true
          });
          continue; // このツールはスキップして次へ
        }

        // ツール実行
        const result = await this.toolManager.executeToolHandler(
          toolCall.function.name,
          args,
          options.authContext
        );

        const resultText = result.content?.map(c => c.text).join('\n') || 'ツール実行完了';

        // ツール呼び出し成功の通知
        results.push({
          type: 'tool_call_result',
          tool_name: toolCall.function.name,
          tool_args: toolCall.function.arguments,
          tool_call_id: toolCall.id,
          tool_call_index: i,
          result: resultText
        });

      } catch (error) {
        console.error(`ツール実行エラー ${toolCall.function.name}:`, error);

        // 🔧 改善: エラーの種類を分析して適切な回復情報を提供
        const errorAnalysis = this.analyzeToolError(error, toolCall, options);

        results.push({
          type: 'tool_call_error',
          tool_name: toolCall.function.name,
          tool_args: toolCall.function.arguments,
          tool_call_id: toolCall.id,
          tool_call_index: i,
          error: error.message,
          error_type: errorAnalysis.type,
          suggestion: errorAnalysis.suggestion,
          recovery_possible: errorAnalysis.recoveryPossible,
          required_info: errorAnalysis.requiredInfo,
          alternative_tools: errorAnalysis.alternativeTools
        });
      }
    }

    return results;
  }

  /**
   * 🆕 ツールエラーの分析（新機能）
   */
  analyzeToolError(error, toolCall, options) {
    const errorMessage = error.message.toLowerCase();
    const toolName = toolCall.function.name;
    
    // エラーパターンの分析
    if (errorMessage.includes('required') || errorMessage.includes('必須')) {
      return {
        type: 'missing_required_argument',
        suggestion: `ツール「${toolName}」の実行に必要な引数が不足しています。ツールの定義を確認し、必要な引数をすべて提供してください。`,
        recoveryPossible: true,
        requiredInfo: ['必須引数の確認', 'ツール定義の参照'],
        alternativeTools: this.findAlternativeTools(toolName)
      };
    }
    
    if (errorMessage.includes('invalid') || errorMessage.includes('無効')) {
      return {
        type: 'invalid_argument',
        suggestion: `ツール「${toolName}」に無効な引数が渡されました。引数の型や形式を確認し、正しい値で再試行してください。`,
        recoveryPossible: true,
        requiredInfo: ['引数の型確認', '有効な値の範囲確認'],
        alternativeTools: this.findAlternativeTools(toolName)
      };
    }
    
    if (errorMessage.includes('permission') || errorMessage.includes('権限') || errorMessage.includes('認証')) {
      return {
        type: 'permission_error',
        suggestion: `ツール「${toolName}」の実行に必要な権限がありません。認証状態を確認するか、管理者に権限の付与を依頼してください。`,
        recoveryPossible: false,
        requiredInfo: ['認証状態の確認', '必要な権限の確認'],
        alternativeTools: this.findPublicAlternatives(toolName)
      };
    }
    
    if (errorMessage.includes('not found') || errorMessage.includes('見つかりません')) {
      return {
        type: 'resource_not_found',
        suggestion: `指定されたリソースが見つかりません。パスやIDを確認し、存在するリソースを指定してください。`,
        recoveryPossible: true,
        requiredInfo: ['リソースの存在確認', 'パスやIDの確認'],
        alternativeTools: this.findAlternativeTools(toolName)
      };
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('タイムアウト')) {
      return {
        type: 'timeout_error',
        suggestion: `ツール「${toolName}」の実行がタイムアウトしました。処理に時間のかかる操作の場合は、より小さな単位に分割して実行してください。`,
        recoveryPossible: true,
        requiredInfo: ['処理の分割検討', 'タイムアウト設定の確認'],
        alternativeTools: this.findAlternativeTools(toolName)
      };
    }
    
    // デフォルトのエラー分析
    return {
      type: 'unknown_error',
      suggestion: `ツール「${toolName}」の実行中に予期しないエラーが発生しました。引数を確認し、別のアプローチを試すか、ユーザーに詳細情報を確認してください。`,
      recoveryPossible: true,
      requiredInfo: ['エラーの詳細確認', '別のアプローチの検討'],
      alternativeTools: this.findAlternativeTools(toolName)
    };
  }

  /**
   * 🆕 代替ツールの検索
   */
  findAlternativeTools(toolName) {
    if (!this.toolManager || !this.toolManager.tools) {
      return [];
    }
    
    const alternatives = [];
    const currentTool = this.toolManager.tools.get(toolName);
    
    if (!currentTool) {
      return alternatives;
    }
    
    // 類似する機能を持つツールを検索
    for (const [name, tool] of this.toolManager.tools) {
      if (name === toolName) continue;
      
      // 説明文に共通のキーワードがあるかチェック
      const currentDesc = currentTool.description.toLowerCase();
      const toolDesc = tool.description.toLowerCase();
      
      const keywords = ['file', 'ファイル', 'read', '読み', 'write', '書き', 'list', '一覧', 'search', '検索'];
      
      for (const keyword of keywords) {
        if (currentDesc.includes(keyword) && toolDesc.includes(keyword)) {
          alternatives.push({
            name: tool.name,
            description: tool.description,
            reason: `共通機能: ${keyword}`
          });
          break;
        }
      }
    }
    
    return alternatives.slice(0, 3); // 最大3つまで
  }

  /**
   * 🆕 認証不要の代替ツールの検索
   */
  findPublicAlternatives(toolName) {
    if (!this.toolManager || !this.toolManager.tools) {
      return [];
    }
    
    const alternatives = [];
    
    for (const [name, tool] of this.toolManager.tools) {
      if (name === toolName) continue;
      
      // 認証が不要なツールのみ
      if (!tool.security?.requiresAuth) {
        alternatives.push({
          name: tool.name,
          description: tool.description,
          reason: '認証不要'
        });
      }
    }
    
    return alternatives.slice(0, 3);
  }

  /**
   * フォローアップメッセージの構築（エラー回復対応強化版）
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

    // ツール結果のメッセージ（エラー回復情報付き）
    const toolMessages = toolResults
      .filter(result => result.type === 'tool_call_result' || result.type === 'tool_call_error')
      .map(result => {
        let toolCallId = result.tool_call_id;

        if (!toolCallId && result.tool_call_index !== undefined) {
          toolCallId = toolCalls[result.tool_call_index]?.id;
        }

        if (!toolCallId) {
          toolCallId = toolCalls.find(tc => tc.function.name === result.tool_name)?.id || 'unknown';
        }

        let content;
        
        if (result.type === 'tool_call_result') {
          content = result.result || 'No result';
        } else {
          // 🔧 改善: エラー時に詳細な回復情報を含める
          content = JSON.stringify({
            error: result.error,
            error_type: result.error_type,
            suggestion: result.suggestion,
            recovery_possible: result.recovery_possible,
            required_info: result.required_info,
            alternative_tools: result.alternative_tools
          });
        }

        return {
          role: 'tool',
          tool_call_id: toolCallId,
          content: content
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
}