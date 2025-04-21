import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import dotenv from 'dotenv';

dotenv.config();

/**功能说明
 * 
 * 这个增强版的Markdown服务器提供了以下功能：

  ​文档管理：
    创建、编辑、删除Markdown文档
    文档内容搜索
    Markdown转HTML
  ​元数据管理：
    为文档添加分类和标签
    自动记录创建和修改时间
  ​版本控制：
    每次编辑前自动保存历史版本
    查看文档的历史版本列表
  ​导出功能：
    支持导出为HTML、PDF和Word格式
    (注：PDF和Word导出需要额外依赖)
  ​提示词模板：
    提供多种Markdown模板
    支持为内容生成摘要
 * 
 */

// 配置Markdown存储目录
const MARKDOWN_DIR = process.env.MARKDOWN_DIR || './markdowns';
const META_DIR = path.join(MARKDOWN_DIR, '.meta');
const VERSION_DIR = path.join(MARKDOWN_DIR, '.versions');

// 确保目录存在
[MARKDOWN_DIR, META_DIR, VERSION_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 元数据接口
interface MarkdownMeta {
  categories?: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

class MarkdownServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'markdown-server',
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
    this.setupHandler();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = error => {
      console.log('[MCP Error]', error);
    };
    process.on('SIGINT', async () => {
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
        .filter(file => file.endsWith('.md'))
        .map(file => {
          const filePath = path.join(MARKDOWN_DIR, file);
          const stats = fs.statSync(filePath);
          const meta = this.readMeta(file);

          return {
            uri: `markdown://${file}`,
            name: file,
            mimeType: 'text/markdown',
            description: `markdown 文件在${stats.birthtime.toISOString()}被创建`,
            size: stats.size,
            metadata: meta
          };
        });
      return {
        resources: files
      };
    });

    // 读取特定 markdown 文档内容
    this.server.setRequestHandler(ReadResourceRequestSchema, async request => {
      const fileName = request.params.uri.replace('markdown://', '');
      const filePath = path.join(MARKDOWN_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        throw new McpError(ErrorCode.MethodNotFound, `markdown ${fileName} 找不到`);
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const meta = this.readMeta(fileName);

        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'text/markdown',
              text: content,
              metadata: meta
            }
          ]
        };
      } catch (error) {
        throw new McpError(ErrorCode.InternalError, `读取 markdown 文件失败: ${(error as Error).message}`);
      }
    });
  }

  /**
   * 工具处理程序 - 提供 markdown 操作功能
   */
  private setupToolHandlers(): void {
    // 列出所有可用的工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [
        {
          name: 'create_markdown',
          description: '创建并保存一个新的 Markdown 文档',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: '文档标题'
              },
              content: {
                type: 'string',
                description: 'Markdown格式的内容'
              },
              categories: {
                type: 'array',
                items: { type: 'string' },
                description: '文档分类'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: '文档标签'
              }
            },
            required: ['title', 'content']
          }
        },
        {
          name: 'edit_markdown',
          description: '编辑现有的Markdown文档',
          inputSchema: {
            type: 'object',
            properties: {
              uri: {
                type: 'string',
                description: '文档URI (markdown://filename.md)'
              },
              content: {
                type: 'string',
                description: '新的Markdown内容'
              }
            },
            required: ['uri', 'content']
          }
        },
        {
          name: 'delete_markdown',
          description: '删除Markdown文档',
          inputSchema: {
            type: 'object',
            properties: {
              uri: {
                type: 'string',
                description: '文档URI (markdown://filename.md)'
              }
            },
            required: ['uri']
          }
        },
        {
          name: 'search_markdown',
          description: '搜索 Markdown 文档内容',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '搜索关键词'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'convert_to_html',
          description: '将Markdown转换为HTML',
          inputSchema: {
            type: 'object',
            properties: {
              markdown: {
                type: 'string',
                description: 'Markdown格式的内容'
              }
            },
            required: ['markdown']
          }
        },
        {
          name: 'update_metadata',
          description: '更新文档的分类和标签',
          inputSchema: {
            type: 'object',
            properties: {
              uri: {
                type: 'string',
                description: '文档URI (markdown://filename.md)'
              },
              categories: {
                type: 'array',
                items: { type: 'string' },
                description: '文档分类'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: '文档标签'
              }
            },
            required: ['uri']
          }
        },
        {
          name: 'list_versions',
          description: '列出文档的历史版本',
          inputSchema: {
            type: 'object',
            properties: {
              uri: {
                type: 'string',
                description: '文档URI (markdown://filename.md)'
              }
            },
            required: ['uri']
          }
        },
        {
          name: 'export_markdown',
          description: '导出Markdown文档为其他格式',
          inputSchema: {
            type: 'object',
            properties: {
              uri: {
                type: 'string',
                description: '文档URI (markdown://filename.md)'
              },
              format: {
                type: 'string',
                enum: ['pdf', 'html', 'docx'],
                description: '导出格式'
              }
            },
            required: ['uri', 'format']
          }
        }
      ];
      return { tools };
    });

    // 处理工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      try {
        switch (request.params.name) {
          case 'create_markdown':
            return await this.handleCreateMarkdown(request.params.arguments);
          case 'edit_markdown':
            return await this.handleEditMarkdown(request.params.arguments);
          case 'delete_markdown':
            return await this.handleDeleteMarkdown(request.params.arguments);
          case 'search_markdown':
            return await this.handleSearchMarkdown(request.params.arguments);
          case 'convert_to_html':
            return await this.handleConvertToHtml(request.params.arguments);
          case 'update_metadata':
            return await this.handleUpdateMetadata(request.params.arguments);
          case 'list_versions':
            return await this.handleListVersions(request.params.arguments);
          case 'export_markdown':
            return await this.handleExportMarkdown(request.params.arguments);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `未知工具: ${request.params.name}`);
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
      'markdown-template': {
        name: 'markdown-template',
        description: '生成一个标准化的Markdown模板',
        arguments: [
          {
            name: 'type',
            description: '模板类型 (article, note, todo, meeting-notes)',
            required: true
          },
          {
            name: 'topic',
            description: '文档主题',
            required: false
          }
        ]
      },
      'markdown-summary': {
        name: 'markdown-summary',
        description: '为Markdown内容生成摘要',
        arguments: [
          {
            name: 'content',
            description: 'Markdown内容',
            required: true
          }
        ]
      }
    };

    // 列出所有可用的提示词
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: Object.values(PROMPTS)
      };
    });

    // 处理提示词请求
    this.server.setRequestHandler(GetPromptRequestSchema, async request => {
      const prompt = PROMPTS[request.params.name as 'markdown-template' | 'markdown-summary'];
      if (!prompt) {
        throw new McpError(ErrorCode.MethodNotFound, `提示词找不到: ${request.params.name}`);
      }

      if (request.params.name === 'markdown-template') {
        const type = request.params.arguments?.type || 'note';
        const topic = request.params.arguments?.topic || '';

        let template = '';
        switch (type) {
          case 'article':
            template = `# ${topic || '文章标题'}\n\n## 摘要\n\n简要描述文章内容\n\n## 正文\n\n## 结论\n\n`;
            break;
          case 'note':
            template = `# ${topic || '笔记标题'}\n\n- 要点1\n- 要点2\n\n## 详细内容\n\n`;
            break;
          case 'todo':
            template = `# ${topic || '待办事项'}\n\n## 今日任务\n\n- [ ] 任务1\n- [ ] 任务2\n\n## 未来计划\n\n`;
            break;
          case 'meeting-notes':
            template = `# ${
              topic || '会议记录'
            } - ${new Date().toLocaleDateString()}\n\n## 参会人员\n\n- 人员1\n- 人员2\n\n## 讨论内容\n\n### 议题1\n\n### 议题2\n\n## 行动计划\n\n`;
            break;
          default:
            template = `# ${topic || '文档标题'}\n\n开始写作...\n`;
        }

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `这是一个${type}类型的Markdown模板，主题是"${topic}"。请根据以下模板生成内容:\n\n${template}`
              }
            }
          ]
        };
      }

      if (request.params.name === 'markdown-summary') {
        const content = request.params.arguments?.content || '';
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `请为以下Markdown内容生成一个简洁的摘要:\n\n${content}`
              }
            }
          ]
        };
      }

      throw new McpError(ErrorCode.InternalError, '提示词参数不对');
    });
  }

  // ========== 工具处理函数 ==========

  // 创建Markdown文档
  private async handleCreateMarkdown(args: any) {
    if (!args.title || !args.content) {
      throw new McpError(ErrorCode.InvalidParams, '标题和内容不能为空');
    }

    // 清理文件名
    const cleanTitle = args.title.replace(/[^a-zA-Z0-9\-_ \u4e00-\u9fa5]/g, '').trim();
    const fileName = `${cleanTitle.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.md`;
    const filePath = path.join(MARKDOWN_DIR, fileName);

    try {
      // 写入文件
      fs.writeFileSync(filePath, args.content);

      // 保存元数据
      const meta: MarkdownMeta = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (args.categories) {
        meta.categories = args.categories;
      }
      if (args.tags) {
        meta.tags = args.tags;
      }

      this.saveMeta(fileName, meta);

      return {
        content: [
          {
            type: 'text',
            text: `Markdown 文档创建成功: ${fileName}`,
            metadata: {
              uri: `markdown://${fileName}`,
              meta: meta
            }
          }
        ]
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `创建 markdown 失败: ${(error as Error).message}`);
    }
  }

  // 编辑Markdown文档
  private async handleEditMarkdown(args: any) {
    const fileName = args.uri.replace('markdown://', '');
    const filePath = path.join(MARKDOWN_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      throw new McpError(ErrorCode.MethodNotFound, `文档 ${fileName} 不存在`);
    }

    // 保存当前内容作为历史版本
    const currentContent = fs.readFileSync(filePath, 'utf-8');
    this.saveVersion(fileName, currentContent);

    try {
      fs.writeFileSync(filePath, args.content);

      // 更新元数据
      const meta = this.readMeta(fileName);
      meta.updatedAt = new Date().toISOString();
      this.saveMeta(fileName, meta);

      return {
        content: [
          {
            type: 'text',
            text: `文档 ${fileName} 更新成功`,
            metadata: {
              uri: args.uri,
              meta: meta
            }
          }
        ]
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `更新文档失败: ${(error as Error).message}`);
    }
  }

  // 删除Markdown文档
  private async handleDeleteMarkdown(args: any) {
    const fileName = args.uri.replace('markdown://', '');
    const filePath = path.join(MARKDOWN_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      throw new McpError(ErrorCode.MethodNotFound, `文档 ${fileName} 不存在`);
    }

    try {
      fs.unlinkSync(filePath);

      // 删除元数据文件
      const metaPath = this.getMetaPath(fileName);
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
      }

      return {
        content: [
          {
            type: 'text',
            text: `文档 ${fileName} 已删除`
          }
        ]
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `删除文档失败: ${(error as Error).message}`);
    }
  }

  // 搜索Markdown文档
  private async handleSearchMarkdown(args: any) {
    if (!args.query) {
      throw new McpError(ErrorCode.InvalidParams, '请传递搜索参数');
    }

    const files = fs.readdirSync(MARKDOWN_DIR).filter(file => file.endsWith('.md'));

    // 模糊匹配逻辑，忽略大小写，中英文标点符号和空格
    const normalizeText = (text: string) => {
      return text
        .toLocaleLowerCase()
        .replace(/[，。！？、；："'.,;:]/g, '')
        .replace(/\s+/g, '');
    };

    const normalizedQuery = normalizeText(args.query);
    const results = [];

    for (const file of files) {
      const filePath = path.join(MARKDOWN_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const normalizedContent = normalizeText(content);

      if (normalizedContent.includes(normalizedQuery)) {
        const matchdLines = content
          .split('\n')
          .filter(line => normalizeText(line).includes(normalizedQuery))
          .slice(0, 10)
          .map(line => `> ${line}`);

        const meta = this.readMeta(file);

        results.push({
          file,
          matches: matchdLines,
          meta: meta
        });
      }
    }

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `没有找到包含"${args.query}"的Markdown文档`
          }
        ]
      };
    }

    let resultText = `找到 ${results.length} 个匹配的文档:\n\n`;
    results.forEach(result => {
      resultText += `## ${result.file}\n`;
      if (result.meta.categories) {
        resultText += `分类: ${result.meta.categories.join(', ')}\n`;
      }
      if (result.meta.tags) {
        resultText += `标签: ${result.meta.tags.join(', ')}\n`;
      }
      resultText += `${result.matches.join('\n')}\n\n`;
    });

    return {
      content: [
        {
          type: 'text',
          text: resultText
        }
      ]
    };
  }

  // 转换Markdown为HTML
  private async handleConvertToHtml(args: any) {
    if (!args.markdown) {
      throw new McpError(ErrorCode.InvalidParams, '请传输需要转换的内容');
    }

    try {
      const html = marked(args.markdown);
      return {
        content: [
          {
            type: 'text',
            text: html
          }
        ]
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `转换 markdown 为html失败: ${(error as Error).message}`);
    }
  }

  // 更新元数据
  private async handleUpdateMetadata(args: any) {
    const fileName = args.uri.replace('markdown://', '');
    const meta = this.readMeta(fileName);

    if (args.categories) {
      meta.categories = args.categories;
    }
    if (args.tags) {
      meta.tags = args.tags;
    }
    meta.updatedAt = new Date().toISOString();

    this.saveMeta(fileName, meta);

    return {
      content: [
        {
          type: 'text',
          text: `文档 ${fileName} 元数据更新成功`,
          metadata: {
            uri: args.uri,
            meta: meta
          }
        }
      ]
    };
  }

  // 列出历史版本
  private async handleListVersions(args: any) {
    const fileName = args.uri.replace('markdown://', '');
    const versionDir = path.join(VERSION_DIR, fileName);

    if (!fs.existsSync(versionDir)) {
      return {
        content: [
          {
            type: 'text',
            text: `文档 ${fileName} 没有历史版本`
          }
        ]
      };
    }

    const versions = fs
      .readdirSync(versionDir)
      .map(version => {
        const timeStr = version.replace('.md', '').replace(/-/g, ':');
        return {
          time: new Date(timeStr).toLocaleString(),
          version: version
        };
      })
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    let result = `文档 ${fileName} 的历史版本:\n\n`;
    versions.forEach(v => {
      result += `- ${v.time}\n`;
    });

    return {
      content: [
        {
          type: 'text',
          text: result
        }
      ]
    };
  }

  // 导出文档
  private async handleExportMarkdown(args: any) {
    const fileName = args.uri.replace('markdown://', '');
    const filePath = path.join(MARKDOWN_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      throw new McpError(ErrorCode.MethodNotFound, `文档 ${fileName} 不存在`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    try {
      switch (args.format) {
        case 'html':
          const html = marked(content);
          return {
            content: [
              {
                type: 'text',
                text: html
              }
            ]
          };

        case 'pdf':
          return {
            content: [
              {
                type: 'text',
                text: `PDF导出功能需要安装额外依赖，当前仅模拟返回`
              }
            ]
          };

        case 'docx':
          return {
            content: [
              {
                type: 'text',
                text: `Word导出功能需要安装额外依赖，当前仅模拟返回`
              }
            ]
          };

        default:
          throw new McpError(ErrorCode.InvalidParams, `不支持的导出格式: ${args.format}`);
      }
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `导出失败: ${(error as Error).message}`);
    }
  }

  // ========== 辅助方法 ==========

  // 获取元数据文件路径
  private getMetaPath(fileName: string): string {
    return path.join(META_DIR, `${fileName}.json`);
  }

  // 读取元数据
  private readMeta(fileName: string): MarkdownMeta {
    const metaPath = this.getMetaPath(fileName);
    if (!fs.existsSync(metaPath)) {
      return {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  }

  // 保存元数据
  private saveMeta(fileName: string, meta: MarkdownMeta): void {
    const metaPath = this.getMetaPath(fileName);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }

  // 保存版本
  private saveVersion(fileName: string, content: string): void {
    const versionDir = path.join(VERSION_DIR, fileName);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const versionPath = path.join(versionDir, `${timestamp}.md`);
    fs.writeFileSync(versionPath, content);
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('[Markdown MCP server running on stdio]');
  }
}

const server = new MarkdownServer();
server.run().catch(console.error);
