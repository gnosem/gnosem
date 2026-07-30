"""Gnosem — Python client for the hosted cross-vendor MCP memory server.

Quickstart:

    from gnosem import Gnosem

    g = Gnosem(api_key="gn_...")            # or Gnosem() to read GNOSEM_API_KEY
    g.write("I prefer Postgres over MongoDB")
    for m in g.search("database preference"):
        print(m.content)

See https://gnosem.dev/docs for the full protocol reference.
"""

from .client import (
    Gnosem,
    GnosemAPIError,
    GnosemAuthError,
    GnosemError,
    GnosemRateLimitError,
    ListPage,
    Memory,
    SearchResults,
    SupersedeResult,
    WriteResult,
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

__version__ = "0.1.0"
