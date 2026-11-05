**言語：** [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md)

# WebMCP Polyfill Kit

レガシーな Web ページを Agent から呼べるツールにする。

古い承認 / 作業指示ポータルに、呼び出し可能なツールを登録するドロップイン polyfill です。ポータルの改修も、スクリーンショット操作も不要です。

> **Google / Chrome とは無関係です。** Chrome の実験的 WebMCP（`document.modelContext` / `navigator.modelContext`）に近い形を、ローカルデモ用に実装しています。ネイティブ API は今後変わり得ます。

## 動作

| モード | 挙動 |
|------|------|
| **Native** | `registerTool` 付きの `modelContext` が既にあればそれに委譲 |
| **Polyfill** | なければ shim（`registerTool` / `listTools` / `callTool`）を入れる |

小さな **Node ブリッジ** がモックポータルを配信し、ページと WebSocket で接続し、次を公開します。

- HTTP JSON: `GET /api/tools`, `POST /api/call`
- 任意の MCP stdio: `npm run mcp`（Cursor / Claude Desktop 向け）

## 3 ステップで起動

```bash
cd mvp
npm install
npm run demo
```

`npm run demo` はブリッジを起動し、ヘッドレス Chrome で **Acme Approvals**（架空データ）を開き、ツール一覧と 3 つのコアツール呼び出し、承認時の確認ゲートを実行します。

手動 UI: `DEMO_KEEP=1 npm run demo` のあと http://127.0.0.1:8765/examples/acme-approvals/ を開く。

## ツール（Acme Approvals デモ）

| ツール | 確認 | 説明 |
|------|------|------|
| `list_pending_approvals` | 不要 | 未承認一覧 |
| `get_request_detail` | 不要 | ID で詳細取得 |
| `approve_request` | **必要** | 承認（破壊的） |
| `reject_request` | **必要** | 却下（4 つ目の任意ツール） |

破壊的ツールは `requiresConfirmation: true` です。クライアントが `confirmed: true`（またはローカルデモ用の `autoConfirm`）を渡すまでブリッジは拒否します。

## ツール登録例

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

## 安全について

承認 / 却下 / 削除などの書き込み操作には必ず `requiresConfirmation` を付けてください。`{ confirmed: true }` が無いと `CONFIRMATION_REQUIRED` を投げます。本番 Agent で黙って自動承認しないでください。

## スクリプト

| コマンド | 用途 |
|---------|------|
| `npm run demo` | ローカル E2E デモ |
| `npm test` | 3 ツール + 確認ゲートのスモーク |
| `npm start` | ブリッジのみ |
| `npm run mcp` | MCP stdio |
| `npm run record-demo` | 実ランから `docs/demo.gif` を再録画 |

## ライセンス

MIT — [LICENSE](LICENSE) を参照。

デモの名称・金額・申請はすべて架空です。実在の企業データは含みません。
