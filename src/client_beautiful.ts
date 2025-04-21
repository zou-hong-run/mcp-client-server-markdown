// import { Client } from '@modelcontextprotocol/sdk/client/index.js';
// import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
// import dotenv from 'dotenv';
// import WebSocket from 'ws';
// import { v4 as uuidv4 } from 'uuid';
// import { createHash, createHmac } from 'crypto';
// import {
//   CallToolResultSchema,
//   ListToolsResultSchema,
//   ListResourcesResultSchema,
//   ReadResourceResultSchema,
//   ListPromptsResultSchema,
//   GetPromptResultSchema,
//   Resource,
//   Prompt,
//   Tool
// } from '@modelcontextprotocol/sdk/types.js';
// import * as readline from 'node:readline';
// import { fileURLToPath } from 'node:url';
// import path from 'node:path';

// interface SparkMessage {
//   content: string;
//   role: 'user' | 'assistant' | 'system' | string;
//   content_type?: 'text' | string;
//   function_call?: { arguments: string; name: string };
//   index?: number;
// }

// interface SparkResponse {
//   header: {
//     code: number;
//     message: string;
//     sid: string;
//     status: number;
//   };
//   payload: {
//     choices: {
//       status: number;
//       seq: number;
//       text: SparkMessage[];
//     };
//     usage?: any;
//   };
// }

// dotenv.config();

// class MCPClient {
//   private client: Client | null = null;
//   private transport: StdioClientTransport | null = null;
//   private sparkHost = 'wss://spark-api.xf-yun.com/v4.0/chat';
//   private domin = '4.0Ultra';
//   private availableTools: Tool[] = [];
//   private availableResources: Resource[] = [];
//   private availablePrompts: Prompt[] = [];
//   private conversationHistory: SparkMessage[] = [];
//   private currentSessionId: string = uuidv4();

//   constructor() {}

//   // 生成星火API的鉴权URL
//   private getSparkAuthUrl(): string {
//     const apiKey = process.env.SPARK_API_KEY!;
//     const apiSecret = process.env.SPARK_API_SECRET!;
//     const host = new URL(this.sparkHost).host;
//     const date = new Date().toUTCString();
//     const pathname = new URL(this.sparkHost).pathname;

//     const signatureOrigin = `host: ${host}\n` + `date: ${date}\n` + `GET ${pathname} HTTP/1.1`;
//     const signatureSha = createHmac('sha256', apiSecret).update(signatureOrigin).digest('base64');

//     const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", ` + `headers="host date request-line", signature="${signatureSha}"`;

//     const authorization = Buffer.from(authorizationOrigin).toString('base64');

//     return `${this.sparkHost}?` + `authorization=${authorization}&` + `date=${encodeURIComponent(date)}&` + `host=${encodeURIComponent(host)}`;
//   }

//   // 连接到星火WebSocket
//   private async createSparkConnection(): Promise<WebSocket> {
//     const url = this.getSparkAuthUrl();
//     return new WebSocket(url);
//   }

//   // 改进的打印方法
//   private printResponse(text: string, isUser: boolean = false) {
//     const prefix = isUser ? '👤 你: ' : '🤖 助手: ';
//     const color = isUser ? '\x1b[34m' : '\x1b[32m';
//     console.log(color + prefix + '\x1b[0m' + text);
//   }

//   // 改进的错误打印方法
//   private printError(error: string) {
//     console.error('\x1b[31m⚠️ 错误: \x1b[0m' + error);
//   }

//   // 改进的工具调用结果展示
//   private printToolResult(toolName: string, result: any) {
//     console.log('\x1b[33m🛠️ 工具调用: \x1b[0m' + toolName);
//     console.log('\x1b[33m📋 结果: \x1b[0m' + JSON.stringify(result, null, 2));
//   }

