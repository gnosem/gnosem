// Types mirror the server's JSON shape verbatim (snake_case) so what you get
// from the SDK matches what you'd get from `curl https://gnosem.dev/mcp`.
// Argument objects in TS-land use camelCase and are translated internally.

/** A stored memory as returned by search / list / export. */
export interface Memory {
  id: string;
  content: string;
  content_optimized?: string | null;
  tags: string[];
  written_by: string | null;
  session_id: string | null;
  created_at: number;
  /** Similarity score, present on search results only. */
  score?: number;
  /** Present on export when the row was superseded. */
  superseded_by?: string;
  /** Present on export when the row was forgotten. */
  forgotten_at?: number;
}

/** Input to memory_write / memory_write_bulk. */
export interface WriteInput {
  content: string;
  tags?: string[];
  writtenBy?: string;
  sessionId?: string;
  noOptimize?: boolean;
  force?: boolean;
}

/** Result of a single write. Dedup / optimization fields are optional. */
export interface WriteResult {
  id: string;
  created_at: number;
  /** True if the server generated an LLM-optimized form of the content. */
  optimized?: boolean;
  /** True if the write was deduped against an existing memory. */
  deduped?: boolean;
  /** True if the incoming content matched an existing row byte-for-byte. */
  exact_duplicate?: boolean;
  /** Cosine similarity score of the matched row (if deduped). */
  matched_score?: number;
  /** ID of the existing memory that this write was deduped to (if any). */
  matched_id?: string;
  /** Any other server-provided fields — future-proof passthrough. */
  [key: string]: unknown;
}

/** Response from memory_write_bulk. */
export interface WriteBulkResult {
  results: WriteResult[];
}

/** Response from memory_search. */
export interface SearchResult {
  matches: Memory[];
}

/** Response from memory_list. */
export interface ListResult {
  memories: Memory[];
  cursor: number | null;
}

/** Response from memory_forget. */
export interface ForgetResult {
  ok: boolean;
  id: string;
}

/** Response from memory_supersede. */
export interface SupersedeResult {
  old_id: string;
  new_id: string;
  created_at: number;
}

/** Response from GET /me. */
export interface MeResult {
  user_id: string;
  email: string;
  plan: string;
  subscription_status: string | null;
  subscription_period_end: number | null;
  memory_count: number;
  memory_limit: number | null;
}

/** Response from GET /export. */
export interface ExportResult {
  format: string;
  exported_at: number;
  user_id: string;
  plan: string;
  counts: {
    memories: number;
    includes_forgotten: boolean;
    includes_superseded: boolean;
  };
  memories: Memory[];
}

/** Response from POST /keys/rotate. Server returns `api_key`, SDK also exposes it as `apiKey` for ergonomics. */
export interface RotateKeyResult {
  apiKey: string;
  api_key: string;
  note: string;
}

/** Search mode: "semantic" (embeddings), "keyword" (BM25-ish), or "hybrid" (both). */
export type SearchMode = "semantic" | "keyword" | "hybrid";

/** Options for search(). */
export interface SearchOptions {
  k?: number;
  raw?: boolean;
  tags?: string[];
  writtenBy?: string;
  sessionId?: string;
  since?: number;
  until?: number;
  mode?: SearchMode;
}

/** Options for list(). */
export interface ListOptions {
  limit?: number;
  cursor?: number;
  raw?: boolean;
  tags?: string[];
  writtenBy?: string;
  sessionId?: string;
  since?: number;
  until?: number;
}

/** Options for write(). */
export interface WriteOptions {
  tags?: string[];
  writtenBy?: string;
  sessionId?: string;
  noOptimize?: boolean;
  force?: boolean;
}

/** Options for supersede(). */
export interface SupersedeOptions {
  oldId: string;
  newContent: string;
  tags?: string[];
  writtenBy?: string;
  sessionId?: string;
}

/** Options for export(). */
export interface ExportOptions {
  includeForgotten?: boolean;
  includeSuperseded?: boolean;
}

/** Constructor options for the Gnosem client. */
export interface GnosemOptions {
  /** Bearer API key ("gn_..."). Falls back to process.env.GNOSEM_API_KEY. */
  apiKey?: string;
  /** Override the base URL. Defaults to "https://gnosem.dev". */
  baseUrl?: string;
  /** Custom fetch implementation. Useful for tests. */
  fetch?: typeof fetch;
  /** Request timeout in milliseconds. Defaults to 30_000. */
  timeout?: number;
}
