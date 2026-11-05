/**
 * Acme Approvals — registers WebMCP tools against in-page fake data.
 * All data is fictional. No real company records.
 */
(function () {
  'use strict';

  const state = {
    requests: [],
    workOrders: [],
    activity: [],
  };

  function log(msg, kind) {
    state.activity.unshift({
      at: new Date().toISOString(),
      msg: String(msg),
      kind: kind || 'info',
    });
    render();
  }

  function render() {
    const tbody = document.getElementById('request-rows');
    const detail = document.getElementById('detail-panel');
    const activity = document.getElementById('activity-log');
    const modeEl = document.getElementById('mode-badge');
    const toolsEl = document.getElementById('tool-list');
    if (!tbody) return;

    if (modeEl && window.WebMCP) {
      modeEl.textContent = window.WebMCP.mode === 'native' ? 'native' : 'polyfill';
      modeEl.className = 'badge ' + (window.WebMCP.mode === 'native' ? 'badge-native' : 'badge-polyfill');
    }

    if (toolsEl && window.WebMCP) {
      const tools = window.WebMCP.listTools();
      toolsEl.innerHTML = tools
        .map(
          (t) =>
            `<li><code>${t.name}</code>${
              t.requiresConfirmation
                ? ' <span class="warn" title="requiresConfirmation">confirm</span>'
                : ''
            }</li>`
        )
        .join('');
    }

    tbody.innerHTML = state.requests
      .map((r) => {
        const cls = r.status === 'pending' ? 'status-pending' : r.status === 'approved' ? 'status-ok' : 'status-no';
        return `<tr data-id="${r.id}">
          <td><button type="button" class="linkish" data-open="${r.id}">${r.id}</button></td>
          <td>${escapeHtml(r.title)}</td>
          <td>${escapeHtml(r.requester)}</td>
          <td>${r.currency} ${Number(r.amount).toFixed(2)}</td>
          <td><span class="pill ${cls}">${r.status}</span></td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('[data-open]').forEach((btn) => {
      btn.addEventListener('click', () => showDetail(btn.getAttribute('data-open')));
    });

    if (activity) {
      activity.innerHTML = state.activity
        .slice(0, 12)
        .map((a) => `<li class="${a.kind}"><time>${a.at.slice(11, 19)}</time> ${escapeHtml(a.msg)}</li>`)
        .join('');
    }

    if (detail && !detail.dataset.locked) {
      /* leave existing detail until user picks one */
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showDetail(id) {
    const r = state.requests.find((x) => x.id === id);
    const detail = document.getElementById('detail-panel');
    if (!detail || !r) return;
    detail.dataset.locked = '1';
    detail.innerHTML = `
      <h2>${escapeHtml(r.id)} — ${escapeHtml(r.title)}</h2>
      <dl>
        <dt>Requester</dt><dd>${escapeHtml(r.requester)} (${escapeHtml(r.department)})</dd>
        <dt>Amount</dt><dd>${r.currency} ${Number(r.amount).toFixed(2)}</dd>
        <dt>Status</dt><dd><span class="pill status-${r.status === 'pending' ? 'pending' : r.status === 'approved' ? 'ok' : 'no'}">${r.status}</span></dd>
        <dt>Submitted</dt><dd>${escapeHtml(r.submittedAt)}</dd>
        <dt>Summary</dt><dd>${escapeHtml(r.summary)}</dd>
        ${r.decisionComment ? `<dt>Decision note</dt><dd>${escapeHtml(r.decisionComment)}</dd>` : ''}
      </dl>
      <h3>Line items</h3>
      <ul>${(r.lineItems || [])
        .map(
          (li) =>
            `<li>${escapeHtml(li.sku)} — ${escapeHtml(li.desc)} × ${li.qty} @ ${Number(li.unitPrice).toFixed(2)}</li>`
        )
        .join('')}</ul>`;
  }

  async function loadData() {
    const res = await fetch('./fake-data.json');
    const data = await res.json();
    state.requests = data.requests.slice();
    state.workOrders = (data.workOrders || []).slice();
    log('Loaded Acme Approvals fake dataset', 'info');
    render();
  }

  function registerTools() {
    const ctx = window.document.modelContext || window.WebMCP;
    if (!ctx || typeof ctx.registerTool !== 'function') {
      throw new Error('WebMCP polyfill not loaded');
    }

    ctx.registerTool({
      name: 'list_pending_approvals',
      description: 'List pending approval requests on the Acme Approvals portal.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      execute() {
        const pending = state.requests
          .filter((r) => r.status === 'pending')
          .map((r) => ({
            id: r.id,
            title: r.title,
            requester: r.requester,
            department: r.department,
            amount: r.amount,
            currency: r.currency,
            submittedAt: r.submittedAt,
          }));
        log(`list_pending_approvals → ${pending.length} item(s)`, 'tool');
        return { count: pending.length, requests: pending };
      },
    });

    ctx.registerTool({
      name: 'get_request_detail',
      description: 'Get full detail for one approval request by id (e.g. REQ-1001).',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Request id such as REQ-1001' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      execute({ id }) {
        const r = state.requests.find((x) => x.id === id);
        if (!r) {
          log(`get_request_detail(${id}) → not found`, 'error');
          return { found: false, id };
        }
        showDetail(id);
        log(`get_request_detail(${id}) → ${r.status}`, 'tool');
        return { found: true, request: { ...r } };
      },
    });

    ctx.registerTool({
      name: 'approve_request',
      description:
        'Approve a pending request. Destructive — requiresConfirmation must be granted by the user before the bridge calls this tool.',
      requiresConfirmation: true,
      annotations: { requiresConfirmation: true, destructiveHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Request id' },
          comment: { type: 'string', description: 'Decision comment' },
        },
        required: ['id', 'comment'],
        additionalProperties: false,
      },
      execute({ id, comment }) {
        const r = state.requests.find((x) => x.id === id);
        if (!r) {
          log(`approve_request(${id}) → not found`, 'error');
          return { ok: false, error: 'not_found', id };
        }
        if (r.status !== 'pending') {
          log(`approve_request(${id}) → already ${r.status}`, 'error');
          return { ok: false, error: 'not_pending', id, status: r.status };
        }
        r.status = 'approved';
        r.decidedAt = new Date().toISOString();
        r.decisionComment = comment;
        showDetail(id);
        log(`approve_request(${id}) APPROVED — "${comment}"`, 'ok');
        render();
        return {
          ok: true,
          id,
          status: r.status,
          decidedAt: r.decidedAt,
          comment,
        };
      },
    });

    ctx.registerTool({
      name: 'reject_request',
      description:
        'Reject a pending request. Destructive — requiresConfirmation must be granted by the user.',
      requiresConfirmation: true,
      annotations: { requiresConfirmation: true, destructiveHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          comment: { type: 'string' },
        },
        required: ['id', 'comment'],
        additionalProperties: false,
      },
      execute({ id, comment }) {
        const r = state.requests.find((x) => x.id === id);
        if (!r) return { ok: false, error: 'not_found', id };
        if (r.status !== 'pending') {
          return { ok: false, error: 'not_pending', id, status: r.status };
        }
        r.status = 'rejected';
        r.decidedAt = new Date().toISOString();
        r.decisionComment = comment;
        showDetail(id);
        log(`reject_request(${id}) REJECTED — "${comment}"`, 'error');
        render();
        return { ok: true, id, status: r.status, decidedAt: r.decidedAt, comment };
      },
    });

    log('Registered 4 tools on document.modelContext', 'info');
    render();
  }

  /** WebSocket bridge so the local MCP relay can list/call page tools. */
  function connectBridge() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/bridge`;
    let ws;
    let retries = 0;

    function open() {
      ws = new WebSocket(url);
      ws.addEventListener('open', () => {
        retries = 0;
        log('Bridge WebSocket connected', 'info');
        ws.send(JSON.stringify({ type: 'hello', page: 'acme-approvals' }));
        const tools = (window.WebMCP || document.modelContext).listTools();
        ws.send(JSON.stringify({ type: 'tools', tools }));
      });
      ws.addEventListener('message', async (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'list_tools') {
          const tools = (window.WebMCP || document.modelContext).listTools();
          ws.send(JSON.stringify({ type: 'tools', tools, id: msg.id }));
          return;
        }
        if (msg.type === 'call_tool') {
          const ctx = window.WebMCP || document.modelContext;
          try {
            const result = await ctx.callTool(msg.name, msg.args || {}, {
              confirmed: Boolean(msg.confirmed),
            });
            ws.send(
              JSON.stringify({
                type: 'call_result',
                id: msg.id,
                ok: true,
                result,
              })
            );
          } catch (err) {
            ws.send(
              JSON.stringify({
                type: 'call_result',
                id: msg.id,
                ok: false,
                error: err.message,
                code: err.code || 'ERROR',
              })
            );
          }
        }
      });
      ws.addEventListener('close', () => {
        log('Bridge disconnected; retrying…', 'error');
        retries += 1;
        const delay = Math.min(5000, 400 * retries);
        setTimeout(open, delay);
      });
      ws.addEventListener('error', () => {
        /* close handler retries */
      });
    }
    open();
  }

  window.AcmeApprovals = {
    getState: () => state,
    showDetail,
    render,
  };

  document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    registerTools();
    connectBridge();
  });
})();
