"""Minimal hello-world graph to verify LangGraph wiring.

Demonstrates:
- StateGraph definition with TypedDict state
- Multi-step execution (plan -> greet -> finalize)
- Streaming via astream (consumed by server.py SSE endpoint)

In-memory only; persistent SQLite/Postgres checkpointer is added in D2+
once `langgraph-checkpoint-sqlite` / `langgraph-checkpoint-postgres` are
wired into pyproject.toml.

This file will be deleted once real graphs (listing_pack, refinement_loop,
scene_json) replace it.
"""

from typing import TypedDict

from langgraph.graph import END, START, StateGraph


class HelloState(TypedDict):
    """State carried through the hello graph."""

    message: str
    plan: list[str]
    response: str


def plan(state: HelloState) -> dict:
    """Pretend to plan the response."""
    return {"plan": ["parse_input", "compose_greeting"]}


def greet(state: HelloState) -> dict:
    """Compose the greeting."""
    return {"response": f"Hello, {state['message']}! (via LangGraph)"}


def finalize(state: HelloState) -> dict:
    """No-op terminal node, kept for graph clarity."""
    return {}


def build_graph() -> StateGraph:
    """Build the hello graph definition (uncompiled)."""
    graph = StateGraph(HelloState)
    graph.add_node("plan", plan)
    graph.add_node("greet", greet)
    graph.add_node("finalize", finalize)
    graph.add_edge(START, "plan")
    graph.add_edge("plan", "greet")
    graph.add_edge("greet", "finalize")
    graph.add_edge("finalize", END)
    return graph
