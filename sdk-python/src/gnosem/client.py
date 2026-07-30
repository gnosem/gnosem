"""Gnosem client — Python SDK for the hosted MCP memory server at gnosem.dev.

Public API:
    - :class:`Gnosem`           — the client class
    - :class:`Memory`           — a single memory record (dataclass)
    - :class:`SearchResults`    — return type of :meth:`Gnosem.search`
    - :class:`ListPage`         — return type of :meth:`Gnosem.list`
    - :class:`WriteResult`      — return type of :meth:`Gnosem.write`
    - :class:`SupersedeResult`  — return type of :meth:`Gnosem.supersede`
    - :class:`GnosemError`, :class:`GnosemAuthError`, :class:`GnosemRateLimitError`,
      :class:`GnosemAPIError` — exception hierarchy
"""

from __future__ import annotations

import itertools
import os
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence

from ._transport import (
    GnosemAPIError,
    GnosemAuthError,
    GnosemError,
    GnosemRateLimitError,
    request_json,
)

__all__ = [
    "Gnosem",
    "Memory",
    "SearchResults",
    "ListPage",
    "WriteResult",
    "SupersedeResult",
    "GnosemError",
    "GnosemAuthError",
    "GnosemRateLimitError",
    "GnosemAPIError",
]

DEFAULT_BASE_URL = "https://gnosem.dev"
DEFAULT_TIMEOUT = 30.0


@dataclass
class Memory:
    """A single memory record returned by the server.

    ``content`` is the LLM-optimized form when the server produced one,
    else the original prose. ``content_raw`` is populated only when the
    server returned both (i.e. it optimized the content); ``score`` is
    populated only by :meth:`Gnosem.search` results.
    """

    id: str
    content: str
    tags: List[str] = field(default_factory=list)
    written_by: Optional[str] = None
    session_id: Optional[str] = None
    created_at: Optional[int] = None
    content_raw: Optional[str] = None
    optimized: Optional[bool] = None
    score: Optional[float] = None

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> "Memory":
        tags = d.get("tags") or []
        if not isinstance(tags, list):
            tags = []
        return cls(
            id=str(d.get("id", "")),
            content=str(d.get("content", "")),
            tags=[str(t) for t in tags],
            written_by=d.get("written_by"),
            session_id=d.get("session_id"),
            created_at=d.get("created_at"),
            content_raw=d.get("content_raw"),
            optimized=d.get("optimized"),
            score=d.get("score"),
        )


@dataclass
class WriteResult:
    """Result of a single :meth:`Gnosem.write` call.

    ``id`` is always populated. ``exact_duplicate`` and ``deduped`` are
    mutually exclusive flags describing why a write was short-circuited;
    both are ``False`` on a fresh insert. ``optimized`` is True when the
    server AI-compressed the content on write.
    """

    id: str
    created_at: Optional[int] = None
    optimized: bool = False
    exact_duplicate: bool = False
    deduped: bool = False
    matched_score: Optional[float] = None
    matched_content_preview: Optional[str] = None
    compression_ratio: Optional[float] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> "WriteResult":
        return cls(
            id=str(d.get("id", "")),
            created_at=d.get("created_at"),
            optimized=bool(d.get("optimized", False)),
            exact_duplicate=bool(d.get("exact_duplicate", False)),
            deduped=bool(d.get("deduped", False)),
            matched_score=d.get("matched_score"),
            matched_content_preview=d.get("matched_content_preview"),
            compression_ratio=d.get("compression_ratio"),
            raw=dict(d),
        )


@dataclass
class SearchResults:
    """Return type of :meth:`Gnosem.search`. Iterable + indexable proxy for ``matches``."""

    matches: List[Memory] = field(default_factory=list)
    mode: Optional[str] = None

    def __iter__(self):
        return iter(self.matches)

    def __len__(self) -> int:
        return len(self.matches)

    def __getitem__(self, i):
        return self.matches[i]


@dataclass
class ListPage:
    """One page of :meth:`Gnosem.list` output. ``cursor`` is None when the page is the last."""

    memories: List[Memory] = field(default_factory=list)
    cursor: Optional[int] = None


@dataclass
class SupersedeResult:
    """Return type of :meth:`Gnosem.supersede`."""

    old_id: str
    new_id: str
    created_at: Optional[int] = None


