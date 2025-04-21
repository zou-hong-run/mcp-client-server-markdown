import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import { marked } from "marked";
import dotenv from "dotenv";
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
console.log(process.env.SPARK_APP_ID);
// 配置Markdown存储目录
const MARKDOWN_DIR = process.env.MARKDOWN_DIR || "./markdowns";
if (!fs.existsSync(MARKDOWN_DIR)) {
  // "./a/b/c"自动创建父级
  fs.mkdirSync(MARKDOWN_DIR, { recursive: true });
}
class MarkdownServer {
  private server: Server;
  constructor() {
    this.server = new Server(
      {
        name: "markdown-server",
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
    this.setupHandler();
    this.setupErrorHandling();
  }
  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.log("[MCP Error]", error);
    };
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }
  private setupHandler(): void {
    this.setupResourceHandlers();
    this.setupToolHandlers();
    this.setupPromptsHandlers();
  }
  /**
   * 资源处理程序 - 提供 markdown 文档的访问
   */
  private setupResourceHandlers(): void {
    // 列出所有 markdown 文件
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const files = fs
        .readdirSync(MARKDOWN_DIR)
        .filter((file) => file.endsWith(".md"))
        .map((file) => {
          const filePath = path.join(MARKDOWN_DIR, file);
          const stats = fs.statSync(filePath);
          return {
            uri: `markdown://${file}`,
            name: file,
            mimeType: "text/markdown",
            description: `markdown 文件在${stats.birthtime.toISOString()}被创建`,
            size: stats.size,
          };
        });
      return {
        resources: files,
      };
    });
    // 读取特定 markdown 文档内容
    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const fileName = request.params.uri.replace("markdown://", "");
        const filePath = path.join(MARKDOWN_DIR, fileName);
        if (!fs.existsSync(filePath)) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `markdown ${fileName} 找不到`
          );
        }
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          return {
            contents: [
              {
                uri: request.params.uri,
                mimeType: "text/markdown",
                text: content,
              },
            ],
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `读取 markdown 文件失败: ${(error as Error).message}`
          );
        }
      }
    );
  }
  /**
   * 工具处理程序 - 提供 markdown 操作功能
   */
  private setupToolHandlers(): void {
    // 列出所有可用的工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      let tools = [
        {
          name: "create_markdown",
          description:
            "创建并保存一个新的Markdown文档到文件系统。使用此工具时需要提供完整的文档标题和内容。",
          inputSchema: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description:
                  '文档标题（将用于生成文件名，如"我的笔记"会保存为markdown://我的笔记.md）',
              },
              content: {
                type: "string",
                description:
                  "完整的Markdown格式内容，包括所有需要的标题、段落、列表等",
              },
            },
            required: ["title", "content"],
            examples: [
              {
                title: "项目计划",
                content: "# 项目计划\n\n## 目标\n- 完成API开发\n- 设计用户界面",
              },
            ],
          },
        },
        {
          name: "search_markdown",
          description:
            "在已存在的Markdown文档中搜索包含特定关键词的内容。仅用于搜索，不用于创建或修改文档。",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "要搜索的关键词或短语（支持多个关键词，用空格分隔）",
              },
            },
            required: ["query"],
            examples: [
              {
                query: "API 开发",
              },
            ],
          },
        },
        {
          name: "convert_to_html",
          description:
            "将给定的Markdown文本转换为HTML格式。此工具仅转换提供的文本，不涉及文件操作。",
          inputSchema: {
            type: "object",
            properties: {
              markdown: {
                type: "string",
                description: "需要转换的完整Markdown文本（不包括文件引用）",
              },
            },
            required: ["markdown"],
            examples: [
              {
                markdown: "## 标题\n\n这是一个段落",
              },
            ],
          },
        },
        {
          name: "edit_markdown",
          description:
            "修改已存在的Markdown文档内容。必须提供文档URI和新的完整内容。",
          inputSchema: {
            type: "object",
            properties: {
              uri: {
                type: "string",
                description:
                  "要编辑的文档URI（格式必须为markdown://filename.md）",
              },
              content: {
                type: "string",
                description: "文档的新完整内容（将完全替换原有内容）",
              },
            },
            required: ["uri", "content"],
            examples: [
              {
                uri: "markdown://项目计划.md",
                content: "# 更新后的项目计划\n\n## 新目标\n- 优化API性能",
              },
            ],
          },
        },
        {
          name: "delete_markdown",
          description: "永久删除指定的Markdown文档。操作不可逆，请谨慎使用。",
          inputSchema: {
            type: "object",
            properties: {
              uri: {
                type: "string",
                description:
                  "要删除的文档URI（格式必须为markdown://filename.md）",
              },
              confirm: {
                type: "boolean",
                description: "确认删除操作（必须设置为true才能执行删除）",
                default: false,
              },
            },
            required: ["uri", "confirm"],
            examples: [
              {
                uri: "markdown://废弃笔记.md",
                confirm: true,
              },
            ],
          },
        },
      ];
      return {
        tools,
      };
    });
    // 处理工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case "create_markdown":
            return await this.handleCreateMarkdown(request.params.arguments);
          case "search_markdown":
            return await this.handleSearchMarkdown(request.params.arguments);
          case "convert_to_html":
            return await this.handleConvertToHtml(request.params.arguments);
          case "edit_markdown":
            return await this.handleEditMarkdown(request.params.arguments);
          case "delete_markdown":
            return await this.handleDeleteMarkdown(request.params.arguments);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, (error as Error).message);
      }
    });
  }
  /**
   * 提示词处理程序 - 提供 markdown 生成模板
   */
  private setupPromptsHandlers(): void {
    const PROMPTS = {
      "markdown-template": {
        name: "markdown-template",
        description: "生成一个标准化的Markdown模板",
        arguments: [
          {
            name: "type",
            description: "模板类型 (article, note, todo, meeting-notes)",
            required: true,
          },
          {
            name: "topic",
            description: "文档主题",
            required: false,
          },
        ],
      },
      "markdown-summary": {
        name: "markdown-summary",
        description: "为Markdown内容生成摘要",
        arguments: [
          {
            name: "content",
            description: "Markdown内容",
            required: true,
          },
        ],
      },
    };
    // 列出所有可用的提示词
    this.server.setRequestHandler(ListPromptsRequestSchema, (async) => {
      return {
        prompts: Object.values(PROMPTS),
      };
    });
    // 处理提示词请求
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const prompt =
        PROMPTS[
          request.params.name as "markdown-template" | "markdown-summary"
        ];
      if (!prompt) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `提示词找不到: ${request.params.name}`
        );
      }
      if (request.params.name === "markdown-template") {
        const type = request.params.arguments?.type || "note";
        const topic = request.params.arguments?.topic || "";

        let template = "";
        switch (type) {
          case "article":
            template = `# ${
              topic || "文章标题"
            }\n\n## 摘要\n\n简要描述文章内容\n\n## 正文\n\n## 结论\n\n`;
            break;
          case "note":
            template = `# ${
              topic || "笔记标题"
            }\n\n- 要点1\n- 要点2\n\n## 详细内容\n\n`;
            break;
          case "todo":
            template = `# ${
              topic || "待办事项"
            }\n\n## 今日任务\n\n- [ ] 任务1\n- [ ] 任务2\n\n## 未来计划\n\n`;
            break;
          case "meeting-notes":
            template = `# ${
              topic || "会议记录"
            } - ${new Date().toLocaleDateString()}\n\n## 参会人员\n\n- 人员1\n- 人员2\n\n## 讨论内容\n\n### 议题1\n\n### 议题2\n\n## 行动计划\n\n`;
            break;
          default:
            template = `# ${topic || "文档标题"}\n\n开始写作...\n`;
        }

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `这是一个${type}类型的Markdown模板，主题是"${topic}"。请根据以下模板生成内容:\n\n${template}`,
              },
            },
          ],
        };
      }

      if (request.params.name === "markdown-summary") {
        const content = request.params.arguments?.content || "";
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `请为以下Markdown内容生成一个简洁的摘要:\n\n${content}`,
              },
            },
          ],
        };
      }

      throw new McpError(ErrorCode.InternalError, "提示词参数不对");
    });
  }
  // 创建Markdown文档
  private async handleCreateMarkdown(args: any) {
    if (!args.title || !args.content) {
      throw new McpError(ErrorCode.InvalidParams, "标题和内容不能为空");
    }

    // 清理文件名 移除标题中所有非中文，英文字母、数字、连字符、下划线和空格的字符
    const cleanTitle = args.title
      .replace(/[^a-zA-Z0-9\-_ \u4e00-\u9fa5]/g, "")
      .trim();
    // 空格替换成 -
    const fileName = `${cleanTitle
      .replace(/\s+/g, "-")
      .toLowerCase()}-${Date.now()}.md`;
    const filePath = path.join(MARKDOWN_DIR, fileName);

    try {
      // 写入文件
      fs.writeFileSync(filePath, args.content);

      return {
        content: [
          {
            type: "text",
            text: `Markdown 文档创建成功: ${fileName}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `创建 markdown 失败: ${(error as Error).message}`
      );
    }
  }

  // 搜索Markdown文档
  private async handleSearchMarkdown(args: any) {
    if (!args.query) {
      throw new McpError(ErrorCode.InvalidParams, "请传递搜索参数");
    }

    const files = fs
      .readdirSync(MARKDOWN_DIR)
      .filter((file) => file.endsWith(".md"));
    // import pinyin from 'pinyin' 中文转拼音，支持拼音模糊搜索
    // const queryPinyin = pinyin(args.query, { style: 'normal' }).join('');
    // 模糊匹配逻辑，忽略大小写，中英文标点符号和空格
    const normalizeText = (text: string) => {
      return text
        .toLocaleLowerCase()
        .replace(/[，。！？、；：“”‘’'".,;:]/g, "") // 移除中英文标点
        .replace(/\s+/g, ""); // 移除所有空格（如需保留空格可删除此行）
    };
    const normalizedQuery = normalizeText(args.query);
    const results = [];
    for (const file of files) {
      const filePath = path.join(MARKDOWN_DIR, file);
      const content = fs.readFileSync(filePath, "utf8");
      const normalizedContent = normalizeText(content);
      if (normalizedContent.includes(normalizedQuery)) {
        const matchdLines = content
          .split("\n")
          .filter((line) => normalizeText(line).includes(normalizedQuery))
          .slice(0, 10) // 显示前10个匹配行
          .map((line) => `> ${line}`); // 添加标记

        results.push({
          file,
          matches: matchdLines,
        });
      }

      // if (content.toLowerCase().includes(args.query.toLowerCase())) {
      //   results.push({
      //     file,
      //     matches: content
      //       .split('\n')
      //       .filter(line => line.toLowerCase().includes(args.query.toLowerCase()))
      //       .slice(0, 3) // 只显示前3个匹配行
      //   });
      // }
    }

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `没有找到包含"${args.query}"的Markdown文档`,
          },
        ],
      };
    }

    let resultText = `找到 ${results.length} 个匹配的文档:\n\n`;
    results.forEach((result) => {
      resultText += `## ${result.file}\n${result.matches.join("\n")}\n\n`;
    });

    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
  }

  // 转换Markdown为HTML
  private async handleConvertToHtml(args: any) {
    if (!args.markdown) {
      throw new McpError(ErrorCode.InvalidParams, "请传输需要转换的内容");
    }

    try {
      const html = marked(args.markdown);
      return {
        content: [
          {
            type: "text",
            text: html,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `转换 markdown 为html失败: ${(error as Error).message}`
      );
    }
  }
  // 编辑Markdown文档
  private async handleEditMarkdown(args: any) {
    const fileName = args.uri.replace("markdown://", "");
    const filePath = path.join(MARKDOWN_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      throw new McpError(ErrorCode.MethodNotFound, `文档 ${fileName} 不存在`);
    }

    try {
      fs.writeFileSync(filePath, args.content);
      return {
        content: [{ type: "text", text: `文档 ${fileName} 更新成功` }],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `更新文档失败: ${(error as Error).message}`
      );
    }
  }
  // 删除Markdown文档
  private async handleDeleteMarkdown(args: any) {
    const fileName = args.uri.replace("markdown://", "");
    const filePath = path.join(MARKDOWN_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      throw new McpError(ErrorCode.MethodNotFound, `文档 ${fileName} 不存在`);
    }

    try {
      fs.unlinkSync(filePath);
      return {
        content: [{ type: "text", text: `文档 ${fileName} 已删除` }],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `删除文档失败: ${(error as Error).message}`
      );
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log("[Markdown MCP server running on stdio]");
  }
}
const server = new MarkdownServer();
server.run().catch(console.error);
