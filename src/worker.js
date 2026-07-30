/**
 * gnosem — cross-vendor AI memory server
 *
 * Exposes a Model Context Protocol (MCP) server over HTTP + Server-Sent Events
 * at POST /mcp so any MCP-capable client (Claude Desktop, Cursor, Windsurf, Zed,
 * ChatGPT via Custom Action, etc.) can read + write to a single user-owned
 * memory store.
 *
 * Data:
 *   - Cloudflare D1 (metadata, users, api_keys)
 *   - Cloudflare Vectorize (embeddings, 768-dim BGE-base, cosine)
 *   - Cloudflare Workers AI (@cf/baai/bge-base-en-v1.5) for embedding generation
 *
 * Auth:
 *   - Bearer token in Authorization header
 *   - SHA-256 hash of the plaintext key stored in D1
 *
 * Endpoints:
 *   GET  /                 -> health / signup instructions
 *   POST /signup           -> {email?} -> {user_id, api_key} (one-time key display)
 *   POST /keys/rotate      -> auth'd; returns a new api_key and revokes the old
 *   POST /mcp              -> MCP JSON-RPC 2.0 (list_tools, call_tool, etc.)
 *
 * MCP tools exposed:
 *   memory_write     content, tags?, written_by?, session_id?  -> {id}
 *   memory_search    query, k=10                                -> [{id, content, score, ...}]
 *   memory_list      limit=50, cursor?                          -> {memories, cursor}
 *   memory_forget    id                                          -> {ok}
 *   memory_supersede old_id, new_content, tags?                 -> {new_id}
 */

import { LLMS_TXT } from "./llms-txt.js";
import { MARK_SVG, WORDMARK_SVG, LOCKUP_SVG, FAVICON_SVG, OG_SVG } from "./brand.js";

const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
const OPTIMIZE_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const OPTIMIZE_THRESHOLD_CHARS = 400; // only compress memories longer than this
const FREE_TIER_MEMORY_LIMIT = 200;

// Stripe Payment Links (created 2026-07-29 on acct_1TekTGRLUmkPHer1 / CUETV LLC)
const PLINK_MONTHLY = "https://buy.stripe.com/3cI5kF67Q4K26ZLfnRak005"; // $9/mo
const PLINK_ANNUAL  = "https://buy.stripe.com/00waEZcwefoG4RD1x1ak004"; // $90/yr (2 months free)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

// ------------- helpers -------------

function uuid() { return crypto.randomUUID(); }

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extraHeaders },
  });
}

function jsonRpc(id, result) { return { jsonrpc: "2.0", id, result }; }
function jsonRpcError(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } };
}

// Generate an API key formatted like `gn_<32hex>` — 128 bits of entropy.
async function generateApiKey() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return "gn_" + Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Look up + auth: returns { user_id, plan, subscription_status } or null.
async function authenticate(request, env) {
  const authz = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(gn_[a-f0-9]{32})$/i.exec(authz);
  if (!m) return null;
  const keyHash = await sha256Hex(m[1]);
  const row = await env.DB.prepare(
    `SELECT k.user_id, u.plan, u.subscription_status, u.subscription_period_end
     FROM api_keys k JOIN users u ON u.id = k.user_id
     WHERE k.key_hash = ? AND k.revoked_at IS NULL`
  ).bind(keyHash).first();
  if (!row) return null;
  env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?")
    .bind(Date.now(), keyHash).run().catch(() => {});
  // Auto-downgrade if subscription lapsed past grace (7 days).
  const graceMs = 7 * 24 * 3600 * 1000;
  const stillPaid = row.plan === "pro" && (
    row.subscription_status === "active" ||
    row.subscription_status === "trialing" ||
    (row.subscription_period_end && Date.now() < row.subscription_period_end + graceMs)
  );
  return { user_id: row.user_id, plan: stillPaid ? "pro" : "free", subscription_status: row.subscription_status };
}

// ------------- embedding -------------

async function embed(env, text) {
  const r = await env.AI.run(EMBED_MODEL, { text: [text] });
  return r.data[0]; // 768-dim number[]
}

// ------------- LLM-optimized storage -------------
//
// When a memory's raw content is long enough to benefit, we compress it to a structured
// facts line optimized for LLM consumption. The reading model (Claude, GPT, etc.) ingests
// this instead of the full prose — fewer tokens, same meaning, easier to compose.
//
// Returns { optimized } or null on failure (fail-open — the raw memory still saves).

const OPTIMIZE_SYS_PROMPT = `You compress user memories into structured facts for AI consumption. Output ONE line of pipe-separated key: value pairs. Keys are UPPERCASE labels drawn from this set when applicable: TOPIC, PROJECT, DECISION, PREFERENCE, PERSON, PLACE, DATE, STACK, PROBLEM, SOLUTION, GOAL, CONSTRAINT, FACT, EVENT. Values are terse — no filler, no articles when droppable. Preserve every distinct fact from the input. Do not add information not in the input. Do not add preamble, quotes, or explanation. Output ONLY the pipe-separated line.`;

