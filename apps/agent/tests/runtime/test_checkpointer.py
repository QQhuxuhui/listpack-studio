"""D57 — LangGraph PostgresSaver opt-in behaviour.

Sandbox doesn't run a real Postgres + LangGraph saver schema migration
in CI mode, so these tests only cover the gating logic. The integration
path (postgres mode, real saver) is covered by tests/runtime/
test_persistence_pg.py reaching the same DB.
"""

from __future__ import annotations

import pytest

from runtime.checkpointer import get_checkpointer, reset_checkpointer_cache


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    monkeypatch.delenv("LANGGRAPH_CHECKPOINTER", raising=False)
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    reset_checkpointer_cache()
    yield
    reset_checkpointer_cache()


def test_returns_none_when_unset():
    """Default (no env) → graph compiles with in-memory MemorySaver."""
    assert get_checkpointer() is None


def test_returns_none_when_explicitly_memory(monkeypatch):
    monkeypatch.setenv("LANGGRAPH_CHECKPOINTER", "memory")
    assert get_checkpointer() is None


def test_returns_none_when_postgres_mode_but_no_url(monkeypatch):
    """Avoids crashing — degrade gracefully + warn-log."""
    monkeypatch.setenv("LANGGRAPH_CHECKPOINTER", "postgres")
    # POSTGRES_URL deliberately absent
    assert get_checkpointer() is None


def test_unknown_mode_treated_as_memory(monkeypatch):
    monkeypatch.setenv("LANGGRAPH_CHECKPOINTER", "redis")
    assert get_checkpointer() is None


def test_cache_returns_same_instance(monkeypatch):
    """Once initialised, get_checkpointer returns the cached instance —
    important because the underlying connection pool isn't free to
    re-create."""
    monkeypatch.setenv("LANGGRAPH_CHECKPOINTER", "memory")
    first = get_checkpointer()
    second = get_checkpointer()
    assert first is second  # both None here, but identity check still valid


def test_reset_cache_allows_re_init(monkeypatch):
    monkeypatch.setenv("LANGGRAPH_CHECKPOINTER", "memory")
    assert get_checkpointer() is None
    reset_checkpointer_cache()
    # Should not error on second call
    assert get_checkpointer() is None
