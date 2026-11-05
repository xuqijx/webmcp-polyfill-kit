/**
 * npm run demo — start bridge, open mock portal (headless Chrome), exercise tools.
 */
import { listen, callTool, listTools } from '../bridge/server.js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function loadPage(url) {
  // Prefer Playwright if installed (devDependency); else fall back to system Chrome.
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => window.WebMCP && window.WebMCP.listTools().length >= 3,
      { timeout: 15000 }
    );
    return { browser, page, kind: 'playwright' };
  } catch (err) {
    console.warn('[demo] Playwright unavailable (%s); trying system Chrome', err.message);
    const chrome =
      process.env.CHROME_PATH ||
      '/usr/bin/google-chrome' ||
      '/usr/bin/google-chrome-stable';
    const child = spawn(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        url,
      ],
      { stdio: 'ignore', detached: true }
    );
    child.unref();
    return {
      browser: null,
      page: null,
      kind: 'chrome',
      kill: () => {
        try {
          process.kill(-child.pid);
        } catch {
          try {
            child.kill();
          } catch {
            /* ignore */
          }
        }
      },
    };
  }
}

async function waitForTools(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tools = await listTools();
      if (tools.length >= 3) return tools;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Portal tools never registered');
}

function banner(title) {
  console.log('\n── ' + title + ' ' + '─'.repeat(Math.max(0, 50 - title.length)));
}

async function main() {
  const { server, url } = await listen();
  console.log('[demo] opening', url);

  const session = await loadPage(url);
  const tools = await waitForTools();
  banner('Tools registered');
  for (const t of tools) {
    console.log(
      `  • ${t.name}${t.requiresConfirmation ? '  [requiresConfirmation]' : ''}`
    );
  }

  banner('1) list_pending_approvals');
  const listed = await callTool('list_pending_approvals', {});
  console.log(JSON.stringify(listed, null, 2));

  const firstId = listed.requests?.[0]?.id || 'REQ-1001';

  banner(`2) get_request_detail(${firstId})`);
  const detail = await callTool('get_request_detail', { id: firstId });
  console.log(JSON.stringify(detail, null, 2));

  banner(`3) approve_request(${firstId}) — confirmation gate`);
  try {
    await callTool('approve_request', {
      id: firstId,
      comment: 'Looks good — demo approve',
    });
    console.error('ERROR: expected CONFIRMATION_REQUIRED');
    process.exitCode = 1;
  } catch (err) {
    if (err.code !== 'CONFIRMATION_REQUIRED') throw err;
    console.log('Gate OK:', err.message);
  }

  banner(`3b) approve_request with autoConfirm`);
  const approved = await callTool(
    'approve_request',
    { id: firstId, comment: 'Looks good — demo approve' },
    { autoConfirm: true }
  );
  console.log(JSON.stringify(approved, null, 2));

  banner('Demo complete');
  console.log('Portal:', url);
  console.log('API:    GET /api/tools  POST /api/call');
  console.log('MCP:    npm run mcp   (stdio; keep this demo running)');
  console.log('');

  const keepAlive = process.argv.includes('--keep') || process.env.DEMO_KEEP === '1';
  if (keepAlive) {
    console.log('[demo] --keep: server stays up (Ctrl+C to stop)');
    process.on('SIGINT', () => {
      if (session.browser) session.browser.close().catch(() => {});
      if (session.kill) session.kill();
      server.close();
      process.exit(0);
    });
    return;
  }

  // Default: prove tools, then exit so `npm run demo` is a finite verification command.
  if (session.browser) await session.browser.close();
  if (session.kill) session.kill();
  server.close();
  console.log('[demo] all checks passed');
}

main().catch((err) => {
  console.error('[demo] FAILED', err);
  process.exit(1);
});
