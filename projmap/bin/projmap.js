#!/usr/bin/env node
// projmap — index where your source projects live and store them in Gnosem so any AI
// (Claude Desktop, Claude Code, ChatGPT, Cursor, Windsurf, Zed) can query for paths
// via `memory_search` on the `project-path` tag.
//
// Companion to `gnosem-install`; requires a Gnosem account (https://gnosem.dev).
// Zero dependencies — Node builtins + global fetch() only.
//
// Usage:
//   projmap scan [ROOT ...]              # walk trees, seed Gnosem with project-path memories
//   projmap list                         # list every registered project (aligned columns)
//   projmap find QUERY                   # semantic search filtered to project-path tag
//   projmap add NAME PATH [DESCRIPTION]  # manually register a project
//   projmap remove NAME                  # soft-delete via memory_forget
//   projmap --help                       # this message

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, ".projmap");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const MCP_URL = "https://gnosem.dev/mcp";
const TAG = "project-path";
const KEY_RE = /^gn_[a-f0-9]{32}$/i;
const WRITTEN_BY = "projmap";

// ---------- Console output (matches gnosem-install style) ----------
const isTTY = process.stdout.isTTY;
const style = (open, close) => (s) => isTTY ? `\x1b[${open}m${s}\x1b[${close}m` : String(s);
const bold = style(1, 22);
const dim = style(2, 22);
const green = style(32, 39);
const yellow = style(33, 39);
const red = style(31, 39);
const cyan = style(36, 39);
const terracotta = style(38, 39); // 38 = default fg fallback; we override via 38;2
const terra = (s) => isTTY ? `\x1b[38;2;162;96;63m${s}\x1b[39m` : String(s);

function log(...args) { console.log(...args); }
function info(msg) { log(cyan("→"), msg); }
function ok(msg) { log(green("✓"), msg); }
function warn(msg) { log(yellow("!"), msg); }
function fail(msg) { log(red("✗"), msg); }

// ---------- Auth: env > config file > interactive prompt ----------
function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch { return {}; }
}
function writeConfig(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}
async function promptInteractive(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: isTTY });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}
async function getApiKey() {
  if (process.env.GNOSEM_API_KEY) return process.env.GNOSEM_API_KEY.trim();
  const cfg = readConfig();
  if (cfg.api_key) return String(cfg.api_key).trim();
  log(dim("First run — need your Gnosem API key. Get one at https://gnosem.dev"));
  const key = await promptInteractive(cyan("Paste your Gnosem API key (gn_...): "));
  if (!KEY_RE.test(key)) {
    fail("that doesn't look like a Gnosem key (expected gn_ + 32 hex chars).");
    process.exit(1);
  }
  writeConfig({ api_key: key });
  ok(dim("saved to ~/.projmap/config.json (0600)"));
  return key;
}

// ---------- MCP JSON-RPC transport ----------
let RPC_ID = 0;
async function mcp(key, method, params) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": "Bearer " + key,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++RPC_ID, method, params }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`gnosem ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = await res.json();
  if (body.error) throw new Error(`gnosem: ${body.error.message || JSON.stringify(body.error)}`);
  return body.result;
}
async function callTool(key, name, args) {
  const result = await mcp(key, "tools/call", { name, arguments: args });
  // structuredContent is the machine-readable form (worker.js returns both text + structured).
  return result.structuredContent ?? (result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result);
}

// ---------- Project detection ----------
// Signals a directory is a "project root", in priority order (highest → lowest).
// The first signal found short-circuits — .git wins over package.json, etc. — so we don't
// double-count sub-packages inside monorepos and we surface the outermost logical root.
const SIGNALS = [
  { file: ".git",           kind: null    }, // kind decided by supplementary file
  { file: "wrangler.jsonc", kind: "worker" },
  { file: "wrangler.toml",  kind: "worker" },
  { file: "package.json",   kind: "node"  },
  { file: "Cargo.toml",     kind: "rust"  },
  { file: "pyproject.toml", kind: "python"},
  { file: "go.mod",         kind: "go"    },
  { file: "CLAUDE.md",      kind: "other" }, // Zac's convention — always a project marker
];

