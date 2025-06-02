# OAuth認証付き直接ツール実行API 開発仕様書

## 概要

本仕様書は、OneAgentシステムにおいてOAuth認証を経た開発者が、AIエージェントを介さずにツールを直接実行できる機能の設計・実装について記述します。

## 1. 現在の制約と課題

### 1.1 現在の実行方法

| 方法 | 認証 | ツールアクセス | 制約 |
|------|------|-------------|------|
| AIエージェント経由 (`/agent`) | ✅ OAuth | ✅ 全ツール | AIの解釈・変換が入る |
| MCP経由 (`/mcp`) | ❌ なし | ❌ 公開ツールのみ | 認証が必要なツール実行不可 |

### 1.2 開発者のニーズ

- **直接制御**: AIの解釈を介さずツールを実行
- **認証機能**: セキュアなツール（ファイル管理等）へのアクセス
- **プログラマブル**: APIとして自動化・統合可能
- **パフォーマンス**: AIエージェントのオーバーヘッド排除

## 2. 新API設計

### 2.1 エンドポイント設計

```
POST /tools/execute
Authorization: Bearer <oauth_token>
Content-Type: application/json
```

### 2.2 リクエスト仕様

```json
{
  "tool": "secure_user_file_manager",
  "arguments": {
    "action": "create_file",
    "path": "test.txt",
    "content": "Hello World"
  },
  "options": {
    "timeout": 30000,
    "validateOnly": false
  }
}
```

### 2.3 レスポンス仕様

#### 成功時
```json
{
  "success": true,
  "tool": "secure_user_file_manager", 
  "executionId": "exec_123456789",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "✅ create_file 操作完了 (ユーザー: admin)\n\n📄 ファイルを作成しました: test.txt\n内容: 11文字 (11 B)"
      }
    ]
  },
  "metadata": {
    "executedAt": "2024-01-15T10:30:00.000Z",
    "executionTime": 150,
    "user": {
      "id": "admin",
      "username": "admin"
    },
    "toolInfo": {
      "version": "2.1.0",
      "requiresAuth": true
    }
  }
}
```

#### エラー時
```json
{
  "success": false,
  "error": {
    "code": "TOOL_EXECUTION_ERROR",
    "message": "ファイルが既に存在します",
    "details": {
      "tool": "secure_user_file_manager",
      "action": "create_file",
      "path": "test.txt"
    }
  },
  "executionId": "exec_123456790",
  "metadata": {
    "executedAt": "2024-01-15T10:31:00.000Z",
    "executionTime": 45,
    "user": {
      "id": "admin", 
      "username": "admin"
    }
  }
}
```

## 3. 実装仕様

### 3.1 ルーティング追加 (`lib/api/routes.js`)

```javascript
/**
 * 直接ツール実行エンドポイント
 */
function setupDirectToolExecution(app, toolManager, oauthSystem) {
  app.post('/tools/execute',
    oauthSystem.middleware.auth,
    oauthSystem.middleware.requireScope(['read', 'write']),
    async (req, res) => {
      try {
        const { tool, arguments: toolArgs, options = {} } = req.body;
        
        // バリデーション
        const validation = validateToolExecutionRequest(tool, toolArgs);
        if (!validation.valid) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: validation.message,
              details: validation.errors
            }
          });
        }

        // 実行ID生成
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 認証コンテキスト作成
        const authContext = {
          user: req.user,
          scopes: req.scopes,
          tokenInfo: req.tokenInfo,
          executionId: executionId
        };

        // ツール実行
        const startTime = Date.now();
        const result = await executeToolWithTimeout(
          toolManager,
          tool,
          toolArgs,
          authContext,
          options.timeout || 30000
        );
        const executionTime = Date.now() - startTime;

        // ログ記録
        logToolExecution(executionId, tool, toolArgs, true, executionTime, req.user);

        // 成功レスポンス
        res.json({
          success: true,
          tool: tool,
          executionId: executionId,
          result: result,
          metadata: {
            executedAt: new Date().toISOString(),
            executionTime: executionTime,
            user: {
              id: req.user.id,
              username: req.user.username
            },
            toolInfo: getToolInfo(toolManager, tool)
          }
        });

      } catch (error) {
        handleToolExecutionError(error, req, res);
      }
    }
  );
}
```

### 3.2 バリデーション関数

