"""
Offline Geolocation Lookup
===========================
Looks up rough location from an IP without calling the internet.
The whole demo must run offline (NFR-09).

Strategy:
  1. Check data/demo_geo_overrides.json for a hardcoded demo mapping.
  2. If not found, return 'unknown'.
  3. No network calls ever.

'unknown' is treated as a mild risk signal in the caller — it does not
trigger the unrecognized_region penalty on its own, but combined with
no past login from that IP it contributes to the region check.

Owner: Abhinand Baiju Smitha
Ref: docs/Abhinand_Task_Plan.md — geo.py section
Ref: TRD §9.7 for geolocation decision
"""

import json
import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Load demo geo overrides once at import time
# ---------------------------------------------------------------------------
_GEO_OVERRIDES: dict[str, str] = {}

_OVERRIDES_PATH = Path(__file__).parent.parent / "data" / "demo_geo_overrides.json"

try:
    if _OVERRIDES_PATH.exists():
        with open(_OVERRIDES_PATH, "r") as f:
            _GEO_OVERRIDES = json.load(f)
        logger.info(
            "Loaded %d geo override entries from %s",
            len(_GEO_OVERRIDES), _OVERRIDES_PATH,
        )
except (json.JSONDecodeError, OSError) as e:
    logger.warning("Failed to load geo overrides: %s", e)


def lookup_region(ip_address: str) -> str:
    """
    Look up the rough geographic region for an IP address.

    Checks the demo_geo_overrides.json file first. If not found,
    returns 'unknown'. Never makes network calls.

    Args:
        ip_address: The IP address to look up.

    Returns:
        Region string (e.g., 'IN-KA', 'US-CA') or 'unknown'.
    """
    # Check demo overrides first
    region = _GEO_OVERRIDES.get(ip_address)
    if region:
        return region

    # No match — return unknown (not an error, just a mild signal)
    return "unknown"