async function optimizeContent(env, raw) {
  if (raw.length < OPTIMIZE_THRESHOLD_CHARS) return null;
  try {
    const r = await env.AI.run(OPTIMIZE_MODEL, {
      messages: [
        { role: "system", content: OPTIMIZE_SYS_PROMPT },
        { role: "user", content: raw },
      ],
      max_tokens: 512,
    });
    const out = String(r?.response || "").trim().split("\n")[0].trim();
    // Reject the output if the model padded/refused/expanded — we only want compression wins.
    if (!out || out.length >= raw.length) return null;
    return { optimized: out };
  } catch {
    return null;
  }
}

// ------------- signup + key rotation -------------

async function handleSignup(request, env) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json({ error: "email is optional but if provided must be a valid address" }, 400);
  }
  // If email supplied and already exists, return a friendly error (don't leak enumeration; but for prototype clarity, OK).
  if (email) {
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (existing) return json({ error: "email already registered; use /keys/rotate to get a new key with your existing key" }, 409);
  }
  const userId = uuid();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)")
    .bind(userId, email, now).run();
  const apiKey = await generateApiKey();
  const keyHash = await sha256Hex(apiKey);
  await env.DB.prepare(
    "INSERT INTO api_keys (key_hash, user_id, label, created_at) VALUES (?, ?, ?, ?)"
  ).bind(keyHash, userId, "initial", now).run();
  return json({
    user_id: userId,
    api_key: apiKey,
    note: "Save this key now — it will not be shown again. To use: add to your MCP client config as Authorization: Bearer <api_key>. See / for setup instructions.",
  }, 201);
}

async function handleKeyRotate(request, env, userId) {
  const apiKey = await generateApiKey();
  const keyHash = await sha256Hex(apiKey);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE api_keys SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(now, userId),
    env.DB.prepare("INSERT INTO api_keys (key_hash, user_id, label, created_at) VALUES (?, ?, ?, ?)")
      .bind(keyHash, userId, "rotated", now),
  ]);
  return json({ api_key: apiKey, note: "All prior keys revoked. Update every client with this new key." });
}

// ------------- MCP tool implementations -------------

async function toolMemoryWrite(env, ctx, args) {
  const userId = ctx.user_id;
  const content = String(args?.content || "").trim();
  if (!content) throw new Error("content is required");
  if (content.length > 8000) throw new Error("content must be ≤ 8000 characters");
  // Free-tier limit: 200 active memories (forgotten + superseded excluded).
  if (ctx.plan === "free") {
    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM memories WHERE user_id = ? AND forgotten_at IS NULL AND superseded_by IS NULL"
    ).bind(userId).all();
    if ((results?.[0]?.n ?? 0) >= FREE_TIER_MEMORY_LIMIT) {
      throw new Error(`Free-tier limit (${FREE_TIER_MEMORY_LIMIT} memories) reached. Upgrade to Gnosem Pro for unlimited: https://gnosem.dev/upgrade`);
    }
  }
  const tags = Array.isArray(args?.tags) ? args.tags.slice(0, 20).map(t => String(t).slice(0, 40)) : [];
  const writtenBy = args?.written_by ? String(args.written_by).slice(0, 80) : null;
  const sessionId = args?.session_id ? String(args.session_id).slice(0, 80) : null;
  const noOptimize = args?.no_optimize === true;
  const id = uuid();
  const now = Date.now();
  const contentBytes = new TextEncoder().encode(content).length;
  // Embed the raw content (semantic search hits full meaning, not the compressed form).
  // Optimize in parallel with embed for latency.
  const [vector, opt] = await Promise.all([
    embed(env, content),
    noOptimize ? Promise.resolve(null) : optimizeContent(env, content),
  ]);
  const optimized = opt?.optimized || null;
  const optimizedBytes = optimized ? new TextEncoder().encode(optimized).length : null;
  await env.DB.prepare(
    "INSERT INTO memories (id, user_id, content, tags, written_by, session_id, created_at, content_optimized, content_bytes, optimized_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, userId, content, JSON.stringify(tags), writtenBy, sessionId, now, optimized, contentBytes, optimizedBytes).run();
  await env.VECTORIZE.upsert([{
    id,
    values: vector,
    metadata: { user_id: userId, created_at: now },
  }]);
  return {
    id,
    created_at: now,
    optimized: optimized !== null,
    ...(optimized ? { compression_ratio: Number((optimizedBytes / contentBytes).toFixed(3)) } : {}),
  };
}

// Shape a memory row for return to the reading client.
// Default: content = the LLM-optimized form when present (fewer tokens for the reading model);
// content_raw is always the original. Pass raw:true to invert (content = raw, no content_raw).
function shapeMemoryRow(r, { raw }) {
  const hasOpt = !!r.content_optimized;
  return {
    id: r.id,
    content: raw ? r.content : (hasOpt ? r.content_optimized : r.content),
    ...(raw ? {} : (hasOpt ? { content_raw: r.content, optimized: true } : { optimized: false })),
    tags: safeParse(r.tags),
    written_by: r.written_by,
    session_id: r.session_id,
    created_at: r.created_at,
  };
}