```javascript
function validateToolExecutionRequest(toolName, arguments) {
  const errors = [];
  
  // ツール名チェック
  if (!toolName || typeof toolName !== 'string') {
    errors.push('tool名は必須の文字列です');
  }
  
  // 引数チェック
  if (!arguments || typeof arguments !== 'object') {
    errors.push('argumentsは必須のオブジェクトです');
  }
  
  // ツール存在チェック
  if (toolName && !toolManager.tools.has(toolName)) {
    errors.push(`ツール「${toolName}」が見つかりません`);
  }
  
  return {
    valid: errors.length === 0,
    message: errors.length > 0 ? errors.join(', ') : null,
    errors: errors
  };
}
```

### 3.3 タイムアウト付き実行

```javascript
async function executeToolWithTimeout(toolManager, toolName, toolArgs, authContext, timeout) {
  return new Promise(async (resolve, reject) => {
    // タイムアウト設定
    const timeoutId = setTimeout(() => {
      reject(new Error(`ツール実行がタイムアウトしました (${timeout}ms)`));
    }, timeout);

    try {
      // ツール実行
      const result = await toolManager.executeToolHandler(toolName, toolArgs, authContext);
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}
```

### 3.4 エラーハンドリング

```javascript
function handleToolExecutionError(error, req, res) {
  const executionId = `exec_${Date.now()}_error`;
  
  // エラータイプの判定
  let errorCode = 'TOOL_EXECUTION_ERROR';
  let statusCode = 500;
  
  if (error.message.includes('認証が必要です')) {
    errorCode = 'AUTHENTICATION_REQUIRED';
    statusCode = 401;
  } else if (error.message.includes('権限がありません')) {
    errorCode = 'INSUFFICIENT_PERMISSIONS';
    statusCode = 403;
  } else if (error.message.includes('ツールが見つかりません')) {
    errorCode = 'TOOL_NOT_FOUND';
    statusCode = 404;
  } else if (error.message.includes('タイムアウト')) {
    errorCode = 'EXECUTION_TIMEOUT';
    statusCode = 408;
  }

  // ログ記録
  logToolExecution(executionId, req.body.tool, req.body.arguments, false, 0, req.user, error);

  // エラーレスポンス
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: error.message,
      details: {
        tool: req.body.tool,
        arguments: req.body.arguments
      }
    },
    executionId: executionId,
    metadata: {
      executedAt: new Date().toISOString(),
      user: {
        id: req.user?.id,
        username: req.user?.username
      }
    }
  });
}
```

## 4. セキュリティ仕様

### 4.1 認証・認可

- **OAuth 2.0必須**: 全ての直接ツール実行リクエストにBearerトークンが必要
- **スコープベース制御**: ツールが要求するスコープの検証
- **ユーザー固有実行**: ユーザーのコンテキストでツールを実行

### 4.2 レート制限

```javascript
// 直接ツール実行専用のレート制限
const DIRECT_TOOL_RATE_LIMIT = {
  windowMs: 60 * 1000, // 1分
  max: 30, // 1分間に30回まで
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'ツール実行のレート制限を超えました'
    }
  }
};
```

### 4.3 監査ログ

```javascript
function logToolExecution(executionId, tool, arguments, success, executionTime, user, error = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    executionId: executionId,
    type: 'DIRECT_TOOL_EXECUTION',
    user: {
      id: user.id,
      username: user.username,
      ip: user.ip || 'unknown'
    },
    tool: tool,
    arguments: arguments,
    success: success,
    executionTime: executionTime,
    error: error ? {
      message: error.message,
      stack: error.stack
    } : null
  };
  
  // セキュアログに記録
  console.log('AUDIT:', JSON.stringify(logEntry));
}
```

## 5. 使用例

### 5.1 JavaScriptクライアント

