import {
  GnosemAPIError,
  GnosemAuthError,
  GnosemError,
  GnosemRateLimitError,
} from "./errors.js";
import type {
  ExportOptions,
  ExportResult,
  ForgetResult,
  GnosemOptions,
  ListOptions,
  ListResult,
  MeResult,
  RotateKeyResult,
  SearchOptions,
  SearchResult,
  SupersedeOptions,
  SupersedeResult,
  WriteBulkResult,
  WriteInput,
  WriteOptions,
  WriteResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://gnosem.dev";
const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "@gnosem/client/0.1.0 (+https://gnosem.dev)";

/**
 * Client for the Gnosem hosted MCP memory API.
 *
 * @example
 * ```ts
 * const g = new Gnosem({ apiKey: "gn_..." });
 * const { id } = await g.write("I prefer Postgres over MongoDB", { tags: ["preference"] });
 * const { matches } = await g.search("database preference");
 * ```
 */
export class Gnosem {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeout: number;

  constructor(opts: GnosemOptions = {}) {
    // apiKey is read lazily — undefined here is fine. First request will throw
    // GnosemAuthError if it's still undefined at call time. This matches how
    // most SDKs behave (constructor is cheap, doesn't touch env until needed).
    this.apiKey =
      opts.apiKey ??
      (typeof process !== "undefined" ? process.env?.GNOSEM_API_KEY : undefined);
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeout = opts.timeout ?? DEFAULT_TIMEOUT_MS;
  }

  // -------- MCP tool wrappers (all go through POST /mcp with JSON-RPC 2.0) --------

  /**
   * Write a new memory. Server semantically de-dupes against existing memories
   * unless `force: true`. Content is capped at 8KB.
   */
  async write(content: string, opts: WriteOptions = {}): Promise<WriteResult> {
    return this.callTool<WriteResult>("memory_write", {
      content,
      ...toolArgs(opts),
    });
  }

  /**
   * Semantic search over your memories. `k` defaults to 10 on the server.
   * Set `raw: true` to get untouched content instead of the LLM-optimized form.
   */
  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult> {
    return this.callTool<SearchResult>("memory_search", {
      query,
      ...toolArgs(opts),
    });
  }

  /**
   * List memories in reverse chronological order. Paginate with `cursor`.
   * Returns `{memories, cursor}` — pass the cursor back in for the next page,
   * or stop when it comes back as `null`.
   */
  async list(opts: ListOptions = {}): Promise<ListResult> {
    return this.callTool<ListResult>("memory_list", toolArgs(opts));
  }

  /** Soft-delete a memory. Idempotent. */
  async forget(id: string): Promise<ForgetResult> {
    return this.callTool<ForgetResult>("memory_forget", { id });
  }

  /**
   * Replace a stale memory with a corrected one. The old row is marked
   * superseded (excluded from future reads); the new one becomes current.
   */
  async supersede(opts: SupersedeOptions): Promise<SupersedeResult> {
    return this.callTool<SupersedeResult>("memory_supersede", {
      old_id: opts.oldId,
      new_content: opts.newContent,
      ...(opts.tags !== undefined ? { tags: opts.tags } : {}),
      ...(opts.writtenBy !== undefined ? { written_by: opts.writtenBy } : {}),
      ...(opts.sessionId !== undefined ? { session_id: opts.sessionId } : {}),
    });
  }

  /**
   * Batch-write multiple memories in one call. Each entry follows the same
   * dedup rules as `write()`. Returns per-entry results in input order.
   */
  async writeBulk(memories: WriteInput[]): Promise<WriteBulkResult> {
    const payload = memories.map((m) => ({
      content: m.content,
      ...toolArgs(m),
    }));
    return this.callTool<WriteBulkResult>("memory_write_bulk", {
      memories: payload,
    });
  }

  // -------- non-MCP REST endpoints --------

  /** Account summary: email, plan, memory count/limit, subscription state. */
  async me(): Promise<MeResult> {
    return this.rest<MeResult>("GET", "/me");
  }

  /**
   * Full JSON dump of your active memories. Portable, no lock-in.
   * Pass `includeForgotten` / `includeSuperseded` to include audit rows.
   */
  async export(opts: ExportOptions = {}): Promise<ExportResult> {
    const qs = new URLSearchParams();
    if (opts.includeForgotten) qs.set("include_forgotten", "1");
    if (opts.includeSuperseded) qs.set("include_superseded", "1");
    const path = qs.toString() ? `/export?${qs.toString()}` : "/export";
    return this.rest<ExportResult>("GET", path);
  }

  /**
   * Rotate the caller's API key. All prior keys are revoked immediately —
   * update every client with the returned key before the next call.
   * Returns both `apiKey` (camelCase) and `api_key` (server-native).
   */
  async rotateKey(): Promise<RotateKeyResult> {
    const raw = await this.rest<{ api_key: string; note: string }>(
      "POST",
      "/keys/rotate",
    );
    return { apiKey: raw.api_key, api_key: raw.api_key, note: raw.note };
  }

  // -------- transport --------

  private requireKey(): string {
    if (!this.apiKey) {
      throw new GnosemAuthError(
        "Missing API key. Pass one to `new Gnosem({ apiKey })` or set GNOSEM_API_KEY. Sign up at https://gnosem.dev.",
      );
    }
    return this.apiKey;
  }

  private async callTool<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    });
    const res = await this.rawRequest("POST", "/mcp", body, {
      "Content-Type": "application/json",
    });
    const text = await res.text();
    if (!res.ok) throw buildErrorFromResponse(res, text);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new GnosemAPIError(
        `Invalid JSON response from ${name}`,
        res.status,
        text,
      );
    }

    // JSON-RPC error frame. Auth errors from the server come back as
    // `error.code === -32001`, everything else is a generic API error.
    const envelope = parsed as {
      error?: { code: number; message: string };
      result?: { structuredContent?: T };
    };
    if (envelope.error) {
      const code = envelope.error.code;
      const message = envelope.error.message ?? `JSON-RPC error ${code}`;
      if (code === -32001) {
        throw new GnosemAuthError(message, res.status, text);
      }
      throw new GnosemAPIError(message, res.status || 500, text);
    }
    const structured = envelope.result?.structuredContent;
    if (structured === undefined) {
      throw new GnosemAPIError(
        `Missing structuredContent in response for ${name}`,
        res.status,
        text,
      );
    }
    return structured;
  }

  private async rest<T>(method: string, path: string): Promise<T> {
    const res = await this.rawRequest(method, path, undefined);
    const text = await res.text();
    if (!res.ok) throw buildErrorFromResponse(res, text);
    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new GnosemAPIError(
        `Invalid JSON response from ${path}`,
        res.status,
        text,
      );
    }
  }

  private async rawRequest(
    method: string,
    path: string,
    body: BodyInit | undefined,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const key = this.requireKey();
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...extraHeaders,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new GnosemError(`Request timed out after ${this.timeout}ms`);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new GnosemError(`Network error: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Translate camelCase option keys to snake_case JSON-RPC arg names.
 * Only whitelisted keys pass through — random extra keys are ignored,
 * which prevents accidentally leaking client-side state into requests.
 */
function toolArgs(
  opts: WriteOptions | SearchOptions | ListOptions | WriteInput,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // Whitelist keys explicitly — random extra keys are ignored, which prevents
  // accidentally leaking client-side state into a server-bound payload.
  const record = opts as Record<string, unknown>;
  const map: Record<string, string> = {
    tags: "tags",
    writtenBy: "written_by",
    sessionId: "session_id",
    noOptimize: "no_optimize",
    force: "force",
    k: "k",
    raw: "raw",
    since: "since",
    until: "until",
    mode: "mode",
    limit: "limit",
    cursor: "cursor",
  };
  for (const [camel, snake] of Object.entries(map)) {
    const v = record[camel];
    if (v !== undefined) out[snake] = v;
  }
  return out;
}

/**
 * Build the right error subclass from a non-2xx Response. Attempts to parse
 * the body as JSON to extract a nicer message; falls back to raw text.
 */
function buildErrorFromResponse(res: Response, text: string): GnosemError {
  const status = res.status;
  let message = text || res.statusText || `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string };
    if (parsed.error) message = parsed.error;
    else if (parsed.message) message = parsed.message;
  } catch {
    // not JSON, leave as-is
  }
  if (status === 429) {
    const retryHeader = res.headers.get("Retry-After");
    const retryAfter = retryHeader ? Number.parseInt(retryHeader, 10) || 0 : 0;
    return new GnosemRateLimitError(message, retryAfter, status, text);
  }
  if (status === 401 || status === 403) {
    return new GnosemAuthError(message, status, text);
  }
  return new GnosemAPIError(message, status, text);
}