async function toolMemorySearch(env, ctx, args) {
  const userId = ctx.user_id;
  const query = String(args?.query || "").trim();
  if (!query) throw new Error("query is required");
  const k = Math.min(Math.max(Number(args?.k) || 10, 1), 50);
  const raw = args?.raw === true;
  const queryVec = await embed(env, query);
  // Vectorize filter by user_id so we never leak across users.
  const results = await env.VECTORIZE.query(queryVec, {
    topK: k * 2, // over-fetch, we filter forgotten/superseded in D1
    filter: { user_id: userId },
  });
  if (!results.matches?.length) return { matches: [] };
  const ids = results.matches.map(m => m.id);
  const scoreById = Object.fromEntries(results.matches.map(m => [m.id, m.score]));
  // Fetch active rows (not forgotten, not superseded) and keep result ordering by score.
  const placeholders = ids.map(() => "?").join(",");
  const rows = (await env.DB.prepare(
    `SELECT id, content, content_optimized, tags, written_by, session_id, created_at
     FROM memories
     WHERE id IN (${placeholders}) AND user_id = ? AND forgotten_at IS NULL AND superseded_by IS NULL`
  ).bind(...ids, userId).all()).results || [];
  const enriched = rows.map(r => ({ ...shapeMemoryRow(r, { raw }), score: scoreById[r.id] ?? null }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, k);
  return { matches: enriched };
}

async function toolMemoryList(env, ctx, args) {
  const userId = ctx.user_id;
  const limit = Math.min(Math.max(Number(args?.limit) || 50, 1), 200);
  const cursor = args?.cursor ? Number(args.cursor) : Date.now();
  const raw = args?.raw === true;
  const rows = (await env.DB.prepare(
    `SELECT id, content, content_optimized, tags, written_by, session_id, created_at
     FROM memories
     WHERE user_id = ? AND forgotten_at IS NULL AND superseded_by IS NULL AND created_at < ?
     ORDER BY created_at DESC LIMIT ?`
  ).bind(userId, cursor, limit).all()).results || [];
  const nextCursor = rows.length === limit ? rows[rows.length - 1].created_at : null;
  return {
    memories: rows.map(r => shapeMemoryRow(r, { raw })),
    cursor: nextCursor,
  };
}

async function toolMemoryForget(env, ctx, args) {
  const userId = ctx.user_id;
  const id = String(args?.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("id must be a UUID");
  const now = Date.now();
  const result = await env.DB.prepare(
    "UPDATE memories SET forgotten_at = ? WHERE id = ? AND user_id = ? AND forgotten_at IS NULL"
  ).bind(now, id, userId).run();
  if (result.meta.changes === 0) return { ok: false, error: "no such memory (or already forgotten)" };
  await env.VECTORIZE.deleteByIds([id]).catch(() => {});
  return { ok: true, id };
}

async function toolMemorySupersede(env, ctx, args) {
  const userId = ctx.user_id;
  const oldId = String(args?.old_id || "");
  const newContent = String(args?.new_content || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(oldId)) throw new Error("old_id must be a UUID");
  if (!newContent) throw new Error("new_content is required");
  const old = await env.DB.prepare(
    "SELECT id FROM memories WHERE id = ? AND user_id = ? AND forgotten_at IS NULL AND superseded_by IS NULL"
  ).bind(oldId, userId).first();
  if (!old) throw new Error("no such active memory to supersede");
  const written = await toolMemoryWrite(env, ctx, {
    content: newContent,
    tags: args?.tags,
    written_by: args?.written_by,
    session_id: args?.session_id,
  });
  await env.DB.prepare("UPDATE memories SET superseded_by = ? WHERE id = ?")
    .bind(written.id, oldId).run();
  return { old_id: oldId, new_id: written.id, created_at: written.created_at };
}

function safeParse(s) {
  try { return JSON.parse(s || "[]"); } catch { return []; }
}

// ------------- MCP protocol handler -------------

const TOOLS = [
  {
    name: "memory_write",
    description: "Save a fact, preference, decision, or note to the user's cross-model memory. Any MCP client can read this back later. Include written_by (e.g. 'claude-code', 'gpt-5', 'kimi-k2') for provenance and session_id to group related writes. Long content (>400 chars) is automatically compressed on write to a structured-facts form optimized for LLM reading — the raw text is preserved. Pass no_optimize:true to skip.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The fact or note to remember. Plain text, max 8000 characters." },
        tags: { type: "array", items: { type: "string" }, description: "Optional short labels for filtering (e.g. ['preference','stack'])." },
        written_by: { type: "string", description: "Identifier of the model / client writing this (e.g. 'claude-code', 'gpt-5', 'kimi-k2', 'manual')." },
        session_id: { type: "string", description: "Opaque identifier grouping related writes from the same conversation." },
        no_optimize: { type: "boolean", description: "Skip AI compression of long content. Default false." },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_search",
    description: "Semantic search across the user's memories. Returns the top-k most similar rows by cosine similarity of the embedded query and content. By default `content` is the LLM-optimized (compressed) form when available — smaller for your context window; the raw text is in `content_raw`. Pass raw:true to invert. Excludes forgotten and superseded memories.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language search query." },
        k: { type: "integer", description: "Max results (1–50). Default 10." },
        raw: { type: "boolean", description: "Return original prose instead of the compressed form. Default false." },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_list",
    description: "List the user's most recent memories in reverse chronological order. Use for browsing or catching up on what the user's other model sessions have written recently. Same content/content_raw shape as memory_search.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Max rows to return (1–200). Default 50." },
        cursor: { type: "integer", description: "Pagination cursor from a previous call's `cursor` field (ms epoch); returns rows older than this timestamp." },
        raw: { type: "boolean", description: "Return original prose instead of the compressed form. Default false." },
      },
    },
  },
  {
    name: "memory_forget",
    description: "Soft-delete a memory by id. The row is retained for audit but excluded from search/list and removed from the vector index.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "UUID of the memory to forget." } },
      required: ["id"],
    },
  },
  {
    name: "memory_supersede",
    description: "Replace a stale memory with a corrected one. The old row is marked superseded and excluded from future reads; the new row becomes the current version. Use for corrections; use memory_forget for pure deletions.",
    inputSchema: {
      type: "object",
      properties: {
        old_id: { type: "string", description: "UUID of the memory to replace." },
        new_content: { type: "string", description: "New content that supersedes the old memory." },
        tags: { type: "array", items: { type: "string" } },
        written_by: { type: "string" },
        session_id: { type: "string" },
      },
      required: ["old_id", "new_content"],
    },
  },
];

