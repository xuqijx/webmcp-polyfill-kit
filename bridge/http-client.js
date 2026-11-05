const BRIDGE_BASE = process.env.WEBMCP_BRIDGE_URL || 'http://127.0.0.1:8765';

export { BRIDGE_BASE };

export async function listToolsViaHttp() {
  const res = await fetch(`${BRIDGE_BASE}/api/tools`);
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { code: data.code });
  return data.tools;
}

export async function callToolViaHttp(name, args = {}, { confirmed = false, autoConfirm = false } = {}) {
  const res = await fetch(`${BRIDGE_BASE}/api/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, args, confirmed, autoConfirm }),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw Object.assign(new Error(data.error || res.statusText), {
      code: data.code,
      requiresConfirmation: data.requiresConfirmation,
      tool: data.tool,
      args: data.args,
    });
  }
  return data.result;
}

export async function waitForPage(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BRIDGE_BASE}/api/health`);
      const data = await res.json();
      if (data.pageConnected && data.toolCount > 0) return data;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Timed out waiting for mock portal WebSocket');
}
