package com.blockauth.security;

import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Fixed-window request counters and the temporary IP block for repeated authentication failures.
 * State lives in this JVM only: it is lost on restart and not shared between instances.
 */
@Component
public class InMemoryRateLimiter {

	static final int FAILURES_BEFORE_BLOCK = 10;
	static final Duration FAILURE_WINDOW = Duration.ofMinutes(15);
	static final Duration BLOCK_DURATION = Duration.ofMinutes(15);

	public record Decision(boolean allowed, long retryAfterSeconds, boolean firstRejection) {
	}

	private record Window(long endMillis, AtomicInteger count) {
	}

	private static final Decision ALLOWED = new Decision(true, 0, false);

	private final Map<String, Window> windows = new ConcurrentHashMap<>();
	private final Map<String, Long> blockedUntil = new ConcurrentHashMap<>();
	private final Clock clock;

	public InMemoryRateLimiter(Clock clock) {
		this.clock = clock;
	}

	/** Counts one request against {@code bucket}/{@code key}; rejected once {@code limit} is exceeded. */
	public Decision acquire(String bucket, String key, int limit, Duration window) {
		long now = clock.millis();
		Window current = windows.compute(bucket + '|' + key, (k, old) -> old == null || now >= old.endMillis()
				? new Window(now + window.toMillis(), new AtomicInteger()) : old);
		int count = current.count().incrementAndGet();
		if (count <= limit) {
			return ALLOWED;
		}
		return new Decision(false, secondsUntil(current.endMillis(), now), count == limit + 1);
	}

	/** @return true when this failure is the one that starts a block for the IP */
	public boolean recordAuthFailure(String ip) {
		Decision decision = acquire("auth-failure", ip, FAILURES_BEFORE_BLOCK - 1, FAILURE_WINDOW);
		if (decision.allowed() || !decision.firstRejection()) {
			return false;
		}
		blockedUntil.put(ip, clock.millis() + BLOCK_DURATION.toMillis());
		windows.remove("auth-failure|" + ip);
		return true;
	}

	/** @return seconds the IP remains blocked from authentication endpoints, or 0 when not blocked */
	public long blockedSeconds(String ip) {
		Long until = blockedUntil.get(ip);
		long now = clock.millis();
		if (until == null) {
			return 0;
		}
		if (now >= until) {
			blockedUntil.remove(ip, until);
			return 0;
		}
		return secondsUntil(until, now);
	}

	@Scheduled(fixedRate = 60_000)
	void sweep() {
		long now = clock.millis();
		windows.values().removeIf(w -> now >= w.endMillis());
		blockedUntil.values().removeIf(until -> now >= until);
	}

	public void clear() {
		windows.clear();
		blockedUntil.clear();
	}

	private static long secondsUntil(long endMillis, long now) {
		return Math.max(1, (endMillis - now + 999) / 1000);
	}

}
