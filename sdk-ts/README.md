# @gnosem/client

Official TypeScript client for [Gnosem](https://gnosem.dev) — hosted, cross-vendor AI memory over MCP.

- Zero runtime dependencies. Uses the native `fetch` in Node 18+.
- Full TypeScript types.
- Works with any hosted Gnosem endpoint (defaults to `https://gnosem.dev`).
- Same account and memories as your Claude / ChatGPT / Cursor MCP integration.

## Install

```sh
npm install @gnosem/client
```

Requires Node.js 18+ (for native `fetch`). ESM only.

## Quickstart

```ts
import { Gnosem } from "@gnosem/client";

const g = new Gnosem({ apiKey: "gn_..." });
// or: const g = new Gnosem();  // reads process.env.GNOSEM_API_KEY

const { id } = await g.write("I prefer Postgres over MongoDB", {
  tags: ["preference"],
  writtenBy: "my-script",
});

const { matches } = await g.search("database preference", { k: 5 });
for (const m of matches) console.log(m.content, m.score);
```

Get an API key at <https://gnosem.dev>.

## API

### Constructor

```ts
new Gnosem(opts?: {
  apiKey?: string;         // defaults to process.env.GNOSEM_API_KEY
  baseUrl?: string;        // defaults to "https://gnosem.dev"
  fetch?: typeof fetch;    // inject a mock for tests
  timeout?: number;        // request timeout in ms, defaults to 30000
})
```

The constructor is lazy — it will not throw if `apiKey` is missing. The first
call that needs auth will throw `GnosemAuthError`.

### `write(content, opts?)` → `{ id, created_at, ... }`

Write a new memory. Content is capped at 8KB. The server semantically de-dupes
against existing memories by default (Cosine ≥ 0.85 on BGE embeddings).

```ts
await g.write("I use pnpm, not npm", {
  tags: ["preference", "tooling"],
  writtenBy: "onboarding-script",
  sessionId: "abc-123",   // group memories by session
  noOptimize: true,       // skip the LLM rewrite pass
  force: true,            // bypass semantic dedup
});
```

Result fields may include `deduped`, `exact_duplicate`, `matched_score`,
`matched_id`, `optimized` — see the source or `curl` a real response.

### `search(query, opts?)` → `{ matches: Memory[] }`

Semantic search across all memories on the account.

```ts
const { matches } = await g.search("what's the user's editor?", {
  k: 5,                         // default: 10
  raw: true,                    // return original content, not LLM-optimized
  tags: ["preference"],         // narrow to memories with these tags
  writtenBy: "my-script",       // narrow by author
  sessionId: "abc-123",         // narrow by session
  since: 1_700_000_000_000,     // unix ms
  until: 1_800_000_000_000,     // unix ms
  mode: "hybrid",               // "semantic" | "keyword" | "hybrid"
});
```

### `list(opts?)` → `{ memories: Memory[], cursor: number | null }`

List memories in reverse chronological order. Paginate with `cursor`.

```ts
const page = await g.list({ limit: 20 });
if (page.cursor) {
  const next = await g.list({ cursor: page.cursor });
}
```

Same filter options as `search()` (tags, writtenBy, sessionId, since, until).

### `forget(id)` → `{ ok: true, id }`

Soft-delete a memory. Idempotent — forgetting an already-forgotten id returns `ok: true`.

```ts
await g.forget("mem_abc123");
```

### `supersede({ oldId, newContent, ...})` → `{ old_id, new_id, created_at }`

Replace a stale memory with a corrected one. Use this for corrections; use
`forget()` for pure deletions.

```ts
await g.supersede({
  oldId: "mem_abc",
  newContent: "Actually, the user prefers MongoDB now.",
  tags: ["preference"],
  writtenBy: "correction-script",
});
```

### `writeBulk(memories)` → `{ results: WriteResult[] }`

Batch write. Results are returned in the same order as inputs.

```ts
const bulk = await g.writeBulk([
  { content: "fact 1", tags: ["a"] },
  { content: "fact 2", tags: ["b"], force: true },
]);
```

### `me()` → account summary

```ts
const me = await g.me();
// { user_id, email, plan, subscription_status, subscription_period_end,
//   memory_count, memory_limit }
```

### `export(opts?)` → full JSON dump

Portable format, no lock-in.

```ts
const dump = await g.export();
// { format: "gnosem/export/v1", exported_at, user_id, plan, counts, memories }

const withAudit = await g.export({
  includeForgotten: true,
  includeSuperseded: true,
});
```

### `rotateKey()` → `{ apiKey, api_key, note }`

Revoke every existing API key and issue a new one. Update every client
immediately after.

```ts
const { apiKey } = await g.rotateKey();
// Save apiKey somewhere secure. All prior keys are now dead.
```

## Errors

All errors extend `GnosemError`:

```ts
import {
  GnosemError,
  GnosemAuthError,       // 401 / 403 / missing key
  GnosemRateLimitError,  // 429 — has .retryAfter (seconds)
  GnosemAPIError,        // any other non-2xx (4xx / 5xx)
} from "@gnosem/client";

try {
  await g.write("...");
} catch (err) {
  if (err instanceof GnosemRateLimitError) {
    await new Promise((r) => setTimeout(r, err.retryAfter * 1000));
    // ...retry
  }
  if (err instanceof GnosemError) {
    console.error(err.status, err.body);
  }
}
```

API keys are never included in error messages or bodies.

## Data shapes

Responses stay in snake_case exactly as the server returns them (so it matches
what you'd see from `curl`). Argument options in TypeScript use camelCase
(`writtenBy`, `oldId`, `noOptimize`) and are translated internally.

```ts
interface Memory {
  id: string;
  content: string;
  content_optimized?: string | null;
  tags: string[];
  written_by: string | null;
  session_id: string | null;
  created_at: number;
  score?: number;              // present on search results
  superseded_by?: string;      // present on export audit rows
  forgotten_at?: number;       // present on export audit rows
}
```

## Publishing

Owners with access to the `@gnosem` npm scope can publish:

```sh
npm run build
npm publish --access public
```

The `.npmignore` keeps source and tests out of the published tarball — only
`dist/`, `README.md`, and `LICENSE` ship.

## License

MIT © CUETV LLC
