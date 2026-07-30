// Tests for @gnosem/client. Uses Node's built-in test runner (node --test).
//
// Two flavors:
//  1. Offline unit tests with an injected mock fetch — always run.
//  2. Live round-trip against https://gnosem.dev — only if GNOSEM_API_KEY is set.
//
// Tests use the compiled ESM bundle under dist/, so run `npm run build` first.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Gnosem,
  GnosemAuthError,
  GnosemRateLimitError,
  GnosemAPIError,
  GnosemError,
} from "../dist/index.js";

// --------------- offline unit tests ---------------

test("constructor is lazy — no key at construction is fine", () => {
  // No throw. Deferring auth failure to first request is deliberate.
  const g = new Gnosem({ apiKey: undefined, baseUrl: "https://example.invalid" });
  assert.ok(g);
});

test("missing API key throws GnosemAuthError on first request", async () => {
  // Clear env BEFORE constructing so the fallback lookup sees nothing.
  const prev = process.env.GNOSEM_API_KEY;
  delete process.env.GNOSEM_API_KEY;
  try {
    const g = new Gnosem({
      baseUrl: "https://example.invalid",
      // fetch should never be called if the pre-flight key check fires first
      fetch: async () => {
        throw new Error("fetch should not have been called");
      },
    });
    await assert.rejects(() => g.me(), (err) => {
      assert.ok(err instanceof GnosemAuthError);
      return true;
    });
  } finally {
    if (prev !== undefined) process.env.GNOSEM_API_KEY = prev;
  }
});

test("write() sends JSON-RPC 2.0 to /mcp with Bearer auth", async () => {
  let captured;
  const mockFetch = async (url, init) => {
    captured = { url, init };
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          content: [{ type: "text", text: "{}" }],
          structuredContent: { id: "mem_123", created_at: 1_700_000_000_000 },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const g = new Gnosem({ apiKey: "gn_test", baseUrl: "https://x.test", fetch: mockFetch });
  const res = await g.write("hello", { tags: ["a"], writtenBy: "unit-test" });
  assert.equal(res.id, "mem_123");
  assert.equal(captured.url, "https://x.test/mcp");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.Authorization, "Bearer gn_test");
  const body = JSON.parse(captured.init.body);
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.method, "tools/call");
  assert.equal(body.params.name, "memory_write");
  assert.equal(body.params.arguments.content, "hello");
  assert.deepEqual(body.params.arguments.tags, ["a"]);
  // camelCase writtenBy is translated to snake_case for the wire.
  assert.equal(body.params.arguments.written_by, "unit-test");
});

test("supersede() maps camelCase oldId/newContent to snake_case", async () => {
  let capturedBody;
  const mockFetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          content: [{ type: "text", text: "{}" }],
          structuredContent: { old_id: "old", new_id: "new", created_at: 1 },
        },
      }),
      { status: 200 },
    );
  };
  const g = new Gnosem({ apiKey: "gn_test", baseUrl: "https://x.test", fetch: mockFetch });
  await g.supersede({ oldId: "old", newContent: "new content", tags: ["t"] });
  assert.equal(capturedBody.params.arguments.old_id, "old");
  assert.equal(capturedBody.params.arguments.new_content, "new content");
  assert.deepEqual(capturedBody.params.arguments.tags, ["t"]);
});

test("401 response → GnosemAuthError with status + body", async () => {
  const mockFetch = async () =>
    new Response(JSON.stringify({ error: "bad key" }), { status: 401 });
  const g = new Gnosem({ apiKey: "gn_wrong", baseUrl: "https://x.test", fetch: mockFetch });
  await assert.rejects(() => g.me(), (err) => {
    assert.ok(err instanceof GnosemAuthError);
    assert.equal(err.status, 401);
    assert.match(err.message, /bad key/);
    return true;
  });
});

test("429 response → GnosemRateLimitError with retryAfter parsed from header", async () => {
  const mockFetch = async () =>
    new Response(JSON.stringify({ error: "slow down" }), {
      status: 429,
      headers: { "Retry-After": "42" },
    });
  const g = new Gnosem({ apiKey: "gn_test", baseUrl: "https://x.test", fetch: mockFetch });
  await assert.rejects(() => g.me(), (err) => {
    assert.ok(err instanceof GnosemRateLimitError);
    assert.equal(err.retryAfter, 42);
    assert.equal(err.status, 429);
    return true;
  });
});

test("500 response → GnosemAPIError", async () => {
  const mockFetch = async () =>
    new Response(JSON.stringify({ error: "boom" }), { status: 500 });
  const g = new Gnosem({ apiKey: "gn_test", baseUrl: "https://x.test", fetch: mockFetch });
  await assert.rejects(() => g.me(), (err) => {
    assert.ok(err instanceof GnosemAPIError);
    assert.equal(err.status, 500);
    return true;
  });
});

test("JSON-RPC -32001 error → GnosemAuthError", async () => {
  const mockFetch = async () =>
    new Response(
      JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32001, message: "Authentication required" } }),
      { status: 200 },
    );
  const g = new Gnosem({ apiKey: "gn_test", baseUrl: "https://x.test", fetch: mockFetch });
  await assert.rejects(() => g.write("x"), (err) => {
    assert.ok(err instanceof GnosemAuthError);
    assert.match(err.message, /Authentication required/);
    return true;
  });
});

test("all error classes extend GnosemError", () => {
  assert.ok(new GnosemAuthError("x") instanceof GnosemError);
  assert.ok(new GnosemRateLimitError("x") instanceof GnosemError);
  assert.ok(new GnosemAPIError("x", 500) instanceof GnosemError);
});

test("error message never contains the API key", async () => {
  const secretKey = "gn_supersecret_should_not_leak";
  const mockFetch = async () =>
    new Response(JSON.stringify({ error: "denied" }), { status: 401 });
  const g = new Gnosem({ apiKey: secretKey, baseUrl: "https://x.test", fetch: mockFetch });
  try {
    await g.me();
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(!err.message.includes(secretKey));
    assert.ok(!(err.body || "").includes(secretKey));
  }
});

// --------------- live round-trip (opt-in via GNOSEM_API_KEY) ---------------

const LIVE_KEY = process.env.GNOSEM_API_KEY;

test("live: me() returns user object", { skip: !LIVE_KEY }, async () => {
  const g = new Gnosem();
  const me = await g.me();
  assert.ok(me.user_id, "user_id should be present");
  assert.ok(me.email, "email should be present");
  assert.ok(typeof me.memory_count === "number");
});

test("live: write → search round-trip", { skip: !LIVE_KEY }, async () => {
  const g = new Gnosem();
  const marker = `sdk-ts-test-${Date.now()}`;
  const content = `SDK integration test marker ${marker}. Please ignore.`;
  const write = await g.write(content, { tags: ["sdk-ts-test"], writtenBy: "sdk-ts-test", force: true });
  assert.ok(write.id, "write should return id");

  // Immediately search for the exact marker. Even if the LLM optimizer rewrote
  // the content, the semantic embedding for the marker phrase should still
  // land it in the top results.
  const search = await g.search(marker, { k: 10 });
  const hit = search.matches.find((m) => m.id === write.id);
  assert.ok(hit, `expected to find just-written id ${write.id} in search results`);

  // Clean up so we don't accumulate test junk.
  const forget = await g.forget(write.id);
  assert.equal(forget.ok, true);
});
