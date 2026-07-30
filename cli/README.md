# gnosem-install

One-command installer for [Gnosem](https://gnosem.dev) — cross-vendor AI memory over MCP.

Detects and configures every MCP-capable client on your machine (Claude Desktop, Claude Code, Cursor, Windsurf, Zed) with the same Gnosem API key, so a memory written from one client is instantly readable from any other.

## Use

```bash
npx gnosem-install
```

You'll be prompted for your Gnosem API key. Get one at [gnosem.dev](https://gnosem.dev) (free tier: 200 memories, no credit card).

Non-interactive:

```bash
npx gnosem-install --key gn_your_key
# or
GNOSEM_API_KEY=gn_your_key npx gnosem-install
```

Preview without changing anything:

```bash
npx gnosem-install --dry-run
```

## What it does

For each installed MCP client, the script:

1. Reads the client's current MCP config (JSON).
2. Adds a `gnosem` entry alongside your existing servers.
3. Writes back, preserving all other settings.
4. Creates a `.bak-gnosem-<timestamp>` backup of the original config next to it.
5. Prints exactly which files it touched and what to restart.

The key stays local to your machine — never sent anywhere except `gnosem.dev/mcp` on each call from your client.

## Supported clients

| Client | Detection | Config path (macOS) |
|---|---|---|
| Claude Desktop | `/Applications/Claude.app` OR existing config | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Code | `which claude` | Uses `claude mcp add --scope user` |
| Cursor | `/Applications/Cursor.app` OR existing config | `~/.cursor/mcp.json` |
| Windsurf | `/Applications/Windsurf.app` OR existing config | `~/.codeium/windsurf/mcp_config.json` |
| Zed | Existing settings | `~/.config/zed/settings.json` (`context_servers.gnosem`) |

If you use an MCP client not in this list, add gnosem manually — the pattern is documented at [gnosem.dev](https://gnosem.dev).

## After install

Restart the affected clients. Your assistant should see five new tools:

- `memory_write` — save a fact
- `memory_search` — semantic search
- `memory_list` — most recent memories
- `memory_forget` — soft-delete
- `memory_supersede` — replace a stale memory

Dashboard: [gnosem.dev/dashboard](https://gnosem.dev/dashboard).

## License

MIT — [source](https://github.com/gnosem/gnosem/tree/main/cli)
