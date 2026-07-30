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
import { MARK_SVG, MARK_INK_SVG, MARK_INVERSE_SVG, LOCKUP_SVG, LOCKUP_INVERSE_SVG, FAVICON_SVG, FAVICON_INK_SVG, OG_SVG, NEWSREADER_LINK } from "./brand.js";
import { POSTS, blogIndexHtml, blogPostHtml } from "./blog.js";
import { dashboardHtml } from "./dashboard.js";

const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
const OPTIMIZE_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const OPTIMIZE_THRESHOLD_CHARS = 400; // only compress memories longer than this
const FREE_TIER_MEMORY_LIMIT = 200;

// Public demo store — the /demo/search + /demo/list endpoints read from this user only.
// User row lives in D1 with subscription_status='internal_demo' (see contextFromUserRow).
// Never accept a user_id from the client for demo endpoints — this constant is the ONLY source.
const DEMO_USER_ID = "8c3f9f38-af29-4320-9b85-a883fe25296d";

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

// Wrap a user row into the same context shape the rest of the code expects.
// Applies the pro/free downgrade + internal_founder exception.
function contextFromUserRow(row) {
  const graceMs = 7 * 24 * 3600 * 1000;
  const stillPaid = row.plan === "pro" && (
    row.subscription_status === "active" ||
    row.subscription_status === "trialing" ||
    row.subscription_status === "internal_founder" ||
    row.subscription_status === "internal_demo" ||
    (row.subscription_period_end && Date.now() < row.subscription_period_end + graceMs)
  );
  return { user_id: row.user_id || row.id, plan: stillPaid ? "pro" : "free", subscription_status: row.subscription_status };
}

// Look up + auth: returns { user_id, plan, subscription_status } or null.
// Accepts either an Authorization: Bearer gn_… header (for MCP clients / API) or a
// gnosem_session HMAC-signed cookie (for the dashboard after magic-link login).
async function authenticate(request, env) {
  const authz = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(gn_[a-f0-9]{32})$/i.exec(authz);
  if (m) {
    const keyHash = await sha256Hex(m[1]);
    const row = await env.DB.prepare(
      `SELECT k.user_id, u.plan, u.subscription_status, u.subscription_period_end
       FROM api_keys k JOIN users u ON u.id = k.user_id
       WHERE k.key_hash = ? AND k.revoked_at IS NULL`
    ).bind(keyHash).first();
    if (!row) return null;
    env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?")
      .bind(Date.now(), keyHash).run().catch(() => {});
    return contextFromUserRow(row);
  }
  // Cookie path
  const cookie = request.headers.get("Cookie") || "";
  const sess = /(?:^|;\s*)gnosem_session=([^;]+)/.exec(cookie);
  if (sess && env.MAGIC_LINK_SECRET) {
    const userId = await verifySessionToken(sess[1], env.MAGIC_LINK_SECRET, 30 * 24 * 3600 * 1000);
    if (userId) {
      const row = await env.DB.prepare("SELECT id, plan, subscription_status, subscription_period_end FROM users WHERE id = ?").bind(userId).first();
      if (row) return contextFromUserRow(row);
    }
  }
  return null;
}

// ------------- rate limiting -------------
//
// Sliding-window per-key counter backed by D1. Two D1 round-trips worst case:
// a SELECT to read the current window + one INSERT/UPDATE to advance it.
// Cheap at prototype scale; graduate to Cloudflare's native ratelimit binding
// (period=60 max) or Durable Objects if per-request D1 writes ever become the
// bottleneck.

async function checkRateLimit(env, key, limit, windowMs) {
  const now = Date.now();
  const windowFloor = now - windowMs;
  const row = await env.DB.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").bind(key).first();
  if (!row || row.window_start < windowFloor) {
    // Fresh window (or first ever hit)
    await env.DB.prepare(
      "INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) " +
      "ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start"
    ).bind(key, now).run();
    return { allowed: true, remaining: limit - 1 };
  }
  if (row.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((row.window_start + windowMs - now) / 1000) };
  }
  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
  return { allowed: true, remaining: limit - row.count - 1 };
}