//   // 重置会话
//   private resetConversation() {
//     this.currentSessionId = uuidv4();
//     this.conversationHistory = [
//       {
//         role: 'system',
//         content:
//           '你是一个由red润创造的小可爱，你喜欢唱歌跳舞打篮球，还喜欢中分发型。' +
//           '你会根据用户需求智能选择使用工具、资源或提示词来完成任务。' +
//           '当使用工具时，你会清楚地解释你正在做什么。'
//       }
//     ];
//     console.log('\x1b[36m🔄 已开始新会话，会话ID: ' + this.currentSessionId + '\x1b[0m');
//   }

//   // 改进的星火API消息发送
//   private async sendSparkMessage(messages: SparkMessage[], tools: Tool[] = []): Promise<string | { name: string; arguments: string }> {
//     return new Promise(async (resolve, reject) => {
//       try {
//         const ws = await this.createSparkConnection();
//         let fullResponse = '';
//         let functionCall: { name: string; arguments: string } | null = null;

//         ws.on('open', () => {
//           const request: any = {
//             header: {
//               app_id: process.env.SPARK_APP_ID!,
//               uid: this.currentSessionId
//             },
//             parameter: {
//               chat: {
//                 domain: this.domin,
//                 temperature: 0.5,
//                 max_tokens: 2048
//               }
//             },
//             payload: {
//               message: {
//                 text: messages
//               },
//               functions: {
//                 text: []
//               }
//             }
//           };

//           if (tools.length > 0) {
//             request.payload.functions['text'] = tools.map(tool => ({
//               name: tool.name,
//               description: tool.description,
//               parameters: tool.input_schema
//             }));
//           }
//           ws.send(JSON.stringify(request));
//         });

//         ws.on('message', (event: Buffer) => {
//           const response: SparkResponse = JSON.parse(event.toString());
//           if (response.header.code !== 0) {
//             reject(new Error(`星火API错误: ${response.header.message}`));
//             ws.close();
//             return;
//           }

//           const texts = response.payload.choices.text;
//           if (texts && texts.length > 0) {
//             // 实时显示流式响应
//             texts.forEach(text => {
//               if (text.content) {
//                 process.stdout.write('\x1b[32m' + text.content + '\x1b[0m');
//                 fullResponse += text.content;
//               }
//             });
//           }

//           if (response.header.status === 2) {
//             process.stdout.write('\n');
//             const currentText = response?.payload?.choices?.text[0];
//             if (currentText?.function_call) {
//               functionCall = {
//                 name: currentText.function_call.name,
//                 arguments: currentText.function_call.arguments
//               };
//             }
//             ws.close();
//             resolve(functionCall || fullResponse);
//           }
//         });

//         ws.on('error', err => {
//           this.printError(`WebSocket错误: ${err.message}`);
//           reject(err);
//         });

//         ws.on('close', () => {
//           if (!functionCall && !fullResponse) {
//             reject(new Error('连接意外关闭'));
//           }
//         });
//       } catch (err) {
//         reject(err);
//       }
//     });
//   }

//   // 连接到MCP服务器
//   async connectToServer(serverScriptPath: string): Promise<void> {
//     const isPython = serverScriptPath.endsWith('.py');
//     const isJs = serverScriptPath.endsWith('.js');

//     if (!isPython && !isJs) {
//       throw new Error('服务器脚本必须是 .py 或 .js 文件');
//     }

//     const command = isPython ? 'python' : 'node';

//     this.transport = new StdioClientTransport({
//       command,
//       args: [serverScriptPath]
//     });

//     this.client = new Client(
//       {
//         name: 'mcp-client',
//         version: '1.0.0'
//       },
//       {
//         capabilities: {
//           resources: {},
//           tools: {},
//           prompts: {}
//         }
//       }
//     );

//     await this.client.connect(this.transport);

//     // 获取所有可用能力
//     await this.fetchServerCapabilities();
//   }

//   // 获取服务器所有能力
//   private async fetchServerCapabilities(): Promise<void> {
//     if (!this.client) throw new Error('客户端未连接');

//     // 获取工具列表
//     const toolsResponse = await this.client.request({ method: 'tools/list' }, ListToolsResultSchema);
//     this.availableTools = toolsResponse.tools;