// Directories we never descend into. Kept small and boring on purpose.
const SKIP_DIRS = new Set([
  "node_modules", ".git", "Library", "Applications", ".cache", ".venv", ".wrangler",
  ".next", ".nuxt", "dist", "build", ".vercel", ".turbo", "target", "__pycache__",
  ".mypy_cache", ".pytest_cache", ".ruff_cache", ".idea", ".vscode", ".DS_Store",
  "vendor", ".firecrawl",
]);

function detectKind(dir) {
  // Look at supplementary files to refine kind when the primary signal was .git
  if (fs.existsSync(path.join(dir, "wrangler.jsonc")) || fs.existsSync(path.join(dir, "wrangler.toml"))) return "worker";
  if (fs.existsSync(path.join(dir, "Cargo.toml"))) return "rust";
  if (fs.existsSync(path.join(dir, "pyproject.toml")) || fs.existsSync(path.join(dir, "requirements.txt")) || fs.existsSync(path.join(dir, "setup.py"))) return "python";
  if (fs.existsSync(path.join(dir, "go.mod"))) return "go";
  if (fs.existsSync(path.join(dir, "package.json"))) return "node";
  return "other";
}

function classifyProject(dir) {
  for (const s of SIGNALS) {
    if (fs.existsSync(path.join(dir, s.file))) {
      return { kind: s.kind || detectKind(dir), signal: s.file };
    }
  }
  return null;
}

