package com.blockauth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** A clock tests can move forward. With no fixed start it follows real time plus the applied offset. */
public final class MutableClock extends Clock {

	private final Instant fixedStart;
	private volatile Duration offset = Duration.ZERO;

	public MutableClock() {
		this(null);
	}

	public MutableClock(Instant fixedStart) {
		this.fixedStart = fixedStart;
	}

	public void advance(Duration amount) {
		offset = offset.plus(amount);
	}

	public void reset() {
		offset = Duration.ZERO;
	}

	@Override
	public Instant instant() {
		return (fixedStart != null ? fixedStart : Instant.now()).plus(offset);
	}

	@Override
	public ZoneId getZone() {
		return ZoneOffset.UTC;
	}

	@Override
	public Clock withZone(ZoneId zone) {
		return this;
	}

}
