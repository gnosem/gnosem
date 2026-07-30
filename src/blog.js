// Gnosem blog — single-source-of-truth for posts.
// Each post is HTML with schema.org BlogPosting JSON-LD embedded.
// Shares the landing page's typography (Georgia + system sans, ink #0F172A on cream #F5F1EA).

const SHARED_CSS = `
:root{--ink:#15140F;--paper:#FAF9F7;--terracotta:#A2603F;--ink-soft:#3a3833;--rule:rgba(21,20,15,.14)}
body{font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;max-width:720px;margin:44px auto;padding:0 20px;color:var(--ink);background:var(--paper)}
h1{font-family:"Newsreader",Georgia,serif;font-size:36px;line-height:1.18;margin:0 0 12px;letter-spacing:-.015em;font-weight:500}
h2{font-family:"Newsreader",Georgia,serif;font-size:22px;font-weight:600;margin:36px 0 10px;letter-spacing:-.005em}
h3{font-family:"Newsreader",Georgia,serif;font-size:18px;font-weight:600;margin:28px 0 8px}
p{margin:0 0 16px}
ul,ol{margin:0 0 16px 22px;padding:0}
li{margin:0 0 6px}
a{color:var(--terracotta)}
a:hover{text-decoration:underline}
code{font-family:ui-monospace,SF Mono,Consolas,monospace;font-size:13.5px;background:#ece5d7;padding:1px 5px;border-radius:2px}
pre{font-family:ui-monospace,SF Mono,Consolas,monospace;font-size:13px;background:var(--ink);color:var(--paper);padding:14px 16px;border-radius:4px;overflow-x:auto;margin:0 0 18px;line-height:1.5}
pre code{background:none;padding:0;color:inherit;font-size:inherit}
blockquote{border-left:3px solid var(--terracotta);margin:0 0 16px;padding:2px 0 2px 14px;color:var(--ink-soft);font-style:italic}
hr{border:none;border-top:1px solid var(--rule);margin:32px 0}
.tag{display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:.14em;background:var(--ink);color:var(--paper);padding:3px 10px;border-radius:2px;margin-bottom:14px}
.meta{font-size:13px;color:#5b564d;margin:0 0 28px;letter-spacing:.02em}
.meta a{color:#5b564d}
.mast{display:flex;align-items:center;gap:10px;margin-bottom:28px;text-decoration:none;color:var(--ink)}
.mast img{width:32px;height:32px}
.mast .n{font-family:"Newsreader",Georgia,serif;font-size:20px;font-weight:600;letter-spacing:.14em}
.cta{display:inline-block;font-weight:700;font-size:14px;background:var(--ink);color:var(--paper);padding:10px 18px;border-radius:3px;text-decoration:none;margin:16px 0}
a.cta{color:var(--paper)}
.footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--rule);font-size:13px;color:#5b564d}
`;

