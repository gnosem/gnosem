#!/usr/bin/env node
// gnosem-install — one-command installer for Gnosem across every MCP-capable client on this machine.
// Zero deps: Node builtins only. Safe: reads each config, merges the gnosem entry, writes back
// preserving every other server + preferences. Prints exactly what it changed.
//
// Usage:
//   npx gnosem-install                     # interactive prompt for the API key
//   npx gnosem-install --key gn_xxx        # non-interactive
//   GNOSEM_API_KEY=gn_xxx npx gnosem-install
//   npx gnosem-install --dry-run           # show what would change, don't write
//
// The Bearer key stays local to this machine. Never sent anywhere except gnosem.dev/mcp.

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const { spawnSync } = require("child_process");

const HOME = os.homedir();
const HOSTNAME = "gnosem.dev";
const MCP_URL = "https://gnosem.dev/mcp";
const KEY_RE = /^gn_[a-f0-9]{32}$/i;

// ---------- Console output ----------
const isTTY = process.stdout.isTTY;
const style = (open, close) => (s) => isTTY ? `\x1b[${open}m${s}\x1b[${close}m` : String(s);
const bold = style(1, 22);
const dim = style(2, 22);
const green = style(32, 39);
const yellow = style(33, 39);
const red = style(31, 39);
const cyan = style(36, 39);

function log(...args) { console.log(...args); }
function info(msg) { log(cyan("→"), msg); }
function ok(msg) { log(green("✓"), msg); }
function warn(msg) { log(yellow("!"), msg); }
function fail(msg) { log(red("✗"), msg); }

// ---------- Args + key intake ----------
const argv = process.argv.slice(2);
function argVal(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}
const DRY_RUN = argv.includes("--dry-run");
const HELP = argv.includes("--help") || argv.includes("-h");

if (HELP) {
  log(`gnosem-install — install Gnosem into every MCP-capable client on this machine

Usage:
  npx gnosem-install [options]

Options:
  --key <gn_...>       Your Gnosem API key (or set GNOSEM_API_KEY env var)
  --dry-run            Print what would change; don't write anything
  --help, -h           Show this help

Where to get a key:
  https://gnosem.dev  (sign up — 200 memories free)
  https://gnosem.dev/dashboard  (existing account)

Clients supported:
  Claude Desktop (macOS / Windows / Linux)
  Claude Code (via 'claude mcp add')
  Cursor
  Windsurf
  Zed`);
  process.exit(0);
}

