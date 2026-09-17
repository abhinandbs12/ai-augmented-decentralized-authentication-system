"""
Test Suite — Threat Graph & Bounded BFS
=========================================
Covers the BFS distance function with the four cases from the task plan:
  1. Bad actor at distance 1 → returns 1
  2. Bad actor at distance 3 (edge of bound) → returns 3
  3. Bad actor at distance 4 (beyond bound) → returns None
  4. No bad actor anywhere in the graph → returns None

Also tests the ThreatGraph class: add_login, mark_bad_actor, and
graph reconstruction basics.

Owner: Abhinand Baiju Smitha
Ref: docs/Abhinand_Task_Plan.md — graph/bfs.py test cases
"""

import pytest
from app.graph.threat_graph import ThreatGraph
from app.graph.bfs import bounded_bfs


class TestBoundedBFS:
    """Test the bounded BFS algorithm — the four required cases."""

    def _build_chain_graph(self, length: int) -> ThreatGraph:
        """
        Build a linear chain graph:
        w0 -- ip0 -- w1 -- ip1 -- w2 -- ip2 -- ...

        Each wallet connects to its IP, and adjacent IPs connect
        to adjacent wallets, creating a chain.
        """
        graph = ThreatGraph()
        for i in range(length):
            wallet = f"wallet_{i}"
            ip = f"ip_{i}"
            device = f"device_{i}"
            graph.add_login(wallet, ip, device)
            # Connect consecutive wallets through shared IPs
            if i > 0:
                prev_ip = f"ip_{i-1}"
                graph.adjacency[wallet].add(prev_ip)
                graph.adjacency[prev_ip].add(wallet)
        return graph

    def test_bad_actor_at_distance_1(self):
        """Case 1: Bad actor is 1 hop away → returns 1."""
        graph = ThreatGraph()
        graph.add_login("wallet_a", "shared_ip", "device_a")
        graph.add_login("wallet_b", "shared_ip", "device_b")
        graph.mark_bad_actor("wallet_b")

        # wallet_a → shared_ip → wallet_b (bad): distance is 2 hops
        # But wallet_a → shared_ip (direct neighbor), shared_ip connects
        # to wallet_b. So from wallet_a: 1 hop to shared_ip, 2 hops to wallet_b.
        # Actually let's test with direct neighbor
        graph2 = ThreatGraph()
        graph2.adjacency["A"].add("B")
        graph2.adjacency["B"].add("A")
        graph2.bad_actors.add("B")

        result = bounded_bfs(graph2, "A", max_hops=3)
        assert result == 1

    def test_bad_actor_at_distance_2_via_shared_ip(self):
        """Two wallets sharing an IP — bad actor is 2 hops through IP node."""
        graph = ThreatGraph()
        graph.add_login("wallet_good", "shared_ip", "device_good")
        graph.add_login("wallet_bad", "shared_ip", "device_bad")
        graph.mark_bad_actor("wallet_bad")

        # wallet_good → shared_ip (1 hop) → wallet_bad (2 hops)
        result = bounded_bfs(graph, "wallet_good", max_hops=3)
        assert result == 2

    def test_bad_actor_at_distance_3_edge_of_bound(self):
        """Case 2: Bad actor at exactly 3 hops → returns 3 (still within bound)."""
        graph = ThreatGraph()
        # Build chain: A -- B -- C -- D
        graph.adjacency["A"].add("B")
        graph.adjacency["B"].add("A")
        graph.adjacency["B"].add("C")
        graph.adjacency["C"].add("B")
        graph.adjacency["C"].add("D")
        graph.adjacency["D"].add("C")
        graph.mark_bad_actor("D")

        result = bounded_bfs(graph, "A", max_hops=3)
        assert result == 3

    def test_bad_actor_at_distance_4_beyond_bound(self):
        """Case 3: Bad actor at 4 hops → returns None (beyond bound)."""
        graph = ThreatGraph()
        # Build chain: A -- B -- C -- D -- E
        graph.adjacency["A"].add("B")
        graph.adjacency["B"].add("A")
        graph.adjacency["B"].add("C")
        graph.adjacency["C"].add("B")
        graph.adjacency["C"].add("D")
        graph.adjacency["D"].add("C")
        graph.adjacency["D"].add("E")
        graph.adjacency["E"].add("D")
        graph.mark_bad_actor("E")

        result = bounded_bfs(graph, "A", max_hops=3)
        assert result is None

    def test_no_bad_actor_in_graph(self):
        """Case 4: No bad actor anywhere → returns None."""
        graph = ThreatGraph()
        graph.add_login("wallet_1", "ip_1", "device_1")
        graph.add_login("wallet_2", "ip_2", "device_2")
        # No bad actors marked

        result = bounded_bfs(graph, "wallet_1", max_hops=3)
        assert result is None

    def test_start_node_not_in_graph(self):
        """Start node doesn't exist in graph → returns None."""
        graph = ThreatGraph()
        result = bounded_bfs(graph, "nonexistent", max_hops=3)
        assert result is None

    def test_start_node_is_bad_actor(self):
        """Start node itself is flagged → returns 0."""
        graph = ThreatGraph()
        graph.adjacency["A"].add("B")
        graph.adjacency["B"].add("A")
        graph.bad_actors.add("A")

        result = bounded_bfs(graph, "A", max_hops=3)
        assert result == 0

    def test_multiple_bad_actors_returns_nearest(self):
        """Multiple bad actors — should return distance to the nearest one."""
        graph = ThreatGraph()
        # A -- B -- C -- D
        graph.adjacency["A"].add("B")
        graph.adjacency["B"].add("A")
        graph.adjacency["B"].add("C")
        graph.adjacency["C"].add("B")
        graph.adjacency["C"].add("D")
        graph.adjacency["D"].add("C")
        graph.mark_bad_actor("B")  # distance 1
        graph.mark_bad_actor("D")  # distance 3

        result = bounded_bfs(graph, "A", max_hops=3)
        assert result == 1  # Nearest is B at distance 1


