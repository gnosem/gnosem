<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/gnosem/gnosem/main/brand/lockup-dark.svg">
    <img alt="Gnosem" src="https://raw.githubusercontent.com/gnosem/gnosem/main/brand/lockup-light.svg" width="360">
  </picture>
</p>

<p align="center">
  <strong>Cross-vendor AI memory over MCP.</strong><br>
  One memory store. Every model. Claude, ChatGPT, Gemini, Kimi, Cursor, Windsurf — anything that speaks MCP.
</p>

<p align="center">
  <a href="https://gnosem.dev">gnosem.dev</a>
  ·
  <a href="https://gnosem.dev/upgrade">pricing</a>
  ·
  <a href="https://gnosem.dev/llms.txt">llms.txt</a>
</p>

---

## What it is

Gnosem is a hosted [Model Context Protocol](https://modelcontextprotocol.io) server that gives each user one persistent memory store — readable and writeable from every MCP-capable AI client. Vendor-agnostic by design: a fact saved from Claude is visible in ChatGPT, Cursor, Windsurf, Zed, Kimi, and any other MCP client (or plain HTTP tool call) using the same API key.

The problem it solves: every AI vendor has its own proprietary memory. OpenAI's ChatGPT memory doesn't work in Claude. Anthropic's projects don't cross into GPT. Multi-model users retell context in every session. Gnosem is the neutral layer between vendors.

## Tools exposed

- `memory_write` — save a fact, preference, decision, or note. `content`, `tags?`, `written_by?` (provenance), `session_id?`, `no_optimize?`
- `memory_search` — semantic search across your memories. `query`, `k?`, `raw?`
- `memory_list` — list recent memories in reverse-chronological order. `limit?`, `cursor?`, `raw?`
- `memory_forget` — soft-delete a memory by id
- `memory_supersede` — replace a stale memory with a corrected one

## AI-optimized storage

Long memories (>400 chars) are automatically compressed on write to a structured-facts form (Workers AI, llama-3.1-8b-instruct-fast) with a strict prompt: `TOPIC=..., PROJECT=..., DECISION=..., STACK=..., PROBLEM=...`. The reading LLM ingests the compact form by default — fewer tokens, same meaning. The raw prose is preserved and returned as `content_raw`; pass `raw:true` to invert. Pass `no_optimize:true` on write to skip compression entirely.

Compression is guarded — if the model output isn't actually shorter, gnosem falls back to storing raw only. Fail-open: any AI error still saves the memory.

## Quickstart — Claude Desktop / Cursor / Windsurf / Zed

```json
{
  "mcpServers": {
    "gnosem": {
      "url": "https://gnosem.dev/mcp",
      "headers": { "Authorization": "Bearer gn_your_api_key" }
    }
  }
}
```

Restart the client. All five memory tools appear immediately.

Get an API key:
```bash
curl -sX POST https://gnosem.dev/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'
```
The key is displayed once. Save it.

## Quickstart — any HTTP client

```bash
# Write
curl -sX POST https://gnosem.dev/mcp \
  -H "Authorization: Bearer gn_your_key" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_write","arguments":{"content":"I prefer Postgres for greenfield work.","written_by":"claude-code","tags":["preference"]}}}'

# Search
curl -sX POST https://gnosem.dev/mcp \
  -H "Authorization: Bearer gn_your_key" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"memory_search","arguments":{"query":"database preference","k":5}}}'
```

## Pricing

| Plan | Price | Memories | API keys | Storage |
|---|---|---|---|---|
| Free | $0 | 200 | 1 | shared |
| Pro | $9/mo or $90/yr | Unlimited | Unlimited | 1 GB |

Upgrade at [gnosem.dev/upgrade](https://gnosem.dev/upgrade).

## Data model

Each memory row: `id` (uuid), `content` (raw, ≤8000 chars), `content_optimized` (structured facts, nullable), `tags` (json array), `written_by` (provenance — which model wrote it), `session_id` (opaque grouping), `created_at`, plus a semantic embedding ([BGE-base-en-v1.5](https://huggingface.co/BAAI/bge-base-en-v1.5), 768-dim) stored in Vectorize.

Every memory tracks provenance so you can see which model contributed which fact. Memories are per-user isolated at both the D1 metadata layer (`user_id` filter on every query) and the Vectorize layer (metadata index on `user_id`).

Correction chains via `memory_supersede`: the old row is marked superseded (excluded from reads) and the new row references it. Soft-delete via `memory_forget` (excluded from reads and removed from the vector index).

## Infrastructure

- **[Cloudflare Workers](https://workers.cloudflare.com/)** — edge-hosted MCP server, no cold starts
- **[D1](https://developers.cloudflare.com/d1/)** — metadata + auth
- **[Vectorize](https://developers.cloudflare.com/vectorize/)** — 768-dim embedding storage + cosine ANN search, per-user metadata filter
- **[Workers AI](https://developers.cloudflare.com/workers-ai/)** — embedding generation (`@cf/baai/bge-base-en-v1.5`) and content optimization (`@cf/meta/llama-3.1-8b-instruct-fast`)
- **[Stripe](https://stripe.com)** — subscription billing

Latency: sub-100ms for read, ~200-800ms for write (dominated by embedding + optimization inference).

## AI discovery

The service is designed to be discoverable and citeable by LLMs:

- [`/llms.txt`](https://gnosem.dev/llms.txt) — LLM-optimized site summary per [llmstxt.org](https://llmstxt.org)
- [`/robots.txt`](https://gnosem.dev/robots.txt) — explicitly welcomes GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and every major AI crawler
- [`/sitemap.xml`](https://gnosem.dev/sitemap.xml) — standard sitemap
- Schema.org JSON-LD (`SoftwareApplication` + `FAQPage`) embedded in the landing page

## Self-hosting

The Worker source in this repo can be deployed to your own Cloudflare account. You'll need:

1. A Cloudflare account with Workers, D1, Vectorize, and Workers AI enabled
2. `npx wrangler d1 create <name>` — creates the D1 database. Update `wrangler.jsonc` with the returned id
3. `npx wrangler vectorize create <name> --dimensions=768 --metric=cosine` — creates the index
4. `npx wrangler vectorize create-metadata-index <name> --property-name=user_id --type=string` — required for per-user isolation
5. `npx wrangler d1 execute <name> --remote --file=schema.sql` then apply `migrations/*.sql` in order
6. `npx wrangler secret put STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (only needed if you want billing)
7. `npx wrangler deploy`

The hosted service ([gnosem.dev](https://gnosem.dev)) is the recommended way to use Gnosem — one API key, no infra to run, memories stay reachable when you switch machines.

## About

Gnosem is a product of [CUETV LLC](https://cuetv.us), a Missouri holding company operating a family of new-media and infrastructure products.

## License

[MIT](./LICENSE)
