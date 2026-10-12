// The cowork bridge injected into every hosted artifact iframe before the
// artifact's own scripts run. It recreates `window.cowork.callMcpTool` — the API
// Claude's Cowork host normally injects — by posting each call to the parent
// (eva), which runs it through eva's read-only MCP tools and posts the result
// back, correlated by a per-call id. The artifact runs unmodified.
// It also adds `window.cowork.state`, eva's persistent per-artifact key/value
// store (see convex/artifactState.ts), so artifacts can work as small apps.
//
// Readiness handshake: the sandboxed iframe (opaque origin) and the parent's
// message listener attach on independent schedules, so a call posted before the
// parent is listening would be lost. The shim therefore queues calls and pings
// the parent with "eva-bridge-hello" until it receives "eva-bridge-ready", then
// flushes the queue. This makes delivery race-free without `allow-same-origin`.
const COWORK_SHIM = `<script>
(function () {
  // In an opaque-origin sandbox (allow-scripts, no allow-same-origin) accessing
  // localStorage/sessionStorage throws a SecurityError, which would abort any
  // artifact that touches them at top level. Provide an in-memory polyfill so
  // those artifacts run under the strict sandbox (per-session, not persisted).
  function makeStore() {
    var s = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(s, k) ? s[k] : null; },
      setItem: function (k, v) { s[k] = String(v); },
      removeItem: function (k) { delete s[k]; },
      clear: function () { s = {}; },
      key: function (i) { return Object.keys(s)[i] || null; },
      get length() { return Object.keys(s).length; },
    };
  }
  function ensureStore(name) {
    try { var t = window[name]; if (t) { t.getItem("__probe"); return; } } catch (e) { /* blocked */ }
    try { Object.defineProperty(window, name, { value: makeStore(), configurable: true }); } catch (e) { /* ignore */ }
  }
  ensureStore("localStorage");
  ensureStore("sessionStorage");

  var seq = 0, pending = {}, ready = false, queue = [];
  function send(m) { parent.postMessage(m, "*"); }
  function flush() { if (ready) return; ready = true; while (queue.length) send(queue.shift()); }
  // Sends one request to the parent and resolves with its correlated result.
  function request(fields) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      var msg = Object.assign({ source: "eva-artifact", id: id }, fields);
      if (ready) send(msg); else queue.push(msg);
    });
  }

  // Persistent state (window.cowork.state), stored by eva per artifact.
  // scope "user" (default) is private to the viewer; "shared" is one copy for
  // the whole team. The parent pushes a full snapshot on load and after every
  // change (including other viewers' writes), so get() is synchronous once
  // state.ready has resolved.
  var snapshot = { user: {}, shared: {} }, listeners = [], resolveReady;
  var stateReady = new Promise(function (r) { resolveReady = r; });
  function scopeOf(opts) { return opts && opts.scope === "shared" ? "shared" : "user"; }
  function decode(entries) {
    var out = {};
    for (var i = 0; i < entries.length; i++) {
      try { out[entries[i].key] = JSON.parse(entries[i].value); } catch (e) { /* skip */ }
    }
    return out;
  }
  function removeKey(key, opts) {
    return request({ type: "eva-state-remove", scope: scopeOf(opts), key: String(key) });
  }
  window.cowork = {
    callMcpTool: function (name, args) {
      return request({ type: "eva-mcp-call", name: String(name), args: JSON.stringify(args || {}) });
    },
    state: {
      ready: stateReady,
      get: function (key, opts) { return snapshot[scopeOf(opts)][key]; },
      all: function (opts) { return Object.assign({}, snapshot[scopeOf(opts)]); },
      set: function (key, value, opts) {
        if (value === undefined) return removeKey(key, opts);
        return request({ type: "eva-state-set", scope: scopeOf(opts), key: String(key), value: JSON.stringify(value) });
      },
      remove: removeKey,
      subscribe: function (fn) {
        listeners.push(fn);
        return function () { listeners = listeners.filter(function (l) { return l !== fn; }); };
      },
    },
  };
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "eva-bridge-ready") { flush(); return; }
    if (d.type === "eva-state-snapshot") {
      snapshot = { user: decode(d.user), shared: decode(d.shared) };
      resolveReady();
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](snapshot); } catch (err) { console.error(err); }
      }
      return;
    }
    if (d.type !== "eva-result") return;
    var entry = pending[d.id];
    if (!entry) return;
    delete pending[d.id];
    if (d.error) entry.reject(new Error(d.error));
    else entry.resolve(d.result);
  });
  var tries = 0;
  (function hello() {
    if (ready || tries++ > 40) return;
    send({ source: "eva-artifact", type: "eva-bridge-hello" });
    setTimeout(hello, 50);
  })();
})();
</script>`;

/**
 * Returns the artifact HTML with the cowork bridge injected so it is defined
 * before the artifact's scripts. Injects right after <head> (keeping the
 * doctype first, avoiding quirks mode); falls back to prepending.
 */
export function buildArtifactSrcDoc(html: string): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, `$1${COWORK_SHIM}`);
  }
  return COWORK_SHIM + html;
}
