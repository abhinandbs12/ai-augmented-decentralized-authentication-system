"""
Tests for the FastAPI endpoints (app/main.py)
==============================================
Covers the internal-token guard on POST /event, the upsert behaviour the
orchestrator relies on, and the configurable velocity window.

The MongoDB handles are replaced with in-memory fakes, so no database is
needed. The app's lifespan is not started (TestClient only runs it inside a
`with` block), which is why app.main.db is patched directly.
"""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app import main
from app.graph.threat_graph import ThreatGraph

TOKEN = "test-internal-token"

SAMPLE_EVENT = {
    "wallet_address": "0xA1b2C3d4E5f6a7B8c9D0e1F2a3B4c5D6e7F8a9B0",
    "ip_address": "192.168.1.100",
    "device_fingerprint": "a" * 64,
    "trust_score": 72,
    "decision": "otp_required",
    "timestamp": "2026-09-20T10:00:00Z",
}


class FakeCollection:
    """The slice of the pymongo collection API that app/main.py uses."""

    def __init__(self):
        self.documents: list[dict] = []
        self.last_count_query: dict | None = None

    def insert_one(self, document: dict):
        self.documents.append(dict(document))

    def update_one(self, filter_: dict, update: dict, upsert: bool = False):
        for document in self.documents:
            if all(document.get(k) == v for k, v in filter_.items()):
                document.update(update.get("$set", {}))
                return
        if upsert:
            merged = {**update.get("$setOnInsert", {}), **update.get("$set", {})}
            self.documents.append(merged)

    def find_one(self, query: dict):
        return None

    def find(self, query: dict, projection: dict | None = None):
        return EmptyCursor()

    def count_documents(self, query: dict) -> int:
        self.last_count_query = query
        return 0


class EmptyCursor:
    """A wallet with no history: find(...).sort(...).limit(...) yields nothing."""

    def sort(self, key, direction):
        return self

    def limit(self, count):
        return self

    def __iter__(self):
        return iter(())


class FakeDatabase:
    def __init__(self, collections: dict[str, FakeCollection]):
        self._collections = collections

    def get_collection(self, name: str) -> FakeCollection:
        return self._collections[name]


@pytest.fixture
def login_events() -> FakeCollection:
    return FakeCollection()


@pytest.fixture
def client(monkeypatch, login_events) -> TestClient:
    monkeypatch.setenv("INTERNAL_API_TOKEN", TOKEN)
    monkeypatch.setattr(
        main,
        "db",
        FakeDatabase({"login_events": login_events, "fraud_flags": FakeCollection()}),
    )
    monkeypatch.setattr(main, "threat_graph", ThreatGraph())
    return TestClient(main.app)


class TestHealth:

    def test_health_is_open(self, client):
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestEventAuthentication:
    """
    Anyone who could reach POST /event could previously write login history,
    which decides whether a device is familiar and which wallets are flagged.
    """

    def test_rejects_an_event_with_no_token(self, client, login_events):
        response = client.post("/event", json=SAMPLE_EVENT)

        assert response.status_code == 401
        assert login_events.documents == []

    def test_rejects_an_event_with_the_wrong_token(self, client, login_events):
        response = client.post(
            "/event", json=SAMPLE_EVENT, headers={"X-Internal-Token": "guessed"}
        )

        assert response.status_code == 401
        assert login_events.documents == []

    def test_refuses_to_record_when_no_token_is_configured(
        self, monkeypatch, client, login_events
    ):
        monkeypatch.setenv("INTERNAL_API_TOKEN", "")

        response = client.post(
            "/event", json=SAMPLE_EVENT, headers={"X-Internal-Token": TOKEN}
        )

        assert response.status_code == 503
        assert login_events.documents == []


class TestEventRecording:

    def test_records_an_event_as_unverified_by_default(self, client, login_events):
        response = client.post(
            "/event", json=SAMPLE_EVENT, headers={"X-Internal-Token": TOKEN}
        )

        assert response.status_code == 200
        assert len(login_events.documents) == 1
        assert login_events.documents[0]["verified"] is False
        assert login_events.documents[0]["decision"] == "otp_required"
        assert login_events.documents[0]["factors"] == []

    def test_keeps_the_scoring_factors(self, client, login_events):
        client.post(
            "/event",
            json={**SAMPLE_EVENT, "factors": ["unrecognized_device"]},
            headers={"X-Internal-Token": TOKEN},
        )

        assert login_events.documents[0]["factors"] == ["unrecognized_device"]

    def test_second_call_with_the_same_event_id_updates_the_first(
        self, client, login_events
    ):
        headers = {"X-Internal-Token": TOKEN}
        event = {**SAMPLE_EVENT, "event_id": "evt-1"}

        client.post("/event", json=event, headers=headers)
        client.post(
            "/event",
            json={**event, "decision": "allow", "trust_score": 96, "verified": True},
            headers=headers,
        )

        assert len(login_events.documents) == 1
        assert login_events.documents[0]["verified"] is True
        assert login_events.documents[0]["decision"] == "allow"
        assert login_events.documents[0]["event_id"] == "evt-1"


