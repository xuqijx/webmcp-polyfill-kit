/**
 * Minimal MCP stdio server that relays list/call to the local HTTP bridge.
 * Point Cursor / Claude Desktop at: node bridge/mcp-stdio.js
 * Requires `npm run demo` or `npm start` (and the portal page loaded) first.
 */
import { listToolsViaHttp, callToolViaHttp, BRIDGE_BASE } from './http-client.js';

function writeMessage(msg) {
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
  process.stdout.write(Buffer.concat([header, body]));
}

let buffer = Buffer.alloc(0);

function processBuffer() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd).toString('utf8');
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const len = Number(match[1]);
    const total = headerEnd + 4 + len;
    if (buffer.length < total) return;
    const body = buffer.slice(headerEnd + 4, total).toString('utf8');
    buffer = buffer.slice(total);
    handleMessage(JSON.parse(body)).catch((err) => {
      console.error('[mcp-stdio]', err);
    });
  }
}

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    writeMessage({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'webmcp-polyfill-kit', version: '0.1.0' },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized' || msg.method === 'initialized') {
    return;
  }
  if (msg.method === 'tools/list') {
    try {
      const tools = await listToolsViaHttp();
      writeMessage({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          tools: tools.map((t) => ({
            name: t.name,
            description:
              t.description +
              (t.requiresConfirmation ? ' [requiresConfirmation]' : ''),
            inputSchema: t.inputSchema || { type: 'object', properties: {} },
          })),
        },
      });
    } catch (err) {
      writeMessage({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32000, message: err.message + ` (is bridge up at ${BRIDGE_BASE}?)` },
      });
    }
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params?.name;
    const args = msg.params?.arguments || {};
    try {
      // Destructive tools: first attempt without confirm → surface message; MCP hosts
      // that support elicitation can re-call. For this MVP we auto-confirm after noting.
      let result;
      try {
        result = await callToolViaHttp(name, args, { confirmed: false });
      } catch (err) {
        if (err.code === 'CONFIRMATION_REQUIRED') {
          result = await callToolViaHttp(name, args, { confirmed: true, autoConfirm: true });
          result = {
            confirmation: 'auto-confirmed by mcp-stdio after requiresConfirmation gate',
            ...result,
          };
        } else {
          throw err;
        }
      }
      writeMessage({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        },
      });
    } catch (err) {
      writeMessage({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32000, message: err.message },
      });
    }
    return;
  }
  if (msg.id !== undefined) {
    writeMessage({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: `Method not found: ${msg.method}` },
    });
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  processBuffer();
});

console.error(`[mcp-stdio] webmcp-polyfill-kit ready (bridge ${BRIDGE_BASE})`);
