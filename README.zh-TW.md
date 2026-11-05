**語言：** [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md)

# WebMCP Polyfill Kit

把舊有網頁變成 Agent 可呼叫的工具。

以 polyfill 在舊的簽核 / 工單入口註冊可呼叫工具。不必重寫入口，也不靠截圖點選。

> **與 Google / Chrome 無關聯。** 本專案依 Chrome 實驗性 WebMCP（`document.modelContext` / `navigator.modelContext`）的形狀做本機示範。原生 API 仍可能變動。

## 做什麼

| 模式 | 行為 |
|------|------|
| **Native** | 若瀏覽器已提供含 `registerTool` 的 `modelContext`，則委派給原生實作。 |
| **Polyfill** | 否則安裝 shim：`registerTool`、`listTools`、`callTool`。 |

本機 **Node 橋接** 提供示範頁，經 WebSocket 連到頁面，並暴露：

- HTTP JSON：`GET /api/tools`、`POST /api/call`
- 可選 MCP stdio：`npm run mcp`（給 Cursor / Claude Desktop）

## 三步啟動

```bash
cd mvp
npm install
npm run demo
```

`npm run demo` 會啟動橋接、在無頭 Chrome 開啟 **Acme Approvals**（虛構資料）、列出工具、呼叫三個核心工具，並示範核准時的確認門檻。

手動介面：`DEMO_KEEP=1 npm run demo`，然後開啟 http://127.0.0.1:8765/examples/acme-approvals/

## 工具（Acme Approvals 示範）

| 工具 | 需確認 | 說明 |
|------|--------|------|
| `list_pending_approvals` | 否 | 列出待簽核 |
| `get_request_detail` | 否 | 依 id 取詳情 |
| `approve_request` | **是** | 核准（寫入操作） |
| `reject_request` | **是** | 駁回（第四個可選工具） |

寫入類工具會設 `requiresConfirmation: true`。橋接在客戶端傳入 `confirmed: true`（或僅限本機示範的 `autoConfirm`）之前會拒絕呼叫。

## 註冊工具範例

```html
<script src="/src/webmcp-polyfill.js"></script>
<script>
  document.modelContext.registerTool({
    name: 'approve_request',
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

## 安全說明

核准 / 駁回 / 刪除等寫入操作必須帶 `requiresConfirmation`。未傳 `{ confirmed: true }` 時會拋出 `CONFIRMATION_REQUIRED`。正式環境的 Agent **不要**靜默自動確認。

## 指令

| 指令 | 用途 |
|------|------|
| `npm run demo` | 端到端本機示範 |
| `npm test` | 三工具 + 確認門檻煙霧測試 |
| `npm start` | 只啟動橋接 |
| `npm run mcp` | MCP stdio |
| `npm run record-demo` | 重錄 `docs/demo.gif` |

## 授權

MIT — 見 [LICENSE](LICENSE)。

示範中的名稱、金額與單據皆為虛構，不含真實公司資料。
