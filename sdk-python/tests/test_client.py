"""Live integration tests for the Gnosem SDK.

These tests hit the real gnosem.dev API and require ``GNOSEM_API_KEY`` in the
environment. When the key isn't set, all live tests skip cleanly. A small
handful of pure-Python tests (dataclass parsing, auth-missing check) run
unconditionally.
"""

from __future__ import annotations

import os
import time
import uuid

import pytest

from gnosem import (
    Gnosem,
    GnosemAuthError,
    GnosemError,
    Memory,
    WriteResult,
)

LIVE_KEY = os.environ.get("GNOSEM_API_KEY")
live_only = pytest.mark.skipif(
    not LIVE_KEY,
    reason="GNOSEM_API_KEY not set; skipping live gnosem.dev integration tests",
)


# ---------------------------------------------------------------- unit tests


def test_memory_from_dict_roundtrip() -> None:
    m = Memory.from_dict({
        "id": "abc-123",
        "content": "hello world",
        "tags": ["a", "b"],
        "written_by": "test",
        "session_id": "s1",
        "created_at": 1700000000000,
        "score": 0.92,
        "content_raw": "hello world (raw)",
        "optimized": True,
    })
    assert m.id == "abc-123"
    assert m.content == "hello world"
    assert m.tags == ["a", "b"]
    assert m.written_by == "test"
    assert m.session_id == "s1"
    assert m.created_at == 1700000000000
    assert m.score == 0.92
    assert m.content_raw == "hello world (raw)"
    assert m.optimized is True


def test_memory_from_dict_defaults() -> None:
    m = Memory.from_dict({"id": "x", "content": "y"})
    assert m.tags == []
    assert m.written_by is None
    assert m.session_id is None
    assert m.score is None


def test_write_result_from_dict_exact_duplicate() -> None:
    r = WriteResult.from_dict({
        "id": "abc",
        "created_at": 123,
        "exact_duplicate": True,
    })
    assert r.id == "abc"
    assert r.exact_duplicate is True
    assert r.deduped is False
    assert r.optimized is False


def test_constructor_does_no_io() -> None:
    # No API key, no network — must not raise.
    g = Gnosem(api_key="gn_dummy", base_url="https://example.invalid", timeout=1)
    assert g.base_url == "https://example.invalid"


def test_missing_key_raises_gnosem_auth_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GNOSEM_API_KEY", raising=False)
    g = Gnosem()  # constructor is fine
    with pytest.raises(GnosemAuthError):
        g.me()  # first call resolves the key and fails


# ---------------------------------------------------------------- live tests


@pytest.fixture
def client() -> Gnosem:
    assert LIVE_KEY is not None
    return Gnosem(api_key=LIVE_KEY)


@live_only
def test_me_endpoint(client: Gnosem) -> None:
    me = client.me()
    assert isinstance(me, dict)
    assert "user_id" in me
    assert "email" in me
    assert "plan" in me
    assert isinstance(me.get("memory_count"), int)


@live_only
def test_write_and_search_roundtrip(client: Gnosem) -> None:
    # Use a unique nonce so this test is idempotent and doesn't dedup with prior runs.
    nonce = uuid.uuid4().hex[:12]
    content = f"gnosem-sdk-test canary phrase nonce={nonce}"
    session_id = f"sdk-test-{nonce}"

    written = client.write(
        content,
        tags=["sdk-test", "canary"],
        written_by="gnosem-python-sdk-test",
        session_id=session_id,
    )
    assert isinstance(written.id, str) and written.id
    # Fresh write — should not be flagged as duplicate
    assert written.exact_duplicate is False
    assert written.deduped is False

    memory_id = written.id
    try:
        # Give the vector index a beat to reflect the write.
        # Keyword mode is FTS-only and returns immediately after commit.
        results = client.search(
            f"canary phrase nonce={nonce}",
            k=5,
            mode="keyword",
            session_id=session_id,
        )
        assert isinstance(results.matches, list)
        ids = {m.id for m in results.matches}
        assert memory_id in ids, f"expected {memory_id} in search results {ids}"

        # Sanity-check a returned Memory object
        found = next(m for m in results.matches if m.id == memory_id)
        assert nonce in (found.content or found.content_raw or "")
        assert "sdk-test" in found.tags
    finally:
        forget_result = client.forget(memory_id)
        assert forget_result.get("ok") is True


@live_only
def test_write_then_forget(client: Gnosem) -> None:
    nonce = uuid.uuid4().hex[:12]
    written = client.write(
        f"disposable test memory {nonce}",
        tags=["sdk-test"],
        written_by="gnosem-python-sdk-test",
    )
    result = client.forget(written.id)
    assert result.get("ok") is True
    assert result.get("id") == written.id


@live_only
def test_bad_key_raises_gnosem_auth_error() -> None:
    g = Gnosem(api_key="gn_definitely_invalid_key_for_testing_0123456789")
    with pytest.raises(GnosemAuthError):
        g.me()


@live_only
def test_missing_query_raises_api_error(client: Gnosem) -> None:
    # server responds with a JSON-RPC error when required arg is missing
    with pytest.raises(GnosemError):
        client.search("")


@live_only
def test_list_returns_page(client: Gnosem) -> None:
    page = client.list(limit=5)
    assert isinstance(page.memories, list)
    assert len(page.memories) <= 5
    # cursor is Optional[int]; if provided it must be numeric-ish
    if page.cursor is not None:
        assert isinstance(page.cursor, int)


@live_only
def test_write_bulk(client: Gnosem) -> None:
    nonce = uuid.uuid4().hex[:12]
    entries = [
        {
            "content": f"bulk-test-a {nonce}",
            "tags": ["sdk-test", "bulk"],
            "written_by": "gnosem-python-sdk-test",
        },
        {
            "content": f"bulk-test-b {nonce}",
            "tags": ["sdk-test", "bulk"],
            "written_by": "gnosem-python-sdk-test",
        },
    ]
    results = client.write_bulk(entries)
    assert isinstance(results, list)
    assert len(results) == 2

    ids = [r.get("id") for r in results if r.get("id")]
    try:
        assert len(ids) == 2
        for entry_id in ids:
            assert isinstance(entry_id, str) and entry_id
    finally:
        for entry_id in ids:
            try:
                client.forget(entry_id)
            except GnosemError:
                pass  # best-effort cleanup
