"""
Test Suite — Feature Extraction Functions
==========================================
Mocks a MongoDB collection to test each feature-extraction function
in isolation. No real database needed.

Owner: Abhinand Baiju Smitha
Ref: docs/Abhinand_Task_Plan.md — Testing responsibilities
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from app.features import (
    is_unrecognized_device,
    is_unrecognized_region,
    is_off_hours,
    login_velocity,
)


class MockCollection:
    """
    A minimal mock of a PyMongo collection that supports find_one,
    find (with sort/limit chaining), and count_documents.
    """

    def __init__(self, documents: list[dict]):
        self._documents = documents

    def find_one(self, query: dict):
        """Return the first document matching the query, or None."""
        for doc in self._documents:
            if self._matches(doc, query):
                return doc
        return None

    def find(self, query: dict, projection: dict | None = None):
        """Return a chainable mock cursor."""
        results = [d for d in self._documents if self._matches(d, query)]
        return MockCursor(results)

    def count_documents(self, query: dict) -> int:
        """Count documents matching the query."""
        return sum(1 for d in self._documents if self._matches(d, query))

    @staticmethod
    def _matches(doc: dict, query: dict) -> bool:
        """Simple query matcher supporting basic operators."""
        for key, condition in query.items():
            value = doc.get(key)
            if isinstance(condition, dict):
                for op, operand in condition.items():
                    if op == "$in":
                        if value not in operand:
                            return False
                    elif op == "$gte":
                        if value is None or value < operand:
                            return False
            else:
                if value != condition:
                    return False
        return True


class MockCursor:
    """Mock cursor supporting sort() and limit() chaining."""

    def __init__(self, results):
        self._results = results

    def sort(self, key, direction):
        self._results.sort(
            key=lambda d: d.get(key, ""),
            reverse=(direction == -1),
        )
        return self

    def limit(self, n):
        self._results = self._results[:n]
        return self

    def __iter__(self):
        return iter(self._results)

    def __len__(self):
        return len(self._results)


# -------------------------------------------------------------------------
# Tests for is_unrecognized_device
# -------------------------------------------------------------------------
class TestIsUnrecognizedDevice:

    def test_recognized_device(self):
        """Device seen before in a successful login → not unrecognized."""
        col = MockCollection([
            {
                "wallet_address": "0xABC",
                "device_fingerprint": "device_known",
                "decision": "allow",
            },
        ])
        assert is_unrecognized_device("0xABC", "device_known", col) is False

    def test_unrecognized_device(self):
        """Device never seen for this wallet → unrecognized."""
        col = MockCollection([
            {
                "wallet_address": "0xABC",
                "device_fingerprint": "device_old",
                "decision": "allow",
            },
        ])
        assert is_unrecognized_device("0xABC", "device_new", col) is True

    def test_empty_history(self):
        """No login history at all → unrecognized."""
        col = MockCollection([])
        assert is_unrecognized_device("0xABC", "any_device", col) is True

    def test_device_seen_but_blocked(self):
        """Device seen only in blocked attempts → still unrecognized."""
        col = MockCollection([
            {
                "wallet_address": "0xABC",
                "device_fingerprint": "device_x",
                "decision": "blocked",
            },
        ])
        assert is_unrecognized_device("0xABC", "device_x", col) is True


# -------------------------------------------------------------------------
# Tests for is_unrecognized_region
# -------------------------------------------------------------------------
class TestIsUnrecognizedRegion:

    def test_recognized_ip(self):
        """IP seen before in a successful login → not unrecognized."""
        col = MockCollection([
            {
                "wallet_address": "0xABC",
                "ip_address": "192.168.1.1",
                "decision": "allow",
            },
        ])
        assert is_unrecognized_region("0xABC", "192.168.1.1", col) is False

    def test_unrecognized_ip(self):
        """IP never seen for this wallet → unrecognized."""
        col = MockCollection([
            {
                "wallet_address": "0xABC",
                "ip_address": "10.0.0.1",
                "decision": "allow",
            },
        ])
        assert is_unrecognized_region("0xABC", "203.0.113.50", col) is True

    def test_empty_history(self):
        """No history → unrecognized."""
        col = MockCollection([])
        assert is_unrecognized_region("0xABC", "any_ip", col) is True


# -------------------------------------------------------------------------
# Tests for is_off_hours
# -------------------------------------------------------------------------
class TestIsOffHours:

    def test_within_usual_hours(self):
        """Login during usual hours → not off-hours."""
        now = datetime(2026, 9, 9, 10, 0, 0)  # 10 AM
        past_logins = [
            {"wallet_address": "0xABC", "decision": "allow",
             "timestamp": datetime(2026, 9, 8, 9, 0, 0)},
            {"wallet_address": "0xABC", "decision": "allow",
             "timestamp": datetime(2026, 9, 7, 11, 0, 0)},
            {"wallet_address": "0xABC", "decision": "allow",
             "timestamp": datetime(2026, 9, 6, 10, 0, 0)},
        ]
        col = MockCollection(past_logins)
        assert is_off_hours("0xABC", now, col) is False

    def test_off_hours_login(self):
        """Login at 3 AM when user typically logs in 9-11 AM → off-hours."""
        now = datetime(2026, 9, 9, 3, 0, 0)  # 3 AM
        past_logins = [
            {"wallet_address": "0xABC", "decision": "allow",
             "timestamp": datetime(2026, 9, 8, 9, 0, 0)},
            {"wallet_address": "0xABC", "decision": "allow",
             "timestamp": datetime(2026, 9, 7, 10, 0, 0)},
            {"wallet_address": "0xABC", "decision": "allow",
             "timestamp": datetime(2026, 9, 6, 11, 0, 0)},
        ]
        col = MockCollection(past_logins)
        assert is_off_hours("0xABC", now, col) is True

    def test_insufficient_history(self):
        """Fewer than 3 past logins → benefit of the doubt → False."""
        now = datetime(2026, 9, 9, 3, 0, 0)
        past_logins = [
            {"wallet_address": "0xABC", "decision": "allow",
             "timestamp": datetime(2026, 9, 8, 10, 0, 0)},
        ]
        col = MockCollection(past_logins)
        assert is_off_hours("0xABC", now, col) is False

    def test_no_history(self):
        """No history at all → False."""
        now = datetime(2026, 9, 9, 3, 0, 0)
        col = MockCollection([])
        assert is_off_hours("0xABC", now, col) is False


# -------------------------------------------------------------------------
# Tests for login_velocity
# -------------------------------------------------------------------------
class TestLoginVelocity:

    def test_no_recent_attempts(self):
        """No recent attempts → velocity 0."""
        col = MockCollection([])
        assert login_velocity("0xABC", "10.0.0.1", col) == 0

    def test_counts_attempts_from_same_ip(self):
        """Multiple recent attempts from same IP are counted."""
        now = datetime.now(timezone.utc)
        docs = [
            {"ip_address": "10.0.0.1", "timestamp": now - timedelta(seconds=60)},
            {"ip_address": "10.0.0.1", "timestamp": now - timedelta(seconds=30)},
            {"ip_address": "10.0.0.1", "timestamp": now - timedelta(seconds=10)},
        ]
        col = MockCollection(docs)
        assert login_velocity("0xABC", "10.0.0.1", col) == 3

    def test_does_not_count_old_attempts(self):
        """Attempts older than the window are not counted."""
        now = datetime.now(timezone.utc)
        docs = [
            {"ip_address": "10.0.0.1", "timestamp": now - timedelta(seconds=600)},
            {"ip_address": "10.0.0.1", "timestamp": now - timedelta(seconds=10)},
        ]
        col = MockCollection(docs)
        # Only the recent one should count (the old one is 600s ago, window is 300s)
        result = login_velocity("0xABC", "10.0.0.1", col, window_seconds=300)
        assert result == 1

    def test_different_ips_not_counted(self):
        """Attempts from different IPs are not counted."""
        now = datetime.now(timezone.utc)
        docs = [
            {"ip_address": "10.0.0.2", "timestamp": now - timedelta(seconds=10)},
            {"ip_address": "10.0.0.3", "timestamp": now - timedelta(seconds=10)},
        ]
        col = MockCollection(docs)
        assert login_velocity("0xABC", "10.0.0.1", col) == 0
