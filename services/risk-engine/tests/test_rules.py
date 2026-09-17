"""
Test Suite — Rule-Based Scorer
================================
Covers every penalty combination in the scorer.
Test fixtures are the exact worked examples from TRD §9.4.

Owner: Abhinand Baiju Smitha
Ref: docs/Abhinand_Task_Plan.md — Testing responsibilities
"""

import pytest
from app.scorers.rules import calculate_score, ScoreResult


class TestSinglePenalties:
    """Test each penalty in isolation."""

    def test_no_signals_returns_100(self):
        """Regular customer, usual device and place (S1) → 100."""
        result = calculate_score()
        assert result.trust_score == 100
        assert result.reasons == []

    def test_unrecognized_device_penalty(self):
        """New phone (S2) → 100 - 30 = 70."""
        result = calculate_score(device_unrecognized=True)
        assert result.trust_score == 70
        assert result.reasons == ["unrecognized_device"]

    def test_unrecognized_region_penalty(self):
        """Travelling (S2) → 100 - 20 = 80."""
        result = calculate_score(region_unrecognized=True)
        assert result.trust_score == 80
        assert result.reasons == ["unrecognized_region"]

    def test_off_hours_penalty(self):
        """Off-hours login → 100 - 10 = 90."""
        result = calculate_score(off_hours=True)
        assert result.trust_score == 90
        assert result.reasons == ["off_hours"]

    def test_high_velocity_penalty(self):
        """High velocity → 100 - 25 = 75."""
        result = calculate_score(high_velocity=True)
        assert result.trust_score == 75
        assert result.reasons == ["high_velocity"]

    def test_graph_proximity_penalty(self):
        """1 hop from bad actor → 100 - 35 = 65."""
        result = calculate_score(graph_distance=1)
        assert result.trust_score == 65
        assert result.reasons == ["graph_proximity_to_flagged"]

    def test_graph_proximity_at_boundary(self):
        """Exactly 3 hops (boundary) → still triggers penalty."""
        result = calculate_score(graph_distance=3)
        assert result.trust_score == 65
        assert result.reasons == ["graph_proximity_to_flagged"]

    def test_graph_proximity_beyond_boundary(self):
        """4 hops (beyond bound) → no penalty."""
        result = calculate_score(graph_distance=4)
        assert result.trust_score == 100
        assert result.reasons == []

    def test_graph_distance_none(self):
        """No bad actor found → no penalty."""
        result = calculate_score(graph_distance=None)
        assert result.trust_score == 100
        assert result.reasons == []


class TestMultiplePenalties:
    """Test combinations of penalties — TRD §9.4 worked examples."""

    def test_new_device_and_off_hours(self):
        """New device at 3 a.m. (S2 variant) → 100 - 30 - 10 = 60."""
        result = calculate_score(
            device_unrecognized=True,
            off_hours=True,
        )
        assert result.trust_score == 60
        assert "unrecognized_device" in result.reasons
        assert "off_hours" in result.reasons

    def test_stolen_credentials_pattern(self):
        """
        S3: Stolen credentials — new device + new region + fast retries.
        100 - 30 - 20 - 25 = 25 → blocked.
        """
        result = calculate_score(
            device_unrecognized=True,
            region_unrecognized=True,
            high_velocity=True,
        )
        assert result.trust_score == 25
        assert len(result.reasons) == 3

    def test_fraud_ring_wallet(self):
        """
        S4: Wallet 1 hop from mule account + unrecognized device.
        100 - 35 - 30 = 35 → blocked.
        """
        result = calculate_score(
            device_unrecognized=True,
            graph_distance=1,
        )
        assert result.trust_score == 35
        assert "graph_proximity_to_flagged" in result.reasons
        assert "unrecognized_device" in result.reasons

    def test_all_penalties_triggered(self):
        """
        Every signal triggered → 100 - 30 - 20 - 10 - 25 - 35 = -20
        → clamped to 0.
        """
        result = calculate_score(
            device_unrecognized=True,
            region_unrecognized=True,
            off_hours=True,
            high_velocity=True,
            graph_distance=1,
        )
        assert result.trust_score == 0
        assert len(result.reasons) == 5


class TestClamping:
    """Test that scores are properly clamped to [0, 100]."""

    def test_clamp_at_zero(self):
        """Score cannot go below 0."""
        result = calculate_score(
            device_unrecognized=True,
            region_unrecognized=True,
            off_hours=True,
            high_velocity=True,
            graph_distance=1,
        )
        assert result.trust_score == 0
        # Raw score would be -20, but must clamp to 0

    def test_no_penalties_stays_at_100(self):
        """Score cannot exceed 100."""
        result = calculate_score()
        assert result.trust_score == 100


class TestScoreBands:
    """Test that scores fall into the correct routing bands (PRD §3.2)."""

    def test_allow_band(self):
        """Score >= 90 → allow."""
        # Off-hours alone: 90 — right at the boundary
        result = calculate_score(off_hours=True)
        assert result.trust_score >= 90

    def test_otp_band(self):
        """Score 50-89 → otp_required."""
        # Unrecognized device: 70
        result = calculate_score(device_unrecognized=True)
        assert 50 <= result.trust_score <= 89

    def test_blocked_band(self):
        """Score < 50 → blocked."""
        # Stolen creds pattern: 25
        result = calculate_score(
            device_unrecognized=True,
            region_unrecognized=True,
            high_velocity=True,
        )
        assert result.trust_score < 50


class TestScoreResultType:
    """Test the ScoreResult dataclass."""

    def test_returns_score_result(self):
        result = calculate_score()
        assert isinstance(result, ScoreResult)

    def test_reasons_is_list_of_strings(self):
        result = calculate_score(device_unrecognized=True, off_hours=True)
        assert isinstance(result.reasons, list)
        assert all(isinstance(r, str) for r in result.reasons)
