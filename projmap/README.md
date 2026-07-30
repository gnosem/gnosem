# projmap

**Where your projects live, so every AI you use can find them.**

`projmap` is a tiny CLI that walks your filesystem, discovers source-code projects, and files each one into [Gnosem](https://gnosem.dev) — a cross-vendor semantic memory that any MCP-capable client (Claude Desktop, Claude Code, ChatGPT with MCP, Cursor, Windsurf, Zed) can query.

The upshot: you can ask any AI *"where does my CalcuttaCalc repo live?"* and get a real path back — the same answer, from every model, in every session, no manual `CLAUDE.md` juggling.

`projmap` is a **companion** to [`gnosem-install`](https://npmjs.com/package/gnosem-install), not a replacement. Install both to get cross-vendor memory + a seeded project index.

## Install

```bash
npm install -g @gnosem/projmap
# or run without installing
npx @gnosem/projmap scan
```

Requires **Node 18+** (uses global `fetch`) and a [Gnosem](https://gnosem.dev) account. The free tier (200 memories) is plenty for a project index.

## Setup

`projmap` needs your Gnosem API key. It reads, in order:

1. `GNOSEM_API_KEY` env var
2. `~/.projmap/config.json` (`{"api_key": "gn_..."}`)
3. Interactive prompt on first run (saved to `~/.projmap/config.json` with mode `0600`)

Get a key at [gnosem.dev/dashboard](https://gnosem.dev/dashboard).

## Usage

### Seed the index

```bash
# scan default roots (~), depth 5
projmap scan

# scan specific project homes
projmap scan ~/Documents/Claude/Projects ~/CueTV ~/Desktop

# deeper walk
projmap scan ~/dev --depth 8

# show every project as it's discovered
projmap scan ~ --verbose
```

Each discovered project becomes one Gnosem memory tagged `project-path` + a kind tag (`node`, `rust`, `python`, `go`, `worker`, `other`). Re-running `scan` is idempotent: unchanged projects are skipped, and if metadata drifts (kind, description) `projmap` calls `memory_supersede` on the existing memory instead of duplicating.

### List what's registered

```bash
projmap list
```

```
projmap — 8 project(s)

NAME                          KIND    PATH
ConstructionContractsCounsel  worker  /Users/zac/Documents/Claude/Projects/ConstructionContractsCounsel
CueTV                         other   /Users/zac/CueTV
Parimutuel Betting App        worker  /Users/zac/Documents/Claude/Projects/Parimutuel Betting App
sharedmem                     worker  /Users/zac/Documents/Claude/Projects/sharedmem
...
```

### Search

```bash
projmap find "the ranch website"
projmap find "cloudflare worker for taco reviews"
projmap find "python bot"
```

Uses Gnosem's semantic search restricted to the `project-path` tag. Returns top 10.

### Add / remove manually

```bash
projmap add MyDotfiles ~/dotfiles "personal machine setup"
projmap remove OldProject
```

`add` deduplicates by PATH: adding a project whose path is already registered supersedes the existing memory instead of creating a duplicate.

`remove` matches by NAME (case-insensitive) and soft-deletes via `memory_forget`.

## How projects are detected

`projmap` looks for one of these signals inside a directory (highest priority first):

| Signal | Kind inferred |
|---|---|
| `.git/` | detected from other files in the dir |
| `wrangler.jsonc` / `wrangler.toml` | `worker` |
| `package.json` | `node` |
| `Cargo.toml` | `rust` |
| `pyproject.toml` | `python` |
| `go.mod` | `go` |
| `CLAUDE.md` | `other` |

When any signal matches, that directory becomes a project root and `projmap` stops descending — nested sub-packages (monorepo workspaces, submodules) are intentionally not double-indexed. Description text is pulled from `package.json`'s `description` field or the first paragraph of `README.md`.

### What's skipped

- `node_modules`, `.git` (as a leaf), `Library`, `Applications`, `.cache`, `.venv`, `.wrangler`, `.next`, `.nuxt`, `dist`, `build`, `.vercel`, `.turbo`, `target`, `__pycache__`, and similar caches
- Any directory listed as a plain literal in a nearby `.gitignore`
- Hidden dirs (`.something/`) below depth 0
- Symlinks (never followed — walker records real paths to avoid cycles)

## Why this exists

If you use more than one AI coding assistant, every fresh session starts context-blind. Claude Code has `CLAUDE.md`, Cursor has `.cursorrules`, ChatGPT has neither. `projmap` writes project paths to a place all of them can read (Gnosem's MCP tools), so *"where's the Toucanplay repo?"* has one answer everywhere.

## Design choices

- **Zero dependencies.** Node builtins + `fetch()` only. This CLI is under 400 lines; you should be able to read the whole thing before running it.
- **Never log the API key.** Not to stdout, not to files other than `~/.projmap/config.json` (0600).
- **Symlinks are not followed.** The walker records real paths in a Set to avoid cycles even if you re-root a scan through a symlinked parent.
- **Idempotent by PATH.** Rescanning is safe: unchanged projects skip, changed ones supersede, new ones write. You'll never accumulate duplicates.

## License

MIT — [source](https://github.com/gnosem/gnosem/tree/main/projmap)