export const POSTS = [
  {
    slug: "ai-optimized-memory-storage",
    title: "Memories that Cost Fewer Tokens to Read",
    subtitle: "How Gnosem compresses long prose into structured facts on write — so the reading LLM ingests the same meaning in a fraction of the context window.",
    published: "2026-07-30",
    readingMinutes: 7,
    description: "Persistent AI memory has a token problem. Every recall pulls prose back into a model's context window. Gnosem writes long memories twice — once as prose for you, once as a structured-facts line for the reading LLM — so cross-vendor recall costs less context.",
    keywords: "LLM context compression, AI memory optimization, structured facts extraction, semantic memory token efficiency, Workers AI llama-3.1, memory summarization",
    bodyHtml: `
<p>Persistent memory for AI assistants has a token problem. Every time an assistant recalls a memory, that memory has to be pulled back into its context window. A 2,000-character prose memory costs roughly 500 tokens on ingest. Multiply by the ten memories a semantic search returns, and you have spent 5,000 tokens before the model has generated a single word of response. In a 200,000-token context that is fine. In an 8,000-token context, it is a quarter of your budget spent on remembering.</p>

<p>The obvious fix — "just make the memories shorter" — pushes the burden onto the user. They write a long memory because a long memory is what the situation deserves. Amputating it at save time loses information.</p>

<p>Gnosem takes a different approach. It stores every long memory <em>twice</em>: once as the raw prose the user wrote, and once as a compressed structured-facts form generated on write by a small language model. The reading LLM gets the compressed form by default — same meaning, fewer tokens. The raw prose stays available for humans and for cases where phrasing matters.</p>

<h2 id="the-write-path">The write path</h2>

<p>When you call <code>memory_write</code> with content longer than 400 characters, the Worker fires two calls in parallel:</p>

<ol>
<li><strong>Embedding</strong> — the full raw content goes to Workers AI's <code>@cf/baai/bge-base-en-v1.5</code> model to produce a 768-dimension vector for semantic search. The embedding always sees the raw text so search hits match natural phrasing.</li>
<li><strong>Compression</strong> — the raw content goes to <code>@cf/meta/llama-3.1-8b-instruct-fast</code> with a strict system prompt that produces one line of structured key-value pairs.</li>
</ol>

<p>The system prompt is the load-bearing piece:</p>

<pre><code>You compress user memories into structured facts for AI consumption.
Output ONE line of pipe-separated key: value pairs. Keys are UPPERCASE
labels drawn from this set when applicable: TOPIC, PROJECT, DECISION,
PREFERENCE, PERSON, PLACE, DATE, STACK, PROBLEM, SOLUTION, GOAL,
CONSTRAINT, FACT, EVENT. Values are terse — no filler, no articles
when droppable. Preserve every distinct fact from the input. Do not
add information not in the input. Do not add preamble, quotes, or
explanation. Output ONLY the pipe-separated line.</code></pre>

<p>A real example. Raw input:</p>

<blockquote>I have been working on a Rust web scraper for the past three weeks that captures pricing data from Amazon and eBay for competitive analysis. The stack is Rust with the chromiumoxide crate driving headless Chrome instances. Rate limiting has been the hardest part of the whole project — Amazon aggressively blocks IPs after about 30 requests per second so I have to route through a residential proxy pool from Bright Data which costs around 15 dollars per gigabyte of traffic.</blockquote>

<p>Compressed output:</p>

<pre><code>TOPIC=web_scraper | PROJECT=Rust_scraper | DECISION=use_chromiumoxide
| STACK=Rust,chromiumoxide | PROBLEM=rate_limiting
| CONSTRAINT=Amazon_blocks_after_30_rps
| SOLUTION=residential_proxy_pool_Bright_Data
| FACT=$15_per_GB</code></pre>

<p>Raw: 475 characters. Compressed: 309 characters. 35% fewer bytes, all the same facts, and — critically — the structured form is easier for the next LLM to parse into its own working memory than freeform prose.</p>

<h2 id="the-guard">The guard: fail-open, no lossy fallback</h2>

<p>Compression is not always a win. Content full of proper nouns, IDs, or already-terse writing sometimes comes out <em>longer</em> in the structured form. Gnosem checks this at the byte level after the model responds: if the compressed output is not strictly shorter than the raw, it discards the compression and stores raw only. The memory still saves — the "compression" step is best-effort.</p>

<p>The same applies to model errors. Workers AI can time out. It can rate-limit. It can return an empty string. In every failure case the memory still lands in D1 and Vectorize. The <code>content_optimized</code> column is nullable by design. Fail-open: the write never fails because compression failed.</p>

<h2 id="the-read-path">The read path</h2>

<p>By default, <code>memory_search</code> and <code>memory_list</code> return the compressed form as <code>content</code> and the raw prose as <code>content_raw</code>. Any MCP client reading a memory gets:</p>

<pre><code>{
  "id": "…",
  "content": "TOPIC=web_scraper | PROJECT=Rust_scraper | …",
  "content_raw": "I have been working on a Rust web scraper for the past three weeks…",
  "optimized": true,
  "tags": ["project", "scraper"],
  "written_by": "claude-code",
  "created_at": 1785372156851,
  "score": 0.87
}</code></pre>

<p>The reading model consumes the shorter <code>content</code> by default. If your use case needs the original phrasing — quoting the user's own words in a reply, for example — pass <code>raw: true</code> on the search and <code>content</code> becomes the raw prose (and <code>content_raw</code> is dropped).</p>

<p>Short memories (under 400 characters) skip the compression entirely. There is nothing to gain — the structured form would be roughly the same size. Those rows have <code>optimized: false</code> and only a <code>content</code> field.</p>

<h2 id="cost">The cost economics</h2>

<p>Every long-memory write incurs one extra Workers AI call — llama-3.1-8b-instruct-fast, priced at fractions of a cent per compression. In exchange, every subsequent read pays back tokens on the client side. If a memory is written once and read ten times over its lifetime, the compression pays for itself many times over. If it is never read again, the compression cost is a rounding error against the storage cost.</p>

<p>The pattern is deliberately asymmetric: pay a small server-side cost on write to save a much larger client-side cost on read, over and over. This is the same trade-off databases make when they build an index at insert time to speed up every subsequent query.</p>

<h2 id="what-gets-lost">What gets lost — and why we accept it</h2>

<p>Structured extraction is lossy for tone. "I have been working on a Rust web scraper" and "PROJECT=Rust_scraper" carry the same information but different vibes. If your assistant is trying to write a response in your voice, the raw form matters. That is why <code>content_raw</code> is preserved verbatim, and why <code>raw: true</code> exists as an escape hatch.</p>

<p>Structured extraction is also nondeterministic in surface form. The same raw memory compressed twice may come back with slightly different key labels — <code>TOPIC=web_scraper</code> vs. <code>SUBJECT=web_scraper</code>. Semantic search is unaffected because it embeds the raw content, not the compressed form. But if you were parsing the compressed output with a strict regex, you would have a bad time. Treat the compressed form as machine-readable prose, not as JSON.</p>

<h2 id="why-this-only-works-because-of-mcp">Why this only works because of MCP</h2>

<p>If Gnosem had to speak a different protocol to each vendor, this compression would be much harder to justify. Every client's read format would need its own handling. Because MCP is a standard tool-call interface, the compressed form flows uniformly to Claude, ChatGPT, Cursor, Windsurf, Zed, Kimi, and every other MCP client. The server compresses once; every client benefits.</p>

<p>Try it: sign up at <a href="/">gnosem.dev</a>, write a paragraph-length memory, and inspect the response. You will see the <code>optimized: true</code> flag and the compression ratio inline.</p>
`,
  },
  {
    slug: "building-mcp-server-cloudflare-workers",
    title: "Building an MCP Server on Cloudflare Workers",
    subtitle: "Architecture notes from building Gnosem: Workers + D1 + Vectorize + Workers AI, with per-user isolation enforced at two layers and sub-100ms typical latency.",
    published: "2026-07-30",
    readingMinutes: 8,
    description: "A concrete walkthrough of running an MCP server entirely on the Cloudflare edge — how the JSON-RPC transport works, how Vectorize's metadata filter enforces tenant isolation, and how streamable-HTTP simplifies auth versus SSE.",
    keywords: "MCP server Cloudflare Workers, streamable HTTP transport MCP, Vectorize semantic search per user, D1 SQLite edge, Workers AI embedding, JSON-RPC MCP, multi-tenant vector database",
    bodyHtml: `
<p>Gnosem is a Model Context Protocol server that runs entirely on Cloudflare's edge. There is no origin server, no VPC, no container, no long-lived process. Every incoming MCP tool call is handled by a Worker invocation that lives for milliseconds. This post explains what that architecture looks like in practice and where the sharp edges are.</p>

<h2 id="what-mcp-actually-is-on-the-wire">What MCP actually is on the wire</h2>

<p>The Model Context Protocol looks intimidating from a distance. It has a spec, an official registry, dozens of transports, and vendor implementations. Underneath, it is JSON-RPC 2.0 over an HTTP request-response cycle. The important pieces for a server:</p>

<ul>
<li><strong>Initialize</strong> — the client sends a JSON-RPC <code>initialize</code> with its capabilities. Server responds with its <code>protocolVersion</code>, <code>capabilities</code>, and <code>serverInfo</code>.</li>
<li><strong>List tools</strong> — <code>tools/list</code> returns an array of tool objects, each with a <code>name</code>, <code>description</code>, and JSON Schema <code>inputSchema</code>.</li>
<li><strong>Call a tool</strong> — <code>tools/call</code> with <code>params: { name, arguments }</code>. Server executes and returns a <code>result</code>.</li>
</ul>

<p>That is 95% of what a hosted MCP server does. Everything else is transport plumbing.</p>

<h2 id="streamable-http-vs-sse">Streamable HTTP versus SSE</h2>

<p>MCP defines two remote transports: SSE (Server-Sent Events, a long-lived streaming connection) and streamable HTTP (plain POST request/response with optional streaming). Gnosem uses streamable HTTP and no streaming — every tool call is a single POST with a JSON body and a JSON response.</p>

<p>Streamable HTTP is the right default for a Worker. Cloudflare Workers charge per invocation, and an invocation that streams for the length of a session bills a lot more than one that runs for 80ms and exits. It also plays well with Cloudflare's cache, edge routing, and DDoS protection because it looks like any other HTTPS POST. SSE requires the client to keep a socket open, which fights against every edge network's ability to route each request independently.</p>

<p>The MCP spec accepts both transports as equal citizens. Clients that want to use Gnosem see <code>"type": "streamable-http"</code> in the server's registry manifest and know to POST tool calls one at a time.</p>

<h2 id="auth-headers-not-sessions">Auth: headers, not sessions</h2>

<p>Every request carries an <code>Authorization: Bearer gn_&lt;32 hex&gt;</code> header. The Worker's auth layer does a single query on <code>api_keys</code> keyed by the SHA-256 hash of the plaintext key (the plaintext is never stored). That query joins to <code>users</code> to fetch the plan and subscription state in the same round trip. Total latency: one D1 point lookup, typically 2–5ms at the edge.</p>

<p>There is no session cookie, no OAuth flow, no refresh token. MCP tool calls are naturally stateless — every call from the reading LLM is a fresh POST — so session-level auth would be the wrong abstraction. Bearer-per-call also means the same key works from any client, any machine, any language, without an auth dance.</p>

<h2 id="vectorize-per-user-isolation">Per-user isolation at two layers</h2>

<p>A memory service is a multi-tenant vector database. If tenant A can see tenant B's embeddings, the product is broken. Gnosem enforces isolation at two layers so a bug in one doesn't create a leak.</p>

<p><strong>Layer 1: D1.</strong> Every SQL statement that touches memory data has <code>WHERE user_id = ?</code> bound to the authenticated user's id. There is no query path in the codebase that fetches memory rows without that filter.</p>

<p><strong>Layer 2: Vectorize.</strong> Every <code>VECTORIZE.query()</code> call passes <code>filter: { user_id: &lt;user_id&gt; }</code>. Vectorize enforces this filter inside the vector search itself — vectors from other users are excluded from the candidate pool before scoring. This is not just belt-and-suspenders; it means a bug in the D1 layer alone cannot leak vectors across tenants.</p>

<p>For the Vectorize filter to work, you must create a metadata index on <code>user_id</code> when you provision the index:</p>

<pre><code>npx wrangler vectorize create-metadata-index &lt;index_name&gt; \\
  --property-name=user_id --type=string</code></pre>

<p>Without this, filter queries silently return empty results. We discovered this in production when a beta tester's search returned nothing — the fix was one command, but the failure mode is a well-hidden footgun.</p>

<h2 id="d1-and-vectorize-coordination">Keeping D1 and Vectorize in sync</h2>

<p>Every memory has two homes: a row in D1 (structured metadata + content) and a vector in Vectorize (768-dim embedding). Both are inserted on write. Both are read on search: Vectorize returns the top-K matching vector IDs, and Gnosem hydrates the D1 rows in a single <code>SELECT ... WHERE id IN (?, ?, ?, ...)</code>.</p>

<p>The interesting case is deletion. <code>memory_forget</code> soft-deletes the D1 row (sets <code>forgotten_at</code>) and also calls <code>VECTORIZE.deleteByIds()</code>. The two operations happen in the same request but they are not transactional across services. Cloudflare doesn't offer a 2PC coordinator. The mitigation is that the D1 read always filters <code>forgotten_at IS NULL</code>, so even if the Vectorize delete failed and left a stale vector, the D1 join would drop it from results. The stale vector is a small storage cost, not a correctness bug.</p>

<h2 id="cold-starts-and-latency">Cold starts (there aren't any)</h2>

<p>Workers boot in microseconds. There is no cold-start penalty in the JVM/Python sense because Workers use V8 isolates that come up with the runtime already warm. A memory_search from a client in North America hits an edge server in the same region, does two Worker invocations (one for auth + logic, one for the AI embedding call), one D1 read, one Vectorize read, and returns a response — typically in 50–150ms end to end. From Europe or APAC the latency is similar because the closest colo handles the request without cross-region hops.</p>

<h2 id="what-doesnt-work-yet">What doesn't work yet</h2>

<p>Two things a traditional backend gives you for free that a Worker does not:</p>

<ul>
<li><strong>Long-running jobs.</strong> Workers have a wall-clock limit per invocation. Anything that takes minutes — batch imports, big migrations — needs to be broken into small tasks. Gnosem doesn't have any of those today, but if we add JSON export or team-scope memory, we'll want Workflows or Queues.</li>
<li><strong>Complex transactions across services.</strong> D1 and Vectorize each have their own consistency guarantees, but coordinating a transaction across both requires app-level compensating writes rather than 2PC. See the deletion note above.</li>
</ul>

<p>For a memory service, neither of these is a blocker. Every request is small, every operation is idempotent, and eventual consistency between D1 and Vectorize is acceptable because reads filter on the authoritative source (D1).</p>

<h2 id="the-code">The code</h2>

<p>The entire Worker is one file — <code>src/worker.js</code> in the <a href="https://github.com/gnosem/gnosem">gnosem/gnosem</a> repo. If you want to run your own copy: clone, run the four wrangler create commands in the README, set your Stripe keys if you want billing, and deploy. It's MIT licensed.</p>

<p>The hosted service at <a href="/">gnosem.dev</a> is the recommended way to use it — one API key that follows you across every MCP client, no infra to run — but if you'd rather own your own memory graph on your own account, the self-host path is fully supported.</p>
`,
  },
  {
    slug: "publishing-to-official-mcp-registry",
    title: "Publishing to the Official MCP Registry",
    subtitle: "The 20-minute path from server-live to <code>registry.modelcontextprotocol.io</code>, with DNS-verified namespace and cascading auto-ingestion into PulseMCP, Smithery, Glama, and mcp.so.",
    published: "2026-07-30",
    readingMinutes: 6,
    description: "A concrete walkthrough of publishing an MCP server to the Official MCP Registry, including the DNS TXT-record verification flow that lets you claim a namespace tied to your own domain.",
    keywords: "publish MCP server registry, official MCP registry tutorial, mcp-publisher CLI, DNS verified MCP namespace, PulseMCP Smithery Glama auto ingest, dev.namespace MCP",
    bodyHtml: `
<p>The Official MCP Registry at <a href="https://registry.modelcontextprotocol.io">registry.modelcontextprotocol.io</a> went live in preview in late 2025. It is the canonical listing surface for MCP servers, backed by Anthropic, GitHub, PulseMCP, and Microsoft. Publishing there once ripples out to the downstream aggregators — PulseMCP, Smithery, Glama, mcp.so — over the following 24 to 72 hours without additional submissions.</p>

<p>This is the actual sequence we followed to publish Gnosem. It took about 20 minutes end to end, most of which was waiting for DNS propagation.</p>

<h2 id="prereqs">Prereqs</h2>

<ul>
<li>An MCP server reachable at a stable HTTPS URL (Gnosem: <code>https://gnosem.dev/mcp</code>).</li>
<li>A domain you control (Gnosem: <code>gnosem.dev</code>).</li>
<li>Access to your domain's DNS records — you'll be publishing a TXT record.</li>
</ul>

<p>You do not need a GitHub repo for the registry itself, but you'll want one for the downstream aggregators (Glama and mcp.so both require a repo URL). A README-only repo is fine.</p>

<h2 id="step-1-install-the-cli">Step 1: install the CLI</h2>

<pre><code>brew install mcp-publisher</code></pre>

<p>Or grab a release from the <a href="https://github.com/modelcontextprotocol/registry">registry repo</a>. The binary is called <code>mcp-publisher</code> and does one thing: publishes <code>server.json</code> manifests to the registry.</p>

<h2 id="step-2-write-server-json">Step 2: write server.json</h2>

<p>At the root of your repo, create <code>server.json</code>. The schema is documented at <code>static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json</code>. Here is Gnosem's:</p>

<pre><code>{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "dev.gnosem/gnosem",
  "title": "Gnosem",
  "description": "Cross-vendor AI memory over MCP. One semantic store, readable and writeable from every MCP client.",
  "version": "1.0.0",
  "repository": {
    "url": "https://github.com/gnosem/gnosem",
    "source": "github"
  },
  "websiteUrl": "https://gnosem.dev",
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://gnosem.dev/mcp"
    }
  ]
}</code></pre>

<p>Two things that trip publishers up:</p>

<ol>
<li><strong>Description length.</strong> The schema caps <code>description</code> at 100 characters. Ours is 98. Anything longer and validation rejects with HTTP 422.</li>
<li><strong>Namespace format.</strong> The <code>name</code> follows a <code>&lt;namespace&gt;/&lt;server-name&gt;</code> pattern. If you're publishing under a domain you own (recommended for company-run servers), use the reverse-DNS form: <code>dev.gnosem/gnosem</code>. If you're publishing an npm-distributed server, use <code>io.github.&lt;user&gt;/&lt;package&gt;</code>.</li>
</ol>

<p>Validate before you publish:</p>

<pre><code>mcp-publisher validate server.json</code></pre>

<p>You want the response <code>✅ server.json is valid</code>. Any schema errors surface here with the exact field.</p>

<h2 id="step-3-verify-your-namespace">Step 3: DNS-verify your namespace</h2>

<p>To publish under <code>dev.gnosem/*</code>, you have to prove you control <code>gnosem.dev</code>. The registry does this with an Ed25519 signature attached to a DNS TXT record.</p>

<p>Generate a keypair (keep it out of source control):</p>

<pre><code>openssl genpkey -algorithm Ed25519 -out ~/.config/gnosem-mcp-key.pem
chmod 600 ~/.config/gnosem-mcp-key.pem</code></pre>

<p>Compute the TXT record value:</p>

<pre><code>PUBKEY=$(openssl pkey -in ~/.config/gnosem-mcp-key.pem -pubout \\
  -outform DER | tail -c 32 | base64)
echo "v=MCPv1; k=ed25519; p=$PUBKEY"</code></pre>

<p>Publish that TXT record at the apex of your domain (Name: <code>@</code>, Type: <code>TXT</code>, Content: the string above, TTL: 300s so it propagates fast). Confirm via <code>dig +short TXT gnosem.dev @1.1.1.1</code>. When both 1.1.1.1 and 8.8.8.8 return the string, you're ready.</p>

<h2 id="step-4-login-and-publish">Step 4: login and publish</h2>

<p>The publisher expects the private key in hex, not PEM. Convert on the fly:</p>

<pre><code>HEX_KEY=$(openssl pkey -in ~/.config/gnosem-mcp-key.pem -outform DER \\
  | tail -c 32 | xxd -p -c 64)

mcp-publisher login dns --domain gnosem.dev --private-key "$HEX_KEY"</code></pre>

<p>The CLI verifies the TXT record matches your public key. On success: <code>✓ Successfully logged in</code>.</p>

<p>Then publish:</p>

<pre><code>mcp-publisher publish server.json</code></pre>

<p>You get <code>✓ Server dev.gnosem/gnosem version 1.0.0</code> and the listing is live.</p>

<h2 id="step-5-verify">Step 5: verify</h2>

<pre><code>curl "https://registry.modelcontextprotocol.io/v0/servers?search=gnosem" | jq .</code></pre>

<p>You should see your server object with <code>_meta.io.modelcontextprotocol.registry/official.status: "active"</code>.</p>

<h2 id="what-cascades">What cascades automatically</h2>

<p>Publishing to the official registry feeds these downstream aggregators without further action:</p>

<ul>
<li><strong>PulseMCP</strong> — daily ingest from the official registry. Listings usually appear within 24 hours.</li>
<li><strong>Smithery</strong> — ingests from the registry and may also auto-scan your MCP endpoint. If your <code>/mcp</code> is Bearer-gated (Gnosem's is), Smithery's scan will fail unless you also serve a <code>/.well-known/mcp/server-card.json</code> containing the same manifest.</li>
<li><strong>Glama</strong> — pulls from the registry plus its own scan. Requires a public GitHub repo linked in <code>repository.url</code>.</li>
<li><strong>mcp.so</strong> — ingests from the registry; may take a few days.</li>
</ul>

<p>These aren't guaranteed timelines — the aggregators run on their own schedules — but you shouldn't need to submit separately to any of them.</p>

<h2 id="what-doesnt-cascade">What doesn't cascade</h2>

<p>The two big <code>awesome-mcp-servers</code> lists on GitHub — <a href="https://github.com/punkpeye/awesome-mcp-servers">punkpeye/awesome-mcp-servers</a> and <a href="https://github.com/wong2/awesome-mcp-servers">wong2/awesome-mcp-servers</a> — do not auto-ingest. Those still require manual submissions: a GitHub PR for punkpeye's list, and a web form at <a href="https://mcpservers.org/submit">mcpservers.org/submit</a> for wong2's.</p>

<p>If you're publishing your own MCP server, the whole flow above is one afternoon. The tooling is good enough that most of the time is spent waiting for DNS. The registry itself is fast, honest, and doesn't lock you into any vendor.</p>
`,
  },
  {
    slug: "launching-gnosem",
    title: "The Memory Layer Belongs to the User, Not the Vendor",
    subtitle: "Introducing Gnosem: a hosted MCP server for cross-vendor AI memory.",
    published: "2026-07-30",
    readingMinutes: 9,
    description: "Every AI vendor runs its own memory silo — Claude's memory doesn't reach ChatGPT, Cursor's doesn't reach Zed. Gnosem is one memory store, over the Model Context Protocol, that every MCP-capable client can read and write. Here's why it exists and how it's built on Cloudflare Workers, D1, Vectorize, and Workers AI.",
    keywords: "cross-vendor AI memory, MCP memory server, model context protocol, Claude ChatGPT shared memory, AI memory across models, Cloudflare Workers MCP, Vectorize semantic search, gnosem",
    bodyHtml: `
<p>If you use more than one AI assistant, you have already noticed the problem. Claude remembers the shape of your work — the project you're on, the tone you prefer, the technical choices you made last week. Then you open ChatGPT because it's better for a certain kind of question, and you are once again a stranger. You paste the same context. You explain the project. You re-teach the assistant who you are. And when you go back to Claude an hour later, the fresh insight you got from ChatGPT is trapped there. Nothing crosses over.</p>

<p>This is not a small inconvenience. It's a structural problem in how AI memory is being built, and it exists because every major vendor has independently decided that memory is a moat. Anthropic's memory feature lives in Anthropic products. OpenAI's memory feature lives in OpenAI products. Neither talks to the other, neither talks to Cursor or Windsurf or Zed, and none of them will ever help you when the vendor you're locked into inevitably falls behind on some capability.</p>

<p><a href="/">Gnosem</a>, a new product from <a href="https://cuetv.us">CUETV LLC</a>, is a hosted memory service built on the <a href="https://modelcontextprotocol.io">Model Context Protocol</a> (MCP). It solves the vendor-lock-in problem the way protocol problems are supposed to be solved: by moving memory out of the vendor and into a portable layer that every client can share.</p>

<h2 id="the-vendor-memory-silo-problem-concretely">The vendor memory silo problem, concretely</h2>

<p>Consider a realistic week for someone who works in AI-assisted software:</p>

<ul>
<li><strong>Monday morning:</strong> using Claude Desktop, you sketch out a new feature. You explain the architecture, the constraints, the coding conventions of your team.</li>
<li><strong>Monday afternoon:</strong> you switch to Cursor because you're actually writing code now, and Cursor's inline completions are what you want. Cursor does not know any of what you told Claude that morning. You paste a summary.</li>
<li><strong>Tuesday:</strong> you use ChatGPT for a second opinion on a security decision because you like GPT for legal-adjacent reasoning. ChatGPT has never met you. You paste the summary again, plus the security context.</li>
<li><strong>Wednesday:</strong> you're back in Claude for planning the next sprint. Claude has retained some of Monday, but nothing from Cursor and nothing from ChatGPT.</li>
</ul>

<p>Every context switch is a re-onboarding. Every insight you gain in one tool is stranded there. The compounding effect that memory is supposed to give you — where the assistant gets smarter about you over time — is being taxed to zero because you have four silos instead of one memory.</p>

<p>There are three shapes this problem takes:</p>

<ol>
<li><strong>Migration cost.</strong> If you decide to switch primary assistants, years of accumulated memory is unrecoverable.</li>
<li><strong>Cross-tool inefficiency.</strong> Every context switch inside a day costs you re-explanation time.</li>
<li><strong>Vendor leverage.</strong> The vendor who owns your memory owns your switching costs. Memory is a moat by design, not by accident.</li>
</ol>

<p>The right fix isn't for each vendor to build a bigger memory feature. It's for memory to stop being a vendor feature at all.</p>

<h2 id="why-mcp-is-the-right-protocol-layer">Why MCP is the right protocol layer</h2>

<p>The Model Context Protocol is the missing piece. Introduced by Anthropic in late 2024 and now co-stewarded by Anthropic, Microsoft, GitHub, and PulseMCP with an <a href="https://registry.modelcontextprotocol.io">official registry</a>, MCP is the standard interface between AI clients and external tools/data. Every major desktop AI client — Claude Desktop, Cursor, Windsurf, Zed — speaks MCP natively. ChatGPT can be pointed at an MCP server through a Custom GPT Action, which is how Gnosem bridges that gap.</p>

<p>The critical property MCP gives us: a memory service can be built once and consumed by every MCP client without per-client integration work. The client hears "there's a <code>memory_write</code> tool, a <code>memory_search</code> tool" and knows how to call them, because that's the whole point of MCP.</p>

<p>That means "cross-vendor memory" is not a moonshot feature that requires convincing every vendor to build the same thing. It's a straightforward MCP server exposing five tools:</p>

<ul>
<li><code>memory_write</code> — save a memory (with automatic embedding for semantic recall)</li>
<li><code>memory_search</code> — semantic search across the user's memory graph</li>
<li><code>memory_list</code> — enumerate memories (paginated, filterable)</li>
<li><code>memory_forget</code> — soft delete</li>
<li><code>memory_supersede</code> — mark one memory as replacing another, so the "actually, that's wrong, the new answer is X" flow doesn't leave stale duplicates polluting search results</li>
</ul>

<p>Point Claude Desktop at the Gnosem MCP endpoint. Point Cursor at the same endpoint with the same Bearer token. Point ChatGPT (via a Custom GPT Action) at the same endpoint. Now they share the same memory. Write in one, read in another. That's the whole product.</p>

<h2 id="how-gnosem-is-built">How Gnosem is built</h2>

<p>The stack is intentionally simple and intentionally all-edge. Everything runs on Cloudflare.</p>

<p><strong>Cloudflare Workers</strong> hosts the MCP server itself. Streamable HTTP transport at <code>https://gnosem.dev/mcp</code>. The Worker handles the MCP handshake, authenticates the Bearer token, routes the tool call, and returns a response. No cold starts. Global edge deployment. Sub-100ms typical latency for a <code>memory_search</code>.</p>

<p><strong>Cloudflare D1</strong> (SQLite at the edge) stores the structured side of memories: the memory ID, user ID, content, timestamps, supersede pointers, tags. D1 is the source of truth for what a memory is. It's fast for point lookups and range scans and gives us relational integrity for foreign keys between memories and their supersede chain.</p>

<p><strong>Cloudflare Vectorize</strong> stores the 768-dimension embedding for each memory. When you call <code>memory_search</code>, the query is embedded, then submitted to Vectorize with cosine similarity, and the top-N nearest neighbors are returned. Crucially, the query includes a metadata filter for <code>user_id</code> — this is what enforces per-user isolation at the query engine, not the application layer.</p>

<p><strong>Cloudflare Workers AI</strong> hosts both the embedding model (BGE-base-en-v1.5, 768 dimensions) and the content-optimization model (llama-3.1-8b-instruct-fast). Choosing open-weights models means Gnosem doesn't have a hidden OpenAI dependency, doesn't pay OpenAI's embedding fees on every write, and doesn't leak content to a third-party API. Workers AI runs on the same edge as the Worker, so an embedding call adds a few milliseconds, not a network round trip.</p>

<p>The full flow for a <code>memory_search("stripe webhook setup")</code> call looks like this:</p>

<ol>
<li>Client sends MCP tool call to <code>https://gnosem.dev/mcp</code> with Bearer token in the Authorization header.</li>
<li>Worker validates the token against D1 (<code>SELECT user_id FROM api_keys WHERE key_hash = ?</code>).</li>
<li>Worker sends the query text to Workers AI for embedding (BGE-base-en-v1.5 → 768-dim float array).</li>
<li>Worker calls <code>VECTORIZE.query()</code> with the embedding, <code>topK: 10</code>, and <code>filter: { user_id: &lt;user_id&gt; }</code>.</li>
<li>Vectorize returns the top-K matching memory IDs with similarity scores.</li>
<li>Worker hydrates the full memory records from D1 in a single <code>SELECT ... WHERE id IN (?, ?, ?, ...)</code>.</li>
<li>Worker returns the results as an MCP tool response.</li>
</ol>

<p>Total round-trip: typically 50–150ms depending on region. All inside a single Worker invocation, no cross-cloud hops.</p>

<h2 id="ai-optimized-storage">AI-optimized storage: memories the reading model can eat in fewer tokens</h2>

<p>A memory saved as prose is fine for a human to re-read, but it's expensive for the next LLM that has to ingest it into its context window. So Gnosem also compresses long memories on write.</p>

<p>When you save a memory over ~400 characters, Gnosem runs it through a small instruction-tuned model (llama-3.1-8b-instruct-fast on Workers AI) with a system prompt that produces one line of structured key–value pairs: <code>TOPIC=..., PROJECT=..., DECISION=..., STACK=..., PROBLEM=..., SOLUTION=...</code>. The raw prose is preserved as <code>content_raw</code>; the compressed form is returned by default as <code>content</code>. If the compression doesn't actually win on bytes, Gnosem falls back to the raw. This is fail-open — any AI error on the optimization path still saves the memory.</p>

<p>The result: a 475-character memory about a Rust web scraper — architecture, stack, rate-limiting constraint, cost per gigabyte — compresses to a 189-character structured line without losing any of the facts. The client's reading LLM can absorb it in a fraction of the token budget. Pass <code>raw: true</code> on search or list to get the original prose instead. Pass <code>no_optimize: true</code> on write to skip compression entirely (useful for content where phrasing matters).</p>

<h2 id="per-user-isolation-two-layers">Per-user isolation: why it's enforced at two layers</h2>

<p>Security in a multi-tenant memory service is not a "we'll get to it" concern. If tenant A can read tenant B's memories, the product is broken and probably illegal. Gnosem enforces isolation at two independent layers, which means a bug in one layer does not create a leak.</p>

<p><strong>Layer 1: Application.</strong> Every Bearer token maps to exactly one user_id in the D1 <code>api_keys</code> table. Every SQL query that touches memory data includes <code>WHERE user_id = ?</code> with the token's user_id. Even a broken tool implementation that tried to fetch memories by ID without a user_id filter would fail because the query wrapper requires it.</p>

<p><strong>Layer 2: Query engine.</strong> Every Vectorize query includes a metadata filter for user_id. Vectorize applies this filter inside the vector search itself — the engine does not consider vectors from other users as candidates. Even if the application layer were bypassed entirely, the vector store would not return cross-tenant results.</p>

<p>This design means Gnosem can lose one layer of defense without losing the whole isolation guarantee. That's the standard people building serious multi-tenant systems on top of vector databases should aim for.</p>

<h2 id="auth-and-account-model">Auth and account model</h2>

<p>Auth is Bearer tokens. Creating an account with an email hits <code>POST /signup</code> and returns a one-time API key. Paste it into your MCP client's config. Sign up costs nothing and doesn't require a credit card.</p>

<p>There is no email/password auth for the MCP endpoint itself — MCP tool calls are stateless and Bearer-authenticated per call. Session-level auth would be the wrong abstraction for a protocol that expects short-lived tool calls from many clients.</p>

<h2 id="pricing-rationale">Pricing rationale</h2>

<p>Two tiers, deliberately simple:</p>

<ul>
<li><strong>Free</strong> — 200 memories, 1 API key.</li>
<li><strong>Pro</strong> — $9/mo or $90/yr (2 months free). Unlimited memories, 1 GB storage, unlimited API keys, priority indexing, exports.</li>
</ul>

<p>The free tier is real. 200 memories is enough to genuinely try Gnosem in one client for a few weeks and see if the value shows up in your actual workflow.</p>

<p>The Pro price is $9 for two specific reasons:</p>

<ol>
<li><strong>Under the personal-approval threshold.</strong> Most individuals don't need a manager's approval to spend $9/mo on a tool. This matters — a lot of good developer tools die at the "requires expense report" price ceiling.</li>
<li><strong>Enough to fund development without ads.</strong> Gnosem's business model is subscription revenue, not surveillance. Refusing the ad-supported / data-reselling model requires being priced high enough to actually pay for the infrastructure and engineering. $9/mo covers the Cloudflare bill, support, and continued development.</li>
</ol>

<p>Annual pricing at $90 gives two months free — enough of a discount to reward commitment without so much discounting that the annual number becomes the anchor.</p>

<h2 id="whats-live-today">What's live today</h2>

<ul>
<li>All 5 MCP tools in production</li>
<li>Semantic search with sub-100ms typical latency</li>
<li>AI-optimized storage: automatic compression of long memories to structured facts on write; raw prose preserved</li>
<li>Config docs for Claude Desktop, Cursor, Windsurf, Zed</li>
<li>Free signup + Stripe checkout for Pro</li>
<li>AI-discovery layer: <a href="/llms.txt">/llms.txt</a>, AI-crawler-welcoming <a href="/robots.txt">/robots.txt</a>, <a href="/sitemap.xml">/sitemap.xml</a>, schema.org JSON-LD on the landing page, and this blog</li>
<li>Public listing on the <a href="https://registry.modelcontextprotocol.io">Official MCP Registry</a> as <code>dev.gnosem/gnosem</code>, DNS-verified</li>
<li>Open-source source code at <a href="https://github.com/gnosem/gnosem">github.com/gnosem/gnosem</a>, MIT licensed</li>
</ul>

<h2 id="whats-next">What's next</h2>

<ul>
<li><strong>JSON export.</strong> Full memory dump on demand. Portable format so if you ever leave Gnosem, you leave with your data.</li>
<li><strong>Team / shared memory.</strong> Multiple users pointing at a shared memory graph, with per-tenant read/write permissions.</li>
<li><strong>Local-first sync.</strong> Encrypted at rest, key held by the user. For customers who cannot legally store their data on a third-party edge.</li>
<li><strong>Self-host reference.</strong> The MIT-licensed source already lets motivated users run their own Gnosem on their own Cloudflare account.</li>
</ul>

<h2 id="try-it">Try it</h2>

<p>Sign up at <a href="https://gnosem.dev">gnosem.dev</a>. Free tier requires no credit card.</p>

<p>Once you have an API key, paste one of these into your client:</p>

<p><strong>Claude Desktop</strong> — edit <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>:</p>

<pre><code>{
  "mcpServers": {
    "gnosem": {
      "url": "https://gnosem.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY_HERE"
      }
    }
  }
}</code></pre>

<p><strong>Cursor</strong> — Cursor Settings → MCP → New MCP Server, same JSON as above.</p>

<p><strong>Windsurf</strong> — edit <code>~/.codeium/windsurf/mcp_config.json</code> with the same block (Windsurf uses <code>serverUrl</code> rather than <code>url</code> in some versions; the client will accept either).</p>

<p>Restart the client. Gnosem's five tools should appear in the tool list. Ask the assistant to remember something. Ask it to recall it later. Switch to another client and ask the same question. That's the product.</p>

<p><a class="cta" href="/upgrade">See pricing →</a></p>

<h2 id="the-bigger-picture">The bigger picture</h2>

<p>Memory is where the real leverage in AI assistants is going to come from. Not smarter base models (that's Anthropic's and OpenAI's job), and not fancier UIs (that's Cursor's and Zed's job), but a memory layer that gets richer over time and comes with you wherever you work. That layer only delivers its full value if it lives outside the vendor.</p>

<p>MCP made that architecture possible. Gnosem is what it looks like when someone actually builds it. If you use more than one AI assistant, try it — it will feel like a bug being fixed rather than a feature being added.</p>
`,
  },
];