```javascript
class OneAgentDirectToolClient {
  constructor(baseUrl, accessToken) {
    this.baseUrl = baseUrl;
    this.accessToken = accessToken;
  }

  async executeTool(toolName, arguments, options = {}) {
    const response = await fetch(`${this.baseUrl}/tools/execute`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: toolName,
        arguments: arguments,
        options: options
      })
    });

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(`Tool execution failed: ${result.error.message}`);
    }
    
    return result;
  }

  // セキュアファイル管理の便利メソッド
  async createFile(path, content) {
    return this.executeTool('secure_user_file_manager', {
      action: 'create_file',
      path: path,
      content: content
    });
  }

  async readFile(path) {
    return this.executeTool('secure_user_file_manager', {
      action: 'read_file',
      path: path
    });
  }

  async listDirectory(path = '') {
    return this.executeTool('secure_user_file_manager', {
      action: 'list',
      path: path
    });
  }
}

// 使用例
const client = new OneAgentDirectToolClient('http://localhost:3000', 'your_oauth_token');

try {
  // ファイル作成
  const createResult = await client.createFile('hello.txt', 'Hello, Direct Tool Execution!');
  console.log('ファイル作成成功:', createResult.result.content[0].text);

  // ファイル読み取り  
  const readResult = await client.readFile('hello.txt');
  console.log('ファイル内容:', readResult.result.content[0].text);

  // ディレクトリ一覧
  const listResult = await client.listDirectory();
  console.log('ディレクトリ一覧:', listResult.result.content[0].text);

} catch (error) {
  console.error('ツール実行エラー:', error.message);
}
```

### 5.2 curlコマンド例

```bash
# OAuth認証後のトークン取得（省略）
TOKEN="your_oauth_access_token"

# ファイル作成
curl -X POST http://localhost:3000/tools/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "secure_user_file_manager",
    "arguments": {
      "action": "create_file", 
      "path": "api_test.txt",
      "content": "Direct API execution test"
    }
  }'

# ディレクトリ一覧
curl -X POST http://localhost:3000/tools/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "secure_user_file_manager",
    "arguments": {
      "action": "list",
      "path": ""
    }
  }'

# ファイル読み取り
curl -X POST http://localhost:3000/tools/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "secure_user_file_manager", 
    "arguments": {
      "action": "read_file",
      "path": "api_test.txt"
    }
  }'
```

## 6. エラーコード一覧

| コード | HTTPステータス | 説明 |
|--------|---------------|------|
| `INVALID_REQUEST` | 400 | リクエスト形式エラー |
| `AUTHENTICATION_REQUIRED` | 401 | 認証が必要 |
| `INVALID_TOKEN` | 401 | 無効なトークン |
| `INSUFFICIENT_PERMISSIONS` | 403 | 権限不足 |
| `INSUFFICIENT_SCOPE` | 403 | スコープ不足 |
| `TOOL_NOT_FOUND` | 404 | ツールが見つからない |
| `EXECUTION_TIMEOUT` | 408 | 実行タイムアウト |
| `RATE_LIMIT_EXCEEDED` | 429 | レート制限超過 |
| `TOOL_EXECUTION_ERROR` | 500 | ツール実行エラー |
| `INTERNAL_SERVER_ERROR` | 500 | サーバー内部エラー |

## 7. テスト仕様

### 7.1 単体テスト

```javascript
// tests/direct-tool-execution.test.js
describe('Direct Tool Execution API', () => {
  let accessToken;
  
  beforeAll(async () => {
    // OAuth認証を取得
    accessToken = await getTestAccessToken();
  });

  test('認証付きツール実行 - 成功', async () => {
    const response = await request(app)
      .post('/tools/execute')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        tool: 'secure_user_file_manager',
        arguments: {
          action: 'get_quota'
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.tool).toBe('secure_user_file_manager');
    expect(response.body.result).toBeDefined();
  });

  test('認証なし - エラー', async () => {
    const response = await request(app)
      .post('/tools/execute')
      .send({
        tool: 'secure_user_file_manager',
        arguments: { action: 'list' }
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test('存在しないツール - エラー', async () => {
    const response = await request(app)
      .post('/tools/execute')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        tool: 'nonexistent_tool',
        arguments: {}
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('TOOL_NOT_FOUND');
  });
});
```

### 7.2 統合テスト

```javascript
// tests/integration/direct-tool-flow.test.js
describe('Direct Tool Execution Integration', () => {
  test('ファイル操作フロー', async () => {
    const client = new OneAgentDirectToolClient(baseUrl, accessToken);
    
    // 1. ファイル作成
    const createResult = await client.createFile('test_integration.txt', 'test content');
    expect(createResult.success).toBe(true);
    
    // 2. ファイル読み取り
    const readResult = await client.readFile('test_integration.txt');
    expect(readResult.result.content[0].text).toContain('test content');
    
    // 3. ファイル削除
    const deleteResult = await client.executeToolTool('secure_user_file_manager', {
      action: 'delete',
      path: 'test_integration.txt'
    });
    expect(deleteResult.success).toBe(true);
  });
});
```



---

この仕様書に基づいて実装することで、開発者はOAuth認証を経てAIエージェントを介さずにツールを直接実行できるようになります。