async function promptKey() {
  const flag = argVal("--key");
  if (flag) return flag.trim();
  if (process.env.GNOSEM_API_KEY) return process.env.GNOSEM_API_KEY.trim();
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: isTTY });
    rl.question(cyan("Paste your Gnosem API key (gn_...): "), (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

// ---------- File helpers ----------
function readJson(file) {
  const raw = fs.readFileSync(file, "utf8");
  return raw.trim() ? JSON.parse(raw) : {};
}
function writeJson(file, data) {
  const backup = file + ".bak-gnosem-" + Date.now();
  if (fs.existsSync(file)) fs.copyFileSync(file, backup);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  return backup;
}
function firstExisting(paths) { return paths.find(p => fs.existsSync(p)); }

// A client is "installed" if EITHER its MCP config file already exists, OR the app itself is
// present on disk (macOS /Applications, Windows Program Files, Linux ~/.local/share). We do NOT
// consider stray config parent dirs as evidence — many users have ~/.codeium/ from Codeium's
// completions plugin without ever installing Windsurf.
function appInstalled(macApp, linuxPathHints = [], winPathHints = []) {
  if (process.platform === "darwin") return fs.existsSync("/Applications/" + macApp);
  if (process.platform === "linux") return linuxPathHints.some(p => fs.existsSync(p));
  if (process.platform === "win32") return winPathHints.some(p => fs.existsSync(p));
  return false;
}

// ---------- Client detectors + installers ----------

const CLAUDE_DESKTOP_PATHS = {
  darwin: [path.join(HOME, "Library", "Application Support", "Claude", "claude_desktop_config.json")],
  win32: [path.join(process.env.APPDATA || "", "Claude", "claude_desktop_config.json")],
  linux: [path.join(HOME, ".config", "Claude", "claude_desktop_config.json")],
};
function claudeDesktopConfigPath() {
  const paths = CLAUDE_DESKTOP_PATHS[process.platform] || [];
  const existing = firstExisting(paths);
  if (existing) return existing;
  if (appInstalled("Claude.app", ["/opt/Claude"], [path.join(process.env.LOCALAPPDATA || "", "Programs", "Claude")])) return paths[0] || null;
  return null;
}

const CURSOR_PATHS = [
  path.join(HOME, ".cursor", "mcp.json"),
];
const WINDSURF_PATHS = [
  path.join(HOME, ".codeium", "windsurf", "mcp_config.json"),
];
const ZED_PATHS = [
  path.join(HOME, ".config", "zed", "settings.json"),
];

// Claude Desktop's config JSON accepts stdio servers only (command/args), so we bridge via mcp-remote.
function claudeDesktopEntry(key) {
  return {
    command: "npx",
    args: ["-y", "mcp-remote", MCP_URL, "--header", "Authorization: Bearer " + key],
  };
}

// Cursor + Windsurf accept HTTP MCP servers directly with url + headers in recent versions.
function httpEntry(key) {
  return {
    url: MCP_URL,
    headers: { Authorization: "Bearer " + key },
  };
}

// Zed uses a different schema: context_servers.gnosem.command
function zedEntry(key) {
  return {
    command: "npx",
    args: ["-y", "mcp-remote", MCP_URL, "--header", "Authorization: Bearer " + key],
  };
}

function installClaudeDesktop(key) {
  const cfgPath = claudeDesktopConfigPath();
  if (!cfgPath) return { name: "Claude Desktop", status: "not-found" };
  const cfg = fs.existsSync(cfgPath) ? readJson(cfgPath) : {};
  cfg.mcpServers = cfg.mcpServers || {};
  const existing = cfg.mcpServers.gnosem;
  cfg.mcpServers.gnosem = claudeDesktopEntry(key);
  if (DRY_RUN) return { name: "Claude Desktop", status: existing ? "would-update" : "would-install", path: cfgPath };
  const backup = writeJson(cfgPath, cfg);
  return { name: "Claude Desktop", status: existing ? "updated" : "installed", path: cfgPath, backup, restartHint: "Restart the Claude app (Cmd/Ctrl+Q, reopen)." };
}

function installClaudeCode(key) {
  const bin = spawnSync("which", ["claude"], { encoding: "utf8" });
  if (bin.status !== 0 || !bin.stdout.trim()) return { name: "Claude Code", status: "not-found" };
  if (DRY_RUN) return { name: "Claude Code", status: "would-install", path: bin.stdout.trim() };
  // Remove any existing gnosem entry first so re-installs are idempotent.
  spawnSync("claude", ["mcp", "remove", "gnosem", "--scope", "user"], { encoding: "utf8" });
  const r = spawnSync("claude", ["mcp", "add", "--transport", "http", "--scope", "user", "gnosem", MCP_URL, "--header", "Authorization: Bearer " + key], { encoding: "utf8" });
  if (r.status !== 0) return { name: "Claude Code", status: "failed", error: (r.stderr || r.stdout || "").trim() };
  return { name: "Claude Code", status: "installed", path: bin.stdout.trim(), restartHint: "Open a new Claude Code session (or /reload MCPs in-session)." };
}

function installCursor(key) {
  let cfgPath = firstExisting(CURSOR_PATHS);
  if (!cfgPath && appInstalled("Cursor.app")) cfgPath = CURSOR_PATHS[0];
  if (!cfgPath) return { name: "Cursor", status: "not-found" };
  const cfg = fs.existsSync(cfgPath) ? readJson(cfgPath) : {};
  cfg.mcpServers = cfg.mcpServers || {};
  const existing = cfg.mcpServers.gnosem;
  cfg.mcpServers.gnosem = httpEntry(key);
  if (DRY_RUN) return { name: "Cursor", status: existing ? "would-update" : "would-install", path: cfgPath };
  const backup = writeJson(cfgPath, cfg);
  return { name: "Cursor", status: existing ? "updated" : "installed", path: cfgPath, backup, restartHint: "Restart Cursor (Cmd/Ctrl+Shift+P → 'Reload Window')." };
}

function installWindsurf(key) {
  let cfgPath = firstExisting(WINDSURF_PATHS);
  if (!cfgPath && appInstalled("Windsurf.app")) cfgPath = WINDSURF_PATHS[0];
  if (!cfgPath) return { name: "Windsurf", status: "not-found" };
  const cfg = fs.existsSync(cfgPath) ? readJson(cfgPath) : {};
  cfg.mcpServers = cfg.mcpServers || {};
  const existing = cfg.mcpServers.gnosem;
  // Windsurf uses `serverUrl` (not `url`) for remote HTTP MCP.
  cfg.mcpServers.gnosem = { serverUrl: MCP_URL, headers: { Authorization: "Bearer " + key } };
  if (DRY_RUN) return { name: "Windsurf", status: existing ? "would-update" : "would-install", path: cfgPath };
  const backup = writeJson(cfgPath, cfg);
  return { name: "Windsurf", status: existing ? "updated" : "installed", path: cfgPath, backup, restartHint: "Restart Windsurf." };
}

function installZed(key) {
  const cfgPath = firstExisting(ZED_PATHS);
  if (!cfgPath) return { name: "Zed", status: "not-found" };
  const cfg = fs.existsSync(cfgPath) ? readJson(cfgPath) : {};
  cfg.context_servers = cfg.context_servers || {};
  const existing = cfg.context_servers.gnosem;
  cfg.context_servers.gnosem = zedEntry(key);
  if (DRY_RUN) return { name: "Zed", status: existing ? "would-update" : "would-install", path: cfgPath };
  const backup = writeJson(cfgPath, cfg);
  return { name: "Zed", status: existing ? "updated" : "installed", path: cfgPath, backup, restartHint: "Restart Zed." };
}

// ---------- Main ----------
(async () => {
  log(bold("gnosem-install"), dim("— cross-vendor AI memory installer"));
  log("");

  const key = await promptKey();
  if (!key) { fail("no API key provided; aborting"); process.exit(1); }
  if (!KEY_RE.test(key)) {
    fail("that doesn't look like a Gnosem API key (expected gn_ + 32 hex chars).");
    log(dim("  get a key at https://gnosem.dev"));
    process.exit(1);
  }

  if (DRY_RUN) info("dry-run — no files will be modified");

  const installers = [installClaudeDesktop, installClaudeCode, installCursor, installWindsurf, installZed];
  const results = installers.map(fn => { try { return fn(key); } catch (e) { return { name: fn.name, status: "error", error: String(e && e.message || e) }; } });

  log("");
  log(bold("Results"));
  for (const r of results) {
    if (r.status === "installed" || r.status === "updated") {
      ok(`${r.name}: ${r.status}${r.path ? dim(" (" + r.path + ")") : ""}`);
      if (r.restartHint) log(dim("   " + r.restartHint));
      if (r.backup) log(dim("   backup: " + r.backup));
    } else if (r.status === "would-install" || r.status === "would-update") {
      info(`${r.name}: ${r.status}${r.path ? dim(" (" + r.path + ")") : ""}`);
    } else if (r.status === "not-found") {
      log(dim(`- ${r.name}: not detected`));
    } else if (r.status === "failed" || r.status === "error") {
      fail(`${r.name}: ${r.status} — ${r.error || ""}`);
    }
  }

  const installedCount = results.filter(r => r.status === "installed" || r.status === "updated").length;
  const wouldCount = results.filter(r => r.status === "would-install" || r.status === "would-update").length;

  log("");
  if (DRY_RUN) {
    log(cyan(`Would install into ${wouldCount} client(s). Re-run without --dry-run to apply.`));
  } else if (installedCount > 0) {
    ok(bold(`Installed into ${installedCount} client(s).`));
    log("");
    log(dim("Verify by asking your assistant: \"list your gnosem tools\" — you should see five:"));
    log(dim("  memory_write, memory_search, memory_list, memory_forget, memory_supersede"));
    log("");
    log(dim("Dashboard: https://gnosem.dev/dashboard"));
  } else {
    warn("No MCP-capable clients detected on this machine.");
    log(dim("Supported: Claude Desktop, Claude Code, Cursor, Windsurf, Zed."));
    log(dim("If you use another client, add gnosem manually — see https://gnosem.dev"));
  }
})();
