# mcp-client-server-markdown: A Markdown MCP client and server

## 项目简介

> MCP Markdown Server 是一个基于 Model Context Protocol (MCP) 的服务器应用，提供 Markdown 文档的**创建**、**编辑**、**搜索**、**转换为html**和**管理**的功能。该项目通过了结合了讯飞星火大模型的 MCP Client 以及自定义 MCP Server 协议，实现了智能化的 Markdown 文档处理能力。

## 主要功能

### 1. Markdown 文档管理

- **创建文档**：通过自然语言指令创建新的 Markdown 文档
- **编辑文档**：修改现有文档内容
- **删除文档**：安全删除不再需要的文档
- **搜索文档**：全文搜索文档内容

### 2. 文档转换

- **Markdown 转 HTML**：将 Markdown 内容转换为 HTML 格式

### 3. 智能模板

- 提供多种 Markdown 模板（文章、笔记、待办事项、会议记录等）
- 自动生成文档摘要

### 4. 对话式交互

- 通过自然语言与系统交互
- 支持工具调用和上下文记忆

## 技术架构

- **核心协议**：Model Context Protocol (MCP)
- **AI 能力**：星火大模型 API (Spark API)
- **后端**：Node.js
- **存储**：本地文件系统

## 快速开始

### 前置条件

1. 安装 Node.js (v16+)
2. 获取星火 API 密钥 (SPARK_API_KEY, SPARK_API_SECRET, SPARK_APP_ID)
3. 创建 `.env` 文件并配置环境变量

### 安装与运行

1. 克隆仓库：

   ```bash
   git clone https://github.com/your-repo/mcp-markdown-server.git
   cd mcp-markdown-server
   ```

2. 安装依赖：

   ```bash
   npm install
   ```

3. 启动服务器：

   ```bash
   node server.js
   ```

4. 启动客户端：

   ```bash
   node client.js server.js
   ```

## 使用示例

### 创建新文档

```markdown
> 请帮我创建一个关于项目计划的Markdown文档，包含API开发和UI设计两部分
```

### 搜索文档

```markdown
> 查找所有包含"API开发"的文档
```

### 转换为HTML

```markdown
> 将以下Markdown转换为HTML: ## 标题\n\n这是一个段落
```

### 使用模板

```markdown
> 使用会议记录模板创建一个新的文档，主题是"项目进度会议"
```

## 项目结构

```markdown
mcp-markdown-server/
├── client.ts        # MCP客户端实现
├── server.ts        # MCP服务器实现
├── markdowns/       # Markdown文档存储目录
├── .env     # 环境变量示例
├── package.json     # 项目依赖
└── README.md        # 项目文档
```

## 贡献指南

欢迎贡献！请遵循以下步骤：

1. Fork 项目仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证。

## Certification
This server is certified with [MCP Review](https://mcpreview.com/mcp-servers/zou-hong-run/mcp-client-server-markdown).
## 认证  
本服务器已通过 [MCP Review](https://mcpreview.com/mcp-servers/zou-hong-run/mcp-client-server-markdown) 认证。
## 联系方式

如有任何问题，请联系项目维护者：

- 邮箱: zhr19853149156@163.com

------

**提示**：使用前请确保已正确配置星火 API 密钥和本地环境变量。
