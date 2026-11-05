# Quick start (3 commands)

From this directory (`mvp/`):

```bash
cd /path/to/webmcp-polyfill-kit/mvp
npm install
npm run demo
```

That starts the local bridge, opens the **Acme Approvals** mock portal in headless Chrome, lists tools, calls `list_pending_approvals` and `get_request_detail`, then demonstrates the `approve_request` confirmation gate.

Keep the server up for manual browsing:

```bash
DEMO_KEEP=1 npm run demo
```

Then open http://127.0.0.1:8765/examples/acme-approvals/

Optional MCP stdio (Cursor / Claude Desktop) while the demo server is running:

```bash
npm run mcp
```

Smoke test:

```bash
npm test
```
