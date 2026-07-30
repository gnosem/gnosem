# gnosem

Official Python client for [Gnosem](https://gnosem.dev) — hosted, cross-vendor MCP memory for AI agents.

Write once from any model (Claude, GPT, Gemini, local, ...); read from any other. Portable, dedup-aware, hybrid keyword+semantic search, and a permanent long-term memory layer that lives outside any single vendor.

- **Zero runtime dependencies.** Uses only the Python standard library (`urllib.request`, `json`, `hashlib`).
- **Fully typed.** PEP 484 type hints on every public API.
- **Small.** One class, one dataclass family, four exceptions.

## Install

```bash
pip install gnosem
```

Python 3.8+ is supported.

## Quickstart

```python
from gnosem import Gnosem

# Provide the key explicitly or via the GNOSEM_API_KEY env var
g = Gnosem(api_key="gn_...")
# or: g = Gnosem()

result = g.write("I prefer Postgres over MongoDB", tags=["preference", "stack"])
print(result.id)              # e.g. "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
print(result.exact_duplicate) # False on a fresh write

for m in g.search("database preference", k=5):
    print(m.content, m.score, m.tags)
```

Get your API key at [gnosem.dev](https://gnosem.dev). Free tier: 200 active memories.

## API reference

### Client

```python
Gnosem(api_key: str | None = None,
       base_url: str = "https://gnosem.dev",
       timeout: float = 30)
```

- `api_key` — a `gn_...` key. If `None`, read from the `GNOSEM_API_KEY` env var. Missing at call time raises `GnosemAuthError`.
- `base_url` — override for self-hosted deployments or staging.
- `timeout` — per-request timeout in seconds.

The constructor performs no I/O; the key is resolved on the first request.

### Methods

#### `g.write(content, *, tags=None, written_by=None, session_id=None, no_optimize=False, force=False) -> WriteResult`

Save a memory. Duplicate writes are automatically deduped — byte-identical writes are short-circuited by content hash, and near-duplicates by semantic similarity (cosine ≥ 0.85). Pass `force=True` to bypass. Long content (>400 chars) is optimized into a token-lean form for future reads; pass `no_optimize=True` to skip.

Returns a `WriteResult` with fields:

- `id: str` — the memory id (new or existing on dedup)
- `created_at: int | None` — ms epoch
- `optimized: bool` — server produced an LLM-optimized form
- `exact_duplicate: bool` — hash matched an existing memory
- `deduped: bool` — semantically matched an existing memory
- `matched_score: float | None` — cosine similarity (only when `deduped`)
- `matched_content_preview: str | None` — first 120 chars of the match (only when `deduped`)
- `compression_ratio: float | None` — optimized_bytes / raw_bytes (only when `optimized`)
- `raw: dict` — the full server response, for forward compat

#### `g.search(query, *, k=None, mode=None, raw=False, tags=None, written_by=None, session_id=None, since=None, until=None) -> SearchResults`

Search memories. Default mode is `"hybrid"` (BM25 + vector via Reciprocal Rank Fusion). Alternatives: `"semantic"`, `"keyword"`.

Filters (`tags`, `written_by`, `session_id`, `since`, `until`) narrow results with AND semantics. `since`/`until` are ms-epoch integers.

Returns a `SearchResults` object that is iterable and indexable (proxies `.matches`).

```python
results = g.search("Postgres", k=10, mode="hybrid", tags=["preference"])
for m in results:
    print(m.id, m.score, m.content)
```

#### `g.list(*, limit=None, cursor=None, raw=False, tags=None, written_by=None, session_id=None, since=None, until=None) -> ListPage`

List memories in reverse-chronological order. Paginate by passing the previous page's `cursor`:

```python
page = g.list(limit=50)
while True:
    for m in page.memories:
        print(m.id, m.created_at)
    if page.cursor is None:
        break
    page = g.list(limit=50, cursor=page.cursor)
```

#### `g.forget(memory_id: str) -> dict`

Soft-delete a memory. The row is retained for audit but excluded from search/list and removed from the vector index. Returns `{"ok": bool, "id": str}`.

#### `g.supersede(old_id: str, new_content: str, *, tags=None, written_by=None, session_id=None) -> SupersedeResult`

Mark an old memory as superseded and write a corrected one in its place. Returns a `SupersedeResult` with `old_id`, `new_id`, and `created_at`.

#### `g.write_bulk(memories: Iterable[Mapping]) -> list[dict]`

Write up to 50 memories in one call. Each entry is a mapping accepting the same keys as `write()` (`content`, `tags`, `written_by`, `session_id`, `no_optimize`, `force`). Returns a list of per-entry result dicts in the same order — each is `{id, created_at, optimized?, deduped?, ...}` on success or `{"error": ...}` on failure.

```python
results = g.write_bulk([
    {"content": "fact 1", "tags": ["a"]},
    {"content": "fact 2", "tags": ["b"]},
])
for r in results:
    if "error" in r:
        print("failed:", r["error"])
    else:
        print("wrote:", r["id"])
```

#### `g.me() -> dict`

Return the caller's account summary: `user_id`, `email`, `plan`, `subscription_status`, `subscription_period_end`, `memory_count`, `memory_limit`.

#### `g.export(*, include_forgotten=False, include_superseded=False) -> dict`

Full JSON dump of the caller's memories in `gnosem/export/v1` format. Portable — no lock-in.

#### `g.rotate_key() -> str`

Revoke the current API key and return a new one. Prior keys are invalidated immediately across all clients — update every consumer with the new key.

If you constructed the client with an explicit `api_key=`, the returned key is stored on the client so subsequent calls keep working. If you used the env var, update `GNOSEM_API_KEY` yourself.

## Exceptions

All exceptions inherit from `GnosemError`.

- `GnosemAuthError` — no API key available or the server returned 401
- `GnosemRateLimitError` — HTTP 429. `.retry_after: int` carries the `Retry-After` header value in seconds (0 if the header was absent).
- `GnosemAPIError` — any other non-2xx response. `.status_code: int` and `.error_body: Any` carry the details. `error_body` is the parsed JSON when the server returned JSON, else the raw response text.

```python
from gnosem import Gnosem, GnosemRateLimitError, GnosemAPIError

g = Gnosem()
try:
    g.write("...")
except GnosemRateLimitError as e:
    time.sleep(e.retry_after)
except GnosemAPIError as e:
    print("server rejected:", e.status_code, e.error_body)
```

## Dataclasses

```python
@dataclass
class Memory:
    id: str
    content: str
    tags: list[str]
    written_by: str | None
    session_id: str | None
    created_at: int | None
    content_raw: str | None   # populated only when server optimized the content
    optimized: bool | None
    score: float | None       # populated only in search results
```

## Testing

```bash
pip install -e ".[test]"
GNOSEM_API_KEY=gn_... pytest
```

Tests that hit the live server skip cleanly when `GNOSEM_API_KEY` is not set. Pure-Python tests (dataclass parsing, missing-key detection) always run.

## Publishing

The maintainer publishes new releases with:

```bash
pip install --upgrade build twine
python -m build
python -m twine upload dist/*
```

## License

MIT (c) CUETV LLC. See [LICENSE](./LICENSE).