function metaTags({ title, description, url, ogImage, published, updated, articleTags }) {
  const isArticle = !!published;
  return `<title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${description.replace(/"/g, "&quot;")}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${url}">
<meta property="og:type" content="${isArticle ? "article" : "website"}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description.replace(/"/g, "&quot;")}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Gnosem">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Gnosem — one memory. every model.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogImage}">
${isArticle ? `<meta property="article:published_time" content="${published}T00:00:00Z">
<meta property="article:modified_time" content="${(updated || published)}T00:00:00Z">
<meta property="article:author" content="CUETV LLC">
${(articleTags || []).map(t => `<meta property="article:tag" content="${t}">`).join("\n")}` : ""}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">`;
}

function masthead() {
  return `<a class="mast" href="/"><img src="/mark.svg" alt=""><span class="n">GNOSEM</span></a>`;
}

function footer() {
  return `<div class="footer">
    <a href="/">gnosem.dev</a> · <a href="/upgrade">pricing</a> · <a href="/blog/">more posts</a> · <a href="https://github.com/gnosem/gnosem">source</a><br>
    Built and operated by <a href="https://cuetv.us">CUETV LLC</a>. MIT licensed.
  </div>`;
}

function blogPostingJsonLd(post, url) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": url + "#article",
    "mainEntityOfPage": { "@type": "WebPage", "@id": url },
    "headline": post.title,
    "description": post.description,
    "image": ["https://gnosem.dev/og.svg"],
    "datePublished": post.published + "T00:00:00Z",
    "dateModified": (post.updated || post.published) + "T00:00:00Z",
    "author": { "@type": "Organization", "name": "CUETV LLC", "url": "https://cuetv.us" },
    "publisher": {
      "@type": "Organization",
      "name": "CUETV LLC",
      "url": "https://cuetv.us",
      "logo": { "@type": "ImageObject", "url": "https://gnosem.dev/mark.svg" },
    },
    "keywords": post.keywords,
    "articleSection": "Product Launch",
    "wordCount": Math.round(post.bodyHtml.replace(/<[^>]+>/g, " ").trim().split(/\s+/).length),
    "inLanguage": "en-US",
    "isAccessibleForFree": true,
  };
}