const TOOL_DISPATCH = {
  memory_write: toolMemoryWrite,
  memory_search: toolMemorySearch,
  memory_list: toolMemoryList,
  memory_forget: toolMemoryForget,
  memory_supersede: toolMemorySupersede,
};

async function handleMcp(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json(jsonRpcError(null, -32700, "Parse error"), 400); }
  if (body.jsonrpc !== "2.0") return json(jsonRpcError(body?.id ?? null, -32600, "Invalid Request: jsonrpc must be '2.0'"), 400);
  const { method, params, id } = body;
  try {
    if (method === "initialize") {
      return json(jsonRpc(id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "gnosem", version: "0.1.0" },
      }));
    }
    if (method === "notifications/initialized" || method === "initialized") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (method === "tools/list") {
      return json(jsonRpc(id, { tools: TOOLS }));
    }
    if (method === "tools/call") {
      const name = params?.name;
      const fn = TOOL_DISPATCH[name];
      if (!fn) return json(jsonRpcError(id, -32601, `Unknown tool: ${name}`));
      const result = await fn(env, ctx, params?.arguments || {});
      return json(jsonRpc(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }));
    }
    if (method === "ping") {
      return json(jsonRpc(id, {}));
    }
    return json(jsonRpcError(id, -32601, `Method not found: ${method}`));
  } catch (e) {
    return json(jsonRpcError(id, -32000, e.message || String(e)));
  }
}

// ------------- Stripe helpers + upgrade flow -------------