//     // 获取资源列表
//     const resourcesResponse = await this.client.request({ method: 'resources/list' }, ListResourcesResultSchema);
//     this.availableResources = resourcesResponse.resources;

//     // 获取提示词列表
//     const promptsResponse = await this.client.request({ method: 'prompts/list' }, ListPromptsResultSchema);
//     this.availablePrompts = promptsResponse.prompts;

//     console.log('\n\x1b[36m已连接到服务器，可用能力：\x1b[0m');
//     console.log('\x1b[33m🛠️ 工具:\x1b[0m', this.availableTools.map(tool => tool.name).join(', '));
//     console.log('\x1b[33m📂 资源:\x1b[0m', this.availableResources.map(res => res.name).join(', '));
//     console.log('\x1b[33m📝 提示词:\x1b[0m', this.availablePrompts.map(prompt => prompt.name).join(', '));
//   }

//   // 调用工具
//   private async callTool(name: string, args: any): Promise<any> {
//     if (!this.client) throw new Error('客户端未连接');

//     const result = await this.client.request(
//       {
//         method: 'tools/call',
//         params: {
//           name,
//           arguments: args
//         }
//       },
//       CallToolResultSchema
//     );
//     return result;
//   }

//   // 读取资源
//   private async readResource(uri: string): Promise<any> {
//     if (!this.client) throw new Error('客户端未连接');

//     const result = await this.client.request(
//       {
//         method: 'resources/read',
//         params: { uri }
//       },
//       ReadResourceResultSchema
//     );
//     return result;
//   }

//   // 获取提示词
//   private async getPrompt(name: string, args?: any): Promise<any> {
//     if (!this.client) throw new Error('客户端未连接');

//     const result = await this.client.request(
//       {
//         method: 'prompts/get',
//         params: {
//           name,
//           arguments: args
//         }
//       },
//       GetPromptResultSchema
//     );
//     return result;
//   }

//   // 改进的查询处理
//   async processQuery(query: string): Promise<string> {
//     if (!this.client) throw new Error('客户端未连接');

//     // 添加到对话历史
//     this.conversationHistory.push({ role: 'user', content: query });
//     this.printResponse(query, true);

//     // 准备系统消息
//     const systemMessage = {
//       role: 'system',
//       content: `当前可用的能力：
//       工具: ${JSON.stringify(this.availableTools.map(t => t.name))}
//       资源: ${JSON.stringify(this.availableResources.map(r => r.name))}
//       提示词: ${JSON.stringify(this.availablePrompts.map(p => p.name))}`
//     };

//     const messages = [systemMessage, ...this.conversationHistory];

//     try {
//       let fullResponse = await this.sendSparkMessage(messages, this.availableTools);

//       // 处理工具调用
//       if (typeof fullResponse !== 'string') {
//         this.printResponse(`检测到需要调用工具: ${fullResponse.name}`, false);

//         try {
//           // 调用工具
//           const toolResult = await this.callTool(fullResponse.name, fullResponse.arguments);
//           this.printToolResult(fullResponse.name, toolResult.content);

//           // 将结果添加到对话历史
//           this.conversationHistory.push({
//             role: 'assistant',
//             content: `已调用工具 ${fullResponse.name} 并获取结果`
//           });

//           // 将工具结果作为系统消息
//           const toolResultMessage = {
//             role: 'system',
//             content: `工具 ${fullResponse.name} 返回的结果: ${JSON.stringify(toolResult.content)}`
//           };

//           // 再次询问星火API进行总结
//           const newMessages = [...messages, toolResultMessage];
//           fullResponse = (await this.sendSparkMessage(newMessages)) as string;
//         } catch (toolError) {
//           this.printError(`工具调用失败: ${(toolError as Error).message}`);
//           fullResponse = '抱歉，工具调用失败，请重试或尝试其他方法。';
//         }
//       }

//       // 添加到对话历史
//       this.conversationHistory.push({ role: 'assistant', content: fullResponse });