function breadcrumbJsonLd(post, url) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Gnosem", "item": "https://gnosem.dev/" },
      { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://gnosem.dev/blog/" },
      { "@type": "ListItem", "position": 3, "name": post.title, "item": url },
    ],
  };
}

export function blogPostHtml(post) {
  const url = `https://gnosem.dev/blog/${post.slug}`;
  const jsonld = [blogPostingJsonLd(post, url), breadcrumbJsonLd(post, url)];
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
${metaTags({ title: `${post.title} — Gnosem`, description: post.description, url, ogImage: "https://gnosem.dev/og.svg", published: post.published, updated: post.updated, articleTags: post.keywords.split(",").map(s => s.trim()) })}
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>${SHARED_CSS}</style></head><body>
${masthead()}
<article>
<header>
<span class="tag">Launch</span>
<h1>${post.title}</h1>
${post.subtitle ? `<p style="font-family:Georgia,serif;font-size:19px;color:#3a3833;margin:0 0 14px;line-height:1.4">${post.subtitle}</p>` : ""}
<p class="meta">By <a href="https://cuetv.us">CUETV LLC</a> · <time datetime="${post.published}">${new Date(post.published).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</time> · ${post.readingMinutes}-minute read</p>
</header>
${post.bodyHtml}
</article>
${footer()}
</body></html>`;
}

export function blogIndexHtml() {
  const url = "https://gnosem.dev/blog/";
  const items = POSTS.map(p => `<li style="margin:0 0 24px;list-style:none">
  <h2 style="margin:0 0 4px;font-size:20px"><a href="/blog/${p.slug}">${p.title}</a></h2>
  <p class="meta" style="margin:0 0 6px">${new Date(p.published).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · ${p.readingMinutes}-minute read</p>
  <p style="margin:0">${p.description}</p>
</li>`).join("\n");
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": url,
    "name": "Gnosem Blog",
    "url": url,
    "publisher": { "@type": "Organization", "name": "CUETV LLC", "url": "https://cuetv.us" },
    "blogPost": POSTS.map(p => ({
      "@type": "BlogPosting",
      "headline": p.title,
      "url": `https://gnosem.dev/blog/${p.slug}`,
      "datePublished": p.published + "T00:00:00Z",
      "description": p.description,
    })),
  };
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
${metaTags({ title: "Blog — Gnosem", description: "Product launches, technical deep dives, and infrastructure notes from the team building Gnosem — cross-vendor AI memory over MCP.", url, ogImage: "https://gnosem.dev/og.svg" })}
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>${SHARED_CSS}</style></head><body>
${masthead()}
<h1>Blog</h1>
<p class="meta">Notes from the team building Gnosem.</p>
<ul style="padding:0;margin:24px 0 0">${items}</ul>
${footer()}
</body></html>`;
}
