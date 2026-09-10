"""
Rule-Based Scorer — Core Deliverable
=====================================
Starts at 100, subtracts weighted penalties, clamps to [0, 100].

Penalty weights are EXACT values from the PRD/TRD — do not change:
  - Unrecognized device:                    −30
  - Unrecognized IP/region:                 −20
  - Off-hours login:                        −10
  - High login velocity:                    −25
  - Close graph-distance to known bad actor: −35

Penalties are ADDITIVE and the final score is CLAMPED to [0, 100].
(TRD §9.4: "Decision: penalties are additive and the result is
clamped to the range [0, 100].")

This is a PURE FUNCTION with no side effects — easy to unit test.

Owner: Abhinand Baiju Smitha
Ref: docs/Abhinand_Task_Plan.md — scorers/rules.py section
Ref: TRD §9.3, §9.4 for exact weights and combination rule
"""

from dataclasses import dataclass, field


@dataclass
class ScoreResult:
    """
    Result of the rule-based scoring.

    Attributes:
        trust_score: Integer 0-100 (higher = more trusted).
        reasons: List of penalty reason strings that were applied.
    """
    trust_score: int
    reasons: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Exact penalty weights from PRD Table / TRD §9.3
# These MUST NOT be changed — they match the PRD specification.
# ---------------------------------------------------------------------------
PENALTY_UNRECOGNIZED_DEVICE = 30
PENALTY_UNRECOGNIZED_REGION = 20
PENALTY_OFF_HOURS = 10
PENALTY_HIGH_VELOCITY = 25
PENALTY_GRAPH_PROXIMITY = 35

# Graph distance threshold: within 3 hops triggers the penalty (TRD §9.5)
GRAPH_PROXIMITY_THRESHOLD = 3


def calculate_score(
    device_unrecognized: bool = False,
    region_unrecognized: bool = False,
    off_hours: bool = False,
    high_velocity: bool = False,
    graph_distance: int | None = None,
) -> ScoreResult:
    """
    Calculate the Trust Score using the rule-based weighted penalty system.

    Starts at 100 and subtracts a penalty for each abnormal signal.
    The result is clamped to [0, 100].

    Args:
        device_unrecognized: True if the device fingerprint hasn't been seen
                             for this wallet before.
        region_unrecognized: True if the IP/region is new for this wallet.
        off_hours: True if the login time is outside the user's typical hours.
        high_velocity: True if the login velocity exceeds the threshold.
        graph_distance: Hop distance to the nearest known bad actor in the
                       threat graph, or None if no bad actor within range.

    Returns:
        ScoreResult with the clamped trust_score and list of applied penalties.

    Examples (from TRD §9.4 — these are the unit test fixtures):
        >>> calculate_score()  # No signals
        ScoreResult(trust_score=100, reasons=[])

        >>> calculate_score(device_unrecognized=True)  # S2: new phone
        ScoreResult(trust_score=70, reasons=['unrecognized_device'])

        >>> calculate_score(region_unrecognized=True)  # S2: travelling
        ScoreResult(trust_score=80, reasons=['unrecognized_region'])

        >>> calculate_score(device_unrecognized=True, off_hours=True)
        ScoreResult(trust_score=60, reasons=['unrecognized_device', 'off_hours'])

        >>> calculate_score(device_unrecognized=True, region_unrecognized=True,
        ...                 high_velocity=True)  # S3: stolen creds
        ScoreResult(trust_score=25, reasons=[...])

        >>> calculate_score(device_unrecognized=True, region_unrecognized=True,
        ...                 off_hours=True, high_velocity=True,
        ...                 graph_distance=1)  # All triggered
        ScoreResult(trust_score=0, reasons=[...])  # Clamped from -20
    """
    score = 100
    reasons: list[str] = []

    if device_unrecognized:
        score -= PENALTY_UNRECOGNIZED_DEVICE
        reasons.append("unrecognized_device")

    if region_unrecognized:
        score -= PENALTY_UNRECOGNIZED_REGION
        reasons.append("unrecognized_region")

    if off_hours:
        score -= PENALTY_OFF_HOURS
        reasons.append("off_hours")

    if high_velocity:
        score -= PENALTY_HIGH_VELOCITY
        reasons.append("high_velocity")

    if graph_distance is not None and graph_distance <= GRAPH_PROXIMITY_THRESHOLD:
        score -= PENALTY_GRAPH_PROXIMITY
        reasons.append("graph_proximity_to_flagged")

    # Clamp to [0, 100] — TRD §9.4
    score = max(0, min(100, score))

    return ScoreResult(trust_score=score, reasons=reasons)
