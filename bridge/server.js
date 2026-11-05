/**
 * Local demo server: static files + WebSocket bridge + HTTP tool relay.
 *
 * Simplest working path (documented in README):
 * 1. Page loads polyfill, registers tools, opens ws://host/bridge
 * 2. Agents / demo scripts call HTTP JSON:
 *      GET  /api/tools
 *      POST /api/call  { name, args, confirmed? }
 * 3. Server forwards over WebSocket to the page and returns the result.
 *
 * For Cursor / Claude Desktop, also run `npm run mcp` (stdio MCP).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8765);
const HOST = process.env.HOST || '127.0.0.1';

/** @type {import('ws').WebSocket | null} */
let pageSocket = null;
/** @type {Map<string, {resolve: Function, reject: Function, timer: NodeJS.Timeout}>} */
const pending = new Map();
/** @type {object[] | null} */
let cachedTools = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, body) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  const cleaned = decoded.replace(/\0/g, '');
  const joined = path.normalize(path.join(root, cleaned));
  if (!joined.startsWith(root)) return null;
  return joined;
}

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '') {
    res.writeHead(302, { Location: '/examples/acme-approvals/' });
    res.end();
    return;
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const filePath = safeJoin(ROOT, urlPath);
  if (!filePath) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function callPage(message, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!pageSocket || pageSocket.readyState !== 1) {
      reject(Object.assign(new Error('Mock portal is not connected. Open the demo page.'), { code: 'NO_PAGE' }));
      return;
    }
    const id = randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Object.assign(new Error('Timed out waiting for page tool response'), { code: 'TIMEOUT' }));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    pageSocket.send(JSON.stringify({ ...message, id }));
  });
}

export async function listTools() {
  if (pageSocket && pageSocket.readyState === 1) {
    try {
      const res = await callPage({ type: 'list_tools' });
      if (res.tools) {
        cachedTools = res.tools;
        return res.tools;
      }
    } catch {
      /* fall through to cache */
    }
  }
  if (cachedTools) return cachedTools;
  throw Object.assign(new Error('No tools available — open http://127.0.0.1:' + PORT + '/examples/acme-approvals/'), {
    code: 'NO_TOOLS',
  });
}

export async function callTool(name, args = {}, { confirmed = false, autoConfirm = false } = {}) {
  const tools = await listTools();
  const meta = tools.find((t) => t.name === name);
  if (!meta) {
    throw Object.assign(new Error(`Unknown tool: ${name}`), { code: 'UNKNOWN_TOOL' });
  }

  let didConfirm = confirmed;
  if (meta.requiresConfirmation && !confirmed) {
    if (autoConfirm) {
      // Demo / smoke mode: print the confirmation gate, then proceed.
      console.log('');
      console.log('╔══════════════════════════════════════════════════════════╗');
      console.log('║  CONFIRMATION REQUIRED                                   ║');
      console.log(`║  Tool: ${name.padEnd(48)}║`);
      console.log(`║  Args: ${JSON.stringify(args).slice(0, 48).padEnd(48)}║`);
      console.log('║  (auto-confirm enabled for local demo / smoke tests)     ║');
      console.log('╚══════════════════════════════════════════════════════════╝');
      console.log('');
      didConfirm = true;
    } else {
      const err = Object.assign(
        new Error(
          `Tool "${name}" requiresConfirmation. Re-call with { "confirmed": true } after the user approves.`
        ),
        {
          code: 'CONFIRMATION_REQUIRED',
          tool: name,
          args,
          requiresConfirmation: true,
        }
      );
      throw err;
    }
  }

  const res = await callPage({
    type: 'call_tool',
    name,
    args,
    confirmed: didConfirm,
  });
  if (!res.ok) {
    const err = Object.assign(new Error(res.error || 'Tool call failed'), {
      code: res.code || 'TOOL_ERROR',
    });
    throw err;
  }
  return res.result;
}

async function handleApi(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.url.startsWith('/api/health')) {
    sendJson(res, 200, {
      ok: true,
      pageConnected: Boolean(pageSocket && pageSocket.readyState === 1),
      toolCount: cachedTools ? cachedTools.length : 0,
      portal: `http://${HOST}:${PORT}/examples/acme-approvals/`,
    });
    return;
  }

  if (req.url.startsWith('/api/tools') && req.method === 'GET') {
    try {
      const tools = await listTools();
      sendJson(res, 200, { tools });
    } catch (err) {
      sendJson(res, 503, { error: err.message, code: err.code });
    }
    return;
  }

  if (req.url.startsWith('/api/call') && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const result = await callTool(body.name, body.args || {}, {
        confirmed: Boolean(body.confirmed),
        autoConfirm: Boolean(body.autoConfirm),
      });
      sendJson(res, 200, { ok: true, result });
    } catch (err) {
      const status = err.code === 'CONFIRMATION_REQUIRED' ? 409 : err.code === 'NO_PAGE' ? 503 : 400;
      sendJson(res, status, {
        ok: false,
        error: err.message,
        code: err.code,
        requiresConfirmation: err.requiresConfirmation || false,
        tool: err.tool,
        args: err.args,
      });
    }
    return;
  }

  sendJson(res, 404, { error: 'Unknown API route' });
}

export function createServer() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      handleApi(req, res).catch((err) => {
        sendJson(res, 500, { error: err.message });
      });
      return;
    }
    serveStatic(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/bridge' || req.url?.startsWith('/bridge?')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    pageSocket = ws;
    console.log('[bridge] page connected');
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type === 'hello') {
        console.log('[bridge] hello from', msg.page || 'page');
        return;
      }
      if (msg.type === 'tools') {
        cachedTools = msg.tools || [];
        console.log(`[bridge] tools cached: ${cachedTools.map((t) => t.name).join(', ')}`);
        if (msg.id && pending.has(msg.id)) {
          const p = pending.get(msg.id);
          clearTimeout(p.timer);
          pending.delete(msg.id);
          p.resolve(msg);
        }
        return;
      }
      if (msg.type === 'call_result' && msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        clearTimeout(p.timer);
        pending.delete(msg.id);
        p.resolve(msg);
      }
    });
    ws.on('close', () => {
      if (pageSocket === ws) pageSocket = null;
      console.log('[bridge] page disconnected');
    });
  });

  return server;
}

export function listen(server = createServer()) {
  return new Promise((resolve) => {
    server.listen(PORT, HOST, () => {
      const url = `http://${HOST}:${PORT}/examples/acme-approvals/`;
      console.log(`[bridge] serving ${url}`);
      resolve({ server, port: PORT, host: HOST, url });
    });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  listen();
}
