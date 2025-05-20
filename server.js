// server.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { Calculator } from "@langchain/community/tools/calculator";
import { pull } from "langchain/hub";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4889;
const CONFIG_PATH = path.join(__dirname, 'config.json');

async function main() {
  // ───────────────────────────────────────────────────────────────────────────────
  // ① 起動時に config.json がなければ自動生成
  // ───────────────────────────────────────────────────────────────────────────────
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultConfig = {
      end_point: "https://api.openai.com/v1",
      api_key: "",
      model_name: "gpt-4.1"
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf8');
    console.log('Created default config.json');
  }

  // 設定読み込み
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.error('Failed to read config.json:', err);
    process.exit(1);
  }

  // プロンプト定義の読み込み
  const t_prompt = await pull("hwchase17/openai-functions-agent");
  if (!t_prompt) {
    console.error("Failed to retrieve the prompt.");
    process.exit(1);
  }

  const app = express();
  app.use(express.json());

  // ───────────────────────────────────────────────────────────────────────────────
  // ② /update/config エンドポイントで設定を更新
  // ───────────────────────────────────────────────────────────────────────────────
  app.post('/update/config', (req, res) => {
    const schema = z.object({
      end_point: z.string().url(),
      api_key: z.string().min(1),
      model_name: z.string().min(1),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.format() });
    }

    const newConfig = result.data;
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf8');
      console.log('config.json updated:', newConfig);
      return res.json({ message: 'Configuration updated successfully', config: newConfig });
    } catch (err) {
      console.error('Failed to write config.json:', err);
      return res.status(500).json({ error: 'Failed to write config file' });
    }
  });

  /**
   * /api/agent/stream
   * LangChain Agent を使った汎用クエリ実行（SSEストリーミング）
   */
  app.get("/api/agent/stream", async (req, res) => {
    // SSE ヘッダー設定
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const sendSSE = (event, data) => {
      if (event) res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // クエリ／履歴／コンポーネント情報の取得
    let userQuery, history = [], components = [];
    if (req.query.payload) {
      try {
        const parsed = JSON.parse(req.query.payload);
        userQuery = parsed.query;
        history = parsed.history || [];
        components = parsed.components || [];
      } catch {
        return res.status(400).json({ error: "Invalid payload JSON" });
      }
    } else {
      userQuery = req.query.query;
    }
    if (!userQuery) {
      return res.status(400).json({ error: "query is required" });
    }

    try {
      // thinking 開始通知
      sendSSE(null, { type: "thinking" });

      // コンポーネント情報・履歴をテキスト化
      const compInfo = components.map(c => `- ${c.componentName}: ${c.description}`).join("\n");
      const convHistory = history.map(msg => {
        const role = msg.type === "user" ? "User" : "Assistant";
        return `${role}: ${msg.content}`;
      }).join("\n");

      const fullPrompt = `
Current components:
${compInfo}

Conversation history:
${convHistory}

New user query:
${userQuery}
      `.trim();

      // LLM & ツールの初期化（config.json の内容を利用）
      const llm = new ChatOpenAI({
        openAIApiKey: config.api_key,
        modelName: config.model_name,
        basePath: config.end_point,
        temperature: 0.6,
        streaming: true,
        streamingFunctions: true,
      });
      const tools = [new Calculator()];

      const sseHandler = BaseCallbackHandler.fromMethods({
        handleAgentAction(action) {
          sendSSE("tool", { name: action.tool, params: action.toolInput });
        }
      });

      const agent = await createOpenAIFunctionsAgent({ llm, tools, prompt: t_prompt });
      const executor = AgentExecutor.fromAgentAndTools({ agent, tools, verbose: false });

      // 実行
      const result = await executor.invoke(
        { input: fullPrompt },
        { callbacks: [sseHandler] }
      );

      // 最終結果と完了通知
      sendSSE(null, { type: "content", content: result.output, partial: false });
      sendSSE(null, { type: "done" });
      res.end();

    } catch (err) {
      console.error("[ERROR] /api/agent/stream", err);
      sendSSE("error", { type: "error", error: "Agent execution error" });
      res.end();
    }
  });

  // 静的ファイルの提供
  app.use(express.static(path.join(__dirname, 'build')));

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

main();