// Read a short description from package.json or the first non-blank line of README.md.
function readDescription(dir) {
  const pkgPath = path.join(dir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.description && typeof pkg.description === "string") {
        return pkg.description.slice(0, 240).replace(/\s+/g, " ").trim();
      }
    } catch { /* ignore */ }
  }
  for (const readme of ["README.md", "README", "README.txt", "Readme.md", "readme.md"]) {
    const p = path.join(dir, readme);
    if (!fs.existsSync(p)) continue;
    try {
      const raw = fs.readFileSync(p, "utf8");
      const lines = raw.split(/\r?\n/);
      let seenHeader = false;
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        // Skip the H1 line; grab the first paragraph after it.
        if (/^#+\s/.test(t) && !seenHeader) { seenHeader = true; continue; }
        // Skip badges, images, and lines that are only HTML tags (e.g. <p align="center">).
        if (/^\[!\[/.test(t) || /^<img/.test(t)) continue;
        if (/^<\/?\w+[^>]*>$/.test(t)) continue;
        // Strip all HTML tags for readability (READMEs sometimes wrap the tagline in <p>/<strong>/<br>).
        const clean = t.replace(/<[^>]+>/g, "").trim();
        if (!clean) continue;
        return clean.slice(0, 240).replace(/\s+/g, " ").trim();
      }
    } catch { /* ignore */ }
  }
  return null;
}

// Best-effort .gitignore respect: within a project we honor the top-level .gitignore
// for the SKIP set. We don't build a full ignore engine (zero deps) — we only add
// literal directory names from the .gitignore into the walker's skip set for that subtree.
function readGitignoreDirs(root) {
  const gi = path.join(root, ".gitignore");
  if (!fs.existsSync(gi)) return new Set();
  const extra = new Set();
  try {
    for (const line of fs.readFileSync(gi, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#") || t.startsWith("!")) continue;
      // Only interpret plain directory names (e.g. "dist/", "coverage") — anything with
      // globs or nested paths we skip to avoid pretending to be gitignore-compliant.
      const clean = t.replace(/^\.?\/?/, "").replace(/\/$/, "");
      if (!clean || /[\*\?\[]/.test(clean) || clean.includes("/")) continue;
      extra.add(clean);
    }
  } catch { /* ignore */ }
  return extra;
}

// Walker. Depth-first, respects depth cap, symlink cycle protection via real-path set.
function walk(roots, { depth, verbose }) {
  const found = [];
  const seenReal = new Set(); // real path dedup for symlinks

  function visit(dir, currentDepth, extraSkips) {
    let real;
    try { real = fs.realpathSync(dir); } catch { return; }
    if (seenReal.has(real)) return;
    seenReal.add(real);

    let stat;
    try { stat = fs.lstatSync(dir); } catch { return; }
    // Never follow symlinks (cycle safety).
    if (stat.isSymbolicLink()) return;
    if (!stat.isDirectory()) return;

    const base = path.basename(dir);
    if (SKIP_DIRS.has(base) || extraSkips.has(base)) return;
    // Hidden dirs other than well-known project markers get skipped by default (avoids
    // walking ~/.npm, ~/.cursor, ~/.gem, etc). We do allow the initial roots even if
    // hidden — the depth check below is what matters for hidden nesting.
    if (currentDepth > 0 && base.startsWith(".") && !["home"].includes(base)) return;

    // Is THIS directory a project root? If yes, capture and stop descent — nested projects
    // (workspaces, submodules) will be indexed via their own scan if the user runs it.
    const cls = classifyProject(dir);
    if (cls) {
      if (verbose) info(dim(`  ${real}`));
      found.push({
        name: base,
        path: real,
        kind: cls.kind,
        signal: cls.signal,
        description: readDescription(dir),
      });
      return;
    }

    if (currentDepth >= depth) return;

    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    // Additive skip: .gitignore's plain dir names within this subtree.
    const localSkips = new Set([...extraSkips, ...readGitignoreDirs(dir)]);

    for (const e of entries) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      visit(path.join(dir, e.name), currentDepth + 1, localSkips);
    }
  }

  for (const r of roots) {
    const abs = path.resolve(r.replace(/^~(?=$|\/)/, HOME));
    if (!fs.existsSync(abs)) { warn(`root does not exist: ${abs}`); continue; }
    visit(abs, 0, new Set());
  }
  return found;
}

// ---------- Memory record helpers ----------
function encodeMemory(p) {
  const desc = p.description ? ` DESCRIPTION=${p.description}` : "";
  return `PROJECT=${p.name} PATH=${p.path} KIND=${p.kind}${desc}`;
}
function parseMemoryContent(content) {
  const out = {};
  // Field values may contain spaces; the pattern is <KEY>=<val> repeated. Parse by keying
  // off the next uppercase KEY= token to end each value.
  const re = /\b(PROJECT|PATH|KIND|DESCRIPTION)=(.+?)(?=\s+(?:PROJECT|PATH|KIND|DESCRIPTION)=|$)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

// Fetch every active project-path memory. Paginates via memory_list cursor.
async function fetchAllProjectMemories(key) {
  const memories = [];
  let cursor = null;
  for (let i = 0; i < 20; i++) { // hard safety cap; 20*200 = 4000 memories max
    const args = { limit: 200, raw: true };
    if (cursor) args.cursor = cursor;
    const page = await callTool(key, "memory_list", args);
    for (const m of (page.memories || [])) {
      if (Array.isArray(m.tags) && m.tags.includes(TAG)) memories.push(m);
    }
    if (!page.cursor) break;
    cursor = page.cursor;
  }
  return memories;
}

// ---------- Commands ----------
async function cmdScan(rootsArg, opts) {
  const key = await getApiKey();
  const roots = rootsArg.length > 0 ? rootsArg : [HOME];
  const depth = Number.isFinite(opts.depth) ? opts.depth : 5;

  log(bold("projmap scan"), dim(`— depth ${depth}, roots: ${roots.join(", ")}`));
  log("");
  info("walking filesystem…");
  const projects = walk(roots, { depth, verbose: opts.verbose });
  ok(`found ${bold(String(projects.length))} project root(s)`);

  if (projects.length === 0) return;

  info("checking Gnosem for existing entries…");
  const existing = await fetchAllProjectMemories(key);
  const byPath = new Map();
  for (const m of existing) {
    const parsed = parseMemoryContent(m.content_raw || m.content || "");
    if (parsed.path) byPath.set(parsed.path, { id: m.id, parsed });
  }
  log(dim(`  ${byPath.size} project-path memories already in Gnosem`));

  let inserted = 0, updated = 0, skipped = 0;
  log("");
  for (const p of projects) {
    const content = encodeMemory(p);
    const tags = [TAG, p.kind];
    const prior = byPath.get(p.path);

    if (!prior) {
      try {
        await callTool(key, "memory_write", { content, tags, written_by: WRITTEN_BY });
        ok(`${terra(p.name.padEnd(28))} ${dim(p.path)}`);
        inserted++;
      } catch (e) {
        fail(`${p.name}: write failed — ${e.message}`);
      }
      continue;
    }

    // Same PATH → supersede if any field changed; else skip.
    const prev = prior.parsed;
    const same = prev.project === p.name
      && prev.kind === p.kind
      && (prev.description || "") === (p.description || "");
    if (same) {
      log(dim(`= ${p.name.padEnd(28)} ${p.path} (unchanged)`));
      skipped++;
      continue;
    }
    try {
      await callTool(key, "memory_supersede", { old_id: prior.id, new_content: content, tags, written_by: WRITTEN_BY });
      log(cyan("↻"), `${p.name.padEnd(28)} ${dim(p.path)} ${dim("(updated)")}`);
      updated++;
    } catch (e) {
      fail(`${p.name}: supersede failed — ${e.message}`);
    }
  }

  log("");
  ok(bold(`scan complete — ${inserted} new, ${updated} updated, ${skipped} unchanged`));
  log(dim("query with:  projmap list   |   projmap find <query>"));
}

async function cmdList() {
  const key = await getApiKey();
  const memories = await fetchAllProjectMemories(key);
  if (memories.length === 0) {
    warn("no projects registered. Run `projmap scan` to seed them.");
    return;
  }
  // Parse + sort alphabetically by project name.
  const rows = memories.map(m => {
    const p = parseMemoryContent(m.content_raw || m.content || "");
    return {
      name: p.project || "(unknown)",
      kind: p.kind || "?",
      path: p.path || "?",
      description: p.description || "",
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const nameW = Math.max(4, ...rows.map(r => r.name.length));
  const kindW = Math.max(4, ...rows.map(r => r.kind.length));

  log(bold(`projmap — ${rows.length} project(s)`));
  log("");
  log(dim(`${"NAME".padEnd(nameW)}  ${"KIND".padEnd(kindW)}  PATH`));
  for (const r of rows) {
    log(`${terra(r.name.padEnd(nameW))}  ${r.kind.padEnd(kindW)}  ${dim(r.path)}`);
  }
}

async function cmdFind(query) {
  if (!query) { fail("usage: projmap find <query>"); process.exit(1); }
  const key = await getApiKey();
  const res = await callTool(key, "memory_search", { query, k: 30, raw: true });
  const hits = (res.matches || [])
    .filter(m => Array.isArray(m.tags) && m.tags.includes(TAG))
    .slice(0, 10);
  if (hits.length === 0) {
    warn(`no project-path matches for "${query}".`);
    return;
  }
  log(bold(`projmap find — top ${hits.length} match(es) for "${query}"`));
  log("");
  for (const m of hits) {
    const p = parseMemoryContent(m.content_raw || m.content || "");
    const score = typeof m.score === "number" ? m.score.toFixed(3) : "—";
    log(`${terra(p.project || "?")} ${dim(`[${p.kind || "?"}]`)} ${dim(`score ${score}`)}`);
    log(`  ${dim(p.path || "?")}`);
    if (p.description) log(`  ${dim(p.description)}`);
    log("");
  }
}

async function cmdAdd(argv) {
  const name = argv[0];
  const rawPath = argv[1];
  const description = argv.slice(2).join(" ").trim();
  if (!name || !rawPath) { fail("usage: projmap add NAME PATH [DESCRIPTION]"); process.exit(1); }
  const abs = path.resolve(rawPath.replace(/^~(?=$|\/)/, HOME));
  if (!fs.existsSync(abs)) warn(`path does not exist: ${abs} (registering anyway)`);
  const kind = fs.existsSync(abs) ? (classifyProject(abs)?.kind || detectKind(abs)) : "other";
  const key = await getApiKey();

  // Dedup by PATH.
  const existing = await fetchAllProjectMemories(key);
  const prior = existing.find(m => {
    const p = parseMemoryContent(m.content_raw || m.content || "");
    return p.path === abs;
  });
  const record = { name, path: abs, kind, description: description || null };
  const content = encodeMemory(record);
  const tags = [TAG, kind];
  if (prior) {
    await callTool(key, "memory_supersede", { old_id: prior.id, new_content: content, tags, written_by: WRITTEN_BY });
    ok(`updated ${terra(name)} ${dim(abs)}`);
  } else {
    await callTool(key, "memory_write", { content, tags, written_by: WRITTEN_BY });
    ok(`added ${terra(name)} ${dim(abs)}`);
  }
}

async function cmdRemove(nameArg) {
  if (!nameArg) { fail("usage: projmap remove NAME"); process.exit(1); }
  const key = await getApiKey();
  const memories = await fetchAllProjectMemories(key);
  const matches = memories.filter(m => {
    const p = parseMemoryContent(m.content_raw || m.content || "");
    return (p.project || "").toLowerCase() === nameArg.toLowerCase();
  });
  if (matches.length === 0) { warn(`no project named "${nameArg}" is registered.`); return; }
  for (const m of matches) {
    const p = parseMemoryContent(m.content_raw || m.content || "");
    await callTool(key, "memory_forget", { id: m.id });
    ok(`removed ${terra(p.project || "?")} ${dim(p.path || "")}`);
  }
}

function help() {
  log(`${bold("projmap")} ${dim("— where your projects live, so every AI you use can find them.")}

Backed by ${bold("Gnosem")} (${cyan("https://gnosem.dev")}). Companion CLI to gnosem-install.

${bold("Usage")}
  projmap scan [ROOT ...] [--depth N]   walk trees, seed Gnosem
  projmap list                          list registered projects
  projmap find QUERY                    semantic search (project-path only)
  projmap add NAME PATH [DESCRIPTION]   manually register
  projmap remove NAME                   soft-delete

${bold("Options")}
  --depth N         max walk depth (default 5)
  --verbose, -v     print each project as it's found
  --help, -h        this help

${bold("Auth")}
  Set ${dim("GNOSEM_API_KEY")} or store one at ${dim("~/.projmap/config.json")}.
  First run without either will prompt you and save the key (0600).

${bold("Detection signals")} ${dim("(highest priority first)")}
  .git · wrangler.jsonc · package.json · Cargo.toml · pyproject.toml · go.mod · CLAUDE.md
`);
}

// ---------- Arg parsing ----------
function parseArgs(argv) {
  const positional = [];
  const opts = { depth: 5, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { opts.help = true; continue; }
    if (a === "--verbose" || a === "-v") { opts.verbose = true; continue; }
    if (a === "--depth") { opts.depth = Math.max(1, Math.min(20, Number(argv[++i]) || 5)); continue; }
    positional.push(a);
  }
  return { positional, opts };
}

// ---------- Main ----------
(async () => {
  const raw = process.argv.slice(2);
  if (raw.length === 0 || raw[0] === "--help" || raw[0] === "-h") { help(); process.exit(0); }
  const cmd = raw[0];
  const rest = raw.slice(1);
  const { positional, opts } = parseArgs(rest);
  if (opts.help) { help(); process.exit(0); }

  try {
    switch (cmd) {
      case "scan":   await cmdScan(positional, opts); break;
      case "list":   await cmdList(); break;
      case "find":   await cmdFind(positional.join(" ")); break;
      case "add":    await cmdAdd(positional); break;
      case "remove": await cmdRemove(positional[0]); break;
      default:
        fail(`unknown command: ${cmd}`);
        help();
        process.exit(1);
    }
  } catch (e) {
    fail(e.message || String(e));
    process.exit(1);
  }
})();
