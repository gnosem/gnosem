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
    slug: "gnosem-vs-mem0-letta-zep",
    title: "Gnosem vs. mem0, Letta, Zep: when hosted MCP memory is the right choice",
    subtitle: "A factual comparison against the popular memory libraries — how each is architected, what each is for, and why the choice usually comes down to whether you're building an app or using one.",
    published: "2026-07-30",
    readingMinutes: 8,
    description: "Mem0, Letta, and Zep are memory libraries you embed in your own app code. Gnosem is a hosted MCP endpoint your existing AI clients read and write to. This walks through when each is the right tool.",
    keywords: "mem0 vs gnosem, letta memory framework, zep memory, MCP memory server comparison, AI memory library vs hosted service, cross-vendor persistent memory, mem0 alternative",
    bodyHtml: `
<p>Every few weeks somebody asks the same question: how does <a href="/">Gnosem</a> compare to <a href="https://mem0.ai">mem0</a>, <a href="https://letta.com">Letta</a>, or <a href="https://getzep.com">Zep</a>? The short answer is that they solve different problems for different audiences. The long answer is worth writing down, because the wrong choice wastes a lot of engineering time.</p>

<p>All four projects touch "AI memory." That is where the resemblance ends. Mem0, Letta, and Zep are libraries and frameworks that a developer imports into an application they are building. Gnosem is a hosted Model Context Protocol server that an existing AI assistant reads and writes to. If you are building an app that talks to an LLM, you probably want one of the libraries. If you use AI assistants and want them to share memory across vendors, you probably want Gnosem. The two categories don't compete so much as sit at different layers.</p>

<h2 id="what-each-one-is">What each one actually is</h2>

<p><strong>mem0</strong> is an open-source Python and TypeScript library. You install it in your app, wire up an LLM key and a vector store, and call <code>memory.add()</code> and <code>memory.search()</code> from your own code paths. It has managed hosting available, but the primary shape is a library your app calls. It ships with a small pipeline that extracts facts from raw conversation turns before storing them.</p>

<p><strong>Letta</strong> (formerly MemGPT) is an agent framework focused on long-lived agents with hierarchical memory — core memory that always stays in context, and archival memory the agent can page in and out. Letta is a full agent runtime; memory is one of its subsystems. You use Letta by building agents on its runtime, not by adding memory to an agent someone else built.</p>

<p><strong>Zep</strong> is a memory service for chat applications. It stores conversation history, extracts entities into a temporal knowledge graph, and exposes REST and Python APIs your app calls between turns. Cloud-hosted or self-hosted. The output is optimized for pulling into chat prompts.</p>

<p><strong>Gnosem</strong> is a hosted MCP server. There is no library to import; you don't call it from application code. You point an existing MCP client — Claude Desktop, Cursor, Windsurf, Zed, Kimi, or any other client that speaks the <a href="https://modelcontextprotocol.io">Model Context Protocol</a> — at <code>https://gnosem.dev/mcp</code> with a Bearer token, and the client automatically discovers five memory tools and calls them during a session on the user's behalf. The reading LLM sees Gnosem the same way it sees any other MCP tool.</p>

<h2 id="the-audience-split">The audience split</h2>

<p>The clearest way to think about this: who is doing the writing?</p>

<ul>
<li><strong>App developers</strong> write code that calls an LLM, and want that LLM to remember things across sessions. They control the runtime, own the prompts, and can insert a <code>memory.add()</code> call wherever they like. For them, mem0 / Letta / Zep are the right shape. Gnosem is not — there is no application code to bolt Gnosem into, because Gnosem sits outside the app.</li>
<li><strong>End users of AI assistants</strong> don't write any code. They use Claude Desktop for planning, Cursor for coding, ChatGPT for a second opinion, and Kimi when they want a long-context model. They can't add mem0 to Claude Desktop because they don't own Claude Desktop's source. What they want is a memory that follows them across vendors. For them, Gnosem is the right shape and the memory libraries are not applicable.</li>
</ul>

<p>There is a third audience — <strong>app developers who want to expose memory to end users through their client of choice</strong>. That's a fit for Gnosem too, because Gnosem's tools appear in the client's tool list the same way any MCP tool would. You get "memory as a feature" without shipping any tool-calling glue.</p>

<h2 id="the-cross-vendor-property">The cross-vendor property nobody else has</h2>

<p>The specific property Gnosem gives you that none of the libraries give you: <strong>one memory graph, many clients, no per-client integration</strong>.</p>

<p>Point Claude Desktop at Gnosem. Point Cursor at Gnosem with the same API key. Point Windsurf at the same endpoint. Now all three see the same memories, write to the same store, and can find things the other clients saved. Switch primary assistants next month? Your memory comes with you, because it never lived in the assistant.</p>

<p>If you built the same "memory sharing" capability on top of mem0, you would need each client to speak your mem0-wrapper's API. Because Claude Desktop, Cursor, and Windsurf don't speak your API — they speak MCP — you'd have to either fork every client or run a per-client shim. That's the work MCP was designed to eliminate.</p>

<h2 id="architecture-differences">Architecture and hosting</h2>

<table style="width:100%;border-collapse:collapse;margin:0 0 18px;font-size:14px">
<thead><tr style="border-bottom:2px solid var(--ink)"><th style="text-align:left;padding:6px 8px">Project</th><th style="text-align:left;padding:6px 8px">Deployment</th><th style="text-align:left;padding:6px 8px">Client-side</th><th style="text-align:left;padding:6px 8px">Vector store</th><th style="text-align:left;padding:6px 8px">License</th></tr></thead>
<tbody>
<tr style="border-bottom:1px solid var(--rule)"><td style="padding:6px 8px;vertical-align:top">mem0</td><td style="padding:6px 8px;vertical-align:top">Self-host or managed cloud</td><td style="padding:6px 8px;vertical-align:top">Python/TS SDK in your app</td><td style="padding:6px 8px;vertical-align:top">Pluggable (Qdrant, Pinecone, PGVector)</td><td style="padding:6px 8px;vertical-align:top">Apache 2.0</td></tr>
<tr style="border-bottom:1px solid var(--rule)"><td style="padding:6px 8px;vertical-align:top">Letta</td><td style="padding:6px 8px;vertical-align:top">Self-host runtime or Letta Cloud</td><td style="padding:6px 8px;vertical-align:top">Letta agent runtime</td><td style="padding:6px 8px;vertical-align:top">Postgres + vector extension</td><td style="padding:6px 8px;vertical-align:top">Apache 2.0</td></tr>
<tr style="border-bottom:1px solid var(--rule)"><td style="padding:6px 8px;vertical-align:top">Zep</td><td style="padding:6px 8px;vertical-align:top">Zep Cloud or self-host</td><td style="padding:6px 8px;vertical-align:top">REST / Python / TS client</td><td style="padding:6px 8px;vertical-align:top">Postgres + graph store</td><td style="padding:6px 8px;vertical-align:top">Apache 2.0 (community edition)</td></tr>
<tr><td style="padding:6px 8px;vertical-align:top">Gnosem</td><td style="padding:6px 8px;vertical-align:top">Hosted (gnosem.dev) or self-host on Cloudflare</td><td style="padding:6px 8px;vertical-align:top">None — MCP client speaks to it directly</td><td style="padding:6px 8px;vertical-align:top">Cloudflare Vectorize (BGE-base-en-v1.5, 768d)</td><td style="padding:6px 8px;vertical-align:top">MIT</td></tr>
</tbody>
</table>

<p>Gnosem's stack is deliberately narrow: everything runs on Cloudflare (Workers, D1, Vectorize, Workers AI). That's the price of eliminating the "run your own infra" step. If you want to self-host on your own Cloudflare account you can — the <a href="https://github.com/gnosem/gnosem">source is MIT</a> — but there is no "run on your own Postgres" path, because that would break the edge-native architecture that makes it sub-100ms.</p>

<h2 id="fact-extraction-vs-raw">Fact extraction: everyone does something, but differently</h2>

<p>All four projects transform raw text before storing it, but the shape is different.</p>

<p>Mem0's pipeline runs an LLM over each conversation turn and extracts atomic facts as separate memory records, then also does an update/conflict resolution step to reconcile with existing memories. This produces a clean fact graph but is chatty on the LLM side — a real per-write cost in tokens.</p>

<p>Letta's core/archival split isn't a fact-extraction step; it's a memory hierarchy the agent manages by tool call. The agent decides what to promote from archival to core memory.</p>

<p>Zep builds a temporal knowledge graph of entities and relationships from conversation history. Retrieval blends the graph with dense vector search.</p>

<p>Gnosem is closer to a hybrid. Long memories (over ~400 characters) are compressed on write into structured pipe-separated key–value pairs — <code>TOPIC=..., PROJECT=..., DECISION=..., STACK=...</code> — with the raw prose preserved. Semantic search embeds the raw content, so search behaves naturally, but retrieval returns the compressed form by default so the reading LLM ingests fewer tokens. Discussed in more depth in <a href="/blog/ai-optimized-memory-storage">Memories that Cost Fewer Tokens to Read</a>.</p>

<p>None of these is objectively "better." They optimize for different things. Mem0 optimizes for a clean queryable fact database. Zep optimizes for chat-context reconstruction. Gnosem optimizes for the token cost of cross-vendor recall.</p>

<h2 id="pricing-shape">Pricing shape</h2>

<p>Because Gnosem is a hosted end-user product and the others are primarily libraries with optional hosted tiers, pricing shape is different.</p>

<p>Gnosem's Pro tier is $9/month or $90/year and includes unlimited memories up to 1 GB storage. Free tier is 200 memories. The pricing model is "individual with a credit card, not a manager approval."</p>

<p>Mem0, Letta, and Zep all offer free open-source self-hosting and have separate managed cloud tiers that are usage-based (per API call, per token embedded, per memory stored). Their managed products are priced for teams and products, not individuals.</p>

<p>Neither approach is universally cheaper. If you're a developer with real usage inside an app, per-request pricing on a managed library may beat a flat individual subscription. If you're one person using AI assistants heavily across four vendors, $9/month with unlimited memories is going to be cheaper than any per-request tier at that scale.</p>

<h2 id="when-to-pick-what">When to pick what</h2>

<p><strong>Pick mem0</strong> if: you are shipping an app with a chat UI, you own the runtime, and you want a clean library with pluggable vector store choice and a solid fact-extraction pipeline.</p>

<p><strong>Pick Letta</strong> if: you are building an agent runtime and want first-class agent memory as part of a broader agent framework. Not the right shape if you already have an agent orchestration layer you like.</p>

<p><strong>Pick Zep</strong> if: you are shipping a chatbot or assistant application, want chat-history-aware retrieval, and value the temporal knowledge graph model. Their managed tier is aimed squarely at production chat apps.</p>

<p><strong>Pick Gnosem</strong> if: you use more than one AI assistant, and want them to share a memory. You aren't building an app; you are using apps that already exist, and you want those apps to remember your context across vendors. Bearer token in the client config, done — nothing to import, deploy, or maintain.</p>

<p>The stack-level equivalent to keep in mind: mem0/Letta/Zep are like SQLite/Postgres/Neo4j — you embed them in your product. Gnosem is more like Dropbox — you point every device at it and they share state. Neither replaces the other. If you're building an app that needs its own private memory graph, run one of the libraries. If you want cross-vendor memory that follows you across every MCP client you touch, use Gnosem.</p>

<p>You can also do both. Nothing prevents an app built on mem0 from also exposing an MCP endpoint that reads that mem0 store, or from talking to Gnosem in addition to its own private memory. The layers compose.</p>

<h2 id="try-it">Try it</h2>

<p>Sign up at <a href="/">gnosem.dev</a>. Free tier requires no credit card. Add the returned API key to your MCP client of choice — the config is a five-line JSON block per client. See <a href="/blog/persistent-memory-claude-code">How to add persistent memory to Claude Code</a> for a concrete walkthrough with Claude Code, or the <a href="/">landing page</a> for the other clients. Then try switching between clients mid-project. That's the demo.</p>
`,
  },
  {
    slug: "persistent-memory-claude-code",
    title: "How to add persistent memory to Claude Code",
    subtitle: "One npx install line, and Claude Code writes to a persistent memory during a session and reads back what it wrote weeks ago — across restarts, across projects, across machines.",
    published: "2026-07-30",
    readingMinutes: 6,
    description: "A tutorial for adding Gnosem's cross-vendor memory to Claude Code with a single npx install, plus a concrete example of a memory being saved during one session and recalled in the next.",
    keywords: "Claude Code persistent memory, Claude Code MCP memory server, npx gnosem-install, memory_write memory_search Claude Code, cross-session Claude memory",
    bodyHtml: `
<p>Claude Code is stateless between sessions by default. Every new invocation starts with an empty conversation, an empty <code>CLAUDE.md</code> unless you've written one, and no recollection of the file you asked it to fix last Tuesday. That's fine for one-off tasks. It's frustrating for anyone using it as a daily driver on a real project.</p>

<p><a href="/">Gnosem</a> fixes this in one line: <code>npx gnosem-install</code>. The installer registers Gnosem as an MCP server in Claude Code's config, prompts for your Gnosem API key, and exits. From that point Claude Code has five persistent memory tools available (<code>memory_write</code>, <code>memory_search</code>, <code>memory_list</code>, <code>memory_forget</code>, <code>memory_supersede</code>) and will call them naturally during a session.</p>

<h2 id="prereqs">Prereqs</h2>

<ul>
<li>Claude Code installed. If not: <a href="https://docs.anthropic.com/en/docs/claude-code">docs.anthropic.com/claude-code</a>.</li>
<li>A Gnosem API key. Free at <a href="https://gnosem.dev">gnosem.dev</a> — no credit card, 200-memory free tier.</li>
</ul>

<p>Nothing else. No Docker, no infra, no separate database to run.</p>

<h2 id="install">Install</h2>

<pre><code>npx gnosem-install</code></pre>

<p>The installer:</p>

<ol>
<li>Detects your Claude Code config path (<code>~/.claude/mcp_servers.json</code> or the equivalent OS-specific location).</li>
<li>Prompts for the Gnosem API key (starts with <code>gn_</code>).</li>
<li>Adds a <code>gnosem</code> entry with the endpoint <code>https://gnosem.dev/mcp</code> and the Bearer header set to your key.</li>
<li>Prints a success message with the next step.</li>
</ol>

<p>Restart Claude Code. The five tools appear in the tool list. That's the whole setup — 15 seconds if your API key is already in your clipboard.</p>

<p>If you'd rather do it by hand, the JSON block Gnosem writes is:</p>

<pre><code>{
  "mcpServers": {
    "gnosem": {
      "url": "https://gnosem.dev/mcp",
      "headers": {
        "Authorization": "Bearer gn_YOUR_KEY_HERE"
      }
    }
  }
}</code></pre>

<p>Same block works verbatim for Claude Desktop, Cursor, Windsurf, and Zed. Same API key across every client. That's the whole point of running memory as a shared MCP endpoint — see <a href="/blog/gnosem-vs-mem0-letta-zep">Gnosem vs. mem0, Letta, Zep</a> for why that matters.</p>

<h2 id="how-claude-code-uses-it">How Claude Code actually uses it during a session</h2>

<p>Once the tools are registered, Claude Code decides when to call them based on its usual tool-use heuristics. In practice, you don't have to say "save this to memory" — the model will call <code>memory_write</code> whenever it encounters something worth remembering, and it will call <code>memory_search</code> whenever a new task looks like it might benefit from prior context. The pattern is the same as how Claude Code decides when to run <code>Grep</code> or <code>Read</code>.</p>

<p>A concrete example. First session — you ask Claude Code to help refactor the auth layer of a Python API:</p>

<blockquote>User: The auth layer here is a mess. Sessions are stored in Redis but the token format is JWT and there's no obvious refresh flow. Can you refactor it so the refresh happens transparently on 401?</blockquote>

<p>Claude Code reads the code, does the refactor across three files, writes tests. Near the end of the session, unprompted, it saves a memory:</p>

<pre><code>memory_write({
  content: "Refactored auth layer of api-server (Python/FastAPI).
Uses JWT access tokens + refresh tokens stored in Redis under
key pattern 'refresh:{user_id}'. Access token TTL = 15min,
refresh TTL = 30d. Transparent refresh via 401-catch middleware
in app/middleware/auth.py. Tests in tests/test_auth_refresh.py.",
  tags: ["auth", "api-server", "refactor"],
  written_by: "claude-code"
})</code></pre>

<p>Note the <code>written_by</code> field. Every Gnosem memory carries provenance about which client wrote it. Useful later when you're <a href="/blog/auditing-your-ai-memory">auditing your memory</a> to see what each vendor put in.</p>

<p>Two weeks later, new session, different feature:</p>

<blockquote>User: I need to add rate limiting to the same api-server. Users should get 100 req/min free, 1000 req/min if they're paid. Read from Redis too so it survives restarts.</blockquote>

<p>Before writing any code, Claude Code fires:</p>

<pre><code>memory_search({
  query: "api-server auth Redis middleware pattern",
  k: 5
})</code></pre>

<p>Gnosem returns the auth-refactor memory from two weeks ago, plus whatever other related things you'd saved. Claude Code reads that back, sees the middleware pattern already established for auth, and writes rate-limit middleware that mirrors the same pattern — same file layout, same Redis key convention, same testing style. You didn't have to re-explain any of it.</p>

<p>The tokens saved on this pattern add up fast. A 500-token memory recall replaces a 3,000-token re-explanation and re-exploration of the existing code. Multiply by ten sessions a week.</p>

<h2 id="what-claude-code-writes-unprompted">What Claude Code writes unprompted</h2>

<p>From observing sessions, Claude Code tends to save memories in these situations:</p>

<ul>
<li>A non-obvious architectural decision it made ("chose to use X because Y").</li>
<li>A configuration choice the user explicitly requested ("user wants tabs, not spaces").</li>
<li>The location of an important file or a naming convention it discovered.</li>
<li>A workaround for a bug or platform quirk.</li>
<li>Any explicit user statement of preference or intent ("we're using Postgres 16", "this is a monorepo").</li>
</ul>

<p>It rarely saves memories about routine work (a normal file edit, a passing test) because those don't have re-use value. This is emergent from the tool descriptions — Gnosem's <code>memory_write</code> description explicitly says "save things worth remembering later," not "log everything."</p>

<h2 id="you-can-write-too">You can also write memories directly</h2>

<p>You don't have to wait for the model to decide. You can just tell it:</p>

<blockquote>User: Remember that our team uses conventional commits, and we always squash-merge PRs.</blockquote>

<p>Claude Code will fire a <code>memory_write</code> with that content. From then on, any Claude Code session on any machine (as long as the API key is the same) knows to write commits in the conventional-commits style, and to reach for <code>git merge --squash</code> rather than a plain merge. This is the practical use case that pulls the most weight for teams: policies and conventions that would otherwise live in a wiki nobody reads.</p>

<h2 id="cross-vendor-payoff">The cross-vendor payoff</h2>

<p>The magic isn't Claude Code alone — <code>CLAUDE.md</code> already handles single-tool project memory pretty well. The magic is that the memory carries over when you switch tools.</p>

<p>Open Cursor next week to write some UI. Cursor with the same Gnosem API key sees the same memories Claude Code wrote. When you say "add a new endpoint following our conventions," Cursor's model fires <code>memory_search</code> and finds the auth pattern, the rate-limit pattern, the commit convention — all of it. No re-onboarding.</p>

<p>Open ChatGPT via a Custom GPT Action pointed at Gnosem's REST endpoint (planned). Same thing. Open a fresh Windsurf install after switching laptops. Same thing.</p>

<h2 id="managing-and-inspecting">Managing and inspecting</h2>

<p>From inside a Claude Code session you can list what's there:</p>

<blockquote>User: What have you been remembering about this project?</blockquote>

<p>Claude Code will call <code>memory_list</code> and summarize. You can also ask it to forget things:</p>

<blockquote>User: Forget the memory about that Redis pattern — we switched to Valkey.</blockquote>

<p>It'll find the memory with <code>memory_search</code>, then call <code>memory_forget</code> with the id. Or use <code>memory_supersede</code> to replace rather than delete — the old row is marked superseded (excluded from future reads) and the new content becomes current, preserving audit trail.</p>

<p>You can also inspect and manage memories from the web dashboard at <code>gnosem.dev</code> — full list view, tag filtering, and manual delete.</p>

<h2 id="if-you-run-your-own">If you run your own Gnosem</h2>

<p>The <a href="https://github.com/gnosem/gnosem">source is MIT</a>. If you'd rather point Claude Code at your own Gnosem deployment on your own Cloudflare account, replace <code>https://gnosem.dev/mcp</code> with your Worker's URL in the config block above. Everything else works the same because it's the same server code. See <a href="/blog/building-mcp-server-cloudflare-workers">Building an MCP Server on Cloudflare Workers</a> for the architecture notes.</p>

<p>Try <code>npx gnosem-install</code> and open Claude Code. Ask it something project-specific. Come back tomorrow and ask a related question. The second time should feel meaningfully less like starting from zero. That's the feature.</p>
`,
  },
  {
    slug: "auditing-your-ai-memory",
    title: "Auditing your AI memory: what your different clients wrote",
    subtitle: "The <code>written_by</code> field on every Gnosem memory turns your memory graph into a per-vendor audit log. Useful for catching hallucinations, tracking which client is most useful, and spotting rogue tool calls.",
    published: "2026-07-30",
    readingMinutes: 7,
    description: "Every Gnosem memory records which client wrote it. That single provenance field turns your memory into an audit log — catch hallucinated facts, spot rogue tool calls, and see which vendor is pulling its weight.",
    keywords: "AI memory audit, written_by provenance MCP, catch AI hallucinations memory, vendor comparison Claude ChatGPT Cursor, MCP memory tracing, rogue tool call detection",
    bodyHtml: `
<p>Every memory in <a href="/">Gnosem</a> carries a <code>written_by</code> field. It's a plain string — the client sets it on write, Gnosem stores it verbatim, and it comes back on every read. It's the smallest possible provenance signal you can add to a memory system, and it turns out to be one of the most useful.</p>

<p>The field is set by the caller on <code>memory_write</code>. Well-behaved MCP clients set it to something identifying — <code>"claude-code"</code>, <code>"claude-desktop"</code>, <code>"cursor"</code>, <code>"windsurf"</code>, <code>"chatgpt-custom-action"</code>. Some don't set it at all. Some set it to something wrong. All three cases are informative.</p>

<h2 id="the-audit-loop">The basic audit loop</h2>

<p>Ask any MCP-connected assistant something like:</p>

<blockquote>Call memory_list with limit=100 and group the results by written_by. Show me counts and the earliest/latest timestamp per group.</blockquote>

<p>You'll get back a breakdown that looks something like:</p>

<pre><code>claude-code:            127 memories  (2026-05-14 → 2026-07-29)
cursor:                  43 memories  (2026-06-02 → 2026-07-28)
claude-desktop:          31 memories  (2026-04-30 → 2026-07-22)
chatgpt-custom-action:    9 memories  (2026-07-08 → 2026-07-25)
(unset):                  4 memories  (2026-06-14 → 2026-06-14)
kimi-web:                 1 memory    (2026-07-11)</code></pre>

<p>Nothing exotic on the server side — <code>memory_list</code> just returns rows including <code>written_by</code>, and the assistant does the counting client-side. But immediately you can see three interesting patterns:</p>

<ol>
<li><strong>Claude Code is doing most of the writing.</strong> Makes sense if you spend most of your day in it. This is your primary tool.</li>
<li><strong>Something wrote 4 memories with no <code>written_by</code> set, all on the same day.</strong> Worth looking at. Maybe an experimental script you ran, maybe a client with a broken tool implementation.</li>
<li><strong>Kimi wrote once and never again.</strong> Either you tried it once and stopped, or Kimi's memory tooling is worse than the others and rarely fires. Either interpretation tells you something.</li>
</ol>

<h2 id="catching-hallucinated-facts">Catching hallucinated facts</h2>

<p>The most valuable audit case: catching a memory that contains a made-up fact.</p>

<p>Long-running assistants sometimes save memories with false confidence. A common pattern: model runs a tool, misreads the output, and saves a memory summarizing what it thinks happened. Weeks later that memory surfaces on a search and quietly poisons a future decision.</p>

<p>Sorting by <code>written_by</code> lets you audit per-vendor with more focus. If you notice Cursor tends to over-summarize test output as passing when it wasn't, you can pull just Cursor's memories:</p>

<blockquote>Call memory_list with limit=200, filter the results client-side to only those where written_by="cursor", and show me the ones tagged "test" or "ci".</blockquote>

<p>Scan those. Any that look wrong, use <code>memory_supersede</code> to replace them with a corrected version (preserves audit trail), or <code>memory_forget</code> to delete outright. This is far more tractable than auditing the whole memory graph as one blob, because different clients have different hallucination patterns and reviewing them by client makes the patterns visible.</p>

<h2 id="rogue-tool-calls">Spotting rogue tool calls</h2>

<p>Every memory that shows up with a <code>written_by</code> you don't recognize is worth 30 seconds of investigation. Reasons this can happen:</p>

<ul>
<li>You installed a new MCP client for one experiment last month and forgot about it. It's still writing.</li>
<li>An MCP proxy or bridge is calling Gnosem on behalf of a client, and setting <code>written_by</code> to its own identifier.</li>
<li>Somebody got hold of your API key. This one is not paranoid — Bearer tokens are copyable. If you see a client name you never installed, rotate the key immediately from the dashboard.</li>
</ul>

<p>The threat model here isn't "hackers." It's more mundane: an API key ends up in a config file that gets shared, a machine gets lent to someone, a laptop gets set up at work when the key was meant for personal use. The <code>written_by</code> field surfaces this in a way that raw memory content doesn't, because the identity of the writer is the only signal that separates "Claude Code on my laptop" from "Claude Code on someone else's laptop that got hold of my key."</p>

<h2 id="which-client-is-most-useful">Which client is actually the most useful?</h2>

<p>Everyone has opinions about which AI assistant is best. The audit answers empirically — for you, on your work.</p>

<p>Two useful measures:</p>

<ul>
<li><strong>Write rate per vendor.</strong> How much is each vendor saving? Higher writes usually mean deeper engagement.</li>
<li><strong>Read rate per vendor.</strong> Which memories get retrieved most, and which vendor's writes are getting recalled? Gnosem doesn't currently expose per-memory read counts, but you can approximate by inspecting which memories keep showing up when different clients call <code>memory_search</code>.</li>
</ul>

<p>Anecdotal observation from a few months of dogfooding: Claude Code writes the most useful long-form memories (architectural decisions, non-obvious workarounds). Cursor writes the most memories overall but they skew shorter and more mechanical (file locations, function signatures). ChatGPT writes rarely, but when it does, the memories are usually opinionated summaries of legal or security reasoning — the kind of thing you asked for a second opinion on and want to remember. Different clients have different personalities as memory writers.</p>

<p>If a vendor writes rarely and their writes get recalled rarely, that's a signal the vendor isn't earning its slot in your workflow. If a vendor writes constantly but nothing gets recalled, they're generating noise — worth turning off or tuning.</p>

<h2 id="team-and-org-audit">Team and org audit</h2>

<p>Gnosem's Pro tier supports unlimited API keys. A common pattern: one key per client (one for Claude Desktop, one for Cursor, one for a CI/CD script), all writing to the same memory. Set <code>written_by</code> to a descriptive label per key.</p>

<p>Now the audit becomes a project inventory. You can see "we have 400 CI memories, half of which are stale build errors from a version of the pipeline we're not running anymore." That's a good excuse to bulk-forget by filter and reclaim signal-to-noise.</p>

<p>For actual teams (the future team-scoped memory feature will make this cleaner), <code>written_by</code> is the field that carries per-user identity in a shared memory. "Alice wrote this memory, Bob wrote that one" surfaces disagreements and duplicates that would otherwise sit undetected in the pile.</p>

<h2 id="dashboard-vs-mcp">Dashboard vs. MCP audit</h2>

<p>Two audit surfaces:</p>

<ul>
<li><strong>The dashboard at gnosem.dev.</strong> Human eyeball — visual list, tag filter, per-memory delete. Best for spot-checking or catching one specific bad memory you remember seeing.</li>
<li><strong>Through an assistant via <code>memory_list</code>.</strong> Better for scale, aggregation, and comparison. The assistant does the counting and grouping and can help you formulate follow-up queries.</li>
</ul>

<p>The MCP audit path scales better because you can ask the assistant to summarize, filter, and take corrective action in one loop. "Look at everything cursor wrote in the last 30 days, tell me if anything mentions a specific outdated library, and forget those" is a five-tool-call session on the assistant's part, not a manual scroll.</p>

<h2 id="privacy-note">Privacy note</h2>

<p><code>written_by</code> is client-set and stored verbatim. Gnosem does not add any inferred provenance — no IP-based geo, no user-agent parsing, no fingerprint. If a client sets <code>written_by: "user-supplied-lie"</code>, that's what gets stored. This is intentional: the field is a hint for the user's own audit, not a security control. Anyone who has your API key can write memories under any <code>written_by</code> label they choose. Treat the field as accountability-by-convention, not enforcement.</p>

<p>If you need enforced per-client identity, use different API keys per client — key rotation, key revocation, and key-scoped tracking would then bind the identity to the key rather than the free-text field. That's a stronger model and works today.</p>

<h2 id="try-it">Try it</h2>

<p>If you already have a Gnosem account and a few weeks of memories accumulated, ask your primary assistant right now: "List my recent memories, group by written_by, show me counts." The pattern of vendor contribution to your knowledge should surprise you at least a little. Any patterns that don't match your usage story are worth chasing down. Sign up at <a href="/">gnosem.dev</a> if you don't have an account yet — the free tier is enough to try the audit workflow.</p>
`,
  },
  {
    slug: "semantic-memory-search-vs-keyword",
    title: "How semantic search over your memory beats keyword search for LLM assistants",
    subtitle: "A technical dive into why cosine-similarity retrieval over embeddings beats SQL LIKE queries for AI memory — plus notes on model choice, hybrid search, and filter-then-search patterns.",
    published: "2026-07-30",
    readingMinutes: 9,
    description: "A concrete technical explanation of why semantic search over embeddings finds the memories an LLM actually needs, where keyword search fails, and how Gnosem uses BGE-base-en-v1.5 for the tradeoff between compact vectors and recall quality.",
    keywords: "semantic search vs keyword search, cosine similarity embeddings, BGE-base-en-v1.5, hybrid search, vector database filtering, LLM memory retrieval, 768 dimension embedding",
    bodyHtml: `
<p>When an LLM assistant needs to remember something, the first question is not "what does memory look like on disk" but "how do we find the right memory to hand back." That's a retrieval problem, and the retrieval strategy matters more than the storage layer. Get the retrieval right and a modest storage layer is fine. Get the retrieval wrong and no amount of clever storage will save you.</p>

<p><a href="/">Gnosem</a> uses semantic search over vector embeddings as its primary retrieval path — specifically cosine similarity on 768-dimension vectors from <a href="https://huggingface.co/BAAI/bge-base-en-v1.5">BAAI/bge-base-en-v1.5</a>, served by Cloudflare Workers AI. This is a deliberate choice against the "just use SQL LIKE" alternative that a lot of memory systems started with. The reasons why are worth walking through carefully, because they're what make cross-vendor memory feel like magic instead of like grep.</p>

<h2 id="the-keyword-failure-mode">The keyword failure mode</h2>

<p>Suppose you wrote this memory two weeks ago:</p>

<blockquote>Switched the pricing page from a table layout to a card grid. Users found the columns confusing when comparing plans; the card format with call-to-action buttons per plan converts about 20% better on mobile.</blockquote>

<p>Now you're back on the same project and you ask your assistant:</p>

<blockquote>How did we lay out the checkout screen? I want to keep it consistent.</blockquote>

<p>A keyword search over your memory graph runs something like <code>WHERE content LIKE '%checkout%'</code>. It returns zero matches. The memory you actually wanted — the one about pricing page layout, which is the closest sibling to a checkout screen and shares the design constraints — never surfaces, because the word "checkout" doesn't appear in it.</p>

<p>You could try <code>OR content LIKE '%pricing%'</code>. Now you get the pricing memory. But the assistant has no basis for that OR — the model doesn't know a priori that "pricing" is a keyword to check when the user says "checkout." The keyword approach requires the query to already share vocabulary with the target, and users almost never do.</p>

<p>The same problem shows up everywhere:</p>

<ul>
<li>User asks about "auth flow", memory says "login sequence"</li>
<li>User asks about "database", memory says "postgres"</li>
<li>User asks about "the bug from Tuesday", memory says "the null pointer in the parser"</li>
</ul>

<p>Keyword search finds none of these. Semantic search finds all three.</p>

<h2 id="what-semantic-search-actually-does">What semantic search actually does</h2>

<p>Every memory in Gnosem, on write, is passed through <code>bge-base-en-v1.5</code> to produce a 768-dimension floating-point vector. That vector is a numerical representation of the memory's meaning — text that talks about similar concepts produces vectors that point in similar directions in 768-dimensional space.</p>

<p>On read, the query goes through the same model, producing a query vector. The retrieval engine (Cloudflare Vectorize) compares the query vector to every stored memory's vector using cosine similarity — literally the cosine of the angle between them. Vectors pointing in nearly the same direction have similarity near 1.0. Vectors pointing in opposite directions have similarity near -1.0. The top-K matches are returned.</p>

<p>Because "checkout screen" and "pricing page layout" both talk about UI layout and conversion — the underlying concepts are close — their vectors cluster in the same region. Cosine similarity picks that up. The keyword mismatch is irrelevant because the model already learned that these words live near each other during pretraining.</p>

<h2 id="why-bge-base">The BGE-base-en-v1.5 tradeoff</h2>

<p>Gnosem embeds with BGE-base-en-v1.5. There are objectively better English embedding models — larger BGE variants (bge-large, 1024d) and OpenAI's <code>text-embedding-3-large</code> (up to 3072d). They score higher on <a href="https://huggingface.co/spaces/mteb/leaderboard">MTEB</a>, which is the standard embedding benchmark. So why the smaller one?</p>

<p>Three concrete reasons:</p>

<ol>
<li><strong>It's available on Workers AI, at the edge.</strong> An embedding call adds a few milliseconds because it runs in the same colo as the Worker. Calling OpenAI's API from Cloudflare adds a round trip to us-east-1 or wherever OpenAI's edge is, easily 100–200ms. When every write triggers an embedding call, that latency compounds.</li>
<li><strong>768 dimensions is small enough to be cheap to store and fast to search.</strong> 3072-dim vectors take 4x the storage and roughly 4x the compute per similarity comparison. For a memory store aimed at individual users, the storage and query economics of the smaller model win comfortably over the accuracy gap.</li>
<li><strong>It's genuinely competitive on retrieval quality for the kind of content memories contain.</strong> Where the larger models pull ahead is niche technical retrieval, code search, and very long documents. General-purpose personal memory — mostly short prose about projects, decisions, and preferences — sits well inside the range where BGE-base is functionally interchangeable with the giants.</li>
</ol>

<p>If Gnosem were a document search engine over academic papers we'd have made a different call. For personal memory, the tradeoff clearly favors the smaller model.</p>

<h2 id="filter-then-search">Filter-then-search: metadata as a first-class citizen</h2>

<p>Pure vector search has a scaling problem. If you have 10,000 memories and you cosine-compare all of them on every query, you're doing 10,000 dot products of 768-dim vectors per search. That's not slow, but it's wasteful when 9,900 of those memories belong to another user.</p>

<p>Vectorize supports metadata filters that apply <em>before</em> the similarity search runs. Gnosem uses one on every query:</p>

<pre><code>await env.VECTORIZE.query(queryVec, {
  topK: 10,
  filter: { user_id: currentUserId },
  returnValues: false,
});</code></pre>

<p>Filter-first is not just a performance win — it's how per-user isolation is enforced at the query engine layer. See <a href="/blog/building-mcp-server-cloudflare-workers">Building an MCP Server on Cloudflare Workers</a> for the two-layer isolation model. The filter reduces the candidate pool to just this user's memories, then similarity ranks within that pool. Same accuracy, dramatically less compute per query.</p>

<p>You could filter on other metadata too — by tag, by <code>written_by</code>, by date. Gnosem's <code>memory_search</code> today filters on <code>user_id</code> only and does full-population semantic search within that. If future workloads justify it, we'd add explicit tag/date filtering to the search API, but the current pattern is that the semantic ranking is good enough that additional filtering usually adds more friction than clarity.</p>

<h2 id="reranking">Re-ranking: sometimes worth it, often not</h2>

<p>A common escalation: run vector search to get top-N candidates, then run a heavier cross-encoder model to re-rank those candidates and return the top-K. Cross-encoders read the query and each candidate together, which is more expensive than bi-encoder cosine but produces sharper rankings.</p>

<p>Gnosem does not re-rank. The decision: for personal memory sizes (thousands to low tens of thousands of memories per user), the top-10 from cosine search is already accurate enough that the model consuming it can ignore the ordering and just read all 10. Re-ranking adds a second model call and 100–500ms of latency to shave a few percentage points off ranking quality that the LLM downstream would have ignored anyway.</p>

<p>Where re-ranking earns its keep: massive document corpora (millions of docs), tight top-1 requirements, or precision-sensitive retrieval where the LLM sees only the top result. None of those describe personal memory today. If Gnosem ever grows to team-scoped memory with hundreds of contributors, re-ranking becomes plausibly worth it.</p>

<h2 id="hybrid-search">Hybrid search: BM25 + vectors</h2>

<p>Hybrid retrieval combines keyword scoring (typically BM25) with vector similarity. The intuition: keyword search is superb at exact matches for IDs, error codes, function names, proper nouns — the cases where the exact string matters and semantic similarity might miss it. Vector search is better at concepts. Combine both and you cover both regimes.</p>

<p>Gnosem does not currently do hybrid search. It's a plausible future addition. The pragmatic reason we haven't: for the kind of natural-language questions LLMs ask (which is the reading side of Gnosem), pure vector search recall has been solidly good enough. The failures we see aren't "we missed a specific error code" — they're rarer and usually about too-recent memories that hadn't quite absorbed into the assistant's context yet.</p>

<p>Cursor and Claude Code do sometimes write memories containing exact identifiers (SHA hashes, error codes, package versions). Those are cases where BM25 would help. It's on the list, but low priority against features like team scope and JSON export.</p>

<h2 id="embedding-what-and-when">What gets embedded, and when</h2>

<p>One subtle design question: what text goes into the embedding? Gnosem embeds the <em>raw</em> content of the memory, even when the memory is also compressed into structured facts for token-efficient reading (see <a href="/blog/ai-optimized-memory-storage">Memories that Cost Fewer Tokens to Read</a>).</p>

<p>The reason: semantic search should respect natural phrasing. If you write "the auth refactor for the FastAPI backend" and later ask "how did we do login on the Python API," the query and memory should collide in embedding space through the natural-language paths. Embedding the structured form <code>TOPIC=auth | STACK=Python,FastAPI | ACTION=refactor</code> instead of the prose would collapse that similarity by losing the vocabulary the query is likely to use.</p>

<p>Trade-off: this means the compressed form isn't what's being searched. The retrieval ranks memories by how well their raw text matches your query, then returns the compressed form for the reading LLM to consume. Best of both worlds — natural query-matching, token-efficient reading.</p>

<h2 id="cost-model">The cost model of vector search at Gnosem's scale</h2>

<p>Every memory write triggers one Workers AI embedding call. Every search triggers one embedding call for the query, plus one Vectorize query. On Cloudflare's pricing, none of these are individually expensive — Vectorize charges per stored vector and per query, and Workers AI charges by the neuron. For a user with 5,000 memories, the storage and search cost is a small fraction of a dollar a month.</p>

<p>Where cost would matter is if someone tried to run high-frequency polling ("call memory_search every 10 seconds during a session"). Nothing in the protocol prevents this and no MCP client we've observed actually does it, but it's a rate-limit case we watch. In practice, MCP clients call <code>memory_search</code> at natural conversation boundaries — start of a new task, when the user asks a question that suggests prior context — which is a rate an order of magnitude below what would push cost into a concern.</p>

<h2 id="what-vector-search-still-misses">What vector search still misses</h2>

<p>Semantic search is not a solved problem. Failure modes to know about:</p>

<ul>
<li><strong>Temporal reasoning.</strong> "What was our decision from last Thursday?" is a bad query for semantic search because "last Thursday" has no semantic meaning tied to a date. Gnosem does not do temporal retrieval today; the assistant would have to call <code>memory_list</code> with a cursor to walk time.</li>
<li><strong>Negation.</strong> "Memories about databases that are not Postgres" queried semantically will happily return Postgres memories, because the vector for the query is close to the vector for the target. Vector search doesn't understand NOT.</li>
<li><strong>Aggregation.</strong> "How many memories do I have about auth?" is not a retrieval question, it's a count. The right move is <code>memory_list</code> plus assistant-side filtering, not <code>memory_search</code>.</li>
</ul>

<p>For those cases, MCP clients call <code>memory_list</code> and do the reasoning themselves. Semantic search handles the 90% case cleanly; the other 10% is what the other tools are for.</p>

<h2 id="try-it">Try it</h2>

<p>The single best demo: write two or three memories in your natural voice about a project, then ask your assistant a question using totally different words — synonyms, aliases, higher-level concepts. Vector search should find your memories anyway. If it does, that's the property you couldn't have gotten from SQL LIKE, and it's the property that makes cross-vendor memory across Claude, ChatGPT, Cursor, and Windsurf feel like a single continuous conversation instead of a set of grep queries. Try it at <a href="/">gnosem.dev</a>.</p>
`,
  },
  {
    slug: "mcp-registry-cascade",
    title: "How Gnosem lists on the Official MCP Registry, PulseMCP, Smithery, Glama, and mcp.so simultaneously",
    subtitle: "The cascade pattern: publish once to the Official MCP Registry with a DNS-verified namespace, and the downstream aggregators auto-ingest over the next 24-72 hours. What cascades, what doesn't, and the failure modes.",
    published: "2026-07-30",
    readingMinutes: 6,
    description: "How to publish an MCP server once and appear on five directories. What auto-ingests from the Official MCP Registry, what still requires manual submission, and the practical failure modes that trip publishers up.",
    keywords: "MCP registry cascade, publish MCP server multiple directories, PulseMCP Smithery Glama mcp.so auto ingest, official MCP registry downstream, MCP directory listing strategy",
    bodyHtml: `
<p>The Model Context Protocol ecosystem grew a lot of directories fast. There's the <a href="https://registry.modelcontextprotocol.io">Official MCP Registry</a>, which went to preview in late 2025 with backing from Anthropic, GitHub, PulseMCP, and Microsoft. There's <a href="https://www.pulsemcp.com">PulseMCP</a>, the discovery site that predates the official registry. There's <a href="https://smithery.ai">Smithery</a>, which does install tooling and directory. There's <a href="https://glama.ai/mcp/servers">Glama</a>, which does its own metadata scraping and quality scoring. There's <a href="https://mcp.so">mcp.so</a>, a Chinese-run aggregator with good SEO. Plus the two big awesome-mcp-servers GitHub lists (<a href="https://github.com/punkpeye/awesome-mcp-servers">punkpeye</a> and <a href="https://github.com/wong2/awesome-mcp-servers">wong2</a>).</p>

<p>You want to be on all of them, because your users find MCP servers by searching one of those places. But you don't want to submit seven times.</p>

<p>Good news: for most of them, you don't have to. The cascade works. <a href="/">Gnosem</a> is listed on all five of the auto-ingesting directories from a single publish to the Official Registry — this post is the practical write-up of what actually cascades, what doesn't, and where publishers most often trip.</p>

<h2 id="the-single-source-of-truth">The single source of truth</h2>

<p>The Official MCP Registry is designed to be the upstream. Its API at <code>registry.modelcontextprotocol.io/v0/servers</code> is what the downstream aggregators query on a scheduled ingest. Publish to the registry once and the aggregators pull your listing on their own timelines.</p>

<p>The publishing flow is a two-step, ~20-minute process:</p>

<ol>
<li>Write a <code>server.json</code> manifest.</li>
<li>Publish it with <code>mcp-publisher</code>, authenticated by an Ed25519 signature over a DNS TXT record you control.</li>
</ol>

<p>The full walkthrough with code is in <a href="/blog/publishing-to-official-mcp-registry">Publishing to the Official MCP Registry</a>. This post assumes you've done that step or are about to, and focuses on what happens next.</p>

<h2 id="what-cascades">What cascades automatically</h2>

<p>Once your listing is live on the official registry (which happens the moment <code>mcp-publisher publish</code> succeeds), the following downstream directories will ingest without further action:</p>

<h3>PulseMCP</h3>

<p>PulseMCP runs a daily ingest from the official registry. Gnosem's listing appeared on PulseMCP within about 24 hours of the official-registry publish. No submission form to fill out. If your registry manifest has a good description and a working URL, PulseMCP's listing looks identical without additional work.</p>

<h3>Smithery</h3>

<p>Smithery ingests from the official registry and also does its own scan of your MCP endpoint to fill out tool-list metadata. This is where Bearer-token-gated servers hit a wall: Smithery's scan hits your <code>/mcp</code> endpoint without an Authorization header, gets a 401, and falls back to whatever metadata was in the registry.</p>

<p>The workaround: serve a <code>/.well-known/mcp/server-card.json</code> alongside your gated MCP endpoint. This is a public endpoint returning the same server-card metadata that a successful MCP <code>initialize</code> would return. Smithery reads it and gets the full tool list without needing auth. Gnosem's card lives at <a href="https://gnosem.dev/.well-known/mcp/server-card.json">gnosem.dev/.well-known/mcp/server-card.json</a>.</p>

<h3>Glama</h3>

<p>Glama pulls from the official registry plus its own scans, and requires a public GitHub repository URL in the manifest's <code>repository.url</code>. If you don't have one, Glama's listing will exist but be much sparser (no README rendering, no license badge, no stars). Even a README-only repo helps.</p>

<p>Glama also runs its own quality scoring, so metadata like a clear description, an actual license file in the repo, and evidence of maintenance (recent commits) all move the score.</p>

<h3>mcp.so</h3>

<p>mcp.so ingests from the official registry on a slower cycle — Gnosem took about three days to appear. Nothing to configure; it just takes longer. mcp.so has strong SEO in some markets, so it's worth the wait even if the ingestion lag is annoying.</p>

<h2 id="what-doesnt-cascade">What doesn't cascade</h2>

<p>Two categories don't auto-ingest and still require you to do the work:</p>

<h3>The awesome-mcp-servers GitHub lists</h3>

<p>Both punkpeye/awesome-mcp-servers and wong2/awesome-mcp-servers are curated by hand. Neither reads the official registry. If you want to be on those lists:</p>

<ul>
<li><strong>punkpeye</strong> — open a pull request against <a href="https://github.com/punkpeye/awesome-mcp-servers">the repo</a> adding a single line in the appropriate category. Concise description, name-linked to your homepage. Review is usually a few days.</li>
<li><strong>wong2</strong> — submit via the web form at <a href="https://mcpservers.org/submit">mcpservers.org/submit</a>. Turnaround similar.</li>
</ul>

<p>Both lists are lower-priority than the auto-cascade sites in terms of discovery volume, but they're where enthusiast users browse and where you get some GitHub-organic traffic. Do them both once, then forget about them.</p>

<h3>Vendor-specific directories</h3>

<p>Anthropic, OpenAI, and other model vendors are starting to build their own MCP server marketplaces or featured lists. These are curated, invite-only, or require a partnership process. They're outside the registry cascade entirely. If you have a reason to be on Anthropic's featured list, that's a separate conversation with Anthropic. The cascade helps you get discovered enough that those conversations become feasible.</p>

<h2 id="the-namespace-story">Why DNS-verified namespaces matter for the cascade</h2>

<p>The Official Registry supports two kinds of namespaces: reverse-DNS namespaces (like <code>dev.gnosem</code>) that require DNS verification, and <code>io.github.&lt;user&gt;/</code> namespaces that are auto-issued to any GitHub user.</p>

<p>Publishing under a DNS-verified namespace matters for the downstream cascade in one specific way: the aggregators treat DNS-verified listings as first-party. Glama, for instance, shows a "verified" badge for DNS-namespaced servers and de-prioritizes GitHub-namespaced ones in some search rankings. PulseMCP surfaces the domain of the server prominently, which reads as more legit when it matches your product's domain.</p>

<p>For anything you'd call a product (not a hobby server), DNS verification is worth the 15 extra minutes.</p>

<h2 id="failure-modes">The failure modes we hit</h2>

<p>Three sharp edges from actually running this cascade for Gnosem:</p>

<p><strong>Description length.</strong> The registry caps <code>description</code> at 100 characters. If you write a 120-character description, validation rejects with 422. The downstream aggregators inherit the same description, so you have exactly 100 characters to communicate the value proposition. Ours: "Cross-vendor AI memory over MCP. One semantic store, readable and writeable from every MCP client." — 98 chars.</p>

<p><strong>Bearer-gated endpoints trip Smithery.</strong> If your MCP server requires an Authorization header (which it should if it's a hosted per-user product), Smithery's scan will 401 and fall back to registry metadata. Publishing a public server-card at <code>/.well-known/mcp/server-card.json</code> is the fix. This is not documented in the MCP spec directly; it's a convention some scanners rely on.</p>

<p><strong>Missing metadata index.</strong> Not a cascade failure, but adjacent: if you're using Cloudflare Vectorize and you want per-user filtering in the vector query, you have to create the metadata index at provisioning time. Without it, filter queries silently return empty. Discussed in <a href="/blog/building-mcp-server-cloudflare-workers">Building an MCP Server on Cloudflare Workers</a>. Mention it here because if your server responds to Smithery's scan by returning empty tool lists (because filtered lookups fail), your listing looks broken even though it's not.</p>

<h2 id="what-a-good-registry-manifest-looks-like">What a good registry manifest looks like</h2>

<p>Since every downstream directory inherits your registry manifest, it's worth writing carefully. Here's Gnosem's:</p>

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

<p>Every field earns its keep:</p>

<ul>
<li><code>name</code>: reverse-DNS format, DNS-verified.</li>
<li><code>title</code>: display name. Simple.</li>
<li><code>description</code>: 98 characters, states the value proposition and the mechanism.</li>
<li><code>repository.url</code>: needed for Glama to render the README and license.</li>
<li><code>websiteUrl</code>: this is where downstream aggregators link. Should be your marketing landing page, not the MCP endpoint.</li>
<li><code>remotes</code>: streamable-http type is the modern one. Include the actual MCP endpoint URL.</li>
</ul>

<p>Not shown but worth adding if applicable: <code>packages</code> (if you also distribute an npm-installable local variant), <code>icon</code> (some directories render it).</p>

<h2 id="the-lesson">The lesson</h2>

<p>The MCP ecosystem is early enough that the cascade infrastructure works surprisingly well. One publish, one afternoon, five directories over the following few days, no per-directory submission grind. This is not the historical norm for developer tooling ecosystems — usually every directory demands its own submission with slightly different metadata requirements and its own dashboard to log into. The MCP world has, so far, been much more federated. Publishers benefit; users benefit; the aggregators benefit because they get high-quality first-party data instead of scraping the web.</p>

<p>If you're building an MCP server, do the registry publish. It really is a 20-minute task and it's the highest leverage marketing action available. Then submit to the two awesome-mcp-servers lists as a manual afterthought. That's the whole distribution loop.</p>

<p>See <a href="/blog/publishing-to-official-mcp-registry">Publishing to the Official MCP Registry</a> for the exact commands, and the <a href="/">Gnosem landing page</a> for what a published MCP product looks like from the user side.</p>
`,
  },
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
