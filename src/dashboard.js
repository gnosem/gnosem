// Gnosem dashboard — a minimal, no-framework, no-server-session page for logged-in users.
//
// Auth model: the browser holds the Bearer token in localStorage. On first visit, the token can
// arrive via ?key=… (e.g. from the /upgraded post-checkout redirect) — we consume it, save to
// localStorage, and scrub it from the URL. Otherwise a paste prompt renders.
//
// Every fetch from this page hits the same authenticated endpoints (/me, /mcp, /keys/rotate)
// with Authorization: Bearer <key>. Nothing sensitive is server-rendered — the shell is public.

import { NEWSREADER_LINK, MARK_SVG } from "./brand.js";

export function dashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Dashboard — Gnosem</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${NEWSREADER_LINK}
<style>
:root{--ink:#15140F;--paper:#FAF9F7;--terracotta:#A2603F;--ink-soft:#3a3833;--rule:rgba(21,20,15,.14)}
*{box-sizing:border-box}
body{font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;max-width:800px;margin:44px auto;padding:0 20px;color:var(--ink);background:var(--paper)}
a{color:var(--terracotta)}
h1{font-family:"Newsreader",Georgia,serif;font-size:30px;margin:0 0 4px;font-weight:500;letter-spacing:-.01em}
h2{font-family:"Newsreader",Georgia,serif;font-size:20px;margin:32px 0 10px;font-weight:600}
.mast{display:flex;align-items:center;gap:10px;margin-bottom:28px;text-decoration:none;color:var(--ink)}
.mast img{width:32px;height:32px}
.mast .n{font-family:"Newsreader",Georgia,serif;font-size:20px;font-weight:600;letter-spacing:.14em}
.card{background:#fff;border:1px solid var(--rule);border-radius:6px;padding:18px 20px;margin:0 0 14px}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:16px}
.row + .row{margin-top:10px}
.k{color:var(--ink-soft);font-size:13.5px;letter-spacing:.02em}
.v{font-weight:600;font-variant-numeric:tabular-nums}
.plan{display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:.14em;background:var(--ink);color:var(--paper);padding:3px 10px;border-radius:2px}
.plan.free{background:var(--ink-soft)}
.plan.pro{background:var(--terracotta)}
.bar{height:8px;background:#ece5d7;border-radius:4px;overflow:hidden;margin-top:6px}
.bar>i{display:block;height:100%;background:var(--terracotta)}
.mem{border-top:1px solid var(--rule);padding:14px 0}
.mem:first-child{border-top:none;padding-top:0}
.mem .meta{font-size:12.5px;color:var(--ink-soft);letter-spacing:.02em;margin-bottom:4px}
.mem .content{margin:0}
.mem .tags{margin-top:6px;font-size:12px;color:var(--ink-soft)}
.mem .tags span{display:inline-block;background:#ece5d7;border-radius:2px;padding:1px 7px;margin-right:4px}
.mem .actions{margin-top:8px}
.btn{font:inherit;font-size:13px;font-weight:600;background:transparent;border:1px solid var(--ink);color:var(--ink);padding:5px 12px;border-radius:3px;cursor:pointer}
.btn:hover{background:var(--ink);color:var(--paper)}
.btn.danger{border-color:var(--terracotta);color:var(--terracotta)}
.btn.danger:hover{background:var(--terracotta);color:var(--paper)}
.btn.ghost{border:none;padding:5px 0;color:var(--ink-soft);font-weight:400}
.btn.ghost:hover{background:none;color:var(--terracotta)}
.small{font-size:12.5px;color:var(--ink-soft)}
.hidden{display:none}
input[type=text],input[type=password]{font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--ink);border-radius:3px;background:#fff;width:100%;color:var(--ink);font-family:ui-monospace,SF Mono,Consolas,monospace}
.callout{background:#fff;border-left:3px solid var(--terracotta);padding:12px 14px;margin:0 0 14px;font-size:14px}
pre{font-family:ui-monospace,SF Mono,Consolas,monospace;font-size:13px;background:var(--ink);color:var(--paper);padding:10px 12px;border-radius:3px;overflow-x:auto;margin:8px 0 0}
.err{color:#8a2020;font-size:14px;margin-top:8px}
.foot{margin-top:44px;padding-top:16px;border-top:1px solid var(--rule);font-size:13px;color:var(--ink-soft)}
</style></head><body>
<a class="mast" href="/"><img src="/gnosem-mark.svg" alt=""><span class="n">GNOSEM</span></a>

<div id="signin" class="hidden">
  <h1>Sign in</h1>
  <p class="small">Two ways to sign in — email link (if your account has one on file) or paste your API key directly.</p>

  <h2 style="margin-top:20px">Email me a sign-in link</h2>
  <p><input id="email-input" type="email" placeholder="you@example.com" autocomplete="email" spellcheck="false"></p>
  <p><button class="btn" id="email-btn">Send sign-in link</button></p>
  <p id="email-msg" class="small hidden"></p>

  <h2 style="margin-top:32px">Or paste your API key</h2>
  <p><input id="key-input" type="password" placeholder="gn_…" autocomplete="off" spellcheck="false"></p>
  <p><button class="btn" id="signin-btn">Sign in with key</button></p>
  <p id="signin-err" class="err hidden"></p>

  <p class="small" style="margin-top:32px">No account? <a href="/">Sign up on the homepage</a>.</p>
</div>

<div id="app" class="hidden">
  <h1>Your Gnosem account</h1>
  <p class="small" id="account-line"></p>

  <h2>Usage</h2>
  <div class="card">
    <div class="row"><span class="k">Plan</span><span class="v"><span id="plan-badge" class="plan"></span></span></div>
    <div class="row"><span class="k">Memories</span><span class="v" id="mem-count">—</span></div>
    <div class="bar"><i id="mem-bar" style="width:0%"></i></div>
    <p class="small" id="mem-limit-note" style="margin-top:8px"></p>
  </div>

  <h2>Recent memories</h2>
  <div id="mem-list" class="card"><p class="small">Loading…</p></div>

  <h2>Export</h2>
  <div class="card">
    <p class="small">Download every one of your memories as a portable JSON file. Includes the raw content, the LLM-optimized form, tags, provenance, and timestamps. Human- and machine-readable.</p>
    <p style="margin-top:12px"><button class="btn" id="export-btn">Download JSON export</button></p>
  </div>

  <h2>API key</h2>
  <div class="card">
    <p class="small">Rotate to get a new key. All current keys will be revoked — update every MCP client that uses this account before signing out.</p>
    <p style="margin-top:12px"><button class="btn danger" id="rotate-btn">Rotate my API key</button></p>
    <div id="rotate-result" class="hidden">
      <div class="callout"><strong>New key</strong> — save this now. It will not be shown again.<pre id="new-key"></pre></div>
    </div>
  </div>

  <p class="foot">
    <button class="btn ghost" id="signout-btn">Sign out (clears this browser only)</button> ·
    <a href="/">Home</a> ·
    <a href="/blog/">Blog</a> ·
    <a href="https://github.com/gnosem/gnosem">Source</a>
  </p>
</div>

<script>
const KEY_LS = "gnosem_api_key_v1";
const $ = (id) => document.getElementById(id);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");
const fmtDate = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function getKey() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("key");
  if (fromUrl && /^gn_[a-f0-9]{32}$/i.test(fromUrl)) {
    localStorage.setItem(KEY_LS, fromUrl);
    params.delete("key");
    history.replaceState({}, "", location.pathname + (params.toString() ? "?" + params : ""));
    return fromUrl;
  }
  return localStorage.getItem(KEY_LS) || "";
}

function saveKey(k) { localStorage.setItem(KEY_LS, k); }
function clearKey() { localStorage.removeItem(KEY_LS); }

async function authedFetch(path, opts = {}) {
  const key = localStorage.getItem(KEY_LS);
  const headers = { ...(opts.headers || {}), "Content-Type": "application/json" };
  if (key) headers["Authorization"] = "Bearer " + key;
  const r = await fetch(path, { ...opts, headers, credentials: "include" });
  if (r.status === 401) {
    clearKey();
    location.reload();
    throw new Error("unauthorized");
  }
  return r;
}

async function loadAccount() {
  const r = await authedFetch("/me");
  const me = await r.json();
  $("account-line").textContent = me.email ? me.email : "Account " + me.user_id.slice(0, 8) + "…";
  const badge = $("plan-badge");
  badge.textContent = me.plan;
  badge.className = "plan " + me.plan;
  $("mem-count").textContent = me.memory_limit === null ? me.memory_count.toLocaleString() : me.memory_count.toLocaleString() + " / " + me.memory_limit.toLocaleString();
  const pct = me.memory_limit ? Math.min(100, (me.memory_count / me.memory_limit) * 100) : (me.memory_count > 0 ? 8 : 0);
  $("mem-bar").style.width = pct + "%";
  $("mem-limit-note").textContent = me.memory_limit === null
    ? "Unlimited on " + (me.plan === "pro" ? "Pro" : "your account") + "."
    : "Free tier — upgrade for unlimited at gnosem.dev/upgrade.";
}

async function loadMemories() {
  const r = await authedFetch("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "memory_list", arguments: { limit: 25, raw: true } } }),
  });
  const j = await r.json();
  const items = j?.result?.structuredContent?.memories || [];
  const list = $("mem-list");
  if (items.length === 0) {
    list.innerHTML = '<p class="small">No memories yet. Write your first from any MCP client.</p>';
    return;
  }
  list.innerHTML = items.map(m => {
    const tags = (m.tags || []).map(t => "<span>" + escapeHtml(t) + "</span>").join("");
    return '<div class="mem">'
      + '<p class="meta">' + fmtDate(m.created_at) + (m.written_by ? " · " + escapeHtml(m.written_by) : "") + '</p>'
      + '<p class="content">' + escapeHtml(m.content) + '</p>'
      + (tags ? '<p class="tags">' + tags + '</p>' : '')
      + '<p class="actions"><button class="btn ghost" data-forget="' + m.id + '">Forget</button></p>'
      + '</div>';
  }).join("");
  list.querySelectorAll("[data-forget]").forEach(btn => btn.addEventListener("click", () => forgetMemory(btn.dataset.forget)));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function forgetMemory(id) {
  if (!confirm("Forget this memory? It will be excluded from all future reads.")) return;
  await authedFetch("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "memory_forget", arguments: { id } } }),
  });
  loadMemories(); loadAccount();
}

async function rotateKey() {
  if (!confirm("Rotate your API key? Every MCP client currently connected will stop working until you update it with the new key.")) return;
  const r = await authedFetch("/keys/rotate", { method: "POST" });
  const j = await r.json();
  if (j.api_key) {
    saveKey(j.api_key);
    $("new-key").textContent = j.api_key;
    show($("rotate-result"));
  }
}

async function boot() {
  getKey(); // consume ?key= from URL if present
  // Try /me — succeeds if we have either a valid session cookie or a Bearer key
  try {
    const r = await fetch("/me", {
      credentials: "include",
      headers: localStorage.getItem(KEY_LS) ? { "Authorization": "Bearer " + localStorage.getItem(KEY_LS) } : {},
    });
    if (r.ok) {
      await loadAccount();
      show($("app"));
      loadMemories();
      return;
    }
  } catch {}
  show($("signin"));
}

$("signin-btn").addEventListener("click", () => {
  const k = $("key-input").value.trim();
  if (!/^gn_[a-f0-9]{32}$/i.test(k)) {
    const err = $("signin-err"); err.textContent = "That doesn't look like a Gnosem API key. Expected format: gn_ followed by 32 hex characters."; show(err); return;
  }
  saveKey(k);
  location.reload();
});
$("key-input")?.addEventListener("keydown", (e) => { if (e.key === "Enter") $("signin-btn").click(); });

$("email-btn").addEventListener("click", async () => {
  const email = $("email-input").value.trim();
  const msg = $("email-msg");
  msg.className = "small";
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email)) { msg.textContent = "Please enter a valid email."; show(msg); return; }
  $("email-btn").disabled = true;
  msg.textContent = "Sending…"; show(msg);
  try {
    const r = await fetch("/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const j = await r.json();
    if (r.ok) {
      msg.textContent = j.note || "Check your email for the sign-in link.";
    } else {
      msg.textContent = j.error || "Something went wrong.";
    }
  } catch (e) {
    msg.textContent = "Network error. Try again.";
  } finally {
    $("email-btn").disabled = false;
  }
});
$("email-input")?.addEventListener("keydown", (e) => { if (e.key === "Enter") $("email-btn").click(); });

$("signout-btn").addEventListener("click", async () => {
  clearKey();
  try { await fetch("/auth/logout", { method: "POST", credentials: "include" }); } catch {}
  location.reload();
});
$("rotate-btn").addEventListener("click", rotateKey);

$("export-btn").addEventListener("click", async () => {
  const btn = $("export-btn");
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Preparing…";
  try {
    const r = await authedFetch("/export");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gnosem-export-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    btn.textContent = "Downloaded ✓";
    setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2500);
  } catch (e) {
    btn.textContent = "Failed — try again";
    setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2500);
  }
});

boot();
</script>
</body></html>`;
}
