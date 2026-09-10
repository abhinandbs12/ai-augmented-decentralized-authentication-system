"""
AI Risk Engine — FastAPI Entry Point
=====================================
Exposes POST /score and GET /health endpoints.
The /score endpoint takes login context, returns a Trust Score (0-100) 
and the list of penalties that were applied.

Owner: Abhinand Baiju Smitha
See docs/Abhinand_Task_Plan.md for full specification.
"""

import os
import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from pymongo import MongoClient

from app.scorers.rules import calculate_score
from app.graph.threat_graph import ThreatGraph
from app.features import (
    is_unrecognized_device,
    is_unrecognized_region,
    is_off_hours,
    login_velocity,
)
from app.geo import lookup_region

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic models — request and response
# ---------------------------------------------------------------------------

class LoginContext(BaseModel):
    """Request body for POST /score."""
    wallet: str = Field(..., description="Wallet address of the login attempt")
    ip_address: str = Field(..., description="Source IP address")
    device_fingerprint: str = Field(..., description="SHA-256 device fingerprint")
    timestamp: datetime = Field(..., description="Timestamp of the login attempt")


class ScoreResult(BaseModel):
    """Response body for POST /score."""
    trust_score: int = Field(
        ..., ge=0, le=100,
        description="Trust Score 0-100 (higher = more trusted)"
    )
    reasons: list[str] = Field(
        default_factory=list,
        description="List of penalty reasons that were applied"
    )

# ---------------------------------------------------------------------------
# Global state — rebuilt on startup
# ---------------------------------------------------------------------------
threat_graph: ThreatGraph | None = None
mongo_client: MongoClient | None = None
db = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle for the FastAPI app."""
    global threat_graph, mongo_client, db

    # --- Startup ---
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    mongo_client = MongoClient(mongo_url)
    db = mongo_client.get_database("authdb")

    # Build the threat graph from stored history (TRD §7.6)
    threat_graph = ThreatGraph()
    login_events = db.get_collection("login_events")
    fraud_flags = db.get_collection("fraud_flags")
    threat_graph.rebuild_from_mongo(login_events, fraud_flags)
    logger.info(
        "Threat graph rebuilt: %d nodes, %d edges",
        len(threat_graph.adjacency),
        sum(len(v) for v in threat_graph.adjacency.values()) // 2,
    )

    yield

    # --- Shutdown ---
    if mongo_client:
        mongo_client.close()
        logger.info("MongoDB connection closed")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="AI Risk Engine",
    description="Trust Score computation for the Banking Auth System",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    """Liveness / readiness probe for Docker healthchecks."""
    return {"status": "ok"}


@app.post("/score", response_model=ScoreResult)
async def score(context: LoginContext):
    """
    Compute a Trust Score (0-100) for a login attempt.

    The score starts at 100 and penalties are subtracted for each
    abnormal signal. The result is clamped to [0, 100].

    This endpoint is called by the orchestrator on every login attempt
    BEFORE the signature challenge is issued (TRD §1.3).
    """
    if db is None or threat_graph is None:
        raise HTTPException(status_code=503, detail="Risk engine not initialized")

    login_events = db.get_collection("login_events")

    # --- 1. Update the threat graph with this login ---
    threat_graph.add_login(
        context.wallet, context.ip_address, context.device_fingerprint
    )

    # --- 2. Extract features (features.py) ---
    device_unrecognized = is_unrecognized_device(
        context.wallet, context.device_fingerprint, login_events
    )
    region = lookup_region(context.ip_address)
    region_unrecognized = is_unrecognized_region(
        context.wallet, context.ip_address, login_events
    )
    off_hours = is_off_hours(context.wallet, context.timestamp, login_events)
    velocity = login_velocity(context.wallet, context.ip_address, login_events)

    # --- 3. Graph proximity (bounded BFS) ---
    graph_distance = threat_graph.nearest_bad_actor_distance(context.wallet)

    # --- 4. Calculate score (scorers/rules.py) ---
    result = calculate_score(
        device_unrecognized=device_unrecognized,
        region_unrecognized=region_unrecognized,
        off_hours=off_hours,
        high_velocity=velocity >= int(os.getenv("VELOCITY_THRESHOLD", "5")),
        graph_distance=graph_distance,
    )

    # --- 5. Log the event into MongoDB for future feature lookups ---
    login_events.insert_one({
        "wallet_address": context.wallet,
        "ip_address": context.ip_address,
        "device_fingerprint": context.device_fingerprint,
        "trust_score": result.trust_score,
        "decision": _decision_from_score(result.trust_score),
        "factors": [{"name": r, "penalty": 0} for r in result.reasons],
        "timestamp": context.timestamp,
        "region": region,
    })

    # --- 6. Auto-flag bad actors (TRD §9.5) ---
    # A node becomes flagged when it is involved in 3+ blocked attempts within 1 hour
    if result.trust_score < 50:
        _check_auto_flag(context.wallet, login_events, db.get_collection("fraud_flags"))

    logger.info(
        "Scored wallet=%s score=%d reasons=%s",
        context.wallet[:10], result.trust_score, result.reasons,
    )
    return result


def _decision_from_score(score: int) -> str:
    """Map Trust Score to routing decision (PRD §3.2)."""
    if score >= 90:
        return "allow"
    elif score >= 50:
        return "otp_required"
    else:
        return "blocked"


def _check_auto_flag(
    wallet: str, login_events_col, fraud_flags_col
):
    """
    Auto-flag a wallet as a bad actor if it has 3+ blocked attempts
    within the last 1 hour (TRD §9.5 / seeding bad actors rule (b)).
    """
    from datetime import timedelta

    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    blocked_count = login_events_col.count_documents({
        "wallet_address": wallet,
        "decision": "blocked",
        "timestamp": {"$gte": one_hour_ago},
    })

    if blocked_count >= 3 and threat_graph is not None:
        # Flag in-memory graph
        threat_graph.mark_bad_actor(wallet)

        # Persist to fraud_flags if not already flagged
        existing = fraud_flags_col.find_one({"node_ids": wallet})
        if not existing:
            fraud_flags_col.insert_one({
                "cluster_id": f"auto-{wallet[:8]}",
                "node_ids": [wallet],
                "reason": "3_or_more_blocked_in_1_hour",
                "detected_at": datetime.now(timezone.utc),
            })
            logger.warning("Auto-flagged wallet %s as bad actor", wallet[:10])
