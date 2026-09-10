"""
Threat Graph — Adjacency-List Fraud Detection Graph [DSA]
==========================================================
An adjacency-list graph where nodes are wallets, IPs, and device
fingerprints. On every login, edges are added connecting the wallet
to the IP and device it used.

The graph is held IN MEMORY and rebuilt from MongoDB on service
startup (TRD §7.6). It is a derived structure — never the only
copy of this data.

Node types:
  - wallet:  "0x..." addresses
  - ip:      IP address strings
  - device:  SHA-256 device fingerprint strings

"Known bad actor" definition (TRD §9.5):
  - Admin-flagged from the dashboard, OR
  - 3+ blocked attempts within 1 hour

Owner: Abhinand Baiju Smitha
Ref: docs/Abhinand_Task_Plan.md — graph/threat_graph.py section
Ref: TRD §9.5 for fraud detection logic
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from collections import defaultdict

from app.graph.bfs import bounded_bfs

logger = logging.getLogger(__name__)


class ThreatGraph:
    """
    In-memory adjacency-list graph for fraud detection.

    Nodes are wallets, IPs, and device fingerprints. Edges connect
    entities that appeared together in a login event.

    Attributes:
        adjacency: Dict mapping each node_id to a set of neighbor node_ids.
        bad_actors: Set of node_ids flagged as bad actors.
    """

    def __init__(self):
        """Initialize an empty threat graph."""
        self.adjacency: dict[str, set[str]] = defaultdict(set)
        self.bad_actors: set[str] = set()

    def add_login(self, wallet: str, ip: str, device: str) -> None:
        """
        Add/update edges for a login event.

        Connects wallet ↔ ip and wallet ↔ device with bidirectional edges.
        This is called on every login attempt (TRD §9.5).

        Args:
            wallet: Wallet address of the login.
            ip: Source IP address.
            device: Device fingerprint.
        """
        # wallet ↔ ip
        self.adjacency[wallet].add(ip)
        self.adjacency[ip].add(wallet)

        # wallet ↔ device
        self.adjacency[wallet].add(device)
        self.adjacency[device].add(wallet)

    def mark_bad_actor(self, node_id: str) -> None:
        """
        Flag a node as a known bad actor.

        Args:
            node_id: The wallet, IP, or device to flag.
        """
        self.bad_actors.add(node_id)
        logger.info("Node %s marked as bad actor", node_id[:16])

    def nearest_bad_actor_distance(
        self, start_node: str, max_hops: int = 3
    ) -> int | None:
        """
        Find the distance to the nearest bad actor within max_hops.

        Delegates to bounded_bfs in bfs.py.

        Args:
            start_node: The node to start the search from.
            max_hops: Maximum search depth (default 3, per TRD §9.5).

        Returns:
            Distance in hops to the nearest bad actor, or None if
            no bad actor found within the bound.
        """
        return bounded_bfs(self, start_node, max_hops)

    def rebuild_from_mongo(self, login_events_col, fraud_flags_col) -> None:
        """
        Reconstruct the entire graph from stored history on startup.

        Replays login events from the last 7 days (TRD §7.6 default)
        and loads flagged bad actors from fraud_flags.

        Args:
            login_events_col: MongoDB collection for login_events.
            fraud_flags_col: MongoDB collection for fraud_flags.
        """
        # Clear existing graph
        self.adjacency.clear()
        self.bad_actors.clear()

        # Replay recent login events (last 7 days — TRD §7.6)
        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
        events = login_events_col.find(
            {"timestamp": {"$gte": seven_days_ago}},
            {
                "wallet_address": 1,
                "ip_address": 1,
                "device_fingerprint": 1,
            },
        )

        event_count = 0
        for event in events:
            wallet = event.get("wallet_address", "")
            ip = event.get("ip_address", "")
            device = event.get("device_fingerprint", "")
            if wallet and ip and device:
                self.add_login(wallet, ip, device)
                event_count += 1

        # Load flagged bad actors from fraud_flags
        flags = fraud_flags_col.find({}, {"node_ids": 1})
        flag_count = 0
        for flag in flags:
            for node_id in flag.get("node_ids", []):
                self.bad_actors.add(node_id)
                flag_count += 1

        logger.info(
            "Graph rebuilt from %d events, %d flagged nodes loaded",
            event_count, flag_count,
        )

    @property
    def node_count(self) -> int:
        """Number of unique nodes in the graph."""
        return len(self.adjacency)

    @property
    def edge_count(self) -> int:
        """Number of edges (each bidirectional pair counted once)."""
        return sum(len(neighbors) for neighbors in self.adjacency.values()) // 2
