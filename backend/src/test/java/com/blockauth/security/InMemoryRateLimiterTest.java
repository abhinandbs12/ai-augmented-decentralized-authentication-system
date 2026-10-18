package com.blockauth.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;

import com.blockauth.MutableClock;

class InMemoryRateLimiterTest {

	private static final Duration MINUTE = Duration.ofMinutes(1);

	private final MutableClock clock = new MutableClock(Instant.parse("2026-10-06T16:30:00Z"));
	private final InMemoryRateLimiter limiter = new InMemoryRateLimiter(clock);

	@Test
	void allowsUpToTheLimitThenRejectsWithRetryAfter() {
		for (int i = 0; i < 10; i++) {
			assertThat(limiter.acquire("challenge-ip", "1.1.1.1", 10, MINUTE).allowed()).isTrue();
		}
		clock.advance(Duration.ofSeconds(20));

		InMemoryRateLimiter.Decision eleventh = limiter.acquire("challenge-ip", "1.1.1.1", 10, MINUTE);
		assertThat(eleventh.allowed()).isFalse();
		assertThat(eleventh.firstRejection()).isTrue();
		assertThat(eleventh.retryAfterSeconds()).isEqualTo(40);
		assertThat(limiter.acquire("challenge-ip", "1.1.1.1", 10, MINUTE).firstRejection()).isFalse();
	}

	@Test
	void countsEachKeyAndBucketSeparately() {
		for (int i = 0; i < 10; i++) {
			limiter.acquire("challenge-ip", "1.1.1.1", 10, MINUTE);
		}
		assertThat(limiter.acquire("challenge-ip", "2.2.2.2", 10, MINUTE).allowed()).isTrue();
		assertThat(limiter.acquire("verify-ip", "1.1.1.1", 10, MINUTE).allowed()).isTrue();
	}

	@Test
	void windowResetsWhenItElapses() {
		for (int i = 0; i < 11; i++) {
			limiter.acquire("challenge-ip", "1.1.1.1", 10, MINUTE);
		}
		clock.advance(MINUTE);
		assertThat(limiter.acquire("challenge-ip", "1.1.1.1", 10, MINUTE).allowed()).isTrue();
	}

	@Test
	void tenthAuthenticationFailureBlocksTheIpForFifteenMinutes() {
		for (int i = 0; i < 9; i++) {
			assertThat(limiter.recordAuthFailure("1.1.1.1")).isFalse();
			assertThat(limiter.blockedSeconds("1.1.1.1")).isZero();
		}
		assertThat(limiter.recordAuthFailure("1.1.1.1")).isTrue();
		assertThat(limiter.blockedSeconds("1.1.1.1")).isEqualTo(900);
		assertThat(limiter.blockedSeconds("2.2.2.2")).isZero();

		clock.advance(Duration.ofMinutes(14));
		assertThat(limiter.blockedSeconds("1.1.1.1")).isEqualTo(60);
		clock.advance(MINUTE);
		assertThat(limiter.blockedSeconds("1.1.1.1")).isZero();
	}

	@Test
	void failuresOutsideTheWindowDoNotAccumulate() {
		for (int i = 0; i < 9; i++) {
			limiter.recordAuthFailure("1.1.1.1");
		}
		clock.advance(Duration.ofMinutes(15));
		assertThat(limiter.recordAuthFailure("1.1.1.1")).isFalse();
		assertThat(limiter.blockedSeconds("1.1.1.1")).isZero();
	}

	@Test
	void sweepDropsOnlyExpiredState() {
		for (int i = 0; i < 10; i++) {
			limiter.recordAuthFailure("1.1.1.1");
		}
		limiter.acquire("api-ip", "3.3.3.3", 1, MINUTE);
		limiter.sweep();
		assertThat(limiter.blockedSeconds("1.1.1.1")).isPositive();
		assertThat(limiter.acquire("api-ip", "3.3.3.3", 1, MINUTE).allowed()).isFalse();

		clock.advance(Duration.ofMinutes(16));
		limiter.sweep();
		assertThat(limiter.acquire("api-ip", "3.3.3.3", 1, MINUTE).allowed()).isTrue();
	}

}
