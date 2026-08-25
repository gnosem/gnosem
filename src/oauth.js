// oauth.js — OAuth 2.1 authorization server for Gnosem (gnosem.dev)
// Implements: RFC 8414 (AS metadata), RFC 9728 (protected resource metadata),
// RFC 7591 (dynamic client registration), authorization-code grant with
// mandatory PKCE S256 (RFC 7636), and rotating refresh tokens.
//
// Design: access tokens are minted as `gn_` + 32 hex — the exact format the
// existing authenticate() regex accepts — and stored (hashed) as rows in the
// existing `api_keys` table with kind='oauth' and an expires_at. Every SQL
// isolation guarantee (WHERE user_id = ?) is therefore unchanged.

const ACCESS_TTL_MS = 8 * 3600 * 1000;        // 8h access tokens
const REFRESH_TTL_MS = 60 * 24 * 3600 * 1000; // 60d refresh tokens, rotated on use
const CODE_TTL_MS = 120 * 1000;               // 2m authorization codes, single-use

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256B64url(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return b64url(new Uint8Array(d));
}

function b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randHex(nBytes) {
  const a = crypto.getRandomValues(new Uint8Array(nBytes));
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS, ...extra },
  });
}

function oauthErr(error, description, status = 400) {
  return json({ error, error_description: description }, status);
}

function redirectUriAllowed(u) {
  try {
    const p = new URL(u);
    if (p.protocol === "https:") return true;
    if (p.protocol === "http:" && (p.hostname === "localhost" || p.hostname === "127.0.0.1")) return true;
    return false;
  } catch {
    return false;
  }
}

async function userFromSession(request, env, verifySessionToken) {
  const cookie = request.headers.get("Cookie") || "";
  const m = /(?:^|;\s*)gnosem_session=([^;]+)/.exec(cookie);
  if (!m || !env.MAGIC_LINK_SECRET || !verifySessionToken) return null;
  const userId = await verifySessionToken(m[1], env.MAGIC_LINK_SECRET, 30 * 24 * 3600 * 1000);
  return userId || null;
}

async function userFromApiKey(env, key) {
  if (!/^gn_[a-f0-9]{32}$/i.test(key || "")) return null;
  const keyHash = await sha256Hex(key);
  const row = await env.DB.prepare(
    `SELECT user_id FROM api_keys
     WHERE key_hash = ? AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?)`
  ).bind(keyHash, Date.now()).first();
  return row ? row.user_id : null;
}