//       return fullResponse;
//     } catch (error) {
//       this.printError(`处理查询时出错: ${(error as Error).message}`);
//       return '抱歉，处理您的请求时出现问题，请重试。';
//     }
//   }

//   // 改进的聊天循环
//   async chatLoop(): Promise<void> {
//     console.log('\n\x1b[36m🚀 MCP 客户端已启动！\x1b[0m');
//     console.log('\x1b[33m输入你的查询，可以使用以下命令:');
//     console.log('  /reset - 重置当前会话');
//     console.log('  /history - 查看对话历史');
//     console.log('  /tools - 查看可用工具');
//     console.log('  /resources - 查看可用资源');
//     console.log('  /prompts - 查看可用提示词');
//     console.log('  /quit - 退出程序\x1b[0m');

//     this.resetConversation();

//     const rl = readline.createInterface({
//       input: process.stdin,
//       output: process.stdout,
//       prompt: '\x1b[34m👤 你: \x1b[0m'
//     });

//     rl.prompt();

//     rl.on('line', async (query: string) => {
//       try {
//         if (query.trim() === '/quit') {
//           await this.cleanup();
//           rl.close();
//           return;
//         }

//         if (query.trim() === '/reset') {
//           this.resetConversation();
//           rl.prompt();
//           return;
//         }

//         if (query.trim() === '/history') {
//           console.log('\x1b[35m📜 对话历史:\x1b[0m');
//           this.conversationHistory.forEach((msg, i) => {
//             const prefix = msg.role === 'user' ? '👤 你' : '🤖 助手';
//             console.log(`\x1b[35m${i + 1}. ${prefix}: ${msg.content}\x1b[0m`);
//           });
//           rl.prompt();
//           return;
//         }

//         if (query.trim() === '/tools') {
//           console.log('\x1b[33m🛠️ 可用工具:\x1b[0m');
//           this.availableTools.forEach(tool => {
//             console.log(`\x1b[33m- ${tool.name}: ${tool.description}\x1b[0m`);
//             if (tool.input_schema) {
//               console.log(`  参数格式: ${JSON.stringify(tool.input_schema)}`);
//             }
//           });
//           rl.prompt();
//           return;
//         }

//         if (query.trim() === '/resources') {
//           console.log('\x1b[33m📂 可用资源:\x1b[0m');
//           this.availableResources.forEach(resource => {
//             console.log(`\x1b[33m- ${resource.name}: ${resource.uri}\x1b[0m`);
//           });
//           rl.prompt();
//           return;
//         }

//         if (query.trim() === '/prompts') {
//           console.log('\x1b[33m📝 可用提示词:\x1b[0m');
//           this.availablePrompts.forEach(prompt => {
//             console.log(`\x1b[33m- ${prompt.name}: ${prompt.description}\x1b[0m`);
//           });
//           rl.prompt();
//           return;
//         }

//         await this.processQuery(query);
//         rl.prompt();
//       } catch (error) {
//         this.printError((error as Error).message);
//         rl.prompt();
//       }
//     });

//     rl.on('close', () => {
//       console.log('\x1b[36m👋 再见！\x1b[0m');
//       process.exit(0);
//     });
//   }

//   async cleanup(): Promise<void> {
//     if (this.transport) {
//       await this.transport.close();
//     }
//   }
// }

// // 主执行逻辑
// async function main() {
//   if (process.argv.length < 3) {
//     console.log('用法：ts-node client.ts <服务器脚本路径>');
//     process.exit(1);
//   }

//   const client = new MCPClient();
//   try {
//     await client.connectToServer(process.argv[2]);
//     await client.chatLoop();
//   } catch (error) {
//     console.error('错误：', error);
//     await client.cleanup();
//     process.exit(1);
//   }
// }

// const importMetaPath = fileURLToPath(import.meta.url);
// const argvPath = path.resolve(process.argv[1]);
// if (importMetaPath === argvPath) {
//   main();
// }

