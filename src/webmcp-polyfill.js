/**
 * WebMCP Polyfill Kit — document.modelContext / navigator.modelContext shim.
 *
 * If a native WebMCP implementation is present, this module delegates to it.
 * Otherwise it exposes a compatible registerTool / listTools / callTool surface.
 *
 * Not affiliated with Google or Chrome. Experimental API shaped for demos.
 */
(function (global) {
  'use strict';

  const NATIVE =
    (global.navigator && global.navigator.modelContext) ||
    (global.document && global.document.modelContext) ||
    null;

  if (NATIVE && typeof NATIVE.registerTool === 'function') {
    // Native path: expose a thin wrapper that still emits local events for the demo bridge.
    const wrap = {
      mode: 'native',
      native: NATIVE,
      registerTool(def) {
        const result = NATIVE.registerTool(def);
        global.dispatchEvent(
          new CustomEvent('webmcp:tool-registered', { detail: { name: def.name } })
        );
        return result;
      },
      async listTools() {
        if (typeof NATIVE.listTools === 'function') return NATIVE.listTools();
        if (Array.isArray(NATIVE.tools)) return NATIVE.tools.slice();
        return [];
      },
      async callTool(name, args) {
        if (typeof NATIVE.callTool === 'function') return NATIVE.callTool(name, args);
        throw new Error('Native modelContext has no callTool; use the agent host.');
      },
    };
    global.WebMCP = wrap;
    if (!global.document.modelContext) global.document.modelContext = wrap;
    if (global.navigator && !global.navigator.modelContext) {
      try {
        Object.defineProperty(global.navigator, 'modelContext', {
          value: wrap,
          configurable: true,
        });
      } catch (_) {
        /* ignore */
      }
    }
    return;
  }

  /** @type {Map<string, object>} */
  const tools = new Map();

  function validateInput(schema, input) {
    if (!schema || typeof schema !== 'object') return;
    const props = schema.properties || {};
    const required = schema.required || [];
    for (const key of required) {
      if (input == null || input[key] === undefined || input[key] === null || input[key] === '') {
        throw new Error(`Missing required argument: ${key}`);
      }
    }
    if (input && typeof input === 'object') {
      for (const [key, val] of Object.entries(input)) {
        const prop = props[key];
        if (!prop) continue;
        if (prop.type === 'string' && typeof val !== 'string') {
          throw new Error(`Argument ${key} must be a string`);
        }
        if (prop.type === 'number' && typeof val !== 'number') {
          throw new Error(`Argument ${key} must be a number`);
        }
        if (prop.type === 'boolean' && typeof val !== 'boolean') {
          throw new Error(`Argument ${key} must be a boolean`);
        }
      }
    }
  }

  const polyfill = {
    mode: 'polyfill',
    /**
     * @param {{
     *   name: string,
     *   description?: string,
     *   inputSchema?: object,
     *   execute: (input: object) => Promise<unknown> | unknown,
     *   requiresConfirmation?: boolean,
     *   annotations?: object
     * }} def
     */
    registerTool(def) {
      if (!def || typeof def.name !== 'string' || !def.name) {
        throw new Error('registerTool requires a non-empty name');
      }
      if (typeof def.execute !== 'function') {
        throw new Error(`Tool ${def.name}: execute must be a function`);
      }
      const entry = {
        name: def.name,
        description: def.description || '',
        inputSchema: def.inputSchema || { type: 'object', properties: {} },
        execute: def.execute,
        requiresConfirmation: Boolean(
          def.requiresConfirmation ||
            (def.annotations && def.annotations.requiresConfirmation)
        ),
        annotations: def.annotations || {},
      };
      tools.set(entry.name, entry);
      global.dispatchEvent(
        new CustomEvent('webmcp:tool-registered', { detail: { name: entry.name } })
      );
      return { ok: true, name: entry.name };
    },

    listTools() {
      return Array.from(tools.values()).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        requiresConfirmation: t.requiresConfirmation,
        annotations: t.annotations,
      }));
    },

    /**
     * Call a registered tool. Destructive tools still execute here; the bridge
     * / agent host is responsible for prompting the user when requiresConfirmation
     * is true before invoking callTool.
     */
    async callTool(name, args = {}, options = {}) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Unknown tool: ${name}`);
      if (tool.requiresConfirmation && !options.confirmed) {
        const err = new Error(
          `Tool "${name}" requiresConfirmation. Pass { confirmed: true } after user approval.`
        );
        err.code = 'CONFIRMATION_REQUIRED';
        err.tool = name;
        throw err;
      }
      validateInput(tool.inputSchema, args);
      const result = await tool.execute(args || {});
      global.dispatchEvent(
        new CustomEvent('webmcp:tool-called', {
          detail: { name, args, result },
        })
      );
      return result;
    },

    clearTools() {
      tools.clear();
    },
  };

  global.WebMCP = polyfill;
  if (global.document) {
    try {
      Object.defineProperty(global.document, 'modelContext', {
        value: polyfill,
        configurable: true,
        writable: true,
      });
    } catch (_) {
      global.document.modelContext = polyfill;
    }
  }
  if (global.navigator) {
    try {
      Object.defineProperty(global.navigator, 'modelContext', {
        value: polyfill,
        configurable: true,
      });
    } catch (_) {
      /* ignore */
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