class TestThreatGraph:
    """Test the ThreatGraph class methods."""

    def test_add_login_creates_edges(self):
        """add_login should create bidirectional edges."""
        graph = ThreatGraph()
        graph.add_login("wallet_1", "ip_1", "device_1")

        assert "ip_1" in graph.adjacency["wallet_1"]
        assert "device_1" in graph.adjacency["wallet_1"]
        assert "wallet_1" in graph.adjacency["ip_1"]
        assert "wallet_1" in graph.adjacency["device_1"]

    def test_add_login_multiple_wallets_shared_ip(self):
        """Multiple wallets sharing an IP are connected through it."""
        graph = ThreatGraph()
        graph.add_login("wallet_1", "shared_ip", "device_1")
        graph.add_login("wallet_2", "shared_ip", "device_2")

        assert "wallet_1" in graph.adjacency["shared_ip"]
        assert "wallet_2" in graph.adjacency["shared_ip"]

    def test_mark_bad_actor(self):
        """mark_bad_actor adds to bad_actors set."""
        graph = ThreatGraph()
        graph.mark_bad_actor("bad_wallet")
        assert "bad_wallet" in graph.bad_actors

    def test_nearest_bad_actor_distance_delegates_to_bfs(self):
        """nearest_bad_actor_distance should call bounded_bfs."""
        graph = ThreatGraph()
        graph.adjacency["A"].add("B")
        graph.adjacency["B"].add("A")
        graph.bad_actors.add("B")

        result = graph.nearest_bad_actor_distance("A")
        assert result == 1

    def test_node_count(self):
        """node_count should return number of unique nodes."""
        graph = ThreatGraph()
        graph.add_login("w1", "ip1", "d1")
        # Nodes: w1, ip1, d1 = 3
        assert graph.node_count == 3

    def test_edge_count(self):
        """edge_count should count each bidirectional pair once."""
        graph = ThreatGraph()
        graph.add_login("w1", "ip1", "d1")
        # Edges: w1↔ip1, w1↔d1 = 2
        assert graph.edge_count == 2

    def test_fraud_ring_detection_pattern(self):
        """
        Scenario S4: 3 wallets sharing same device + IP.
        All should be connected through shared nodes.
        """
        graph = ThreatGraph()
        graph.add_login("mule_1", "shared_ip", "shared_device")
        graph.add_login("mule_2", "shared_ip", "shared_device")
        graph.add_login("mule_3", "shared_ip", "shared_device")
        graph.mark_bad_actor("mule_1")

        # mule_2 should be 2 hops from mule_1 via shared_ip
        dist = graph.nearest_bad_actor_distance("mule_2")
        assert dist is not None
        assert dist <= 3
