package com.blockauth.auth;

import java.time.Clock;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Hourly removal of challenges that expired more than a day ago, so the table cannot grow without bound. */
@Component
public class ChallengeCleanupJob {

	private static final Logger log = LoggerFactory.getLogger(ChallengeCleanupJob.class);
	static final Duration RETENTION_AFTER_EXPIRY = Duration.ofHours(24);

	private final AuthenticationChallengeRepository challenges;
	private final Clock clock;

	public ChallengeCleanupJob(AuthenticationChallengeRepository challenges, Clock clock) {
		this.challenges = challenges;
		this.clock = clock;
	}

	@Scheduled(cron = "0 0 * * * *")
	public void deleteExpiredChallenges() {
		int deleted = challenges.deleteExpiredBefore(clock.instant().minus(RETENTION_AFTER_EXPIRY));
		if (deleted > 0) {
			log.info("Deleted {} expired challenges", deleted);
		}
	}

}
