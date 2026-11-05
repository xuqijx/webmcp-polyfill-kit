/**
 * Record a real demo run → docs/demo.gif via Playwright screenshots + ffmpeg.
 */
import { listen, callTool, listTools } from '../bridge/server.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FRAMES = path.join(ROOT, 'docs', '_frames');
const OUT_GIF = path.join(ROOT, 'docs', 'demo.gif');
const OUT_MP4 = path.join(ROOT, 'docs', '_demo.mp4');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function main() {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  const { server, url } = await listen();
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => window.WebMCP && window.WebMCP.listTools().length >= 3,
    { timeout: 15000 }
  );

  for (let i = 0; i < 40; i++) {
    try {
      const tools = await listTools();
      if (tools.length >= 3) break;
    } catch {
      /* retry */
    }
    await sleep(100);
  }

  let n = 0;
  const shot = async (label) => {
    n += 1;
    const file = path.join(FRAMES, `frame-${String(n).padStart(3, '0')}.png`);
    await page.screenshot({ path: file, type: 'png' });
    console.log('frame', n, label);
    // Duplicate frames so the GIF holds on key moments (~0.6s at 5fps)
    for (let d = 0; d < 2; d++) {
      n += 1;
      fs.copyFileSync(file, path.join(FRAMES, `frame-${String(n).padStart(3, '0')}.png`));
    }
  };

  await shot('loaded');
  await sleep(400);

  const listed = await callTool('list_pending_approvals', {});
  await sleep(500);
  await shot('listed');

  const id = listed.requests[0].id;
  await callTool('get_request_detail', { id });
  await sleep(500);
  await shot('detail');

  let gated = false;
  try {
    await callTool('approve_request', { id, comment: 'GIF demo approve' });
  } catch (err) {
    gated = err.code === 'CONFIRMATION_REQUIRED';
  }
  if (!gated) throw new Error('expected confirmation gate');
  // Overlay a confirm banner in-page for the GIF so the gate is visible
  await page.evaluate((toolId) => {
    const el = document.createElement('div');
    el.id = 'confirm-overlay';
    el.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;';
    el.innerHTML = `<div style="background:#1a2332;border:2px solid #c9a227;border-radius:12px;padding:1.25rem 1.5rem;max-width:420px;color:#e7ecf3;font-family:system-ui">
      <div style="color:#c9a227;font-weight:700;margin-bottom:.5rem">CONFIRMATION REQUIRED</div>
      <div>Approve <code>${toolId}</code>?</div>
      <div style="margin-top:.75rem;color:#8b9bb4;font-size:.85rem">requiresConfirmation: true — waiting for user / autoConfirm…</div>
    </div>`;
    document.body.appendChild(el);
  }, id);
  await sleep(300);
  await shot('confirm-gate');

  await page.evaluate(() => document.getElementById('confirm-overlay')?.remove());
  await callTool(
    'approve_request',
    { id, comment: 'GIF demo approve' },
    { autoConfirm: true }
  );
  await sleep(600);
  await shot('approved');

  await browser.close();
  await new Promise((r) => server.close(r));

  // Build GIF with ffmpeg (palette for smaller size)
  const palette = path.join(FRAMES, 'palette.png');
  await run('ffmpeg', [
    '-y',
    '-framerate',
    '5',
    '-i',
    path.join(FRAMES, 'frame-%03d.png'),
    '-vf',
    'scale=900:-1:flags=lanczos,palettegen=max_colors=128',
    palette,
  ]);
  await run('ffmpeg', [
    '-y',
    '-framerate',
    '5',
    '-i',
    path.join(FRAMES, 'frame-%03d.png'),
    '-i',
    palette,
    '-lavfi',
    'scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer',
    OUT_GIF,
  ]);

  const size = fs.statSync(OUT_GIF).size;
  console.log(`Wrote ${OUT_GIF} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  if (size > 5 * 1024 * 1024) {
    console.warn('GIF exceeds 5 MB — consider fewer frames');
  }
  fs.rmSync(FRAMES, { recursive: true, force: true });
  if (fs.existsSync(OUT_MP4)) fs.unlinkSync(OUT_MP4);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
