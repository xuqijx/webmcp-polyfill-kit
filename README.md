**Languages:** [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md)

# WebMCP Polyfill Kit

> **Status: early MVP.** All sample data (Acme Approvals) is fictional. Not yet tested inside Cursor, Claude Desktop, or Chrome with the native WebMCP flag enabled. License: [MIT](LICENSE).


Turn legacy web pages into agent-callable tools.

Drop-in polyfill that registers callable tools on old approval / work-order portals. No portal rewrite, no screenshot clicking.

> **Not affiliated with Google or Chrome.** This project mirrors the shape of Chrome’s experimental WebMCP (`document.modelContext` / `navigator.modelContext`) for local demos. Native behavior may differ as the browser API evolves.

## What it does

| Mode | Behavior |
|------|----------|
| **Native** | If `navigator.modelContext` or `document.modelContext` already provides `registerTool`, the kit delegates to it. |
| **Polyfill** | Otherwise it installs a shim: `registerTool`, `listTools`, `callTool`. |

A small **Node bridge** serves the mock portal, connects to the page over WebSocket, and exposes:

- HTTP JSON: `GET /api/tools`, `POST /api/call`
- Optional MCP stdio: `npm run mcp` (for Cursor / Claude Desktop)

## 3-step start

```bash
cd /path/to/webmcp-polyfill-kit
npm install
npm run demo
```

`npm run demo` starts the bridge, loads **Acme Approvals** (fictional data) in headless Chrome, lists tools, calls each of the three core tools, and shows the confirmation gate on approve.

Manual UI: `DEMO_KEEP=1 npm run demo` then open http://127.0.0.1:8765/examples/acme-approvals/

## Tools (Acme Approvals demo)

| Tool | Confirmation | Description |
|------|--------------|-------------|
| `list_pending_approvals` | no | List pending requests |
| `get_request_detail` | no | Full detail for one request id |
| `approve_request` | **yes** | Approve a pending request (destructive) |
| `reject_request` | **yes** | Reject a pending request (optional fourth tool) |

Destructive tools set `requiresConfirmation: true`. The bridge refuses the call until the client passes `confirmed: true` (or `autoConfirm` in local demo/smoke only).

## Register a tool (example)

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
      /* update page state */
      return { ok: true, id, status: 'approved', comment };
    },
  });
</script>
```

## Safety note

Treat `requiresConfirmation` as mandatory for any write / approve / reject / delete action. The polyfill will throw `CONFIRMATION_REQUIRED` unless the host passes `{ confirmed: true }` after an explicit user approval step. Do not silently auto-confirm in production agents.

## Layout

Paths below are at the repository root.

```
src/webmcp-polyfill.js
bridge/          # HTTP + WebSocket relay + MCP stdio
examples/acme-approvals/
scripts/demo.js
test/smoke.test.js
docs/demo.gif
docs/QUICKSTART.md
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run demo` | End-to-end local demo (finite; exits after checks) |
| `npm test` | Smoke test for the three tools + confirm gate |
| `npm start` | Bridge only (open the portal URL yourself) |
| `npm run mcp` | MCP stdio server (bridge must already be up with page connected) |
| `npm run record-demo` | Re-record `docs/demo.gif` from a real run |

## License

MIT — see [LICENSE](LICENSE).

All demo names, amounts, and requests are fictional. No real company data.