class TestScore:

    def test_scores_a_login_and_returns_the_reasons(self, client):
        response = client.post(
            "/score",
            json={
                "wallet": SAMPLE_EVENT["wallet_address"],
                "ip_address": SAMPLE_EVENT["ip_address"],
                "device_fingerprint": SAMPLE_EVENT["device_fingerprint"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

        assert response.status_code == 200
        body = response.json()
        # An unknown wallet on an unknown device and IP: 100 - 30 - 20.
        assert body["trust_score"] == 50
        assert body["reasons"] == ["unrecognized_device", "unrecognized_region"]

    def test_velocity_window_comes_from_the_environment(
        self, monkeypatch, client, login_events
    ):
        monkeypatch.setenv("VELOCITY_WINDOW_SECONDS", "60")
        before = datetime.now(timezone.utc)

        client.post(
            "/score",
            json={
                "wallet": SAMPLE_EVENT["wallet_address"],
                "ip_address": SAMPLE_EVENT["ip_address"],
                "device_fingerprint": SAMPLE_EVENT["device_fingerprint"],
                "timestamp": before.isoformat(),
            },
        )

        window_start = login_events.last_count_query["timestamp"]["$gte"]
        elapsed = (before - window_start).total_seconds()
        assert 59 <= elapsed <= 65


class MatchingCollection(FakeCollection):
    """Answers find_one by exact field equality, the way MongoDB does."""

    def find_one(self, query: dict):
        for document in self.documents:
            if all(document.get(k) == v for k, v in query.items()):
                return document
        return None


class TestWalletCase:
    """
    One account can reach the service spelled in lower case or checksummed.
    Both spellings must mean the same identity.
    """

    CHECKSUMMED = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

    @pytest.fixture
    def matching_events(self, monkeypatch) -> MatchingCollection:
        events = MatchingCollection()
        monkeypatch.setenv("INTERNAL_API_TOKEN", TOKEN)
        monkeypatch.setattr(
            main, "db", FakeDatabase({"login_events": events, "fraud_flags": FakeCollection()})
        )
        monkeypatch.setattr(main, "threat_graph", ThreatGraph())
        return events

    def test_a_completed_sign_in_makes_the_device_familiar_in_either_spelling(
        self, matching_events
    ):
        client = TestClient(main.app)
        # The orchestrator reports the completed sign-in with the address from
        # its user record, which is lower case...
        client.post(
            "/event",
            json={**SAMPLE_EVENT, "wallet_address": self.CHECKSUMMED.lower(),
                  "decision": "allow", "trust_score": 100, "verified": True},
            headers={"X-Internal-Token": TOKEN},
        )

        # ...and the next attempt arrives checksummed, as a client may send it.
        response = client.post(
            "/score",
            json={
                "wallet": self.CHECKSUMMED,
                "ip_address": SAMPLE_EVENT["ip_address"],
                "device_fingerprint": SAMPLE_EVENT["device_fingerprint"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

        reasons = response.json()["reasons"]
        assert "unrecognized_device" not in reasons
        assert "unrecognized_region" not in reasons

    def test_stores_and_counts_blocked_attempts_under_one_spelling(
        self, matching_events
    ):
        client = TestClient(main.app)
        client.post(
            "/event",
            json={**SAMPLE_EVENT, "wallet_address": self.CHECKSUMMED, "decision": "blocked"},
            headers={"X-Internal-Token": TOKEN},
        )

        assert matching_events.documents[0]["wallet_address"] == self.CHECKSUMMED.lower()
        # The auto-flag rule counts by the same normalised address, so varying
        # the letter case cannot split an attacker's blocked attempts.
        assert matching_events.last_count_query["wallet_address"] == self.CHECKSUMMED.lower()
