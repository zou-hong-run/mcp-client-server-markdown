import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import dotenv from "dotenv";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { createHash, createHmac } from "crypto";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  ListPromptsResultSchema,
  GetPromptResultSchema,
  Resource,
  Prompt,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import chalk from "chalk";
import fs from "fs";
// dotenv.config();
// console.log(process.env.SPARK_APP_ID);
// console.log(process.env.SPARK_APP_ID);
// 确定当前环境
const env = process.env.NODE_ENV || "development";

// 检查对应环境文件是否存在
const envPath = `.env.${env}`;
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config(); // 回退到默认 .env 文件
}
interface SparkMessage {
  content: string;
  role: "user" | "assistant" | "system";
  content_type?: "text" | string;
  function_call?: { arguments: string; name: string };
  index?: number;
}

interface SparkResponse {
  header: {
    code: number;
    message: string;
    sid: string;
    status: number;
  };
  payload: {
    choices: {
      status: number;
      seq: number;
      text: SparkMessage[];
    };
    usage?: any;
  };
}

class MCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private sparkHost = "wss://spark-api.xf-yun.com/v4.0/chat";
  private domin = "4.0Ultra";
  private availableTools: Tool[] = [];
  private availableResources: Resource[] = [];
  private availablePrompts: Prompt[] = [];
  private conversationHistory: Array<{ role: string; content: string }> = [];
  private sessionId: string = uuidv4();

  constructor() {}

  // 生成星火API的鉴权URL
  private getSparkAuthUrl(): string {
    const apiKey = process.env.SPARK_API_KEY!;
    const apiSecret = process.env.SPARK_API_SECRET!;
    const host = new URL(this.sparkHost).host;
    const date = new Date().toUTCString();
    const pathname = new URL(this.sparkHost).pathname;

    const signatureOrigin =
      `host: ${host}\n` + `date: ${date}\n` + `GET ${pathname} HTTP/1.1`;
    const signatureSha = createHmac("sha256", apiSecret)
      .update(signatureOrigin)
      .digest("base64");

    const authorizationOrigin =
      `api_key="${apiKey}", algorithm="hmac-sha256", ` +
      `headers="host date request-line", signature="${signatureSha}"`;

    const authorization = Buffer.from(authorizationOrigin).toString("base64");

    return (
      `${this.sparkHost}?` +
      `authorization=${authorization}&` +
      `date=${encodeURIComponent(date)}&` +
      `host=${encodeURIComponent(host)}`
    );
  }

  // 连接到星火WebSocket
  private async createSparkConnection(): Promise<WebSocket> {
    const url = this.getSparkAuthUrl();
    return new WebSocket(url);
  }

  // 发送消息到星火API
  private async sendSparkMessage(
    messages: SparkMessage[],
    tools: Tool[] = []
  ): Promise<string | { name: string; arguments: string }> {
    return new Promise(async (resolve, reject) => {
      const ws = await this.createSparkConnection();
      let fullResponse = "";

      ws.on("open", () => {
        const request: any = {
          header: {
            app_id: process.env.SPARK_APP_ID!,
            uid: uuidv4(),
          },
          parameter: {
            chat: {
              domain: this.domin,
              temperature: 0.5,
              max_tokens: 2048,
            },
          },
          payload: {
            message: {
              text: messages,
            },
            functions: {
              text: [],
            },
          },
        };

        if (tools.length > 0) {
          request.payload.functions["text"] = tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          }));
        }
        ws.send(JSON.stringify(request));
      });

      ws.on("message", (event: Buffer) => {
        const response: SparkResponse = JSON.parse(event.toString());
        if (response.header.code !== 0) {
          reject(new Error(`星火API错误: ${response.header.message}`));
          ws.close();
          return;
        }

        const texts = response.payload.choices.text;
        if (texts && texts.length > 0) {
          fullResponse += texts.map((t) => t.content).join("");
          process.stdout.write(texts.map((t) => t.content).join(""));
          // 处理换行
          console.log();
        }
        if (response.header.status === 2) {
          let function_call =
            response?.payload?.choices?.text[0]?.function_call;
          if (function_call) {
            let function_call_name = function_call.name;
            let function_call_params = JSON.parse(function_call.arguments);
            ws.close();
            resolve({
              name: function_call_name,
              arguments: function_call_params,
            });
          } else {
            ws.close();
            resolve(fullResponse);
          }
        }
      });

      ws.on("error", reject);
    });
  }

  // 连接到MCP服务器
  async connectToServer(serverScriptPath: string): Promise<void> {
    const isPython = serverScriptPath.endsWith(".py");
    const isJs = serverScriptPath.endsWith(".js");

    if (!isPython && !isJs) {
      throw new Error("服务器脚本必须是 .py 或 .js 文件");
    }

    const command = isPython ? "python" : "node";

    this.transport = new StdioClientTransport({
      command,
      args: [serverScriptPath],
    });

    this.client = new Client(
      {
        name: "mcp-client",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {},
        },
      }
    );

    await this.client.connect(this.transport);

    // 获取所有可用能力
    await this.fetchServerCapabilities();
  }

  // 获取服务器所有能力
  private async fetchServerCapabilities(): Promise<void> {
    if (!this.client) throw new Error("客户端未连接");

    // 获取工具列表
    const toolsResponse = await this.client.request(
      { method: "tools/list" },
      ListToolsResultSchema
    );
    this.availableTools = toolsResponse.tools;

    // 获取资源列表
    const resourcesResponse = await this.client.request(
      { method: "resources/list" },
      ListResourcesResultSchema
    );
    this.availableResources = resourcesResponse.resources;

    // 获取提示词列表
    const promptsResponse = await this.client.request(
      { method: "prompts/list" },
      ListPromptsResultSchema
    );
    this.availablePrompts = promptsResponse.prompts;

    console.log("\n已连接到服务器，可用能力：");
    console.log(
      chalk.blue("工具:"),
      this.availableTools.map((tool) => tool.name).join(", ")
    );
    console.log(
      chalk.blue("资源:"),
      this.availableResources.map((res) => res.name).join(", ")
    );
    console.log(
      chalk.blue("提示词:"),
      this.availablePrompts.map((prompt) => prompt.name).join(", ")
    );
  }

  // 调用工具
  private async callTool(name: string, args: any): Promise<any> {
    if (!this.client) throw new Error("客户端未连接");

    const result = await this.client.request(
      {
        method: "tools/call",
        params: {
          name,
          arguments: args,
        },
      },
      CallToolResultSchema
    );
    return result;
  }

  // 读取资源
  private async readResource(uri: string): Promise<any> {
    if (!this.client) throw new Error("客户端未连接");

    const result = await this.client.request(
      {
        method: "resources/read",
        params: { uri },
      },
      ReadResourceResultSchema
    );
    return result;
  }

  // 获取提示词
  private async getPrompt(name: string, args?: any): Promise<any> {
    if (!this.client) throw new Error("客户端未连接");

    const result = await this.client.request(
      {
        method: "prompts/get",
        params: {
          name,
          arguments: args,
        },
      },
      GetPromptResultSchema
    );
    return result;
  }

  // 显示历史记录
  private showHistory(): void {
    console.log(chalk.yellow("\n=== 会话历史记录 ==="));
    if (this.conversationHistory.length === 0) {
      console.log(chalk.gray("暂无历史记录"));
      return;
    }

    this.conversationHistory.forEach((item, index) => {
      const prefix =
        item.role === "user" ? chalk.green("你: ") : chalk.blue("AI: ");
      console.log(`${chalk.gray(`${index + 1}.`)} ${prefix}${item.content}`);
    });
    console.log(chalk.yellow("==================\n"));
  }

  // 处理查询的核心逻辑
  async processQuery(query: string): Promise<string> {
    if (!this.client) throw new Error("客户端未连接");

    // 添加到历史记录
    this.conversationHistory.push({ role: "user", content: query });

    const messages: SparkMessage[] = [
      {
        role: "system",
        content:
          "你是一个由red润创造的小可爱，你喜欢唱歌跳舞打篮球，还喜欢中分发型",
      },
      {
        role: "system",
        content: `当前可用的能力：
        工具: ${JSON.stringify(this.availableTools)}
        资源: ${JSON.stringify(this.availableResources)}
        提示词: ${JSON.stringify(this.availablePrompts)}`,
      },
      { role: "user", content: query },
    ];

    let resultArr = [];
    let fullResponse = await this.sendSparkMessage(
      messages,
      this.availableTools
    );

    // 处理工具调用
    if (typeof fullResponse !== "string") {
      // console.log(fullResponse, 'fullResponse');
      try {
        // 调用工具
        const toolResult = await this.callTool(
          fullResponse.name,
          fullResponse.arguments
        );
        resultArr.push(`工具调用结果: ${JSON.stringify(toolResult.content)}`);
        this.fetchServerCapabilities();

        // 将结果发送回星火API进行总结
        messages.push({
          role: "assistant",
          content: `已为您完成以下操作: ${resultArr.join("\n")}`,
        });
        fullResponse = (await this.sendSparkMessage(
          messages,
          this.availableTools
        )) as string;
        resultArr.push(fullResponse);
      } catch (e) {
        console.error("操作执行失败:", e);
        resultArr.push(`操作执行失败: ${(e as any).message}`);
      }
    } else {
      // resultArr.push(fullResponse);
    }

    // 添加到历史记录
    const responseText = resultArr.join("\n");
    this.conversationHistory.push({ role: "assistant", content: responseText });

    return responseText;
  }

  // 聊天循环
  async chatLoop(): Promise<void> {
    console.log(chalk.yellow("\n=== MCP 客户端已启动 ==="));
    console.log(chalk.green(`会话ID: ${this.sessionId}`));
    console.log(chalk.green("输入你的查询或输入以下命令:"));
    console.log(chalk.green("  'history' - 查看历史记录"));
    console.log(chalk.green("  'clear' - 清空当前会话历史"));
    console.log(chalk.green("  'quit' - 退出程序"));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.blue("\n> "),
    });

    const askQuestion = () => {
      rl.prompt();
      rl.on("line", async (line: string) => {
        try {
          const input = line.trim();

          if (input.toLowerCase() === "quit") {
            await this.cleanup();
            rl.close();
            return;
          }

          if (input.toLowerCase() === "history") {
            this.showHistory();
            rl.prompt();
            return;
          }

          if (input.toLowerCase() === "clear") {
            this.conversationHistory = [];
            console.log(chalk.green("当前会话历史已清空"));
            rl.prompt();
            return;
          }

          if (input) {
            const response = await this.processQuery(input);
            console.log(chalk.blue("\nAI:"), response);
          }

          rl.prompt();
        } catch (error) {
          console.error(chalk.red("\n错误："), error);
          rl.prompt();
        }
      }).on("close", () => {
        console.log(chalk.yellow("\n再见！"));
        process.exit(0);
      });
    };

    askQuestion();
  }

  async cleanup(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
    }
  }
}

// 主执行逻辑
async function main() {
  if (process.argv.length < 3) {
    console.log(chalk.red("用法：ts-node client.ts <服务器脚本路径>"));
    process.exit(1);
  }

  const client = new MCPClient();
  try {
    await client.connectToServer(process.argv[2]);
    await client.chatLoop();
  } catch (error) {
    console.error(chalk.red("错误："), error);
    await client.cleanup();
    process.exit(1);
  }
}

const importMetaPath = fileURLToPath(import.meta.url);
const argvPath = path.resolve(process.argv[1]);
if (importMetaPath === argvPath) {
  main();
}

export default MCPClient;