// ------------- magic-link auth -------------
//
// Passwordless email login for the dashboard. Two secrets required:
//   - MAGIC_LINK_SECRET  (HMAC signing key for tokens + session cookies)
//   - ZEPTOMAIL_API_KEY  (required to actually email — if unset, /auth/request accepts the request
//                         and sends nothing. It never returns the link to the caller.)
//                         Store the token exactly as ZeptoMail issues it, including the
//                         literal "Zoho-enczapikey " prefix — it IS the Authorization header.
//
// Tokens: "<payloadB64>.<sigB64>", where payload is JSON {u: user_id, e: expires_at_ms}
// and sig is HMAC-SHA256(payload, secret). Constant-time compared on verify.

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlDecode = (s) => {
  const pad = "=".repeat((4 - s.length % 4) % 4);
  const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

async function hmacSign(payload, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(sig);
}

// Constant-time string comparison
function ctEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Issue a magic-link token (short-lived; 15 min default).
async function issueMagicToken(userId, secret, ttlMs = 15 * 60 * 1000) {
  const payload = JSON.stringify({ u: userId, e: Date.now() + ttlMs });
  const payloadB64 = b64url(new TextEncoder().encode(payload));
  const sig = await hmacSign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

async function verifyMagicToken(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = await hmacSign(payloadB64, secret);
  if (!ctEq(sig, expected)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
    if (!payload.u || !payload.e) return null;
    if (Date.now() > payload.e) return null;
    return payload.u;
  } catch { return null; }
}

// Session tokens are similar but longer-lived. Same format so verify shares a codepath.
async function issueSessionToken(userId, secret, ttlMs = 30 * 24 * 3600 * 1000) {
  return issueMagicToken(userId, secret, ttlMs);
}
async function verifySessionToken(token, secret, maxAgeMs) {
  return verifyMagicToken(token, secret);
}

// ZeptoMail. Note the Authorization header: the token already carries its own scheme
// prefix ("Zoho-enczapikey ..."), so it is passed through verbatim — no "Bearer", no
// "Basic". Prefixing it would produce a 401 that looks like a bad key.
async function sendMagicLinkEmail(env, to, link) {
  if (!env.ZEPTOMAIL_API_KEY) return { ok: false, reason: "email_not_configured" };
  // Defense in depth: strip every control character + surrounding whitespace, then ensure the
  // required "Zoho-enczapikey " prefix. fetch() throws "Invalid header value" on any newline,
  // and Zoho's API returns 401 on missing prefix — we've hit both, so guard both.
  let authHeader = env.ZEPTOMAIL_API_KEY.replace(/[\x00-\x1f\x7f]/g, "").trim();
  if (!authHeader.startsWith("Zoho-enczapikey ")) authHeader = "Zoho-enczapikey " + authHeader;
  const r = await fetch("https://api.zeptomail.com/v1.1/email", {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      from: { address: "hello@gnosem.dev", name: "Gnosem" },
      to: [{ email_address: { address: to } }],
      subject: "Your Gnosem sign-in link",
      textbody: `Click to sign in to your Gnosem dashboard:\n\n${link}\n\nThe link expires in 15 minutes. If you didn't request this, you can ignore this email.\n\n— Gnosem (a CUETV LLC product)`,
      htmlbody: `<p>Click to sign in to your Gnosem dashboard:</p><p><a href="${link}">${link}</a></p><p>The link expires in 15 minutes. If you didn't request this, you can ignore this email.</p><p>— Gnosem (a CUETV LLC product)</p>`,
    }),
  });
  if (!r.ok) {
    // Body is logged, never returned — see the /auth/request handler for why.
    console.error("zeptomail send failure", r.status, await r.text().catch(() => ""));
    return { ok: false, reason: "send_failed", status: r.status };
  }
  return { ok: true };
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

// ------------- public demo endpoints -------------
//
// Unauthenticated, read-only. Both endpoints hard-code DEMO_USER_ID server-side; the client
// never gets to influence which user is queried. Rate limiting is handled by Cloudflare's
// default DDoS layer — no per-request state beyond a D1 read.

const DEMO_CACHE_HEADERS = { "Cache-Control": "public, max-age=60" };

async function handleDemoSearch(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid JSON body" }, 400, DEMO_CACHE_HEADERS); }
  const query = String(body?.query || "").trim();
  if (!query) return json({ error: "query is required" }, 400, DEMO_CACHE_HEADERS);
  if (query.length > 500) return json({ error: "query too long (max 500 chars)" }, 400, DEMO_CACHE_HEADERS);
  const k = Math.min(Math.max(Number(body?.k) || 5, 1), 10);
  // Force demo user server-side — never trust anything from the client here.
  const ctx = { user_id: DEMO_USER_ID, plan: "pro", subscription_status: "internal_demo" };
  try {
    const result = await toolMemorySearch(env, ctx, { query, k, raw: true });
    return json(result, 200, DEMO_CACHE_HEADERS);
  } catch (e) {
    return json({ error: e.message || "search failed" }, 500, DEMO_CACHE_HEADERS);
  }
}

async function handleDemoList(env) {
  const ctx = { user_id: DEMO_USER_ID, plan: "pro", subscription_status: "internal_demo" };
  try {
    const result = await toolMemoryList(env, ctx, { limit: 50, raw: true });
    return json(result, 200, DEMO_CACHE_HEADERS);
  } catch (e) {
    return json({ error: e.message || "list failed" }, 500, DEMO_CACHE_HEADERS);
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
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${NEWSREADER_LINK}
<style>:root{--ink:#15140F;--paper:#FAF9F7;--terracotta:#A2603F;--ink-soft:#3a3833}
body{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;max-width:640px;margin:44px auto;padding:0 20px;color:var(--ink);background:var(--paper)}
.mast{display:flex;align-items:center;gap:10px;margin-bottom:28px;text-decoration:none;color:var(--ink)}
.mast img{width:32px;height:32px}
.mast .n{font-family:"Newsreader",Georgia,serif;font-size:20px;font-weight:600;letter-spacing:.14em}
h1{font-size:30px;margin:0 0 4px;font-family:"Newsreader",Georgia,serif;font-weight:500;letter-spacing:-.01em}
.plan{display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:.14em;background:var(--ink);color:var(--paper);padding:3px 10px;border-radius:2px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:22px 0}
@media(max-width:520px){.grid{grid-template-columns:1fr}}
.card{background:#fff;border:1.5px solid var(--ink);border-radius:6px;padding:24px 22px;text-decoration:none;color:inherit;display:block;transition:transform .1s}
.card:hover{transform:translateY(-2px);box-shadow:0 4px 0 var(--ink)}
.card.highlight{background:var(--ink);color:var(--paper);position:relative}
.badge{position:absolute;top:-9px;right:14px;background:var(--terracotta);color:var(--paper);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:2px}
.card h3{font-family:"Newsreader",Georgia,serif;font-size:22px;margin-bottom:6px;font-weight:600}
.card .price{font-size:32px;font-weight:600;font-variant-numeric:tabular-nums;margin:8px 0 4px}
.card .price .per{font-size:13px;font-weight:400;opacity:.7;margin-left:4px}
.card .save{font-size:12.5px;color:var(--terracotta);font-weight:600;letter-spacing:.02em;margin-top:2px}
.card.highlight .save{color:#D9A579}
.card ul{list-style:none;padding:0;margin:14px 0 0;font-size:14px}
.card li{padding:4px 0;padding-left:18px;position:relative}
.card li::before{content:"✓";position:absolute;left:0;color:var(--terracotta);font-weight:700}
.card.highlight li::before{color:#D9A579}
.free{padding:14px 18px;background:#fff;border-left:3px solid var(--terracotta);font-size:14px;color:var(--ink-soft);margin-top:8px}
.note{font-size:12.5px;color:var(--ink-soft);border-top:1px solid rgba(21,20,15,.14);margin-top:32px;padding-top:14px}
a{color:var(--terracotta)}
</style></head><body>
<a class="mast" href="/"><img src="/gnosem-mark.svg" alt=""><span class="n">GNOSEM</span></a>
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
    ? `<div style="background:#fff;border:1.5px solid #15140F;border-radius:4px;padding:14px 18px;margin:16px 0"><strong>Your new API key</strong> (save this — it will not be shown again):<pre style="background:#15140F;color:#FAF9F7;padding:10px 14px;border-radius:3px;margin-top:8px;font-family:ui-monospace,SF Mono,Consolas,monospace;font-size:13px;overflow-x:auto">${apiKey}</pre></div>`
    : `<p>Existing account upgraded. Your existing API key(s) now have Pro access.</p>`;
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Welcome to Gnosem Pro</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${NEWSREADER_LINK}
<style>:root{--ink:#15140F;--paper:#FAF9F7;--terracotta:#A2603F;--ink-soft:#3a3833}
body{font:16px/1.6 -apple-system,BlinkMacSystemFont,Inter,sans-serif;max-width:640px;margin:44px auto;padding:0 20px;color:var(--ink);background:var(--paper)}
.mast{display:flex;align-items:center;gap:10px;margin-bottom:28px;text-decoration:none;color:var(--ink)}
.mast img{width:32px;height:32px}
.mast .n{font-family:"Newsreader",Georgia,serif;font-size:20px;font-weight:600;letter-spacing:.14em}
h1{font-family:"Newsreader",Georgia,serif;font-size:30px;margin:0 0 8px;font-weight:500}
.tag{display:inline-block;background:var(--terracotta);color:var(--paper);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:3px 10px;border-radius:2px;margin-bottom:16px}
code{background:#ece5d7;padding:1px 5px;border-radius:2px;font-family:ui-monospace,SF Mono,Consolas,monospace}
pre{background:var(--ink);color:var(--paper);padding:12px 14px;border-radius:3px;font-size:12.5px;overflow-x:auto}
a{color:var(--terracotta)}</style></head>
<body>
<a class="mast" href="/"><img src="/gnosem-mark.svg" alt=""><span class="n">GNOSEM</span></a>
<span class="tag">Payment received</span>
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
<p style="margin-top:22px">${apiKey ? `<a class="btn" style="display:inline-block;background:#15140F;color:#FAF9F7;padding:11px 20px;border-radius:3px;text-decoration:none;font-weight:700;font-size:14px" href="/dashboard?key=${apiKey}">Open your dashboard →</a>` : `<a class="btn" style="display:inline-block;background:#15140F;color:#FAF9F7;padding:11px 20px;border-radius:3px;text-decoration:none;font-weight:700;font-size:14px" href="/dashboard">Open your dashboard →</a>`}</p>
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
${NEWSREADER_LINK}
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
:root{--ink:#15140F;--paper:#FAF9F7;--terracotta:#A2603F;--ink-soft:#3a3833}
body{font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;max-width:720px;margin:44px auto;padding:0 20px;color:var(--ink);background:var(--paper)}
h1{font-family:"Newsreader",Georgia,serif;font-size:clamp(38px,6vw,58px);line-height:1.05;margin:0 0 14px;letter-spacing:-.02em;font-weight:500}
h2{font-family:"Newsreader",Georgia,serif;font-size:22px;font-weight:600;margin:36px 0 10px;letter-spacing:-.005em}
.lockup{display:block;width:280px;max-width:100%;height:auto;margin-bottom:28px}
.tag{display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:.14em;background:var(--ink);color:var(--paper);padding:3px 10px;border-radius:2px;margin-bottom:20px}
.sub{font-family:"Newsreader",Georgia,serif;font-style:italic;font-size:22px;color:var(--ink-soft);margin:0 0 22px;line-height:1.35;max-width:36ch}
.lede{font-size:17px;color:var(--ink-soft);max-width:56ch;margin:0 0 22px}
.lede strong{color:var(--ink);font-weight:600}
.rule{border:none;border-top:1px solid rgba(21,20,15,.14);margin:40px 0 32px;position:relative}
.rule::after{content:"";position:absolute;top:-2px;left:0;width:56px;border-top:3px solid var(--terracotta)}
code,pre{font-family:ui-monospace,SF Mono,Consolas,monospace;font-size:13px}
pre{background:var(--ink);color:var(--paper);padding:14px 16px;border-radius:4px;overflow-x:auto;line-height:1.5}
code{background:#ece5d7;padding:1px 5px;border-radius:2px;font-size:13.5px}
.note{border-left:3px solid var(--terracotta);padding:10px 14px;background:#fff;color:var(--ink-soft);font-size:14px;margin:14px 0}
.cta{display:inline-block;font-weight:700;font-size:14px;background:var(--ink);color:var(--paper);padding:11px 20px;border-radius:3px;text-decoration:none}
a{color:var(--terracotta)}a.cta{color:var(--paper)}
.linkcta{font-weight:600;font-size:14px;color:var(--terracotta);margin-left:14px;text-decoration:none}
.linkcta:hover{text-decoration:underline}
/* Demo widget */
.demo{margin:0 0 8px;padding:22px 22px 20px;background:#fff;border:1.5px solid var(--ink);border-radius:6px}
.demo h2{margin:0 0 4px}
.demo .demo-hint{font-size:13px;color:var(--ink-soft);margin:0 0 14px}
.demo form{display:flex;gap:8px;margin:0}
.demo input[type=text]{flex:1;min-width:0;padding:11px 13px;border:1.5px solid var(--ink);border-radius:3px;background:var(--paper);color:var(--ink);font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
.demo input[type=text]:focus{outline:none;border-color:var(--terracotta);box-shadow:0 0 0 3px rgba(162,96,63,.18)}
.demo button{font-weight:700;font-size:14px;background:var(--ink);color:var(--paper);border:1.5px solid var(--ink);padding:11px 18px;border-radius:3px;cursor:pointer;white-space:nowrap}
.demo button:hover{background:var(--terracotta);border-color:var(--terracotta)}
.demo button:disabled{opacity:.6;cursor:progress}
.demo .demo-meta{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:12.5px;color:var(--ink-soft)}
.demo .demo-meta a{color:var(--terracotta);text-decoration:none;font-weight:600}
.demo .demo-meta a:hover{text-decoration:underline}
.demo .demo-results{margin-top:14px;display:none}
.demo .demo-results.active{display:block}
.demo .demo-result{border-top:1px solid rgba(21,20,15,.14);padding:12px 0 10px}
.demo .demo-result:first-child{border-top:none;padding-top:6px}
.demo .demo-result .rc{font-size:14.5px;color:var(--ink);line-height:1.5}
.demo .demo-result .rm{display:flex;gap:10px;align-items:center;font-size:11px;color:var(--ink-soft);margin-top:6px;letter-spacing:.03em}
.demo .demo-result .score{background:var(--ink);color:var(--paper);padding:2px 7px;border-radius:2px;font-family:ui-monospace,SF Mono,Consolas,monospace;font-size:10.5px;font-weight:600}
.demo .demo-result .rt{color:var(--terracotta)}
.demo .demo-empty{padding:12px 0 4px;color:var(--ink-soft);font-size:14px;font-style:italic}
.demo .demo-error{padding:12px 0 4px;color:#a03636;font-size:14px}
.demo details.demo-seed{margin-top:10px}
.demo details.demo-seed summary{cursor:pointer;font-size:12.5px;color:var(--terracotta);font-weight:600;list-style:none}
.demo details.demo-seed summary::-webkit-details-marker{display:none}
.demo details.demo-seed summary::before{content:"→ ";font-weight:700}
.demo details.demo-seed[open] summary::before{content:"↓ "}
.demo details.demo-seed .seed-list{margin-top:10px;max-height:260px;overflow-y:auto;border:1px solid rgba(21,20,15,.14);border-radius:3px;padding:8px 12px;background:var(--paper)}
.demo details.demo-seed .seed-item{font-size:13px;color:var(--ink-soft);padding:6px 0;border-top:1px solid rgba(21,20,15,.08)}
.demo details.demo-seed .seed-item:first-child{border-top:none}
.demo details.demo-seed .seed-loading{font-size:13px;color:var(--ink-soft);font-style:italic}
</style></head><body>
${LOCKUP_SVG.replace('<svg ', '<svg class="lockup" ')}
<span class="tag">Prototype · alpha</span>
<h1>One memory. Every model.</h1>
<p class="sub">Cross-vendor AI memory over the Model Context Protocol.</p>
<p class="lede">One persistent memory store that <strong>Claude, ChatGPT, Cursor, Windsurf, Kimi, Gemini</strong> — anything that speaks MCP or can call an HTTP tool — can read and write to. Write a fact in one, recall it from any other.</p>
<p><a class="cta" href="/upgrade">See pricing →</a><a class="linkcta" href="/blog/launching-gnosem">Read the launch story →</a><a class="linkcta" href="/dashboard">Sign in →</a></p>
<hr class="rule">

<section class="demo" id="demo" aria-labelledby="demo-title">
  <h2 id="demo-title">Try semantic search</h2>
  <p class="demo-hint">Search a demo memory graph — no signup, no config. This is the same engine you'd wire your models into.</p>
  <form id="demo-form" autocomplete="off" onsubmit="return false">
    <input type="text" id="demo-q" name="query" placeholder="database preference" aria-label="Search query" maxlength="500" required>
    <button type="submit" id="demo-btn">Search →</button>
  </form>
  <noscript><div class="demo-meta" style="margin-top:12px;color:#a03636">JavaScript is required for the live demo. Try <code>curl -X POST https://gnosem.dev/demo/search -H "Content-Type: application/json" -d '{"query":"database preference"}'</code> or sign up for a key below.</div></noscript>
  <div class="demo-meta">
    <span>Searching a demo memory graph — no signup</span>
  </div>
  <div class="demo-results" id="demo-results" role="region" aria-live="polite"></div>
  <details class="demo-seed" id="demo-seed">
    <summary>See what's in it</summary>
    <div class="seed-list" id="demo-seed-list"><div class="seed-loading">Loading demo memories…</div></div>
  </details>
</section>
<script>
(function(){
  var form = document.getElementById('demo-form');
  if (!form) return;
  var input = document.getElementById('demo-q');
  var btn = document.getElementById('demo-btn');
  var out = document.getElementById('demo-results');
  var seed = document.getElementById('demo-seed');
  var seedList = document.getElementById('demo-seed-list');
  var examples = ['database preference','which vector store should I use','kubernetes decision','how do I feel about coffee','what did I decide about the encoder cluster','favorite editor'];
  var i = Math.floor(Math.random()*examples.length);
  input.placeholder = examples[i];
  var rotate = setInterval(function(){
    if (document.activeElement === input || input.value) { clearInterval(rotate); return; }
    i = (i+1) % examples.length;
    input.placeholder = examples[i];
  }, 3200);
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function renderMatches(matches){
    if (!matches || !matches.length) {
      out.innerHTML = '<div class="demo-empty">No matches. Try a broader term — the demo store has ~25 memories.</div>';
      out.classList.add('active');
      return;
    }
    var html = matches.slice(0,5).map(function(m){
      var score = (typeof m.score === 'number') ? m.score.toFixed(3) : '—';
      var tags = Array.isArray(m.tags) && m.tags.length ? m.tags.map(function(t){ return '<span class="rt">#'+esc(t)+'</span>'; }).join(' ') : '';
      return '<div class="demo-result"><div class="rc">'+esc(m.content)+'</div><div class="rm"><span class="score">'+esc(score)+'</span>'+tags+'</div></div>';
    }).join('');
    out.innerHTML = html;
    out.classList.add('active');
  }
  form.addEventListener('submit', function(ev){
    ev.preventDefault();
    var q = input.value.trim();
    if (!q) return;
    btn.disabled = true;
    var prevLabel = btn.textContent;
    btn.textContent = 'Searching…';
    out.classList.add('active');
    out.innerHTML = '<div class="demo-empty">Searching…</div>';
    fetch('/demo/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, k: 5 }),
    }).then(function(r){ return r.json().then(function(j){ return { ok: r.ok, body: j }; }); })
      .then(function(res){
        if (!res.ok) { out.innerHTML = '<div class="demo-error">'+esc(res.body && res.body.error || 'search failed')+'</div>'; return; }
        renderMatches(res.body.matches || []);
      })
      .catch(function(){ out.innerHTML = '<div class="demo-error">Network error — try again.</div>'; })
      .then(function(){ btn.disabled = false; btn.textContent = prevLabel; });
  });
  var seedLoaded = false;
  seed.addEventListener('toggle', function(){
    if (!seed.open || seedLoaded) return;
    fetch('/demo/list').then(function(r){ return r.json(); }).then(function(j){
      var mems = (j && j.memories) || [];
      if (!mems.length) { seedList.innerHTML = '<div class="seed-loading">No memories yet.</div>'; return; }
      seedList.innerHTML = mems.map(function(m){
        var tags = Array.isArray(m.tags) && m.tags.length ? ' <span class="rt" style="color:#A2603F">'+m.tags.map(function(t){ return '#'+esc(t); }).join(' ')+'</span>' : '';
        return '<div class="seed-item">'+esc(m.content)+tags+'</div>';
      }).join('');
      seedLoaded = true;
    }).catch(function(){ seedList.innerHTML = '<div class="seed-loading">Failed to load — try again.</div>'; });
  });
})();
</script>

<h2>1. Sign up</h2>
<pre>curl -sX POST https://gnosem.dev/signup \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com"}'</pre>
<p>Returns a one-time <code>api_key</code>. Save it — it's not shown again.</p>

<h2>2. Install</h2>
<pre>npx gnosem-install</pre>
<p>Auto-detects and configures Claude Desktop, Claude Code, Cursor, Windsurf, and Zed on this machine. Prompts for your API key, merges the <code>gnosem</code> entry into each config alongside your existing MCP servers, backs up every file it touches. Then restart the affected clients.</p>
<p style="margin-top:12px;font-size:14px;color:var(--ink-soft)">Prefer to configure manually? Add this to your client's MCP config:</p>
<pre>{
  "mcpServers": {
    "gnosem": {
      "url": "https://gnosem.dev/mcp",
      "headers": { "Authorization": "Bearer gn_your_key_here" }
    }
  }
}</pre>
<p>After restart, your assistant sees 5 tools: <code>memory_write</code>, <code>memory_search</code>, <code>memory_list</code>, <code>memory_forget</code>, <code>memory_supersede</code>.</p>

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

    // Landing page — short cache so branding/copy updates propagate within ~5 min.
    if (url.pathname === "/" && (request.method === "GET" || request.method === "HEAD")) {
      return new Response(request.method === "HEAD" ? null : landingHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300, must-revalidate", ...CORS },
      });
    }

    // Blog
    if ((url.pathname === "/blog" || url.pathname === "/blog/") && request.method === "GET") {
      return new Response(blogIndexHtml(), { headers: { "Content-Type": "text/html; charset=utf-8", ...CORS } });
    }
    if (url.pathname.startsWith("/blog/") && request.method === "GET") {
      const slug = url.pathname.slice("/blog/".length).replace(/\/$/, "");
      const post = POSTS.find(p => p.slug === slug);
      if (post) return new Response(blogPostHtml(post), { headers: { "Content-Type": "text/html; charset=utf-8", ...CORS } });
    }

    // .well-known/mcp/server-card.json — for MCP registries that auto-scan servers (Smithery, Glama).
    // Our /mcp endpoint is Bearer-gated, so anonymous auto-scanners can't call initialize/tools/list.
    // This card exposes the same manifest data statically. Same shape as server.json for registry.mcp.io.
    if (url.pathname === "/.well-known/mcp/server-card.json" && request.method === "GET") {
      return json({
        name: "dev.gnosem/gnosem",
        title: "Gnosem",
        description: "Cross-vendor AI memory over MCP. One semantic store, readable and writeable from every MCP client.",
        version: "1.0.0",
        websiteUrl: "https://gnosem.dev",
        repository: { url: "https://github.com/gnosem/gnosem", source: "github" },
        remotes: [{ type: "streamable-http", url: "https://gnosem.dev/mcp" }],
        auth: { type: "bearer", tokenAcquisitionUrl: "https://gnosem.dev/signup" },
        tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });
    }

    // Brand assets — file names match brand/*.svg from the Seal system. Short cache (1h).
    // The old /mark.svg + /logo.svg + /favicon.svg + /og.svg paths from the pre-Seal palette
    // are still routed for backward compat but point to the new SVGs so anything embedded on
    // external sites keeps working with the current brand.
    const svgHeaders = { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=3600", ...CORS };
    const svgOK = (method) => method === "GET" || method === "HEAD";
    const svg = (body) => new Response(request.method === "HEAD" ? null : body, { headers: svgHeaders });
    if (svgOK(request.method)) {
      switch (url.pathname) {
        // New Seal-system paths (match brand/ file names)
        case "/gnosem-mark.svg":         return svg(MARK_SVG);
        case "/gnosem-mark-ink.svg":     return svg(MARK_INK_SVG);
        case "/gnosem-mark-inverse.svg": return svg(MARK_INVERSE_SVG);
        case "/gnosem-lockup.svg":       return svg(LOCKUP_SVG);
        case "/gnosem-lockup-inverse.svg": return svg(LOCKUP_INVERSE_SVG);
        case "/favicon-ink.svg":         return svg(FAVICON_INK_SVG);
        // Legacy paths — point at new SVGs so external embeds pick up the refresh
        case "/mark.svg":                return svg(MARK_SVG);
        case "/logo.svg":                return svg(LOCKUP_SVG);
        case "/favicon.svg":             return svg(FAVICON_SVG);
        case "/og.svg":                  return svg(OG_SVG);
      }
    }

    // Health check — public, no auth. Uptime probes + external monitors hit this.
    // Deliberately shallow: no DB round-trips, just confirms the Worker is warm and routing.
    if (url.pathname === "/health" && (request.method === "GET" || request.method === "HEAD")) {
      return new Response(request.method === "HEAD" ? null : JSON.stringify({ ok: true, service: "gnosem", time: Date.now() }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS },
      });
    }

    // Dashboard shell — public HTML; the client-side JS handles auth via Bearer in Authorization header.
    if ((url.pathname === "/dashboard" || url.pathname === "/dashboard/") && (request.method === "GET" || request.method === "HEAD")) {
      return new Response(request.method === "HEAD" ? null : dashboardHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300, must-revalidate", ...CORS },
      });
    }

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

    // Sitemap — includes all posts so Google discovers new content the first crawl after publish.
    if (url.pathname === "/sitemap.xml" && request.method === "GET") {
      const today = new Date().toISOString().slice(0, 10);
      const staticUrls = [
        { loc: "https://gnosem.dev/", lastmod: today, priority: "1.0", changefreq: "weekly" },
        { loc: "https://gnosem.dev/upgrade", lastmod: today, priority: "0.9", changefreq: "monthly" },
        { loc: "https://gnosem.dev/blog/", lastmod: POSTS[0]?.published || today, priority: "0.8", changefreq: "weekly" },
        { loc: "https://gnosem.dev/llms.txt", lastmod: today, priority: "0.6", changefreq: "weekly" },
      ];
      const postUrls = POSTS.map(p => ({
        loc: `https://gnosem.dev/blog/${p.slug}`,
        lastmod: p.updated || p.published,
        priority: "0.7",
        changefreq: "monthly",
      }));
      const urls = [...staticUrls, ...postUrls]
        .map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`)
        .join("\n");
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
        { headers: { "Content-Type": "application/xml; charset=utf-8", ...CORS } }
      );
    }

    // Signup (unauthenticated) — rate-limited by IP: 5 per hour.
    if (url.pathname === "/signup" && request.method === "POST") {
      const ip = request.headers.get("cf-connecting-ip") || "unknown";
      const rl = await checkRateLimit(env, "signup:" + ip, 5, 3600 * 1000);
      if (!rl.allowed) return json({ error: "too many signups from this address; try again in ~" + Math.ceil(rl.retryAfter / 60) + " min" }, 429, { "Retry-After": String(rl.retryAfter) });
      return handleSignup(request, env);
    }

    // Public read-only demo store. Endpoints hard-code the demo user_id server-side.
    if (url.pathname === "/demo/search" && request.method === "POST") {
      return handleDemoSearch(request, env);
    }
    if (url.pathname === "/demo/list" && (request.method === "GET" || request.method === "HEAD")) {
      return handleDemoList(env);
    }

    // Magic-link auth (no bearer required — enters authenticated state via email verification)
    // Rate-limited by IP: 10 per 15 minutes.
    if (url.pathname === "/auth/request" && request.method === "POST") {
      const ip = request.headers.get("cf-connecting-ip") || "unknown";
      const rl = await checkRateLimit(env, "auth:" + ip, 10, 900 * 1000);
      if (!rl.allowed) return json({ error: "too many sign-in requests from this address; try again in ~" + Math.ceil(rl.retryAfter / 60) + " min" }, 429, { "Retry-After": String(rl.retryAfter) });
      if (!env.MAGIC_LINK_SECRET) return json({ error: "email login not configured on this deployment" }, 503);
      let body; try { body = await request.json(); } catch { body = {}; }
      const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "valid email required" }, 400);
      const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
      // Same response either way so we don't leak whether the email is registered.
      if (!user) return json({ ok: true, note: "if that email is registered, a link is on the way" });
      const token = await issueMagicToken(user.id, env.MAGIC_LINK_SECRET);
      const link = `${url.origin}/auth/verify?token=${encodeURIComponent(token)}`;
      const send = await sendMagicLinkEmail(env, email, link);
      // The link is NEVER returned to the caller. It only ever reaches the inbox.
      // Anything else hands a session to whoever knows a registered address.
      if (!send.ok) {
        // Logged, never surfaced. A 502 here would rebuild the enumeration oracle from the
        // other side: an unregistered address gets 200, while a registered address whose
        // delivery failed (bounced, suppressed, provider outage) gets 502 — which is exactly
        // the distinction this endpoint exists to hide. The operator sees the failure in
        // logs; the caller cannot tell the two cases apart.
        console.error("magic-link send failed", JSON.stringify({ reason: send.reason, status: send.status }));
      }
      // Identical to the unregistered-email response above, so /auth/request cannot be
      // used to enumerate which addresses have accounts.
      return json({ ok: true, note: "if that email is registered, a link is on the way" });
    }
    if (url.pathname === "/auth/verify" && request.method === "GET") {
      if (!env.MAGIC_LINK_SECRET) return json({ error: "email login not configured on this deployment" }, 503);
      const token = url.searchParams.get("token") || "";
      const userId = await verifyMagicToken(token, env.MAGIC_LINK_SECRET);
      if (!userId) return new Response("Sign-in link is invalid or expired. Request a new one from the dashboard.", { status: 400, headers: { "Content-Type": "text/plain", ...CORS } });
      const session = await issueSessionToken(userId, env.MAGIC_LINK_SECRET);
      // Set a 30-day HttpOnly Secure cookie and redirect to the dashboard.
      const cookie = `gnosem_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 3600}`;
      return new Response(null, { status: 302, headers: { "Location": "/dashboard", "Set-Cookie": cookie, ...CORS } });
    }
    if (url.pathname === "/auth/logout" && request.method === "POST") {
      return new Response(null, {
        status: 204,
        headers: { "Set-Cookie": "gnosem_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0", ...CORS },
      });
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

    // /me — dashboard-facing account summary. Requires auth. Returns email/plan/memory_count/memory_limit.
    if (url.pathname === "/me" && (request.method === "GET" || request.method === "HEAD")) {
      const user = await env.DB.prepare("SELECT id, email, plan, subscription_status, subscription_period_end FROM users WHERE id = ?").bind(ctx.user_id).first();
      const { results } = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM memories WHERE user_id = ? AND forgotten_at IS NULL AND superseded_by IS NULL"
      ).bind(ctx.user_id).all();
      const memoryCount = results?.[0]?.n ?? 0;
      return json({
        user_id: user.id,
        email: user.email,
        plan: ctx.plan,
        subscription_status: user.subscription_status,
        subscription_period_end: user.subscription_period_end,
        memory_count: memoryCount,
        memory_limit: ctx.plan === "free" ? FREE_TIER_MEMORY_LIMIT : null,
      });
    }

    // /export — full JSON dump of the caller's active memories. Portable format, no lock-in.
    // Includes both raw content and LLM-optimized form when present, plus all metadata + tags.
    // Response is a downloadable attachment. Forgotten + superseded rows are excluded by default;
    // pass ?include_forgotten=1 or ?include_superseded=1 to include them (audit / migration use cases).
    if (url.pathname === "/export" && (request.method === "GET" || request.method === "HEAD")) {
      const includeForgotten = url.searchParams.get("include_forgotten") === "1";
      const includeSuperseded = url.searchParams.get("include_superseded") === "1";
      const filters = ["user_id = ?"];
      if (!includeForgotten) filters.push("forgotten_at IS NULL");
      if (!includeSuperseded) filters.push("superseded_by IS NULL");
      const sql = `SELECT id, content, content_optimized, tags, written_by, session_id, created_at, superseded_by, forgotten_at
                   FROM memories
                   WHERE ${filters.join(" AND ")}
                   ORDER BY created_at ASC`;
      const rows = (await env.DB.prepare(sql).bind(ctx.user_id).all()).results || [];
      const memories = rows.map(r => ({
        id: r.id,
        content: r.content,
        content_optimized: r.content_optimized || null,
        tags: (() => { try { return JSON.parse(r.tags || "[]"); } catch { return []; } })(),
        written_by: r.written_by,
        session_id: r.session_id,
        created_at: r.created_at,
        ...(r.superseded_by ? { superseded_by: r.superseded_by } : {}),
        ...(r.forgotten_at ? { forgotten_at: r.forgotten_at } : {}),
      }));
      const dump = {
        format: "gnosem/export/v1",
        exported_at: Date.now(),
        user_id: ctx.user_id,
        plan: ctx.plan,
        counts: { memories: memories.length, includes_forgotten: includeForgotten, includes_superseded: includeSuperseded },
        memories,
      };
      const filename = `gnosem-export-${new Date().toISOString().slice(0, 10)}.json`;
      return new Response(request.method === "HEAD" ? null : JSON.stringify(dump, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
          ...CORS,
        },
      });
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
