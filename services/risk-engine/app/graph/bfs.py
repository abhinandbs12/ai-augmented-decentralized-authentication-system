"""
Bounded Breadth-First Search [DSA]
===================================
From a new login's wallet node, search up to 3 hops outward for the
nearest flagged bad actor. Feeds the −35 penalty in the scorer.

Implementation notes (TRD §8.2):
  - Written by hand with an explicit queue and a depth > 3 cut-off.
  - Never recursive.
  - Time complexity: O(V + E) over the explored subgraph.
  - Space complexity: O(V + E).

Owner: Abhinand Baiju Smitha
Ref: docs/Abhinand_Task_Plan.md — graph/bfs.py section
Ref: TRD §8 for DSA requirements
"""

from __future__ import annotations
from collections import deque
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.graph.threat_graph import ThreatGraph


def bounded_bfs(
    graph: ThreatGraph,
    start_node: str,
    max_hops: int = 3,
) -> int | None:
    """
    Perform a breadth-first search from start_node over the ThreatGraph
    adjacency structure, stopping at max_hops, and return the distance
    in hops to the nearest node flagged as a bad actor.

    The search uses an explicit queue (collections.deque) and is never
    recursive. The depth cut-off keeps traversal inside the login latency
    budget (TRD §1.4: < 2s end-to-end).

    Args:
        graph: The ThreatGraph instance to search.
        start_node: The node to start the BFS from (typically a wallet).
        max_hops: Maximum search depth (default 3).

    Returns:
        Distance in hops to the nearest bad actor node, or None if no
        bad actor is found within max_hops.

    Test cases (from task plan):
        1. Bad actor at distance 1 → returns 1
        2. Bad actor at distance 3 (edge of bound) → returns 3
        3. Bad actor at distance 4 (beyond bound) → returns None
        4. No bad actor anywhere in the graph → returns None
    """
    if start_node not in graph.adjacency:
        return None

    # Check if start node itself is a bad actor (distance 0)
    if start_node in graph.bad_actors:
        return 0

    # BFS with explicit queue: (node, distance)
    visited: set[str] = {start_node}
    queue: deque[tuple[str, int]] = deque()

    # Enqueue all neighbors of the start node at distance 1
    for neighbor in graph.adjacency[start_node]:
        if neighbor not in visited:
            visited.add(neighbor)
            queue.append((neighbor, 1))

    while queue:
        current_node, distance = queue.popleft()

        # Check if this node is a bad actor
        if current_node in graph.bad_actors:
            return distance

        # Don't explore beyond max_hops
        if distance >= max_hops:
            continue

        # Enqueue unvisited neighbors
        for neighbor in graph.adjacency.get(current_node, set()):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append((neighbor, distance + 1))

    # No bad actor found within max_hops
    return None
