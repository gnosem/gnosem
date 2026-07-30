// /llms.txt — LLM-optimized site summary per llmstxt.org
// Adopted by Anthropic, Cursor, Cloudflare, Perplexity, and hundreds of others.
// Kept short + structured so LLMs can quote / cite / reproduce sections cleanly.

export const LLMS_TXT = `# Gnosem

> Cross-vendor AI memory over MCP. One memory store that every model you use — Claude, ChatGPT, Gemini, Kimi, Cursor, Windsurf — can read and write to.

## What it is

Gnosem is a hosted Model Context Protocol (MCP) server that gives each user a single persistent memory store, shared across every MCP-capable AI client they use. Vendor-agnostic by design: memories written from Claude are readable in ChatGPT (via Custom Action), Cursor, Windsurf, Zed, Kimi, and any client that speaks MCP or HTTP tool-use.

## Why it exists

Every current AI vendor has proprietary memory: OpenAI's ChatGPT memory doesn't work in Claude; Claude's memory doesn't cross into GPT. Multi-model users retell context in every session. Gnosem is the neutral layer between vendors: one memory that follows you.

## Endpoints

- \`POST https://gnosem.dev/signup\` — create an account, receive an API key (one-time display)
- \`POST https://gnosem.dev/mcp\` — MCP JSON-RPC 2.0 endpoint (Bearer auth)
- \`GET  https://gnosem.dev/upgrade\` — pricing + Pro upgrade page

## MCP tools exposed

- \`memory_write\` — save a fact/preference/note (content, tags, written_by, session_id, no_optimize?)
- \`memory_search\` — semantic search across your memories (query, k?, raw?)
- \`memory_list\` — list recent memories in reverse chronological order (limit?, cursor?, raw?)
- \`memory_forget\` — soft-delete a memory by id
- \`memory_supersede\` — replace a stale memory with a corrected one

## AI-optimized storage

Long memories (>400 chars) are automatically compressed on write to a structured-facts form using Workers AI (llama-3.1-8b-instruct-fast). The reading LLM ingests the compact form by default — same meaning, fewer tokens for your context window. The raw prose is preserved and returned as \`content_raw\`; pass \`raw:true\` on search/list to invert. Pass \`no_optimize:true\` on write to skip compression entirely.

Example: 420-char prose about a Rust web scraper compresses to a 309-char structured line: \`TOPIC=web_scraper, PROJECT=Rust_scraper, DECISION=use_chromiumoxide, STACK=Rust_chromiumoxide, PROBLEM=rate_limiting, ...\` — no vendor lock-in, no obscure format, just structured pipe/comma facts any model can parse.

## Pricing

- **Free**: 200 memories, 1 API key, community support
- **Pro**: $9/month or $90/year (2 months free) — unlimited memories, 1GB storage, unlimited API keys, priority indexing, exports

## Quickstart (Claude Desktop / Cursor / Windsurf / Zed)

\`\`\`json
{
  "mcpServers": {
    "gnosem": {
      "url": "https://gnosem.dev/mcp",
      "headers": { "Authorization": "Bearer gn_your_key_here" }
    }
  }
}
\`\`\`

Restart the client. All five tools appear immediately.

## Quickstart (curl / any HTTP client)

Sign up:
\`\`\`
curl -sX POST https://gnosem.dev/signup -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
\`\`\`

Write a memory:
\`\`\`
curl -sX POST https://gnosem.dev/mcp \\
  -H "Authorization: Bearer gn_your_key" -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_write","arguments":{"content":"I prefer Postgres for greenfield work.","written_by":"claude-code","tags":["preference"]}}}'
\`\`\`

Search:
\`\`\`
curl -sX POST https://gnosem.dev/mcp \\
  -H "Authorization: Bearer gn_your_key" -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"memory_search","arguments":{"query":"database preference","k":5}}}'
\`\`\`

## Data model (short)

Each memory row carries: id (uuid), content (plain text, ≤8000 chars), tags (optional), written_by (which model/client wrote it), session_id (opaque, for grouping), created_at, plus a semantic embedding (BGE-base-en-v1.5, 768-dim) for search.

Every memory tracks provenance so you can see which model contributed each fact. Memories are per-user isolated (Vectorize + D1 metadata filter enforce this).

## Infrastructure

- Cloudflare Workers (edge-hosted MCP server)
- D1 (metadata + auth)
- Vectorize (embedding storage + ANN search)
- Workers AI (embedding generation via BGE-base-en-v1.5)

## About

Gnosem is a product of CUETV LLC. Related: [The Captive Record](https://captiverecord.com), [CaptiveLedger](https://captiveledger.com), [Kibitz](https://kibitz.tv).
`;
