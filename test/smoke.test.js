/**
 * Smoke test: bridge + portal + 3 tools + confirmation gate.
 */
import { listen, callTool, listTools } from '../bridge/server.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function withPortal(fn) {
  const { server, url } = await listen();
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
  // Wait for WS registration on server side
  let tools;
  for (let i = 0; i < 50; i++) {
    try {
      tools = await listTools();
      if (tools.length >= 3) break;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    await fn({ page, tools, url });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  let passed = 0;
  await withPortal(async ({ tools }) => {
    const names = tools.map((t) => t.name);
    assert(names.includes('list_pending_approvals'), 'missing list_pending_approvals');
    assert(names.includes('get_request_detail'), 'missing get_request_detail');
    assert(names.includes('approve_request'), 'missing approve_request');
    const approveMeta = tools.find((t) => t.name === 'approve_request');
    assert(approveMeta.requiresConfirmation === true, 'approve must require confirmation');
    passed++;
    console.log('PASS tools registered with confirmation metadata');

    const listed = await callTool('list_pending_approvals', {});
    assert(listed.count >= 1, 'expected pending requests');
    assert(Array.isArray(listed.requests), 'requests array');
    passed++;
    console.log('PASS list_pending_approvals', listed.count);

    const id = listed.requests[0].id;
    const detail = await callTool('get_request_detail', { id });
    assert(detail.found === true, 'detail found');
    assert(detail.request.id === id, 'id match');
    passed++;
    console.log('PASS get_request_detail', id);

    let gated = false;
    try {
      await callTool('approve_request', { id, comment: 'smoke' });
    } catch (err) {
      gated = err.code === 'CONFIRMATION_REQUIRED';
    }
    assert(gated, 'approve without confirm must fail');
    passed++;
    console.log('PASS approve_request confirmation gate');

    const result = await callTool(
      'approve_request',
      { id, comment: 'smoke approve' },
      { autoConfirm: true }
    );
    assert(result.ok === true, 'approve ok');
    assert(result.status === 'approved', 'status approved');
    passed++;
    console.log('PASS approve_request after confirm', result.status);

    const detail2 = await callTool('get_request_detail', { id });
    assert(detail2.request.status === 'approved', 'persisted status');
    passed++;
    console.log('PASS status persisted on page');
  });

  console.log(`\nSmoke OK — ${passed} assertions passed`);
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