function consentPage({ clientName, scope, params, needsKey, csrf, error }) {
  const hidden = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("\n");
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize ${esc(clientName)} — Gnosem</title>
<style>
  body{font:16px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;max-width:34rem;margin:8vh auto;padding:0 1.25rem;color:#1a1a1a;background:#fafaf8}
  h1{font-size:1.15rem;font-weight:600}
  .card{border:1px solid #d7d5cf;border-radius:6px;padding:1.25rem;background:#fff}
  .scope{background:#f1f0ec;border-radius:4px;padding:.5rem .75rem;margin:.75rem 0;font-size:.9rem}
  input[type=password]{width:100%;box-sizing:border-box;font:inherit;padding:.5rem;border:1px solid #c9c7c1;border-radius:4px;margin:.25rem 0 .75rem}
  button{font:inherit;padding:.5rem 1.1rem;border-radius:4px;border:1px solid #1a1a1a;cursor:pointer}
  .approve{background:#1a1a1a;color:#fff}
  .deny{background:transparent;margin-left:.5rem}
  .err{color:#a03020;font-size:.9rem}
  .fine{color:#6b6a66;font-size:.8rem;margin-top:1rem}
</style></head><body>
<h1>Gnosem</h1>
<div class="card">
  <p><strong>${esc(clientName)}</strong> is asking to read and write your Gnosem memories.</p>
  <div class="scope">scope: ${esc(scope || "memory")} — memory_write, memory_search, memory_list, memory_forget, memory_supersede, memory_write_bulk</div>
  ${error ? `<p class="err">${esc(error)}</p>` : ""}
  <form method="post" action="/oauth/authorize">
    ${hidden}
    <input type="hidden" name="csrf" value="${esc(csrf || "")}">
    ${needsKey
      ? `<label for="api_key">Paste your Gnosem API key (gn_…) to prove account ownership:</label>
         <input id="api_key" name="api_key" type="password" autocomplete="off" placeholder="gn_...">`
      : ""}
    <button class="approve" name="decision" value="approve" type="submit">Approve</button>
    <button class="deny" name="decision" value="deny" type="submit">Deny</button>
  </form>
  <p class="fine">Approving issues this client its own expiring token. Your API key is never shared with the client, and you can revoke access from the dashboard.</p>
</div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...(csrf ? { "Set-Cookie": `gnosem_oauth_csrf=${csrf}; Path=/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } : {}) } }
  );
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function mintTokens(env, userId, client) {
  const now = Date.now();
  const access = "gn_" + randHex(16); // matches /^gn_[a-f0-9]{32}$/ in authenticate()
  const label = ("oauth:" + (client.client_name || client.client_id)).slice(0, 64);
  await env.DB.prepare(
    "INSERT INTO api_keys (key_hash, user_id, label, created_at, kind, expires_at) VALUES (?, ?, ?, ?, 'oauth', ?)"
  ).bind(await sha256Hex(access), userId, label, now, now + ACCESS_TTL_MS).run();

  const refresh = "rt_" + randHex(32);
  await env.DB.prepare(
    "INSERT INTO oauth_refresh_tokens (token_hash, user_id, client_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(await sha256Hex(refresh), userId, client.client_id, now, now + REFRESH_TTL_MS).run();

  return {
    access_token: access,
    token_type: "bearer",
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    refresh_token: refresh,
    scope: "memory",
  };
}

// Returns a Response for OAuth-owned paths, or null so the worker router continues.
export async function handleOAuth(request, env, url, deps = {}) {
  const path = url.pathname;
  const issuer = url.origin;

  const owned =
    path === "/.well-known/oauth-authorization-server" ||
    path === "/.well-known/oauth-protected-resource" ||
    path === "/oauth/register" ||
    path === "/oauth/authorize" ||
    path === "/oauth/token" ||
    path === "/oauth/revoke";
  if (!owned) return null;

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (path === "/.well-known/oauth-protected-resource") {
    return json({
      resource: issuer,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: ["memory"],
    });
  }
  if (path === "/.well-known/oauth-authorization-server") {
    return json({
      issuer,
      authorization_endpoint: issuer + "/oauth/authorize",
      token_endpoint: issuer + "/oauth/token",
      registration_endpoint: issuer + "/oauth/register",
      revocation_endpoint: issuer + "/oauth/revoke",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["memory"],
    });
  }

  if (path === "/oauth/register" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return oauthErr("invalid_client_metadata", "Body must be JSON"); }
    const uris = body.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || !uris.every(redirectUriAllowed)) {
      return oauthErr("invalid_redirect_uri", "redirect_uris must be a non-empty array of https (or localhost http) URLs");
    }
    const clientId = "cli_" + randHex(16);
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO oauth_clients (client_id, client_name, redirect_uris, created_at) VALUES (?, ?, ?, ?)"
    ).bind(clientId, String(body.client_name || "").slice(0, 120) || null, JSON.stringify(uris), now).run();
    return json({
      client_id: clientId,
      client_id_issued_at: Math.floor(now / 1000),
      client_name: body.client_name || undefined,
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }, 201);
  }

  if (path === "/oauth/authorize") {
    const p = request.method === "GET"
      ? Object.fromEntries(url.searchParams)
      : Object.fromEntries((await request.formData()).entries());

    const client = p.client_id
      ? await env.DB.prepare("SELECT client_id, client_name, redirect_uris FROM oauth_clients WHERE client_id = ?").bind(p.client_id).first()
      : null;
    const registered = client ? JSON.parse(client.redirect_uris) : [];
    // Unknown client or unregistered redirect_uri: NEVER redirect (open-redirect guard).
    if (!client || !registered.includes(p.redirect_uri)) {
      return new Response("Invalid client_id or redirect_uri.", { status: 400, headers: { "Content-Type": "text/plain" } });
    }
    const redirectErr = (error) => {
      const r = new URL(p.redirect_uri);
      r.searchParams.set("error", error);
      if (p.state) r.searchParams.set("state", p.state);
      return new Response(null, { status: 302, headers: { Location: r.toString(), "Cache-Control": "no-store" } });
    };
    if (p.response_type !== "code") return redirectErr("unsupported_response_type");
    if (!p.code_challenge || (p.code_challenge_method || "S256") !== "S256") return redirectErr("invalid_request");

    const clientName = client.client_name || client.client_id;
    const passthru = {
      client_id: p.client_id, redirect_uri: p.redirect_uri, response_type: "code",
      state: p.state || "", scope: p.scope || "memory",
      code_challenge: p.code_challenge, code_challenge_method: "S256",
    };

    if (request.method === "GET") {
      const sessionUser = await userFromSession(request, env, deps.verifySessionToken);
      const csrf = randHex(16);
      return consentPage({ clientName, scope: p.scope, params: passthru, needsKey: !sessionUser, csrf });
    }

    if (p.decision !== "approve") return redirectErr("access_denied");

    let userId = null;
    if (p.api_key) {
      userId = await userFromApiKey(env, p.api_key.trim());
      if (!userId) return consentPage({ clientName, scope: p.scope, params: passthru, needsKey: true, csrf: randHex(16), error: "That API key was not recognized." });
    } else {
      const cookie = request.headers.get("Cookie") || "";
      const cs = /(?:^|;\s*)gnosem_oauth_csrf=([^;]+)/.exec(cookie);
      if (!cs || cs[1] !== p.csrf) {
        return consentPage({ clientName, scope: p.scope, params: passthru, needsKey: false, csrf: randHex(16), error: "Session check failed — please approve again." });
      }
      userId = await userFromSession(request, env, deps.verifySessionToken);
      if (!userId) return consentPage({ clientName, scope: p.scope, params: passthru, needsKey: true, csrf: randHex(16), error: "You are not signed in — paste your API key instead." });
    }

    const code = randHex(32);
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(await sha256Hex(code), p.client_id, userId, p.redirect_uri, p.code_challenge, p.scope || "memory", now, now + CODE_TTL_MS).run();

    const r = new URL(p.redirect_uri);
    r.searchParams.set("code", code);
    if (p.state) r.searchParams.set("state", p.state);
    return new Response(null, { status: 302, headers: { Location: r.toString(), "Cache-Control": "no-store" } });
  }

  // RFC 7009 token revocation. Always 200 for well-formed requests, whether or not
  // the token existed — revocation must not be an oracle for token validity.
  if (path === "/oauth/revoke" && request.method === "POST") {
    let p2;
    const ct2 = request.headers.get("Content-Type") || "";
    if (ct2.includes("json")) { try { p2 = await request.json(); } catch { p2 = {}; } }
    else p2 = Object.fromEntries((await request.formData()).entries());
    const token = String(p2.token || "");
    if (token) {
      const h = await sha256Hex(token);
      const now = Date.now();
      if (token.startsWith("rt_")) {
        await env.DB.prepare("UPDATE oauth_refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL").bind(now, h).run();
      } else {
        await env.DB.prepare("UPDATE api_keys SET revoked_at = ? WHERE key_hash = ? AND kind = 'oauth' AND revoked_at IS NULL").bind(now, h).run();
      }
    }
    return new Response(null, { status: 200, headers: CORS });
  }

  if (path === "/oauth/token" && request.method === "POST") {
    let p;
    const ct = request.headers.get("Content-Type") || "";
    if (ct.includes("json")) { try { p = await request.json(); } catch { p = {}; } }
    else p = Object.fromEntries((await request.formData()).entries());

    await env.DB.prepare("DELETE FROM oauth_codes WHERE expires_at < ?").bind(Date.now()).run().catch(() => {});

    if (p.grant_type === "authorization_code") {
      if (!p.code || !p.code_verifier || !p.client_id) return oauthErr("invalid_request", "code, code_verifier, and client_id are required");
      const codeHash = await sha256Hex(p.code);
      const row = await env.DB.prepare("SELECT * FROM oauth_codes WHERE code_hash = ?").bind(codeHash).first();
      // Single-use: burn the code on ANY redemption attempt, before validation.
      if (row) await env.DB.prepare("DELETE FROM oauth_codes WHERE code_hash = ?").bind(codeHash).run();
      if (!row || row.expires_at < Date.now()) return oauthErr("invalid_grant", "Authorization code is invalid or expired");
      if (row.client_id !== p.client_id) return oauthErr("invalid_grant", "client_id mismatch");
      if (p.redirect_uri && p.redirect_uri !== row.redirect_uri) return oauthErr("invalid_grant", "redirect_uri mismatch");
      if ((await sha256B64url(p.code_verifier)) !== row.code_challenge) return oauthErr("invalid_grant", "PKCE verification failed");

      const client = await env.DB.prepare("SELECT client_id, client_name FROM oauth_clients WHERE client_id = ?").bind(row.client_id).first();
      return json(await mintTokens(env, row.user_id, client));
    }

    if (p.grant_type === "refresh_token") {
      if (!p.refresh_token || !p.client_id) return oauthErr("invalid_request", "refresh_token and client_id are required");
      const rtHash = await sha256Hex(p.refresh_token);
      const row = await env.DB.prepare(
        "SELECT * FROM oauth_refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?"
      ).bind(rtHash, Date.now()).first();
      if (!row || row.client_id !== p.client_id) return oauthErr("invalid_grant", "Refresh token is invalid, expired, or revoked");

      const client = await env.DB.prepare("SELECT client_id, client_name FROM oauth_clients WHERE client_id = ?").bind(row.client_id).first();
      const tokens = await mintTokens(env, row.user_id, client);
      await env.DB.prepare(
        "UPDATE oauth_refresh_tokens SET revoked_at = ?, rotated_to = ? WHERE token_hash = ?"
      ).bind(Date.now(), await sha256Hex(tokens.refresh_token), rtHash).run();
      return json(tokens);
    }

    return oauthErr("unsupported_grant_type", "Use authorization_code or refresh_token");
  }

  return oauthErr("invalid_request", "Unsupported method for " + path, 405);
}
