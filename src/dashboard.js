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
input[type=text],input[type=password],input[type=date],textarea{font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--ink);border-radius:3px;background:#fff;width:100%;color:var(--ink);font-family:ui-monospace,SF Mono,Consolas,monospace}
textarea{resize:vertical;min-height:96px;line-height:1.5}
.field{margin:0 0 12px}
.field label{display:block;font-size:12.5px;color:var(--ink-soft);letter-spacing:.02em;margin-bottom:4px}
.field .hint{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:4px;font-size:12px;color:var(--ink-soft)}
.field .hint.warn{color:#8a2020}
.check{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--ink-soft);margin:8px 0 12px;cursor:pointer}
.check input{width:auto;margin:0}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--paper);padding:10px 18px;border-radius:3px;font-size:13.5px;letter-spacing:.02em;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:100;opacity:0;transition:opacity .18s ease}
.toast.show{opacity:1}
.callout{background:#fff;border-left:3px solid var(--terracotta);padding:12px 14px;margin:0 0 14px;font-size:14px}
pre{font-family:ui-monospace,SF Mono,Consolas,monospace;font-size:13px;background:var(--ink);color:var(--paper);padding:10px 12px;border-radius:3px;overflow-x:auto;margin:8px 0 0}
.err{color:#8a2020;font-size:14px;margin-top:8px}
.foot{margin-top:44px;padding-top:16px;border-top:1px solid var(--rule);font-size:13px;color:var(--ink-soft)}
</style></head><body>
<a class="mast" href="/"><img src="/gnosem-mark.svg" alt=""><span class="n">GNOSEM</span></a>

<div id="signin" class="hidden">
  <h1>Sign in</h1>
  <p class="small">Paste your Gnosem API key to view your account and memories. Your key stays in this browser only — it is not sent anywhere except gnosem.dev.</p>

  <p style="margin-top:20px"><input id="key-input" type="password" placeholder="gn_…" autocomplete="off" spellcheck="false"></p>
  <p><button class="btn" id="signin-btn">Sign in</button></p>
  <p id="signin-err" class="err hidden"></p>

  <p class="small" style="margin-top:32px">No account? <a href="/">Sign up on the homepage</a>. Email sign-in is coming soon.</p>
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

  <h2>Add a memory</h2>
  <div class="card">
    <div class="field">
      <label for="add-content">Content</label>
      <textarea id="add-content" maxlength="8000" placeholder="A fact, preference, decision, or note to remember…"></textarea>
      <div class="hint"><span id="add-count">0 / 8000</span><span>Long entries (&gt;400 chars) are auto-compressed for LLM reading — the raw text is preserved.</span></div>
    </div>
    <div class="field">
      <label for="add-tags">Tags <span class="small" style="font-weight:400">(comma-separated, optional)</span></label>
      <input id="add-tags" type="text" placeholder="preference, stack, personal">
    </div>
    <div class="field">
      <label for="add-written-by">Written by</label>
      <input id="add-written-by" type="text" value="dashboard">
    </div>
    <label class="check"><input type="checkbox" id="add-no-optimize"> Skip AI compression (preserve exact phrasing)</label>
    <p><button class="btn" id="add-submit">Save memory</button></p>
    <p id="add-err" class="err hidden"></p>
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
  list.innerHTML = items.map(renderMemoryCard).join("");
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

function showToast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(showToast._h);
  showToast._h = setTimeout(() => t.classList.remove("show"), 2000);
}

function renderMemoryCard(m) {
  const tags = (m.tags || []).map(t => "<span>" + escapeHtml(t) + "</span>").join("");
  return '<div class="mem">'
    + '<p class="meta">' + fmtDate(m.created_at) + (m.written_by ? " · " + escapeHtml(m.written_by) : "") + '</p>'
    + '<p class="content">' + escapeHtml(m.content) + '</p>'
    + (tags ? '<p class="tags">' + tags + '</p>' : '')
    + '<p class="actions"><button class="btn ghost" data-forget="' + m.id + '">Forget</button></p>'
    + '</div>';
}

async function addMemory() {
  const contentEl = $("add-content");
  const tagsEl = $("add-tags");
  const writtenByEl = $("add-written-by");
  const noOptEl = $("add-no-optimize");
  const errEl = $("add-err");
  const btn = $("add-submit");
  hide(errEl);
  const content = contentEl.value.trim();
  if (!content) { errEl.textContent = "Content is required."; show(errEl); return; }
  const tags = tagsEl.value.split(",").map(s => s.trim()).filter(Boolean);
  const written_by = writtenByEl.value.trim() || "dashboard";
  const args = { content, written_by };
  if (tags.length) args.tags = tags;
  if (noOptEl.checked) args.no_optimize = true;
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Saving…";
  try {
    const r = await authedFetch("/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "memory_write", arguments: args } }),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || "Save failed");
    const written = j?.result?.structuredContent;
    contentEl.value = ""; tagsEl.value = ""; noOptEl.checked = false;
    updateAddCount();
    showToast("Saved");
    // Optimistic prepend so the user sees it without waiting for a full refetch.
    if (written?.id) {
      const list = $("mem-list");
      const newRow = {
        id: written.id,
        content: written.content || content,
        tags,
        written_by,
        created_at: written.created_at || Date.now(),
      };
      const empty = list.querySelector("p.small");
      if (empty) list.innerHTML = "";
      list.insertAdjacentHTML("afterbegin", renderMemoryCard(newRow));
      list.querySelectorAll("[data-forget]").forEach(b => {
        b.replaceWith(b.cloneNode(true));
      });
      list.querySelectorAll("[data-forget]").forEach(b => b.addEventListener("click", () => forgetMemory(b.dataset.forget)));
    }
    loadAccount();
  } catch (e) {
    errEl.textContent = e.message || "Save failed";
    show(errEl);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function updateAddCount() {
  const el = $("add-content");
  const c = $("add-count");
  const n = el.value.length;
  c.textContent = n + " / 8000";
  const hint = c.parentElement;
  if (n > 7500) hint.classList.add("warn"); else hint.classList.remove("warn");
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

// NOTE: email/magic-link sign-in UI removed from the dashboard until a working transactional
// email provider is wired up. Server endpoints (/auth/request, /auth/verify, /auth/logout) and
// sendMagicLinkEmail() remain in src/worker.js — set ZEPTOMAIL_API_KEY (or swap providers) and
// re-add the email inputs to bring this back. escapeHtml() is still imported above; leave it.

$("signout-btn").addEventListener("click", async () => {
  clearKey();
  try { await fetch("/auth/logout", { method: "POST", credentials: "include" }); } catch {}
  location.reload();
});
$("rotate-btn").addEventListener("click", rotateKey);

$("add-submit").addEventListener("click", addMemory);
$("add-content").addEventListener("input", updateAddCount);
updateAddCount();

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