// export default MCPClient;

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { createHash, createHmac } from 'crypto';
import {
  CallToolResultSchema,
  ListToolsResultSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  ListPromptsResultSchema,
  GetPromptResultSchema,
  Resource,
  Prompt,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import chalk from 'chalk';

interface SparkMessage {
  content: string;
  role: 'user' | 'assistant' | 'system';
  content_type?: 'text' | string;
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

dotenv.config();

class MCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private sparkHost = 'wss://spark-api.xf-yun.com/v4.0/chat';
  private domin = '4.0Ultra';
  private availableTools: Tool[] = [];
  private availableResources: Resource[] = [];
  private availablePrompts: Prompt[] = [];
  private conversationHistory: Array<{ role: string; content: string }> = [];
  private sessionId: string = uuidv4();
  private isProcessing: boolean = false;

  constructor() {}

  // 生成星火API的鉴权URL
  private getSparkAuthUrl(): string {
    const apiKey = process.env.SPARK_API_KEY!;
    const apiSecret = process.env.SPARK_API_SECRET!;
    const host = new URL(this.sparkHost).host;
    const date = new Date().toUTCString();
    const pathname = new URL(this.sparkHost).pathname;

    const signatureOrigin = `host: ${host}\n` + `date: ${date}\n` + `GET ${pathname} HTTP/1.1`;
    const signatureSha = createHmac('sha256', apiSecret).update(signatureOrigin).digest('base64');

    const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", ` + `headers="host date request-line", signature="${signatureSha}"`;

    const authorization = Buffer.from(authorizationOrigin).toString('base64');

    return `${this.sparkHost}?` + `authorization=${authorization}&` + `date=${encodeURIComponent(date)}&` + `host=${encodeURIComponent(host)}`;
  }

  // 连接到星火WebSocket
  private async createSparkConnection(): Promise<WebSocket> {
    const url = this.getSparkAuthUrl();
    return new WebSocket(url);
  }

  // 发送消息到星火API（支持实时显示）
  private async sendSparkMessage(
    messages: SparkMessage[],
    tools: Tool[] = [],
    onProgress?: (text: string, isFunctionCall?: boolean) => void
  ): Promise<string | { name: string; arguments: string }> {
    return new Promise(async (resolve, reject) => {
      const ws = await this.createSparkConnection();
      let fullResponse = '';
      let isFunctionCall = false;
      let functionCallData: { name: string; arguments: string } | null = null;

      ws.on('open', () => {
        const request: any = {
          header: {
            app_id: process.env.SPARK_APP_ID!,
            uid: uuidv4()
          },
          parameter: {
            chat: {
              domain: this.domin,
              temperature: 0.5,
              max_tokens: 2048
            }
          },
          payload: {
            message: {
              text: messages
            },
            functions: {
              text: []
            }
          }
        };

        if (tools.length > 0) {
          request.payload.functions['text'] = tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema
          }));
        }
        ws.send(JSON.stringify(request));
      });

      ws.on('message', (event: Buffer) => {
        const response: SparkResponse = JSON.parse(event.toString());
        if (response.header.code !== 0) {
          reject(new Error(`星火API错误: ${response.header.message}`));
          ws.close();
          return;
        }

        const texts = response.payload.choices.text;
        if (texts && texts.length > 0) {
          const newText = texts.map(t => t.content).join('');
          fullResponse += newText;

          // 检查是否是函数调用
          const function_call = response?.payload?.choices?.text[0]?.function_call;
          if (function_call) {
            isFunctionCall = true;
            functionCallData = {
              name: function_call.name,
              arguments: function_call.arguments
            };
          }

          // 实时显示新内容
          if (onProgress) {
            onProgress(newText, isFunctionCall);
          }
        }

        if (response.header.status === 2) {
          if (isFunctionCall && functionCallData) {
            ws.close();
            resolve(functionCallData);
          } else {
            ws.close();
            resolve(fullResponse);
          }
        }
      });

      ws.on('error', reject);
    });
  }

  // 连接到MCP服务器
  async connectToServer(serverScriptPath: string): Promise<void> {
    const isPython = serverScriptPath.endsWith('.py');
    const isJs = serverScriptPath.endsWith('.js');

    if (!isPython && !isJs) {
      throw new Error('服务器脚本必须是 .py 或 .js 文件');
    }

    const command = isPython ? 'python' : 'node';

    this.transport = new StdioClientTransport({
      command,
      args: [serverScriptPath]
    });

    this.client = new Client(
      {
        name: 'mcp-client',
        version: '1.0.0'
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {}
        }
      }
    );

    await this.client.connect(this.transport);

    // 获取所有可用能力
    await this.fetchServerCapabilities();
  }

  // 获取服务器所有能力
  private async fetchServerCapabilities(): Promise<void> {
    if (!this.client) throw new Error('客户端未连接');

    // 获取工具列表
    const toolsResponse = await this.client.request({ method: 'tools/list' }, ListToolsResultSchema);
    this.availableTools = toolsResponse.tools;

    // 获取资源列表
    const resourcesResponse = await this.client.request({ method: 'resources/list' }, ListResourcesResultSchema);
    this.availableResources = resourcesResponse.resources;

    // 获取提示词列表
    const promptsResponse = await this.client.request({ method: 'prompts/list' }, ListPromptsResultSchema);
    this.availablePrompts = promptsResponse.prompts;

    console.log('\n可用能力：');
    console.log(chalk.blue('工具:'), this.availableTools.map(tool => tool.name).join(', '));
    console.log(chalk.blue('资源:'), this.availableResources.map(res => res.name).join(', '));
    console.log(chalk.blue('提示词:'), this.availablePrompts.map(prompt => prompt.name).join(', '));
  }

  // 调用工具
  private async callTool(name: string, args: any): Promise<any> {
    if (!this.client) throw new Error('客户端未连接');

    const result = await this.client.request(
      {
        method: 'tools/call',
        params: {
          name,
          arguments: args
        }
      },
      CallToolResultSchema
    );
    return result;
  }

  // 读取资源
  private async readResource(uri: string): Promise<any> {
    if (!this.client) throw new Error('客户端未连接');

    const result = await this.client.request(
      {
        method: 'resources/read',
        params: { uri }
      },
      ReadResourceResultSchema
    );
    return result;
  }

  // 获取提示词
  private async getPrompt(name: string, args?: any): Promise<any> {
    if (!this.client) throw new Error('客户端未连接');

    const result = await this.client.request(
      {
        method: 'prompts/get',
        params: {
          name,
          arguments: args
        }
      },
      GetPromptResultSchema
    );
    return result;
  }

  // 显示历史记录
  private showHistory(): void {
    console.log(chalk.yellow('\n=== 会话历史记录 ==='));
    if (this.conversationHistory.length === 0) {
      console.log(chalk.gray('暂无历史记录'));
      return;
    }

    this.conversationHistory.forEach((item, index) => {
      const prefix = item.role === 'user' ? chalk.green('你: ') : chalk.blue('AI: ');
      console.log(`${chalk.gray(`${index + 1}.`)} ${prefix}${item.content}`);
    });
    console.log(chalk.yellow('==================\n'));
  }

  // 处理查询的核心逻辑（支持实时显示）
  async processQuery(query: string): Promise<string> {
    if (!this.client) throw new Error('客户端未连接');
    this.isProcessing = true;

    // 添加到历史记录
    this.conversationHistory.push({ role: 'user', content: query });

    const messages: SparkMessage[] = [
      { role: 'system', content: '你是一个由red润创造的小可爱，你喜欢唱歌跳舞打篮球，还喜欢中分发型' },
      {
        role: 'system',
        content: `当前可用的能力：
        工具: ${JSON.stringify(this.availableTools)}
        资源: ${JSON.stringify(this.availableResources)}
        提示词: ${JSON.stringify(this.availablePrompts)}`
      },
      { role: 'user', content: query }
    ];

    let resultArr: string[] = [];
    let fullResponse: string | { name: string; arguments: string };

    try {
      // 清空当前行并显示AI前缀
      process.stdout.write('\r');
      process.stdout.write(chalk.blue('AI: '));

      // 发送消息并实时显示
      fullResponse = await this.sendSparkMessage(messages, this.availableTools, (text, isFunctionCall) => {
        if (isFunctionCall) {
          // 如果是函数调用，换行显示
          process.stdout.write('\n');
        }
        process.stdout.write(text);
      });

      // 处理换行
      console.log();

      // 处理工具调用
      if (typeof fullResponse !== 'string') {
        try {
          // 显示工具调用信息
          console.log(chalk.yellow(`\n调用工具: ${fullResponse.name}`));
          console.log(chalk.gray(`参数: ${JSON.stringify(fullResponse.arguments)}`));

          // 调用工具
          const toolResult = await this.callTool(fullResponse.name, fullResponse.arguments);
          const toolResultStr = `工具调用结果: ${JSON.stringify(toolResult.content)}`;
          resultArr.push(toolResultStr);
          console.log(chalk.green(toolResultStr));

          // 准备后续消息
          messages.push({
            role: 'assistant',
            content: `已为您完成以下操作: ${resultArr.join('\n')}`
          });

          // 发送总结请求并实时显示
          console.log(chalk.blue('\n总结结果:'));
          const summaryResponse = await this.sendSparkMessage(messages, this.availableTools, text => {
            process.stdout.write(text);
          });

          if (typeof summaryResponse === 'string') {
            resultArr.push(summaryResponse);
            console.log(); // 换行
          }
        } catch (e) {
          console.error(chalk.red('\n操作执行失败:'), e);
          resultArr.push(`操作执行失败: ${(e as any).message}`);
        }
      } else {
        resultArr.push(fullResponse);
      }
    } catch (error) {
      console.error(chalk.red('\n请求失败:'), error);
      resultArr.push(`请求失败: ${(error as any).message}`);
    } finally {
      this.isProcessing = false;
    }

    // 添加到历史记录
    const responseText = resultArr.join('\n');
    this.conversationHistory.push({ role: 'assistant', content: responseText });

    return responseText;
  }

  // 聊天循环
  async chatLoop(): Promise<void> {
    console.log(chalk.yellow('\n=== MCP 客户端已启动 ==='));
    console.log(chalk.green(`会话ID: ${this.sessionId}`));
    console.log(chalk.green('输入你的查询或输入以下命令:'));
    console.log(chalk.green("  'history' - 查看历史记录"));
    console.log(chalk.green("  'clear' - 清空当前会话历史"));
    console.log(chalk.green("  'quit' - 退出程序"));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.blue('\n> ')
    });

    rl.prompt();

    rl.on('line', async (line: string) => {
      if (this.isProcessing) {
        console.log(chalk.yellow('\n请等待当前请求完成...'));
        rl.prompt();
        return;
      }

      try {
        const input = line.trim();

        if (input.toLowerCase() === 'quit') {
          await this.cleanup();
          rl.close();
          return;
        }

        if (input.toLowerCase() === 'history') {
          this.showHistory();
          rl.prompt();
          return;
        }

        if (input.toLowerCase() === 'clear') {
          this.conversationHistory = [];
          console.log(chalk.green('当前会话历史已清空'));
          rl.prompt();
          return;
        }

        if (input) {
          await this.processQuery(input);
          this.fetchServerCapabilities();
        }

        rl.prompt();
      } catch (error) {
        console.error(chalk.red('\n错误：'), error);
        rl.prompt();
      }
    }).on('close', () => {
      console.log(chalk.yellow('\n再见！'));
      process.exit(0);
    });
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
    console.log(chalk.red('用法：ts-node client.ts <服务器脚本路径>'));
    process.exit(1);
  }

  const client = new MCPClient();
  try {
    await client.connectToServer(process.argv[2]);
    await client.chatLoop();
  } catch (error) {
    console.error(chalk.red('错误：'), error);
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
