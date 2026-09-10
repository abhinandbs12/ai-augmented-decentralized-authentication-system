"""
Feature Extraction Module
=========================
Turns raw login context into the four signals the scorer needs.

Each function is pure — takes the login context plus a MongoDB collection
handle, queries recent history, and returns a boolean (or int for velocity).
No global state; all dependencies passed as arguments.

Owner: Abhinand Baiju Smitha
Ref: docs/Abhinand_Task_Plan.md — features.py section
"""

from datetime import datetime, timedelta, timezone


def is_unrecognized_device(
    wallet: str, device_fingerprint: str, login_events_col
) -> bool:
    """
    Check if this device fingerprint has been seen before for this wallet.

    Queries the login_events collection for any past SUCCESSFUL login
    from this wallet using this device fingerprint. If none found,
    the device is unrecognized → penalty of -30 in the scorer.

    Args:
        wallet: The wallet address attempting to log in.
        device_fingerprint: SHA-256 fingerprint of the device.
        login_events_col: MongoDB collection handle for login_events.

    Returns:
        True if the device is unrecognized (not seen before).
    """
    existing = login_events_col.find_one({
        "wallet_address": wallet,
        "device_fingerprint": device_fingerprint,
        "decision": {"$in": ["allow", "otp_required"]},
    })
    return existing is None


def is_unrecognized_region(
    wallet: str, ip_address: str, login_events_col
) -> bool:
    """
    Check if this IP address / region is new for this wallet.

    Queries the login_events collection for any past successful login
    from this wallet using this IP. If none found, the region is
    unrecognized → penalty of -20 in the scorer.

    Args:
        wallet: The wallet address attempting to log in.
        ip_address: Source IP address of the login attempt.
        login_events_col: MongoDB collection handle for login_events.

    Returns:
        True if the IP/region is unrecognized (not seen before).
    """
    existing = login_events_col.find_one({
        "wallet_address": wallet,
        "ip_address": ip_address,
        "decision": {"$in": ["allow", "otp_required"]},
    })
    return existing is None


def is_off_hours(
    wallet: str, timestamp: datetime, login_events_col
) -> bool:
    """
    Check if the login timestamp is outside the user's typical login hours.

    Computes the user's typical login-hour range from their past successful
    logins. If fewer than 3 past logins exist, we cannot establish a pattern
    and return False (benefit of the doubt). Otherwise, if the current hour
    falls outside the [min_hour - 2, max_hour + 2] range of their history,
    the login is off-hours → penalty of -10 in the scorer.

    Args:
        wallet: The wallet address attempting to log in.
        timestamp: Timestamp of the current login attempt.
        login_events_col: MongoDB collection handle for login_events.

    Returns:
        True if the login is at an unusual hour for this user.
    """
    # Get past successful logins for this wallet
    past_logins = list(login_events_col.find(
        {
            "wallet_address": wallet,
            "decision": {"$in": ["allow", "otp_required"]},
        },
        {"timestamp": 1},
    ).sort("timestamp", -1).limit(50))

    # Need at least 3 past logins to establish a pattern
    if len(past_logins) < 3:
        return False

    # Extract hours from past logins
    past_hours = []
    for login in past_logins:
        ts = login.get("timestamp")
        if isinstance(ts, datetime):
            past_hours.append(ts.hour)

    if not past_hours:
        return False

    min_hour = min(past_hours)
    max_hour = max(past_hours)

    # Add a 2-hour buffer on each side
    current_hour = timestamp.hour

    # Handle the range with buffer (wrapping around midnight)
    low = (min_hour - 2) % 24
    high = (max_hour + 2) % 24

    if low <= high:
        return not (low <= current_hour <= high)
    else:
        # Range wraps around midnight (e.g., 22 to 4)
        return not (current_hour >= low or current_hour <= high)


def login_velocity(
    wallet: str, ip_address: str, login_events_col,
    window_seconds: int = 300,
) -> int:
    """
    Count recent login attempts from this IP in a short window.

    Returns the number of login attempts (regardless of outcome) from
    this IP address in the last `window_seconds` (default: 5 minutes).
    A count >= VELOCITY_THRESHOLD (default 5) triggers the -25 penalty.

    Args:
        wallet: The wallet address (for context, though velocity is per-IP).
        ip_address: Source IP address to count attempts from.
        login_events_col: MongoDB collection handle for login_events.
        window_seconds: Size of the rolling window in seconds (default 300).

    Returns:
        Number of recent login attempts from this IP.
    """
    window_start = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)

    count = login_events_col.count_documents({
        "ip_address": ip_address,
        "timestamp": {"$gte": window_start},
    })

    return count
