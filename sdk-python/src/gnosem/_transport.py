"""Thin urllib wrapper for the Gnosem HTTP transport.

Private module — not part of the public API. Uses only Python stdlib
(urllib.request + json). Handles JSON serialization, Bearer auth, response
parsing, and typed exception mapping.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class GnosemError(Exception):
    """Base class for all Gnosem SDK errors."""


class GnosemAuthError(GnosemError):
    """Raised when auth fails (401) or no API key is available."""


class GnosemRateLimitError(GnosemError):
    """Raised on HTTP 429. ``retry_after`` is seconds from the Retry-After header (0 if absent)."""

    def __init__(self, message: str, retry_after: int = 0) -> None:
        super().__init__(message)
        self.retry_after: int = retry_after


class GnosemAPIError(GnosemError):
    """Raised on non-200 responses other than 401/429.

    ``status_code`` is the HTTP status; ``error_body`` is the parsed JSON body
    (dict) if the server returned JSON, else the raw response text (str).
    """

    def __init__(self, message: str, status_code: int, error_body: Any) -> None:
        super().__init__(message)
        self.status_code: int = status_code
        self.error_body: Any = error_body


def _parse_body(raw: bytes) -> Any:
    """Try to parse ``raw`` as JSON; fall back to decoded text."""
    try:
        return json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        try:
            return raw.decode("utf-8", errors="replace")
        except Exception:  # pragma: no cover — decode with replace shouldn't fail
            return repr(raw)


def _extract_error_message(body: Any, fallback: str) -> str:
    """Pull a human-readable error message from a parsed body."""
    if isinstance(body, dict):
        # Common shapes: {"error": "..."} or {"error": {"message": "..."}}
        err = body.get("error")
        if isinstance(err, str):
            return err
        if isinstance(err, dict):
            msg = err.get("message")
            if isinstance(msg, str):
                return msg
        msg = body.get("message")
        if isinstance(msg, str):
            return msg
    if isinstance(body, str) and body.strip():
        return body.strip()[:500]
    return fallback


def request_json(
    url: str,
    *,
    method: str,
    api_key: str,
    payload: Optional[Dict[str, Any]] = None,
    timeout: float = 30.0,
) -> Any:
    """POST/GET ``url`` with a Bearer token and return the parsed JSON body.

    Raises a Gnosem*Error subclass on non-2xx responses. On 2xx, returns the
    parsed JSON body (typically a dict).
    """
    headers: Dict[str, str] = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "User-Agent": "gnosem-python/0.1.0",
    }
    data: Optional[bytes] = None
    if payload is not None:
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = Request(url, data=data, headers=headers, method=method)

    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            body = _parse_body(raw)
            return body
    except HTTPError as e:
        raw = b""
        try:
            raw = e.read() or b""
        except Exception:  # pragma: no cover
            pass
        body = _parse_body(raw) if raw else None
        message = _extract_error_message(body, f"HTTP {e.code}")
        if e.code == 401:
            raise GnosemAuthError(f"Authentication failed: {message}") from None
        if e.code == 429:
            retry_after_raw = e.headers.get("Retry-After") if e.headers else None
            retry_after = 0
            if retry_after_raw:
                try:
                    retry_after = int(float(retry_after_raw))
                except (TypeError, ValueError):
                    retry_after = 0
            raise GnosemRateLimitError(
                f"Rate limited: {message}", retry_after=retry_after
            ) from None
        raise GnosemAPIError(
            f"HTTP {e.code}: {message}", status_code=e.code, error_body=body
        ) from None
    except URLError as e:
        raise GnosemError(f"Network error contacting Gnosem: {e.reason}") from None