class Gnosem:
    """Client for the Gnosem hosted MCP memory server.

    Example
    -------

    .. code-block:: python

        from gnosem import Gnosem

        g = Gnosem(api_key="gn_...")               # explicit key
        g = Gnosem()                               # or from GNOSEM_API_KEY env var

        result = g.write("I prefer Postgres over MongoDB", tags=["preference"])
        matches = g.search("database preference", k=5)
        for m in matches:
            print(m.content, m.score)

    Parameters
    ----------
    api_key
        Your Gnosem API key (``gn_...``). If ``None``, read from
        ``GNOSEM_API_KEY`` env var. If neither is available, calls raise
        :class:`GnosemAuthError` at request time.
    base_url
        Root URL of the Gnosem deployment. Defaults to ``https://gnosem.dev``.
    timeout
        Per-request timeout in seconds. Defaults to 30.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        # Lazy validation — no I/O in the constructor. If api_key is falsy,
        # we resolve at call time (which lets tests set env vars mid-run).
        self._explicit_key: Optional[str] = api_key
        self.base_url: str = base_url.rstrip("/")
        self.timeout: float = timeout
        self._id_counter = itertools.count(1)

    # ------------------------------------------------------------------ auth

    def _api_key(self) -> str:
        key = self._explicit_key or os.environ.get("GNOSEM_API_KEY")
        if not key:
            raise GnosemAuthError(
                "No API key provided. Pass api_key=... or set the "
                "GNOSEM_API_KEY environment variable."
            )
        return key

    # -------------------------------------------------------------- transport

    def _mcp_call(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Invoke an MCP ``tools/call`` and return the tool's structured result."""
        payload = {
            "jsonrpc": "2.0",
            "id": next(self._id_counter),
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        }
        body = request_json(
            self.base_url + "/mcp",
            method="POST",
            api_key=self._api_key(),
            payload=payload,
            timeout=self.timeout,
        )
        if not isinstance(body, dict):
            raise GnosemAPIError(
                "Unexpected MCP response (non-JSON-object body)",
                status_code=200,
                error_body=body,
            )
        if "error" in body and body["error"] is not None:
            err = body["error"]
            msg = err.get("message") if isinstance(err, dict) else str(err)
            code = err.get("code") if isinstance(err, dict) else None
            # Auth failures from tools/call surface as JSON-RPC error -32001
            if code == -32001:
                raise GnosemAuthError(f"Authentication required: {msg}")
            raise GnosemAPIError(
                f"MCP error: {msg}", status_code=200, error_body=err
            )
        result = body.get("result")
        if not isinstance(result, dict):
            raise GnosemAPIError(
                "Unexpected MCP response (missing result object)",
                status_code=200,
                error_body=body,
            )
        structured = result.get("structuredContent")
        if isinstance(structured, dict):
            return structured
        # Fallback: some MCP servers might only return content-array shape.
        content = result.get("content")
        if isinstance(content, list) and content:
            first = content[0]
            if isinstance(first, dict) and first.get("type") == "text":
                text = first.get("text")
                if isinstance(text, str):
                    import json as _json
                    try:
                        parsed = _json.loads(text)
                        if isinstance(parsed, dict):
                            return parsed
                    except ValueError:
                        pass
        raise GnosemAPIError(
            "Unexpected MCP response (no structuredContent)",
            status_code=200,
            error_body=result,
        )

    def _http(self, path: str, *, method: str = "GET",
              payload: Optional[Dict[str, Any]] = None) -> Any:
        """Direct HTTP call (non-MCP endpoints like /me, /export, /keys/rotate)."""
        return request_json(
            self.base_url + path,
            method=method,
            api_key=self._api_key(),
            payload=payload,
            timeout=self.timeout,
        )

    # ------------------------------------------------------------------ MCP tools

    def write(
        self,
        content: str,
        *,
        tags: Optional[Sequence[str]] = None,
        written_by: Optional[str] = None,
        session_id: Optional[str] = None,
        no_optimize: bool = False,
        force: bool = False,
    ) -> WriteResult:
        """Save a memory. Returns a :class:`WriteResult` with the new (or deduped) id."""
        args: Dict[str, Any] = {"content": content}
        if tags is not None:
            args["tags"] = list(tags)
        if written_by is not None:
            args["written_by"] = written_by
        if session_id is not None:
            args["session_id"] = session_id
        if no_optimize:
            args["no_optimize"] = True
        if force:
            args["force"] = True
        return WriteResult.from_dict(self._mcp_call("memory_write", args))

    def search(
        self,
        query: str,
        *,
        k: Optional[int] = None,
        mode: Optional[str] = None,
        raw: bool = False,
        tags: Optional[Sequence[str]] = None,
        written_by: Optional[str] = None,
        session_id: Optional[str] = None,
        since: Optional[int] = None,
        until: Optional[int] = None,
    ) -> SearchResults:
        """Search memories. Returns :class:`SearchResults` (iterable of :class:`Memory`)."""
        args: Dict[str, Any] = {"query": query}
        if k is not None:
            args["k"] = int(k)
        if mode is not None:
            args["mode"] = mode
        if raw:
            args["raw"] = True
        if tags is not None:
            args["tags"] = list(tags)
        if written_by is not None:
            args["written_by"] = written_by
        if session_id is not None:
            args["session_id"] = session_id
        if since is not None:
            args["since"] = int(since)
        if until is not None:
            args["until"] = int(until)
        result = self._mcp_call("memory_search", args)
        raw_matches = result.get("matches") or []
        return SearchResults(
            matches=[Memory.from_dict(m) for m in raw_matches if isinstance(m, Mapping)],
            mode=result.get("mode"),
        )

    def list(
        self,
        *,
        limit: Optional[int] = None,
        cursor: Optional[int] = None,
        raw: bool = False,
        tags: Optional[Sequence[str]] = None,
        written_by: Optional[str] = None,
        session_id: Optional[str] = None,
        since: Optional[int] = None,
        until: Optional[int] = None,
    ) -> ListPage:
        """List memories in reverse-chronological order. Paginate via ``cursor``."""
        args: Dict[str, Any] = {}
        if limit is not None:
            args["limit"] = int(limit)
        if cursor is not None:
            args["cursor"] = int(cursor)
        if raw:
            args["raw"] = True
        if tags is not None:
            args["tags"] = list(tags)
        if written_by is not None:
            args["written_by"] = written_by
        if session_id is not None:
            args["session_id"] = session_id
        if since is not None:
            args["since"] = int(since)
        if until is not None:
            args["until"] = int(until)
        result = self._mcp_call("memory_list", args)
        raw_mems = result.get("memories") or []
        return ListPage(
            memories=[Memory.from_dict(m) for m in raw_mems if isinstance(m, Mapping)],
            cursor=result.get("cursor"),
        )

    def forget(self, memory_id: str) -> Dict[str, Any]:
        """Soft-delete a memory. Returns the raw ``{ok, id}`` dict."""
        return self._mcp_call("memory_forget", {"id": memory_id})

    def supersede(
        self,
        old_id: str,
        new_content: str,
        *,
        tags: Optional[Sequence[str]] = None,
        written_by: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> SupersedeResult:
        """Replace ``old_id`` with a fresh memory. Returns a :class:`SupersedeResult`."""
        args: Dict[str, Any] = {"old_id": old_id, "new_content": new_content}
        if tags is not None:
            args["tags"] = list(tags)
        if written_by is not None:
            args["written_by"] = written_by
        if session_id is not None:
            args["session_id"] = session_id
        result = self._mcp_call("memory_supersede", args)
        return SupersedeResult(
            old_id=str(result.get("old_id", old_id)),
            new_id=str(result.get("new_id", "")),
            created_at=result.get("created_at"),
        )

    def write_bulk(
        self, memories: Iterable[Mapping[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Write up to 50 memories in a single call. Returns the raw per-entry results list."""
        entries: List[Dict[str, Any]] = []
        for m in memories:
            if not isinstance(m, Mapping):
                raise TypeError("each entry in memories must be a Mapping")
            entries.append(dict(m))
        result = self._mcp_call("memory_write_bulk", {"memories": entries})
        results = result.get("results") or []
        return [dict(r) if isinstance(r, Mapping) else {"raw": r} for r in results]

    # ------------------------------------------------------------- non-MCP

    def me(self) -> Dict[str, Any]:
        """Return the caller's account summary (``user_id``, ``email``, ``plan``, ...)."""
        return self._http("/me")

    def export(self, *, include_forgotten: bool = False,
               include_superseded: bool = False) -> Dict[str, Any]:
        """Return a full JSON dump of the caller's memories (Gnosem export v1 format)."""
        params = []
        if include_forgotten:
            params.append("include_forgotten=1")
        if include_superseded:
            params.append("include_superseded=1")
        path = "/export" + (("?" + "&".join(params)) if params else "")
        return self._http(path)

    def rotate_key(self) -> str:
        """Revoke the current API key and return the new one. Update your clients immediately."""
        body = self._http("/keys/rotate", method="POST")
        if not isinstance(body, dict) or "api_key" not in body:
            raise GnosemAPIError(
                "Unexpected /keys/rotate response",
                status_code=200,
                error_body=body,
            )
        new_key = body["api_key"]
        # Update our own reference so subsequent calls on this client keep working
        # (only when the caller was using an explicit key; env-var users should update env themselves).
        if self._explicit_key is not None:
            self._explicit_key = new_key
        return str(new_key)
