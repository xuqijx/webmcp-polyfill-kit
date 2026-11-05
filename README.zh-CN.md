**语言：** [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md)

# WebMCP Polyfill Kit

把遗留网页变成 Agent 可调用的工具。

一行脚本式 polyfill，在旧的审批 / 工单门户上注册可调用工具。无需重写门户，无需截图点选。

> **与 Google / Chrome 无关联。** 本项目按 Chrome 实验性 WebMCP（`document.modelContext` / `navigator.modelContext`）的形态做本地演示。原生 API 仍可能变化。

## 做什么

| 模式 | 行为 |
|------|------|
| **Native** | 若浏览器已提供带 `registerTool` 的 `modelContext`，则委托给原生实现。 |
| **Polyfill** | 否则安装垫片：`registerTool`、`listTools`、`callTool`。 |

本地 **Node 桥** 托管演示页，经 WebSocket 连到页面，并提供：

- HTTP JSON：`GET /api/tools`、`POST /api/call`
- 可选 MCP stdio：`npm run mcp`（供 Cursor / Claude Desktop）

## 三步启动

```bash
cd mvp
npm install
npm run demo
```

`npm run demo` 会启动桥、在无头 Chrome 中打开 **Acme Approvals**（虚构数据）、列出工具、调用三个核心工具，并演示批准时的确认门闩。

手动查看界面：`DEMO_KEEP=1 npm run demo`，然后打开 http://127.0.0.1:8765/examples/acme-approvals/

## 工具（Acme Approvals 演示）

| 工具 | 需确认 | 说明 |
|------|--------|------|
| `list_pending_approvals` | 否 | 列出待审批 |
| `get_request_detail` | 否 | 按 id 取详情 |
| `approve_request` | **是** | 批准（写操作） |
| `reject_request` | **是** | 拒绝（第四个可选工具） |

写操作工具设置 `requiresConfirmation: true`。桥在客户端传入 `confirmed: true`（或仅限本地演示的 `autoConfirm`）之前会拒绝调用。

## 注册工具示例

```html
<script src="/src/webmcp-polyfill.js"></script>
<script>
  document.modelContext.registerTool({
    name: 'list_pending_approvals',
    description: 'List pending approval requests',
    inputSchema: { type: 'object', properties: {} },
    execute() {
      return { count: 0, requests: [] };
    },
  });

  document.modelContext.registerTool({
    name: 'approve_request',
    description: 'Approve a pending request',
    requiresConfirmation: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        comment: { type: 'string' },
      },
      required: ['id', 'comment'],
    },
    execute({ id, comment }) {
      return { ok: true, id, status: 'approved', comment };
    },
  });
</script>
```

## 安全说明

凡批准 / 拒绝 / 删除等写操作必须带 `requiresConfirmation`。未传入 `{ confirmed: true }` 时 polyfill 会抛出 `CONFIRMATION_REQUIRED`。生产环境的 Agent **不要**静默自动确认。

## 脚本

| 命令 | 用途 |
|------|------|
| `npm run demo` | 端到端本地演示（跑完检查后退出） |
| `npm test` | 三个工具 + 确认门闩冒烟测试 |
| `npm start` | 仅启动桥 |
| `npm run mcp` | MCP stdio（需桥与页面已连接） |
| `npm run record-demo` | 从真实运行重录 `docs/demo.gif` |

## 许可

MIT — 见 [LICENSE](LICENSE)。

演示中的名称、金额与单据均为虚构，不含真实公司数据。
