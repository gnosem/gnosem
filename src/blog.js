// Gnosem blog — single-source-of-truth for posts.
// Each post is HTML with schema.org BlogPosting JSON-LD embedded.
// Shares the landing page's typography (Georgia + system sans, ink #0F172A on cream #F5F1EA).

const SHARED_CSS = `
body{font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#0F172A;background:#F5F1EA}
h1{font-family:Georgia,serif;font-size:36px;line-height:1.18;margin:0 0 12px;letter-spacing:-.015em}
h2{font-family:Georgia,serif;font-size:22px;font-weight:600;margin:36px 0 10px;letter-spacing:-.005em}
h3{font-family:Georgia,serif;font-size:18px;font-weight:600;margin:28px 0 8px}
p{margin:0 0 16px}
ul,ol{margin:0 0 16px 22px;padding:0}
li{margin:0 0 6px}
a{color:#7a2e2e}
a:hover{text-decoration:underline}
code{font-family:ui-monospace,SF Mono,Consolas,monospace;font-size:13.5px;background:#eae4d6;padding:1px 5px;border-radius:2px}
pre{font-family:ui-monospace,SF Mono,Consolas,monospace;font-size:13px;background:#0F172A;color:#F5F1EA;padding:14px 16px;border-radius:4px;overflow-x:auto;margin:0 0 18px;line-height:1.5}
pre code{background:none;padding:0;color:inherit;font-size:inherit}
blockquote{border-left:3px solid #B08D3E;margin:0 0 16px;padding:2px 0 2px 14px;color:#3a3833;font-style:italic}
hr{border:none;border-top:1px solid rgba(35,32,27,.14);margin:32px 0}
.tag{display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:.1em;background:#0F172A;color:#F5F1EA;padding:3px 10px;border-radius:2px;margin-bottom:14px}
.meta{font-size:13px;color:#5b564d;margin:0 0 28px;letter-spacing:.02em}
.meta a{color:#5b564d}
.mast{display:flex;align-items:center;gap:10px;margin-bottom:24px;text-decoration:none;color:#0F172A}
.mast img{width:32px;height:32px}
.mast .n{font-family:Georgia,serif;font-size:18px;font-weight:600}
.cta{display:inline-block;font-weight:700;font-size:14px;background:#0F172A;color:#F5F1EA;padding:10px 18px;border-radius:3px;text-decoration:none;margin:16px 0}
a.cta{color:#F5F1EA}
.footer{margin-top:48px;padding-top:20px;border-top:1px solid rgba(35,32,27,.14);font-size:13px;color:#5b564d}
`;

export const POSTS = [
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
<link rel="apple-touch-icon" href="/favicon.svg">`;
}

function masthead() {
  return `<a class="mast" href="/"><img src="/mark.svg" alt=""><span class="n">gnosem</span></a>`;
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
