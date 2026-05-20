"""Build the listing_pack graph and offer a one-shot runner.

D19-D20: linear happy path
    START → compliance_check → scene_json → image_gen → platform_adapt → c2pa_stamp → END

D21 will replace the linear `add_edge` chain with conditional edges driven
by `Planner.plan_dag()`, so e.g. Amazon-only runs skip Temu adaptation
and free-tier runs skip refinement.

D22-D23 will insert a `refine_loop` node between `image_gen` and
`platform_adapt`, gated by a critic_card.

The graph is built without a checkpointer here — D24 wires in
PostgresSaver / SqliteSaver when persistence is needed. For tests it's
in-memory only, which is fine because each test compiles its own graph.
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from .nodes import (
    Services,
    make_c2pa_stamp_node,
    make_compliance_check_node,
    make_image_gen_node,
    make_platform_adapt_node,
    make_scene_json_node,
)
from .state import ListingPackInput, ListingPackState, make_initial_state


def build_graph(services: Services):
    """Build + compile the listing_pack graph with services injected.

    Returns a compiled LangGraph (CompiledStateGraph) ready for ainvoke /
    astream. Caller supplies a Services bag; production wiring lives in
    server.py, tests use a mocked bag.
    """
    g = StateGraph(ListingPackState)

    g.add_node("compliance_check", make_compliance_check_node(services))
    g.add_node("scene_json", make_scene_json_node(services))
    g.add_node("image_gen", make_image_gen_node(services))
    g.add_node("platform_adapt", make_platform_adapt_node(services))
    g.add_node("c2pa_stamp", make_c2pa_stamp_node(services))

    g.add_edge(START, "compliance_check")
    g.add_edge("compliance_check", "scene_json")
    g.add_edge("scene_json", "image_gen")
    g.add_edge("image_gen", "platform_adapt")
    g.add_edge("platform_adapt", "c2pa_stamp")
    g.add_edge("c2pa_stamp", END)

    return g.compile()


async def run_listing_pack(
    services: Services,
    *,
    input_: ListingPackInput,
) -> ListingPackState:
    """One-shot run; returns final state.

    For streaming, callers (server.py) build the graph once and call
    `.astream(make_initial_state(input_))` themselves so they can forward
    each event as an SSE frame.
    """
    graph = build_graph(services)
    initial = make_initial_state(input_)
    final = await graph.ainvoke(initial)
    return final