async function stripeGet(env, apiPath) {
  const r = await fetch("https://api.stripe.com" + apiPath, {
    headers: { authorization: "Bearer " + env.STRIPE_SECRET_KEY },
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data) {
    const err = new Error("stripe " + r.status);
    err.stripeStatus = r.status;
    throw err;
  }
  return data;
}

function upgradeHtml(ctx) {
  const planLabel = ctx.plan === "pro" ? "Pro (active)" : "Free";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Upgrade to Gnosem Pro</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#0F172A;background:#F5F1EA}
h1{font-size:26px;margin:0 0 4px;font-family:Georgia,serif}
.plan{display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:.12em;background:#0F172A;color:#F5F1EA;padding:3px 10px;border-radius:2px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:22px 0}
@media(max-width:520px){.grid{grid-template-columns:1fr}}
.card{background:#fff;border:1.5px solid #0F172A;border-radius:6px;padding:24px 22px;text-decoration:none;color:inherit;display:block;transition:transform .1s}
.card:hover{transform:translateY(-2px);box-shadow:0 4px 0 #0F172A}
.card.highlight{background:#0F172A;color:#F5F1EA;position:relative}
.badge{position:absolute;top:-9px;right:14px;background:#B08D3E;color:#0F172A;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:2px}
.card h3{font-family:Georgia,serif;font-size:22px;margin-bottom:6px;font-weight:600}
.card .price{font-size:32px;font-weight:600;font-variant-numeric:tabular-nums;margin:8px 0 4px}
.card .price .per{font-size:13px;font-weight:400;opacity:.7;margin-left:4px}
.card .save{font-size:12.5px;color:#B08D3E;font-weight:600;letter-spacing:.02em;margin-top:2px}
.card ul{list-style:none;padding:0;margin:14px 0 0;font-size:14px}
.card li{padding:4px 0;padding-left:18px;position:relative}
.card li::before{content:"✓";position:absolute;left:0;color:#B08D3E;font-weight:700}
.card.highlight li::before{color:#D9B96A}
.free{padding:14px 18px;background:#fff;border-left:3px solid #B08D3E;font-size:14px;color:#555;margin-top:8px}
.note{font-size:12.5px;color:#777;border-top:1px solid #ddd;margin-top:32px;padding-top:14px}
</style></head><body>
<h1>Upgrade to Gnosem Pro</h1>
<span class="plan">Current plan: ${planLabel}</span>
<p>Unlimited cross-vendor memories across every model you use. Same MCP config, no data migration.</p>

<div class="grid">
  <a class="card highlight" href="${PLINK_ANNUAL}">
    <span class="badge">Best value · 2 months free</span>
    <h3>Annual</h3>
    <div class="price">$90<span class="per">/yr</span></div>
    <div class="save">Save $18 vs monthly</div>
    <ul>
      <li>Unlimited memories</li>
      <li>1GB storage</li>
      <li>Unlimited API keys</li>
      <li>Priority indexing</li>
      <li>Exports</li>
    </ul>
  </a>
  <a class="card" href="${PLINK_MONTHLY}">
    <h3>Monthly</h3>
    <div class="price">$9<span class="per">/mo</span></div>
    <div class="save" style="visibility:hidden">.</div>
    <ul>
      <li>Unlimited memories</li>
      <li>1GB storage</li>
      <li>Unlimited API keys</li>
      <li>Priority indexing</li>
      <li>Exports</li>
    </ul>
  </a>
</div>

<div class="free"><strong>Free tier:</strong> 200 memories, 1 API key, community support. Keep using it as long as you want — upgrade when you hit the wall.</div>

<p class="note">Payments processed by Stripe. Cancel any time via the customer portal (link included on receipts). Prices are USD, exclusive of any applicable sales tax.</p>
</body></html>`;
}

async function handleUpgrade(ctx) {
  return new Response(upgradeHtml(ctx), { headers: { "Content-Type": "text/html; charset=utf-8", ...CORS } });
}

async function handleUpgraded(request, env) {
  const url = new URL(request.url);
  const sid = url.searchParams.get("session_id");
  if (!sid || !/^cs_[a-zA-Z0-9_]+$/.test(sid)) {
    return new Response("Missing or invalid session_id.", { status: 400, headers: CORS });
  }
  if (!env.STRIPE_SECRET_KEY) {
    return new Response("STRIPE_SECRET_KEY not configured on the worker. Ask the admin to set it.", { status: 503, headers: CORS });
  }
  // Verify with Stripe: pull the session, confirm paid, extract subscription + customer.
  let session;
  try {
    session = await stripeGet(env, `/v1/checkout/sessions/${sid}?expand[]=subscription&expand[]=customer`);
  } catch (e) {
    return new Response("Couldn't verify the checkout session with Stripe.", { status: 502, headers: CORS });
  }
  if (session.payment_status !== "paid" || !session.subscription || typeof session.subscription !== "object") {
    return new Response("Payment not completed yet.", { status: 402, headers: CORS });
  }
  const sub = session.subscription;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const email = session.customer_details?.email?.toLowerCase() || (typeof session.customer === "object" ? session.customer.email?.toLowerCase() : null);
  const periodEnd = (sub.current_period_end || 0) * 1000;
  // Match user by email if it's on file; otherwise create a fresh account.
  let user = email ? await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first() : null;
  let userId, apiKey = null;
  if (user) {
    userId = user.id;
    await env.DB.prepare(
      "UPDATE users SET plan='pro', stripe_customer_id=?, subscription_id=?, subscription_status=?, subscription_period_end=? WHERE id=?"
    ).bind(customerId, sub.id, sub.status, periodEnd, userId).run();
  } else {
    // New user via Stripe — create + issue a starter key.
    userId = uuid();
    apiKey = await generateApiKey();
    const keyHash = await sha256Hex(apiKey);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, email, created_at, plan, stripe_customer_id, subscription_id, subscription_status, subscription_period_end) VALUES (?, ?, ?, 'pro', ?, ?, ?, ?)"
      ).bind(userId, email, now, customerId, sub.id, sub.status, periodEnd),
      env.DB.prepare(
        "INSERT INTO api_keys (key_hash, user_id, label, created_at) VALUES (?, ?, 'from_stripe_checkout', ?)"
      ).bind(keyHash, userId, now),
    ]);
  }
  const keyLine = apiKey
    ? `<div style="background:#fff;border:1.5px solid #0F172A;border-radius:4px;padding:14px 18px;margin:16px 0"><strong>Your new API key</strong> (save this — it will not be shown again):<pre style="background:#0F172A;color:#F5F1EA;padding:10px 14px;border-radius:3px;margin-top:8px;font-family:ui-monospace,SF Mono,Consolas,monospace;font-size:13px;overflow-x:auto">${apiKey}</pre></div>`
    : `<p>Existing account upgraded. Your existing API key(s) now have Pro access.</p>`;
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Welcome to Gnosem Pro</title>
<style>body{font:15px/1.6 -apple-system,BlinkMacSystemFont,Inter,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#0F172A;background:#F5F1EA}
h1{font-family:Georgia,serif;font-size:28px;margin:0 0 8px}.tag{display:inline-block;background:#B08D3E;color:#0F172A;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:3px 10px;border-radius:2px;margin-bottom:16px}
code{background:#eaeaea;padding:1px 5px;border-radius:2px;font-family:ui-monospace,SF Mono,Consolas,monospace}
pre{background:#0F172A;color:#F5F1EA;padding:12px 14px;border-radius:3px;font-size:12.5px;overflow-x:auto}</style></head>
<body><span class="tag">Payment received</span>
<h1>Welcome to Gnosem Pro</h1>
<p>Subscription active through ${new Date(periodEnd).toLocaleDateString()}.</p>
${keyLine}
<p>Add to your MCP client config:</p>
<pre>{
  "mcpServers": {
    "gnosem": {
      "url": "https://gnosem.dev/mcp",
      "headers": { "Authorization": "Bearer gn_your_key_here" }
    }
  }
}</pre>
<p style="margin-top:24px;font-size:13px;color:#777">Manage billing / cancel any time via the receipt-email link. Questions: reply to any Stripe receipt.</p>
</body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", ...CORS } });
}

// Stripe webhook signature verification — HMAC SHA-256 over "timestamp.rawBody" per the docs.
async function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(signatureHeader.split(",").map(kv => kv.split("=")));
  if (!parts.t || !parts.v1) return false;
  const signedPayload = `${parts.t}.${rawBody}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
  // Constant-time compare would be nicer, but not vital for a webhook signature.
  return expected === parts.v1;
}

async function handleStripeWebhook(request, env) {
  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (env.STRIPE_WEBHOOK_SECRET) {
    const ok = await verifyStripeSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
    if (!ok) return new Response("bad signature", { status: 400, headers: CORS });
  }
  let event;
  try { event = JSON.parse(rawBody); } catch { return new Response("bad json", { status: 400, headers: CORS }); }
  const type = event.type;
  const obj = event.data?.object;
  if (!obj) return new Response("no object", { status: 400, headers: CORS });
  // Handle only the events we care about; ack everything else with 200.
  if (type === "customer.subscription.updated" || type === "customer.subscription.created") {
    const sub = obj;
    const periodEnd = (sub.current_period_end || 0) * 1000;
    await env.DB.prepare(
      "UPDATE users SET subscription_status=?, subscription_period_end=?, plan=(CASE WHEN ? IN ('active','trialing') THEN 'pro' ELSE plan END) WHERE stripe_customer_id=?"
    ).bind(sub.status, periodEnd, sub.status, sub.customer).run();
  } else if (type === "customer.subscription.deleted") {
    await env.DB.prepare(
      "UPDATE users SET subscription_status='canceled', plan='free' WHERE stripe_customer_id=?"
    ).bind(obj.customer).run();
  }
  return new Response("ok", { status: 200, headers: CORS });
}

// ------------- landing page -------------

function landingHtml() {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Gnosem — cross-vendor AI memory over MCP</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Cross-vendor AI memory over Model Context Protocol. One memory store that every AI you use — Claude, ChatGPT, Gemini, Kimi, Cursor, Windsurf — can read and write to. Vendor-agnostic, portable, yours.">
<link rel="canonical" href="https://gnosem.dev/">
<meta property="og:type" content="website">
<meta property="og:title" content="Gnosem — cross-vendor AI memory over MCP">
<meta property="og:description" content="One memory. Every model. Portable AI context that works in Claude, ChatGPT, Gemini, Kimi, Cursor, Windsurf, and any MCP-capable client.">
<meta property="og:url" content="https://gnosem.dev/">
<meta property="og:site_name" content="Gnosem">
<meta property="og:image" content="https://gnosem.dev/og.svg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Gnosem — one memory. every model.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://gnosem.dev/og.svg">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/favicon.svg">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
{"@type":"SoftwareApplication","@id":"https://gnosem.dev/#software","name":"Gnosem","url":"https://gnosem.dev/","applicationCategory":"DeveloperApplication","applicationSubCategory":"AI Infrastructure","operatingSystem":"Cloud","description":"Cross-vendor AI memory server over Model Context Protocol. One persistent memory store that reads/writes from any MCP-capable AI client — Claude Desktop, Cursor, Windsurf, Zed, ChatGPT (via Custom Action), Kimi, and more.","offers":[{"@type":"Offer","name":"Free","price":"0","priceCurrency":"USD","description":"200 memories, 1 API key, community support"},{"@type":"Offer","name":"Pro Monthly","price":"9","priceCurrency":"USD","description":"Unlimited memories, 1GB storage, unlimited API keys, priority indexing"},{"@type":"Offer","name":"Pro Annual","price":"90","priceCurrency":"USD","description":"Pro billed annually (2 months free)"}],"publisher":{"@type":"Organization","name":"CUETV LLC","url":"https://cuetv.us"}},
{"@type":"FAQPage","@id":"https://gnosem.dev/#faq","mainEntity":[
{"@type":"Question","name":"What is Gnosem?","acceptedAnswer":{"@type":"Answer","text":"Gnosem is a cross-vendor AI memory server that exposes a Model Context Protocol (MCP) endpoint. Any MCP-capable AI client — Claude Desktop, Cursor, Windsurf, Zed, ChatGPT via Custom Action, Kimi — can read and write to a single per-user memory store, so context follows the user across every model they use."}},
{"@type":"Question","name":"How do I add Gnosem to Claude Desktop?","acceptedAnswer":{"@type":"Answer","text":"Add this to your Claude Desktop MCP config: {\\"mcpServers\\":{\\"gnosem\\":{\\"url\\":\\"https://gnosem.dev/mcp\\",\\"headers\\":{\\"Authorization\\":\\"Bearer gn_your_api_key\\"}}}}. Restart Claude Desktop. The five memory tools (memory_write, memory_search, memory_list, memory_forget, memory_supersede) appear immediately."}},
{"@type":"Question","name":"How do I add Gnosem to Cursor or Windsurf?","acceptedAnswer":{"@type":"Answer","text":"Same MCP config as Claude Desktop, in the respective app's mcp.json or settings file. Cursor and Windsurf are both MCP-native — one config line, restart, done."}},
{"@type":"Question","name":"Does Gnosem work with ChatGPT?","acceptedAnswer":{"@type":"Answer","text":"Yes, via a ChatGPT Custom GPT with an Action pointing at https://gnosem.dev/mcp. The same API key works across every client — Claude memories are visible from ChatGPT and vice versa."}},
{"@type":"Question","name":"How much does Gnosem cost?","acceptedAnswer":{"@type":"Answer","text":"Free tier: 200 memories, 1 API key, community support. Pro: $9/month or $90/year (2 months free) — unlimited memories, 1GB storage, unlimited API keys, priority indexing, exports."}},
{"@type":"Question","name":"Is my data private?","acceptedAnswer":{"@type":"Answer","text":"Memories are per-user isolated at the database level via Bearer-token authentication. Storage on Cloudflare (D1 metadata + Vectorize embeddings) is encrypted at rest. No cross-user access, no data sale."}},
{"@type":"Question","name":"What is the Model Context Protocol (MCP)?","acceptedAnswer":{"@type":"Answer","text":"MCP is an open standard introduced by Anthropic in November 2024 for connecting AI applications to external data sources and tools. Gnosem exposes an MCP server so any MCP-capable client can use it without vendor-specific integration."}}
]}]}
</script>
<style>
body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#0F172A;background:#F5F1EA}
h1{font-family:Georgia,serif;font-size:32px;margin:0 0 4px;letter-spacing:-.01em}
h2{font-size:18px;margin:32px 0 8px;font-family:Georgia,serif;font-weight:600}
.tag{display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:.1em;background:#0F172A;color:#F5F1EA;padding:3px 10px;border-radius:2px;margin-bottom:16px}
code,pre{font-family:ui-monospace,SF Mono,Consolas,monospace;font-size:13px}
pre{background:#0F172A;color:#F5F1EA;padding:14px 16px;border-radius:4px;overflow-x:auto}
code{background:#eaeaea;padding:1px 5px;border-radius:2px}
.note{border-left:3px solid #B08D3E;padding:10px 14px;background:#fff;color:#555;font-size:14px;margin:14px 0}
.cta{display:inline-block;font-weight:700;font-size:14px;background:#0F172A;color:#F5F1EA;padding:10px 18px;border-radius:3px;text-decoration:none;margin-top:12px}
a{color:#7a2e2e}a.cta{color:#F5F1EA}
</style></head><body>
<img src="/mark.svg" alt="" width="56" height="56" style="display:block;margin-bottom:12px">
<span class="tag">Prototype · alpha</span>
<h1>gnosem</h1>
<p><strong>Cross-vendor AI memory over MCP.</strong> One memory, every model. Claude, GPT, Kimi, Gemini, Cursor, Windsurf — anything that speaks MCP or can call an HTTP tool.</p>
<a class="cta" href="/upgrade">See pricing →</a>

<h2>1. Sign up</h2>
<pre>curl -sX POST https://gnosem.dev/signup \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com"}'</pre>
<p>Returns a one-time <code>api_key</code>. Save it — it's not shown again.</p>

<h2>2. Add to Claude Desktop / Cursor / any MCP client</h2>
<pre>{
  "mcpServers": {
    "gnosem": {
      "url": "https://gnosem.dev/mcp",
      "headers": { "Authorization": "Bearer gn_your_key_here" }
    }
  }
}</pre>
<p>Restart the client. It now sees 5 tools: <code>memory_write</code>, <code>memory_search</code>, <code>memory_list</code>, <code>memory_forget</code>, <code>memory_supersede</code>.</p>

<h2>3. Try a write + search from any client</h2>
<pre>curl -sX POST https://gnosem.dev/mcp \\
  -H "Authorization: Bearer gn_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_write","arguments":{"content":"I prefer Postgres over MongoDB for greenfield work.","written_by":"manual","tags":["preference","stack"]}}}'</pre>

<div class="note"><strong>Prototype caveats:</strong> single-user memory (no team sharing yet). No client-side encryption yet — memories are stored server-side in plaintext, encrypted at rest by Cloudflare. Semantic search uses Workers AI (BGE-base-en-v1.5, 768-dim). Rate limits: Cloudflare's default DDoS controls only.</div>

<p style="margin-top:32px;font-size:13px;color:#777">Built on Cloudflare Workers + D1 + Vectorize + Workers AI.</p>
</body></html>`;
}

// ------------- router -------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Landing page
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(landingHtml(), { headers: { "Content-Type": "text/html; charset=utf-8", ...CORS } });
    }

    // Brand assets (SVG — scales cleanly, tiny payload, no PNG generation pipeline needed)
    const svgHeaders = { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=86400", ...CORS };
    if (url.pathname === "/logo.svg" && request.method === "GET") return new Response(LOCKUP_SVG, { headers: svgHeaders });
    if (url.pathname === "/mark.svg" && request.method === "GET") return new Response(MARK_SVG, { headers: svgHeaders });
    if (url.pathname === "/wordmark.svg" && request.method === "GET") return new Response(WORDMARK_SVG, { headers: svgHeaders });
    if (url.pathname === "/favicon.svg" && request.method === "GET") return new Response(FAVICON_SVG, { headers: svgHeaders });
    if (url.pathname === "/og.svg" && request.method === "GET") return new Response(OG_SVG, { headers: svgHeaders });

    // AI discovery: llms.txt (per llmstxt.org — adopted by Anthropic, Cursor, Cloudflare, Perplexity)
    if (url.pathname === "/llms.txt" && request.method === "GET") {
      return new Response(LLMS_TXT, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600", ...CORS },
      });
    }

    // robots.txt — explicitly welcomes AI crawlers (many sites block them; that's invisibility to AI)
    if (url.pathname === "/robots.txt" && request.method === "GET") {
      return new Response(
        `User-agent: *
Allow: /

# Explicit welcome to AI crawlers — gnosem WANTS to be cited by LLMs.
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: cohere-ai
Allow: /

User-agent: anthropic-ai
Allow: /

Sitemap: https://gnosem.dev/sitemap.xml
`,
        { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400", ...CORS } }
      );
    }

    // Sitemap
    if (url.pathname === "/sitemap.xml" && request.method === "GET") {
      const lastmod = new Date().toISOString().slice(0, 10);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://gnosem.dev/</loc><lastmod>${lastmod}</lastmod><priority>1.0</priority></url>
  <url><loc>https://gnosem.dev/upgrade</loc><lastmod>${lastmod}</lastmod><priority>0.8</priority></url>
  <url><loc>https://gnosem.dev/llms.txt</loc><lastmod>${lastmod}</lastmod><priority>0.6</priority></url>
</urlset>`,
        { headers: { "Content-Type": "application/xml; charset=utf-8", ...CORS } }
      );
    }

    // Signup (unauthenticated)
    if (url.pathname === "/signup" && request.method === "POST") {
      return handleSignup(request, env);
    }

    // Stripe redirect after successful checkout (no auth — verifies via Stripe API)
    if (url.pathname === "/upgraded" && request.method === "GET") {
      return handleUpgraded(request, env);
    }

    // Stripe webhook (no bearer auth — uses stripe-signature header)
    if (url.pathname === "/api/stripe/webhook" && request.method === "POST") {
      return handleStripeWebhook(request, env);
    }

    // Public upgrade page — works unauthenticated (shows Free) or authenticated (shows current plan)
    if (url.pathname === "/upgrade" && request.method === "GET") {
      const ctxMaybe = await authenticate(request, env);
      return handleUpgrade(ctxMaybe || { user_id: null, plan: "free", subscription_status: null });
    }

    // Everything below requires auth
    const ctx = await authenticate(request, env);
    if (!ctx) return json({ error: "unauthorized — missing or invalid Bearer token" }, 401);

    if (url.pathname === "/keys/rotate" && request.method === "POST") {
      return handleKeyRotate(request, env, ctx.user_id);
    }

    if (url.pathname === "/mcp" && request.method === "POST") {
      return handleMcp(request, env, ctx);
    }

    // MCP over GET is used for SSE stream in some transports; we don't stream server-initiated events,
    // so respond with a friendly hint.
    if (url.pathname === "/mcp" && request.method === "GET") {
      return json({ error: "gnosem MCP transport is HTTP POST only. Use POST /mcp with JSON-RPC 2.0." }, 405);
    }

    return json({ error: "not found" }, 404);
  },
};
